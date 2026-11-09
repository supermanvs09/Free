// Package workloadtypes decides which kinds of workload NHI Genome watches.
//
// Every discovered identity has a type (lambda_function, ecs_task, ...) that
// belongs to a compact family (LAMBDA, ECS, ...), the source_type the behaviour
// pipeline stores. NHI_GENOME_WORKLOAD_TYPES lists the families to show, for
// example "ECS,EC2,GLUE,LAMBDA,STEPFUNCTION"; empty shows every family.
package workloadtypes

import (
	"fmt"
	"sort"
	"strings"
	"sync"
)

// families maps each monitored identity type to its source_type family. It
// follows the contract's NHI type table; types fed by an external audit log
// (GitHub Actions, GitLab CI, Terraform) or attributed only conditionally (IoT
// things, Greengrass) are not monitored.
var families = map[string]string{
	// Core compute and serverless.
	"ec2_instance":    "EC2",
	"lambda_function": "LAMBDA",
	"ecs_task":        "ECS",

	// Application platforms.
	"app_runner_service":            "APP_RUNNER",
	"elastic_beanstalk_environment": "ELASTIC_BEAN",
	"amplify_app":                   "AMPLIFY",
	"amplify_branch":                "AMPLIFY",
	"amplify_backend_environment":   "AMPLIFY",

	// Systems Manager.
	"ssm_managed_node": "SSM",
	"ssm_automation":   "SSM",

	// Data and analytics.
	"glue_job":                  "GLUE",
	"glue_crawler":              "GLUE",
	"emr_cluster":               "EMR",
	"batch_job":                 "BATCH",
	"batch_job_definition":      "BATCH",
	"batch_job_queue":           "BATCH",
	"batch_compute_environment": "BATCH",
	"dms_replication_instance":  "DMS",
	"kinesis_firehose":          "KINESIS",
	"kinesis_analytics_app":     "KINESIS",
	"datasync_task":             "DATASYNC",

	// AI and ML.
	"sagemaker_notebook":       "SAGEMAKER",
	"sagemaker_training_job":   "SAGEMAKER",
	"sagemaker_processing_job": "SAGEMAKER",
	"sagemaker_endpoint":       "SAGEMAKER",
	"bedrock_agent":            "BEDROCK",
	"bedrock_knowledge_base":   "BEDROCK",

	// CI/CD and infrastructure.
	"codebuild_project":           "CODEBUILD",
	"codepipeline":                "CODEPIPELINE",
	"codedeploy_service_role":     "CODEDEPLOY",
	"codedeploy_application":      "CODEDEPLOY",
	"codedeploy_deployment_group": "CODEDEPLOY",
	"cloudformation_stack_role":   "CLOUDFORMATION",
	"cloudformation_stack":        "CLOUDFORMATION",
	"cloudformation_stackset":     "CLOUDFORMATION",
	"mwaa_environment":            "MWAA",

	// Orchestration and event-driven workloads.
	"step_function":         "STEP_FUNCTIONS",
	"eventbridge_rule":      "EVENTBRIDGE",
	"eventbridge_target":    "EVENTBRIDGE",
	"eventbridge_pipe":      "EVENTBRIDGE",
	"eventbridge_scheduler": "EVENTBRIDGE",
	"synthetics_canary":     "SYNTHETICS",

	// IoT and transfer.
	"iot_role_alias":  "IOT",
	"transfer_server": "TRANSFER",

	// IAM and external trust.
	"iam_role":                   "IAM",
	"iam_user":                   "IAM",
	"iam_user_service_account":   "IAM",
	"iam_access_key":             "IAM",
	"iam_roles_anywhere_session": "IAM",
	"saas_vendor_role":           "IAM",

	// Service-linked roles remain separate from ordinary IAM principals.
	"aws_service_linked_role": "AWS_SLR",
}

