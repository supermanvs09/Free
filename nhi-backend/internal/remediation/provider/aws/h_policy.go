package awsprov

import (
	"context"
	"fmt"
	"reflect"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/accessanalyzer"
	aatypes "github.com/aws/aws-sdk-go-v2/service/accessanalyzer/types"
	"github.com/aws/aws-sdk-go-v2/service/iam"
	smithymw "github.com/aws/smithy-go/middleware"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/policydoc"
	"nhi-backend-api/internal/remediation/provider"
)

const awsManagedPrefix = "arn:aws:iam::aws:policy/"

// roleChecks verifies the role exists and may be changed: not a service-linked
// role and not the remediation role itself.
func roleChecks(ctx context.Context, c *Clients, t provider.Target, pc *planCtx, roleARN string) (name string, ok bool) {
	name, err := roleName(roleARN)
	if err != nil {
		pc.block("target is an IAM role", err.Error())
		return "", false
	}
	if strings.HasPrefix(rolePath(roleARN), "/aws-service-role/") || strings.HasPrefix(name, "AWSServiceRoleFor") {
		pc.block("not a service-linked role", "service-linked roles are managed by AWS and are never changed")
		return name, false
	}
	if t.Account.RoleARN != "" && strings.EqualFold(t.Account.RoleARN, roleARN) {
		pc.block("not the remediation role", "the remediation role cannot change itself")
		return name, false
	}
	if _, err := c.IAM.GetRole(ctx, &iam.GetRoleInput{RoleName: aws.String(name)}); err != nil {
		if isNotFound(err) {
			pc.block("role exists", "role "+name+" does not exist (already deleted?)")
		} else {
			pc.block("role readable", err.Error())
		}
		return name, false
	}
	pc.pass("role can be changed", name)
	return name, true
}

// validateIdentityPolicy runs IAM Access Analyzer ValidatePolicy.
func validateIdentityPolicy(ctx context.Context, c *Clients, pc *planCtx, doc *policydoc.Doc) {
	if c.Analyzer == nil {
		return
	}
	out, err := c.Analyzer.ValidatePolicy(ctx, &accessanalyzer.ValidatePolicyInput{
		PolicyDocument: aws.String(doc.JSON()), PolicyType: aatypes.PolicyTypeIdentityPolicy,
	})
	if err != nil {
		pc.warn("policy validation", "Access Analyzer ValidatePolicy unavailable: "+err.Error())
		return
	}
	errs, warns := 0, 0
	var first string
	for _, f := range out.Findings {
		switch f.FindingType {
		case aatypes.ValidatePolicyFindingTypeError:
			errs++
			if first == "" {
				first = aws.ToString(f.FindingDetails)
			}
		case aatypes.ValidatePolicyFindingTypeSecurityWarning, aatypes.ValidatePolicyFindingTypeWarning:
			warns++
		}
	}
	switch {
	case errs > 0:
		pc.block("policy validation", fmt.Sprintf("%d error(s) from Access Analyzer, e.g. %s", errs, first))
	case warns > 0:
		pc.warn("policy validation", fmt.Sprintf("%d warning(s) from Access Analyzer", warns))
	default:
		pc.pass("policy validation", "no errors or warnings")
	}
}

func hasAdminStatement(d *policydoc.Doc) bool {
	for _, s := range d.Statements {
		if !policydoc.IsAllow(s) {
			continue
		}
		star := false
		for _, a := range policydoc.Actions(s) {
			if a == "*" || a == "*:*" {
				star = true
			}
		}
		res := false
		for _, r := range policydoc.Resources(s) {
			if r == "*" {
				res = true
			}
		}
		if star && res {
			return true
		}
	}
	return false
}

// uncoveredUsage lists used actions the new document would no longer allow.
func uncoveredUsage(after *policydoc.Doc, before *policydoc.Doc, usedPatterns []string) []string {
	var lost []string
	beforeActs, afterActs := before.AllowedActions(), after.AllowedActions()
	for _, u := range usedPatterns {
		if policydoc.Covered(u, beforeActs) && !coveredBy(u, afterActs) {
			lost = append(lost, u)
		}
	}
	return lost
}

