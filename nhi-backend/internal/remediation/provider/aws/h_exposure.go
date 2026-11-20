package awsprov

// Reme4 / Reme10: public and cross-account exposure of resources.
//
//	block_s3_public_access  S3 Block Public Access of one bucket (S3-01)
//	update_bucket_policy    remove "*" / external principals from a bucket policy (S3-01)
//	update_queue_policy     same for an SQS queue policy (SQS-01)
//	update_topic_policy     same for an SNS topic policy (SNS-01)
//
// A principal "*" is removed only when its statement has no condition that limits WHO may use it
// (aws:PrincipalOrgID, aws:SourceAccount, aws:SourceArn, AWS:SourceOwner, ...): the default SNS
// policy, for example, allows "*" limited by AWS:SourceOwner and is kept. External accounts are
// removed only when the finding (or params.remove_principals) names them; the account that owns
// the resource is never removed.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/aws/arn"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/aws-sdk-go-v2/service/sns"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	sqstypes "github.com/aws/aws-sdk-go-v2/service/sqs/types"
	smithymw "github.com/aws/smithy-go/middleware"

	"nhi-backend-api/internal/remediation/catalog"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/policydoc"
	"nhi-backend-api/internal/remediation/provider"
)

// ---- shared helpers ----

// errCode is the AWS error code of err ("" when it has none).
func errCode(err error) string {
	var ae interface{ ErrorCode() string }
	if errors.As(err, &ae) {
		return ae.ErrorCode()
	}
	return ""
}

// findingStrings returns every string of the findings: identity, credential and all evidence values.
func findingStrings(fs []domain.Finding) []string {
	var out []string
	var walk func(v any)
	walk = func(v any) {
		switch t := v.(type) {
		case string:
			out = append(out, t)
		case []any:
			for _, e := range t {
				walk(e)
			}
		case map[string]any:
			for _, e := range t {
				walk(e)
			}
		}
	}
	for _, f := range fs {
		out = append(out, f.CredentialARN, f.IdentityName, f.IdentityID)
		var ev any
		if len(f.Evidence) > 0 && json.Unmarshal(f.Evidence, &ev) == nil {
			walk(ev)
		}
	}
	return out
}

// targetID finds the resource id of a plan: the first param of keys (a string, or the first
// element of a list), then the target ARN, then any string of the findings, that matches re.
func targetID(in provider.PlanInput, re *regexp.Regexp, keys ...string) string {
	var cands []string
	for _, k := range keys {
		cands = append(cands, strs(in.Params, k)...)
	}
	cands = append(cands, in.TargetARN)
	cands = append(cands, findingStrings(in.Findings)...)
	for _, c := range cands {
		if m := re.FindString(strings.TrimSpace(c)); m != "" {
			return m
		}
	}
	return ""
}

var (
	reS3ARN    = regexp.MustCompile(`^arn:aws[a-z-]*:s3:::[a-z0-9][a-z0-9.\-]{1,61}[a-z0-9]$`)
	reBucket   = regexp.MustCompile(`^[a-z0-9][a-z0-9.\-]{1,61}[a-z0-9]$`)
	reSQSARN   = regexp.MustCompile(`arn:aws[a-z-]*:sqs:[a-z0-9-]+:\d{12}:[A-Za-z0-9_.\-]+`)
	reSNSARN   = regexp.MustCompile(`arn:aws[a-z-]*:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_.\-]+`)
	reQueueURL = regexp.MustCompile(`^https://sqs\.[a-z0-9.\-]+/\d{12}/[A-Za-z0-9_.\-]+$`)
)

// limitingConds are condition keys that limit WHO may use a statement with Principal "*".
var limitingConds = append([]string{"aws:sourceowner", "aws:sourcevpc", "aws:sourcevpce"}, restrictingConds...)

