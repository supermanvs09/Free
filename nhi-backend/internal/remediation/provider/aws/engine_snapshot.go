package awsprov

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/iam"
	smithymw "github.com/aws/smithy-go/middleware"

	"nhi-backend-api/internal/platform/awsconnect"
	"nhi-backend-api/internal/remediation/catalog"
	"nhi-backend-api/internal/remediation/provider"
)

// Rollback of plans created by the rule engine's automatic remediation (policy_id set).
//
// The engine stores its own undo snapshot in remediation_executions.rollback_state (the `o.rb`
// map of internal/autorem). Its keys differ from this provider's snapshots for some actions, so
// the snapshot is converted before the normal handler rollback runs:
//
//	action                 engine snapshot                                  handler expects
//	deactivate_key         user_name, access_key_id                         same
//	enable_key_rotation    key_arn                                          same
//	rotate_secret          secret_arn, previous_version, new_version        same
//	set_session_duration   role_arn, max_session_duration                   role_name, max_session_duration
//	rewrite_trust          role_arn, trust_policy                           role_name, trust_policy
//	update_key_policy      key_arn, key_policy                              key_arn, policy
//	update_secret_policy   secret_arn, resource_policy                      secret_arn, policy
//	revoke_grant           grants[{grant_id, grantee, retiring_principal}]  grants[{id, grantee, retiring}]
//	rotate_access_key      user_name, new_access_key_id                     + old_access_key_id (absent: old key untouched)
//	scope_policy           role_arn, changes[{kind, ...}]                   replayed here in reverse (engineScopeUndo)

// fromEngineSnapshot converts an engine rollback snapshot to this provider's format.
func fromEngineSnapshot(action string, s map[string]any) (map[string]any, error) {
	if len(s) == 0 {
		return nil, fmt.Errorf("the engine stored no rollback snapshot for this plan")
	}
	out := map[string]any{}
	for k, v := range s {
		out[k] = v
	}
	roleFromARN := func() error {
		if str(out, "role_name") != "" {
			return nil
		}
		n, err := roleName(str(out, "role_arn"))
		if err != nil {
			return fmt.Errorf("engine snapshot: %w", err)
		}
		out["role_name"] = n
		return nil
	}
	switch action {
	case catalog.SetSessionDuration, catalog.RewriteTrust:
		if err := roleFromARN(); err != nil {
			return nil, err
		}
	case catalog.UpdateKeyPolicy:
		if _, ok := out["policy"]; !ok {
			out["policy"] = out["key_policy"]
		}
	case catalog.UpdateSecretPolicy:
		if _, ok := out["policy"]; !ok {
			if rp := str(out, "resource_policy"); rp != "" {
				out["policy"] = rp
			}
		}
	case catalog.RevokeGrant:
		raw, _ := json.Marshal(out["grants"])
		var eg []struct {
			GrantID    string   `json:"grant_id"`
			ID         string   `json:"id"`
			Grantee    string   `json:"grantee"`
			Retiring   string   `json:"retiring_principal"`
			Operations []string `json:"operations"`
			Name       string   `json:"name"`
		}
		_ = json.Unmarshal(raw, &eg)
		gs := make([]grantInfo, 0, len(eg))
		for _, g := range eg {
			gs = append(gs, grantInfo{ID: firstNonEmptyStr(g.ID, g.GrantID), Name: g.Name, Grantee: g.Grantee, Retiring: g.Retiring, Operations: g.Operations})
		}
		out["grants"] = gs
	}
	return out, nil
}

// engineScopeChange is one entry of the engine's scope_policy snapshot (autorem.scopeChange).
type engineScopeChange struct {
	Kind       string `json:"kind"` // inline | managed | aws_managed
	Name       string `json:"name"`
	PolicyARN  string `json:"policy_arn"`
	OldDoc     string `json:"old_doc"`
	OldVersion string `json:"old_version"`
	NewVersion string `json:"new_version"`
	CreatedARN string `json:"created_policy_arn"`
}

