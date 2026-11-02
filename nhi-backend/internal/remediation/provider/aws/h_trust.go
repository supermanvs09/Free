package awsprov

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/accessanalyzer"
	aatypes "github.com/aws/aws-sdk-go-v2/service/accessanalyzer/types"
	"github.com/aws/aws-sdk-go-v2/service/iam"
	smithymw "github.com/aws/smithy-go/middleware"

	"nhi-backend-api/internal/remediation/policydoc"
	"nhi-backend-api/internal/remediation/provider"
)

type trustOpts struct {
	keep          []string
	externalID    string
	orgID         string
	mfa           bool
	oidcPin       bool
	oidcSub       string
	oidcAud       string
	roleAccountID string
}

var accountIDRe = regexp.MustCompile(`^\d{12}$`)

// principalAccount returns the account of an AWS principal ("" for "*").
func principalAccount(p string) string {
	if accountIDRe.MatchString(p) {
		return p
	}
	return accountOf(p)
}

func keepMatches(entry string, keep []string) bool {
	for _, k := range keep {
		switch {
		case entry == k || policydoc.Match(k, entry):
			return true
		case accountIDRe.MatchString(k) && entry != "*" && principalAccount(entry) == k:
			return true
		}
	}
	return false
}

func setCond(s map[string]any, operator, key, value string) {
	cond, _ := s["Condition"].(map[string]any)
	if cond == nil {
		cond = map[string]any{}
	}
	op, _ := cond[operator].(map[string]any)
	if op == nil {
		op = map[string]any{}
	}
	op[key] = value
	cond[operator] = op
	s["Condition"] = cond
}

func principalMap(s map[string]any) map[string]any {
	switch p := s["Principal"].(type) {
	case string:
		return map[string]any{"AWS": p}
	case map[string]any:
		out := map[string]any{}
		for k, v := range p {
			out[k] = v
		}
		return out
	}
	return nil
}

// transformTrust rewrites a trust policy. Service principals are never removed.
func transformTrust(d *policydoc.Doc, o trustOpts) (*policydoc.Doc, error) {
	out := d.Clone()
	var kept []map[string]any
	for _, s := range out.Statements {
		if !policydoc.IsAllow(s) {
			kept = append(kept, s)
			continue
		}
		pm := principalMap(s)
		if pm == nil {
			kept = append(kept, s)
			continue
		}
		awsList, svc, fed := policydoc.Strings(pm["AWS"]), policydoc.Strings(pm["Service"]), policydoc.Strings(pm["Federated"])
		if len(o.keep) > 0 {
			var filtered []string
			for _, e := range awsList {
				if keepMatches(e, o.keep) {
					filtered = append(filtered, e)
				}
			}
			awsList = filtered
		}
		if len(awsList) == 0 && len(svc) == 0 && len(fed) == 0 && len(pm) <= 3 && pm["CanonicalUser"] == nil {
			continue // nobody left in this statement
		}
		np := map[string]any{}
		if len(awsList) > 0 {
			np["AWS"] = policydoc.NewList(awsList)
		}
		if len(svc) > 0 {
			np["Service"] = policydoc.NewList(svc)
		}
		if len(fed) > 0 {
			np["Federated"] = policydoc.NewList(fed)
		}
		if cu := pm["CanonicalUser"]; cu != nil {
			np["CanonicalUser"] = cu
		}
		s["Principal"] = np
		if len(awsList) > 0 {
			// conditions only for principals outside the role's own account
			external := false
			for _, e := range awsList {
				if e == "*" || principalAccount(e) != o.roleAccountID {
					external = true
				}
			}
			if external || len(o.keep) == 0 {
				if o.externalID != "" {
					setCond(s, "StringEquals", "sts:ExternalId", o.externalID)
				}
				if o.orgID != "" {
					setCond(s, "StringEquals", "aws:PrincipalOrgID", o.orgID)
				}
			}
			if o.mfa {
				setCond(s, "Bool", "aws:MultiFactorAuthPresent", "true")
			}
		}
		if o.oidcPin {
			for _, f := range fed {
				i := strings.Index(f, "oidc-provider/")
				if i < 0 {
					continue
				}
				host := f[i+len("oidc-provider/"):]
				if o.oidcAud != "" {
					setCond(s, "StringEquals", host+":aud", o.oidcAud)
				}
				if o.oidcSub != "" {
					op := "StringEquals"
					if policydoc.IsWildcard(o.oidcSub) {
						op = "StringLike"
					}
					setCond(s, op, host+":sub", o.oidcSub)
				}
			}
		}
		kept = append(kept, s)
	}
	out.Statements = kept
	return out, nil
}