// coveredBy: the used entry (action or "ns:*") is allowed by the new patterns.
func coveredBy(used string, patterns []string) bool {
	if policydoc.Covered(used, patterns) {
		return true
	}
	if strings.HasSuffix(used, ":*") { // service-level usage: any pattern of the service keeps it alive
		ns := strings.TrimSuffix(used, "*")
		for _, p := range patterns {
			if strings.HasPrefix(strings.ToLower(p), strings.ToLower(ns)) {
				return true
			}
		}
	}
	return false
}

// ---- policy lookup ----

type polRef struct {
	Kind      string // inline | managed
	Name      string // inline
	ARN       string // managed
	AWSManged bool
	VersionID string
	Doc       *policydoc.Doc
}

func (p *polRef) display() string {
	if p.Kind == "inline" {
		return p.Name
	}
	return p.ARN
}

func readPolicy(ctx context.Context, c *Clients, roleName string, params map[string]any) (*polRef, error) {
	if name := str(params, "policy_name"); name != "" {
		out, err := c.IAM.GetRolePolicy(ctx, &iam.GetRolePolicyInput{RoleName: aws.String(roleName), PolicyName: aws.String(name)})
		if err != nil {
			return nil, fmt.Errorf("read inline policy %s: %w", name, err)
		}
		d, err := policydoc.Parse(aws.ToString(out.PolicyDocument))
		if err != nil {
			return nil, err
		}
		return &polRef{Kind: "inline", Name: name, Doc: d}, nil
	}
	if parn := str(params, "policy_arn"); parn != "" {
		return readManaged(ctx, c, parn)
	}
	return nil, fmt.Errorf("policy_name or policy_arn is required")
}

func readManaged(ctx context.Context, c *Clients, policyARN string) (*polRef, error) {
	pol, err := c.IAM.GetPolicy(ctx, &iam.GetPolicyInput{PolicyArn: aws.String(policyARN)})
	if err != nil {
		return nil, fmt.Errorf("read policy %s: %w", policyARN, err)
	}
	ver := aws.ToString(pol.Policy.DefaultVersionId)
	pv, err := c.IAM.GetPolicyVersion(ctx, &iam.GetPolicyVersionInput{PolicyArn: aws.String(policyARN), VersionId: aws.String(ver)})
	if err != nil {
		return nil, fmt.Errorf("read policy version: %w", err)
	}
	d, err := policydoc.Parse(aws.ToString(pv.PolicyVersion.Document))
	if err != nil {
		return nil, err
	}
	return &polRef{Kind: "managed", ARN: policyARN, AWSManged: strings.HasPrefix(policyARN, awsManagedPrefix), VersionID: ver, Doc: d}, nil
}

func hasWildcardAllow(d *policydoc.Doc) bool {
	for _, s := range d.Statements {
		if !policydoc.IsAllow(s) {
			continue
		}
		for _, a := range policydoc.Actions(s) {
			if policydoc.IsWildcard(a) {
				return true
			}
		}
	}
	return false
}

// pickPolicy chooses the policy a finding is about when none was named: the
// first inline or customer-managed policy with a wildcard Allow (the hint is
// the policy name / ARN the rule evidence mentioned), else an attached AWS
// managed policy (the caller then asks for replace_managed_policy).
func pickPolicy(ctx context.Context, c *Clients, roleName, hint string) (*polRef, int, error) {
	var cands []*polRef
	lp, err := c.IAM.ListRolePolicies(ctx, &iam.ListRolePoliciesInput{RoleName: aws.String(roleName)})
	if err != nil {
		return nil, 0, err
	}
	for _, n := range lp.PolicyNames {
		r, err := readPolicy(ctx, c, roleName, map[string]any{"policy_name": n})
		if err == nil && hasWildcardAllow(r.Doc) {
			cands = append(cands, r)
		}
	}
	la, err := c.IAM.ListAttachedRolePolicies(ctx, &iam.ListAttachedRolePoliciesInput{RoleName: aws.String(roleName)})
	if err != nil {
		return nil, 0, err
	}
	var managed []*polRef
	for _, a := range la.AttachedPolicies {
		r, err := readManaged(ctx, c, aws.ToString(a.PolicyArn))
		if err != nil || !hasWildcardAllow(r.Doc) {
			continue
		}
		if r.AWSManged {
			managed = append(managed, r)
		} else {
			cands = append(cands, r)
		}
	}
	cands = append(cands, managed...)
	if len(cands) == 0 {
		return nil, 0, fmt.Errorf("no policy with wildcard permissions found on role %s", roleName)
	}
	for _, r := range cands {
		if hint != "" && (strings.Contains(hint, r.Name) && r.Name != "" || strings.Contains(hint, r.ARN) && r.ARN != "") {
			return r, len(cands), nil
		}
	}
	return cands[0], len(cands), nil
}

