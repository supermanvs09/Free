package identities

import (
	"net/http"
	"strconv"
	"strings"

	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/middleware"
)

type IdentitiesListHandler struct {
	service *IdentitiesListService
}

func NewIdentitiesListHandler(service *IdentitiesListService) *IdentitiesListHandler {
	return &IdentitiesListHandler{service: service}
}

// List handles GET /api/v1/identities — "ENDPOINT 4: Identities List".
func (h *IdentitiesListHandler) List(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		httpx.SendJSONResponse(w, http.StatusUnauthorized, httpx.APIResponse{Success: false, Message: "Unauthorized", Error: "UNAUTHORIZED"})
		return
	}

	if httpx.RejectUnknownQuery(w, r, identitiesListAllowed) {
		return
	}

	q := r.URL.Query()

	filter := IdentityListFilter{
		Page:      1,
		PageSize:  25,
		Search:    strings.TrimSpace(q.Get("search")),
		Owner:     strings.TrimSpace(q.Get("owner")),
		VPCID:     strings.TrimSpace(q.Get("vpc_id")),
		SortBy:    "last_activity_at",
		SortOrder: "desc",
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
	if raw := strings.TrimSpace(q.Get("identity_type")); raw != "" {
		vals := httpx.SplitAndTrim(raw)
		if bad, ok := httpx.ValidateTokens(vals); !ok {
			httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{
				Success: false,
				Message: "Invalid identity_type: " + bad + ". Use letters, digits, spaces, dots, dashes and underscores.",
				Error:   "INVALID_IDENTITY_TYPE",
			})
			return
		}
		filter.IdentityTypes = vals
	}
	if raw := strings.TrimSpace(q.Get("functional_class")); raw != "" {
		vals := httpx.SplitAndTrim(raw)
		if bad, ok := httpx.ValidateTokens(vals); !ok {
			httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{
				Success: false,
				Message: "Invalid functional_class: " + bad + ". Use letters, digits, spaces, dots, dashes and underscores.",
				Error:   "INVALID_FUNCTIONAL_CLASS",
			})
			return
		}
		filter.FunctionalClasses = vals
	}
	if raw := strings.TrimSpace(q.Get("environment")); raw != "" {
		vals := httpx.SplitAndTrim(raw)
		if bad, ok := httpx.ValidateTokens(vals); !ok {
			httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{
				Success: false,
				Message: "Invalid environment: " + bad + ". Use letters, digits, spaces, dots, dashes and underscores.",
				Error:   "INVALID_ENVIRONMENT",
			})
			return
		}
		filter.Environments = vals
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
		if _, ok := identitySortColumnsAllowed[strings.ToLower(strings.TrimSpace(raw))]; !ok {
			httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{
				Success: false,
				Message: "Invalid sort_by: " + raw + ". Allowed: " + httpx.AllowedList(identitySortColumnsAllowed),
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
	if filter.IsPubliclyAccessible, err = httpx.ParseOptionalBool(q, "is_publicly_accessible"); err != nil {
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "is_publicly_accessible must be true or false", Error: "INVALID_REQUEST"})
		return
	}
	if filter.MinIdleDays, err = httpx.ParseOptionalInt(q, "min_idle_days"); err != nil {
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "min_idle_days must be an integer", Error: "INVALID_REQUEST"})
		return
	}

	result, err := h.service.GetIdentities(r.Context(), claims.UserID, claims.TenantID, claims.DBName, filter)
	if err != nil {
		httpx.SendServerError(w, r, err, "Failed to retrieve identities", "IDENTITIES_LOAD_FAILED")
		return
	}

	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{
		Success: true,
		Message: "Identities retrieved successfully",
		Data:    result,
	})
}
