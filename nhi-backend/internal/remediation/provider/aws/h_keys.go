package awsprov

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/iam"
	iamtypes "github.com/aws/aws-sdk-go-v2/service/iam/types"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"
	smithymw "github.com/aws/smithy-go/middleware"

	"nhi-backend-api/internal/remediation/catalog"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/provider"
)

func keyTarget(in provider.Target) (userName, keyID string) {
	return str(in.Params, "user_name"), str(in.Params, "access_key_id")
}

// findKey returns the access key of a user.
func findKey(ctx context.Context, c *Clients, user, keyID string) (*iamtypes.AccessKeyMetadata, []iamtypes.AccessKeyMetadata, error) {
	out, err := c.IAM.ListAccessKeys(ctx, &iam.ListAccessKeysInput{UserName: aws.String(user)})
	if err != nil {
		return nil, nil, err
	}
	for i := range out.AccessKeyMetadata {
		if aws.ToString(out.AccessKeyMetadata[i].AccessKeyId) == keyID {
			return &out.AccessKeyMetadata[i], out.AccessKeyMetadata, nil
		}
	}
	return nil, out.AccessKeyMetadata, nil
}

// lastUsed reads GetAccessKeyLastUsed (volatile: kept out of the hashed state).
func lastUsed(ctx context.Context, c *Clients, keyID string) (*time.Time, string, error) {
	out, err := c.IAM.GetAccessKeyLastUsed(ctx, &iam.GetAccessKeyLastUsedInput{AccessKeyId: aws.String(keyID)})
	if err != nil {
		return nil, "", err
	}
	if out.AccessKeyLastUsed == nil || out.AccessKeyLastUsed.LastUsedDate == nil {
		return nil, "", nil
	}
	svc := aws.ToString(out.AccessKeyLastUsed.ServiceName)
	return out.AccessKeyLastUsed.LastUsedDate, svc + "/" + aws.ToString(out.AccessKeyLastUsed.Region), nil
}

func userKeyPlanBase(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) (user, keyID string, key *iamtypes.AccessKeyMetadata, all []iamtypes.AccessKeyMetadata, ok bool) {
	user, keyID = resolveKeyTarget(ctx, c, in.Target, pc)
	if user == "" || keyID == "" {
		pc.block("key identified", "user_name and access_key_id are required (the finding evidence did not contain them and they could not be looked up)")
		return
	}
	pc.out.TargetARN, pc.out.TargetType = userARN(in.Account.AccountID, user), "iam_user"
	pc.out.Params["user_name"], pc.out.Params["access_key_id"] = user, keyID
	pc.out.Vars["user_name"], pc.out.Vars["access_key_id"] = user, keyID
	var err error
	key, all, err = findKey(ctx, c, user, keyID)
	if err != nil {
		pc.block("key readable", err.Error())
		return
	}
	if key == nil {
		pc.block("key exists", fmt.Sprintf("access key %s of %s does not exist any more", keyID, user))
		return
	}
	pc.out.Before = keyState(user, key)
	ok = true
	return
}

func keyState(user string, k *iamtypes.AccessKeyMetadata) map[string]any {
	return map[string]any{"user_name": user, "access_key_id": aws.ToString(k.AccessKeyId), "status": string(k.Status)}
}

// ---- deactivate_key / delete_key ----

type keyStatus struct{ kind string }

func (h *keyStatus) writeActions() []string {
	if h.kind == catalog.DeleteKey {
		return []string{"iam:DeleteAccessKey"}
	}
	return []string{"iam:UpdateAccessKey"}
}
func (h *keyStatus) resources(t provider.Target) []string { return []string{t.TargetARN} }

