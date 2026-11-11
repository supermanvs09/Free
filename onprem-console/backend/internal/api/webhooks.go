package api

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gorilla/mux"

	"onprem-console/internal/sources"
)

const maxWebhookBody = 25 << 20 // GitHub's own payload cap

// ValidSignature checks "sha256=<hex HMAC-SHA256 of body>" in constant time.
func ValidSignature(secret, body []byte, header string) bool {
	got, ok := strings.CutPrefix(strings.TrimSpace(header), "sha256=")
	if !ok {
		return false
	}
	sig, err := hex.DecodeString(got)
	if err != nil {
		return false
	}
	m := hmac.New(sha256.New, secret)
	m.Write(body)
	return hmac.Equal(sig, m.Sum(nil))
}

func (s *Server) delivery(ctx context.Context, source, event, id, repo string, sigOK bool, outcome, detail string) int64 {
	var rowID int64
	_ = s.st.DB.QueryRow(ctx, `INSERT INTO webhook_deliveries (source, event, delivery_id, repository, signature_ok, outcome, detail)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`, source, clip(event, 100), clip(id, 100), clip(repo, 300), sigOK, outcome, clip(detail, 500)).Scan(&rowID)
	return rowID
}

func (s *Server) finishDelivery(id int64, outcome, detail string) {
	_, _ = s.st.DB.Exec(context.Background(), `UPDATE webhook_deliveries SET outcome = $2, detail = $3 WHERE id = $1`, id, outcome, clip(detail, 500))
}

// readSigned reads the body and checks its signature against the source's
// webhook secret. It answers the sender itself when it returns false.
func (s *Server) readSigned(w http.ResponseWriter, r *http.Request, kind, sigHeader, event, id string) ([]byte, *connection, bool) {
	body, err := io.ReadAll(io.LimitReader(r.Body, maxWebhookBody+1))
	if err != nil || len(body) > maxWebhookBody {
		s.delivery(r.Context(), kind, event, id, "", false, "rejected", "body unreadable or over 25 MB")
		writeError(w, http.StatusRequestEntityTooLarge, "payload too large")
		return nil, nil, false
	}
	c, err := s.loadConnection(r.Context(), kind)
	if err != nil {
		serverError(w, err)
		return nil, nil, false
	}
	var secret []byte
	if len(c.webhookSecret) > 0 {
		secret, _ = s.box.Open(c.webhookSecret)
	}
	if len(secret) == 0 {
		s.delivery(r.Context(), kind, event, id, "", false, "rejected", "the connection is not set up in this console")
		writeError(w, http.StatusNotFound, "not set up")
		return nil, nil, false
	}
	if !ValidSignature(secret, body, r.Header.Get(sigHeader)) {
		s.delivery(r.Context(), kind, event, id, "", false, "rejected", "signature missing or wrong: check the webhook secret matches the console")
		writeError(w, http.StatusUnauthorized, "invalid signature")
		return nil, nil, false
	}
	return body, c, true
}

func (s *Server) githubWebhook(w http.ResponseWriter, r *http.Request) {
	event, id := r.Header.Get("X-GitHub-Event"), r.Header.Get("X-GitHub-Delivery")
	body, c, ok := s.readSigned(w, r, "github", "X-Hub-Signature-256", event, id)
	if !ok {
		return
	}
	if event == "ping" {
		s.delivery(r.Context(), "github", event, id, "", true, "processed", "GitHub confirmed the webhook")
		writeJSON(w, http.StatusOK, map[string]string{"status": "pong"})
		return
	}
	if event != "push" {
		s.delivery(r.Context(), "github", event, id, "", true, "ignored", "only push events are scanned")
		writeJSON(w, http.StatusOK, map[string]string{"status": "ignored"})
		return
	}
	var p struct {
		Ref        string `json:"ref"`
		After      string `json:"after"`
		Deleted    bool   `json:"deleted"`
		Repository struct {
			FullName string `json:"full_name"`
		} `json:"repository"`
		Pusher struct {
			Name string `json:"name"`
		} `json:"pusher"`
		Commits []struct {
			Added    []string `json:"added"`
			Modified []string `json:"modified"`
		} `json:"commits"`
	}
	if err := json.Unmarshal(body, &p); err != nil || p.Repository.FullName == "" {
		s.delivery(r.Context(), "github", event, id, "", true, "rejected", "not a push payload")
		writeError(w, http.StatusBadRequest, "not a push payload")
		return
	}
	branch, isBranch := strings.CutPrefix(p.Ref, "refs/heads/")
	if p.Deleted || !isBranch {
		s.delivery(r.Context(), "github", event, id, p.Repository.FullName, true, "ignored", "branch deleted or tag push")
		writeJSON(w, http.StatusOK, map[string]string{"status": "ignored"})
		return
	}
	var files []string
	for _, cm := range p.Commits {
		files = append(files, cm.Added...)
		files = append(files, cm.Modified...)
	}
	rowID := s.delivery(r.Context(), "github", event, id, p.Repository.FullName, true, "accepted", "scanning the pushed files")
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "accepted"})
	go s.pushScan(rowID, c, p.Repository.FullName, branch, p.After, p.Pusher.Name, uniq(files), nil)
}

