package credentials

import (
	"net/http"
	"strconv"
	"strings"

	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/middleware"
)

type CredentialsHandler struct {
	credentialsService *CredentialsService
}

func NewCredentialsHandler(credentialsService *CredentialsService) *CredentialsHandler {
	return &CredentialsHandler{credentialsService: credentialsService}
}

// List handles GET /api/v1/credentials — "ENDPOINT 6: Credentials List".
func (h *CredentialsHandler) List(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		httpx.SendJSONResponse(w, http.StatusUnauthorized, httpx.APIResponse{
			Success: false,
			Message: "Unauthorized",
			Error:   "UNAUTHORIZED",
		})
		return
	}

	if httpx.RejectUnknownQuery(w, r, credentialsListAllowed) {
		return
	}

	q := r.URL.Query()

	filter := CredentialListFilter{
		Page:              1,
		PageSize:          25,
		Search:            strings.TrimSpace(q.Get("search")),
		OwnerPrincipalARN: strings.TrimSpace(q.Get("owner_principal_arn")),
		SortBy:            "last_used_at",
		SortOrder:         "desc",
	}

	if raw := q.Get("page"); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 1 {
			httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "page must be a positive integer", Error: "INVALID_REQUEST"})
			return
		}
		filter.Page = v
	}
	if raw := q.Get("page_size"); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 1 {
			httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "page_size must be a positive integer", Error: "INVALID_REQUEST"})
			return
		}
		// Documented maximum is 100 rows per page.
		if v > httpx.MaxPageSize {
			v = httpx.MaxPageSize
		}
		filter.PageSize = v
	}
	if raw := strings.TrimSpace(q.Get("credential_type")); raw != "" {
		vals := httpx.SplitAndTrim(raw)
		// Not an enum: the scanner keeps adding types (login_profile,
		// ec2_key_pair, ...), and the value only ever reaches a bound parameter.
		if bad, ok := httpx.ValidateTokens(vals); !ok {
			httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{
				Success: false,
				Message: "Invalid credential_type: " + bad + ". Use letters, digits, spaces, dots, dashes and underscores.",
				Error:   "INVALID_CREDENTIAL_TYPE",
			})
			return
		}
		filter.CredentialTypes = vals
	}
	if raw := strings.TrimSpace(q.Get("status")); raw != "" {
		vals := httpx.SplitAndTrim(raw)
		if bad, ok := httpx.ValidateTokens(vals); !ok {
			httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{
				Success: false,
				Message: "Invalid status: " + bad + ". Use letters, digits, spaces, dots, dashes and underscores.",
				Error:   "INVALID_STATUS",
			})
			return
		}
		filter.Statuses = vals
	}
	if raw := q.Get("sort_by"); raw != "" {
		if _, ok := credentialSortColumnsAllowed[strings.ToLower(strings.TrimSpace(raw))]; !ok {
			httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{
				Success: false,
				Message: "Invalid sort_by: " + raw + ". Allowed: " + httpx.AllowedList(credentialSortColumnsAllowed),
				Error:   "INVALID_SORT_BY",
			})
			return
		}
		filter.SortBy = raw
	}
	if raw := q.Get("sort_order"); raw != "" {
		if !httpx.IsValidSortOrder(raw) {
			httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{
				Success: false,
				Message: "Invalid sort_order: must be asc or desc",
				Error:   "INVALID_SORT_ORDER",
			})
			return
		}
		filter.SortOrder = raw
	}

	var err error
	if filter.RotationEnabled, err = httpx.ParseOptionalBool(q, "rotation_enabled"); err != nil {
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "rotation_enabled must be true or false", Error: "INVALID_REQUEST"})
		return
	}
	if filter.RotationOverdue, err = httpx.ParseOptionalBool(q, "rotation_overdue"); err != nil {
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "rotation_overdue must be true or false", Error: "INVALID_REQUEST"})
		return
	}
	if filter.IsOrphaned, err = httpx.ParseOptionalBool(q, "is_orphaned"); err != nil {
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "is_orphaned must be true or false", Error: "INVALID_REQUEST"})
		return
	}
	if filter.HasExternalTrust, err = httpx.ParseOptionalBool(q, "has_external_trust"); err != nil {
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "has_external_trust must be true or false", Error: "INVALID_REQUEST"})
		return
	}
	if filter.MinIdleDays, err = httpx.ParseOptionalInt(q, "min_idle_days"); err != nil {
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "min_idle_days must be an integer", Error: "INVALID_REQUEST"})
		return
	}
	if filter.MaxDaysUntilExpiry, err = httpx.ParseOptionalInt(q, "max_days_until_expiry"); err != nil {
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "max_days_until_expiry must be an integer", Error: "INVALID_REQUEST"})
		return
	}

	result, err := h.credentialsService.GetCredentials(r.Context(), claims.UserID, claims.TenantID, claims.DBName, filter)
	if err != nil {
		httpx.SendServerError(w, r, err, "Failed to retrieve credentials", "CREDENTIALS_LOAD_FAILED")
		return
	}

	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{
		Success: true,
		Message: "Credentials retrieved successfully",
		Data:    result,
	})
}