func (h *keyStatus) plan(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) error {
	user, keyID, key, all, ok := userKeyPlanBase(ctx, c, in, pc)
	if !ok {
		return nil
	}
	active := 0
	for _, k := range all {
		if k.Status == iamtypes.StatusTypeActive {
			active++
		}
	}
	used, where, err := lastUsed(ctx, c, keyID)
	if err != nil {
		pc.warn("last use readable", err.Error())
	}
	pc.out.UsageBasis = map[string]any{"source": "iam:GetAccessKeyLastUsed", "last_used": used, "last_used_in": where}

	switch h.kind {
	case catalog.DeactivateKey:
		if key.Status != iamtypes.StatusTypeActive {
			pc.block("key is active", "the key is already inactive")
			return nil
		}
		if boolean(in.Params, "skip_usage_check") {
			pc.warn("recent use", "usage check skipped: the finding says the key is exposed (immediate deactivation)")
		} else if used != nil && time.Since(*used) < time.Duration(in.MinKeyIdleDays)*24*time.Hour {
			pc.block("key not in use", fmt.Sprintf("the key was used %s ago (%s); wait until it is idle for %d days or deactivate by hand",
				time.Since(*used).Round(time.Minute), where, in.MinKeyIdleDays))
		} else {
			pc.pass("key not in use", "no use in the last "+fmt.Sprint(in.MinKeyIdleDays)+" days")
		}
		if active == 1 {
			pc.warn("only active key", user+" has no other active key: the workload using it will stop")
		}
		pc.out.After = map[string]any{"user_name": user, "access_key_id": keyID, "status": "Inactive"}
	case catalog.DeleteKey:
		if key.Status == iamtypes.StatusTypeActive && !boolean(in.Params, "allow_delete_active") {
			pc.block("key is inactive", "deactivate the key first and delete it after the grace period")
		} else {
			pc.pass("key is inactive", "")
		}
		pc.warn("irreversible", "a deleted access key cannot be restored")
		pc.out.After = map[string]any{"user_name": user, "access_key_id": keyID, "status": "Deleted"}
	}
	pc.out.Diff = nil
	pc.out.Diff = append(pc.out.Diff, diffField("status", pc.out.Before["status"], pc.out.After["status"]))
	return nil
}

func (h *keyStatus) state(ctx context.Context, c *Clients, t provider.Target) (map[string]any, error) {
	user, keyID := keyTarget(t)
	k, _, err := findKey(ctx, c, user, keyID)
	if err != nil {
		return nil, err
	}
	if k == nil {
		return map[string]any{"user_name": user, "access_key_id": keyID, "status": "Missing"}, nil
	}
	return keyState(user, k), nil
}

func (h *keyStatus) apply(ctx context.Context, c *Clients, r *run) error {
	user, keyID := keyTarget(r.t)
	r.snap = map[string]any{"user_name": user, "access_key_id": keyID, "previous_status": str(r.before, "status")}
	if h.kind == catalog.DeleteKey {
		if err := r.do("delete the access key", "iam:DeleteAccessKey", func() (smithymw.Metadata, error) {
			o, err := c.IAM.DeleteAccessKey(ctx, &iam.DeleteAccessKeyInput{UserName: aws.String(user), AccessKeyId: aws.String(keyID)})
			return mdOf(o, err)
		}); err != nil {
			return err
		}
		r.result_["deleted"] = keyID
		return nil
	}
	if err := r.do("set the access key Inactive", "iam:UpdateAccessKey", func() (smithymw.Metadata, error) {
		o, err := c.IAM.UpdateAccessKey(ctx, &iam.UpdateAccessKeyInput{UserName: aws.String(user), AccessKeyId: aws.String(keyID), Status: iamtypes.StatusTypeInactive})
		return mdOf(o, err)
	}); err != nil {
		return err
	}
	r.undoWith("set the access key Active again", func(ctx context.Context) error {
		_, err := c.IAM.UpdateAccessKey(ctx, &iam.UpdateAccessKeyInput{UserName: aws.String(user), AccessKeyId: aws.String(keyID), Status: iamtypes.StatusTypeActive})
		return err
	})
	r.result_["deactivated"] = keyID
	return nil
}

func (h *keyStatus) verify(ctx context.Context, c *Clients, r *run) (map[string]any, error) {
	user, keyID := keyTarget(r.t)
	k, _, err := findKey(ctx, c, user, keyID)
	if err != nil {
		return nil, err
	}
	if h.kind == catalog.DeleteKey {
		return map[string]any{"verified": k == nil}, nil
	}
	return map[string]any{"verified": k != nil && k.Status == iamtypes.StatusTypeInactive}, nil
}

