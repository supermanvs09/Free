package common

import (
	"errors"
	"fmt"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/store"
)

// Errors the handlers translate into HTTP statuses. The engine's own errors
// (*engine.Error) already carry their status.
var (
	// ErrForbidden: the caller's role may not perform the action.
	ErrForbidden = errors.New("this role may not perform this action")
	// ErrNotFound: wrapped by repositories, e.g. "plan: not found".
	ErrNotFound = store.ErrNotFound
)

// ParamError is a client mistake in a named request field (HTTP 400).
type ParamError struct {
	Field   string
	Message string
}

func (e *ParamError) Error() string { return e.Message }

// Require returns ErrForbidden when the caller's role lacks the permission.
func Require(c Caller, p domain.Permission) error {
	if !c.Can(p) {
		return fmt.Errorf("%w: role %q may not %s", ErrForbidden, RoleOf(c.Role), p)
	}
	return nil
}

// NotFound turns a store not-found error into "<what> not found".
func NotFound(what string, err error) error {
	if errors.Is(err, store.ErrNotFound) {
		return fmt.Errorf("%s %w", what, store.ErrNotFound)
	}
	return err
}

// ClampLimit applies bounds to a list size: default def, maximum max.
func ClampLimit(n, def, max int) int {
	if n < 1 {
		return def
	}
	if n > max {
		return max
	}
	return n
}