func policyState(roleARN string, ref *polRef) map[string]any {
	st := map[string]any{"role_arn": roleARN, "policy_kind": ref.Kind, "policy_ref": ref.display(), "document": ref.Doc.Map()}
	if ref.Kind == "managed" {
		st["version_id"] = ref.VersionID
	}
	return st
}

// ---- scope_policy / remove_statement ----

type policyEdit struct{ kind string }

func (h *policyEdit) writeActions() []string {
	return []string{"iam:PutRolePolicy", "iam:CreatePolicyVersion", "iam:DeletePolicyVersion", "iam:SetDefaultPolicyVersion"}
}

func (h *policyEdit) resources(t provider.Target) []string {
	res := []string{t.TargetARN}
	if p := str(t.Params, "policy_arn"); p != "" {
		res = append(res, p)
	}
	return res
}

func (h *policyEdit) plan(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) error {
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
	pc.out.Vars["role_arn"], pc.out.Vars["role_name"] = roleARN, name

	var ref *polRef
	var err error
	if str(in.Params, "policy_name") == "" && str(in.Params, "policy_arn") == "" {
		var n int
		ref, n, err = pickPolicy(ctx, c, name, str(in.Params, "policy_hint"))
		if err != nil {
			pc.block("policy found", err.Error())
			return nil
		}
		if n > 1 {
			pc.warn("several policies with wildcards", fmt.Sprintf("the role has %d such policies; this plan changes %s, create more plans for the others", n, ref.display()))
		}
	} else if ref, err = readPolicy(ctx, c, name, in.Params); err != nil {
		pc.block("policy readable", err.Error())
		return nil
	}
	if ref.Kind == "inline" {
		pc.out.Params["policy_name"] = ref.Name
		pc.out.Vars["policy_name"] = ref.Name
	} else {
		pc.out.Params["policy_arn"] = ref.ARN
		pc.out.Vars["policy_name"] = ref.ARN[strings.LastIndex(ref.ARN, "/")+1:]
	}
	pc.out.Vars["policy_ref"] = ref.display()
	if ref.AWSManged {
		pc.block("customer-owned policy", "AWS managed policies are never edited; use replace_managed_policy for "+ref.ARN)
		pc.out.Before = policyState(roleARN, ref)
		return nil
	}
	pc.out.Before = policyState(roleARN, ref)

	// build the proposed document
	var after *policydoc.Doc
	var usage *Usage
	switch {
	case in.Params["proposed_document"] != nil:
		after, err = policydoc.Parse(in.Params["proposed_document"])
		if err != nil {
			pc.block("proposed document", err.Error())
			return nil
		}
		pc.pass("proposed document supplied", "the analyst edited the document")
		usage, _ = accessAdvisor(ctx, c, roleARN, in.UsageWindowDays, str(in.Params, "granularity"))
	case h.kind == "remove_statement":
		after, err = removeStatement(ref.Doc, in.Params)
		if err != nil {
			pc.block("statement selected", err.Error())
			return nil
		}
		usage, _ = accessAdvisor(ctx, c, roleARN, in.UsageWindowDays, str(in.Params, "granularity"))
	default:
		usage, err = accessAdvisor(ctx, c, roleARN, in.UsageWindowDays, str(in.Params, "granularity"))
		if err != nil {
			pc.block("usage baseline", err.Error()+"; send proposed_document to scope the policy by hand")
			return nil
		}
		var manual []int
		after, manual = policydoc.ScopeToUsage(ref.Doc, usage.Used, boolean(in.Params, "prune_unused"))
		for _, i := range manual {
			pc.warn("NotAction statement", fmt.Sprintf("Statement[%d] uses NotAction and was left unchanged; edit it by hand", i))
		}
	}
	pc.out.UsageBasis = usage.basis()
	if usage != nil && usage.Granularity == "service" {
		pc.warn("service-level scope", "the scoped policy keeps whole services that were used (ns:*); send granularity=action for action-level scoping")
	}

	// pre-checks on the result
	if usage != nil {
		if lost := uncoveredUsage(after, ref.Doc, usage.Used); len(lost) > 0 {
			pc.block("used permissions stay allowed", fmt.Sprintf("the new document would remove access that was used in the last %d days: %s",
				usage.WindowDays, strings.Join(lost, ", ")))
		} else {
			pc.pass("used permissions stay allowed", fmt.Sprintf("everything used in the last %d days is still allowed", usage.WindowDays))
		}
	} else {
		pc.warn("usage baseline", "no usage data: check by hand that the new document keeps what the workload needs")
	}
	if len(after.Statements) == 0 {
		pc.warn("empty policy", "the new document has no statements: the role loses all permissions from this policy")
	}
	diff := policydoc.Diff(ref.Doc, after)
	if len(diff) == 0 {
		pc.block("change needed", "the new document equals the current one: nothing to change")
	}
	validateIdentityPolicy(ctx, c, pc, after)
	if ref.Kind == "managed" {
		if vs, err := c.IAM.ListPolicyVersions(ctx, &iam.ListPolicyVersionsInput{PolicyArn: aws.String(ref.ARN)}); err == nil && len(vs.Versions) >= 5 {
			pc.warn("policy version limit", "the policy has 5 versions: the oldest non-default version is deleted to make room")
		}
	}
	pc.out.Flags.AdminRemoval = hasAdminStatement(ref.Doc) && !hasAdminStatement(after)
	pc.out.After = map[string]any{"role_arn": roleARN, "policy_kind": ref.Kind, "policy_ref": ref.display(), "document": after.Map()}
	pc.out.Diff = diff
	return nil
}

