package awsprov

// Reme4: AMIs, EBS snapshots and RDS snapshots shared publicly or with other accounts, and
// Reme5: instance metadata (IMDSv2 / hop limit).
//
//	unshare_ami           EC2-07  launchPermission:      remove "all" and the named accounts
//	unshare_snapshot      EC2-08  createVolumePermission: remove "all" and the named accounts
//	unshare_rds_snapshot  RDS-02  restore attribute:      remove "all" and the named accounts
//	enforce_imds          EC2-01, EC2-02: HttpTokens=required, hop limit (default 1)
//
// Public sharing is always removed. An account share is removed when the finding (or
// params.remove_principals) names the account, or with params.remove_all_accounts=true; other
// shares, and organization / OU shares of an AMI, are kept and named in a pre-check.
// Rollback adds back exactly the shares that were removed.

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/aws/arn"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	ec2types "github.com/aws/aws-sdk-go-v2/service/ec2/types"
	"github.com/aws/aws-sdk-go-v2/service/rds"
	smithymw "github.com/aws/smithy-go/middleware"

	"nhi-backend-api/internal/remediation/catalog"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/provider"
)

var (
	reAMI        = regexp.MustCompile(`ami-[0-9a-f]{8,17}`)
	reSnapshot   = regexp.MustCompile(`snap-[0-9a-f]{8,17}`)
	reInstance   = regexp.MustCompile(`i-[0-9a-f]{8,17}`)
	reRDSSnapARN = regexp.MustCompile(`arn:aws[a-z-]*:rds:[a-z0-9-]+:\d{12}:(cluster-snapshot|snapshot):[A-Za-z0-9:\-]+`)
	reRDSSnapID  = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9:\-]{0,254}$`)
)

// planRegion is the region the plan reads in: the region in params, else the session's region.
func planRegion(in provider.PlanInput, pc *planCtx) string {
	if r := str(in.Params, "region"); r != "" {
		return r
	}
	return pc.region
}

// sharesToRemove splits the current shares into removed and kept ones.
func sharesToRemove(cur []string, named []string, all bool) (remove, keep []string) {
	want := map[string]bool{}
	for _, n := range named {
		if a := principalAccount(strings.TrimSpace(n)); a != "" {
			want[a] = true
		}
	}
	for _, s := range cur {
		switch {
		case s == "all":
			remove = append(remove, s)
		case accountIDRe.MatchString(s) && (all || want[s]):
			remove = append(remove, s)
		default:
			keep = append(keep, s)
		}
	}
	return remove, keep
}

// planSharing is the common plan of the three unshare actions.
func planSharing(pc *planCtx, in provider.PlanInput, kind, id string, cur []string) {
	pc.out.Flags.ExternalPrincipals = true
	remove, keep := sharesToRemove(cur, strs(in.Params, "remove_principals"), boolean(in.Params, "remove_all_accounts"))
	pc.out.Before = map[string]any{"id": id, "shares": cur}
	pc.out.After = map[string]any{"id": id, "shares": keep, "removed": remove}
	if len(cur) == 0 {
		pc.block("shared", "the "+kind+" is not shared with anyone: nothing to change")
		return
	}
	if len(remove) == 0 {
		pc.block("change needed", "the "+kind+" is not public and none of its shared accounts is named by the finding: send params.remove_principals or remove_all_accounts=true")
		return
	}
	for _, s := range remove {
		if s == "all" {
			pc.out.Diff = append(pc.out.Diff, domain.DiffEntry{Path: "shared_with", Change: "removed", Before: "everyone (public)"})
		} else {
			pc.out.Diff = append(pc.out.Diff, domain.DiffEntry{Path: "shared_with", Change: "removed", Before: s})
		}
	}
	pc.pass("shares removed", strings.Join(remove, ", "))
	if len(keep) > 0 {
		pc.warn("shares kept", "still shared with "+strings.Join(keep, ", ")+" (not named by the finding)")
	}
	pc.warn("consumers", "the removed accounts can no longer use the "+kind+"; copies they already made are not affected")
}

func sliceOf(m map[string]any, k string) []string { return strs(m, k) }

// ---- unshare_ami / unshare_snapshot ----

type ec2Sharing struct{ kind string }

func (h *ec2Sharing) ami() bool { return h.kind == catalog.UnshareAMI }

func (h *ec2Sharing) writeActions() []string {
	if h.ami() {
		return []string{"ec2:ModifyImageAttribute"}
	}
	return []string{"ec2:ModifySnapshotAttribute"}
}
func (h *ec2Sharing) resources(t provider.Target) []string { return []string{t.TargetARN} }

func (h *ec2Sharing) noun() string {
	if h.ami() {
		return "AMI"
	}
	return "snapshot"
}

// shares reads who the image / snapshot is shared with: "all", account ids, org:<arn>, ou:<arn>.
func (h *ec2Sharing) shares(ctx context.Context, c *Clients, id string) ([]string, error) {
	var out []string
	if h.ami() {
		o, err := c.EC2.DescribeImageAttribute(ctx, &ec2.DescribeImageAttributeInput{ImageId: aws.String(id), Attribute: ec2types.ImageAttributeNameLaunchPermission})
		if err != nil {
			return nil, err
		}
		for _, p := range o.LaunchPermissions {
			switch {
			case p.Group == ec2types.PermissionGroupAll:
				out = append(out, "all")
			case p.UserId != nil:
				out = append(out, aws.ToString(p.UserId))
			case p.OrganizationArn != nil:
				out = append(out, "org:"+aws.ToString(p.OrganizationArn))
			case p.OrganizationalUnitArn != nil:
				out = append(out, "ou:"+aws.ToString(p.OrganizationalUnitArn))
			}
		}
	} else {
		o, err := c.EC2.DescribeSnapshotAttribute(ctx, &ec2.DescribeSnapshotAttributeInput{SnapshotId: aws.String(id), Attribute: ec2types.SnapshotAttributeNameCreateVolumePermission})
		if err != nil {
			return nil, err
		}
		for _, p := range o.CreateVolumePermissions {
			switch {
			case p.Group == ec2types.PermissionGroupAll:
				out = append(out, "all")
			case p.UserId != nil:
				out = append(out, aws.ToString(p.UserId))
			}
		}
	}
	sort.Strings(out)
	return out, nil
}

// modify adds or removes shares ("all" and account ids).
func (h *ec2Sharing) modify(ctx context.Context, c *Clients, r *run, step, id string, list []string, add bool) error {
	if len(list) == 0 {
		return nil
	}
	if h.ami() {
		var perms []ec2types.LaunchPermission
		for _, s := range list {
			if s == "all" {
				perms = append(perms, ec2types.LaunchPermission{Group: ec2types.PermissionGroupAll})
			} else {
				perms = append(perms, ec2types.LaunchPermission{UserId: aws.String(s)})
			}
		}
		mods := &ec2types.LaunchPermissionModifications{Remove: perms}
		if add {
			mods = &ec2types.LaunchPermissionModifications{Add: perms}
		}
		return r.do(step, "ec2:ModifyImageAttribute", func() (smithymw.Metadata, error) {
			o, err := c.EC2.ModifyImageAttribute(ctx, &ec2.ModifyImageAttributeInput{ImageId: aws.String(id), LaunchPermission: mods})
			return mdOf(o, err)
		})
	}
	var perms []ec2types.CreateVolumePermission
	for _, s := range list {
		if s == "all" {
			perms = append(perms, ec2types.CreateVolumePermission{Group: ec2types.PermissionGroupAll})
		} else {
			perms = append(perms, ec2types.CreateVolumePermission{UserId: aws.String(s)})
		}
	}
	mods := &ec2types.CreateVolumePermissionModifications{Remove: perms}
	if add {
		mods = &ec2types.CreateVolumePermissionModifications{Add: perms}
	}
	return r.do(step, "ec2:ModifySnapshotAttribute", func() (smithymw.Metadata, error) {
		o, err := c.EC2.ModifySnapshotAttribute(ctx, &ec2.ModifySnapshotAttributeInput{SnapshotId: aws.String(id),
			Attribute: ec2types.SnapshotAttributeNameCreateVolumePermission, CreateVolumePermission: mods})
		return mdOf(o, err)
	})
}

func (h *ec2Sharing) idOf(a string) string {
	if i := strings.LastIndex(a, "/"); i >= 0 {
		return a[i+1:]
	}
	return a
}

func (h *ec2Sharing) plan(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) error {
	re, key, res := reSnapshot, "snapshot_id", "snapshot"
	if h.ami() {
		re, key, res = reAMI, "image_id", "image"
	}
	id := targetID(in, re, key)
	if id == "" {
		pc.block(h.noun()+" named", "the finding names no "+h.noun()+" id: send params."+key)
		return nil
	}
	region := planRegion(in, pc)
	pc.out.TargetARN = fmt.Sprintf("arn:aws:ec2:%s::%s/%s", region, res, id)
	pc.out.TargetType = catalog.TargetType(h.kind)
	pc.out.Params[key], pc.out.Params["region"] = id, region
	pc.out.Vars[key] = id
	cur, err := h.shares(ctx, c, id)
	if err != nil {
		pc.block(h.noun()+" readable", err.Error())
		return nil
	}
	planSharing(pc, in, h.noun(), id, cur)
	return nil
}

func (h *ec2Sharing) state(ctx context.Context, c *Clients, t provider.Target) (map[string]any, error) {
	id := h.idOf(t.TargetARN)
	cur, err := h.shares(ctx, c, id)
	if err != nil {
		return nil, err
	}
	return map[string]any{"id": id, "shares": cur}, nil
}

func (h *ec2Sharing) apply(ctx context.Context, c *Clients, r *run) error {
	id := h.idOf(r.t.TargetARN)
	remove := sliceOf(r.in.After, "removed")
	r.snap = map[string]any{"id": id, "removed": remove}
	if err := h.modify(ctx, c, r, "remove the public / external shares of the "+h.noun(), id, remove, false); err != nil {
		return err
	}
	r.result_["removed_shares"] = remove
	return nil
}

func (h *ec2Sharing) verify(ctx context.Context, c *Clients, r *run) (map[string]any, error) {
	cur, err := h.shares(ctx, c, h.idOf(r.t.TargetARN))
	if err != nil {
		return nil, err
	}
	gone := true
	for _, s := range sliceOf(r.in.After, "removed") {
		for _, x := range cur {
			gone = gone && x != s
		}
	}
	return map[string]any{"verified": gone, "shares": cur}, nil
}

func (h *ec2Sharing) rollback(ctx context.Context, c *Clients, r *run, snap map[string]any) error {
	return h.modify(ctx, c, r, "share the "+h.noun()+" again with the removed accounts", str(snap, "id"), sliceOf(snap, "removed"), true)
}

// ---- unshare_rds_snapshot ----

type rdsSharing struct{}

func (h *rdsSharing) writeActions() []string {
	return []string{"rds:ModifyDBSnapshotAttribute", "rds:ModifyDBClusterSnapshotAttribute"}
}
func (h *rdsSharing) resources(t provider.Target) []string { return []string{t.TargetARN} }

// rdsSnap splits a snapshot ARN into its name and whether it is an Aurora cluster snapshot.
func rdsSnap(a string) (name string, cluster bool) {
	if i := strings.Index(a, ":cluster-snapshot:"); i >= 0 {
		return a[i+len(":cluster-snapshot:"):], true
	}
	if i := strings.Index(a, ":snapshot:"); i >= 0 {
		return a[i+len(":snapshot:"):], false
	}
	return a, false
}

func (h *rdsSharing) shares(ctx context.Context, c *Clients, name string, cluster bool) ([]string, error) {
	var vals []string
	if cluster {
		o, err := c.RDS.DescribeDBClusterSnapshotAttributes(ctx, &rds.DescribeDBClusterSnapshotAttributesInput{DBClusterSnapshotIdentifier: aws.String(name)})
		if err != nil {
			return nil, err
		}
		if o.DBClusterSnapshotAttributesResult != nil {
			for _, a := range o.DBClusterSnapshotAttributesResult.DBClusterSnapshotAttributes {
				if aws.ToString(a.AttributeName) == "restore" {
					vals = append(vals, a.AttributeValues...)
				}
			}
		}
	} else {
		o, err := c.RDS.DescribeDBSnapshotAttributes(ctx, &rds.DescribeDBSnapshotAttributesInput{DBSnapshotIdentifier: aws.String(name)})
		if err != nil {
			return nil, err
		}
		if o.DBSnapshotAttributesResult != nil {
			for _, a := range o.DBSnapshotAttributesResult.DBSnapshotAttributes {
				if aws.ToString(a.AttributeName) == "restore" {
					vals = append(vals, a.AttributeValues...)
				}
			}
		}
	}
	sort.Strings(vals)
	return vals, nil
}

func (h *rdsSharing) modify(ctx context.Context, c *Clients, r *run, step, name string, cluster bool, list []string, add bool) error {
	if len(list) == 0 {
		return nil
	}
	var toAdd, toRemove []string
	if add {
		toAdd = list
	} else {
		toRemove = list
	}
	if cluster {
		return r.do(step, "rds:ModifyDBClusterSnapshotAttribute", func() (smithymw.Metadata, error) {
			o, err := c.RDS.ModifyDBClusterSnapshotAttribute(ctx, &rds.ModifyDBClusterSnapshotAttributeInput{
				DBClusterSnapshotIdentifier: aws.String(name), AttributeName: aws.String("restore"), ValuesToAdd: toAdd, ValuesToRemove: toRemove})
			return mdOf(o, err)
		})
	}
	return r.do(step, "rds:ModifyDBSnapshotAttribute", func() (smithymw.Metadata, error) {
		o, err := c.RDS.ModifyDBSnapshotAttribute(ctx, &rds.ModifyDBSnapshotAttributeInput{
			DBSnapshotIdentifier: aws.String(name), AttributeName: aws.String("restore"), ValuesToAdd: toAdd, ValuesToRemove: toRemove})
		return mdOf(o, err)
	})
}

func (h *rdsSharing) plan(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) error {
	region := planRegion(in, pc)
	snapARN := targetID(in, reRDSSnapARN, "snapshot_id")
	name, cluster := "", boolean(in.Params, "cluster")
	if snapARN != "" {
		name, cluster = rdsSnap(snapARN)
	} else if id := strings.TrimSpace(str(in.Params, "snapshot_id")); reRDSSnapID.MatchString(id) {
		name = id
	}
	if name == "" {
		pc.block("snapshot named", "the finding names no RDS snapshot: send params.snapshot_id (ARN or name)")
		return nil
	}
	cur, err := h.shares(ctx, c, name, cluster)
	if err != nil && snapARN == "" && !cluster && strings.Contains(errCode(err), "NotFound") {
		// a name without an ARN may be an Aurora cluster snapshot
		if cur2, err2 := h.shares(ctx, c, name, true); err2 == nil {
			cur, err, cluster = cur2, nil, true
		}
	}
	if err != nil {
		pc.block("snapshot readable", err.Error())
		return nil
	}
	if snapARN == "" {
		kind := "snapshot"
		if cluster {
			kind = "cluster-snapshot"
		}
		snapARN = fmt.Sprintf("arn:aws:rds:%s:%s:%s:%s", region, in.Account.AccountID, kind, name)
	}
	if a, err := arn.Parse(snapARN); err == nil && a.Region != "" {
		region = a.Region
	}
	pc.out.TargetARN, pc.out.TargetType = snapARN, "rds_snapshot"
	pc.out.Params["snapshot_id"], pc.out.Params["cluster"], pc.out.Params["region"] = name, cluster, region
	pc.out.Vars["snapshot_id"] = name
	planSharing(pc, in, "snapshot", name, cur)
	return nil
}

func (h *rdsSharing) state(ctx context.Context, c *Clients, t provider.Target) (map[string]any, error) {
	name, cluster := rdsSnap(t.TargetARN)
	cur, err := h.shares(ctx, c, name, cluster)
	if err != nil {
		return nil, err
	}
	return map[string]any{"id": name, "shares": cur}, nil
}

func (h *rdsSharing) apply(ctx context.Context, c *Clients, r *run) error {
	name, cluster := rdsSnap(r.t.TargetARN)
	remove := sliceOf(r.in.After, "removed")
	r.snap = map[string]any{"snapshot_arn": r.t.TargetARN, "removed": remove}
	if err := h.modify(ctx, c, r, "remove the public / external shares of the snapshot", name, cluster, remove, false); err != nil {
		return err
	}
	r.result_["removed_shares"] = remove
	return nil
}

func (h *rdsSharing) verify(ctx context.Context, c *Clients, r *run) (map[string]any, error) {
	name, cluster := rdsSnap(r.t.TargetARN)
	cur, err := h.shares(ctx, c, name, cluster)
	if err != nil {
		return nil, err
	}
	gone := true
	for _, s := range sliceOf(r.in.After, "removed") {
		for _, x := range cur {
			gone = gone && x != s
		}
	}
	return map[string]any{"verified": gone, "shares": cur}, nil
}

func (h *rdsSharing) rollback(ctx context.Context, c *Clients, r *run, snap map[string]any) error {
	name, cluster := rdsSnap(str(snap, "snapshot_arn"))
	return h.modify(ctx, c, r, "share the snapshot again with the removed accounts", name, cluster, sliceOf(snap, "removed"), true)
}

// ---- enforce_imds ----

type imdsOptions struct{}

func (h *imdsOptions) writeActions() []string               { return []string{"ec2:ModifyInstanceMetadataOptions"} }
func (h *imdsOptions) resources(t provider.Target) []string { return []string{t.TargetARN} }

func readInstance(ctx context.Context, c *Clients, id string) (*ec2types.Instance, error) {
	o, err := c.EC2.DescribeInstances(ctx, &ec2.DescribeInstancesInput{InstanceIds: []string{id}})
	if err != nil {
		return nil, err
	}
	for _, res := range o.Reservations {
		for i := range res.Instances {
			if aws.ToString(res.Instances[i].InstanceId) == id {
				return &res.Instances[i], nil
			}
		}
	}
	return nil, fmt.Errorf("instance %s not found", id)
}

func imdsState(inst *ec2types.Instance) map[string]any {
	m := map[string]any{"instance_id": aws.ToString(inst.InstanceId), "http_tokens": "", "hop_limit": 1, "http_endpoint": ""}
	if mo := inst.MetadataOptions; mo != nil {
		m["http_tokens"], m["hop_limit"], m["http_endpoint"] = string(mo.HttpTokens), int(aws.ToInt32(mo.HttpPutResponseHopLimit)), string(mo.HttpEndpoint)
	}
	return m
}

func (h *imdsOptions) plan(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) error {
	id := targetID(in, reInstance, "instance_id")
	if id == "" {
		pc.block("instance named", "the finding names no EC2 instance id: send params.instance_id")
		return nil
	}
	region := planRegion(in, pc)
	account := in.Account.AccountID
	if a, err := arn.Parse(str(in.Params, "instance_id")); err == nil {
		region, account = a.Region, a.AccountID
	}
	pc.out.TargetARN = fmt.Sprintf("arn:aws:ec2:%s:%s:instance/%s", region, account, id)
	pc.out.TargetType = "ec2_instance"
	hop := integer(in.Params, "hop_limit", 1)
	if hop < 1 || hop > 64 {
		pc.block("valid hop limit", "hop_limit must be between 1 and 64")
		return nil
	}
	pc.out.Params["instance_id"], pc.out.Params["region"], pc.out.Params["hop_limit"] = id, region, hop
	pc.out.Vars["instance_id"], pc.out.Vars["hop_limit"] = id, fmt.Sprint(hop)
	inst, err := readInstance(ctx, c, id)
	if err != nil {
		pc.block("instance readable", err.Error())
		return nil
	}
	if inst.State != nil && (inst.State.Name == ec2types.InstanceStateNameTerminated || inst.State.Name == ec2types.InstanceStateNameShuttingDown) {
		pc.block("instance exists", "the instance is "+string(inst.State.Name))
		return nil
	}
	cur := imdsState(inst)
	pc.out.Before = cur
	pc.out.After = map[string]any{"instance_id": id, "http_tokens": "required", "hop_limit": hop, "http_endpoint": "enabled"}
	if cur["http_endpoint"] == "disabled" {
		pc.block("change needed", "the instance metadata service is turned off: there is nothing to enforce")
		return nil
	}
	if cur["http_tokens"] != "required" {
		pc.out.Diff = append(pc.out.Diff, diffField("http_tokens", cur["http_tokens"], "required"))
	}
	if integer(cur, "hop_limit", 1) != hop {
		pc.out.Diff = append(pc.out.Diff, diffField("hop_limit", cur["hop_limit"], hop))
	}
	if len(pc.out.Diff) == 0 {
		pc.block("change needed", "IMDSv2 is already required with this hop limit")
		return nil
	}
	for _, t := range inst.Tags {
		k := aws.ToString(t.Key)
		if hop == 1 && (k == "eks:cluster-name" || strings.HasPrefix(k, "kubernetes.io/cluster/")) {
			pc.warn("Kubernetes node", "this is an EKS / Kubernetes node: pods that use the node role through IMDS need hop limit 2 (send params.hop_limit=2) or IRSA / Pod Identity")
		}
	}
	pc.warn("IMDSv1 clients", "software on the instance that still uses IMDSv1 (old SDKs / agents) stops getting credentials; test first")
	pc.warn("launch template", "new instances from the same launch template / Auto Scaling group still get the old setting: change the template too")
	return nil
}

func (h *imdsOptions) state(ctx context.Context, c *Clients, t provider.Target) (map[string]any, error) {
	inst, err := readInstance(ctx, c, str(t.Params, "instance_id"))
	if err != nil {
		return nil, err
	}
	return imdsState(inst), nil
}

func (h *imdsOptions) set(ctx context.Context, c *Clients, r *run, step, id, tokens string, hop int) error {
	return r.do(step, "ec2:ModifyInstanceMetadataOptions", func() (smithymw.Metadata, error) {
		o, err := c.EC2.ModifyInstanceMetadataOptions(ctx, &ec2.ModifyInstanceMetadataOptionsInput{InstanceId: aws.String(id),
			HttpTokens: ec2types.HttpTokensState(tokens), HttpPutResponseHopLimit: aws.Int32(int32(hop)),
			HttpEndpoint: ec2types.InstanceMetadataEndpointStateEnabled})
		return mdOf(o, err)
	})
}

func (h *imdsOptions) apply(ctx context.Context, c *Clients, r *run) error {
	id := str(r.t.Params, "instance_id")
	prevTokens := str(r.before, "http_tokens")
	if prevTokens == "" {
		prevTokens = "optional"
	}
	r.snap = map[string]any{"instance_id": id, "http_tokens": prevTokens, "hop_limit": integer(r.before, "hop_limit", 1)}
	if err := h.set(ctx, c, r, "require IMDSv2 and set the hop limit", id, "required", integer(r.t.Params, "hop_limit", 1)); err != nil {
		return err
	}
	r.result_["imds"] = map[string]any{"instance_id": id, "http_tokens": "required", "hop_limit": integer(r.t.Params, "hop_limit", 1)}
	return nil
}

func (h *imdsOptions) verify(ctx context.Context, c *Clients, r *run) (map[string]any, error) {
	st, err := h.state(ctx, c, r.t)
	if err != nil {
		return nil, err
	}
	ok := st["http_tokens"] == "required" && integer(st, "hop_limit", 0) == integer(r.t.Params, "hop_limit", 1)
	return map[string]any{"verified": ok, "metadata_options": st}, nil
}

func (h *imdsOptions) rollback(ctx context.Context, c *Clients, r *run, snap map[string]any) error {
	return h.set(ctx, c, r, "restore the previous metadata options", str(snap, "instance_id"), str(snap, "http_tokens"), integer(snap, "hop_limit", 1))
}
