package awsprov

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/kms"
	kmstypes "github.com/aws/aws-sdk-go-v2/service/kms/types"
	smithymw "github.com/aws/smithy-go/middleware"

	"nhi-backend-api/internal/remediation/policydoc"
	"nhi-backend-api/internal/remediation/provider"
)

// resolveKey accepts a key id, key ARN or alias and returns the key metadata.
func resolveKey(ctx context.Context, c *Clients, id string) (*kmstypes.KeyMetadata, error) {
	if id == "" {
		return nil, fmt.Errorf("key_id is required")
	}
	out, err := c.KMS.DescribeKey(ctx, &kms.DescribeKeyInput{KeyId: aws.String(id)})
	if err != nil {
		return nil, fmt.Errorf("read key %s: %w", id, err)
	}
	return out.KeyMetadata, nil
}

func keyBase(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) (*kmstypes.KeyMetadata, bool) {
	id := str(in.Params, "key_id")
	if id == "" {
		id = in.TargetARN
	}
	md, err := resolveKey(ctx, c, id)
	if err != nil {
		pc.block("key readable", err.Error())
		return nil, false
	}
	pc.out.TargetARN, pc.out.TargetType = aws.ToString(md.Arn), "kms_key"
	pc.out.Params["key_id"] = aws.ToString(md.Arn)
	pc.out.Vars["key_id"] = aws.ToString(md.KeyId)
	if md.KeyState != kmstypes.KeyStateEnabled && md.KeyState != kmstypes.KeyStateDisabled {
		pc.block("key state", "the key is "+string(md.KeyState))
		return md, false
	}
	return md, true
}

// ---- update_key_policy ----

type keyPolicy struct{}

func (h *keyPolicy) writeActions() []string               { return []string{"kms:PutKeyPolicy"} }
func (h *keyPolicy) resources(t provider.Target) []string { return []string{t.TargetARN} }

func isKeyAdminStatement(s map[string]any) bool {
	for _, a := range policydoc.Actions(s) {
		la := strings.ToLower(a)
		if la == "kms:*" || la == "*" || la == "kms:putkeypolicy" || la == "kms:schedulekeydeletion" {
			return true
		}
	}
	return false
}

func isRootPrincipal(p, account string) bool {
	return p == account || p == fmt.Sprintf("arn:aws:iam::%s:root", account)
}

