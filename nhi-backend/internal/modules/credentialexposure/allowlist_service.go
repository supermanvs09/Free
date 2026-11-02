package credentialexposure

import (
	"context"
	"strings"

	"nhi-backend-api/internal/platform/scope"
)

// InvalidInputError is a client mistake in a request (HTTP 400). Its message
// is safe to return to the client.
type InvalidInputError struct{ Msg string }

func (e *InvalidInputError) Error() string { return e.Msg }

func invalid(msg string) error { return &InvalidInputError{Msg: msg} }

type AllowlistService struct {
	repo     *AllowlistRepository
	resolver *scope.Resolver
}

func NewAllowlistService(repo *AllowlistRepository, resolver *scope.Resolver) *AllowlistService {
	return &AllowlistService{repo: repo, resolver: resolver}
}

func (s *AllowlistService) List(ctx context.Context, userID, tenantID, dbName, clientID string) ([]AllowlistEntry, error) {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	return s.repo.List(ctx, resolved, clientID)
}

func (s *AllowlistService) Upsert(ctx context.Context, userID, tenantID, dbName string, req AllowlistRequest) (*AllowlistEntry, error) {
	if strings.TrimSpace(req.ClientID) == "" || len(req.ClientID) > 200 || strings.TrimSpace(req.FilePath) == "" || len(req.FilePath) > 1000 || strings.TrimSpace(req.Detector) == "" || len(req.Detector) > 200 || strings.TrimSpace(req.Redacted) == "" || len(req.Redacted) > 500 {
		return nil, &InvalidInputError{Msg: "client_id, file_path, detector and redacted are required and must fit their database columns"}
	}
	if len(req.Reason) > 1000 {
		return nil, &InvalidInputError{Msg: "reason exceeds 1000 characters"}
	}
	if len(req.DismissedBy) > 200 {
		return nil, &InvalidInputError{Msg: "dismissed_by exceeds 200 characters"}
	}
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	return s.repo.Upsert(ctx, resolved, req)
}

func (s *AllowlistService) Delete(ctx context.Context, userID, tenantID, dbName string, req AllowlistRequest) (bool, error) {
	if strings.TrimSpace(req.ClientID) == "" || len(req.ClientID) > 200 || strings.TrimSpace(req.FilePath) == "" || len(req.FilePath) > 1000 || strings.TrimSpace(req.Detector) == "" || len(req.Detector) > 200 || strings.TrimSpace(req.Redacted) == "" || len(req.Redacted) > 500 {
		return false, &InvalidInputError{Msg: "client_id, file_path, detector and redacted are required and must fit their database columns"}
	}
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return false, err
	}
	return s.repo.Delete(ctx, resolved, req)
}
