// Package awsprov is the AWS provider of the remediation engine: it knows HOW
// to read and change IAM, KMS and Secrets Manager resources in a customer
// account through the account's remediation role.
package awsprov

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/aws/arn"
	"github.com/aws/aws-sdk-go-v2/aws/middleware"
	"github.com/aws/aws-sdk-go-v2/service/accessanalyzer"
	"github.com/aws/aws-sdk-go-v2/service/iam"
	"github.com/aws/aws-sdk-go-v2/service/kms"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"
	smithymw "github.com/aws/smithy-go/middleware"

	"nhi-backend-api/internal/platform/awsconnect"
	"nhi-backend-api/internal/remediation/catalog"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/policydoc"
	"nhi-backend-api/internal/remediation/provider"
)

// ClientFactory builds the service clients for an account. The default talks
// to AWS; tests inject fakes.
type ClientFactory func(ctx context.Context, acct domain.Account, region, sessionName, sessionPolicy string) (*Clients, error)

type Options struct {
	UsageWindowDays int
	MinKeyIdleDays  int
	// PollInterval / PollTimeout drive the waits (Access Advisor job, secret rotation).
	PollInterval time.Duration
	PollTimeout  time.Duration
}

type Provider struct {
	factory   ClientFactory
	opts      Options
	handlers  map[string]handler
	defRegion string
}

// New returns the AWS provider using real AWS credentials.
func New(f *awsconnect.Factory, opts Options) *Provider {
	p := newProvider(opts)
	p.defRegion = f.DefaultRegion
	p.factory = func(ctx context.Context, acct domain.Account, region, sessionName, sessionPolicy string) (*Clients, error) {
		cfg, err := f.Config(ctx, awsconnect.Role{ARN: acct.RoleARN, ExternalID: acct.ExternalID}, region, sessionName, sessionPolicy)
		if err != nil {
			return nil, err
		}
		return &Clients{
			IAM: iam.NewFromConfig(cfg), KMS: kms.NewFromConfig(cfg), Secrets: secretsmanager.NewFromConfig(cfg),
			Analyzer: accessanalyzer.NewFromConfig(cfg), Region: cfg.Region,
		}, nil
	}
	return p
}

// NewWithFactory is for tests.
func NewWithFactory(factory ClientFactory, defaultRegion string, opts Options) *Provider {
	p := newProvider(opts)
	p.factory, p.defRegion = factory, defaultRegion
	return p
}

func newProvider(opts Options) *Provider {
	if opts.UsageWindowDays <= 0 {
		opts.UsageWindowDays = 90
	}
	if opts.MinKeyIdleDays <= 0 {
		opts.MinKeyIdleDays = 7
	}
	if opts.PollInterval <= 0 {
		opts.PollInterval = 2 * time.Second
	}
	if opts.PollTimeout <= 0 {
		opts.PollTimeout = 90 * time.Second
	}
	p := &Provider{opts: opts}
	p.handlers = map[string]handler{
		catalog.ScopePolicy:          &policyEdit{kind: catalog.ScopePolicy},
		catalog.RemoveStatement:      &policyEdit{kind: catalog.RemoveStatement},
		catalog.ReplaceManagedPolicy: &replaceManaged{},
		catalog.DeactivateKey:        &keyStatus{kind: catalog.DeactivateKey},
		catalog.DeleteKey:            &keyStatus{kind: catalog.DeleteKey},
		catalog.RotateAccessKey:      &rotateKey{},
		catalog.RewriteTrust:         &rewriteTrust{},
		catalog.SetSessionDuration:   &sessionDuration{},
		catalog.UpdateKeyPolicy:      &keyPolicy{},
		catalog.RevokeGrant:          &revokeGrant{},
		catalog.EnableKeyRotation:    &keyRotation{},
		catalog.UpdateSecretPolicy:   &secretPolicy{},
		catalog.RotateSecret:         &rotateSecret{},
	}
	return p
}

func (p *Provider) Platform() string            { return "aws" }
func (p *Provider) Supports(action string) bool { _, ok := p.handlers[action]; return ok }

// handler is one action type.
type handler interface {
	// plan fills the PlanOutput from live state (read only).
	plan(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) error
	// state returns the stable live state; it is hashed for the drift check.
	state(ctx context.Context, c *Clients, t provider.Target) (map[string]any, error)
	// apply changes AWS. It registers undo functions with r.undoWith.
	apply(ctx context.Context, c *Clients, r *run) error
	verify(ctx context.Context, c *Clients, r *run) (map[string]any, error)
	rollback(ctx context.Context, c *Clients, r *run, snap map[string]any) error
	// resources are the ARNs the write permissions are limited to (session policy).
	resources(t provider.Target) []string
	// writeActions are the IAM actions the execution needs.
	writeActions() []string
}

