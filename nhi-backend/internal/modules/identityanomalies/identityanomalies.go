// Package identityanomalies serves one identity's anomalies:
//
//	GET /api/v1/identity-anomalies?source_type=&identity_name=&state=open|&limit=&cursor=
//
// The genome anomaly list filters by text; an identity page needs the rows of
// one identity. The identity is resolved exactly as its genome summary and
// timeline resolve it (summarycommon lookup: the baseline key, its event keys
// and the event identity names log_events recorded under them), so the list,
// the tab count and the timeline count the same alerts. Rows have the
// anomaly list's item shape, so the console renders them the same way.
// Read-only; nothing in the genome module is changed.
package identityanomalies

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/genome/anomalylist"
	"nhi-backend-api/internal/modules/genome/common"
	"nhi-backend-api/internal/modules/genome/summarycommon"
)

const (
	defaultLimit = 50
	maxLimit     = 200
)

type Handler struct {
	lookup      *summarycommon.MonitoredIdentityLookup
	keyEvents   *summarycommon.MonitoringEvents // event identity names per baseline
	alertEvents *common.MonitoringEvents        // severity and confidence per alert
}

func NewHandler(lookup *summarycommon.MonitoredIdentityLookup, keyEvents *summarycommon.MonitoringEvents, alertEvents *common.MonitoringEvents) *Handler {
	return &Handler{lookup: lookup, keyEvents: keyEvents, alertEvents: alertEvents}
}

// Register mounts the route on the authenticated /api/v1 router.
func (h *Handler) Register(r *mux.Router) {
	r.HandleFunc("/identity-anomalies", h.Get).Methods(http.MethodGet)
}

// Response is the data block: one page of rows and the identity's total in
// the asked state (the real count, whatever page is shown).
type Response struct {
	Items []anomalylist.Item `json:"items"`
	Total int                `json:"total"`
}

type cursor struct {
	At int64 `json:"t"` // created_at, microseconds
	ID int64 `json:"i"`
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	rid := common.RequestID(r)
	defer common.Recover(w, r, "identity anomalies", rid)
	ctx, cancel := common.RequestContext(r)
	defer cancel()
	claims, ok := common.RequireClaims(w, r, rid)
	if !ok {
		return
	}
	q := r.URL.Query()
	sourceType := strings.ToUpper(strings.TrimSpace(q.Get("source_type")))
	name := strings.TrimSpace(q.Get("identity_name"))
	if sourceType == "" || name == "" || len(name) > 2048 {
		common.WriteError(w, http.StatusBadRequest, common.CodeValidation, "source_type and identity_name are required", rid)
		return
	}
	state := strings.ToLower(strings.TrimSpace(q.Get("state")))
	if state != "" && state != "open" && state != "resolved" && state != "dismissed" {
		common.WriteError(w, http.StatusBadRequest, common.CodeValidation, "state must be open, resolved or dismissed", rid)
		return
	}
	limit := defaultLimit
	if v := strings.TrimSpace(q.Get("limit")); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > maxLimit {
			common.WriteError(w, http.StatusBadRequest, common.CodeValidation, "limit must be 1 to "+strconv.Itoa(maxLimit), rid)
			return
		}
		limit = n
	}
	var after *cursor
	if v := strings.TrimSpace(q.Get("cursor")); v != "" {
		raw, err := base64.RawURLEncoding.DecodeString(v)
		var c cursor
		if err != nil || json.Unmarshal(raw, &c) != nil {
			common.WriteError(w, http.StatusBadRequest, common.CodeValidation, "cursor is invalid", rid)
			return
		}
		after = &c
	}

	res, err := h.lookup.Resolve(ctx, claims.UserID, claims.TenantID, claims.DBName, sourceType, name)
	if errors.Is(err, summarycommon.ErrIdentityNotFound) {
		common.WriteError(w, http.StatusNotFound, "NOT_FOUND", "The requested identity was not found", rid)
		return
	}
	if err != nil {
		common.WriteServiceError(w, r, "identity anomalies", rid, err)
		return
	}
	keys := res.AlertKeys(ctx, h.keyEvents)
	out := &Response{Items: []anomalylist.Item{}}
	if len(keys) == 0 {
		common.WriteJSON(w, http.StatusOK, common.Envelope{Data: out, Meta: common.Meta{RequestID: rid, GeneratedAt: time.Now().UTC()}})
		return
	}
	types, names := summarycommon.KeyArrays(keys)
	sc := res.Scope
	alerts := sc.Table("alerts")

	where := []string{"(a.source_type, a.identity_name) IN (SELECT * FROM unnest($1::text[], $2::text[]))"}
	args := []any{types, names}
	if state != "" {
		args = append(args, state)
		where = append(where, "lower(a.status) = $"+strconv.Itoa(len(args)))
	}
	if err := sc.DB.QueryRowContext(ctx, `SELECT count(*) FROM `+alerts+` a WHERE `+strings.Join(where, " AND "), args...).Scan(&out.Total); err != nil {
		common.WriteServiceError(w, r, "identity anomalies", rid, err)
		return
	}
	if after != nil {
		args = append(args, time.UnixMicro(after.At).UTC(), after.ID)
		where = append(where, "(a.created_at, a.id) < ($"+strconv.Itoa(len(args)-1)+", $"+strconv.Itoa(len(args))+")")
	}
	args = append(args, limit+1)
	rows, err := sc.DB.QueryContext(ctx, `SELECT `+common.AlertColumns+` FROM `+alerts+` a WHERE `+strings.Join(where, " AND ")+
		` ORDER BY a.created_at DESC, a.id DESC LIMIT $`+strconv.Itoa(len(args)), args...)
	if err != nil {
		common.WriteServiceError(w, r, "identity anomalies", rid, err)
		return
	}
	var page []common.AlertRow
	for rows.Next() {
		row, err := common.ScanAlert(rows)
		if err != nil {
			rows.Close()
			common.WriteServiceError(w, r, "identity anomalies", rid, err)
			return
		}
		page = append(page, row)
	}
	rows.Close()
	if err := rows.Err(); err != nil && !errors.Is(err, sql.ErrNoRows) {
		common.WriteServiceError(w, r, "identity anomalies", rid, err)
		return
	}

	var next *string
	if len(page) > limit {
		page = page[:limit]
		last := page[len(page)-1]
		b, _ := json.Marshal(cursor{At: last.CreatedAt.UnixMicro(), ID: last.ID})
		s := base64.RawURLEncoding.EncodeToString(b)
		next = &s
	}
	events := common.AlertEvents(ctx, h.alertEvents, "identity anomalies events", page)
	// The rows are this identity's: it is named by the page, so no fleet
	// index is built; the reference falls back to the row's own metadata.
	index := common.NewIdentityIndex(nil)
	for _, a := range page {
		ev := common.EventOf(events, a)
		out.Items = append(out.Items, anomalylist.Item{
			ID: a.ID, Identity: common.AnomalyIdentityRefFor(a, index), WhatChanged: common.WhatChangedText(a),
			Dimension: a.Dimension, Severity: common.AnomalySeverity(ev), EventID: a.EventID,
			State: a.Status, DetectedAt: a.CreatedAt, Region: common.AnomalyRegion(a, ev),
		})
	}
	common.WriteJSON(w, http.StatusOK, common.Envelope{Data: out, Meta: common.Meta{RequestID: rid, GeneratedAt: time.Now().UTC(), NextCursor: next}})
}
