package alerts

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"nhi-backend-api/internal/platform/jwt"
	"nhi-backend-api/internal/platform/middleware"
)

// Ownership is self-service: naming anyone but the caller is refused before
// any database work, so this needs no scope resolver.
func TestTriageRefusesAssigningSomeoneElse(t *testing.T) {
	h := &Handler{}
	body := `{"keys":["posture:abc"],"assignee":"bob@acme.test"}`
	r := httptest.NewRequest(http.MethodPost, "/alerts/triage", strings.NewReader(body))
	r = r.WithContext(context.WithValue(r.Context(), middleware.UserClaimsKey, &jwt.CustomClaims{UserID: "alice@acme.test", Role: "admin"}))
	w := httptest.NewRecorder()
	h.Triage(w, r)
	if w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), "ASSIGN_SELF_ONLY") {
		t.Fatalf("got %d %s, want 403 ASSIGN_SELF_ONLY", w.Code, w.Body.String())
	}
}