func removeStatement(d *policydoc.Doc, params map[string]any) (*policydoc.Doc, error) {
	sid, idx := str(params, "statement_sid"), integer(params, "statement_index", -1)
	if sid == "" && idx < 0 {
		return nil, fmt.Errorf("statement_sid or statement_index is required")
	}
	out := d.Clone()
	var kept []map[string]any
	removed := 0
	for i, s := range out.Statements {
		if (sid != "" && s["Sid"] == sid) || (idx >= 0 && i == idx) {
			removed++
			continue
		}
		kept = append(kept, s)
	}
	if removed == 0 {
		return nil, fmt.Errorf("no statement matches")
	}
	out.Statements = kept
	return out, nil
}

func (h *policyEdit) state(ctx context.Context, c *Clients, t provider.Target) (map[string]any, error) {
	name, err := roleName(t.TargetARN)
	if err != nil {
		return nil, err
	}
	ref, err := readPolicy(ctx, c, name, t.Params)
	if err != nil {
		return nil, err
	}
	return policyState(t.TargetARN, ref), nil
}

func docOf(m map[string]any, key string) (*policydoc.Doc, error) {
	v, ok := m[key]
	if !ok {
		return nil, fmt.Errorf("missing %q in plan state", key)
	}
	return policydoc.Parse(v)
}

