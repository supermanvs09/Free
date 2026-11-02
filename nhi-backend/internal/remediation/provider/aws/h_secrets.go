package awsprov

import (
	"context"
	"fmt"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"
	smithymw "github.com/aws/smithy-go/middleware"
	"github.com/google/uuid"

	"nhi-backend-api/internal/remediation/policydoc"
	"nhi-backend-api/internal/remediation/provider"
)

func describeSecret(ctx context.Context, c *Clients, id string) (*secretsmanager.DescribeSecretOutput, error) {
	if id == "" {
		return nil, fmt.Errorf("secret_id is required")
	}
	out, err := c.Secrets.DescribeSecret(ctx, &secretsmanager.DescribeSecretInput{SecretId: aws.String(id)})
	if err != nil {
		return nil, fmt.Errorf("read secret %s: %w", id, err)
	}
	return out, nil
}

func secretBase(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) (*secretsmanager.DescribeSecretOutput, bool) {
	id := str(in.Params, "secret_id")
	if id == "" {
		id = in.TargetARN
	}
	d, err := describeSecret(ctx, c, id)
	if err != nil {
		pc.block("secret readable", err.Error())
		return nil, false
	}
	pc.out.TargetARN, pc.out.TargetType = aws.ToString(d.ARN), "secret"
	pc.out.Params["secret_id"] = aws.ToString(d.ARN)
	pc.out.Vars["secret_id"] = aws.ToString(d.ARN)
	return d, true
}

// optDoc reads a document that may be absent / null (no resource policy).
func optDoc(m map[string]any, key string) (*policydoc.Doc, error) {
	if m[key] == nil {
		return nil, nil
	}
	return policydoc.Parse(m[key])
}

func docMapOrNil(d *policydoc.Doc) any {
	if d == nil {
		return nil
	}
	return d.Map()
}

// ---- update_secret_policy ----

type secretPolicy struct{}

func (h *secretPolicy) writeActions() []string {
	return []string{"secretsmanager:PutResourcePolicy", "secretsmanager:DeleteResourcePolicy"}
}
func (h *secretPolicy) resources(t provider.Target) []string { return []string{t.TargetARN} }

func readSecretPolicy(ctx context.Context, c *Clients, secretARN string) (*policydoc.Doc, error) {
	o, err := c.Secrets.GetResourcePolicy(ctx, &secretsmanager.GetResourcePolicyInput{SecretId: aws.String(secretARN)})
	if err != nil {
		return nil, err
	}
	if o.ResourcePolicy == nil || strings.TrimSpace(*o.ResourcePolicy) == "" {
		return nil, nil
	}
	return policydoc.Parse(*o.ResourcePolicy)
}

var restrictingConds = []string{"aws:principalorgid", "aws:principalarn", "aws:sourceaccount", "aws:principalaccount", "aws:sourcearn", "aws:principalorgpaths"}

func hasRestrictingCondition(s map[string]any) bool {
	cond, _ := s["Condition"].(map[string]any)
	for _, ops := range cond {
		m, _ := ops.(map[string]any)
		for k := range m {
			for _, r := range restrictingConds {
				if strings.EqualFold(k, r) {
					return true
				}
			}
		}
	}
	return false
}