func (h *keyStatus) rollback(ctx context.Context, c *Clients, r *run, snap map[string]any) error {
	if h.kind == catalog.DeleteKey {
		return fmt.Errorf("a deleted access key cannot be restored")
	}
	user, keyID := str(snap, "user_name"), str(snap, "access_key_id")
	return r.do("set the access key Active again", "iam:UpdateAccessKey", func() (smithymw.Metadata, error) {
		o, err := c.IAM.UpdateAccessKey(ctx, &iam.UpdateAccessKeyInput{UserName: aws.String(user), AccessKeyId: aws.String(keyID), Status: iamtypes.StatusTypeActive})
		return mdOf(o, err)
	})
}

// ---- rotate_access_key (two phases) ----

type rotateKey struct{}

func (h *rotateKey) writeActions() []string {
	return []string{"iam:CreateAccessKey", "iam:UpdateAccessKey", "iam:DeleteAccessKey", "secretsmanager:PutSecretValue", "secretsmanager:UpdateSecretVersionStage"}
}

func (h *rotateKey) resources(t provider.Target) []string {
	res := []string{t.TargetARN}
	if s := str(t.Params, "delivery_secret_arn"); s != "" {
		res = append(res, s)
	}
	return res
}

func (h *rotateKey) plan(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) error {
	user, keyID, key, all, ok := userKeyPlanBase(ctx, c, in, pc)
	if !ok {
		return nil
	}
	pc.out.Before["key_count"] = len(all)
	if key.Status != iamtypes.StatusTypeActive {
		pc.block("key is active", "only an active key needs rotation")
	}
	if len(all) >= 2 {
		pc.block("free key slot", user+" already has two access keys: delete or deactivate the unused one first")
	} else {
		pc.pass("free key slot", "")
	}
	secretARN := str(in.Params, "delivery_secret_arn")
	switch {
	case secretARN != "":
		if _, err := c.Secrets.DescribeSecret(ctx, &secretsmanager.DescribeSecretInput{SecretId: aws.String(secretARN)}); err != nil {
			pc.block("delivery secret", "cannot read "+secretARN+": "+err.Error())
		} else {
			pc.pass("delivery secret", "the new key is written to "+secretARN)
		}
	case boolean(in.Params, "show_once"):
		pc.warn("delivery", "the new key is shown once to the requester and is not stored anywhere")
	default:
		pc.block("delivery", "send delivery_secret_arn (a Secrets Manager secret the application reads) or show_once=true")
	}
	used, where, _ := lastUsed(ctx, c, keyID)
	pc.out.UsageBasis = map[string]any{"source": "iam:GetAccessKeyLastUsed", "last_used": used, "last_used_in": where}
	pc.warn("two phases", "the old key stays active until the new key is used; then it is deactivated (and a delete plan is prepared)")
	pc.out.After = map[string]any{"user_name": user, "create_new_key": true, "deactivate_old_key_after_cutover": keyID}
	pc.out.Diff = append(pc.out.Diff, diffField("access keys", len(all), len(all)+1))
	return nil
}

func (h *rotateKey) state(ctx context.Context, c *Clients, t provider.Target) (map[string]any, error) {
	user, keyID := keyTarget(t)
	k, all, err := findKey(ctx, c, user, keyID)
	if err != nil {
		return nil, err
	}
	st := map[string]any{"user_name": user, "access_key_id": keyID, "status": "Missing", "key_count": len(all)}
	if k != nil {
		st["status"] = string(k.Status)
	}
	return st, nil
}

