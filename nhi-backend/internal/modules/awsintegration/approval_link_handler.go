package awsintegration

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/logging"
	"nhi-backend-api/internal/platform/ratelimit"
)

// ApprovalLinkStore is what the e-mail link endpoints need (the repository).
type ApprovalLinkStore interface {
	ApprovalLinkInfo(ctx context.Context, token string) (*ApprovalLinkView, error)
	DecideByLink(ctx context.Context, token string, approve bool, note string) (*ApprovalLinkView, error)
}

// ApprovalLinkHandler serves the page an approval e-mail links to and the two
// calls behind it. These routes are public: the link's token is the credential.
//
//	GET  /api/v1/approvals/email          the page (holds no secret; the token is in the URL fragment)
//	POST /api/v1/approvals/email/lookup   {"token"}                        what the link is about; changes nothing
//	POST /api/v1/approvals/email/decide   {"token","decision","note"}      approve or reject
//
// Opening the link never decides anything: a person has to press a button.
type ApprovalLinkHandler struct {
	store ApprovalLinkStore
	limit *ratelimit.Limiter
}

func NewApprovalLinkHandler(store ApprovalLinkStore) *ApprovalLinkHandler {
	// 20 calls at once, then one every two seconds, per client address.
	return &ApprovalLinkHandler{store: store, limit: ratelimit.New(0.5, 20)}
}

// linkHeaders keeps the page and its answers out of caches, referrers and frames.
func linkHeaders(w http.ResponseWriter) {
	h := w.Header()
	h.Set("Cache-Control", "no-store")
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("X-Frame-Options", "DENY")
	h.Set("Cross-Origin-Opener-Policy", "same-origin")
}

type linkAnswer struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Error   string `json:"error,omitempty"`
	Data    any    `json:"data,omitempty"`
}

func linkReply(w http.ResponseWriter, status int, a linkAnswer) {
	linkHeaders(w)
	httpx.SendJSONResponse(w, status, a)
}

func (h *ApprovalLinkHandler) allowed(w http.ResponseWriter, r *http.Request) bool {
	ok, wait := h.limit.Allow(httpx.ClientIP(r), time.Now())
	if ok {
		return true
	}
	w.Header().Set("Retry-After", strconv.Itoa(int(wait/time.Second)+1))
	linkReply(w, http.StatusTooManyRequests, linkAnswer{Message: "Too many attempts. Wait a moment and try again.", Error: "RATE_LIMITED"})
	return false
}

// Page serves the decision page. It is the same for everyone and contains no
// secret; the script reads the token from the URL fragment, which browsers never
// send to a server, and removes it from the address bar.
func (h *ApprovalLinkHandler) Page(w http.ResponseWriter, r *http.Request) {
	if !h.allowed(w, r) {
		return
	}
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		http.Error(w, "Unavailable", http.StatusInternalServerError)
		return
	}
	nonce := base64.RawURLEncoding.EncodeToString(b)
	linkHeaders(w)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'nonce-"+nonce+"'; "+
		"connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
	_, _ = io.WriteString(w, strings.ReplaceAll(approvalPageHTML, "__NONCE__", nonce))
}

type linkLookupRequest struct {
	Token string `json:"token"`
}

type linkDecideRequest struct {
	Token    string `json:"token"`
	Decision string `json:"decision"`
	Note     string `json:"note"`
}