// externalAWSPrincipals lists AWS principals outside the role's account (or "*").
func externalAWSPrincipals(d *policydoc.Doc, roleAccount string) []string {
	var out []string
	for _, s := range d.Statements {
		if !policydoc.IsAllow(s) {
			continue
		}
		pm := principalMap(s)
		for _, e := range policydoc.Strings(pm["AWS"]) {
			if e == "*" || principalAccount(e) != roleAccount {
				out = append(out, e)
			}
		}
	}
	return out
}

type rewriteTrust struct{}

func (h *rewriteTrust) writeActions() []string               { return []string{"iam:UpdateAssumeRolePolicy"} }
func (h *rewriteTrust) resources(t provider.Target) []string { return []string{t.TargetARN} }

func trustOptsFrom(p map[string]any, roleAccount string) trustOpts {
	return trustOpts{
		keep: strs(p, "keep_principals"), externalID: str(p, "external_id"), orgID: str(p, "org_id"),
		mfa: boolean(p, "require_mfa"), oidcPin: boolean(p, "oidc_pin"), oidcSub: str(p, "oidc_sub"), oidcAud: str(p, "oidc_aud"),
		roleAccountID: roleAccount,
	}
}

func (h *rewriteTrust) plan(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) error {
	roleARN := in.TargetARN
	if roleARN == "" {
		roleARN = str(in.Params, "role_arn")
	}
	pc.out.TargetARN, pc.out.TargetType = roleARN, "iam_role"
	pc.out.Params["role_arn"] = roleARN
	name, ok := roleChecks(ctx, c, in.Target, pc, roleARN)
	if !ok {
		return nil
	}
	pc.out.Vars["role_name"], pc.out.Vars["role_arn"] = name, roleARN
	role, err := c.IAM.GetRole(ctx, &iam.GetRoleInput{RoleName: aws.String(name)})
	if err != nil {
		pc.block("role readable", err.Error())
		return nil
	}
	before, err := policydoc.Parse(aws.ToString(role.Role.AssumeRolePolicyDocument))
	if err != nil {
		pc.block("trust policy readable", err.Error())
		return nil
	}
	pc.out.Before = map[string]any{"role_arn": roleARN, "trust_policy": before.Map()}
	if role.Role.RoleLastUsed != nil && role.Role.RoleLastUsed.LastUsedDate != nil {
		pc.out.UsageBasis = map[string]any{"source": "iam:GetRole RoleLastUsed", "last_used": role.Role.RoleLastUsed.LastUsedDate,
			"region": aws.ToString(role.Role.RoleLastUsed.Region)}
	}

	opts := trustOptsFrom(in.Params, in.Account.AccountID)
	if opts.oidcPin && opts.oidcSub == "" {
		pc.block("OIDC subject", "send oidc_sub (and oidc_aud): the subject the workload really uses, e.g. repo:org/repo:ref:refs/heads/main")
		return nil
	}
	after, err := transformTrust(before, opts)
	if err != nil {
		pc.block("trust rewrite", err.Error())
		return nil
	}
	diff := policydoc.Diff(before, after)
	if len(diff) == 0 {
		pc.block("change needed", "nothing to change: send keep_principals (who may assume the role) and/or add_external_id, org_id, require_mfa, oidc_pin")
		return nil
	}
	if len(after.Statements) == 0 {
		pc.block("a principal remains", "the new trust policy would allow nobody to assume the role")
		return nil
	}
	pc.pass("service principals kept", "service principals of bound workloads are never removed")
	if ext := externalAWSPrincipals(before, in.Account.AccountID); len(ext) > 0 {
		pc.out.Flags.ExternalPrincipals = true
		pc.warn("external principals", fmt.Sprintf("%d principal(s) outside the account today: %s", len(ext), strings.Join(ext, ", ")))
	}
	if lu, ok := pc.out.UsageBasis["last_used"].(*time.Time); ok && lu != nil && time.Since(*lu) < 30*24*time.Hour && len(opts.keep) > 0 {
		pc.warn("role in use", "the role was used in the last 30 days: confirm keep_principals contains every principal that really assumes it")
	}
	if c.Analyzer != nil {
		v, err := c.Analyzer.ValidatePolicy(ctx, &accessanalyzer.ValidatePolicyInput{PolicyDocument: aws.String(after.JSON()),
			PolicyType: aatypes.PolicyTypeResourcePolicy, ValidatePolicyResourceType: aatypes.ValidatePolicyResourceTypeRoleTrust})
		if err != nil {
			pc.warn("policy validation", "Access Analyzer ValidatePolicy unavailable: "+err.Error())
		} else {
			errs := 0
			for _, f := range v.Findings {
				if f.FindingType == aatypes.ValidatePolicyFindingTypeError {
					errs++
				}
			}
			if errs > 0 {
				pc.block("policy validation", fmt.Sprintf("%d error(s) from Access Analyzer", errs))
			} else {
				pc.pass("policy validation", "no errors")
			}
		}
	}
	if opts.externalID != "" {
		pc.out.Vars["external_id"] = opts.externalID
	}
	pc.out.After = map[string]any{"role_arn": roleARN, "trust_policy": after.Map()}
	pc.out.Diff = diff
	return nil
}