func (h *keyPolicy) plan(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) error {
	pc.out.Flags.KeyPolicy = true
	md, ok := keyBase(ctx, c, in, pc)
	if !ok {
		return nil
	}
	if md.KeyManager != kmstypes.KeyManagerTypeCustomer {
		pc.block("customer managed key", "the policy of an AWS managed key cannot be changed")
		return nil
	}
	gp, err := c.KMS.GetKeyPolicy(ctx, &kms.GetKeyPolicyInput{KeyId: md.KeyId, PolicyName: aws.String("default")})
	if err != nil {
		pc.block("key policy readable", err.Error())
		return nil
	}
	before, err := policydoc.Parse(aws.ToString(gp.Policy))
	if err != nil {
		pc.block("key policy readable", err.Error())
		return nil
	}
	account := aws.ToString(md.AWSAccountId)
	pc.out.Before = map[string]any{"key_arn": aws.ToString(md.Arn), "policy": before.Map()}

	remove := strs(in.Params, "remove_principals")
	cond, _ := in.Params["add_conditions"].(map[string]any)
	if len(remove) == 0 && len(cond) == 0 {
		pc.block("change needed", "send remove_principals and/or add_conditions {caller_account, via_service}")
		return nil
	}
	after := before.Clone()
	var kept []map[string]any
	blocked := false
	for _, s := range after.Statements {
		if !policydoc.IsAllow(s) {
			kept = append(kept, s)
			continue
		}
		pm := principalMap(s)
		if pm != nil && len(remove) > 0 {
			var left []string
			for _, e := range policydoc.Strings(pm["AWS"]) {
				if !keepMatches(e, remove) {
					left = append(left, e)
					continue
				}
				switch {
				case isRootPrincipal(e, account):
					pc.block("account root statement kept", "the account root principal cannot be removed (key lock-out)")
					blocked = true
					left = append(left, e)
				case isKeyAdminStatement(s):
					pc.block("key administrators kept", e+" has key-administrator permissions in this statement and cannot be removed")
					blocked = true
					left = append(left, e)
				}
			}
			if len(left) == 0 && len(policydoc.Strings(pm["Service"])) == 0 {
				continue
			}
			if len(left) > 0 {
				pm["AWS"] = policydoc.NewList(left)
			} else {
				delete(pm, "AWS")
			}
			s["Principal"] = pm
		}
		if len(cond) > 0 && pm != nil && !isKeyAdminStatement(s) {
			isRoot := false
			for _, e := range policydoc.Strings(pm["AWS"]) {
				isRoot = isRoot || isRootPrincipal(e, account)
			}
			if !isRoot {
				if v := str(cond, "caller_account"); v != "" {
					setCond(s, "StringEquals", "kms:CallerAccount", v)
				}
				if v := str(cond, "via_service"); v != "" {
					setCond(s, "StringEquals", "kms:ViaService", v)
				}
			}
		}
		kept = append(kept, s)
	}
	after.Statements = kept
	if !blocked {
		rootKept := false
		for _, s := range after.Statements {
			if !policydoc.IsAllow(s) {
				continue
			}
			for _, e := range policydoc.Strings(principalMap(s)["AWS"]) {
				if isRootPrincipal(e, account) {
					rootKept = true
				}
			}
		}
		if !rootKept {
			pc.block("account root statement kept", "the new policy has no statement for the account root: the key would be locked out")
		} else {
			pc.pass("account root statement kept", "key administrators and the root statement are untouched")
		}
	}
	diff := policydoc.Diff(before, after)
	if len(diff) == 0 {
		pc.block("change needed", "the new policy equals the current one")
	}
	pc.pass("lock-out safety check", "PutKeyPolicy runs with the AWS lock-out safety check on")
	pc.out.After = map[string]any{"key_arn": aws.ToString(md.Arn), "policy": after.Map()}
	pc.out.Diff = diff
	return nil
}

func (h *keyPolicy) state(ctx context.Context, c *Clients, t provider.Target) (map[string]any, error) {
	md, err := resolveKey(ctx, c, t.TargetARN)
	if err != nil {
		return nil, err
	}
	gp, err := c.KMS.GetKeyPolicy(ctx, &kms.GetKeyPolicyInput{KeyId: md.KeyId, PolicyName: aws.String("default")})
	if err != nil {
		return nil, err
	}
	d, err := policydoc.Parse(aws.ToString(gp.Policy))
	if err != nil {
		return nil, err
	}
	return map[string]any{"key_arn": aws.ToString(md.Arn), "policy": d.Map()}, nil
}

func (h *keyPolicy) put(ctx context.Context, c *Clients, r *run, step, keyARN string, doc *policydoc.Doc) error {
	return r.do(step, "kms:PutKeyPolicy", func() (smithymw.Metadata, error) {
		o, err := c.KMS.PutKeyPolicy(ctx, &kms.PutKeyPolicyInput{KeyId: aws.String(keyARN), PolicyName: aws.String("default"),
			Policy: aws.String(doc.JSON()), BypassPolicyLockoutSafetyCheck: false})
		return mdOf(o, err)
	})
}

func (h *keyPolicy) apply(ctx context.Context, c *Clients, r *run) error {
	before, err := docOf(r.before, "policy")
	if err != nil {
		return err
	}
	after, err := docOf(r.in.After, "policy")
	if err != nil {
		return err
	}
	keyARN := r.t.TargetARN
	r.snap = map[string]any{"key_arn": keyARN, "policy": before.Map()}
	if err := h.put(ctx, c, r, "write the new key policy", keyARN, after); err != nil {
		return err
	}
	r.result_["key_policy_updated"] = keyARN
	return nil
}