// ---- planning context ----

type planCtx struct {
	out    *provider.PlanOutput
	region string
}

func newPlanCtx() *planCtx {
	return &planCtx{out: &provider.PlanOutput{
		Params: map[string]any{}, Before: map[string]any{}, After: map[string]any{},
		UsageBasis: map[string]any{}, Vars: map[string]string{},
	}}
}

func (pc *planCtx) check(name string, res domain.PrecheckResult, detail string) {
	pc.out.Prechecks = append(pc.out.Prechecks, domain.Precheck{Name: name, Result: res, Detail: detail})
}
func (pc *planCtx) pass(name, detail string)  { pc.check(name, domain.CheckPass, detail) }
func (pc *planCtx) warn(name, detail string)  { pc.check(name, domain.CheckWarn, detail) }
func (pc *planCtx) block(name, detail string) { pc.check(name, domain.CheckBlock, detail) }

// ---- Provider methods ----

func (p *Provider) handlerFor(action string) (handler, error) {
	h, ok := p.handlers[action]
	if !ok {
		return nil, fmt.Errorf("action %q is not supported by the AWS provider", action)
	}
	return h, nil
}

func (p *Provider) regionOf(t provider.Target) string {
	cands := []string{t.TargetARN, str(t.Params, "key_id"), str(t.Params, "secret_id")}
	for _, c := range cands {
		if strings.HasPrefix(c, "arn:") {
			if a, err := arn.Parse(c); err == nil && a.Region != "" {
				return a.Region
			}
		}
	}
	if t.Region != "" {
		return t.Region
	}
	if len(t.Account.EnabledRegions) > 0 {
		return t.Account.EnabledRegions[0]
	}
	return p.defRegion
}

// sessionPolicy limits an execution session to the write actions of the
// action type on the target resources; reads stay broad but never include
// secret values.
func sessionPolicy(writeActions, resources []string) string {
	stmts := []map[string]any{
		{"Effect": "Allow", "Action": []string{"iam:Get*", "iam:List*", "iam:Generate*", "kms:Describe*", "kms:Get*", "kms:List*",
			"secretsmanager:Describe*", "secretsmanager:GetResourcePolicy", "secretsmanager:List*", "access-analyzer:ValidatePolicy"}, "Resource": "*"},
	}
	if len(writeActions) > 0 && len(resources) > 0 {
		stmts = append(stmts, map[string]any{"Effect": "Allow", "Action": writeActions, "Resource": resources})
	}
	b, _ := json.Marshal(map[string]any{"Version": "2012-10-17", "Statement": stmts})
	return string(b)
}

func readOnlyPolicy() string { return sessionPolicy(nil, nil) }

func (p *Provider) clients(ctx context.Context, t provider.Target, session string, h handler, write bool) (*Clients, error) {
	pol := readOnlyPolicy()
	if write && h != nil {
		pol = sessionPolicy(h.writeActions(), h.resources(t))
	}
	return p.factory(ctx, t.Account, p.regionOf(t), awsconnect.SessionName(session), pol)
}

func (p *Provider) Plan(ctx context.Context, in provider.PlanInput) (*provider.PlanOutput, error) {
	h, err := p.handlerFor(in.ActionType)
	if err != nil {
		return nil, err
	}
	c, err := p.clients(ctx, in.Target, "plan-"+in.TenantID[:min(8, len(in.TenantID))], h, false)
	if err != nil {
		return nil, err
	}
	pc := newPlanCtx()
	pc.region = c.Region
	pc.out.Params = copyMap(in.Params)
	pc.out.TargetARN, pc.out.TargetType = in.TargetARN, in.TargetType
	if in.UsageWindowDays <= 0 {
		in.UsageWindowDays = p.opts.UsageWindowDays
	}
	if in.MinKeyIdleDays <= 0 {
		in.MinKeyIdleDays = p.opts.MinKeyIdleDays
	}
	if err := h.plan(withPoll(ctx, p.opts), c, in, pc); err != nil {
		return nil, err
	}
	return pc.out, nil
}