func (s *Server) bitbucketWebhook(w http.ResponseWriter, r *http.Request) {
	event, id := r.Header.Get("X-Event-Key"), r.Header.Get("X-Request-Id")
	body, c, ok := s.readSigned(w, r, "bitbucket", "X-Hub-Signature", event, id)
	if !ok {
		return
	}
	if event == "diagnostics:ping" {
		s.delivery(r.Context(), "bitbucket", event, id, "", true, "processed", "Bitbucket's test connection")
		writeJSON(w, http.StatusOK, map[string]string{"status": "pong"})
		return
	}
	if event != "repo:refs_changed" {
		s.delivery(r.Context(), "bitbucket", event, id, "", true, "ignored", "only pushes are scanned")
		writeJSON(w, http.StatusOK, map[string]string{"status": "ignored"})
		return
	}
	var p struct {
		Actor struct {
			Name string `json:"name"`
		} `json:"actor"`
		Repository struct {
			Slug    string `json:"slug"`
			Project struct {
				Key string `json:"key"`
			} `json:"project"`
		} `json:"repository"`
		Changes []struct {
			Ref struct {
				DisplayID string `json:"displayId"`
				Type      string `json:"type"`
			} `json:"ref"`
			FromHash string `json:"fromHash"`
			ToHash   string `json:"toHash"`
			Type     string `json:"type"`
		} `json:"changes"`
	}
	if err := json.Unmarshal(body, &p); err != nil || p.Repository.Slug == "" {
		s.delivery(r.Context(), "bitbucket", event, id, "", true, "rejected", "not a push payload")
		writeError(w, http.StatusBadRequest, "not a push payload")
		return
	}
	repo := p.Repository.Project.Key + "/" + p.Repository.Slug
	rowID := s.delivery(r.Context(), "bitbucket", event, id, repo, true, "accepted", "scanning the pushed files")
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "accepted"})
	go func() {
		cl, err := s.client(c)
		if err != nil {
			s.finishDelivery(rowID, "failed", err.Error())
			return
		}
		bb := cl.(*sources.Bitbucket)
		for _, ch := range p.Changes {
			if ch.Type == "DELETE" || ch.Ref.Type != "BRANCH" {
				continue
			}
			s.pushScan(rowID, c, repo, ch.Ref.DisplayID, ch.ToHash, p.Actor.Name, nil, func(ctx context.Context) ([]string, error) {
				return bb.ChangedFiles(ctx, repo, ch.FromHash, ch.ToHash)
			})
		}
	}()
}

// pushScan scans the files a push touched at the pushed commit. Bitbucket's
// payload names no files, so it passes list to fetch them.
func (s *Server) pushScan(rowID int64, c *connection, repo, branch, commit, author string, files []string, list func(context.Context) ([]string, error)) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	cl, err := s.client(c)
	if err != nil {
		s.finishDelivery(rowID, "failed", err.Error())
		return
	}
	if list != nil {
		if files, err = list(ctx); err != nil {
			s.finishDelivery(rowID, "failed", "listing the pushed files: "+err.Error())
			return
		}
	}
	// ponytail: 500 files per push covers normal work; a huge import is caught by the next full scan.
	if len(files) > 500 {
		files = files[:500]
	}
	var started time.Time
	_ = s.st.DB.QueryRow(ctx, `SELECT now()`).Scan(&started)
	res := s.scanPush(ctx, c.Kind, repo, branch, commit, author, files, cl.(sources.CodeSource))
	if res.errors == 0 {
		// Secrets that were in these files and are not any more: fixed by this push.
		_, _ = s.st.DB.Exec(ctx, `UPDATE findings SET status = 'resolved', status_by = 'push: removed from the code', status_at = now()
			WHERE source = $1 AND repository = $2 AND file_path = ANY($3) AND status = 'open' AND last_seen < $4`, c.Kind, repo, files, started)
	}
	outcome := "processed"
	if res.errors > 0 {
		outcome = "failed"
	}
	s.finishDelivery(rowID, outcome, fmt.Sprintf("%s on %s: %s scanned, %s", short(commit), branch, plural(res.files, "file", "files"), plural(res.added, "new finding", "new findings")))
}

