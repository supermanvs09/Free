package awsprov

// Reme11 / Reme12 / Reme14: roles and policy versions.
//
//	quarantine_role         IAM-22, IAM-23  inline policy ISPMQuarantine: Deny * on *
//	deny_iam_escalation     IAM-11, 12, 13  inline policy ISPMDenyIAMEscalation: Deny the IAM write
//	                                        actions a role can use to give itself more permissions
//	deny_escalation         IAM-12, 13      inline policy ISPMDenyEscalation: Deny only the actions
//	                                        the finding names (params.actions)
//	restore_policy_version  BEH-09          SetDefaultPolicyVersion back to the approved / previous version
//
// Nothing is deleted: rollback removes the inline policy, or sets the previous default version again.

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/iam"
	smithymw "github.com/aws/smithy-go/middleware"

	"nhi-backend-api/internal/remediation/catalog"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/policydoc"
	"nhi-backend-api/internal/remediation/provider"
)

// iamEscalationActions are the IAM writes a role can use to grant itself (or a new identity) more
// permissions: edit / attach policies, new policy versions, new roles / users / keys, trust and
// permission-boundary changes. iam:DeleteRolePolicy is included so the role cannot remove the Deny.
var iamEscalationActions = []string{
	"iam:AttachRolePolicy", "iam:AttachUserPolicy", "iam:AttachGroupPolicy",
	"iam:PutRolePolicy", "iam:PutUserPolicy", "iam:PutGroupPolicy", "iam:DeleteRolePolicy",
	"iam:CreatePolicyVersion", "iam:SetDefaultPolicyVersion",
	"iam:CreateRole", "iam:CreateUser", "iam:CreateAccessKey", "iam:CreateLoginProfile", "iam:UpdateLoginProfile",
	"iam:AddUserToGroup", "iam:UpdateAssumeRolePolicy",
	"iam:PutRolePermissionsBoundary", "iam:DeleteRolePermissionsBoundary",
	"iam:PutUserPermissionsBoundary", "iam:DeleteUserPermissionsBoundary",
}

var reActionName = regexp.MustCompile(`^[a-z0-9-]+:[A-Za-z0-9*]+$`)

// ---- quarantine_role / deny_iam_escalation / deny_escalation ----

type denyInline struct{ kind string }

func (h *denyInline) writeActions() []string {
	return []string{"iam:PutRolePolicy", "iam:DeleteRolePolicy"}
}
func (h *denyInline) resources(t provider.Target) []string { return []string{t.TargetARN} }

func (h *denyInline) policyName() string {
	switch h.kind {
	case catalog.QuarantineRole:
		return "ISPMQuarantine"
	case catalog.DenyIAMEscalation:
		return "ISPMDenyIAMEscalation"
	}
	return "ISPMDenyEscalation"
}

// document is the Deny policy of the action (nil + reason when it cannot be built).
func (h *denyInline) document(params map[string]any) (*policydoc.Doc, string) {
	var actions any
	switch h.kind {
	case catalog.QuarantineRole:
		actions = "*"
	case catalog.DenyIAMEscalation:
		actions = iamEscalationActions
	default:
		var list []string
		seen := map[string]bool{}
		for _, a := range strs(params, "actions") {
			a = strings.TrimSpace(a)
			if reActionName.MatchString(a) && !seen[strings.ToLower(a)] {
				seen[strings.ToLower(a)] = true
				list = append(list, a)
			}
		}
		if len(list) == 0 {
			return nil, "the finding names no escalation actions: send params.actions (e.g. [\"iam:CreatePolicyVersion\"])"
		}
		sort.Strings(list)
		actions = list
	}
	d, err := policydoc.Parse(map[string]any{"Version": "2012-10-17", "Statement": []any{
		map[string]any{"Sid": h.policyName(), "Effect": "Deny", "Action": actions, "Resource": "*"}}})
	if err != nil {
		return nil, err.Error()
	}
	return d, ""
}

func readInline(ctx context.Context, c *Clients, role, name string) (*policydoc.Doc, error) {
	o, err := c.IAM.GetRolePolicy(ctx, &iam.GetRolePolicyInput{RoleName: aws.String(role), PolicyName: aws.String(name)})
	if err != nil {
		if isNotFound(err) {
			return nil, nil
		}
		return nil, err
	}
	return policydoc.Parse(aws.ToString(o.PolicyDocument))
}

