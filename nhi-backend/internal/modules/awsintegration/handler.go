package awsintegration

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/platform/awsconnect"
	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/logging"
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

// CancelSync is DELETE /integrations/aws/accounts/{id}/sync: withdraws a
// queued sync the worker has not started.
func (h *AWSIntegrationHandler) CancelSync(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.adminCaller(w, r)
	if !ok {
		return
	}
	accountID, ok := pathAccountID(w, r)
	if !ok {
		return
	}
	result, err := h.service.CancelSync(r.Context(), caller, accountID)
	switch {
	case errors.Is(err, ErrAWSSyncRunning):
		httpx.SendJSONResponse(w, http.StatusConflict, httpx.APIResponse{Success: false, Message: "This sync has already started and can no longer be cancelled. It finishes on its own", Error: "AWS_SYNC_RUNNING"})
		return
	case errors.Is(err, ErrAWSSyncNotQueued):
		httpx.SendJSONResponse(w, http.StatusConflict, httpx.APIResponse{Success: false, Message: "There is no queued sync to cancel for this account", Error: "AWS_SYNC_NOT_QUEUED"})
		return
	case err != nil:
		writeAWSError(w, r, err, "Failed to cancel the sync", "AWS_SYNC_CANCEL_FAILED")
		return
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: "Sync cancelled", Data: result})
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
	status, code, message := http.StatusInternalServerError, fallbackCode, fallback
	switch {
	case errors.As(err, &invalidSecret):
		status, code, message = http.StatusBadRequest, "INVALID_SECRET_ARN", invalidSecret.Message
	case errors.As(err, &invalidARN):
		status, code, message = http.StatusBadRequest, "INVALID_ROLE_ARN", invalidARN.Message
	case errors.As(err, &invalidRegions):
		status, code, message = http.StatusBadRequest, "INVALID_REGIONS", invalidRegions.Message
	case errors.Is(err, ErrAWSAccountNotFound):
		status, code, message = http.StatusNotFound, "AWS_ACCOUNT_NOT_FOUND", "This AWS account is not connected to your workspace"
	case errors.Is(err, ErrAWSAccountNotConnected):
		status, code, message = http.StatusConflict, "AWS_ACCOUNT_NOT_CONNECTED", "This account has not passed its checks yet. Verify the connection first"
	case errors.Is(err, ErrAWSAccountClaimed):
		status, code, message = http.StatusConflict, "AWS_ACCOUNT_IN_USE", "This AWS account is already connected to another workspace. Contact support if that is unexpected"
	case errors.Is(err, ErrAWSVerifyInProgress):
		status, code, message = http.StatusTooManyRequests, "AWS_VERIFY_IN_PROGRESS", "A connection check is already running. Wait for it to finish"
	case errors.Is(err, ErrAWSTablesMissing), errors.Is(err, ErrAWSTenantNotConfigured):
		status, code, message = http.StatusServiceUnavailable, "AWS_PLATFORM_NOT_CONFIGURED", "AWS connections are not set up for your workspace yet. Contact support"
	case errors.Is(err, ErrAWSUnavailable):
		status, code, message = http.StatusServiceUnavailable, "AWS_UNAVAILABLE", "AWS cannot be reached right now. Try again shortly"
	default:
		// Logged with the request by SendServerError.
		httpx.SendServerError(w, r, err, fallback, fallbackCode)
		return
	}
	logAWSError(r, status, code, err)
	httpx.SendJSONResponse(w, status, httpx.APIResponse{Success: false, Message: message, Error: code})
}

// logAWSError puts every refused integration request in the log with the
// route, the account and the code the page was given. Setup problems on our
// side (tables, platform settings, AWS unreachable) are errors with a hint;
// a customer's input or state is info.
func logAWSError(r *http.Request, status int, code string, err error) {
	log := logging.FromContext(r.Context()).With("method", r.Method, "path", r.URL.Path, "status", status, "code", code, "err", err)
	if id := mux.Vars(r)["account_id"]; id != "" {
		log = log.With("account_id", id)
	}
	switch {
	case errors.Is(err, ErrAWSTablesMissing):
		log.Error("aws integration: the tenant schema has no accounts table; run the tenant migrations for this workspace")
	case errors.Is(err, ErrAWSTenantNotConfigured):
		log.Error("aws integration: the tenant has no collector_aws_account_id / collector_event_bridge_arn / collector_external_id in nhi_global.tenants; finish its onboarding")
	case errors.Is(err, ErrAWSUnavailable):
		log.Error("aws integration: AWS is not configured or not reachable from the API server (verifier missing or AWS calls failing)")
	default:
		log.Info("aws integration: request refused")
	}
}