func (h *policyEdit) apply(ctx context.Context, c *Clients, r *run) error {
	name, err := roleName(r.t.TargetARN)
	if err != nil {
		return err
	}
	before, err := docOf(r.before, "document")
	if err != nil {
		return err
	}
	after, err := docOf(r.in.After, "document")
	if err != nil {
		return err
	}
	if str(r.before, "policy_kind") == "inline" {
		pname := str(r.t.Params, "policy_name")
		r.snap = map[string]any{"policy_kind": "inline", "role_name": name, "policy_name": pname, "document": before.Map()}
		if err := r.do("write the scoped inline policy", "iam:PutRolePolicy", func() (smithymw.Metadata, error) {
			o, err := c.IAM.PutRolePolicy(ctx, &iam.PutRolePolicyInput{RoleName: aws.String(name), PolicyName: aws.String(pname), PolicyDocument: aws.String(after.JSON())})
			return mdOf(o, err)
		}); err != nil {
			return err
		}
		r.undoWith("restore the inline policy", func(ctx context.Context) error {
			_, err := c.IAM.PutRolePolicy(ctx, &iam.PutRolePolicyInput{RoleName: aws.String(name), PolicyName: aws.String(pname), PolicyDocument: aws.String(before.JSON())})
			return err
		})
		r.result_["policy"] = pname
		return nil
	}
	parn := str(r.t.Params, "policy_arn")
	prev := str(r.before, "version_id")
	r.snap = map[string]any{"policy_kind": "managed", "policy_arn": parn, "previous_default_version": prev, "document": before.Map()}
	if err := h.makeRoom(ctx, c, r, parn); err != nil {
		return err
	}
	var newVer string
	if err := r.do("create a new default policy version", "iam:CreatePolicyVersion", func() (smithymw.Metadata, error) {
		o, err := c.IAM.CreatePolicyVersion(ctx, &iam.CreatePolicyVersionInput{PolicyArn: aws.String(parn), PolicyDocument: aws.String(after.JSON()), SetAsDefault: true})
		if err == nil && o.PolicyVersion != nil {
			newVer = aws.ToString(o.PolicyVersion.VersionId)
		}
		return mdOf(o, err)
	}); err != nil {
		return err
	}
	r.undoWith("make the previous policy version default again", func(ctx context.Context) error {
		_, err := c.IAM.SetDefaultPolicyVersion(ctx, &iam.SetDefaultPolicyVersionInput{PolicyArn: aws.String(parn), VersionId: aws.String(prev)})
		return err
	})
	r.result_["policy"], r.result_["new_version"] = parn, newVer
	return nil
}

// makeRoom deletes the oldest non-default version when the policy has 5.
func (h *policyEdit) makeRoom(ctx context.Context, c *Clients, r *run, parn string) error {
	if r.dry {
		return nil
	}
	vs, err := c.IAM.ListPolicyVersions(ctx, &iam.ListPolicyVersionsInput{PolicyArn: aws.String(parn)})
	if err != nil {
		return err
	}
	if len(vs.Versions) < 5 {
		return nil
	}
	var oldest string
	for i := len(vs.Versions) - 1; i >= 0; i-- { // IAM returns newest first
		if !vs.Versions[i].IsDefaultVersion {
			oldest = aws.ToString(vs.Versions[i].VersionId)
			break
		}
	}
	if oldest == "" {
		return fmt.Errorf("policy has 5 versions and none can be deleted")
	}
	r.result_["deleted_version"] = oldest
	return r.do("delete the oldest policy version", "iam:DeletePolicyVersion", func() (smithymw.Metadata, error) {
		o, err := c.IAM.DeletePolicyVersion(ctx, &iam.DeletePolicyVersionInput{PolicyArn: aws.String(parn), VersionId: aws.String(oldest)})
		return mdOf(o, err)
	})
}

func (h *policyEdit) verify(ctx context.Context, c *Clients, r *run) (map[string]any, error) {
	cur, err := h.state(ctx, c, r.t)
	if err != nil {
		return nil, err
	}
	curDoc, err := docOf(cur, "document")
	if err != nil {
		return nil, err
	}
	want, err := docOf(r.in.After, "document")
	if err != nil {
		return nil, err
	}
	ok := policydoc.Hash(curDoc.Map()) == policydoc.Hash(want.Map())
	return map[string]any{"verified": ok, "check": "policy document equals the approved document"}, nil
}