func (h *keyPolicy) verify(ctx context.Context, c *Clients, r *run) (map[string]any, error) {
	cur, err := h.state(ctx, c, r.t)
	if err != nil {
		return nil, err
	}
	curDoc, _ := docOf(cur, "policy")
	want, err := docOf(r.in.After, "policy")
	if err != nil {
		return nil, err
	}
	return map[string]any{"verified": curDoc != nil && policydoc.Hash(curDoc.Map()) == policydoc.Hash(want.Map())}, nil
}

func (h *keyPolicy) rollback(ctx context.Context, c *Clients, r *run, snap map[string]any) error {
	doc, err := docOf(snap, "policy")
	if err != nil {
		return err
	}
	return h.put(ctx, c, r, "restore the previous key policy", str(snap, "key_arn"), doc)
}

// ---- revoke_grant ----

type grantInfo struct {
	ID          string              `json:"id"`
	Name        string              `json:"name,omitempty"`
	Grantee     string              `json:"grantee"`
	Retiring    string              `json:"retiring,omitempty"`
	Operations  []string            `json:"operations"`
	Constraints *grantConstraintsJS `json:"constraints,omitempty"`
}

type grantConstraintsJS struct {
	Subset map[string]string `json:"encryption_context_subset,omitempty"`
	Equals map[string]string `json:"encryption_context_equals,omitempty"`
}

type revokeGrant struct{}

func (h *revokeGrant) writeActions() []string               { return []string{"kms:RevokeGrant", "kms:CreateGrant"} }
func (h *revokeGrant) resources(t provider.Target) []string { return []string{t.TargetARN} }

func listGrants(ctx context.Context, c *Clients, keyID string) ([]grantInfo, error) {
	var out []grantInfo
	var marker *string
	for {
		o, err := c.KMS.ListGrants(ctx, &kms.ListGrantsInput{KeyId: aws.String(keyID), Marker: marker, Limit: aws.Int32(100)})
		if err != nil {
			return nil, err
		}
		for _, g := range o.Grants {
			gi := grantInfo{ID: aws.ToString(g.GrantId), Name: aws.ToString(g.Name), Grantee: aws.ToString(g.GranteePrincipal), Retiring: aws.ToString(g.RetiringPrincipal)}
			for _, op := range g.Operations {
				gi.Operations = append(gi.Operations, string(op))
			}
			sort.Strings(gi.Operations)
			if g.Constraints != nil {
				gi.Constraints = &grantConstraintsJS{Subset: g.Constraints.EncryptionContextSubset, Equals: g.Constraints.EncryptionContextEquals}
			}
			out = append(out, gi)
		}
		if !o.Truncated || o.NextMarker == nil {
			return out, nil
		}
		marker = o.NextMarker
	}
}

func selectGrants(all []grantInfo, p map[string]any) []grantInfo {
	id, grantee := str(p, "grant_id"), str(p, "grantee_principal")
	var sel []grantInfo
	for _, g := range all {
		if (id != "" && g.ID == id) || (grantee != "" && (g.Grantee == grantee || policydoc.Match(grantee, g.Grantee) ||
			(accountIDRe.MatchString(grantee) && principalAccount(g.Grantee) == grantee))) {
			sel = append(sel, g)
		}
	}
	return sel
}

