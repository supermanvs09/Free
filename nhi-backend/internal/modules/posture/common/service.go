// Package postures is the service layer of the ISPM posture dashboard API. A
// service resolves the tenant from the caller, asks its repository for the
// data and wraps the answer in the documented envelope.
package common

import (
	"context"
	"errors"

	"nhi-backend-api/internal/platform/scope"
)

// Errors the handlers translate into HTTP statuses.
var (
	ErrNotFound        = ErrRecordNotFound
	ErrInvalidCursor   = ErrMalformedCursor
	ErrFindingResolved = ErrResolvedFinding
	ErrConflict        = ErrFindingModified
	// ErrForbidden: the caller's role may not perform the action.
	ErrForbidden = errors.New("this role may not perform this action")
)

// ParamError is a client mistake in a named request field (HTTP 400).
type ParamError struct {
	Field   string
	Message string
}

func (e *ParamError) Error() string { return e.Message }

// base is embedded by every service: tenant resolution and scan metadata.
type Base struct {
	resolver *scope.Resolver
	meta     *MetaRepository
}

func NewBase(resolver *scope.Resolver) Base {
	return Base{resolver: resolver, meta: NewMetaRepository()}
}

func (b Base) Tenant(ctx context.Context, c Caller) (*scope.DataScope, error) {
	return b.resolver.ResolveTenant(ctx, c.UserID, c.TenantID, c.DBName)
}

// ScanMeta returns the latest finished scan of the caller's tenant. Handlers
// use it for the ETag before doing any heavier work.
func (b Base) ScanMeta(ctx context.Context, c Caller) (Meta, error) {
	s, err := b.Tenant(ctx, c)
	if err != nil {
		return Meta{}, err
	}
	return b.meta.ScanMeta(ctx, s)
}

// envelope wraps data with the scan metadata. available says whether the
// source data exists; the data is then empty when it is false.
func (b Base) Envelope(ctx context.Context, s *scope.DataScope, data any, page *Page, window string, available bool) (*Envelope, error) {
	meta, err := b.meta.ScanMeta(ctx, s)
	if err != nil {
		return nil, err
	}
	meta.Window = window
	meta.DataAvailable = available
	return &Envelope{Data: data, Page: page, Meta: meta}, nil
}

func PageOf(next *string, limit int) *Page {
	return &Page{NextCursor: next, Limit: limit}
}

// clampLimit applies the documented bounds: default 50, maximum 100.
func ClampLimit(n int) int {
	if n < 1 {
		return 50
	}
	if n > 100 {
		return 100
	}
	return n
}