func (p *Provider) LiveState(ctx context.Context, t provider.Target) (map[string]any, error) {
	h, err := p.handlerFor(t.ActionType)
	if err != nil {
		return nil, err
	}
	c, err := p.clients(ctx, t, "state", h, false)
	if err != nil {
		return nil, err
	}
	return h.state(withPoll(ctx, p.opts), c, t)
}

func (p *Provider) Execute(ctx context.Context, in provider.RunInput) (*provider.RunResult, error) {
	h, err := p.handlerFor(in.ActionType)
	if err != nil {
		return nil, err
	}
	c, err := p.clients(ctx, in.Target, in.SessionName, h, true)
	if err != nil {
		return &provider.RunResult{}, err
	}
	ctx = withPoll(ctx, p.opts)
	r := newRun(in.Target, in)
	r.res.AssumedRole = in.Account.RoleARN
	if err := h.apply(ctx, c, r); err != nil {
		r.runUndo(ctx)
		return r.result(), err
	}
	return r.result(), nil
}

func (p *Provider) Verify(ctx context.Context, in provider.RunInput) (map[string]any, error) {
	h, err := p.handlerFor(in.ActionType)
	if err != nil {
		return nil, err
	}
	c, err := p.clients(ctx, in.Target, in.SessionName, h, false)
	if err != nil {
		return nil, err
	}
	return h.verify(withPoll(ctx, p.opts), c, newRun(in.Target, in))
}

func (p *Provider) Rollback(ctx context.Context, in provider.RollbackInput) (*provider.RunResult, error) {
	h, err := p.handlerFor(in.ActionType)
	if err != nil {
		return nil, err
	}
	c, err := p.clients(ctx, in.Target, in.SessionName, h, true)
	if err != nil {
		return &provider.RunResult{}, err
	}
	r := newRun(in.Target, in.RunInput)
	r.res.AssumedRole = in.Account.RoleARN
	if err := h.rollback(withPoll(ctx, p.opts), c, r, in.RollbackState); err != nil {
		return r.result(), err
	}
	return r.result(), nil
}

// Finalize implements provider.Finalizer.
func (p *Provider) Finalize(ctx context.Context, in provider.FinalizeInput) (*provider.FinalizeOutcome, error) {
	if in.ActionType != catalog.RotateAccessKey {
		return nil, fmt.Errorf("action %q has no finalize phase", in.ActionType)
	}
	h := p.handlers[in.ActionType].(*rotateKey)
	c, err := p.clients(ctx, in.Target, in.SessionName, h, true)
	if err != nil {
		return nil, err
	}
	r := newRun(in.Target, in.RunInput)
	r.res.AssumedRole = in.Account.RoleARN
	out, err := h.finalize(ctx, c, r, in.ExecResult)
	if out != nil {
		out.Run = r.result()
	}
	return out, err
}

var _ provider.Provider = (*Provider)(nil)
var _ provider.Finalizer = (*Provider)(nil)

// ---- run machinery: step log + undo stack ----

type run struct {
	t       provider.Target
	in      provider.RunInput
	before  map[string]any
	dry     bool
	res     provider.RunResult
	undos   []undoStep
	snap    map[string]any
	result_ map[string]any
}

type undoStep struct {
	name string
	fn   func(ctx context.Context) error
}

func newRun(t provider.Target, in provider.RunInput) *run {
	return &run{t: t, in: in, before: in.Before, dry: in.DryRun, snap: map[string]any{}, result_: map[string]any{}}
}

func (r *run) result() *provider.RunResult {
	r.res.RollbackState = r.snap
	r.res.Result = r.result_
	return &r.res
}

// do runs one provider call and logs it with the AWS request id.
func (r *run) do(step, api string, fn func() (smithymw.Metadata, error)) error {
	rec := domain.StepLog{Step: step, API: api, At: time.Now().UTC()}
	if r.dry {
		rec.Status = "SKIPPED"
		r.res.Steps = append(r.res.Steps, rec)
		return nil
	}
	md, err := fn()
	rec.RequestID = requestID(md)
	if err != nil {
		rec.Status, rec.Error = "FAILED", err.Error()
		r.res.Steps = append(r.res.Steps, rec)
		return fmt.Errorf("%s: %w", step, err)
	}
	rec.Status = "OK"
	r.res.Steps = append(r.res.Steps, rec)
	return nil
}

func (r *run) undoWith(name string, fn func(ctx context.Context) error) {
	r.undos = append(r.undos, undoStep{name, fn})
}