func (h *denyInline) plan(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) error {
	roleARN := in.TargetARN
	if roleARN == "" {
		roleARN = str(in.Params, "role_arn")
	}
	pc.out.TargetARN, pc.out.TargetType = roleARN, "iam_role"
	name, ok := roleChecks(ctx, c, in.Target, pc, roleARN)
	if !ok {
		return nil
	}
	pc.out.Params["role_arn"] = roleARN
	pc.out.Vars["role_name"], pc.out.Vars["role_arn"] = name, roleARN
	doc, why := h.document(in.Params)
	if doc == nil {
		pc.block("policy built", why)
		return nil
	}
	cur, err := readInline(ctx, c, name, h.policyName())
	if err != nil {
		pc.block("role readable", err.Error())
		return nil
	}
	if cur != nil {
		pc.block("change needed", "the role already has the inline policy "+h.policyName())
		return nil
	}
	pc.out.Before = map[string]any{"role_arn": roleARN, "policy_name": h.policyName(), "policy": nil}
	pc.out.After = map[string]any{"role_arn": roleARN, "policy_name": h.policyName(), "policy": doc.Map()}
	pc.out.Diff = []domain.DiffEntry{{Path: "inline policy " + h.policyName(), Change: "added", After: doc.Map()}}
	role, err := c.IAM.GetRole(ctx, &iam.GetRoleInput{RoleName: aws.String(name)})
	if err == nil && role.Role.RoleLastUsed != nil && role.Role.RoleLastUsed.LastUsedDate != nil {
		last := *role.Role.RoleLastUsed.LastUsedDate
		if h.kind == catalog.QuarantineRole && time.Since(last) < 7*24*time.Hour {
			pc.warn("recently used", fmt.Sprintf("the role was used %s: whatever uses it will start failing", last.UTC().Format("2006-01-02")))
		}
	}
	switch h.kind {
	case catalog.QuarantineRole:
		pc.warn("deny all", "every call made with this role is denied until the policy is removed (rollback); delete the role later if nobody needs it")
	default:
		pc.warn("IAM changes blocked", "the role can no longer make the denied IAM changes; if it is an approved IAM admin or deployment role, reject this plan")
	}
	pc.pass("reversible", "rollback deletes the inline policy "+h.policyName())
	return nil
}

func (h *denyInline) state(ctx context.Context, c *Clients, t provider.Target) (map[string]any, error) {
	name, err := roleName(t.TargetARN)
	if err != nil {
		return nil, err
	}
	cur, err := readInline(ctx, c, name, h.policyName())
	if err != nil {
		return nil, err
	}
	return map[string]any{"role_arn": t.TargetARN, "policy_name": h.policyName(), "policy": docMapOrNil(cur)}, nil
}

func (h *denyInline) apply(ctx context.Context, c *Clients, r *run) error {
	name, err := roleName(r.t.TargetARN)
	if err != nil {
		return err
	}
	doc, err := optDoc(r.in.After, "policy")
	if err != nil || doc == nil {
		return fmt.Errorf("plan has no policy to add")
	}
	r.snap = map[string]any{"role_name": name, "policy_name": h.policyName()}
	if err := r.do("add the inline policy "+h.policyName(), "iam:PutRolePolicy", func() (smithymw.Metadata, error) {
		o, err := c.IAM.PutRolePolicy(ctx, &iam.PutRolePolicyInput{RoleName: aws.String(name), PolicyName: aws.String(h.policyName()),
			PolicyDocument: aws.String(doc.JSON())})
		return mdOf(o, err)
	}); err != nil {
		return err
	}
	r.result_["inline_policy_added"] = h.policyName()
	return nil
}

func (h *denyInline) verify(ctx context.Context, c *Clients, r *run) (map[string]any, error) {
	name, err := roleName(r.t.TargetARN)
	if err != nil {
		return nil, err
	}
	cur, err := readInline(ctx, c, name, h.policyName())
	if err != nil {
		return nil, err
	}
	want, _ := optDoc(r.in.After, "policy")
	ok := cur != nil && want != nil && policydoc.Hash(cur.Map()) == policydoc.Hash(want.Map())
	return map[string]any{"verified": ok}, nil
}

func (h *denyInline) rollback(ctx context.Context, c *Clients, r *run, snap map[string]any) error {
	return r.do("delete the inline policy "+str(snap, "policy_name"), "iam:DeleteRolePolicy", func() (smithymw.Metadata, error) {
		o, err := c.IAM.DeleteRolePolicy(ctx, &iam.DeleteRolePolicyInput{RoleName: aws.String(str(snap, "role_name")),
			PolicyName: aws.String(str(snap, "policy_name"))})
		if err != nil && isNotFound(err) {
			return mdOf(o, nil) // already gone
		}
		return mdOf(o, err)
	})
}

// ---- restore_policy_version ----

type restoreVersion struct{}

func (h *restoreVersion) writeActions() []string               { return []string{"iam:SetDefaultPolicyVersion"} }
func (h *restoreVersion) resources(t provider.Target) []string { return []string{t.TargetARN} }

func policyNameOf(policyARN string) string {
	if i := strings.LastIndex(policyARN, "/"); i >= 0 {
		return policyARN[i+1:]
	}
	return policyARN
}

func defaultVersion(ctx context.Context, c *Clients, policyARN string) (string, error) {
	o, err := c.IAM.GetPolicy(ctx, &iam.GetPolicyInput{PolicyArn: aws.String(policyARN)})
	if err != nil {
		return "", err
	}
	return aws.ToString(o.Policy.DefaultVersionId), nil
}