func (h *secretPolicy) plan(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) error {
	d, ok := secretBase(ctx, c, in, pc)
	if !ok {
		return nil
	}
	secretARN := aws.ToString(d.ARN)
	before, err := readSecretPolicy(ctx, c, secretARN)
	if err != nil {
		pc.block("resource policy readable", err.Error())
		return nil
	}
	if before == nil {
		pc.block("resource policy exists", "the secret has no resource policy: nothing to restrict")
		return nil
	}
	pc.out.Before = map[string]any{"secret_arn": secretARN, "policy": before.Map()}

	mode := str(in.Params, "mode")
	if mode == "" {
		mode = "block_public"
	}
	pc.out.Params["mode"] = mode
	remove := strs(in.Params, "remove_principals")
	var after *policydoc.Doc
	switch mode {
	case "delete":
		after = nil
		pc.warn("policy removed", "every cross-account / extra principal loses access to the secret")
	case "block_public", "remove_principals":
		if mode == "remove_principals" && len(remove) == 0 {
			pc.block("principals named", "send remove_principals")
			return nil
		}
		after = before.Clone()
		var kept []map[string]any
		for _, s := range after.Statements {
			if !policydoc.IsAllow(s) {
				kept = append(kept, s)
				continue
			}
			pm := principalMap(s)
			if pm == nil {
				kept = append(kept, s)
				continue
			}
			list := policydoc.Strings(pm["AWS"])
			var left []string
			for _, e := range list {
				drop := false
				if mode == "block_public" && e == "*" && !hasRestrictingCondition(s) {
					drop = true
				}
				if mode == "remove_principals" && keepMatches(e, remove) {
					drop = true
				}
				if !drop {
					left = append(left, e)
				}
			}
			if len(left) == 0 && len(policydoc.Strings(pm["Service"])) == 0 && len(policydoc.Strings(pm["Federated"])) == 0 {
				continue
			}
			if len(left) > 0 {
				pm["AWS"] = policydoc.NewList(left)
			} else {
				delete(pm, "AWS")
			}
			s["Principal"] = pm
			kept = append(kept, s)
		}
		after.Statements = kept
		if len(after.Statements) == 0 {
			after = nil
			pc.warn("policy becomes empty", "no statement is left: the resource policy is deleted")
		}
	default:
		pc.block("mode", "mode must be block_public, remove_principals or delete")
		return nil
	}
	if after != nil {
		if len(policydoc.Diff(before, after)) == 0 {
			pc.block("change needed", "no public or matching principal found in the policy")
			return nil
		}
		pc.pass("block public policy", "PutResourcePolicy runs with BlockPublicPolicy=true")
		pc.out.Diff = policydoc.Diff(before, after)
	} else {
		pc.out.Diff = policydoc.Diff(before, &policydoc.Doc{Version: before.Version})
	}
	pc.out.After = map[string]any{"secret_arn": secretARN, "policy": docMapOrNil(after)}
	return nil
}

func (h *secretPolicy) state(ctx context.Context, c *Clients, t provider.Target) (map[string]any, error) {
	d, err := readSecretPolicy(ctx, c, t.TargetARN)
	if err != nil {
		return nil, err
	}
	return map[string]any{"secret_arn": t.TargetARN, "policy": docMapOrNil(d)}, nil
}

func (h *secretPolicy) set(ctx context.Context, c *Clients, r *run, step, secretARN string, doc *policydoc.Doc) error {
	if doc == nil {
		return r.do(step, "secretsmanager:DeleteResourcePolicy", func() (smithymw.Metadata, error) {
			o, err := c.Secrets.DeleteResourcePolicy(ctx, &secretsmanager.DeleteResourcePolicyInput{SecretId: aws.String(secretARN)})
			return mdOf(o, err)
		})
	}
	return r.do(step, "secretsmanager:PutResourcePolicy", func() (smithymw.Metadata, error) {
		o, err := c.Secrets.PutResourcePolicy(ctx, &secretsmanager.PutResourcePolicyInput{SecretId: aws.String(secretARN),
			ResourcePolicy: aws.String(doc.JSON()), BlockPublicPolicy: aws.Bool(true)})
		return mdOf(o, err)
	})
}

func (h *secretPolicy) apply(ctx context.Context, c *Clients, r *run) error {
	before, err := optDoc(r.before, "policy")
	if err != nil {
		return err
	}
	after, err := optDoc(r.in.After, "policy")
	if err != nil {
		return err
	}
	r.snap = map[string]any{"secret_arn": r.t.TargetARN, "policy": docMapOrNil(before)}
	if err := h.set(ctx, c, r, "update the secret resource policy", r.t.TargetARN, after); err != nil {
		return err
	}
	r.result_["secret_policy_updated"] = r.t.TargetARN
	return nil
}

func (h *secretPolicy) verify(ctx context.Context, c *Clients, r *run) (map[string]any, error) {
	cur, err := readSecretPolicy(ctx, c, r.t.TargetARN)
	if err != nil {
		return nil, err
	}
	want, err := optDoc(r.in.After, "policy")
	if err != nil {
		return nil, err
	}
	switch {
	case cur == nil && want == nil:
		return map[string]any{"verified": true}, nil
	case cur == nil || want == nil:
		return map[string]any{"verified": false}, nil
	}
	return map[string]any{"verified": policydoc.Hash(cur.Map()) == policydoc.Hash(want.Map())}, nil
}

func (h *secretPolicy) rollback(ctx context.Context, c *Clients, r *run, snap map[string]any) error {
	doc, err := optDoc(snap, "policy")
	if err != nil {
		return err
	}
	return h.set(ctx, c, r, "restore the previous resource policy", str(snap, "secret_arn"), doc)
}

// ---- rotate_secret ----

type rotateSecret struct{}