// runUndo reverses the applied steps of this plan, newest first.
func (r *run) runUndo(ctx context.Context) {
	for i := len(r.undos) - 1; i >= 0; i-- {
		u := r.undos[i]
		rec := domain.StepLog{Step: "undo: " + u.name, API: "undo", At: time.Now().UTC(), Status: "UNDONE"}
		if r.dry {
			rec.Status = "SKIPPED"
		} else if err := u.fn(ctx); err != nil {
			rec.Status, rec.Error = "FAILED", err.Error()
		}
		r.res.Steps = append(r.res.Steps, rec)
	}
	r.undos = nil
}

func requestID(md smithymw.Metadata) string {
	id, _ := middleware.GetRequestIDMetadata(md)
	return id
}

// ---- small helpers ----

type pollCfg struct{ interval, timeout time.Duration }
type pollKey struct{}

func withPoll(ctx context.Context, o Options) context.Context {
	return context.WithValue(ctx, pollKey{}, pollCfg{o.PollInterval, o.PollTimeout})
}
func pollOf(ctx context.Context) pollCfg {
	if p, ok := ctx.Value(pollKey{}).(pollCfg); ok {
		return p
	}
	return pollCfg{2 * time.Second, 90 * time.Second}
}

// waitFor polls fn until it returns true or the timeout passes.
func waitFor(ctx context.Context, fn func() (bool, error)) (bool, error) {
	pc := pollOf(ctx)
	deadline := time.Now().Add(pc.timeout)
	for {
		ok, err := fn()
		if err != nil {
			return false, err
		}
		if ok {
			return true, nil
		}
		if time.Now().After(deadline) {
			return false, nil
		}
		select {
		case <-ctx.Done():
			return false, ctx.Err()
		case <-time.After(pc.interval):
		}
	}
}

func copyMap(m map[string]any) map[string]any {
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

func str(m map[string]any, k string) string {
	if v, ok := m[k]; ok {
		switch t := v.(type) {
		case string:
			return t
		case fmt.Stringer:
			return t.String()
		}
	}
	return ""
}

func boolean(m map[string]any, k string) bool {
	switch t := m[k].(type) {
	case bool:
		return t
	case string:
		return strings.EqualFold(t, "true")
	}
	return false
}

func integer(m map[string]any, k string, def int) int {
	switch t := m[k].(type) {
	case float64:
		return int(t)
	case int:
		return t
	case int64:
		return int(t)
	case json.Number:
		n, _ := t.Int64()
		return int(n)
	}
	return def
}

func strs(m map[string]any, k string) []string { return policydoc.Strings(m[k]) }

func roleName(roleARN string) (string, error) {
	a, err := arn.Parse(roleARN)
	if err != nil || !strings.HasPrefix(a.Resource, "role/") {
		return "", fmt.Errorf("%q is not an IAM role ARN", roleARN)
	}
	parts := strings.Split(a.Resource, "/")
	return parts[len(parts)-1], nil
}

func rolePath(roleARN string) string {
	a, err := arn.Parse(roleARN)
	if err != nil {
		return ""
	}
	r := strings.TrimPrefix(a.Resource, "role")
	i := strings.LastIndex(r, "/")
	if i <= 0 {
		return "/"
	}
	return r[:i+1]
}

func userARN(account, name string) string {
	return fmt.Sprintf("arn:aws:iam::%s:user/%s", account, name)
}

func accountOf(a string) string {
	p, err := arn.Parse(a)
	if err != nil {
		return ""
	}
	return p.AccountID
}

func isNotFound(err error) bool {
	var ae interface{ ErrorCode() string }
	if errors.As(err, &ae) {
		switch ae.ErrorCode() {
		case "NoSuchEntity", "NoSuchEntityException", "ResourceNotFoundException", "NotFoundException":
			return true
		}
	}
	return false
}

func isDenied(err error) bool {
	var ae interface{ ErrorCode() string }
	if errors.As(err, &ae) {
		c := ae.ErrorCode()
		return c == "AccessDenied" || c == "AccessDeniedException" || c == "UnauthorizedOperation"
	}
	return false
}

func tostr(p *string) string { return aws.ToString(p) }

func toAnyMap(s string) map[string]any {
	var m map[string]any
	_ = json.Unmarshal([]byte(s), &m)
	return m
}

func jsonString(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// guard against unknown handler panics in logs
var _ = tostr

func diffField(path string, before, after any) domain.DiffEntry {
	return domain.DiffEntry{Path: path, Change: "changed", Before: before, After: after}
}