// engineScopeUndo restores every policy the engine's scope_policy changed, newest change first.
func (p *Provider) engineScopeUndo(ctx context.Context, in provider.RollbackInput) (*provider.RunResult, error) {
	s := in.RollbackState
	role, err := roleName(str(s, "role_arn"))
	if err != nil {
		return &provider.RunResult{}, fmt.Errorf("engine snapshot: %w", err)
	}
	raw, _ := json.Marshal(s["changes"])
	var changes []engineScopeChange
	_ = json.Unmarshal(raw, &changes)
	if len(changes) == 0 {
		return &provider.RunResult{}, fmt.Errorf("the engine stored no scope_policy changes for this plan")
	}
	res := []string{str(s, "role_arn")}
	for _, ch := range changes {
		for _, a := range []string{ch.PolicyARN, ch.CreatedARN} {
			if a != "" {
				res = append(res, a)
			}
		}
	}
	pol := sessionPolicy([]string{"iam:PutRolePolicy", "iam:SetDefaultPolicyVersion", "iam:AttachRolePolicy",
		"iam:DetachRolePolicy", "iam:DeletePolicy"}, res)
	c, err := p.factory(ctx, in.Target.Account, p.regionOf(in.Target), awsconnect.SessionName(in.SessionName), pol)
	if err != nil {
		return &provider.RunResult{}, err
	}
	r := newRun(in.Target, in.RunInput)
	r.res.AssumedRole = in.Account.RoleARN
	for i := len(changes) - 1; i >= 0; i-- {
		ch := changes[i]
		switch ch.Kind {
		case "inline":
			err = r.do("restore inline policy "+ch.Name, "iam:PutRolePolicy", func() (smithymw.Metadata, error) {
				o, err := c.IAM.PutRolePolicy(ctx, &iam.PutRolePolicyInput{RoleName: aws.String(role), PolicyName: aws.String(ch.Name),
					PolicyDocument: aws.String(ch.OldDoc)})
				return mdOf(o, err)
			})
		case "managed":
			if ch.NewVersion == "" {
				continue // the engine never created the new version
			}
			err = r.do("make "+ch.OldVersion+" the default version of "+ch.PolicyARN, "iam:SetDefaultPolicyVersion", func() (smithymw.Metadata, error) {
				o, err := c.IAM.SetDefaultPolicyVersion(ctx, &iam.SetDefaultPolicyVersionInput{PolicyArn: aws.String(ch.PolicyARN),
					VersionId: aws.String(ch.OldVersion)})
				return mdOf(o, err)
			})
		case "aws_managed":
			err = r.do("attach "+ch.PolicyARN+" again", "iam:AttachRolePolicy", func() (smithymw.Metadata, error) {
				o, err := c.IAM.AttachRolePolicy(ctx, &iam.AttachRolePolicyInput{RoleName: aws.String(role), PolicyArn: aws.String(ch.PolicyARN)})
				return mdOf(o, err)
			})
			if err == nil && ch.CreatedARN != "" {
				err = r.do("detach the generated policy", "iam:DetachRolePolicy", func() (smithymw.Metadata, error) {
					o, err := c.IAM.DetachRolePolicy(ctx, &iam.DetachRolePolicyInput{RoleName: aws.String(role), PolicyArn: aws.String(ch.CreatedARN)})
					if isNotFound(err) {
						err = nil
					}
					return mdOf(o, err)
				})
				if err == nil {
					err = r.do("delete the generated policy", "iam:DeletePolicy", func() (smithymw.Metadata, error) {
						o, err := c.IAM.DeletePolicy(ctx, &iam.DeletePolicyInput{PolicyArn: aws.String(ch.CreatedARN)})
						if isNotFound(err) {
							err = nil
						}
						return mdOf(o, err)
					})
				}
			}
		default:
			err = fmt.Errorf("unknown scope_policy change kind %q", ch.Kind)
		}
		if err != nil {
			return r.result(), err
		}
	}
	return r.result(), nil
}

func firstNonEmptyStr(v ...string) string {
	for _, s := range v {
		if strings.TrimSpace(s) != "" {
			return s
		}
	}
	return ""
}
