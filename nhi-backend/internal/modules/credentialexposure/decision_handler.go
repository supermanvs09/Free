package credentialexposure

import (
	"errors"
	"net/http"
	"strings"

	"nhi-backend-api/internal/platform/middleware"
)

type DecisionHandler struct{ service *DecisionService }

func NewDecisionHandler(service *DecisionService) *DecisionHandler {
	return &DecisionHandler{service: service}
}

func (h *DecisionHandler) Save(w http.ResponseWriter, r *http.Request) {
	if !requireScannerAdmin(w, r) {
		return
	}
	claims := middleware.GetClaims(r)
	if rejectUnknownQuery(w, r, map[string]struct{}{}) {
		return
	}
	var req FindingDecisionRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	// The signed-in user decided; a decided_by in the body is ignored.
	err := h.service.Save(r.Context(), claims.UserID, claims.TenantID, claims.DBName, req.FindingID, req.Decision, claims.UserID, req.Deep)
	if err != nil {
		switch {
		case errors.Is(err, ErrDecisionFindingNotFound):
			msg := "Finding not found"
			if !req.Deep && strings.Contains(req.FindingID, "@") {
				msg = "Finding not found. A deep-scan finding (its id ends in @<branch>) is labelled with deep: true"
			}
			writeError(w, http.StatusNotFound, "NOT_FOUND", msg)
		case errors.Is(err, ErrDecisionFindingAmbiguous):
			writeError(w, http.StatusConflict, "AMBIGUOUS_FINDING", "Finding ID matched more than one platform table")
		default:
			writeInvalidOr(w, r, err, "INVALID_DECISION", "Unable to save analyst decision")
		}
		return
	}
	writeJSON(w, http.StatusOK, OKResponse{OK: true})
}
