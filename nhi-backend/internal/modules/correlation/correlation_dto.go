// Package correlation serves the correlation engine's API: blast radius, access
// graph, paths between identities and resources, the rule catalogue and the run
// queue. It is one self-contained feature: the engine lives in the engine
// sub-package, and routes.go and main.go only hold a handler and a poller.
//
// Six endpoints, all tenant-wide (the tenant comes from the JWT, never from the
// request):
//
//	GET  /correlation/catalog       rules, composition rules, path types, families
//	GET  /correlation/blast-radius  what one identity can reach
//	GET  /correlation/graph         one step around an identity; depth adds who can assume it
//	GET  /correlation/paths         from an identity to a target, or who can reach a resource
//	POST /correlation/runs          queue a recompute
//	GET  /correlation/runs          one run (?id=) or the list
package correlation

import (
	"errors"
	"regexp"

	"nhi-backend-api/internal/modules/correlation/engine"
)

// Error codes of the correlation API. They are the same as the posture and
// remediation APIs use, so a client parses every error it can receive.
const (
	codeInvalid      = "invalid_parameter"
	codeUnauthorized = "unauthorized"
	codeNotFound     = "not_found"
	codeRateLimited  = "rate_limited"
	codeTimeout      = "timeout"
	codeInternal     = "internal"
)

// Catalog sections, in the order they are returned.
const (
	sectionRules       = "rules"
	sectionComposition = "composition_rules"
	sectionPathTypes   = "path_types"
	sectionFamilies    = "families"
)

var catalogSections = []string{sectionRules, sectionComposition, sectionPathTypes, sectionFamilies}

// Bounds shared by the handlers.
const (
	maxGraphLimit = 200
	maxDepth      = 5
	maxRunsLimit  = 200
	maxCategory   = 100
	maxBodyBytes  = 1 << 16
)

var (
	uuidRe    = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	serviceRe = regexp.MustCompile(`^[a-z0-9._-]{1,64}$`)
)

// runStatuses are the values of correlation_engine_runs.status.
var runStatuses = map[string]bool{"pending": true, "running": true, "completed": true, "failed": true}

// Errors the service raises beyond the engine's own.
var (
	// errTimeout: a computation used up its time budget.
	errTimeout = errors.New("the computation exceeded its time budget")
)

// ── Responses ─────────────────────────────────────────────────────────────────

type envelope struct {
	Data any `json:"data"`
}

type errorEnvelope struct {
	Error errorBody `json:"error"`
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Field   string `json:"field,omitempty"`
}

// paramError is a request the caller got wrong; it answers 400 for one field.
type paramError struct{ Field, Message string }

func (e *paramError) Error() string { return e.Field + ": " + e.Message }

// FamiliesBlock is the catalog's families section.
type FamiliesBlock struct {
	Total    int                 `json:"total"`
	ByStatus map[string]int      `json:"by_status"`
	Items    []engine.FamilyInfo `json:"items"`
}

// GraphResponse is one step of the graph around an identity. Inbound is set
// when ?depth= asked for the roles that can reach it through chains.
type GraphResponse struct {
	*engine.NavView
	Inbound *engine.InboundResult `json:"inbound,omitempty"`
}

// PathsResponse lists explained paths. Mode "forward" runs from From to To;
// mode "reverse" lists every identity that can reach To (From is empty).
type PathsResponse struct {
	Mode  string                   `json:"mode"`
	From  string                   `json:"from,omitempty"`
	To    string                   `json:"to"`
	Total int                      `json:"total"`
	Paths []engine.BlastRadiusPath `json:"paths"`
}

// RunQueued answers a request that was handed to the run queue: POST /runs, or
// a blast radius that did not finish within its time budget.
type RunQueued struct {
	Run *engine.Run `json:"run"`
}

// RunsList is the GET /runs list.
type RunsList struct {
	Total int          `json:"total"`
	Runs  []engine.Run `json:"runs"`
}

// RunRequest is the POST /runs body. Refresh defaults to true: a queued run
// exists to recompute, so it bypasses the cache unless told otherwise.
type RunRequest struct {
	ARN     string `json:"arn"`
	Refresh *bool  `json:"refresh"`
}