func (h *policyEdit) rollback(ctx context.Context, c *Clients, r *run, snap map[string]any) error {
	if str(snap, "policy_kind") == "inline" {
		doc, err := docOf(snap, "document")
		if err != nil {
			return err
		}
		return r.do("restore the inline policy", "iam:PutRolePolicy", func() (smithymw.Metadata, error) {
			o, err := c.IAM.PutRolePolicy(ctx, &iam.PutRolePolicyInput{RoleName: aws.String(str(snap, "role_name")),
				PolicyName: aws.String(str(snap, "policy_name")), PolicyDocument: aws.String(doc.JSON())})
			return mdOf(o, err)
		})
	}
	return r.do("make the previous policy version default", "iam:SetDefaultPolicyVersion", func() (smithymw.Metadata, error) {
		o, err := c.IAM.SetDefaultPolicyVersion(ctx, &iam.SetDefaultPolicyVersionInput{
			PolicyArn: aws.String(str(snap, "policy_arn")), VersionId: aws.String(str(snap, "previous_default_version"))})
		return mdOf(o, err)
	})
}

// mdOf extracts the response metadata from any SDK output (nil-safe).
func mdOf(out any, err error) (smithymw.Metadata, error) {
	if v := reflect.ValueOf(out); v.Kind() == reflect.Ptr && !v.IsNil() {
		if f := v.Elem().FieldByName("ResultMetadata"); f.IsValid() {
			if md, ok := f.Interface().(smithymw.Metadata); ok {
				return md, err
			}
		}
	}
	return smithymw.Metadata{}, err
}

// ---- replace_managed_policy ----

type replaceManaged struct{}

func (h *replaceManaged) writeActions() []string {
	return []string{"iam:CreatePolicy", "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:DeletePolicy"}
}

func (h *replaceManaged) resources(t provider.Target) []string {
	res := []string{t.TargetARN, fmt.Sprintf("arn:aws:iam::%s:policy/ISPM-*", t.Account.AccountID)}
	if p := str(t.Params, "new_policy_arn"); p != "" {
		res = append(res, p)
	}
	return res
}

func newPolicyName(roleName string) string {
	n := "ISPM-" + roleName + "-scoped"
	if len(n) > 128 {
		n = n[:128]
	}
	return n
}