func (h *revokeGrant) plan(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) error {
	md, ok := keyBase(ctx, c, in, pc)
	if !ok {
		return nil
	}
	if str(in.Params, "grant_id") == "" && str(in.Params, "grantee_principal") == "" {
		pc.block("grant identified", "send grant_id or grantee_principal (an ARN, a pattern or a 12-digit account id)")
		return nil
	}
	all, err := listGrants(ctx, c, aws.ToString(md.KeyId))
	if err != nil {
		pc.block("grants readable", err.Error())
		return nil
	}
	sel := selectGrants(all, in.Params)
	if len(sel) == 0 {
		pc.block("grant exists", "no grant matches (already revoked?)")
		return nil
	}
	pc.pass("grants selected", fmt.Sprintf("%d grant(s)", len(sel)))
	if len(sel) > 5 {
		pc.warn("many grants", fmt.Sprintf("%d grants will be revoked", len(sel)))
	}
	pc.out.Vars["grant_id"] = sel[0].ID
	pc.out.Before = map[string]any{"key_arn": aws.ToString(md.Arn), "grants": sel}
	pc.out.After = map[string]any{"key_arn": aws.ToString(md.Arn), "grants": []grantInfo{}}
	for _, g := range sel {
		pc.out.Diff = append(pc.out.Diff, diffField("Grant "+g.ID, g.Grantee, nil))
		pc.out.Diff[len(pc.out.Diff)-1].Change = "removed"
	}
	pc.warn("rollback creates new grants", "a revoked grant is re-created with the same parameters but a new grant id")
	return nil
}

func decodeGrants(v any) []grantInfo {
	b, _ := json.Marshal(v)
	var gs []grantInfo
	_ = json.Unmarshal(b, &gs)
	return gs
}

func (h *revokeGrant) state(ctx context.Context, c *Clients, t provider.Target) (map[string]any, error) {
	all, err := listGrants(ctx, c, t.TargetARN)
	if err != nil {
		return nil, err
	}
	return map[string]any{"key_arn": t.TargetARN, "grants": selectGrants(all, t.Params)}, nil
}

func (h *revokeGrant) apply(ctx context.Context, c *Clients, r *run) error {
	grants := decodeGrants(r.before["grants"])
	r.snap = map[string]any{"key_arn": r.t.TargetARN, "grants": grants}
	for _, g := range grants {
		g := g
		if err := r.do("revoke grant "+g.ID, "kms:RevokeGrant", func() (smithymw.Metadata, error) {
			o, err := c.KMS.RevokeGrant(ctx, &kms.RevokeGrantInput{KeyId: aws.String(r.t.TargetARN), GrantId: aws.String(g.ID)})
			return mdOf(o, err)
		}); err != nil {
			return err
		}
		r.undoWith("re-create grant "+g.ID, func(ctx context.Context) error {
			_, err := createGrant(ctx, c, r.t.TargetARN, g)
			return err
		})
	}
	r.result_["revoked"] = len(grants)
	return nil
}

func createGrant(ctx context.Context, c *Clients, keyARN string, g grantInfo) (*kms.CreateGrantOutput, error) {
	in := &kms.CreateGrantInput{KeyId: aws.String(keyARN), GranteePrincipal: aws.String(g.Grantee)}
	for _, op := range g.Operations {
		in.Operations = append(in.Operations, kmstypes.GrantOperation(op))
	}
	if g.Retiring != "" {
		in.RetiringPrincipal = aws.String(g.Retiring)
	}
	if g.Name != "" {
		in.Name = aws.String(g.Name)
	}
	if g.Constraints != nil {
		in.Constraints = &kmstypes.GrantConstraints{EncryptionContextSubset: g.Constraints.Subset, EncryptionContextEquals: g.Constraints.Equals}
	}
	return c.KMS.CreateGrant(ctx, in)
}

func (h *revokeGrant) verify(ctx context.Context, c *Clients, r *run) (map[string]any, error) {
	all, err := listGrants(ctx, c, r.t.TargetARN)
	if err != nil {
		return nil, err
	}
	remaining := 0
	for _, g := range decodeGrants(r.before["grants"]) {
		for _, a := range all {
			if a.ID == g.ID {
				remaining++
			}
		}
	}
	return map[string]any{"verified": remaining == 0, "remaining": remaining}, nil
}

