package identities

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/identitygraph"
	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/middleware"
)

// identical UUID shape — reuse the compiled regex from credential_detail_handler.go

type IdentityDetailHandler struct {
	service *IdentityDetailService
}

func NewIdentityDetailHandler(service *IdentityDetailService) *IdentityDetailHandler {
	return &IdentityDetailHandler{service: service}
}

// Get handles GET /api/v1/identities/{id}?tab=&time_range=&start_date=&end_date=&service=&used_only=&depth=&edge_type=
// ("ENDPOINT 5: Identity Detail").
func (h *IdentityDetailHandler) Get(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		httpx.SendJSONResponse(w, http.StatusUnauthorized, httpx.APIResponse{Success: false, Message: "Unauthorized", Error: "UNAUTHORIZED"})
		return
	}

	id := strings.TrimSpace(mux.Vars(r)["id"])
	if id == "" {
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "identity id is required", Error: "INVALID_REQUEST"})
		return
	}
	// Validate UUID format before it reaches "id = $1::uuid" in Postgres —
	// otherwise a malformed id throws a raw "invalid input syntax for type
	// uuid" (SQLSTATE 22P02) error that must never reach the client.
	if !httpx.IdentityUUIDRegex.MatchString(id) {
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "Invalid identity ID", Error: "INVALID_REQUEST"})
		return
	}

	if httpx.RejectUnknownQuery(w, r, IdentityDetailAllowed) {
		return
	}

	q := r.URL.Query()

	tab := strings.ToLower(strings.TrimSpace(q.Get("tab")))
	if tab == "" {
		tab = "overview"
	}
	if ok, _ := httpx.ValidateSingleEnum(tab, validIdentityTabs); !ok {
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{
			Success: false,
			Message: "Invalid tab: " + tab + ". Allowed: " + httpx.AllowedList(validIdentityTabs),
			Error:   "INVALID_TAB",
		})
		return
	}

	timeRange := strings.TrimSpace(q.Get("time_range"))
	if timeRange == "" {
		timeRange = "90d"
	}

	depth := 1
	if raw := q.Get("depth"); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 1 || v > httpx.MaxRelationshipDepth {
			httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{
				Success: false,
				Message: fmt.Sprintf("depth must be an integer between 1 and %d", httpx.MaxRelationshipDepth),
				Error:   "INVALID_REQUEST",
			})
			return
		}
		depth = v
	}

	usedOnly, err := httpx.ParseOptionalBool(q, "used_only")
	if err != nil {
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "used_only must be true or false", Error: "INVALID_REQUEST"})
		return
	}

	if et := strings.TrimSpace(q.Get("edge_type")); et != "" {
		if ok, bad := httpx.ValidateEnumList(et, identitygraph.ValidEdgeTypes); !ok {
			httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{
				Success: false,
				Message: "Invalid edge_type: " + bad + ". Allowed: " + httpx.AllowedList(identitygraph.ValidEdgeTypes),
				Error:   "INVALID_EDGE_TYPE",
			})
			return
		}
	}

	// start_date / end_date validation — only meaningful with time_range=custom,
	// but we validate format regardless so typos are caught early.
	if sd := strings.TrimSpace(q.Get("start_date")); sd != "" {
		if !httpx.IsValidDate(sd) {
			httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "Invalid start_date format. Use YYYY-MM-DD or RFC3339", Error: "INVALID_DATE"})
			return
		}
	}
	if ed := strings.TrimSpace(q.Get("end_date")); ed != "" {
		if !httpx.IsValidDate(ed) {
			httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "Invalid end_date format. Use YYYY-MM-DD or RFC3339", Error: "INVALID_DATE"})
			return
		}
	}
	if strings.EqualFold(timeRange, "custom") {
		if strings.TrimSpace(q.Get("start_date")) == "" || strings.TrimSpace(q.Get("end_date")) == "" {
			httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "time_range=custom requires both start_date and end_date", Error: "INVALID_TIME_RANGE"})
			return
		}
	} else {
		if strings.TrimSpace(q.Get("start_date")) != "" || strings.TrimSpace(q.Get("end_date")) != "" {
			httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "start_date and end_date are only allowed when time_range=custom", Error: "INVALID_TIME_RANGE"})
			return
		}
	}

	page, pageSize, ok := httpx.ParseActivityPaging(w, q)
	if !ok {
		return
	}

	filter := identitygraph.IdentityDetailFilter{
		IdentityID: id,
		Tab:        tab,
		TimeRange:  timeRange,
		StartDate:  strings.TrimSpace(q.Get("start_date")),
		EndDate:    strings.TrimSpace(q.Get("end_date")),
		Page:       page,
		PageSize:   pageSize,
		Service:    strings.TrimSpace(q.Get("service")),
		UsedOnly:   usedOnly,
		Depth:      depth,
		EdgeType:   strings.TrimSpace(q.Get("edge_type")),
	}

	result, err := h.service.GetDetail(r.Context(), claims.UserID, claims.TenantID, claims.DBName, filter)
	if err != nil {
		var timeRangeErr *identitygraph.TimeRangeError
		switch {
		case errors.As(err, &timeRangeErr):
			httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{
				Success: false, Message: timeRangeErr.Msg, Error: "INVALID_TIME_RANGE"})
		case errors.Is(err, ErrInvalidIdentityTab):
			httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{
				Success: false,
				Message: "Unsupported tab. Available tabs: overview, permissions, activity, relationships, credentials, raw.",
				Error:   "INVALID_REQUEST",
			})
		case errors.Is(err, ErrIdentityNotFound):
			httpx.SendJSONResponse(w, http.StatusNotFound, httpx.APIResponse{
				Success: false,
				Message: fmt.Sprintf("identity with id '%s' not found", id),
				Error:   "IDENTITY_NOT_FOUND",
			})
		default:
			httpx.SendServerError(w, r, err, "Failed to retrieve identity detail", "IDENTITY_DETAIL_FAILED")
		}
		return
	}

	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{
		Success: true,
		Message: "Identity detail retrieved successfully",
		Data:    result,
	})
}
