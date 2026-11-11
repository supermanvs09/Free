package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5"
)

// rowsJSON turns any query into a list of objects keyed by column name.
func (s *Server) rowsJSON(r *http.Request, sql string, args ...any) ([]map[string]any, error) {
	rows, err := s.st.DB.Query(r.Context(), sql, args...)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, pgx.RowToMap)
	if out == nil {
		out = []map[string]any{}
	}
	return out, err
}

func (s *Server) overview(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var o struct {
		Open, Critical, High, Medium, Low, New7d  int
		Repos, Creds, Unused, Builds7d, Unusual7d int
		Deliveries24h, Rejected24h, Resolved7d    int
	}
	err := s.st.DB.QueryRow(ctx, `SELECT
		count(*) FILTER (WHERE status = 'open'),
		count(*) FILTER (WHERE status = 'open' AND severity = 'critical'),
		count(*) FILTER (WHERE status = 'open' AND severity = 'high'),
		count(*) FILTER (WHERE status = 'open' AND severity = 'medium'),
		count(*) FILTER (WHERE status = 'open' AND severity = 'low'),
		count(*) FILTER (WHERE first_seen > now() - interval '7 days'),
		count(*) FILTER (WHERE status = 'resolved' AND status_at > now() - interval '7 days')
		FROM findings`).Scan(&o.Open, &o.Critical, &o.High, &o.Medium, &o.Low, &o.New7d, &o.Resolved7d)
	if err == nil {
		err = s.st.DB.QueryRow(ctx, `SELECT (SELECT count(*) FROM repositories),
			(SELECT count(*) FROM jenkins_credentials), (SELECT count(*) FROM jenkins_credentials WHERE used_by = '[]'::jsonb),
			(SELECT count(*) FROM jenkins_builds WHERE received_at > now() - interval '7 days'),
			(SELECT count(*) FROM jenkins_builds WHERE unusual <> '' AND received_at > now() - interval '7 days'),
			(SELECT count(*) FROM webhook_deliveries WHERE received_at > now() - interval '24 hours'),
			(SELECT count(*) FROM webhook_deliveries WHERE outcome = 'rejected' AND received_at > now() - interval '24 hours')`).
			Scan(&o.Repos, &o.Creds, &o.Unused, &o.Builds7d, &o.Unusual7d, &o.Deliveries24h, &o.Rejected24h)
	}
	if err != nil {
		serverError(w, err)
		return
	}
	conns := make([]map[string]any, 0, 3)
	for _, k := range kinds {
		c, err := s.loadConnection(ctx, k)
		if err != nil {
			serverError(w, err)
			return
		}
		conns = append(conns, map[string]any{"kind": k, "status": c.Status, "sync_status": c.SyncStatus, "sync_detail": c.SyncDetail, "last_sync_at": c.LastSyncAt})
	}
	topRepos, err := s.rowsJSON(r, `SELECT source, repository, count(*) AS open,
		count(*) FILTER (WHERE severity = 'critical') AS critical FROM findings WHERE status = 'open'
		GROUP BY source, repository ORDER BY critical DESC, open DESC LIMIT 5`)
	if err != nil {
		serverError(w, err)
		return
	}
	recent, err := s.rowsJSON(r, `SELECT id, source, repository, file_path, line, detector, severity, redacted, first_seen, found_by
		FROM findings WHERE status = 'open' ORDER BY first_seen DESC LIMIT 6`)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"connections": conns,
		"findings": map[string]int{"open": o.Open, "critical": o.Critical, "high": o.High, "medium": o.Medium, "low": o.Low,
			"new_7d": o.New7d, "resolved_7d": o.Resolved7d},
		"repositories":     o.Repos,
		"jenkins":          map[string]int{"credentials": o.Creds, "unused": o.Unused, "builds_7d": o.Builds7d, "unusual_7d": o.Unusual7d},
		"deliveries":       map[string]int{"last_24h": o.Deliveries24h, "rejected_24h": o.Rejected24h},
		"top_repositories": topRepos,
		"recent_findings":  recent,
	})
}

var severities = map[string]bool{"critical": true, "high": true, "medium": true, "low": true}
var statuses = map[string]bool{"open": true, "resolved": true, "false_positive": true}