func (h *revokeGrant) rollback(ctx context.Context, c *Clients, r *run, snap map[string]any) error {
	var ids []string
	for _, g := range decodeGrants(snap["grants"]) {
		g := g
		if err := r.do("re-create the grant of "+g.Grantee, "kms:CreateGrant", func() (smithymw.Metadata, error) {
			o, err := createGrant(ctx, c, str(snap, "key_arn"), g)
			if err == nil {
				ids = append(ids, aws.ToString(o.GrantId))
			}
			return mdOf(o, err)
		}); err != nil {
			return err
		}
	}
	r.result_["recreated_grant_ids"] = ids
	return nil
}

// ---- enable_key_rotation ----

type keyRotation struct{}

func (h *keyRotation) writeActions() []string {
	return []string{"kms:EnableKeyRotation", "kms:DisableKeyRotation"}
}
func (h *keyRotation) resources(t provider.Target) []string { return []string{t.TargetARN} }

func (h *keyRotation) plan(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) error {
	md, ok := keyBase(ctx, c, in, pc)
	if !ok {
		return nil
	}
	switch {
	case md.KeyManager != kmstypes.KeyManagerTypeCustomer:
		pc.block("rotation supported", "AWS managed keys rotate automatically")
	case md.KeySpec != kmstypes.KeySpecSymmetricDefault:
		pc.block("rotation supported", "automatic rotation is only available for symmetric encryption keys ("+string(md.KeySpec)+")")
	case md.Origin != kmstypes.OriginTypeAwsKms:
		pc.block("rotation supported", "keys with imported or external key material cannot rotate automatically")
	default:
		pc.pass("rotation supported", "symmetric customer managed key")
	}
	rs, err := c.KMS.GetKeyRotationStatus(ctx, &kms.GetKeyRotationStatusInput{KeyId: md.KeyId})
	if err != nil {
		pc.block("rotation status readable", err.Error())
		return nil
	}
	if rs.KeyRotationEnabled {
		pc.block("rotation is off", "rotation is already enabled")
	}
	pc.out.Before = map[string]any{"key_arn": aws.ToString(md.Arn), "rotation_enabled": rs.KeyRotationEnabled}
	pc.out.After = map[string]any{"key_arn": aws.ToString(md.Arn), "rotation_enabled": true}
	pc.out.Diff = append(pc.out.Diff, diffField("rotation_enabled", rs.KeyRotationEnabled, true))
	return nil
}

func (h *keyRotation) state(ctx context.Context, c *Clients, t provider.Target) (map[string]any, error) {
	rs, err := c.KMS.GetKeyRotationStatus(ctx, &kms.GetKeyRotationStatusInput{KeyId: aws.String(t.TargetARN)})
	if err != nil {
		return nil, err
	}
	return map[string]any{"key_arn": t.TargetARN, "rotation_enabled": rs.KeyRotationEnabled}, nil
}

func (h *keyRotation) apply(ctx context.Context, c *Clients, r *run) error {
	r.snap = map[string]any{"key_arn": r.t.TargetARN, "rotation_enabled": false}
	if err := r.do("enable automatic key rotation", "kms:EnableKeyRotation", func() (smithymw.Metadata, error) {
		o, err := c.KMS.EnableKeyRotation(ctx, &kms.EnableKeyRotationInput{KeyId: aws.String(r.t.TargetARN)})
		return mdOf(o, err)
	}); err != nil {
		return err
	}
	r.result_["rotation_enabled"] = true
	return nil
}

func (h *keyRotation) verify(ctx context.Context, c *Clients, r *run) (map[string]any, error) {
	st, err := h.state(ctx, c, r.t)
	if err != nil {
		return nil, err
	}
	return map[string]any{"verified": st["rotation_enabled"] == true}, nil
}

func (h *keyRotation) rollback(ctx context.Context, c *Clients, r *run, snap map[string]any) error {
	return r.do("disable automatic key rotation", "kms:DisableKeyRotation", func() (smithymw.Metadata, error) {
		o, err := c.KMS.DisableKeyRotation(ctx, &kms.DisableKeyRotationInput{KeyId: aws.String(str(snap, "key_arn"))})
		return mdOf(o, err)
	})
}