func (h *rotateSecret) writeActions() []string {
	return []string{"secretsmanager:RotateSecret", "secretsmanager:UpdateSecretVersionStage"}
}
func (h *rotateSecret) resources(t provider.Target) []string { return []string{t.TargetARN} }

func stageVersion(d *secretsmanager.DescribeSecretOutput, stage string) string {
	for v, stages := range d.VersionIdsToStages {
		for _, s := range stages {
			if s == stage {
				return v
			}
		}
	}
	return ""
}

func (h *rotateSecret) plan(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) error {
	d, ok := secretBase(ctx, c, in, pc)
	if !ok {
		return nil
	}
	if aws.ToString(d.RotationLambdaARN) == "" {
		pc.block("rotation configured", "the secret has no rotation Lambda: this fix is guided only; enable rotation first (Secrets Manager > Rotation > Edit rotation)")
		return nil
	}
	pc.pass("rotation configured", "rotation Lambda "+aws.ToString(d.RotationLambdaARN))
	pc.warn("consumers", "applications must read the secret at run time; a cached value stops working after rotation")
	pc.out.Before = map[string]any{"secret_arn": aws.ToString(d.ARN), "rotation_lambda": aws.ToString(d.RotationLambdaARN)}
	pc.out.After = map[string]any{"secret_arn": aws.ToString(d.ARN), "rotated": true}
	pc.out.UsageBasis = map[string]any{"source": "secretsmanager:DescribeSecret", "last_rotated": d.LastRotatedDate, "last_changed": d.LastChangedDate}
	pc.out.Diff = append(pc.out.Diff, diffField("AWSCURRENT version", stageVersion(d, "AWSCURRENT"), "new version"))
	return nil
}

func (h *rotateSecret) state(ctx context.Context, c *Clients, t provider.Target) (map[string]any, error) {
	d, err := describeSecret(ctx, c, t.TargetARN)
	if err != nil {
		return nil, err
	}
	return map[string]any{"secret_arn": aws.ToString(d.ARN), "rotation_lambda": aws.ToString(d.RotationLambdaARN)}, nil
}

func (h *rotateSecret) apply(ctx context.Context, c *Clients, r *run) error {
	d, err := describeSecret(ctx, c, r.t.TargetARN)
	if err != nil {
		return err
	}
	prev := stageVersion(d, "AWSCURRENT")
	token := uuid.NewString()
	r.snap = map[string]any{"secret_arn": r.t.TargetARN, "previous_version": prev}
	if err := r.do("rotate the secret", "secretsmanager:RotateSecret", func() (smithymw.Metadata, error) {
		o, err := c.Secrets.RotateSecret(ctx, &secretsmanager.RotateSecretInput{SecretId: aws.String(r.t.TargetARN),
			ClientRequestToken: aws.String(token), RotateImmediately: aws.Bool(true)})
		return mdOf(o, err)
	}); err != nil {
		return err
	}
	r.snap["new_version"] = token
	r.result_["previous_version"], r.result_["new_version"] = prev, token
	return nil
}

func (h *rotateSecret) verify(ctx context.Context, c *Clients, r *run) (map[string]any, error) {
	token := str(r.in.Result, "new_version")
	ok, err := waitFor(ctx, func() (bool, error) {
		d, err := describeSecret(ctx, c, r.t.TargetARN)
		if err != nil {
			return false, err
		}
		for _, s := range d.VersionIdsToStages[token] {
			if s == "AWSCURRENT" {
				return true, nil
			}
		}
		return false, nil
	})
	if err != nil {
		return nil, err
	}
	res := map[string]any{"verified": ok, "new_version": token}
	if !ok {
		res["note"] = "the rotation was accepted but AWSCURRENT did not move yet; check the rotation Lambda logs"
	}
	return res, nil
}

func (h *rotateSecret) rollback(ctx context.Context, c *Clients, r *run, snap map[string]any) error {
	prev, cur := str(snap, "previous_version"), str(snap, "new_version")
	if prev == "" {
		return fmt.Errorf("no previous version was recorded")
	}
	return r.do("move AWSCURRENT back to the previous version", "secretsmanager:UpdateSecretVersionStage", func() (smithymw.Metadata, error) {
		in := &secretsmanager.UpdateSecretVersionStageInput{SecretId: aws.String(str(snap, "secret_arn")),
			VersionStage: aws.String("AWSCURRENT"), MoveToVersionId: aws.String(prev)}
		if cur != "" {
			in.RemoveFromVersionId = aws.String(cur)
		}
		o, err := c.Secrets.UpdateSecretVersionStage(ctx, in)
		return mdOf(o, err)
	})
}
