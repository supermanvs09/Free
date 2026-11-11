package catalog

import (
	"encoding/json"
	"sort"
	"strings"

	"nhi-backend-api/internal/remediation/domain"
)

// ManualFix is the action type of a Guided plan for a rule without an automatic fix: its title,
// description, risk and steps come from the table remediation_guides. It is never run by the backend.
const ManualFix = "manual_fix"

// Target is the AWS thing a finding is about, as far as the finding tells.
type Target struct {
	Kind string // role, user, policy, kms_key, secret, lambda, bucket, instance, parameter, eks_cluster,
	//               task_definition, certificate, db, snapshot, oidc_provider, saml_provider, account, other
	ARN     string
	Name    string
	Region  string
	Account string
}

// Ref is the best one-word reference of the target: the ARN, else the name, else "account:<id>".
func (t Target) Ref() string {
	switch {
	case t.ARN != "":
		return t.ARN
	case t.Name != "":
		return t.Name
	}
	return "account:" + t.Account
}

// ManualTarget works out the target from the finding: the credential ARN, else an ARN in the
// evidence, else the identity name and type. Without any of them the target is the account.
func ManualTarget(f domain.Finding) Target {
	t := Target{Account: f.AccountID}
	arn := f.CredentialARN
	if !strings.HasPrefix(arn, "arn:") {
		arn = evidenceARN(f.Evidence)
	}
	if arn != "" {
		return parseARN(arn, f.AccountID)
	}
	t.Name = f.IdentityName
	typ := strings.ToUpper(f.IdentityType)
	switch {
	case t.Name == "" || typ == "AWS_ACCOUNT": // not IAM_USER_SERVICE_ACCOUNT, which is a user
		t.Kind, t.Name = "account", ""
	case strings.Contains(typ, "ROLE"):
		t.Kind = "role"
	case strings.Contains(typ, "USER"):
		t.Kind = "user"
	case strings.Contains(typ, "LAMBDA"):
		t.Kind = "lambda"
	case strings.Contains(typ, "SECRET"):
		t.Kind = "secret"
	case strings.Contains(typ, "KMS"):
		t.Kind = "kms_key"
	case typ == "EC2":
		t.Kind = "instance"
	default:
		t.Kind = "other"
	}
	return t
}

// evidenceARN returns an ARN from the evidence: the well-known keys first, then any top-level
// string or first list element that is an ARN.
func evidenceARN(ev json.RawMessage) string {
	var m map[string]any
	if json.Unmarshal(ev, &m) != nil {
		return ""
	}
	isARN := func(v any) string {
		switch x := v.(type) {
		case string:
			if strings.HasPrefix(x, "arn:") {
				return x
			}
		case []any:
			if len(x) > 0 {
				if s, ok := x[0].(string); ok && strings.HasPrefix(s, "arn:") {
					return s
				}
			}
		}
		return ""
	}
	for _, k := range []string{"role_arn", "user_arn", "key_arn", "secret_arn", "function_arn", "resource_arn",
		"bucket_arn", "cluster_arn", "certificate_arn", "provider_arn", "arn"} {
		if a := isARN(m[k]); a != "" {
			return a
		}
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys) // the same answer every time
	for _, k := range keys {
		if a := isARN(m[k]); a != "" {
			return a
		}
	}
	return ""
}

