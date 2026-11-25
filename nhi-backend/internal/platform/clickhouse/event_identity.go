package clickhouse

import (
	"context"
	"strconv"
	"strings"
	"time"

	ch "github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

// How log_events names the identity an event belongs to.
//
// For most workload families log_events.identity_name is the identity's own
// key. An ECS task's identity_name is the task label
// ("standalone:<family>_<role>_task"), while the identity this console tracks
// is the task role. For ECS the role ARN is therefore read from
// request_parameters.roleArn (the AssumeRole call), and from the role_arn
// column on events that carry no such parameter.
//
// toString() keeps the expression valid whether request_parameters is a String
// or a JSON column.

const ecsRoleArn = `if(JSONExtractString(toString(request_parameters), 'roleArn') != '',
	JSONExtractString(toString(request_parameters), 'roleArn'),
	if(role_arn != '', role_arn, identity_name))`

// EventIdentity is the identity key of a log_events row, for queries over many
// identities at once (it needs {names:Array(String)}, the requested keys): an
// ECS row counts under its workload_key, every other row under identity_name.
const EventIdentity = `if(source_type = 'ECS', workload_key, identity_name)`

// IdentityEquals is the predicate "this row belongs to the identity bound as
// {identity_name:String}" for one known source type.
//
// The baselines table is the source of the identity name used for the
// ClickHouse lookup:
//
//   - IAM: baselines.identity_name matches log_events.identity_name. The
//     matching log_events row's instance_arn is then matched exactly against
//     identities.arn.
//   - ECS: baselines.identity_name matches log_events.workload_key. The
//     matching log_events row's task_id is resolved through
//     ecs_task_registry.task_arn, which is matched exactly against
//     identities.arn.
//   - Every other family: baselines.identity_name matches both
//     log_events.identity_name and identities.arn.
//
// No workload_key fallback is applied for IAM or non-ECS identities, and no
// ARN-prefix normalization is applied anywhere.
func IdentityEquals(sourceType string) string {
	sourceType = strings.ToUpper(strings.TrimSpace(sourceType))

	if sourceType == "ECS" {
		return `workload_key = {identity_name:String}`
	}

	return `identity_name = {identity_name:String}`
}

// WorkloadFacts is what log_events knows about one baseline key
// (baselines.identity_name): the event identity names that were trained under
// it — the names alerts and identity_risk_scores are stored under — plus the
// last resolved event and the labels of its newest event.
type WorkloadFacts struct {
	SourceType string
	Key        string // requested baseline/workload key

	// IdentityNames contains distinct ClickHouse identity_name values observed
	// for this workload. EventIdentityName is the latest identity_name and is
	// the value persisted in alerts.identity_name.
	IdentityNames     []string
	EventIdentityName string

	LastSeen *time.Time

	DisplayName string
	ServiceName string
	ClusterName string

	// ECS task and IAM-role context from the same latest ClickHouse row.
	TaskID         string
	TaskDefinition string
	RoleARN        string
	RoleType       string // task | execution
	RoleKind       string // retained for compatibility with existing callers

	// InstanceARN is the IAM instance ARN of the latest matching log_events
	// row. For IAM identities it is matched exactly against identities.arn.
	InstanceProfileARN string
}

// workloadFactsLimit caps IdentityNames per key; a workload with more event
// identities than this is reported with the first ones only.
const workloadFactsLimit = 256

// ReadWorkloadFacts reads WorkloadFacts for every key at once from table, in
// the given accounts. An event counts for a key when its workload_key is the
// key or, for baselines the pipeline split per identity, when its
// identity_name is. Keys without events are absent from the result.
func ReadWorkloadFacts(
	ctx context.Context,
	conn driver.Conn,
	table string,
	accounts []string,
	keys []string,
) ([]WorkloadFacts, error) {
	if len(keys) == 0 || len(accounts) == 0 {
		return nil, nil
	}

	query := `
		SELECT
			source_type,
			k,
			names,
			last_seen,
			tupleElement(latest, 1) AS event_identity_name,
			tupleElement(latest, 2) AS display_name,
			tupleElement(latest, 3) AS task_id,
			tupleElement(latest, 4) AS task_definition,
			tupleElement(latest, 5) AS cluster_name,
			tupleElement(latest, 6) AS service_name,
			tupleElement(latest, 7) AS role_arn,
			tupleElement(latest, 8) AS role_type,
			tupleElement(latest, 9) AS role_kind,
			tupleElement(latest, 10) AS instance_profile_arn
		FROM
		(
			SELECT
				source_type,
				if(
					has({keys:Array(String)}, workload_key),
					workload_key,
					identity_name
				) AS k,
				groupUniqArrayIf(` + strconv.Itoa(workloadFactsLimit) + `)(
					identity_name,
					identity_name != ''
				) AS names,
				maxOrNullIf(
					event_time,
					is_resolved = 1
				) AS last_seen,
			argMax(
	tuple(
		identity_name,
		display_name,
		task_id,
		task_definition,
		cluster_name,
		service_name,
		role_arn,
		toString(role_type),
		toString(role_kind),
		instance_profile_arn
	),
	tuple(
		ingested_at,
		event_time
	)
) AS latest
			FROM ` + table + `
			WHERE has(
				{accounts:Array(String)},
				account_id
			)
			AND (
				has(
					{keys:Array(String)},
					workload_key
				)
				OR has(
					{keys:Array(String)},
					identity_name
				)
			)
			GROUP BY
				source_type,
				k
		)
	`

	rows, err := conn.Query(
		ctx,
		query,
		ch.Named("accounts", accounts),
		ch.Named("keys", keys),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]WorkloadFacts, 0)
	for rows.Next() {
		var facts WorkloadFacts
		var sourceType string

		if err := rows.Scan(
			&sourceType,
			&facts.Key,
			&facts.IdentityNames,
			&facts.LastSeen,
			&facts.EventIdentityName,
			&facts.DisplayName,
			&facts.TaskID,
			&facts.TaskDefinition,
			&facts.ClusterName,
			&facts.ServiceName,
			&facts.RoleARN,
			&facts.RoleType,
			&facts.RoleKind,
			&facts.InstanceProfileARN,
		); err != nil {
			return nil, err
		}

		facts.SourceType = strings.ToUpper(strings.TrimSpace(sourceType))
		facts.Key = strings.TrimSpace(facts.Key)
		facts.EventIdentityName = strings.TrimSpace(facts.EventIdentityName)
		facts.DisplayName = strings.TrimSpace(facts.DisplayName)
		facts.TaskID = strings.TrimSpace(facts.TaskID)
		facts.TaskDefinition = strings.TrimSpace(facts.TaskDefinition)
		facts.ClusterName = strings.TrimSpace(facts.ClusterName)
		facts.ServiceName = strings.TrimSpace(facts.ServiceName)
		facts.RoleARN = strings.TrimSpace(facts.RoleARN)
		facts.RoleType = strings.TrimSpace(facts.RoleType)
		facts.RoleKind = strings.TrimSpace(facts.RoleKind)
		facts.InstanceProfileARN = strings.TrimSpace(facts.InstanceProfileARN)

		if facts.LastSeen != nil {
			value := facts.LastSeen.UTC()
			facts.LastSeen = &value
		}

		result = append(result, facts)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return result, nil
}
