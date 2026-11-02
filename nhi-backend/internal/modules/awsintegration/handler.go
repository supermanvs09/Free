package awsintegration

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/platform/awsconnect"
	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/middleware"
)

var awsAccountIDRE = regexp.MustCompile(`^\d{12}$`)

// AWSIntegrationHandler serves the "Connect AWS Account" setup.
//
//	GET    /api/v1/integrations/aws                                any signed-in user (setup values: admin only)
//	POST   /api/v1/integrations/aws/verify                         admin
//	PUT    /api/v1/integrations/aws/accounts/{account_id}/regions  admin
//	PUT    /api/v1/integrations/aws/accounts/{account_id}/exposure admin
//	POST   /api/v1/integrations/aws/accounts/{account_id}/sync     admin
//	DELETE /api/v1/integrations/aws/accounts/{account_id}          admin
type AWSIntegrationHandler struct{ service *AWSIntegrationService }

func NewAWSIntegrationHandler(service *AWSIntegrationService) *AWSIntegrationHandler {
	return &AWSIntegrationHandler{service: service}
}

// Connecting, changing and removing accounts changes what the whole tenant
// sees, so they are admin actions, like the other tenant-wide writes here.
func canManageAWS(role string) bool {
	return strings.EqualFold(strings.TrimSpace(role), "admin")
}

func (h *AWSIntegrationHandler) Get(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		httpx.SendJSONResponse(w, http.StatusUnauthorized, httpx.APIResponse{Success: false, Message: "Unauthorized", Error: "UNAUTHORIZED"})
		return
	}
	if httpx.RejectUnknownQuery(w, r, httpx.NoQueryAllowed) {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	result, err := h.service.Get(r.Context(), AWSCaller{TenantID: claims.TenantID, Schema: claims.DBName, Actor: claims.UserID}, canManageAWS(claims.Role))
	if err != nil {
		writeAWSError(w, r, err, "Failed to load the AWS connection", "AWS_INTEGRATION_LOAD_FAILED")
		return
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: "AWS connection retrieved", Data: result})
}

func (h *AWSIntegrationHandler) Verify(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.adminCaller(w, r)
	if !ok {
		return
	}
	var req AWSVerifyRequest
	if !decodeAWSBody(w, r, &req) {
		return
	}
	result, err := h.service.Verify(r.Context(), caller, req.RoleARN, req.Regions)
	if err != nil {
		writeAWSError(w, r, err, "Failed to verify the AWS connection", "AWS_VERIFY_FAILED")
		return
	}
	message := "Some checks need attention"
	if result.Status == AWSStatusConnected {
		message = "AWS account connected"
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: message, Data: result})
}

func (h *AWSIntegrationHandler) UpdateRegions(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.adminCaller(w, r)
	if !ok {
		return
	}
	accountID, ok := pathAccountID(w, r)
	if !ok {
		return
	}
	var req AWSRegionsRequest
	if !decodeAWSBody(w, r, &req) {
		return
	}
	account, err := h.service.UpdateRegions(r.Context(), caller, accountID, req.Regions)
	if err != nil {
		writeAWSError(w, r, err, "Failed to update the regions", "AWS_REGIONS_UPDATE_FAILED")
		return
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: "Regions updated", Data: account})
}

func (h *AWSIntegrationHandler) Exposure(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.adminCaller(w, r)
	if !ok {
		return
	}
	accountID, ok := pathAccountID(w, r)
	if !ok {
		return
	}
	var req AWSExposureRequest
	if !decodeAWSBody(w, r, &req) {
		return
	}
	result, err := h.service.SetExposure(r.Context(), caller, accountID, req)
	if err != nil {
		writeAWSError(w, r, err, "Failed to update exposed-credential scanning", "AWS_EXPOSURE_UPDATE_FAILED")
		return
	}
	message := "Exposed-credential scanning updated"
	if (req.GitHub && !result.Account.Exposure.GitHub.Connected) || (req.CodeCommit && !result.Account.Exposure.CodeCommit.Connected) {
		message = "Some checks need attention"
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: message, Data: result})
}

func (h *AWSIntegrationHandler) Sync(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.adminCaller(w, r)
	if !ok {
		return
	}
	accountID, ok := pathAccountID(w, r)
	if !ok {
		return
	}
	result, err := h.service.RequestSync(r.Context(), caller, accountID)
	if err != nil {
		writeAWSError(w, r, err, "Failed to start the sync", "AWS_SYNC_FAILED")
		return
	}
	message := "Sync queued"
	if result.AlreadyQueued {
		message = "A sync is already queued or running"
	}
	// 202: the sync itself runs in the discovery worker.
	httpx.SendJSONResponse(w, http.StatusAccepted, httpx.APIResponse{Success: true, Message: message, Data: result})
}

