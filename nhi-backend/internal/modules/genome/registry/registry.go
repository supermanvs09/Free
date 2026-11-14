// Package registry links the behaviour pipeline's identities to discovery.
//
// The pipeline (genome_intell) raises alerts under its own key
// (source_type, identity_name). Usually that key is one this backend derives
// from the discovery row, but not always: some identities (EKS node
// instances, for one) are keyed by an id of the pipeline's own, which no
// discovery field carries. The pipeline records every identity it monitors
// in nhi_genome_identities, unique on (nhi_type, identity_name), with the
// identity's AWS ARNs and instance id. Those are the bridge: each registry
// row is matched to the discovery identity with the same ARN (or instance,
// or discovery id) and its key becomes an alias of that identity, so its
// alerts, baselines and timeline show on the identity's genome page.
package registry

import (
	"context"
	"errors"
	"strings"

	"github.com/lib/pq"

	"nhi-backend-api/internal/platform/scope"
)

// Row is one nhi_genome_identities entry.
type Row struct {
	NHIType, IdentityName, IdentityType   string
	ARN, InstanceARN, RoleARN, ProfileARN string
	InstanceID, WorkloadKey               string
}

// Load reads the active registry rows of the scope's accounts. A tenant
// without the table (older schema) has no aliases, not an error.
func Load(ctx context.Context, s *scope.DataScope) ([]Row, error) {
	q := `SELECT COALESCE(nhi_type,''), COALESCE(identity_name,''), COALESCE(identity_type,''),
		COALESCE(arn,''), COALESCE(instance_arn,''), COALESCE(role_arn,''), COALESCE(instance_profile_arn,''),
		COALESCE(instance_id,''), COALESCE(workload_key,'')
		FROM ` + s.Table("nhi_genome_identities") + `
		WHERE deleted_at IS NULL AND COALESCE(identity_name,'') <> ''
		  AND (account_id IS NULL OR account_id = '' OR account_id = ANY($1::text[]))`
	rows, err := s.DB.QueryContext(ctx, q, pq.Array(s.AccountIDs))
	if err != nil {
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && (pqErr.Code == "42P01" || pqErr.Code == "42703") {
			return nil, nil // table or column not there yet
		}
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var r Row
		if err := rows.Scan(&r.NHIType, &r.IdentityName, &r.IdentityType, &r.ARN, &r.InstanceARN, &r.RoleARN, &r.ProfileARN, &r.InstanceID, &r.WorkloadKey); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// Candidate describes one fleet identity to the matcher.
type Candidate struct {
	SourceType  string
	Keys        []string // identity key and workload key
	DiscoveryID string
	ResourceARN string
	RoleARN     string
	InstanceID  string
}

// Alias is a registry key to add to fleet identity Index.
type Alias struct {
	Index        int
	SourceType   string
	IdentityName string
}

// Match pairs registry rows with fleet identities. Rules, strongest first;
// a row stops at the first rule that matches anything:
//
//  1. the registry key is the identity's discovery id
//  2. the registry ARN or instance ARN is the identity's discovery ARN
//  3. the registry instance id is the identity's instance (or ends its ARN)
//  4. the registry workload key is one of the identity's keys
//  5. same family and the registry role / instance-profile ARN is the
//     identity's role or ARN - only when exactly one identity matches, since
//     a role can be shared by many workloads
//
// Rows whose key already is a fleet key need no alias and are skipped.
func Match(rows []Row, fleet []Candidate) []Alias {
	type key struct{ st, name string }
	own := map[key]bool{}
	byDiscovery := map[string][]int{}
	byARN := map[string][]int{}
	byInstance := map[string][]int{}
	byKey := map[string][]int{}
	byRole := map[string][]int{}
	for i, c := range fleet {
		st := strings.ToUpper(c.SourceType)
		for _, k := range c.Keys {
			own[key{st, k}] = true
			byKey[k] = append(byKey[k], i)
		}
		add := func(m map[string][]int, v string) {
			if v = strings.TrimSpace(v); v != "" {
				m[v] = append(m[v], i)
			}
		}
		add(byDiscovery, c.DiscoveryID)
		add(byARN, c.ResourceARN)
		add(byInstance, c.InstanceID)
		if c.InstanceID == "" && strings.Contains(c.ResourceARN, ":instance/") {
			add(byInstance, c.ResourceARN[strings.LastIndex(c.ResourceARN, "/")+1:])
		}
		add(byRole, c.RoleARN)
		add(byRole, c.ResourceARN)
	}

	var out []Alias
	for _, r := range rows {
		st := sourceType(r)
		if st == "" || own[key{st, r.IdentityName}] {
			continue
		}
		sameFamily := func(found []int) []int {
			var keep []int
			for _, i := range found {
				if strings.EqualFold(fleet[i].SourceType, st) {
					keep = append(keep, i)
				}
			}
			return keep
		}
		var found []int
		switch {
		case len(byDiscovery[r.IdentityName]) > 0:
			found = byDiscovery[r.IdentityName]
		case len(byARN[r.ARN]) > 0 || len(byARN[r.InstanceARN]) > 0:
			found = append(append(found, byARN[r.ARN]...), byARN[r.InstanceARN]...)
		case r.InstanceID != "" && len(byInstance[r.InstanceID]) > 0:
			found = byInstance[r.InstanceID]
		case r.WorkloadKey != "" && len(byKey[r.WorkloadKey]) > 0:
			found = byKey[r.WorkloadKey]
		default:
			for _, arn := range []string{r.RoleARN, r.ProfileARN, r.ARN} {
				if m := sameFamily(byRole[strings.TrimSpace(arn)]); len(m) == 1 {
					found = m
					break
				}
			}
		}
		seen := map[int]bool{}
		for _, i := range found {
			if !seen[i] {
				seen[i] = true
				out = append(out, Alias{Index: i, SourceType: st, IdentityName: r.IdentityName})
			}
		}
	}
	return out
}

// sourceType is the alert source_type of a registry row: nhi_type holds it
// (EC2, LAMBDA, ...); an older row with a type name (ec2_instance) maps by
// its prefix.
// ponytail: prefix map covers the families seen so far; extend from
// identitylist.intelTypes if the pipeline adds lower-case types.
func sourceType(r Row) string {
	t := strings.TrimSpace(r.NHIType)
	if t == "" {
		t = r.IdentityType
	}
	if t != "" && t == strings.ToUpper(t) {
		return t
	}
	low := strings.ToLower(t)
	for prefix, st := range map[string]string{
		"ec2": "EC2", "lambda": "LAMBDA", "ecs": "ECS", "fargate": "ECS", "glue": "GLUE",
		"step_function": "STEP_FUNCTIONS", "stepfunctions": "STEP_FUNCTIONS", "states": "STEP_FUNCTIONS",
		"app_runner": "APP_RUNNER", "apprunner": "APP_RUNNER", "codebuild": "CODEBUILD", "sagemaker": "SAGEMAKER",
	} {
		if strings.HasPrefix(low, prefix) {
			return st
		}
	}
	return strings.ToUpper(t)
}