func (h *rotateKey) apply(ctx context.Context, c *Clients, r *run) error {
	user, oldID := keyTarget(r.t)
	secretARN := str(r.t.Params, "delivery_secret_arn")
	r.snap = map[string]any{"user_name": user, "old_access_key_id": oldID}

	// remember AWSCURRENT of the delivery secret so rollback can move it back
	if secretARN != "" && !r.dry {
		d, err := c.Secrets.DescribeSecret(ctx, &secretsmanager.DescribeSecretInput{SecretId: aws.String(secretARN)})
		if err != nil {
			return fmt.Errorf("read delivery secret: %w", err)
		}
		for v, stages := range d.VersionIdsToStages {
			for _, s := range stages {
				if s == "AWSCURRENT" {
					r.snap["delivery_secret_arn"], r.snap["previous_secret_version"] = secretARN, v
				}
			}
		}
	}
	var newID, newSecret string
	if err := r.do("create the new access key", "iam:CreateAccessKey", func() (smithymw.Metadata, error) {
		o, err := c.IAM.CreateAccessKey(ctx, &iam.CreateAccessKeyInput{UserName: aws.String(user)})
		if err == nil && o.AccessKey != nil {
			newID, newSecret = aws.ToString(o.AccessKey.AccessKeyId), aws.ToString(o.AccessKey.SecretAccessKey)
		}
		return mdOf(o, err)
	}); err != nil {
		return err
	}
	r.snap["new_access_key_id"] = newID
	r.undoWith("delete the new access key", func(ctx context.Context) error {
		_, err := c.IAM.DeleteAccessKey(ctx, &iam.DeleteAccessKeyInput{UserName: aws.String(user), AccessKeyId: aws.String(newID)})
		return err
	})
	if secretARN != "" {
		payload, _ := json.Marshal(map[string]string{"UserName": user, "AccessKeyId": newID, "SecretAccessKey": newSecret})
		err := r.do("deliver the new key to Secrets Manager", "secretsmanager:PutSecretValue", func() (smithymw.Metadata, error) {
			o, err := c.Secrets.PutSecretValue(ctx, &secretsmanager.PutSecretValueInput{SecretId: aws.String(secretARN), SecretString: aws.String(string(payload))})
			return mdOf(o, err)
		})
		newSecret = "" // never keep key material longer than needed
		if err != nil {
			return err
		}
		r.result_["delivered_to"] = secretARN
	} else {
		r.res.OneTime = map[string]string{"AccessKeyId": newID, "SecretAccessKey": newSecret}
		newSecret = ""
		r.result_["delivered_to"] = "shown once to the requester"
	}
	r.result_["new_access_key_id"], r.result_["old_access_key_id"], r.result_["phase"] = newID, oldID, "awaiting_cutover"
	return nil
}

func (h *rotateKey) verify(ctx context.Context, c *Clients, r *run) (map[string]any, error) {
	user, _ := keyTarget(r.t)
	newID := str(r.in.Result, "new_access_key_id")
	k, _, err := findKey(ctx, c, user, newID)
	if err != nil {
		return nil, err
	}
	return map[string]any{"verified": k != nil && k.Status == iamtypes.StatusTypeActive, "new_access_key_id": newID, "phase": "awaiting_cutover"}, nil
}

func (h *rotateKey) rollback(ctx context.Context, c *Clients, r *run, snap map[string]any) error {
	user, oldID, newID := str(snap, "user_name"), str(snap, "old_access_key_id"), str(snap, "new_access_key_id")
	if newID != "" {
		if err := r.do("delete the new access key", "iam:DeleteAccessKey", func() (smithymw.Metadata, error) {
			o, err := c.IAM.DeleteAccessKey(ctx, &iam.DeleteAccessKeyInput{UserName: aws.String(user), AccessKeyId: aws.String(newID)})
			if isNotFound(err) {
				err = nil
			}
			return mdOf(o, err)
		}); err != nil {
			return err
		}
	}
	if err := r.do("make sure the old key is Active", "iam:UpdateAccessKey", func() (smithymw.Metadata, error) {
		o, err := c.IAM.UpdateAccessKey(ctx, &iam.UpdateAccessKeyInput{UserName: aws.String(user), AccessKeyId: aws.String(oldID), Status: iamtypes.StatusTypeActive})
		return mdOf(o, err)
	}); err != nil {
		return err
	}
	if sec, prev := str(snap, "delivery_secret_arn"), str(snap, "previous_secret_version"); sec != "" && prev != "" {
		d, err := c.Secrets.DescribeSecret(ctx, &secretsmanager.DescribeSecretInput{SecretId: aws.String(sec)})
		if err != nil {
			return err
		}
		cur := ""
		for v, stages := range d.VersionIdsToStages {
			for _, s := range stages {
				if s == "AWSCURRENT" {
					cur = v
				}
			}
		}
		if cur != "" && cur != prev {
			return r.do("move AWSCURRENT of the delivery secret back", "secretsmanager:UpdateSecretVersionStage", func() (smithymw.Metadata, error) {
				o, err := c.Secrets.UpdateSecretVersionStage(ctx, &secretsmanager.UpdateSecretVersionStageInput{SecretId: aws.String(sec),
					VersionStage: aws.String("AWSCURRENT"), MoveToVersionId: aws.String(prev), RemoveFromVersionId: aws.String(cur)})
				return mdOf(o, err)
			})
		}
	}
	return nil
}