// parseARN turns arn:aws:<service>:<region>:<account>:<resource> into a Target.
func parseARN(arn, account string) Target {
	t := Target{ARN: arn, Account: account, Kind: "other"}
	p := strings.SplitN(arn, ":", 6)
	if len(p) < 6 {
		return t
	}
	svc, res := p[2], p[5]
	t.Region = p[3]
	if p[4] != "" {
		t.Account = p[4]
	}
	last := func(s string) string {
		if i := strings.LastIndex(s, "/"); i >= 0 {
			return s[i+1:]
		}
		return s
	}
	after := func(prefix string) (string, bool) {
		if strings.HasPrefix(res, prefix) {
			return res[len(prefix):], true
		}
		return "", false
	}
	switch svc {
	case "iam":
		for prefix, kind := range map[string]string{"role/": "role", "user/": "user", "policy/": "policy",
			"oidc-provider/": "oidc_provider", "saml-provider/": "saml_provider"} {
			if rest, ok := after(prefix); ok {
				t.Kind, t.Name = kind, last(rest)
			}
		}
		if t.Kind == "oidc_provider" {
			t.Name = strings.TrimPrefix(res, "oidc-provider/")
		}
		if res == "root" {
			t.Kind = "account"
		}
	case "kms":
		t.Kind, t.Name = "kms_key", last(res)
	case "secretsmanager":
		if rest, ok := after("secret:"); ok {
			t.Kind, t.Name = "secret", rest
		}
	case "lambda":
		if rest, ok := after("function:"); ok {
			t.Kind, t.Name = "lambda", strings.SplitN(rest, ":", 2)[0]
		}
	case "s3":
		t.Kind, t.Name = "bucket", strings.SplitN(res, "/", 2)[0]
	case "ec2":
		if rest, ok := after("instance/"); ok {
			t.Kind, t.Name = "instance", rest
		}
	case "ssm":
		if rest, ok := after("parameter"); ok {
			// "parameter/a/b" is the path "/a/b"; "parameter/a" is the plain name "a"
			if strings.Count(rest, "/") == 1 {
				rest = strings.TrimPrefix(rest, "/")
			}
			t.Kind, t.Name = "parameter", rest
		}
	case "eks":
		if rest, ok := after("cluster/"); ok {
			t.Kind, t.Name = "eks_cluster", rest
		}
	case "ecs":
		if rest, ok := after("task-definition/"); ok {
			t.Kind, t.Name = "task_definition", rest
		}
	case "acm":
		t.Kind, t.Name = "certificate", last(res)
	case "rds":
		for prefix, kind := range map[string]string{"db:": "db", "snapshot:": "snapshot", "cluster:": "db"} {
			if rest, ok := after(prefix); ok {
				t.Kind, t.Name = kind, rest
			}
		}
	}
	if t.Name == "" {
		t.Name = last(res)
	}
	return t
}

// view is where to look at the target and the read-only command that shows it.
func view(t Target) (title, console, cli string) {
	reg := ""
	if t.Region != "" {
		reg = " --region " + t.Region
	}
	n := t.Name
	switch t.Kind {
	case "role":
		return "Open the role " + n, "IAM > Roles > " + n,
			"aws iam get-role --role-name " + n + "; aws iam list-attached-role-policies --role-name " + n +
				"; aws iam list-role-policies --role-name " + n
	case "user":
		return "Open the user " + n, "IAM > Users > " + n,
			"aws iam get-user --user-name " + n + "; aws iam list-access-keys --user-name " + n +
				"; aws iam list-attached-user-policies --user-name " + n
	case "policy":
		return "Open the policy " + n, "IAM > Policies > " + n, "aws iam get-policy --policy-arn " + t.ARN
	case "oidc_provider":
		return "Open the identity provider " + n, "IAM > Identity providers > " + n,
			"aws iam get-open-id-connect-provider --open-id-connect-provider-arn " + t.ARN
	case "saml_provider":
		return "Open the identity provider " + n, "IAM > Identity providers > " + n,
			"aws iam get-saml-provider --saml-provider-arn " + t.ARN
	case "kms_key":
		return "Open the KMS key " + n, "KMS > Customer managed keys > " + n,
			"aws kms describe-key --key-id " + t.Ref() + reg
	case "secret":
		return "Open the secret " + n, "Secrets Manager > Secrets > " + n,
			"aws secretsmanager describe-secret --secret-id " + t.Ref() + reg
	case "lambda":
		return "Open the Lambda function " + n, "Lambda > Functions > " + n,
			"aws lambda get-function-configuration --function-name " + n + reg
	case "bucket":
		return "Open the bucket " + n, "S3 > Buckets > " + n + " > Permissions",
			"aws s3api get-bucket-policy --bucket " + n + "; aws s3api get-public-access-block --bucket " + n
	case "instance":
		return "Open the instance " + n, "EC2 > Instances > " + n,
			"aws ec2 describe-instances --instance-ids " + n + reg
	case "parameter":
		return "Open the parameter " + n, "Systems Manager > Parameter Store > " + n,
			"aws ssm describe-parameters --parameter-filters Key=Name,Values=" + n + reg
	case "eks_cluster":
		return "Open the EKS cluster " + n, "EKS > Clusters > " + n,
			"aws eks describe-cluster --name " + n + reg
	case "task_definition":
		return "Open the task definition " + n, "ECS > Task definitions > " + n,
			"aws ecs describe-task-definition --task-definition " + n + reg
	case "certificate":
		return "Open the certificate " + n, "Certificate Manager > Certificates > " + n,
			"aws acm describe-certificate --certificate-arn " + t.ARN + reg
	case "db":
		return "Open the database " + n, "RDS > Databases > " + n,
			"aws rds describe-db-instances --db-instance-identifier " + n + reg
	case "snapshot":
		return "Open the snapshot " + n, "RDS > Snapshots > " + n,
			"aws rds describe-db-snapshot-attributes --db-snapshot-identifier " + n + reg
	case "account":
		return "Open AWS account " + t.Account, "Sign in to AWS account " + t.Account, ""
	}
	if t.ARN != "" {
		return "Open " + n, "Open " + t.ARN + " in the AWS console", ""
	}
	return "Open " + n, "Find " + n + " in the AWS console of account " + t.Account, ""
}

