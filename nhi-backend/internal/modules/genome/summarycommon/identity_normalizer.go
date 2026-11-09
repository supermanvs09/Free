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

// NormalizeDiscoveryRow converts a discovery row into a monitored identity.
func NormalizeDiscoveryRow(row DiscoveryIdentityRow) (MonitoredIdentity, bool) {
	sub, family, ok := resolveMonitoringType(row.IdentityType)
	if !ok {
		return MonitoredIdentity{}, false
	}

	attrs := map[string]any{}
	if len(row.TypeAttributes) > 0 {
		_ = json.Unmarshal(row.TypeAttributes, &attrs)
	}

	canonical := canonicalMonitoringARN(sub, row.ARN)
	resource := arnResourceName(canonical)

	id := MonitoredIdentity{
		Key: MonitoringKey{
			SourceType: family,
		},
		Subtype:             sub,
		Status:              strings.TrimSpace(row.Status),
		AccountID:           strings.TrimSpace(row.AccountID),
		Region:              strings.TrimSpace(row.Region),
		DiscoveryIdentityID: strings.TrimSpace(row.ID),
	}

	if id.AccountID == "" {
		id.AccountID = arnField(canonical, 4)
	}
	if id.Region == "" {
		id.Region = arnField(canonical, 3)
	}

	id.ClusterName = lastPathSegment(attrString(
		attrs,
		"cluster_name",
		"clusterName",
		"cluster",
		"cluster_arn",
		"clusterArn",
	))

	id.ClusterARN = strings.TrimSpace(attrString(
		attrs,
		"cluster_arn",
		"clusterArn",
		"cluster",
	))

	if !strings.HasPrefix(id.ClusterARN, "arn:") {
		clusterValue := strings.TrimSpace(attrString(
			attrs,
			"cluster_name",
			"clusterName",
		))
		if strings.HasPrefix(clusterValue, "arn:") {
			id.ClusterARN = clusterValue
		}
	}

	id.TaskGroup = attrString(
		attrs,
		"group",
		"task_group",
		"taskGroup",
	)

	id.ServiceName = attrString(
		attrs,
		"service_name",
		"serviceName",
		"service",
	)

	if sub == "ecs_task" && id.ServiceName == "" {
		id.ServiceName = normalizeECSGroupName(id.TaskGroup)
	}

	id.TaskDefinition = attrString(
		attrs,
		"task_definition",
		"taskDefinition",
		"task_definition_arn",
		"taskDefinitionArn",
		"task_definition_family",
	)

	id.InstanceID = attrString(attrs, "instance_id", "instanceId")

	if roleARN := attrString(
		attrs,
		"bound_role_arn",
		"role_arn",
		"roleArn",
		"task_role_arn",
		"taskRoleArn",
		"execution_role_arn",
		"executionRoleArn",
		"iam_role_arn",
		"service_role_arn",
		"serviceRoleArn",
		"service_role",
		"execution_role",
		"role",
		"instance_profile_role_arn",
		"job_role_arn",
	); roleARN != "" {
		id.RoleARN = roleARN
		id.RoleName = arnResourceName(roleARN)
	}

	if sub == "ec2_instance" {
		id.RoleType = "EC2_INSTANCE_PROFILE"
		if id.InstanceID == "" {
			id.InstanceID = resource
		}
	} else {
		id.RoleType = attrString(attrs, "role_type", "roleType")
	}

	if id.ServiceName == "" {
		id.ServiceName = serverlessName(sub, attrs, resource)
	}

	if canonical != "" {
		id.Key.IdentityName = canonical
	} else {
		id.Key.IdentityName = strings.Join([]string{
			strings.ToLower(family),
			id.AccountID,
			id.Region,
			sub,
			dashed(firstNonEmpty(row.Name, id.ServiceName)),
		}, ":")
	}

	id.DisplayName = firstNonEmpty(row.Name, resource, id.Key.IdentityName)
	id.WorkloadKey = workloadKeyFor(id, sub, resource)

	return id, true
}

// canonicalMonitoringARN removes version and execution qualifiers.
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
	credentialARN string,
	roleKind string,
) string {
	clusterARN := strings.TrimSpace(identity.ClusterARN)
	credentialARN = strings.TrimSpace(credentialARN)

	if clusterARN == "" || credentialARN == "" {
		return ""
	}

	taskGroup := strings.TrimSpace(identity.TaskGroup)
	workloadName := normalizeECSGroupName(taskGroup)
	family := ecsTaskDefinitionFamily(identity.TaskDefinition)

	if workloadName == "" {
		workloadName = firstNonEmpty(
			identity.ServiceName,
			family,
			identity.DisplayName,
		)
	}

	parts := []string{
		"ecs",
		identity.AccountID,
		identity.Region,
		clusterARN,
	}

	if strings.HasPrefix(taskGroup, "service:") {
		parts = append(
			parts,
			dashed(workloadName),
		)
	} else {
		parts = append(
			parts,
			"standalone",
			dashed(
				firstNonEmpty(
					workloadName,
					family,
				),
			),
		)
	}
	parts = append(parts, credentialARN, roleKind)

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