// finalize is phase 2: once the new key is used, deactivate the old one.
func (h *rotateKey) finalize(ctx context.Context, c *Clients, r *run, execResult map[string]any) (*provider.FinalizeOutcome, error) {
	user := str(execResult, "user_name")
	if user == "" {
		user, _ = keyTarget(r.t)
	}
	oldID, newID := str(execResult, "old_access_key_id"), str(execResult, "new_access_key_id")
	used, where, err := lastUsed(ctx, c, newID)
	if err != nil {
		return nil, err
	}
	if used == nil {
		return &provider.FinalizeOutcome{Done: false, Detail: "the new key " + newID + " has not been used yet"}, nil
	}
	if err := r.do("deactivate the old access key", "iam:UpdateAccessKey", func() (smithymw.Metadata, error) {
		o, err := c.IAM.UpdateAccessKey(ctx, &iam.UpdateAccessKeyInput{UserName: aws.String(user), AccessKeyId: aws.String(oldID), Status: iamtypes.StatusTypeInactive})
		return mdOf(o, err)
	}); err != nil {
		return nil, err
	}
	r.result_["old_key_deactivated"], r.result_["new_key_first_used"], r.result_["new_key_used_in"] = oldID, used, where
	return &provider.FinalizeOutcome{
		Done:   true,
		Detail: "new key used; old key " + oldID + " deactivated",
		NextPlan: &provider.FollowUp{ActionType: catalog.DeleteKey, TargetARN: userARN(accountOf(r.t.TargetARN), user), TargetType: "iam_user",
			Params: map[string]any{"user_name": user, "access_key_id": oldID}, Reason: "follow-up of the rotation: delete the deactivated key after the grace period"},
	}, nil
}

// ---- set_session_duration ----

type sessionDuration struct{}

func (h *sessionDuration) writeActions() []string               { return []string{"iam:UpdateRole"} }
func (h *sessionDuration) resources(t provider.Target) []string { return []string{t.TargetARN} }

func (h *sessionDuration) plan(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) error {
	roleARN := in.TargetARN
	if roleARN == "" {
		roleARN = str(in.Params, "role_arn")
	}
	pc.out.TargetARN, pc.out.TargetType = roleARN, "iam_role"
	name, ok := roleChecks(ctx, c, in.Target, pc, roleARN)
	if !ok {
		return nil
	}
	want := integer(in.Params, "new_max_session", 3600)
	pc.out.Params["role_arn"], pc.out.Params["new_max_session"] = roleARN, want
	pc.out.Vars["role_name"], pc.out.Vars["new_max_session"] = name, fmt.Sprint(want)
	role, err := c.IAM.GetRole(ctx, &iam.GetRoleInput{RoleName: aws.String(name)})
	if err != nil {
		pc.block("role readable", err.Error())
		return nil
	}
	cur := int(aws.ToInt32(role.Role.MaxSessionDuration))
	pc.out.Before = map[string]any{"role_arn": roleARN, "max_session_duration": cur}
	pc.out.After = map[string]any{"role_arn": roleARN, "max_session_duration": want}
	if want < 3600 || want > 43200 {
		pc.block("valid duration", "MaxSessionDuration must be between 3600 and 43200 seconds")
	}
	if want >= cur {
		pc.block("lowers the duration", fmt.Sprintf("the role already allows %d seconds (requested %d)", cur, want))
	} else {
		pc.pass("lowers the duration", fmt.Sprintf("%d -> %d seconds", cur, want))
	}
	pc.warn("long-running jobs", "sessions longer than the new value will fail to be created; check jobs that assume this role with a longer duration")
	pc.out.Diff = []domain.DiffEntry{diffField("max_session_duration", cur, want)}
	return nil
}

func (h *sessionDuration) state(ctx context.Context, c *Clients, t provider.Target) (map[string]any, error) {
	name, err := roleName(t.TargetARN)
	if err != nil {
		return nil, err
	}
	role, err := c.IAM.GetRole(ctx, &iam.GetRoleInput{RoleName: aws.String(name)})
	if err != nil {
		return nil, err
	}
	return map[string]any{"role_arn": t.TargetARN, "max_session_duration": int(aws.ToInt32(role.Role.MaxSessionDuration))}, nil
}