func (h *AWSIntegrationHandler) Remove(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.adminCaller(w, r)
	if !ok {
		return
	}
	accountID, ok := pathAccountID(w, r)
	if !ok {
		return
	}
	if err := h.service.RemoveAccount(r.Context(), caller, accountID); err != nil {
		writeAWSError(w, r, err, "Failed to remove the account", "AWS_REMOVE_FAILED")
		return
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: "AWS account removed", Data: map[string]string{"account_id": accountID}})
}

// adminCaller checks the token, the role and the query string shared by every
// write, and returns who is calling.
func (h *AWSIntegrationHandler) adminCaller(w http.ResponseWriter, r *http.Request) (AWSCaller, bool) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		httpx.SendJSONResponse(w, http.StatusUnauthorized, httpx.APIResponse{Success: false, Message: "Unauthorized", Error: "UNAUTHORIZED"})
		return AWSCaller{}, false
	}
	if httpx.RejectUnknownQuery(w, r, httpx.NoQueryAllowed) {
		return AWSCaller{}, false
	}
	w.Header().Set("Cache-Control", "no-store")
	if !canManageAWS(claims.Role) {
		httpx.SendJSONResponse(w, http.StatusForbidden, httpx.APIResponse{Success: false, Message: "Only an admin can change AWS accounts", Error: "FORBIDDEN"})
		return AWSCaller{}, false
	}
	return AWSCaller{TenantID: claims.TenantID, Schema: claims.DBName, Actor: claims.UserID}, true
}

func pathAccountID(w http.ResponseWriter, r *http.Request) (string, bool) {
	id := strings.TrimSpace(mux.Vars(r)["account_id"])
	if !awsAccountIDRE.MatchString(id) {
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "An AWS account ID is 12 digits", Error: "INVALID_ACCOUNT_ID"})
		return "", false
	}
	return id, true
}

func decodeAWSBody(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	defer r.Body.Close()
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "Request body must be valid JSON with supported fields", Error: "INVALID_REQUEST"})
		return false
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "Request body must contain exactly one JSON object", Error: "INVALID_REQUEST"})
		return false
	}
	return true
}

// writeAWSError maps service errors to responses. Messages are written for
// the person on the setup page; internal detail stays in the server log.
func writeAWSError(w http.ResponseWriter, r *http.Request, err error, fallback, fallbackCode string) {
	var invalidARN *awsconnect.ErrInvalidRoleARN
	var invalidRegions *awsconnect.ErrInvalidRegions
	var invalidSecret *awsconnect.ErrInvalidSecretARN
	switch {
	case errors.As(err, &invalidSecret):
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: invalidSecret.Message, Error: "INVALID_SECRET_ARN"})
	case errors.As(err, &invalidARN):
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: invalidARN.Message, Error: "INVALID_ROLE_ARN"})
	case errors.As(err, &invalidRegions):
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: invalidRegions.Message, Error: "INVALID_REGIONS"})
	case errors.Is(err, ErrAWSAccountNotFound):
		httpx.SendJSONResponse(w, http.StatusNotFound, httpx.APIResponse{Success: false, Message: "This AWS account is not connected to your workspace", Error: "AWS_ACCOUNT_NOT_FOUND"})
	case errors.Is(err, ErrAWSAccountNotConnected):
		httpx.SendJSONResponse(w, http.StatusConflict, httpx.APIResponse{Success: false, Message: "This account has not passed its checks yet. Verify the connection first", Error: "AWS_ACCOUNT_NOT_CONNECTED"})
	case errors.Is(err, ErrAWSAccountClaimed):
		httpx.SendJSONResponse(w, http.StatusConflict, httpx.APIResponse{Success: false, Message: "This AWS account is already connected to another workspace. Contact support if that is unexpected", Error: "AWS_ACCOUNT_IN_USE"})
	case errors.Is(err, ErrAWSVerifyInProgress):
		httpx.SendJSONResponse(w, http.StatusTooManyRequests, httpx.APIResponse{Success: false, Message: "A connection check is already running. Wait for it to finish", Error: "AWS_VERIFY_IN_PROGRESS"})
	case errors.Is(err, ErrAWSTablesMissing), errors.Is(err, ErrAWSTenantNotConfigured):
		if errors.Is(err, ErrAWSTablesMissing) {
			slog.Warn("aws integration: tenant tables missing", "err", err)
		}
		httpx.SendJSONResponse(w, http.StatusServiceUnavailable, httpx.APIResponse{Success: false, Message: "AWS connections are not set up for your workspace yet. Contact support", Error: "AWS_PLATFORM_NOT_CONFIGURED"})
	case errors.Is(err, ErrAWSUnavailable):
		httpx.SendJSONResponse(w, http.StatusServiceUnavailable, httpx.APIResponse{Success: false, Message: "AWS cannot be reached right now. Try again shortly", Error: "AWS_UNAVAILABLE"})
	default:
		httpx.SendServerError(w, r, err, fallback, fallbackCode)
	}
}