// readJSON accepts one small JSON object, and only as application/json (which a
// web page on another site cannot send without our permission).
func readJSON(w http.ResponseWriter, r *http.Request, into any) bool {
	if mt, _, err := mime.ParseMediaType(r.Header.Get("Content-Type")); err != nil || mt != "application/json" {
		linkReply(w, http.StatusUnsupportedMediaType, linkAnswer{Message: "Send application/json.", Error: "UNSUPPORTED_MEDIA_TYPE"})
		return false
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(into); err != nil || dec.More() {
		linkReply(w, http.StatusBadRequest, linkAnswer{Message: "That request could not be read.", Error: "INVALID_REQUEST"})
		return false
	}
	return true
}

// linkFailure answers for an error from the store, and says whether it was one
// the caller causes (rather than ours).
func (h *ApprovalLinkHandler) linkFailure(w http.ResponseWriter, r *http.Request, err error, action string) {
	log := logging.FromContext(r.Context()).With("action", action, "ip", httpx.ClientIP(r))
	var decided *ApprovalDecidedError
	switch {
	case errors.Is(err, ErrApprovalLinkInvalid):
		log.Warn("aws integration: approval link refused: not a valid link")
		linkReply(w, http.StatusNotFound, linkAnswer{Message: "This link is not valid.", Error: "LINK_INVALID"})
	case errors.Is(err, ErrApprovalLinkExpired):
		log.Info("aws integration: approval link refused: expired")
		linkReply(w, http.StatusGone, linkAnswer{Message: "This link has expired. Decide the request in the tenant-onboarding tool.", Error: "LINK_EXPIRED"})
	case errors.Is(err, ErrApprovalLinkUsed):
		log.Info("aws integration: approval link refused: already used")
		linkReply(w, http.StatusGone, linkAnswer{Message: "This link was already used.", Error: "LINK_USED"})
	case errors.As(err, &decided):
		log.Info("aws integration: approval link refused: request already decided", "status", decided.Status)
		linkReply(w, http.StatusConflict, linkAnswer{
			Message: "This request was already " + decided.Status + ".", Error: "ALREADY_DECIDED",
			Data: map[string]string{"status": decided.Status, "by": decided.By},
		})
	default:
		log.Error("aws integration: approval link failed", "err", err)
		linkReply(w, http.StatusInternalServerError, linkAnswer{Message: "Something went wrong and nothing was changed. Try again; if it keeps happening, use the tenant-onboarding tool.", Error: "LINK_FAILED"})
	}
}

type linkRequestJSON struct {
	Domain      string    `json:"domain"`
	Workspace   string    `json:"workspace"`
	AccountID   string    `json:"account_id"`
	RoleARN     string    `json:"role_arn"`
	Regions     []string  `json:"regions"`
	RequestedBy string    `json:"requested_by"`
	RequestedAt time.Time `json:"requested_at"`
}

type linkDecisionJSON struct {
	Status string     `json:"status"`
	By     string     `json:"by"`
	At     *time.Time `json:"at,omitempty"`
	Note   string     `json:"note,omitempty"`
}

// Lookup says what a link is about and what state it is in. It changes nothing.
func (h *ApprovalLinkHandler) Lookup(w http.ResponseWriter, r *http.Request) {
	if !h.allowed(w, r) {
		return
	}
	var req linkLookupRequest
	if !readJSON(w, r, &req) {
		return
	}
	v, err := h.store.ApprovalLinkInfo(r.Context(), req.Token)
	if err != nil {
		h.linkFailure(w, r, err, "lookup")
		return
	}
	state := "open"
	switch {
	case v.Status != "pending":
		state = "decided"
	case v.Used:
		state = "used"
	case v.Expired:
		state = "expired"
	}
	regions := make([]string, 0, len(v.Regions))
	for _, region := range v.Regions {
		if region != globalRegion {
			regions = append(regions, region)
		}
	}
	data := map[string]any{
		"state": state, "email": v.Email, "expires_at": v.ExpiresAt,
		"request": linkRequestJSON{Domain: v.Domain, Workspace: v.Workspace, AccountID: v.AccountID, RoleARN: v.RoleARN,
			Regions: regions, RequestedBy: v.RequestedBy, RequestedAt: v.RequestedAt},
	}
	if state == "decided" {
		data["decision"] = linkDecisionJSON{Status: v.Status, By: v.DecidedBy, At: v.DecidedAt, Note: v.DecisionNote}
	}
	linkReply(w, http.StatusOK, linkAnswer{Success: true, Message: "OK", Data: data})
}

// Decide approves or rejects. A rejection needs a reason, which the company
// sees; the note is bounded either way.
func (h *ApprovalLinkHandler) Decide(w http.ResponseWriter, r *http.Request) {
	if !h.allowed(w, r) {
		return
	}
	var req linkDecideRequest
	if !readJSON(w, r, &req) {
		return
	}
	var approve bool
	switch req.Decision {
	case "approve":
		approve = true
	case "reject":
	default:
		linkReply(w, http.StatusBadRequest, linkAnswer{Message: "Choose approve or reject.", Error: "INVALID_DECISION"})
		return
	}
	note := strings.TrimSpace(req.Note)
	switch {
	case utf8.RuneCountInString(note) > maxLinkNote:
		linkReply(w, http.StatusBadRequest, linkAnswer{Message: "Keep the note under 1000 characters.", Error: "NOTE_TOO_LONG"})
		return
	case !approve && note == "":
		linkReply(w, http.StatusBadRequest, linkAnswer{Message: "Say why, so the company knows what to fix.", Error: "NOTE_REQUIRED"})
		return
	}
	v, err := h.store.DecideByLink(r.Context(), req.Token, approve, note)
	if err != nil {
		h.linkFailure(w, r, err, "decide")
		return
	}
	logging.FromContext(r.Context()).Info("aws integration: approval decided from an e-mail link",
		"approval_id", v.ApprovalID, "account_id", v.AccountID, "workspace", v.Workspace, "decision", v.Status,
		"approver", v.Email, "ip", httpx.ClientIP(r))
	linkReply(w, http.StatusOK, linkAnswer{Success: true, Message: "Decision recorded", Data: map[string]string{"decision": v.Status}})
}