// tagCLI is the command that adds one tag to the target ("" when the kind cannot be tagged here).
func tagCLI(t Target, key, value string) string {
	reg := ""
	if t.Region != "" {
		reg = " --region " + t.Region
	}
	kv := "Key=" + key + ",Value=" + value
	switch t.Kind {
	case "role":
		return "aws iam tag-role --role-name " + t.Name + " --tags " + kv
	case "user":
		return "aws iam tag-user --user-name " + t.Name + " --tags " + kv
	case "policy":
		return "aws iam tag-policy --policy-arn " + t.ARN + " --tags " + kv
	case "secret":
		return "aws secretsmanager tag-resource --secret-id " + t.Ref() + " --tags " + kv + reg
	case "kms_key":
		return "aws kms tag-resource --key-id " + t.Ref() + " --tags TagKey=" + key + ",TagValue=" + value + reg
	case "lambda":
		if t.ARN != "" {
			return "aws lambda tag-resource --resource " + t.ARN + " --tags " + key + "=" + value + reg
		}
	case "instance":
		return "aws ec2 create-tags --resources " + t.Name + " --tags " + kv + reg
	}
	if t.ARN != "" {
		return "aws resourcegroupstaggingapi tag-resources --resource-arn-list " + t.ARN + " --tags " + key + "=" + value + reg
	}
	return ""
}

// tagValues are the tags the engine's governance rules read, with the value the person must choose.
var tagValues = [][2]string{
	{"owner", "<owner team or e-mail>"}, {"application", "<application name>"},
	{"purpose", "<what this identity is used for>"}, {"environment", "<prod|staging|dev>"},
	{"ExpiresOn", "<YYYY-MM-DD>"}, {"ReviewDate", "<YYYY-MM-DD>"},
}

// GuideVars are the placeholder values of a guide, from the finding only (no AWS call): the
// target, where and how to look at it, the tag commands and the finding's advice.
func GuideVars(f domain.Finding) map[string]string {
	t := ManualTarget(f)
	title, console, cli := view(t)
	v := map[string]string{
		"target": t.Ref(), "target_name": t.Name, "target_arn": t.ARN, "target_kind": t.Kind,
		"account_id": t.Account, "region": t.Region, "region_flag": "",
		"open_title": title, "open_console": console, "open_cli": cli,
		"how_to_fix": strings.TrimSpace(f.Remediation), "rule_id": f.RuleID, "rule_name": f.RuleName,
	}
	if t.Region != "" {
		v["region_flag"] = " --region " + t.Region
	}
	if v["how_to_fix"] == "" {
		v["how_to_fix"] = "fix what the finding describes (rule " + f.RuleID + ")"
	}
	switch t.Kind {
	case "role":
		v["role_name"], v["role_arn"] = t.Name, t.ARN
	case "user":
		v["user_name"] = t.Name
	case "kms_key":
		v["key_id"] = t.Ref()
	case "secret":
		v["secret_id"] = t.Ref()
	}
	for _, kv := range tagValues {
		v["tag_"+strings.ToLower(kv[0])] = tagCLI(t, kv[0], kv[1])
	}
	return v
}

// GuideSteps are the steps of a remediation_guides row with the placeholders filled from the finding.
func GuideSteps(g *domain.Guide, f domain.Finding) []domain.GuidedStep {
	if g == nil {
		return nil
	}
	return renderGuide(g.Steps, GuideVars(f))
}

// renderGuide fills the placeholders of guide steps. A known placeholder may be empty (e.g.
// {region_flag}); an unknown one becomes <name>. Steps left with no title are dropped.
func renderGuide(steps json.RawMessage, vars map[string]string) []domain.GuidedStep {
	var tpl []domain.GuidedStep
	if err := json.Unmarshal(steps, &tpl); err != nil {
		return nil
	}
	fill := func(s string) string {
		return strings.TrimSpace(placeholder.ReplaceAllStringFunc(s, func(m string) string {
			if v, ok := vars[m[1:len(m)-1]]; ok {
				return v
			}
			return "<" + m[1:len(m)-1] + ">"
		}))
	}
	out := make([]domain.GuidedStep, 0, len(tpl))
	for _, s := range tpl {
		st := domain.GuidedStep{Title: fill(s.Title), Console: fill(s.Console), CLI: fill(s.CLI), IaC: fill(s.IaC)}
		if st.Title != "" {
			out = append(out, st)
		}
	}
	return out
}