func (h *rewriteTrust) state(ctx context.Context, c *Clients, t provider.Target) (map[string]any, error) {
	name, err := roleName(t.TargetARN)
	if err != nil {
		return nil, err
	}
	role, err := c.IAM.GetRole(ctx, &iam.GetRoleInput{RoleName: aws.String(name)})
	if err != nil {
		return nil, err
	}
	d, err := policydoc.Parse(aws.ToString(role.Role.AssumeRolePolicyDocument))
	if err != nil {
		return nil, err
	}
	return map[string]any{"role_arn": t.TargetARN, "trust_policy": d.Map()}, nil
}

func (h *rewriteTrust) apply(ctx context.Context, c *Clients, r *run) error {
	name, err := roleName(r.t.TargetARN)
	if err != nil {
		return err
	}
	before, err := docOf(r.before, "trust_policy")
	if err != nil {
		return err
	}
	after, err := docOf(r.in.After, "trust_policy")
	if err != nil {
		return err
	}
	r.snap = map[string]any{"role_name": name, "trust_policy": before.Map()}
	if err := r.do("write the new trust policy", "iam:UpdateAssumeRolePolicy", func() (smithymw.Metadata, error) {
		o, err := c.IAM.UpdateAssumeRolePolicy(ctx, &iam.UpdateAssumeRolePolicyInput{RoleName: aws.String(name), PolicyDocument: aws.String(after.JSON())})
		return mdOf(o, err)
	}); err != nil {
		return err
	}
	r.result_["trust_policy_updated"] = true
	return nil
}

func (h *rewriteTrust) verify(ctx context.Context, c *Clients, r *run) (map[string]any, error) {
	cur, err := h.state(ctx, c, r.t)
	if err != nil {
		return nil, err
	}
	curDoc, _ := docOf(cur, "trust_policy")
	want, err := docOf(r.in.After, "trust_policy")
	if err != nil {
		return nil, err
	}
	return map[string]any{"verified": curDoc != nil && policydoc.Hash(curDoc.Map()) == policydoc.Hash(want.Map())}, nil
}

func (h *rewriteTrust) rollback(ctx context.Context, c *Clients, r *run, snap map[string]any) error {
	doc, err := docOf(snap, "trust_policy")
	if err != nil {
		return err
	}
	return r.do("restore the previous trust policy", "iam:UpdateAssumeRolePolicy", func() (smithymw.Metadata, error) {
		o, err := c.IAM.UpdateAssumeRolePolicy(ctx, &iam.UpdateAssumeRolePolicyInput{RoleName: aws.String(str(snap, "role_name")), PolicyDocument: aws.String(doc.JSON())})
		return mdOf(o, err)
	})
}
