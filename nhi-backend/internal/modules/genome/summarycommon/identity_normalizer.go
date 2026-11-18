package summarycommon

import (
	"encoding/json"
	"strings"

	"nhi-backend-api/internal/modules/genome/workloadtypes"
)

// resolveMonitoringType maps a discovery identity type to its monitoring
// subtype and source family.
func resolveMonitoringType(identityType string) (subtype, family string, ok bool) {
	return workloadtypes.Resolve(identityType)
}

// monitoredIdentity is the normalized shape of one discovery row.
type MonitoredIdentity struct {
	Key            MonitoringKey
	Subtype        string
	DisplayName    string
	Status         string
	AccountID      string
	Region         string
	ServiceName    string
	ClusterName    string
	RoleARN        string
	RoleName       string
	RoleType       string
	TaskDefinition string
	InstanceID     string
	WorkloadKey    string

	DiscoveryIdentityID string
	ResourceARN         string

	ClusterARN string
	TaskGroup  string

	PrincipalARN     string
	RoleKind         string
	TaskRoleARN      string
	ExecutionRoleARN string
}

// EventName returns the identity name used by log_events.
func (i MonitoredIdentity) EventName() string {
	if i.Key.SourceType == "ECS" && i.RoleARN != "" {
		return i.RoleARN
	}
	return i.Key.IdentityName
}

func (i MonitoredIdentity) Ref() DashboardIdentityRef {
	return DashboardIdentityRef{
		ID:           i.Key.SourceType + ":" + i.Key.IdentityName,
		SourceType:   i.Key.SourceType,
		IdentityName: i.Key.IdentityName,
		DisplayName:  i.DisplayName,
	}
}

// MonitoringWorkloadKey returns the shared workload key when available.
func (i MonitoredIdentity) MonitoringWorkloadKey() (MonitoringKey, bool) {
	if i.WorkloadKey == "" || i.WorkloadKey == i.Key.IdentityName {
		return MonitoringKey{}, false
	}

	return MonitoringKey{
		SourceType:   i.Key.SourceType,
		IdentityName: i.WorkloadKey,
	}, true
}

// AllKeys returns the identity key followed by its workload key.
func (i MonitoredIdentity) AllKeys() []MonitoringKey {
	keys := []MonitoringKey{i.Key}

	if wk, ok := i.MonitoringWorkloadKey(); ok {
		keys = append(keys, wk)
	}

	return keys
}

