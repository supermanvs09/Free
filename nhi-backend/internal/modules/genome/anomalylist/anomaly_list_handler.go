package anomalylist

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"nhi-backend-api/internal/modules/genome/common"
)

type Handler struct {
	service *Service
	now     func() time.Time
}

func NewHandler(service *Service) *Handler {
	return &Handler{
		service: service,
		now: func() time.Time {
			return time.Now().UTC().Truncate(time.Second)
		},
	}
}

var allowed = map[string]struct{}{
	"severity":      {},
	"dimension":     {},
	"state":         {},
	"source_type":   {},
	"identity_name": {},
	"search":        {},
	"from":          {},
	"to":            {},
	"page":          {},
	"limit":         {},
	"event_id":      {},
	"cursor":        {}, // retained for backward compatibility
}

var severities = map[string]string{
	"critical": "Critical",
	"high":     "High",
	"medium":   "Medium",
	"low":      "Low",
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	rid := common.RequestID(r)
	w.Header().Set("X-Request-ID", rid)
	defer common.Recover(w, r, "anomaly list", rid)

	ctx, cancel := common.RequestContext(r)
	defer cancel()

	claims, ok := common.RequireClaims(w, r, rid)
	if !ok {
		return
	}

	q := r.URL.Query()
	if unknown, bad := common.CheckUnknown(q, allowed); bad {
		common.WriteError(w, http.StatusBadRequest, common.CodeValidation, common.UnknownParamMessage(q, unknown, allowed), rid)
		return
	}
	if err := common.CheckParamLimits(q); err != nil {
		common.WriteError(w, http.StatusBadRequest, common.CodeValidation, err.Error(), rid)
		return
	}

	params := Params{
		Dimension:    strings.TrimSpace(q.Get("dimension")),
		State:        strings.TrimSpace(q.Get("state")),
		SourceType:   strings.ToUpper(strings.TrimSpace(q.Get("source_type"))),
		IdentityName: strings.TrimSpace(q.Get("identity_name")),
		Search:       strings.TrimSpace(q.Get("search")),
		Cursor:       strings.TrimSpace(q.Get("cursor")),
		Page:         1,
		EventID:      strings.TrimSpace(q.Get("event_id")),
	}

	if value := strings.TrimSpace(q.Get("severity")); value != "" {
		canonical, found := severities[strings.ToLower(value)]
		if !found {
			common.WriteError(w, http.StatusBadRequest, common.CodeValidation, "severity must be one of Critical, High, Medium, Low", rid)
			return
		}
		params.Severity = canonical
	}

	if value := strings.TrimSpace(q.Get("page")); value != "" {
		page, parseErr := strconv.Atoi(value)
		if parseErr != nil || page < 1 {
			common.WriteError(w, http.StatusBadRequest, common.CodeValidation, "page must be a positive integer", rid)
			return
		}
		params.Page = page
	}
	if params.Cursor != "" && strings.TrimSpace(q.Get("page")) != "" {
		common.WriteError(w, http.StatusBadRequest, common.CodeValidation, "page and cursor cannot be used together", rid)
		return
	}

	var err error
	params.From, params.To, err = common.ParseOptionalWindow(q)
	if err != nil {
		common.WriteError(w, http.StatusBadRequest, common.CodeValidation, err.Error(), rid)
		return
	}
	params.Limit, err = common.ParseIdentityLimit(q, "limit")
	if err != nil {
		common.WriteError(w, http.StatusBadRequest, common.CodeValidation, err.Error(), rid)
		return
	}
	if params.Limit < 1 {
		params.Limit = 25
	}
	if params.Limit > 100 {
		params.Limit = 100
	}

	data, next, err := h.service.List(ctx, claims.UserID, claims.TenantID, claims.DBName, params)
	if errors.Is(err, common.ErrInvalidCursor) {
		common.WriteError(w, http.StatusBadRequest, common.CodeValidation, "cursor is invalid", rid)
		return
	}
	if err != nil {
		common.WriteServiceError(w, r, "anomaly list", rid, err)
		return
	}

	common.WriteJSON(w, http.StatusOK, common.Envelope{
		Data: data,
		Meta: common.Meta{
			RequestID:   rid,
			GeneratedAt: h.now(),
			NextCursor:  next,
		},
	})
}