func (h *replaceManaged) plan(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) error {
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
	pc.out.Vars["role_arn"], pc.out.Vars["role_name"] = roleARN, name

	parn := str(in.Params, "policy_arn")
	if parn == "" { // choose the attached managed policy with a wildcard
		la, err := c.IAM.ListAttachedRolePolicies(ctx, &iam.ListAttachedRolePoliciesInput{RoleName: aws.String(name)})
		if err != nil {
			pc.block("attached policies readable", err.Error())
			return nil
		}
		hint := str(in.Params, "policy_hint")
		for _, a := range la.AttachedPolicies {
			ref, err := readManaged(ctx, c, aws.ToString(a.PolicyArn))
			if err != nil || !hasWildcardAllow(ref.Doc) {
				continue
			}
			if parn == "" || (hint != "" && strings.Contains(hint, aws.ToString(a.PolicyName))) {
				parn = ref.ARN
			}
		}
		if parn == "" {
			pc.block("managed policy found", "no attached managed policy with wildcard permissions")
			return nil
		}
	}
	ref, err := readManaged(ctx, c, parn)
	if err != nil {
		pc.block("policy readable", err.Error())
		return nil
	}
	la, err := c.IAM.ListAttachedRolePolicies(ctx, &iam.ListAttachedRolePoliciesInput{RoleName: aws.String(name)})
	if err != nil {
		pc.block("attached policies readable", err.Error())
		return nil
	}
	attached := false
	for _, a := range la.AttachedPolicies {
		if aws.ToString(a.PolicyArn) == parn {
			attached = true
		}
	}
	if !attached {
		pc.block("policy is attached", parn+" is not attached to "+name)
		return nil
	}
	pc.out.Params["policy_arn"] = parn
	pc.out.Vars["policy_arn"] = parn

	newName := str(in.Params, "new_policy_name")
	if newName == "" {
		newName = newPolicyName(name)
	}
	newARN := fmt.Sprintf("arn:aws:iam::%s:policy/%s", in.Account.AccountID, newName)
	pc.out.Params["new_policy_name"], pc.out.Params["new_policy_arn"] = newName, newARN
	pc.out.Vars["new_policy_name"], pc.out.Vars["new_policy_arn"] = newName, newARN
	if _, err := c.IAM.GetPolicy(ctx, &iam.GetPolicyInput{PolicyArn: aws.String(newARN)}); err == nil {
		pc.block("new policy name is free", "a policy named "+newName+" exists; send another new_policy_name")
		return nil
	}
	pc.out.Before = map[string]any{"role_arn": roleARN, "policy_arn": parn, "attached": true, "default_version": ref.VersionID}

	var after *policydoc.Doc
	var usage *Usage
	if in.Params["proposed_document"] != nil {
		after, err = policydoc.Parse(in.Params["proposed_document"])
		if err != nil {
			pc.block("proposed document", err.Error())
			return nil
		}
		usage, _ = accessAdvisor(ctx, c, roleARN, in.UsageWindowDays, str(in.Params, "granularity"))
	} else {
		usage, err = accessAdvisor(ctx, c, roleARN, in.UsageWindowDays, str(in.Params, "granularity"))
		if err != nil {
			pc.block("usage baseline", err.Error()+"; send proposed_document to scope the policy by hand")
			return nil
		}
		var manual []int
		after, manual = policydoc.ScopeToUsage(ref.Doc, usage.Used, boolean(in.Params, "prune_unused"))
		for _, i := range manual {
			pc.warn("NotAction statement", fmt.Sprintf("Statement[%d] uses NotAction and was kept as is", i))
		}
	}
	pc.out.UsageBasis = usage.basis()
	if usage != nil {
		if lost := uncoveredUsage(after, ref.Doc, usage.Used); len(lost) > 0 {
			pc.block("used permissions stay allowed", "the new policy would remove used access: "+strings.Join(lost, ", "))
		} else {
			pc.pass("used permissions stay allowed", fmt.Sprintf("everything used in the last %d days is still allowed", usage.WindowDays))
		}
	} else {
		pc.warn("usage baseline", "no usage data: check by hand that the new policy keeps what the workload needs")
	}
	if len(after.Statements) == 0 {
		pc.block("not empty", "the new policy has no statements")
	}
	validateIdentityPolicy(ctx, c, pc, after)
	pc.out.Flags.AdminRemoval = hasAdminStatement(ref.Doc) && !hasAdminStatement(after)
	pc.out.After = map[string]any{"role_arn": roleARN, "attach": newARN, "detach": parn, "new_policy_name": newName, "document": after.Map()}
	pc.out.Diff = append([]domain.DiffEntry{
		{Path: "AttachedPolicies", Change: "removed", Before: parn},
		{Path: "AttachedPolicies", Change: "added", After: newARN},
	}, policydoc.Diff(ref.Doc, after)...)
	return nil
}

func (h *replaceManaged) state(ctx context.Context, c *Clients, t provider.Target) (map[string]any, error) {
	name, err := roleName(t.TargetARN)
	if err != nil {
		return nil, err
	}
	parn := str(t.Params, "policy_arn")
	la, err := c.IAM.ListAttachedRolePolicies(ctx, &iam.ListAttachedRolePoliciesInput{RoleName: aws.String(name)})
	if err != nil {
		return nil, err
	}
	attached := false
	for _, a := range la.AttachedPolicies {
		if aws.ToString(a.PolicyArn) == parn {
			attached = true
		}
	}
	ref, err := readManaged(ctx, c, parn)
	if err != nil {
		return nil, err
	}
	return map[string]any{"role_arn": t.TargetARN, "policy_arn": parn, "attached": attached, "default_version": ref.VersionID}, nil
}

