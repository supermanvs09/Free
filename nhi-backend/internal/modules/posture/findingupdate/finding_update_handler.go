package findingupdate

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/posture/common"
)

type FindingUpdateHandler struct {
	service *FindingUpdateService
}

func NewFindingUpdateHandler(service *FindingUpdateService) *FindingUpdateHandler {
	return &FindingUpdateHandler{service: service}
}

// maxPatchBody bounds the request body.
const maxPatchBody = 16 << 10

// Patch handles PATCH /findings/{id} (analyst / admin): accept, suppress,
// reopen, assign or add a note. Concurrent changes to one finding are applied
// one after the other (the row is locked), and every change is kept in the
// finding's history. If-Match: "<updated_at>" is optional; when sent and the
// finding changed in the meantime the answer is 409, so two analysts cannot
// silently overwrite each other. The response ETag is the new updated_at.
func (h *FindingUpdateHandler) Patch(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	if !c.CanWrite() { // checked before reading anything else
		common.Fail(w, r, "update finding", common.ErrForbidden)
		return
	}
	id := strings.TrimSpace(mux.Vars(r)["id"])
	if !common.UuidRegex.MatchString(id) {
		common.Invalid(w, "id", "id must be a valid finding UUID")
		return
	}
	if !common.StrictQuery(w, r.URL.Query(), common.Allow()) {
		return
	}
	ifMatch, ok := parseIfMatch(w, r)
	if !ok {
		return
	}
	var req FindingUpdateRequest
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxPatchBody))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		if errors.Is(err, io.EOF) {
			common.Invalid(w, "body", "a JSON body is required")
		} else {
			common.Invalid(w, "body", "the body is not valid JSON for this request: "+err.Error())
		}
		return
	}

	env, err := h.service.Update(r.Context(), c, FindingUpdate{
		FindingID: strings.ToLower(id), IfMatch: ifMatch, Request: req,
	})
	if err != nil {
		common.Fail(w, r, "update finding", err)
		return
	}
	if st, ok := env.Data.(*FindingState); ok {
		w.Header().Set("ETag", `"`+st.UpdatedAt.UTC().Format(time.RFC3339Nano)+`"`)
	}
	w.Header().Set("Cache-Control", "no-store")
	common.WriteJSON(w, http.StatusOK, env)
}

// parseIfMatch reads the optional If-Match: "<updated_at>" (RFC 3339, quotes
// and W/ optional). Absent, the zero time is returned and no check is made.
func parseIfMatch(w http.ResponseWriter, r *http.Request) (time.Time, bool) {
	raw := strings.Trim(strings.TrimPrefix(strings.TrimSpace(r.Header.Get("If-Match")), "W/"), `"`)
	if raw == "" || raw == "*" {
		return time.Time{}, true
	}
	t, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		common.Invalid(w, "If-Match", "If-Match must be the finding's updated_at in RFC 3339 format")
		return time.Time{}, false
	}
	return t, true
}