func (s *Server) scanPush(ctx context.Context, kind, repo, branch, commit, author string, files []string, src sources.CodeSource) scanResult {
	res := s.scanFiles(ctx, kind, repo, branch, commit, commit, "push", files, src)
	if author != "" {
		_, _ = s.st.DB.Exec(ctx, `UPDATE findings SET author = $4 WHERE source = $1 AND repository = $2 AND commit_sha = $3 AND author = ''`, kind, repo, commit, clip(author, 200))
	}
	return res
}

func short(sha string) string {
	if len(sha) > 7 {
		return sha[:7]
	}
	return sha
}

func uniq(in []string) []string {
	seen := map[string]bool{}
	out := in[:0]
	for _, v := range in {
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	sort.Strings(out)
	return out
}

// jenkinsWebhook takes Notification plugin events. The plugin cannot sign
// payloads, so the secret is the last part of the URL.
func (s *Server) jenkinsWebhook(w http.ResponseWriter, r *http.Request) {
	token := mux.Vars(r)["token"]
	c, err := s.loadConnection(r.Context(), "jenkins")
	if err != nil {
		serverError(w, err)
		return
	}
	var secret []byte
	if len(c.webhookSecret) > 0 {
		secret, _ = s.box.Open(c.webhookSecret)
	}
	if len(secret) == 0 || subtle.ConstantTimeCompare(secret, []byte(token)) != 1 {
		s.delivery(r.Context(), "jenkins", "", "", "", false, "rejected", "unknown webhook address: copy it again from the console")
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	var p struct {
		Name  string `json:"name"`
		Build struct {
			Number    int    `json:"number"`
			Phase     string `json:"phase"`
			Status    string `json:"status"`
			FullURL   string `json:"full_url"`
			Timestamp int64  `json:"timestamp"`
		} `json:"build"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&p); err != nil || p.Name == "" {
		s.delivery(r.Context(), "jenkins", "", "", "", true, "rejected", "not a Notification plugin JSON payload")
		writeError(w, http.StatusBadRequest, "not a build notification")
		return
	}
	if p.Build.Phase == "QUEUED" {
		s.delivery(r.Context(), "jenkins", p.Build.Phase, "", p.Name, true, "ignored", "queued builds are recorded once they start")
		writeJSON(w, http.StatusOK, map[string]string{"status": "ignored"})
		return
	}
	at := time.Now()
	if p.Build.Timestamp > 0 {
		at = time.UnixMilli(p.Build.Timestamp)
	}
	unusual := s.unusualBuild(r.Context(), p.Name, p.Build.Number, at)
	_, err = s.st.DB.Exec(r.Context(), `INSERT INTO jenkins_builds (job, number, phase, status, url, unusual, received_at) VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (job, number) DO UPDATE SET phase = $3, status = CASE WHEN $4 <> '' THEN $4 ELSE jenkins_builds.status END, url = $5`,
		clip(p.Name, 300), p.Build.Number, clip(p.Build.Phase, 30), clip(p.Build.Status, 30), clip(p.Build.FullURL, 500), unusual, at)
	if err != nil {
		serverError(w, err)
		return
	}
	detail := fmt.Sprintf("build #%d %s %s", p.Build.Number, strings.ToLower(p.Build.Phase), strings.ToLower(p.Build.Status))
	if unusual != "" {
		detail += ": " + unusual
	}
	s.delivery(r.Context(), "jenkins", p.Build.Phase, "", p.Name, true, "processed", detail)
	writeJSON(w, http.StatusOK, map[string]string{"status": "recorded"})
}

// unusualBuild says why a build stands out, or "" when it does not.
func (s *Server) unusualBuild(ctx context.Context, job string, number int, at time.Time) string {
	var reasons []string
	local := at.In(s.cfg.BusinessTZ)
	if wd := local.Weekday(); wd == time.Saturday || wd == time.Sunday || local.Hour() < s.cfg.BusinessStart || local.Hour() >= s.cfg.BusinessEnd {
		reasons = append(reasons, "ran outside business hours ("+local.Format("Mon 15:04 MST")+")")
	}
	var before bool
	_ = s.st.DB.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM jenkins_builds WHERE job = $1 AND number <> $2)`, job, number).Scan(&before)
	if !before {
		var creds []string
		rows, err := s.st.DB.Query(ctx, `SELECT credential_id FROM jenkins_credentials WHERE used_by ? $1 ORDER BY credential_id`, job)
		if err == nil {
			for rows.Next() {
				var id string
				if rows.Scan(&id) == nil {
					creds = append(creds, id)
				}
			}
			rows.Close()
		}
		if len(creds) > 0 {
			reasons = append(reasons, "first build seen for a job using "+strings.Join(creds, ", "))
		}
	}
	if len(reasons) == 0 {
		return ""
	}
	r := strings.Join(reasons, "; ")
	return strings.ToUpper(r[:1]) + r[1:]
}
