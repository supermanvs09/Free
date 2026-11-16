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
// key. An ECS task's identity_name is the task label ("standalone:<family>_<role>_task"),
// while the identity this console tracks is the task role. For ECS the role ARN
// is therefore read from request_parameters.roleArn (the AssumeRole call), and
// from the role_arn column on events that carry no such parameter.
//
// toString() keeps the expression valid whether request_parameters is a String
// or a JSON column.

const ecsRoleArn = `if(JSONExtractString(toString(request_parameters), 'roleArn') != '',
	JSONExtractString(toString(request_parameters), 'roleArn'),
	if(role_arn != '', role_arn, identity_name))`

// EventIdentity is the identity key of a log_events row, for queries over many
// identities at once (it needs {names:Array(String)}, the requested keys): an
// ECS row counts under its role ARN when that was asked for, under its own
// identity_name otherwise; every other row under identity_name.
const EventIdentity = `if(source_type = 'ECS' AND has({names:Array(String)}, ` + ecsRoleArn + `), ` + ecsRoleArn + `, identity_name)`

// IdentityEquals is the predicate "this row belongs to the identity bound as
// {identity_name:String}" for one known source type. Non-ECS keeps the plain
// column comparison; ECS matches the role ARN, or the row's own identity_name
// for a key that is not a role ARN.
//
// Every family also matches log_events.workload_key: the pipeline stores a
// baseline under the workload key of its events (baselines.identity_name =
// log_events.workload_key), so a baseline key selects all of the events that
// trained it. Workload keys never collide with event identity names or role
// ARNs ("ecs:<account>:...", "ec2:<account>:..."), so the OR does not widen a
// lookup by identity name or role ARN.
func IdentityEquals(sourceType string) string {
	if strings.EqualFold(strings.TrimSpace(sourceType), "ECS") {
		return `(` + ecsRoleArn + ` = {identity_name:String} OR identity_name = {identity_name:String} OR workload_key = {identity_name:String})`
	}
	return `(identity_name = {identity_name:String} OR workload_key = {identity_name:String})`
}

// WorkloadFacts is what log_events knows about one baseline key
// (baselines.identity_name): the event identity names that were trained under
// it — the names alerts and identity_risk_scores are stored under — plus the
// last resolved event and the labels of its newest event.
type WorkloadFacts struct {
	SourceType    string
	Key           string   // the requested key
	IdentityNames []string // distinct log_events.identity_name of the key's events
	LastSeen      *time.Time
	DisplayName   string
	RoleARN       string
	RoleKind      string
	ServiceName   string
	ClusterName   string
}

// workloadFactsLimit caps IdentityNames per key; a workload with more event
// identities than this is reported with the first ones only.
const workloadFactsLimit = 256

// ReadWorkloadFacts reads WorkloadFacts for every key at once from table, in
// the given accounts. An event counts for a key when its workload_key is the
// key or, for baselines the pipeline split per identity, when its
// identity_name is. Keys without events are absent from the result.
func ReadWorkloadFacts(ctx context.Context, conn driver.Conn, table string, accounts, keys []string) ([]WorkloadFacts, error) {
	if len(keys) == 0 || len(accounts) == 0 {
		return nil, nil
	}
	q := `SELECT source_type,
	             if(has({keys:Array(String)}, workload_key), workload_key, identity_name) AS k,
	             groupUniqArrayIf(` + strconv.Itoa(workloadFactsLimit) + `)(identity_name, identity_name != '') AS names,
	             maxOrNullIf(event_time, is_resolved = 1) AS last_seen,
	             argMax(display_name, event_time) AS display_name,
	             argMax(role_arn, event_time) AS role_arn,
	             toString(argMax(role_kind, event_time)) AS role_kind,
	             argMax(service_name, event_time) AS service_name,
	             argMax(cluster_name, event_time) AS cluster_name
	      FROM ` + table + `
	      WHERE has({accounts:Array(String)}, account_id)
	        AND (has({keys:Array(String)}, workload_key) OR has({keys:Array(String)}, identity_name))
	      GROUP BY source_type, k`
	rows, err := conn.Query(ctx, q, ch.Named("accounts", accounts), ch.Named("keys", keys))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []WorkloadFacts
	for rows.Next() {
		var f WorkloadFacts
		var sourceType string
		if err := rows.Scan(&sourceType, &f.Key, &f.IdentityNames, &f.LastSeen, &f.DisplayName, &f.RoleARN, &f.RoleKind, &f.ServiceName, &f.ClusterName); err != nil {
			return nil, err
		}
		f.SourceType = sourceType
		if f.LastSeen != nil {
			t := f.LastSeen.UTC()
			f.LastSeen = &t
		}
		out = append(out, f)
	}
	return out, rows.Err()
}