func (h *replaceManaged) apply(ctx context.Context, c *Clients, r *run) error {
	name, err := roleName(r.t.TargetARN)
	if err != nil {
		return err
	}
	oldARN := str(r.t.Params, "policy_arn")
	newName := str(r.in.After, "new_policy_name")
	after, err := docOf(r.in.After, "document")
	if err != nil {
		return err
	}
	r.snap = map[string]any{"role_name": name, "old_policy_arn": oldARN}
	newARN := str(r.t.Params, "new_policy_arn")
	if err := r.do("create the scoped policy", "iam:CreatePolicy", func() (smithymw.Metadata, error) {
		o, err := c.IAM.CreatePolicy(ctx, &iam.CreatePolicyInput{PolicyName: aws.String(newName), PolicyDocument: aws.String(after.JSON()),
			Description: aws.String("Scoped replacement created by ISPM remediation")})
		if err == nil && o.Policy != nil {
			newARN = aws.ToString(o.Policy.Arn)
		}
		return mdOf(o, err)
	}); err != nil {
		return err
	}
	r.snap["new_policy_arn"] = newARN
	r.undoWith("delete the new policy", func(ctx context.Context) error {
		_, err := c.IAM.DeletePolicy(ctx, &iam.DeletePolicyInput{PolicyArn: aws.String(newARN)})
		return err
	})
	if err := r.do("attach the scoped policy", "iam:AttachRolePolicy", func() (smithymw.Metadata, error) {
		o, err := c.IAM.AttachRolePolicy(ctx, &iam.AttachRolePolicyInput{RoleName: aws.String(name), PolicyArn: aws.String(newARN)})
		return mdOf(o, err)
	}); err != nil {
		return err
	}
	r.undoWith("detach the new policy", func(ctx context.Context) error {
		_, err := c.IAM.DetachRolePolicy(ctx, &iam.DetachRolePolicyInput{RoleName: aws.String(name), PolicyArn: aws.String(newARN)})
		return err
	})
	if err := r.do("detach the old policy", "iam:DetachRolePolicy", func() (smithymw.Metadata, error) {
		o, err := c.IAM.DetachRolePolicy(ctx, &iam.DetachRolePolicyInput{RoleName: aws.String(name), PolicyArn: aws.String(oldARN)})
		return mdOf(o, err)
	}); err != nil {
		return err
	}
	r.result_["attached"], r.result_["detached"] = newARN, oldARN
	return nil
}

func (h *replaceManaged) verify(ctx context.Context, c *Clients, r *run) (map[string]any, error) {
	name, err := roleName(r.t.TargetARN)
	if err != nil {
		return nil, err
	}
	la, err := c.IAM.ListAttachedRolePolicies(ctx, &iam.ListAttachedRolePoliciesInput{RoleName: aws.String(name)})
	if err != nil {
		return nil, err
	}
	hasNew, hasOld := false, false
	for _, a := range la.AttachedPolicies {
		switch aws.ToString(a.PolicyArn) {
		case str(r.t.Params, "new_policy_arn"):
			hasNew = true
		case str(r.t.Params, "policy_arn"):
			hasOld = true
		}
	}
	return map[string]any{"verified": hasNew && !hasOld, "new_attached": hasNew, "old_still_attached": hasOld}, nil
}

func (h *replaceManaged) rollback(ctx context.Context, c *Clients, r *run, snap map[string]any) error {
	name, oldARN, newARN := str(snap, "role_name"), str(snap, "old_policy_arn"), str(snap, "new_policy_arn")
	if err := r.do("attach the old policy again", "iam:AttachRolePolicy", func() (smithymw.Metadata, error) {
		o, err := c.IAM.AttachRolePolicy(ctx, &iam.AttachRolePolicyInput{RoleName: aws.String(name), PolicyArn: aws.String(oldARN)})
		return mdOf(o, err)
	}); err != nil {
		return err
	}
	if err := r.do("detach the scoped policy", "iam:DetachRolePolicy", func() (smithymw.Metadata, error) {
		o, err := c.IAM.DetachRolePolicy(ctx, &iam.DetachRolePolicyInput{RoleName: aws.String(name), PolicyArn: aws.String(newARN)})
		return mdOf(o, err)
	}); err != nil {
		return err
	}
	return r.do("delete the scoped policy", "iam:DeletePolicy", func() (smithymw.Metadata, error) {
		o, err := c.IAM.DeletePolicy(ctx, &iam.DeletePolicyInput{PolicyArn: aws.String(newARN)})
		return mdOf(o, err)
	})
}