// NormalizeDiscoveryRow converts one discovery inventory row into the base
// monitored identity.
//
// ECS credential expansion happens later in ExpandCredentialIdentities(),
// where one ECS discovery row can become:
//
//   - task-role monitored identity
//   - execution-role monitored identity
//
// The base identity retains DiscoveryIdentityID and ResourceARN so every
// expanded principal can navigate back to the same inventory record.
func NormalizeDiscoveryRow(
	row DiscoveryIdentityRow,
) (
	MonitoredIdentity,
	bool,
) {
	subtype, family, ok := resolveMonitoringType(
		row.IdentityType,
	)
	if !ok {
		return MonitoredIdentity{}, false
	}

	attrs := make(map[string]any)

	if len(row.TypeAttributes) > 0 {
		_ = json.Unmarshal(
			row.TypeAttributes,
			&attrs,
		)
	}

	canonicalARN := canonicalMonitoringARN(
		subtype,
		row.ARN,
	)

	resourceName := arnResourceName(
		canonicalARN,
	)

	identity := MonitoredIdentity{
		Key: MonitoringKey{
			SourceType: family,
		},

		Subtype: subtype,

		Status: strings.TrimSpace(
			row.Status,
		),

		AccountID: strings.TrimSpace(
			row.AccountID,
		),

		Region: strings.TrimSpace(
			row.Region,
		),

		DiscoveryIdentityID: strings.TrimSpace(
			row.ID,
		),

		ResourceARN: strings.TrimSpace(
			row.ARN,
		),
	}

	if identity.AccountID == "" {
		identity.AccountID = arnField(
			canonicalARN,
			4,
		)
	}

	if identity.Region == "" {
		identity.Region = arnField(
			canonicalARN,
			3,
		)
	}

	// Extract generic runtime metadata. ECS-specific values are normalized
	// again below to prevent a task-definition family from being mistaken for
	// an ECS service.
	identity.ClusterName = lastPathSegment(
		attrString(
			attrs,
			"cluster_name",
			"clusterName",
			"cluster",
			"cluster_arn",
			"clusterArn",
		),
	)

	identity.ServiceName = strings.TrimSpace(
		attrString(
			attrs,
			"service_name",
			"serviceName",
			"service",
			"workload_name",
			"workloadName",
			"project_name",
			"projectName",
			"application_name",
			"applicationName",
			"pipeline_name",
			"pipelineName",
			"stack_name",
			"stackName",
			"job_name",
			"jobName",
			"function_name",
			"functionName",
			"state_machine_name",
			"stateMachineName",
		),
	)

	identity.TaskDefinition = strings.TrimSpace(
		attrString(
			attrs,
			"task_definition_arn",
			"taskDefinitionArn",
			"task_definition",
			"taskDefinition",
			"task_definition_family",
			"taskDefinitionFamily",
		),
	)

	identity.InstanceID = strings.TrimSpace(
		attrString(
			attrs,
			"instance_id",
			"instanceId",
			"managed_instance_id",
			"managedInstanceId",
		),
	)

	// ECS normalization.
	//
	// The ECS group field is authoritative:
	//
	//   service:<service-name> -> ECS service task
	//   family:<family-name>   -> standalone ECS task
	//
	// ServiceName must contain only a genuine ECS service name. It must never
	// fall back to the task-definition family.
	if subtype == "ecs_task" {
		identity.ClusterARN = strings.TrimSpace(
			attrString(
				attrs,
				"cluster_arn",
				"clusterArn",
				"cluster",
			),
		)

		identity.TaskGroup = strings.TrimSpace(
			attrString(
				attrs,
				"group",
				"task_group",
				"taskGroup",
			),
		)

		identity.TaskDefinition = strings.TrimSpace(
			firstNonEmpty(
				attrString(
					attrs,
					"task_definition_arn",
					"taskDefinitionArn",
					"task_definition",
					"taskDefinition",
					"task_definition_family",
					"taskDefinitionFamily",
				),
				identity.TaskDefinition,
			),
		)

		// Some scanner versions place the full cluster ARN in cluster_name.
		if identity.ClusterARN == "" {
			clusterValue := strings.TrimSpace(
				attrString(
					attrs,
					"cluster_name",
					"clusterName",
				),
			)

			if strings.HasPrefix(
				clusterValue,
				"arn:aws:ecs:",
			) {
				identity.ClusterARN =
					clusterValue
			}
		}

		if identity.ClusterName == "" {
			identity.ClusterName =
				lastPathSegment(
					identity.ClusterARN,
				)
		}

		// Clear the generic service value first. ECS service membership must be
		// sourced only from group=service:* or an explicit service-name field.
		identity.ServiceName = ""

		switch {
		case strings.HasPrefix(
			identity.TaskGroup,
			"service:",
		):
			identity.ServiceName =
				strings.TrimSpace(
					strings.TrimPrefix(
						identity.TaskGroup,
						"service:",
					),
				)

		default:
			identity.ServiceName =
				strings.TrimSpace(
					attrString(
						attrs,
						"service_name",
						"serviceName",
						"ecs_service_name",
						"ecsServiceName",
					),
				)
		}

		// Preserve role ARNs from type_attributes as fallback metadata.
		// identity_credentials remains authoritative during role expansion.
		identity.TaskRoleARN = strings.TrimSpace(
			attrString(
				attrs,
				"task_role_arn",
				"taskRoleArn",
				"bound_role_arn",
				"boundRoleArn",
			),
		)

		identity.ExecutionRoleARN =
			strings.TrimSpace(
				attrString(
					attrs,
					"execution_role_arn",
					"executionRoleArn",
				),
			)

		// The base ECS discovery identity represents the workload. The role
		// fields are assigned later by ExpandCredentialIdentities().
		identity.RoleARN = ""
		identity.RoleName = ""
		identity.RoleType = ""
		identity.PrincipalARN = ""
		identity.RoleKind = ""
	} else {
		roleARN := strings.TrimSpace(
			attrString(
				attrs,
				"bound_role_arn",
				"boundRoleArn",
				"role_arn",
				"roleArn",
				"function_role_arn",
				"functionRoleArn",
				"execution_role_arn",
				"executionRoleArn",
				"service_role_arn",
				"serviceRoleArn",
				"instance_profile_role_arn",
				"instanceProfileRoleArn",
				"job_role_arn",
				"jobRoleArn",
				"automation_role_arn",
				"automationRoleArn",
				"compute_role_arn",
				"computeRoleArn",
			),
		)

		if roleARN != "" {
			identity.RoleARN = roleARN
			identity.PrincipalARN = roleARN
			identity.RoleName = arnResourceName(
				roleARN,
			)
		}

		identity.RoleType = strings.TrimSpace(
			attrString(
				attrs,
				"role_type",
				"roleType",
			),
		)
	}

	if subtype == "ec2_instance" {
		identity.RoleType =
			"EC2_INSTANCE_PROFILE"

		if identity.InstanceID == "" {
			identity.InstanceID =
				resourceName
		}
	}

	// Apply generic service-name fallback only to non-ECS workloads.
	if subtype != "ecs_task" &&
		identity.ServiceName == "" {
		identity.ServiceName = firstNonEmpty(
			strings.TrimSpace(
				attrString(
					attrs,
					"name",
					"resource_name",
					"resourceName",
				),
			),
			resourceName,
		)
	}

	// The canonical principal/resource ARN is preferred for the identity key.
	// If an ARN is unavailable, build a stable typed fallback.
	if canonicalARN != "" {
		identity.Key.IdentityName =
			canonicalARN
	} else {
		identity.Key.IdentityName =
			strings.Join(
				[]string{
					strings.ToLower(
						family,
					),
					identity.AccountID,
					identity.Region,
					subtype,
					dashed(
						firstNonEmpty(
							row.Name,
							identity.ServiceName,
							resourceName,
						),
					),
				},
				":",
			)
	}

	identity.DisplayName = firstNonEmpty(
		row.Name,
		identity.ServiceName,
		resourceName,
		identity.Key.IdentityName,
	)

	identity.WorkloadKey = workloadKeyFor(
		identity,
		subtype,
		resourceName,
	)

	return identity, true
}
func canonicalMonitoringARN(sub, arn string) string {
	arn = strings.TrimSpace(arn)
	parts := arnParts(arn)
	if parts == nil {
		return arn
	}

	prefix := strings.Join(parts[:5], ":")
	resource := parts[5]
	seg := strings.Split(resource, ":")

	switch sub {
	case "lambda_function":
		if len(seg) >= 2 && seg[0] == "function" {
			return prefix + ":function:" + seg[1]
		}

	case "step_function":
		if len(seg) >= 2 &&
			(seg[0] == "execution" ||
				seg[0] == "express" ||
				seg[0] == "stateMachine") {
			return prefix + ":stateMachine:" + seg[1]
		}
	}

	return arn
}

