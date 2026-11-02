// Package provider defines the contract between the platform-agnostic
// remediation engine (decides WHAT) and a platform provider (knows HOW).
// Only the AWS provider exists today; Azure / GitHub would implement the same
// interface.
package provider

import (
	"context"
	"time"

	"nhi-backend-api/internal/remediation/domain"
)

// Target identifies what a plan changes. It is the generic input of every
// remediation function: it works for any identity in any account.
type Target struct {
	TenantID   string
	Account    domain.Account // role / external id / regions of the account
	Region     string
	ActionType string
	TargetARN  string
	TargetType string
	Params     map[string]any
}

type PlanInput struct {
	Target
	Findings        []domain.Finding
	UsageWindowDays int
	MinKeyIdleDays  int
}

// Flags raise the number of approvals (design section 6: 2 approvers for
// admin / external / key-policy changes).
type Flags struct {
	AdminRemoval       bool
	ExternalPrincipals bool
	KeyPolicy          bool
}

func (f Flags) NeedsTwoApprovers() bool { return f.AdminRemoval || f.ExternalPrincipals || f.KeyPolicy }

type PlanOutput struct {
	TargetARN  string
	TargetType string
	Params     map[string]any // normalized parameters, stored with the plan
	Before     map[string]any // stable live state (hashed for the drift check)
	After      map[string]any // proposed state
	Diff       []domain.DiffEntry
	Prechecks  []domain.Precheck
	UsageBasis map[string]any
	Vars       map[string]string // values for the guided step templates
	Flags      Flags
	Risk       domain.Risk // "" = catalog default
}

type RunInput struct {
	Target
	PlanID      string
	ExecutionID string
	SessionName string
	Before      map[string]any // before_state of the plan
	After       map[string]any // after_state of the plan
	Result      map[string]any // result of the EXECUTE execution (verify, finalize)
	DryRun      bool
}

// RunResult is what Execute / Rollback / Finalize return. Steps are logged
// even when err != nil, so the audit trail shows how far the call got.
type RunResult struct {
	Steps         []domain.StepLog
	RollbackState map[string]any // snapshot taken before the first change
	Result        map[string]any // what changed (never contains key material)
	AssumedRole   string
	OneTime       map[string]string `json:"-"` // shown once to the caller, never stored (new key material)
}

type RollbackInput struct {
	RunInput
	RollbackState map[string]any
}

type FinalizeInput struct {
	RunInput
	ExecResult map[string]any // result of the EXECUTE execution
}

type FinalizeOutcome struct {
	Done     bool
	Detail   string
	Run      *RunResult
	NextPlan *FollowUp // optional follow-up plan (e.g. delete the old key)
}

type FollowUp struct {
	ActionType string
	TargetARN  string
	TargetType string
	Params     map[string]any
	Reason     string
}

type AccessReport struct {
	Status string // OK | CANNOT_ASSUME | MISSING_PERMISSIONS
	Detail string
	At     time.Time
}

type Provider interface {
	Platform() string
	// Plan reads live state (read-only), builds before/after, diff, pre-checks.
	Plan(ctx context.Context, in PlanInput) (*PlanOutput, error)
	// LiveState re-reads the stable live state; the engine hashes it to detect drift.
	LiveState(ctx context.Context, t Target) (map[string]any, error)
	// Execute snapshots "before", applies every step, returns the request IDs.
	// On a failed step it undoes the steps already applied (all-or-nothing per plan).
	Execute(ctx context.Context, in RunInput) (*RunResult, error)
	// Verify re-reads the platform and confirms the change took effect.
	Verify(ctx context.Context, in RunInput) (map[string]any, error)
	// Rollback applies the snapshot saved by Execute.
	Rollback(ctx context.Context, in RollbackInput) (*RunResult, error)
	// ValidateAccess checks the remediation role can be assumed and has the permissions.
	ValidateAccess(ctx context.Context, acct domain.Account) AccessReport
	// SessionPolicy-relevant info: IAM-style actions of an action type.
	Supports(actionType string) bool
}

// Finalizer is implemented by providers with two-phase actions
// (rotate_access_key: create + deliver, later deactivate the old key).
type Finalizer interface {
	Finalize(ctx context.Context, in FinalizeInput) (*FinalizeOutcome, error)
}

// Registry maps a platform name to its provider.
type Registry struct{ m map[string]Provider }

func NewRegistry(ps ...Provider) *Registry {
	r := &Registry{m: map[string]Provider{}}
	for _, p := range ps {
		r.m[p.Platform()] = p
	}
	return r
}

func (r *Registry) Get(platform string) (Provider, bool) {
	p, ok := r.m[platform]
	return p, ok
}
