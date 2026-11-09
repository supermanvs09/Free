package identitycontainment

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/genome/common"
)

type Handler struct {
	service *Service
	now     func() time.Time
}

func NewHandler(service *Service) *Handler {
	return &Handler{
		service: service,
		now: func() time.Time {
			return time.Now().UTC().Truncate(time.Second)
		},
	}
}

func (h *Handler) Get(
	w http.ResponseWriter,
	r *http.Request,
) {
	requestID := common.RequestID(r)

	w.Header().Set(
		"X-Request-ID",
		requestID,
	)

	defer common.Recover(
		w,
		r,
		"identity containment",
		requestID,
	)

	ctx, cancel := common.RequestContext(r)
	defer cancel()

	claims, ok := common.RequireClaims(
		w,
		r,
		requestID,
	)
	if !ok {
		return
	}

	if len(r.URL.Query()) != 0 {
		common.WriteError(
			w,
			http.StatusBadRequest,
			common.CodeValidation,
			"query parameters are not supported",
			requestID,
		)
		return
	}

	vars := mux.Vars(r)

	sourceType := strings.ToUpper(
		strings.TrimSpace(vars["source_type"]),
	)

	identityName := strings.TrimSpace(
		vars["identity_name"],
	)

	if sourceType == "" || identityName == "" {
		common.WriteError(
			w,
			http.StatusBadRequest,
			common.CodeValidation,
			"source_type and identity_name are required",
			requestID,
		)
		return
	}

	if err := common.CheckSourceType(sourceType); err != nil {
		common.WriteError(
			w,
			http.StatusBadRequest,
			common.CodeValidation,
			err.Error(),
			requestID,
		)
		return
	}

	data, err := h.service.Get(
		ctx,
		claims.UserID,
		claims.TenantID,
		claims.DBName,
		sourceType,
		identityName,
	)

	switch {
	case errors.Is(err, ErrBaselineNotEstablished):
		common.WriteError(
			w,
			http.StatusConflict,
			"BASELINE_NOT_ESTABLISHED",
			"The identity baseline is not established",
			requestID,
		)
		return

	case err != nil:
		common.WriteServiceError(
			w,
			r,
			"identity containment",
			requestID,
			err,
		)
		return
	}

	common.WriteJSON(
		w,
		http.StatusOK,
		common.Envelope{
			Data: data,
			Meta: common.Meta{
				RequestID:   requestID,
				GeneratedAt: h.now(),
				NextCursor:  nil,
			},
		},
	)
}