func serverlessName(sub string, attrs map[string]any, resource string) string {
	switch sub {
	case "lambda_function":
		return firstNonEmpty(attrString(attrs, "function_name", "functionName"), resource)

	case "step_function":
		return firstNonEmpty(attrString(attrs, "state_machine_name", "stateMachineName"), resource)

	case "glue_job", "glue_crawler":
		return firstNonEmpty(
			attrString(attrs, "job_name", "jobName", "crawler_name", "crawlerName"),
			resource,
		)

	case "ecs_task":
		return firstNonEmpty(
			normalizeECSGroupName(attrString(attrs, "group", "task_group")),
			lastPathSegment(attrString(attrs, "task_definition_family")),
		)
	}

	return firstNonEmpty(attrString(attrs, "name", "resource_name"), resource)
}

// workloadKeyFor derives the shared workload key.
func workloadKeyFor(
	id MonitoredIdentity,
	subtype string,
	resource string,
) string {
	accountID := id.AccountID
	region := id.Region

	name := dashed(
		firstNonEmpty(
			id.ServiceName,
			resource,
			id.DisplayName,
		),
	)

	switch subtype {
	case "ecs_task":
		family := lastPathSegment(
			id.TaskDefinition,
		)

		if revisionIndex := strings.LastIndexByte(
			family,
			':',
		); revisionIndex > 0 {
			family = family[:revisionIndex]
		}

		return strings.Join(
			[]string{
				"ecs",
				accountID,
				region,
				dashed(id.ClusterName),
				dashed(
					firstNonEmpty(
						normalizeECSGroupName(
							id.TaskGroup,
						),
						id.ServiceName,
						family,
					),
				),
				dashed(family),
			},
			":",
		)

	case "lambda_function":
		return strings.Join(
			[]string{
				"lambda",
				accountID,
				region,
				name,
			},
			":",
		)

	case "step_function":
		return strings.Join(
			[]string{
				"step_functions",
				accountID,
				region,
				name,
			},
			":",
		)

	case "ec2_instance":
		roleName := dashed(
			firstNonEmpty(
				id.RoleName,
				id.InstanceID,
				resource,
			),
		)

		return strings.Join(
			[]string{
				"ec2",
				accountID,
				region,
				roleName,
				roleName,
			},
			":",
		)

	case "glue_job", "glue_crawler":
		return strings.Join(
			[]string{
				"glue",
				accountID,
				region,
				name,
			},
			":",
		)

	case "eventbridge_rule",
		"eventbridge_target",
		"eventbridge_pipe",
		"eventbridge_scheduler":
		return strings.Join(
			[]string{
				"eventbridge",
				accountID,
				region,
				"eventbridge_scheduler",
				name,
			},
			":",
		)

	case "ssm_managed_node", "ssm_automation":
		ssmName := dashed(
			firstNonEmpty(
				id.ServiceName,
				id.InstanceID,
				resource,
			),
		)

		return strings.Join(
			[]string{
				"ssm",
				accountID,
				region,
				ssmName,
			},
			":",
		)

	case "codebuild_project":
		return strings.Join(
			[]string{
				"codebuild",
				accountID,
				region,
				"codebuild_project",
				name,
			},
			":",
		)

	case "codedeploy_application",
		"codedeploy_deployment_group",
		"codedeploy_service_role":
		return strings.Join(
			[]string{
				"codedeploy",
				accountID,
				region,
				name,
			},
			":",
		)

	case "codepipeline":
		return strings.Join(
			[]string{
				"codepipeline",
				accountID,
				region,
				"codepipeline",
				name,
			},
			":",
		)

	case "cloudformation_stack",
		"cloudformation_stack_role",
		"cloudformation_stackset":
		return strings.Join(
			[]string{
				"cloudformation",
				accountID,
				region,
				name,
			},
			":",
		)

	case "batch_job",
		"batch_job_definition",
		"batch_job_queue",
		"batch_compute_environment":
		return strings.Join(
			[]string{
				"batch",
				accountID,
				region,
				name,
			},
			":",
		)

	case "amplify_app",
		"amplify_branch",
		"amplify_backend_environment":
		return strings.Join(
			[]string{
				"amplify",
				accountID,
				region,
				name,
			},
			":",
		)

	case "iam_role",
		"iam_user",
		"iam_user_service_account",
		"iam_access_key",
		"iam_roles_anywhere_session",
		"saas_vendor_role":
		principalName := dashed(
			firstNonEmpty(
				id.RoleName,
				id.ServiceName,
				resource,
			),
		)

		return strings.Join(
			[]string{
				"iam",
				accountID,
				"global",
				subtype,
				principalName,
			},
			":",
		)
	}

	return strings.Join(
		[]string{
			strings.ToLower(
				id.Key.SourceType,
			),
			accountID,
			region,
			subtype,
			name,
		},
		":",
	)
}