func hasLimitingCondition(s map[string]any) bool {
	cond, _ := s["Condition"].(map[string]any)
	for _, ops := range cond {
		m, _ := ops.(map[string]any)
		for k := range m {
			for _, r := range limitingConds {
				if strings.EqualFold(k, r) {
					return true
				}
			}
		}
	}
	return false
}

// externalOnly keeps the principals of remove that are not the resource owner's account.
func externalOnly(remove []string, owner string) []string {
	var out []string
	for _, p := range remove {
		p = strings.TrimSpace(p)
		if p == "" || p == "*" || (owner != "" && principalAccount(p) == owner) {
			continue
		}
		out = append(out, p)
	}
	return out
}

// restrictPolicy removes "*" (without a limiting condition) and the principals of remove from
// the Allow statements. A statement left without principals is dropped; nil means no statement is left.
func restrictPolicy(before *policydoc.Doc, remove []string) (after *policydoc.Doc, removed []string) {
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
		var left []string
		for _, e := range policydoc.Strings(pm["AWS"]) {
			drop := (e == "*" && !hasLimitingCondition(s)) || (e != "*" && keepMatches(e, remove))
			if drop {
				removed = append(removed, e)
				continue
			}
			left = append(left, e)
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
	if len(kept) == 0 {
		return nil, removed
	}
	return after, removed
}

// ---- S3 helpers ----

// s3In makes an S3 call go to the bucket's own region.
func s3In(region string) func(*s3.Options) {
	return func(o *s3.Options) {
		if region != "" {
			o.Region = region
		}
	}
}

func bucketOf(in provider.PlanInput) string {
	if b := strings.TrimSpace(str(in.Params, "bucket")); reBucket.MatchString(b) {
		return b
	}
	if a := targetID(in, reS3ARN); a != "" {
		return bucketFromARN(a)
	}
	return ""
}

func bucketFromARN(a string) string {
	if i := strings.Index(a, ":::"); i >= 0 {
		return a[i+3:]
	}
	return a
}

func bucketRegion(ctx context.Context, c *Clients, bucket string) (string, error) {
	o, err := c.S3.GetBucketLocation(ctx, &s3.GetBucketLocationInput{Bucket: aws.String(bucket)})
	if err != nil {
		// the location call works from us-east-1 for a bucket of any region
		o, err = c.S3.GetBucketLocation(ctx, &s3.GetBucketLocationInput{Bucket: aws.String(bucket)}, s3In("us-east-1"))
		if err != nil {
			return "", err
		}
	}
	switch loc := string(o.LocationConstraint); loc {
	case "":
		return "us-east-1", nil
	case "EU":
		return "eu-west-1", nil
	default:
		return loc, nil
	}
}

// ---- block_s3_public_access ----

type s3PublicAccess struct{}

func (h *s3PublicAccess) writeActions() []string               { return []string{"s3:PutBucketPublicAccessBlock"} }
func (h *s3PublicAccess) resources(t provider.Target) []string { return []string{t.TargetARN} }

var pabKeys = []string{"block_public_acls", "ignore_public_acls", "block_public_policy", "restrict_public_buckets"}

func readPAB(ctx context.Context, c *Clients, bucket, region string) (map[string]any, bool, error) {
	o, err := c.S3.GetPublicAccessBlock(ctx, &s3.GetPublicAccessBlockInput{Bucket: aws.String(bucket)}, s3In(region))
	if err != nil {
		if errCode(err) == "NoSuchPublicAccessBlockConfiguration" {
			return map[string]any{"block_public_acls": false, "ignore_public_acls": false, "block_public_policy": false, "restrict_public_buckets": false}, false, nil
		}
		return nil, false, err
	}
	cfg := o.PublicAccessBlockConfiguration
	if cfg == nil {
		cfg = &s3types.PublicAccessBlockConfiguration{}
	}
	return map[string]any{"block_public_acls": aws.ToBool(cfg.BlockPublicAcls), "ignore_public_acls": aws.ToBool(cfg.IgnorePublicAcls),
		"block_public_policy": aws.ToBool(cfg.BlockPublicPolicy), "restrict_public_buckets": aws.ToBool(cfg.RestrictPublicBuckets)}, true, nil
}

func pabConfig(m map[string]any) *s3types.PublicAccessBlockConfiguration {
	return &s3types.PublicAccessBlockConfiguration{BlockPublicAcls: aws.Bool(boolean(m, "block_public_acls")),
		IgnorePublicAcls: aws.Bool(boolean(m, "ignore_public_acls")), BlockPublicPolicy: aws.Bool(boolean(m, "block_public_policy")),
		RestrictPublicBuckets: aws.Bool(boolean(m, "restrict_public_buckets"))}
}

func (h *s3PublicAccess) plan(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) error {
	bucket := bucketOf(in)
	if bucket == "" {
		pc.block("bucket named", "the finding names no S3 bucket: send params.bucket")
		return nil
	}
	pc.out.TargetARN, pc.out.TargetType = "arn:aws:s3:::"+bucket, "s3_bucket"
	region, err := bucketRegion(ctx, c, bucket)
	if err != nil {
		pc.block("bucket readable", err.Error())
		return nil
	}
	pc.out.Params["bucket"], pc.out.Params["region"] = bucket, region
	pc.out.Vars["bucket"] = bucket
	cur, exists, err := readPAB(ctx, c, bucket, region)
	if err != nil {
		pc.block("Block Public Access readable", err.Error())
		return nil
	}
	pc.out.Before = map[string]any{"bucket": bucket, "exists": exists, "config": cur}
	want := map[string]any{}
	changed := false
	for _, k := range pabKeys {
		want[k] = true
		if !boolean(cur, k) {
			changed = true
			pc.out.Diff = append(pc.out.Diff, diffField(k, false, true))
		}
	}
	pc.out.After = map[string]any{"bucket": bucket, "exists": true, "config": want}
	if !changed {
		pc.block("change needed", "all four Block Public Access settings are already on")
		return nil
	}
	if _, err := c.S3.GetBucketWebsite(ctx, &s3.GetBucketWebsiteInput{Bucket: aws.String(bucket)}, s3In(region)); err == nil {
		pc.warn("static website", "the bucket hosts a static website: public visitors lose access")
	}
	pc.warn("public readers", "anything that reads this bucket without credentials (public URLs, CDN without OAC) stops working")
	pc.pass("reversible", "rollback restores the previous settings")
	return nil
}

func (h *s3PublicAccess) state(ctx context.Context, c *Clients, t provider.Target) (map[string]any, error) {
	bucket := bucketFromARN(t.TargetARN)
	cur, exists, err := readPAB(ctx, c, bucket, str(t.Params, "region"))
	if err != nil {
		return nil, err
	}
	return map[string]any{"bucket": bucket, "exists": exists, "config": cur}, nil
}

func (h *s3PublicAccess) put(ctx context.Context, c *Clients, r *run, step, bucket, region string, cfg map[string]any) error {
	return r.do(step, "s3:PutBucketPublicAccessBlock", func() (smithymw.Metadata, error) {
		o, err := c.S3.PutPublicAccessBlock(ctx, &s3.PutPublicAccessBlockInput{Bucket: aws.String(bucket),
			PublicAccessBlockConfiguration: pabConfig(cfg)}, s3In(region))
		return mdOf(o, err)
	})
}

func (h *s3PublicAccess) apply(ctx context.Context, c *Clients, r *run) error {
	bucket, region := bucketFromARN(r.t.TargetARN), str(r.t.Params, "region")
	prev, _ := r.before["config"].(map[string]any)
	r.snap = map[string]any{"bucket": bucket, "region": region, "exists": boolean(r.before, "exists"), "config": prev}
	all := map[string]any{"block_public_acls": true, "ignore_public_acls": true, "block_public_policy": true, "restrict_public_buckets": true}
	if err := h.put(ctx, c, r, "turn on Block Public Access", bucket, region, all); err != nil {
		return err
	}
	r.result_["block_public_access"] = bucket
	return nil
}

func (h *s3PublicAccess) verify(ctx context.Context, c *Clients, r *run) (map[string]any, error) {
	cur, _, err := readPAB(ctx, c, bucketFromARN(r.t.TargetARN), str(r.t.Params, "region"))
	if err != nil {
		return nil, err
	}
	ok := true
	for _, k := range pabKeys {
		ok = ok && boolean(cur, k)
	}
	return map[string]any{"verified": ok, "config": cur}, nil
}

func (h *s3PublicAccess) rollback(ctx context.Context, c *Clients, r *run, snap map[string]any) error {
	bucket, region := str(snap, "bucket"), str(snap, "region")
	if !boolean(snap, "exists") {
		return r.do("remove the Block Public Access configuration", "s3:PutBucketPublicAccessBlock", func() (smithymw.Metadata, error) {
			o, err := c.S3.DeletePublicAccessBlock(ctx, &s3.DeletePublicAccessBlockInput{Bucket: aws.String(bucket)}, s3In(region))
			return mdOf(o, err)
		})
	}
	prev, _ := snap["config"].(map[string]any)
	return h.put(ctx, c, r, "restore the previous Block Public Access settings", bucket, region, prev)
}

// ---- update_bucket_policy / update_queue_policy / update_topic_policy ----

type resourcePolicy struct{ kind string }

func (h *resourcePolicy) writeActions() []string {
	switch h.kind {
	case catalog.UpdateBucketPolicy:
		return []string{"s3:PutBucketPolicy", "s3:DeleteBucketPolicy"}
	case catalog.UpdateQueuePolicy:
		return []string{"sqs:SetQueueAttributes"}
	}
	return []string{"sns:SetTopicAttributes"}
}
func (h *resourcePolicy) resources(t provider.Target) []string { return []string{t.TargetARN} }

func (h *resourcePolicy) noun() string {
	switch h.kind {
	case catalog.UpdateBucketPolicy:
		return "bucket"
	case catalog.UpdateQueuePolicy:
		return "queue"
	}
	return "topic"
}

// read returns the current policy (nil = none).
func (h *resourcePolicy) read(ctx context.Context, c *Clients, t provider.Target) (*policydoc.Doc, error) {
	var raw string
	switch h.kind {
	case catalog.UpdateBucketPolicy:
		o, err := c.S3.GetBucketPolicy(ctx, &s3.GetBucketPolicyInput{Bucket: aws.String(bucketFromARN(t.TargetARN))}, s3In(str(t.Params, "region")))
		if err != nil {
			if errCode(err) == "NoSuchBucketPolicy" {
				return nil, nil
			}
			return nil, err
		}
		raw = aws.ToString(o.Policy)
	case catalog.UpdateQueuePolicy:
		o, err := c.SQS.GetQueueAttributes(ctx, &sqs.GetQueueAttributesInput{QueueUrl: aws.String(str(t.Params, "queue_url")),
			AttributeNames: []sqstypes.QueueAttributeName{sqstypes.QueueAttributeNamePolicy}})
		if err != nil {
			return nil, err
		}
		raw = o.Attributes[string(sqstypes.QueueAttributeNamePolicy)]
	default:
		o, err := c.SNS.GetTopicAttributes(ctx, &sns.GetTopicAttributesInput{TopicArn: aws.String(t.TargetARN)})
		if err != nil {
			return nil, err
		}
		raw = o.Attributes["Policy"]
	}
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	return policydoc.Parse(raw)
}

// write sets the policy (nil = remove it; not possible for a topic).
func (h *resourcePolicy) write(ctx context.Context, c *Clients, r *run, step string, t provider.Target, doc *policydoc.Doc) error {
	switch h.kind {
	case catalog.UpdateBucketPolicy:
		bucket, region := bucketFromARN(t.TargetARN), str(t.Params, "region")
		if doc == nil {
			return r.do(step, "s3:DeleteBucketPolicy", func() (smithymw.Metadata, error) {
				o, err := c.S3.DeleteBucketPolicy(ctx, &s3.DeleteBucketPolicyInput{Bucket: aws.String(bucket)}, s3In(region))
				return mdOf(o, err)
			})
		}
		return r.do(step, "s3:PutBucketPolicy", func() (smithymw.Metadata, error) {
			o, err := c.S3.PutBucketPolicy(ctx, &s3.PutBucketPolicyInput{Bucket: aws.String(bucket), Policy: aws.String(doc.JSON())}, s3In(region))
			return mdOf(o, err)
		})
	case catalog.UpdateQueuePolicy:
		val := ""
		if doc != nil {
			val = doc.JSON()
		}
		return r.do(step, "sqs:SetQueueAttributes", func() (smithymw.Metadata, error) {
			o, err := c.SQS.SetQueueAttributes(ctx, &sqs.SetQueueAttributesInput{QueueUrl: aws.String(str(t.Params, "queue_url")),
				Attributes: map[string]string{string(sqstypes.QueueAttributeNamePolicy): val}})
			return mdOf(o, err)
		})
	}
	if doc == nil {
		return fmt.Errorf("an SNS topic always needs a policy")
	}
	return r.do(step, "sns:SetTopicAttributes", func() (smithymw.Metadata, error) {
		o, err := c.SNS.SetTopicAttributes(ctx, &sns.SetTopicAttributesInput{TopicArn: aws.String(t.TargetARN),
			AttributeName: aws.String("Policy"), AttributeValue: aws.String(doc.JSON())})
		return mdOf(o, err)
	})
}

// target resolves the resource of the plan and fills TargetARN, params and vars.
func (h *resourcePolicy) target(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) (owner string, ok bool) {
	switch h.kind {
	case catalog.UpdateBucketPolicy:
		bucket := bucketOf(in)
		if bucket == "" {
			pc.block("bucket named", "the finding names no S3 bucket: send params.bucket")
			return "", false
		}
		region, err := bucketRegion(ctx, c, bucket)
		if err != nil {
			pc.block("bucket readable", err.Error())
			return "", false
		}
		pc.out.TargetARN, pc.out.TargetType = "arn:aws:s3:::"+bucket, "s3_bucket"
		pc.out.Params["bucket"], pc.out.Params["region"] = bucket, region
		pc.out.Vars["bucket"] = bucket
		return in.Account.AccountID, true
	case catalog.UpdateQueuePolicy:
		qarn, url := targetID(in, reSQSARN), strings.TrimSpace(str(in.Params, "queue_url"))
		if qarn == "" && reQueueURL.MatchString(url) { // https://sqs.<region>.amazonaws.com/<account>/<name>
			parts := strings.Split(url, "/")
			host := strings.Split(parts[2], ".")
			qarn = fmt.Sprintf("arn:aws:sqs:%s:%s:%s", host[1], parts[3], parts[4])
		}
		a, err := arn.Parse(qarn)
		if err != nil {
			pc.block("queue named", "the finding names no SQS queue: send params.target_arn (queue ARN)")
			return "", false
		}
		if !reQueueURL.MatchString(url) {
			o, err := c.SQS.GetQueueUrl(ctx, &sqs.GetQueueUrlInput{QueueName: aws.String(a.Resource), QueueOwnerAWSAccountId: aws.String(a.AccountID)})
			if err != nil {
				pc.block("queue readable", err.Error())
				return "", false
			}
			url = aws.ToString(o.QueueUrl)
		}
		pc.out.TargetARN, pc.out.TargetType = qarn, "sqs_queue"
		pc.out.Params["queue_url"], pc.out.Params["region"] = url, a.Region
		pc.out.Vars["queue_url"], pc.out.Vars["queue_name"] = url, a.Resource
		return a.AccountID, true
	}
	tarn := targetID(in, reSNSARN)
	a, err := arn.Parse(tarn)
	if err != nil {
		pc.block("topic named", "the finding names no SNS topic: send params.target_arn (topic ARN)")
		return "", false
	}
	pc.out.TargetARN, pc.out.TargetType = tarn, "sns_topic"
	pc.out.Params["region"] = a.Region
	pc.out.Vars["topic_arn"], pc.out.Vars["topic_name"] = tarn, a.Resource
	return a.AccountID, true
}

func (h *resourcePolicy) plan(ctx context.Context, c *Clients, in provider.PlanInput, pc *planCtx) error {
	pc.out.Flags.ExternalPrincipals = true
	owner, ok := h.target(ctx, c, in, pc)
	if !ok {
		return nil
	}
	t := in.Target
	t.TargetARN, t.Params = pc.out.TargetARN, pc.out.Params
	before, err := h.read(ctx, c, t)
	if err != nil {
		pc.block(h.noun()+" policy readable", err.Error())
		return nil
	}
	if before == nil {
		pc.block(h.noun()+" policy exists", "the "+h.noun()+" has no resource policy: nothing to restrict")
		return nil
	}
	remove := externalOnly(strs(in.Params, "remove_principals"), owner)
	pc.out.Params["remove_principals"] = remove
	after, removed := restrictPolicy(before, remove)
	pc.out.Before = map[string]any{"arn": pc.out.TargetARN, "policy": before.Map()}
	pc.out.After = map[string]any{"arn": pc.out.TargetARN, "policy": docMapOrNil(after)}
	if len(removed) == 0 {
		pc.block("change needed", "no public principal without a limiting condition, and none of the named external principals, is in the policy")
		return nil
	}
	pc.pass("principals removed", strings.Join(removed, ", "))
	if after == nil {
		if h.kind == catalog.UpdateTopicPolicy {
			pc.block("policy kept", "no statement would be left, but a topic always needs a policy: edit it by hand")
			return nil
		}
		pc.warn("policy removed", "no statement is left: the whole "+h.noun()+" policy is deleted")
		pc.out.Diff = policydoc.Diff(before, &policydoc.Doc{Version: before.Version})
	} else {
		pc.out.Diff = policydoc.Diff(before, after)
	}
	pc.warn("external callers", "the removed principals lose access; check no partner integration depends on them")
	return nil
}

func (h *resourcePolicy) state(ctx context.Context, c *Clients, t provider.Target) (map[string]any, error) {
	d, err := h.read(ctx, c, t)
	if err != nil {
		return nil, err
	}
	return map[string]any{"arn": t.TargetARN, "policy": docMapOrNil(d)}, nil
}

func (h *resourcePolicy) apply(ctx context.Context, c *Clients, r *run) error {
	before, err := optDoc(r.before, "policy")
	if err != nil {
		return err
	}
	after, err := optDoc(r.in.After, "policy")
	if err != nil {
		return err
	}
	r.snap = map[string]any{"arn": r.t.TargetARN, "policy": docMapOrNil(before), "params": r.t.Params}
	if err := h.write(ctx, c, r, "update the "+h.noun()+" policy", r.t, after); err != nil {
		return err
	}
	r.result_[h.noun()+"_policy_updated"] = r.t.TargetARN
	return nil
}

func (h *resourcePolicy) verify(ctx context.Context, c *Clients, r *run) (map[string]any, error) {
	cur, err := h.read(ctx, c, r.t)
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

func (h *resourcePolicy) rollback(ctx context.Context, c *Clients, r *run, snap map[string]any) error {
	doc, err := optDoc(snap, "policy")
	if err != nil {
		return err
	}
	t := r.t
	t.TargetARN = str(snap, "arn")
	if p, ok := snap["params"].(map[string]any); ok {
		t.Params = p
	}
	return h.write(ctx, c, r, "restore the previous "+h.noun()+" policy", t, doc)
}
