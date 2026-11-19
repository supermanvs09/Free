package humanidentities

import (
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/identitygraph"
	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/logging"
	"nhi-backend-api/internal/platform/middleware"
)

const (
	maxHumanPageSize   = 100
	maxHumanTypeLength = 64
)

// humanSortKeys must stay in sync with humanSortColumns in the identitygraph repo.
var humanSortKeys = map[string]bool{
	"name":             true,
	"email":            true,
	"source":           true,
	"status":           true,
	"mfa":              true,
	"last_activity_at": true,
	"created_at":       true,
	"score":            true,
}

// humanListAllowed lists the query parameters GET /human-identities accepts.
// Any other parameter is rejected with 400.
var humanListAllowed = map[string]struct{}{
	"source": {}, "human_type": {}, "page": {}, "page_size": {}, "status": {},
	"mfa": {}, "search": {}, "sort_by": {}, "sort_order": {}, "risk": {},
}

var humanIDPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type HumanIdentityHandler struct {
	service *HumanIdentityService
}

func NewHumanIdentityHandler(service *HumanIdentityService) *HumanIdentityHandler {
	return &HumanIdentityHandler{service: service}
}

func writeHumanError(w http.ResponseWriter, status int, message, code string) {
	httpx.SendJSONResponse(w, status, httpx.APIResponse{
		Success: false,
		Message: message,
		Error:   code,
	})
}

func parseSourceParam(raw string) (string, bool) {
	s := strings.ToLower(strings.TrimSpace(raw))
	switch s {
	case "", "all", "iam", "sso":
		return s, true
	}
	return "", false
}

// Overview handles GET /api/v1/human-identities/overview.
func (h *HumanIdentityHandler) Overview(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		writeHumanError(w, http.StatusUnauthorized, "Unauthorized", "UNAUTHORIZED")
		return
	}

	src, ok := parseSourceParam(r.URL.Query().Get("source"))
	if !ok {
		writeHumanError(w, http.StatusBadRequest, "source must be all, iam, or sso", "INVALID_SOURCE")
		return
	}

	result, err := h.service.GetOverview(r.Context(), claims.UserID, claims.TenantID, claims.DBName, src)
	if err != nil {
		logging.FromContext(r.Context()).Error("human identity overview failed", "err", err)
		writeHumanError(w, http.StatusInternalServerError, "Failed to retrieve human identity overview", "HUMAN_OVERVIEW_FAILED")
		return
	}

	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{
		Success: true,
		Message: "Human identity overview retrieved successfully",
		Data:    result,
	})
}