// aliases maps other spellings seen in scanner output to the identity type.
var aliases = map[string]string{
	// EC2.
	"aws::ec2::instance": "ec2_instance",
	"ec2":                "ec2_instance",

	// Lambda.
	"aws::lambda::function": "lambda_function",
	"lambda":                "lambda_function",

	// ECS.
	"aws::ecs::task":    "ecs_task",
	"aws::ecs::service": "ecs_task",
	"ecs_service":       "ecs_task",
	"ecs":               "ecs_task",

	// Step Functions.
	"aws::stepfunctions::statemachine": "step_function",
	"aws::states::statemachine":        "step_function",
	"step_functions":                   "step_function",
	"stepfunctions":                    "step_function",
	"stepfunction":                     "step_function",

	// Glue.
	"aws::glue::job":     "glue_job",
	"aws::glue::crawler": "glue_crawler",

	// Systems Manager.
	"aws::ssm::managedinstance": "ssm_managed_node",
	"aws::ssm::managednode":     "ssm_managed_node",
	"aws::ssm::automation":      "ssm_automation",

	// EventBridge.
	"aws::events::rule":        "eventbridge_rule",
	"aws::eventbridge::rule":   "eventbridge_rule",
	"aws::pipes::pipe":         "eventbridge_pipe",
	"aws::scheduler::schedule": "eventbridge_scheduler",
	"eventbridge_schedule":     "eventbridge_scheduler",

	// CodeBuild.
	"aws::codebuild::project": "codebuild_project",

	// CodePipeline.
	"aws::codepipeline::pipeline": "codepipeline",
	"codepipeline_pipeline":       "codepipeline",

	// CodeDeploy.
	"aws::codedeploy::application": "codedeploy_application",

	"aws::codedeploy::deploymentgroup": "codedeploy_deployment_group",

	"codedeploy_deploymentgroup": "codedeploy_deployment_group",

	// CloudFormation.
	"aws::cloudformation::stack": "cloudformation_stack",

	"aws::cloudformation::stackset": "cloudformation_stackset",

	// Batch.
	"aws::batch::job": "batch_job",

	"aws::batch::jobdefinition": "batch_job_definition",

	"aws::batch::jobqueue": "batch_job_queue",

	"aws::batch::computeenvironment": "batch_compute_environment",

	// Amplify.
	"aws::amplify::app": "amplify_app",

	"aws::amplify::branch": "amplify_branch",

	"aws::amplify::backendenvironment": "amplify_backend_environment",

	// IAM.
	"aws::iam::role":  "iam_role",
	"aws::iam::user":  "iam_user",
	"iam_roles":       "iam_role",
	"iam_users":       "iam_user",
	"iam_access_keys": "iam_access_key",

	// Other existing aliases.
	"aws::sagemaker::notebookinstance": "sagemaker_notebook",

	"aws::apprunner::service": "app_runner_service",
}
var (
	mu      sync.RWMutex
	enabled map[string]struct{} // nil: every family
)

// norm makes "STEP_FUNCTIONS", "StepFunction" and "stepfunctions" the same key.
func norm(s string) string {
	var b strings.Builder
	for _, r := range strings.ToUpper(s) {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return strings.TrimSuffix(b.String(), "S")
}

// Families is every family NHI Genome can watch, sorted.
func Families() []string {
	set := map[string]struct{}{}
	for _, f := range families {
		set[f] = struct{}{}
	}
	out := make([]string, 0, len(set))
	for f := range set {
		out = append(out, f)
	}
	sort.Strings(out)
	return out
}

// Configure sets the workload types to show from a comma-separated list.
// Empty means all of them. An unknown name is an error, so a typo cannot
// silently hide everything.
func Configure(raw string) error {
	if strings.TrimSpace(raw) == "" {
		mu.Lock()
		enabled = nil
		mu.Unlock()
		return nil
	}
	byNorm := map[string]string{}
	for _, f := range Families() {
		byNorm[norm(f)] = f
	}
	next := map[string]struct{}{}
	for _, part := range strings.Split(raw, ",") {
		if strings.TrimSpace(part) == "" {
			continue
		}
		f, ok := byNorm[norm(part)]
		if !ok {
			return fmt.Errorf("config: NHI_GENOME_WORKLOAD_TYPES has an unknown workload type %q; known: %s", strings.TrimSpace(part), strings.Join(Families(), ", "))
		}
		next[f] = struct{}{}
	}
	mu.Lock()
	if len(next) == 0 {
		enabled = nil
	} else {
		enabled = next
	}
	mu.Unlock()
	return nil
}

// Allows reports whether NHI Genome shows this family.
func Allows(family string) bool {
	mu.RLock()
	defer mu.RUnlock()
	if enabled == nil {
		return true
	}
	_, ok := enabled[family]
	return ok
}

// Enabled is the families shown now and whether that is all of them.
func Enabled() (list []string, all bool) {
	mu.RLock()
	defer mu.RUnlock()
	if enabled == nil {
		return Families(), true
	}
	for f := range enabled {
		list = append(list, f)
	}
	sort.Strings(list)
	return list, false
}

// Resolve maps a discovery identity type to its monitoring type and family. ok
// is false for a type that is not monitored or whose family is switched off.
func Resolve(identityType string) (subtype, family string, ok bool) {
	key := strings.NewReplacer("-", "_", " ", "_").Replace(strings.ToLower(strings.TrimSpace(identityType)))
	if alias, found := aliases[key]; found {
		key = alias
	}
	family, known := families[key]
	if !known || !Allows(family) {
		return key, family, false
	}
	return key, family, true
}