func normalizeECSGroupName(value string) string {
	value = strings.TrimSpace(value)
	value = strings.TrimPrefix(value, "service:")
	value = strings.TrimPrefix(value, "family:")
	return value
}

func ecsTaskDefinitionFamily(value string) string {
	family := lastPathSegment(value)
	if index := strings.LastIndexByte(family, ':'); index > 0 {
		family = family[:index]
	}
	return strings.TrimSpace(family)
}

func ecsRoleKind(bindingType string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(bindingType)) {
	case "task_role":
		return "task", true
	case "execution_role":
		return "execution", true
	default:
		return "", false
	}
}

// ecsRoleWorkloadKey builds a role-specific ECS workload key.
func ecsRoleWorkloadKey(
	identity MonitoredIdentity,
	roleARN string,
	roleKind string,
) string {
	accountID := strings.TrimSpace(
		identity.AccountID,
	)

	region := strings.TrimSpace(
		identity.Region,
	)

	clusterARN := strings.TrimSpace(
		identity.ClusterARN,
	)

	roleARN = strings.TrimSpace(roleARN)

	roleKind = strings.ToLower(
		strings.TrimSpace(roleKind),
	)

	if accountID == "" ||
		region == "" ||
		clusterARN == "" ||
		roleARN == "" {
		return ""
	}

	if roleKind != "task" &&
		roleKind != "execution" {
		return ""
	}

	taskGroup := strings.TrimSpace(
		identity.TaskGroup,
	)

	serviceName := strings.TrimSpace(
		identity.ServiceName,
	)

	mode := "standalone"
	workloadName := ""

	switch {
	case strings.HasPrefix(
		taskGroup,
		"service:",
	):
		mode = "service"

		workloadName = strings.TrimSpace(
			strings.TrimPrefix(
				taskGroup,
				"service:",
			),
		)

	case serviceName != "":
		mode = "service"
		workloadName = serviceName

	case strings.HasPrefix(
		taskGroup,
		"family:",
	):
		workloadName = strings.TrimSpace(
			strings.TrimPrefix(
				taskGroup,
				"family:",
			),
		)

	default:
		workloadName = taskGroup
	}

	family := ecsTaskDefinitionFamily(
		identity.TaskDefinition,
	)

	parts := []string{
		"ecs",
		accountID,
		region,
		clusterARN,
	}

	if mode == "service" {
		name := strings.TrimSpace(
			firstNonEmpty(
				workloadName,
				serviceName,
			),
		)

		if name == "" {
			return ""
		}

		parts = append(
			parts,
			dashed(name),
		)
	} else {
		name := strings.TrimSpace(
			firstNonEmpty(
				workloadName,
				family,
				identity.DisplayName,
			),
		)

		if name == "" {
			return ""
		}

		parts = append(
			parts,
			"standalone",
			dashed(name),
		)
	}

	parts = append(
		parts,
		roleARN,
		roleKind,
	)

	return strings.Join(parts, ":")
}