// List handles GET /api/v1/human-identities.
func (h *HumanIdentityHandler) List(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		writeHumanError(w, http.StatusUnauthorized, "Unauthorized", "UNAUTHORIZED")
		return
	}
	if httpx.RejectUnknownQuery(w, r, humanListAllowed) {
		return
	}

	q := r.URL.Query()

	src, ok := parseSourceParam(q.Get("source"))
	if !ok {
		writeHumanError(w, http.StatusBadRequest, "source must be all, iam, or sso", "INVALID_SOURCE")
		return
	}

	filter := identitygraph.HumanIdentityListFilter{
		Page:      1,
		PageSize:  25,
		Source:    src,
		Search:    strings.TrimSpace(q.Get("search")),
		SortBy:    "last_activity_at",
		SortOrder: "desc",
	}

	if raw := strings.TrimSpace(q.Get("human_type")); raw != "" {
		if len(raw) > maxHumanTypeLength {
			writeHumanError(w, http.StatusBadRequest, "human_type is too long", "INVALID_HUMAN_TYPE")
			return
		}
		filter.HumanType = raw
	}

	if raw := q.Get("page"); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 1 {
			writeHumanError(w, http.StatusBadRequest, "page must be a positive integer", "INVALID_PAGE")
			return
		}
		filter.Page = v
	}
	if raw := q.Get("page_size"); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 1 {
			writeHumanError(w, http.StatusBadRequest, "page_size must be a positive integer", "INVALID_PAGE_SIZE")
			return
		}
		if v > maxHumanPageSize {
			v = maxHumanPageSize
		}
		filter.PageSize = v
	}
	if raw := strings.TrimSpace(q.Get("status")); raw != "" {
		filter.Statuses = httpx.SplitAndTrim(raw)
	}

	mfa, err := httpx.ParseOptionalBool(q, "mfa")
	if err != nil {
		writeHumanError(w, http.StatusBadRequest, "mfa must be true or false", "INVALID_MFA")
		return
	}
	filter.MFA = mfa

	if raw := strings.TrimSpace(q.Get("risk")); raw != "" {
		key := strings.ToLower(raw)
		if !identitygraph.IsValidHumanRisk(key) {
			writeHumanError(w, http.StatusBadRequest, "Invalid risk: "+raw, "INVALID_RISK")
			return
		}
		filter.Risk = key
	}

	if raw := q.Get("sort_by"); raw != "" {
		key := strings.ToLower(strings.TrimSpace(raw))
		if !humanSortKeys[key] {
			writeHumanError(w, http.StatusBadRequest, "Invalid sort_by: "+raw, "INVALID_SORT_BY")
			return
		}
		filter.SortBy = key
	}
	if raw := q.Get("sort_order"); raw != "" {
		if !httpx.IsValidSortOrder(raw) {
			writeHumanError(w, http.StatusBadRequest, "Invalid sort_order: must be asc or desc", "INVALID_SORT_ORDER")
			return
		}
		filter.SortOrder = raw
	}

	result, err := h.service.GetList(r.Context(), claims.UserID, claims.TenantID, claims.DBName, filter)
	if errors.Is(err, identitygraph.ErrInvalidHumanRisk) {
		writeHumanError(w, http.StatusBadRequest, "Invalid risk filter", "INVALID_RISK")
		return
	}
	if err != nil {
		logging.FromContext(r.Context()).Error("human identity list failed", "err", err)
		writeHumanError(w, http.StatusInternalServerError, "Failed to retrieve human identities", "HUMAN_LIST_FAILED")
		return
	}

	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{
		Success: true,
		Message: "Human identities retrieved successfully",
		Data:    result,
	})
}

// Get handles GET /api/v1/human-identities/{id}.
func (h *HumanIdentityHandler) Get(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		writeHumanError(w, http.StatusUnauthorized, "Unauthorized", "UNAUTHORIZED")
		return
	}

	id := mux.Vars(r)["id"]
	if !humanIDPattern.MatchString(id) {
		writeHumanError(w, http.StatusBadRequest, "id must be a UUID", "INVALID_ID")
		return
	}

	result, err := h.service.GetDetail(r.Context(), claims.UserID, claims.TenantID, claims.DBName, id)
	if errors.Is(err, identitygraph.ErrHumanIdentityNotFound) {
		writeHumanError(w, http.StatusNotFound, "Human identity not found", "HUMAN_NOT_FOUND")
		return
	}
	if err != nil {
		logging.FromContext(r.Context()).Error("human identity detail failed", "err", err)
		writeHumanError(w, http.StatusInternalServerError, "Failed to retrieve human identity", "HUMAN_DETAIL_FAILED")
		return
	}

	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{
		Success: true,
		Message: "Human identity retrieved successfully",
		Data:    result,
	})
}

// PermissionSets handles GET /api/v1/human-identities/permission-sets.
// It returns SSO permission sets only, with their assigned users and accounts.
func (h *HumanIdentityHandler) PermissionSets(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		writeHumanError(w, http.StatusUnauthorized, "Unauthorized", "UNAUTHORIZED")
		return
	}
	result, err := h.service.GetPermissionSets(r.Context(), claims.UserID, claims.TenantID, claims.DBName)
	if err != nil {
		logging.FromContext(r.Context()).Error("human permission sets failed", "err", err)
		writeHumanError(w, http.StatusInternalServerError, "Failed to retrieve permission sets", "HUMAN_PERMISSION_SETS_FAILED")
		return
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{
		Success: true,
		Message: "Permission sets retrieved successfully",
		Data:    result,
	})
}