func (h *sessionDuration) apply(ctx context.Context, c *Clients, r *run) error {
	name, err := roleName(r.t.TargetARN)
	if err != nil {
		return err
	}
	prev := integer(r.before, "max_session_duration", 3600)
	want := integer(r.t.Params, "new_max_session", 3600)
	r.snap = map[string]any{"role_name": name, "max_session_duration": prev}
	if err := r.do("lower MaxSessionDuration", "iam:UpdateRole", func() (smithymw.Metadata, error) {
		o, err := c.IAM.UpdateRole(ctx, &iam.UpdateRoleInput{RoleName: aws.String(name), MaxSessionDuration: aws.Int32(int32(want))})
		return mdOf(o, err)
	}); err != nil {
		return err
	}
	r.result_["max_session_duration"] = want
	return nil
}

func (h *sessionDuration) verify(ctx context.Context, c *Clients, r *run) (map[string]any, error) {
	st, err := h.state(ctx, c, r.t)
	if err != nil {
		return nil, err
	}
	return map[string]any{"verified": integer(st, "max_session_duration", 0) == integer(r.t.Params, "new_max_session", 3600)}, nil
}

func (h *sessionDuration) rollback(ctx context.Context, c *Clients, r *run, snap map[string]any) error {
	return r.do("restore MaxSessionDuration", "iam:UpdateRole", func() (smithymw.Metadata, error) {
		o, err := c.IAM.UpdateRole(ctx, &iam.UpdateRoleInput{RoleName: aws.String(str(snap, "role_name")),
			MaxSessionDuration: aws.Int32(int32(integer(snap, "max_session_duration", 3600)))})
		return mdOf(o, err)
	})
}

// resolveKeyTarget completes the key target of a plan:
//   - several candidate keys (IAM-03, O10, M09, IAM-04, CICD-03): the active key used
//     least recently is chosen (never-used first), the others are named in a pre-check;
//   - no user name (CR-009, IAM-04, CICD-03): it is read from the key id with
//     iam:GetAccessKeyLastUsed, which returns the owning user.
func resolveKeyTarget(ctx context.Context, c *Clients, t provider.Target, pc *planCtx) (user, keyID string) {
	user, keyID = keyTarget(t)
	cands := strList(t.Params, "access_key_candidates")
	if len(cands) > 1 {
		keyID = ""
		var best string
		var bestUsed *time.Time
		var bestUser string
		for _, id := range cands {
			out, err := c.IAM.GetAccessKeyLastUsed(ctx, &iam.GetAccessKeyLastUsedInput{AccessKeyId: aws.String(id)})
			if err != nil {
				continue
			}
			var used *time.Time
			if out.AccessKeyLastUsed != nil {
				used = out.AccessKeyLastUsed.LastUsedDate
			}
			if best == "" || olderUse(used, bestUsed) {
				best, bestUsed, bestUser = id, used, aws.ToString(out.UserName)
			}
		}
		keyID = best
		if user == "" {
			user = bestUser
		}
		if best != "" {
			pc.warn("key chosen", fmt.Sprintf("the finding names %d keys (%s); this plan changes %s, the one used least recently. Create another plan for the others if needed.",
				len(cands), strings.Join(cands, ", "), best))
		}
	}
	if user == "" && keyID != "" && !strings.Contains(keyID, ",") {
		if out, err := c.IAM.GetAccessKeyLastUsed(ctx, &iam.GetAccessKeyLastUsedInput{AccessKeyId: aws.String(keyID)}); err == nil {
			user = aws.ToString(out.UserName)
		}
	}
	return user, keyID
}

// olderUse: never used (nil) counts as oldest.
func olderUse(a, b *time.Time) bool {
	switch {
	case a == nil && b != nil:
		return true
	case a != nil && b == nil:
		return false
	case a == nil && b == nil:
		return false
	}
	return a.Before(*b)
}

func strList(m map[string]any, k string) []string {
	var out []string
	switch t := m[k].(type) {
	case []any:
		for _, x := range t {
			if s, ok := x.(string); ok && s != "" {
				out = append(out, s)
			}
		}
	case []string:
		out = append(out, t...)
	}
	return out
}