func (s *Server) listFindings(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	where, args := []string{"true"}, []any{}
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, strings.ReplaceAll(cond, "$?", "$"+strconv.Itoa(len(args))))
	}
	if st := q.Get("status"); statuses[st] {
		add("status = $?", st)
	} else if st != "all" {
		add("status = $?", "open")
	}
	if sv := q.Get("severity"); severities[sv] {
		add("severity = $?", sv)
	}
	if src := q.Get("source"); src == "github" || src == "bitbucket" {
		add("source = $?", src)
	}
	if repo := q.Get("repository"); repo != "" {
		add("repository = $?", repo)
	}
	if text := strings.TrimSpace(q.Get("q")); text != "" {
		pat := "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(clip(text, 200)) + "%"
		add("(repository ILIKE $? OR file_path ILIKE $1000 OR detector ILIKE $1000 OR author ILIKE $1000)", pat)
		where[len(where)-1] = strings.ReplaceAll(where[len(where)-1], "$1000", "$"+strconv.Itoa(len(args)))
	}
	const per = 50
	page := queryInt(r, "page", 1, 10000)
	cond := strings.Join(where, " AND ")
	var total int
	if err := s.st.DB.QueryRow(r.Context(), "SELECT count(*) FROM findings WHERE "+cond, args...).Scan(&total); err != nil {
		serverError(w, err)
		return
	}
	items, err := s.rowsJSON(r, `SELECT id, source, repository, branch, commit_sha, file_path, line, detector, severity, redacted, author, found_by,
		first_seen, last_seen, status, status_by, status_at FROM findings WHERE `+cond+`
		ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, first_seen DESC, id DESC
		LIMIT `+strconv.Itoa(per)+` OFFSET `+strconv.Itoa((page-1)*per), args...)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"findings": items, "total": total, "page": page, "per_page": per})
}

func (s *Server) updateFinding(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(mux.Vars(r)["id"], 10, 64)
	var in struct {
		Status string `json:"status"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if !statuses[in.Status] {
		writeError(w, http.StatusBadRequest, "Status must be open, resolved or false_positive.")
		return
	}
	by := caller(r).Email
	tag, err := s.st.DB.Exec(r.Context(), `UPDATE findings SET status = $2, status_by = $3, status_at = now() WHERE id = $1`, id, in.Status, by)
	if err != nil {
		serverError(w, err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "No such finding.")
		return
	}
	s.st.Audit(r.Context(), by, "finding_"+in.Status, fmt.Sprint(id), "")
	items, err := s.rowsJSON(r, `SELECT id, status, status_by, status_at FROM findings WHERE id = $1`, id)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"finding": items[0]})
}

func (s *Server) listRepositories(w http.ResponseWriter, r *http.Request) {
	items, err := s.rowsJSON(r, `SELECT p.source, p.full_name, p.default_branch, p.web_url, p.files_scanned, p.last_scanned_at,
		(SELECT count(*) FROM findings f WHERE f.source = p.source AND f.repository = p.full_name AND f.status = 'open') AS open_findings
		FROM repositories p ORDER BY open_findings DESC, p.full_name`)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"repositories": items})
}

func (s *Server) listJenkinsCredentials(w http.ResponseWriter, r *http.Request) {
	items, err := s.rowsJSON(r, `SELECT store, domain, credential_id, type_name, display_name, description, used_by, first_seen, last_seen
		FROM jenkins_credentials ORDER BY jsonb_array_length(used_by) = 0 DESC, credential_id`)
	if err != nil {
		serverError(w, err)
		return
	}
	for _, it := range items { // jsonb arrives as raw text in some drivers' maps; normalise
		if b, ok := it["used_by"].([]byte); ok {
			var v []string
			_ = json.Unmarshal(b, &v)
			it["used_by"] = v
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"credentials": items})
}

func (s *Server) listJenkinsBuilds(w http.ResponseWriter, r *http.Request) {
	cond := "true"
	if r.URL.Query().Get("unusual") == "true" {
		cond = "unusual <> ''"
	}
	items, err := s.rowsJSON(r, `SELECT id, job, number, phase, status, url, unusual, received_at FROM jenkins_builds WHERE `+cond+
		` ORDER BY received_at DESC LIMIT `+strconv.Itoa(queryInt(r, "limit", 100, 500)))
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"builds": items})
}

func (s *Server) listDeliveries(w http.ResponseWriter, r *http.Request) {
	args := []any{}
	cond := "true"
	if src := r.URL.Query().Get("source"); validKind(src) {
		args, cond = append(args, src), "source = $1"
	}
	items, err := s.rowsJSON(r, `SELECT id, source, event, delivery_id, repository, signature_ok, outcome, detail, received_at
		FROM webhook_deliveries WHERE `+cond+` ORDER BY received_at DESC, id DESC LIMIT `+strconv.Itoa(queryInt(r, "limit", 100, 500)), args...)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deliveries": items})
}

func (s *Server) listAudit(w http.ResponseWriter, r *http.Request) {
	items, err := s.rowsJSON(r, `SELECT id, at, actor, action, target, detail FROM audit_log ORDER BY at DESC, id DESC LIMIT `+
		strconv.Itoa(queryInt(r, "limit", 200, 1000)))
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": items})
}