// ExpandCredentialIdentities converts one ECS workload into separate
// task-role and execution-role monitored identities.
func ExpandCredentialIdentities(
	base MonitoredIdentity,
	credentials []IdentityCredentialRow,
) []MonitoredIdentity {
	if base.Subtype != "ecs_task" {
		return []MonitoredIdentity{base}
	}

	identities := make([]MonitoredIdentity, 0, 2)
	seen := make(map[MonitoringKey]struct{}, 2)

	for _, credential := range credentials {
		roleKind, supported := ecsRoleKind(credential.BindingType)
		if !supported {
			continue
		}

		credentialARN := strings.TrimSpace(credential.CredentialARN)

		if !strings.HasPrefix(credentialARN, "arn:aws:iam::") {
			continue
		}

		workloadKey := ecsRoleWorkloadKey(
			base,
			credentialARN,
			roleKind,
		)

		if workloadKey == "" {
			continue
		}

		identity := base

		identity.Key = MonitoringKey{
			SourceType:   "ECS",
			IdentityName: credentialARN,
		}

		identity.PrincipalARN = credentialARN
		identity.RoleARN = credentialARN
		identity.RoleName = arnResourceName(credentialARN)
		identity.RoleKind = roleKind
		identity.WorkloadKey = workloadKey

		switch roleKind {
		case "task":
			identity.TaskRoleARN = credentialARN
			identity.RoleType = "ECS_TASK_ROLE"
			identity.DisplayName = strings.TrimSpace(
				base.DisplayName + " task role",
			)

		case "execution":
			identity.ExecutionRoleARN = credentialARN
			identity.RoleType = "ECS_EXECUTION_ROLE"
			identity.DisplayName = strings.TrimSpace(
				base.DisplayName + " execution role",
			)
		}

		if _, duplicate := seen[identity.Key]; duplicate {
			continue
		}

		seen[identity.Key] = struct{}{}
		identities = append(identities, identity)
	}

	if len(identities) == 0 {
		return []MonitoredIdentity{base}
	}

	return identities
}