func (h *restoreVersion) plan(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) error {
	policyARN := str(in.Params, "policy_arn")
	if !strings.Contains(policyARN, ":policy/") {
		policyARN = in.TargetARN
	}
	pc.out.TargetARN, pc.out.TargetType = policyARN, "iam_policy"
	if !strings.Contains(policyARN, ":policy/") {
		pc.block("policy named", "the finding names no managed policy: send params.policy_arn")
		return nil
	}
	if strings.HasPrefix(policyARN, awsManagedPrefix) {
		pc.block("customer managed policy", "an AWS managed policy cannot be changed")
		return nil
	}
	pc.out.Params["policy_arn"] = policyARN
	pc.out.Vars["policy_arn"], pc.out.Vars["policy_name"] = policyARN, policyNameOf(policyARN)
	cur, err := defaultVersion(ctx, c, policyARN)
	if err != nil {
		pc.block("policy readable", err.Error())
		return nil
	}
	lv, err := c.IAM.ListPolicyVersions(ctx, &iam.ListPolicyVersionsInput{PolicyArn: aws.String(policyARN)})
	if err != nil {
		pc.block("policy versions readable", err.Error())
		return nil
	}
	var curDate time.Time
	for _, v := range lv.Versions {
		if aws.ToString(v.VersionId) == cur && v.CreateDate != nil {
			curDate = *v.CreateDate
		}
	}
	want := str(in.Params, "version_id")
	found := false
	if want != "" {
		for _, v := range lv.Versions {
			found = found || aws.ToString(v.VersionId) == want
		}
		if !found {
			pc.block("approved version exists", "version "+want+" does not exist (versions may have been deleted)")
			return nil
		}
	} else { // the newest version older than the current default
		var best time.Time
		for _, v := range lv.Versions {
			id := aws.ToString(v.VersionId)
			if id == cur || v.CreateDate == nil || !v.CreateDate.Before(curDate) {
				continue
			}
			if v.CreateDate.After(best) {
				best, want = *v.CreateDate, id
			}
		}
		if want == "" {
			pc.block("previous version", "the policy has no older version to go back to: send params.version_id")
			return nil
		}
		pc.warn("version chosen", "no approved version was named: "+want+" (the version before the current default) is used")
	}
	if want == cur {
		pc.block("change needed", want+" is already the default version")
		return nil
	}
	pc.out.Params["version_id"] = want
	pc.out.Vars["version_id"] = want
	pc.out.Before = map[string]any{"policy_arn": policyARN, "default_version": cur}
	pc.out.After = map[string]any{"policy_arn": policyARN, "default_version": want}
	pc.out.Diff = []domain.DiffEntry{diffField("default_version", cur, want)}
	if a, err := c.IAM.GetPolicyVersion(ctx, &iam.GetPolicyVersionInput{PolicyArn: aws.String(policyARN), VersionId: aws.String(cur)}); err == nil {
		if b, err := c.IAM.GetPolicyVersion(ctx, &iam.GetPolicyVersionInput{PolicyArn: aws.String(policyARN), VersionId: aws.String(want)}); err == nil {
			da, e1 := policydoc.Parse(aws.ToString(a.PolicyVersion.Document))
			db, e2 := policydoc.Parse(aws.ToString(b.PolicyVersion.Document))
			if e1 == nil && e2 == nil {
				pc.out.Diff = append(pc.out.Diff, policydoc.Diff(da, db)...)
			}
		}
	}
	pc.warn("every identity", "the policy may be attached to several roles / users: all of them get the restored permissions")
	pc.pass("reversible", "rollback sets "+cur+" as default again; no version is deleted")
	return nil
}

func (h *restoreVersion) state(ctx context.Context, c *Clients, t provider.Target) (map[string]any, error) {
	cur, err := defaultVersion(ctx, c, t.TargetARN)
	if err != nil {
		return nil, err
	}
	return map[string]any{"policy_arn": t.TargetARN, "default_version": cur}, nil
}

func (h *restoreVersion) set(ctx context.Context, c *Clients, r *run, step, policyARN, version string) error {
	return r.do(step, "iam:SetDefaultPolicyVersion", func() (smithymw.Metadata, error) {
		o, err := c.IAM.SetDefaultPolicyVersion(ctx, &iam.SetDefaultPolicyVersionInput{PolicyArn: aws.String(policyARN), VersionId: aws.String(version)})
		return mdOf(o, err)
	})
}

func (h *restoreVersion) apply(ctx context.Context, c *Clients, r *run) error {
	r.snap = map[string]any{"policy_arn": r.t.TargetARN, "version_id": str(r.before, "default_version")}
	want := str(r.t.Params, "version_id")
	if err := h.set(ctx, c, r, "set the approved version as default", r.t.TargetARN, want); err != nil {
		return err
	}
	r.result_["default_version"] = want
	return nil
}

func (h *restoreVersion) verify(ctx context.Context, c *Clients, r *run) (map[string]any, error) {
	cur, err := defaultVersion(ctx, c, r.t.TargetARN)
	if err != nil {
		return nil, err
	}
	return map[string]any{"verified": cur == str(r.t.Params, "version_id"), "default_version": cur}, nil
}

func (h *restoreVersion) rollback(ctx context.Context, c *Clients, r *run, snap map[string]any) error {
	return h.set(ctx, c, r, "set the previous default version again", str(snap, "policy_arn"), str(snap, "version_id"))
}