// ---- small helpers ----------------------------------------------------------

func attrString(attrs map[string]any, keys ...string) string {
	for _, k := range keys {
		switch v := attrs[k].(type) {
		case string:
			if s := strings.TrimSpace(v); s != "" {
				return s
			}
		case float64, bool:
			b, _ := json.Marshal(v)
			return string(b)
		}
	}
	return ""
}

func arnParts(arn string) []string {
	if !strings.HasPrefix(arn, "arn:") {
		return nil
	}

	p := strings.SplitN(arn, ":", 6)
	if len(p) < 6 {
		return nil
	}

	return p
}

func arnField(arn string, i int) string {
	if p := arnParts(arn); p != nil {
		return p[i]
	}
	return ""
}

func arnResourceName(arn string) string {
	p := arnParts(arn)
	if p == nil {
		return ""
	}

	res := p[5]

	if i := strings.LastIndexByte(res, ':'); i >= 0 && isAllDigits(res[i+1:]) {
		res = res[:i]
	}

	if i := strings.LastIndexByte(res, '/'); i >= 0 {
		return res[i+1:]
	}

	if i := strings.LastIndexByte(res, ':'); i >= 0 {
		return res[i+1:]
	}

	return res
}

func isAllDigits(s string) bool {
	if s == "" {
		return false
	}

	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}

	return true
}

func lastPathSegment(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.LastIndexByte(s, '/'); i >= 0 {
		return s[i+1:]
	}
	return s
}

func dashed(s string) string {
	if s = strings.TrimSpace(s); s == "" {
		return "-"
	}
	return s
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if s := strings.TrimSpace(v); s != "" {
			return s
		}
	}
	return ""
}

func IntPtr(v int) *int {
	return &v
}

func FloatPtr(v float64) *float64 {
	return &v
}

func Round1(v float64) float64 {
	return float64(int(v*10+0.5)) / 10
}

func OptionalString(s string) *string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return &s
}

// ECSCredentialsFromAttributes extracts ECS task and execution role bindings.
func ECSCredentialsFromAttributes(rawJSON []byte) []IdentityCredentialRow {
	if len(rawJSON) == 0 {
		return nil
	}

	attrs := make(map[string]any)
	if err := json.Unmarshal(rawJSON, &attrs); err != nil {
		return nil
	}

	rawCredentials, ok := attrs["credentials"].([]any)
	if !ok {
		return nil
	}

	credentials := make([]IdentityCredentialRow, 0, len(rawCredentials))

	for _, item := range rawCredentials {
		entry, ok := item.(map[string]any)
		if !ok {
			continue
		}

		binding := strings.ToLower(strings.TrimSpace(
			attrString(entry, "binding"),
		))

		identifier := strings.TrimSpace(
			attrString(entry, "identifier"),
		)

		if identifier == "" || !strings.HasPrefix(identifier, "arn:aws:iam::") {
			continue
		}

		var bindingType string

		switch binding {
		case "taskrole", "task_role":
			bindingType = "task_role"
		case "executionrole", "execution_role":
			bindingType = "execution_role"
		default:
			continue
		}

		credentials = append(credentials, IdentityCredentialRow{
			BindingType:   bindingType,
			BindingSource: "type_attributes",
			CredentialARN: identifier,
			IsPrimary:     false,
		})
	}

	return credentials
}
