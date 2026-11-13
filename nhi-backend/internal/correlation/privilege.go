package correlation

import (
	"context"
	"log"
	"time"
)

// staleAfter is how old the collector's last sighting of an identity may be
// before a result is flagged as possibly out of date.
const staleAfter = 7 * 24 * time.Hour

// DataFreshness says how current the data behind a result is.
type DataFreshness struct {
	// CredentialLastSeenAt is when the collector last saw this identity.
	CredentialLastSeenAt *time.Time `json:"credential_last_seen_at,omitempty"`
	// PermissionsUpdatedAt is when its permissions were last recalculated.
	PermissionsUpdatedAt *time.Time `json:"permissions_updated_at,omitempty"`
	// LastObservedEventAt is the newest CloudTrail event used as evidence.
	LastObservedEventAt *time.Time `json:"last_observed_event_at,omitempty"`
	// Stale is true when the identity has not been seen for over 7 days, so the
	// result may describe something that has since changed.
	Stale bool `json:"stale"`
}

// PrivilegeLevel rates what an identity can do on a scale of 0 to 10 from its
// grants, so that "this hop lands on a more powerful role" can be seen:
//
//	10  administrator: every action on every resource
//	 9  nearly everything (all actions except some), or a privilege-escalation
//	    primitive on all resources
//	 8  a privilege-escalation primitive on specific resources
//	 7  write or broad access on all resources of a sensitive service
//	    (S3, KMS, Secrets Manager, IAM, RDS, DynamoDB, ...)
//	 6  write or broad access on all resources of another service
//	 5  write or delete on specific resources
//	 4  read on all resources of a service
//	 2  read on specific resources
//	 1  anything else   0  no grants
//
// It is a heuristic for comparing identities, not a security verdict.
func PrivilegeLevel(grants []ResourceGrant) int {
	level := 0
	raise := func(n int) {
		if n > level {
			level = n
		}
	}
	for _, g := range grants {
		wide := isAllResourcesTarget(g.ResourceARN)
		if g.ResourceARN == AllResourcesARN && containsAction(g.Actions, "*") {
			if len(g.Except) == 0 {
				return 10
			}
			raise(9)
			continue
		}
		if len(g.EscalationActions()) > 0 {
			if wide {
				raise(9)
			} else {
				raise(8)
			}
			continue
		}
		switch g.Significance() {
		case "high":
			switch {
			case wide && sensitiveService(serviceOfTarget(g.ResourceARN)):
				raise(7)
			case wide:
				raise(6)
			default:
				raise(5)
			}
		case "medium", "conditional":
			if wide {
				raise(4)
			} else {
				raise(2)
			}
		default:
			raise(1)
		}
	}
	return level
}

func sensitiveService(svc string) bool {
	switch svc {
	case "s3", "kms", "secretsmanager", "iam", "sts", "ssm", "rds", "dynamodb", "ecr":
		return true
	}
	return false
}

// attachContext adds what is derived from the identities themselves to a result:
// privilege levels (of the source and of every reachable identity), a flag on
// every hop to a more privileged role, and data freshness. It is used for both
// fresh and cached results, so the two answer the same way.
func (e *Engine) attachContext(ctx context.Context, ds *Scope, r *BlastRadiusResult, observed []ObservedEvent) {
	level := func(arn string) int {
		perms, err := e.repo.LoadEffectivePermissions(ctx, ds, arn)
		if err != nil {
			log.Printf("WARNING: privilege level for %s: %v", arn, err)
			return 0
		}
		return PrivilegeLevel(GroupByResource(ApplyDenies(perms)))
	}

	r.PrivilegeLevel = level(r.SourceARN)
	levels := map[string]int{}
	for i := range r.ReachableIdentities {
		id := &r.ReachableIdentities[i]
		if _, ok := levels[id.ARN]; !ok {
			levels[id.ARN] = level(id.ARN)
		}
		id.PrivilegeLevel = levels[id.ARN]
	}
	for i := range r.Paths {
		p := &r.Paths[i]
		if !isIdentityPath(*p) {
			continue
		}
		if lv, ok := levels[p.TargetARN]; ok && lv > r.PrivilegeLevel {
			p.Limitations = appendUnique(p.Limitations, "target_has_higher_privilege")
		}
	}

	fresh, err := e.repo.LoadDataFreshness(ctx, ds, r.SourceARN)
	if err != nil {
		log.Printf("WARNING: data freshness for %s: %v", r.SourceARN, err)
	}
	if len(observed) > 0 {
		t := observed[0].EventTime
		for _, ev := range observed {
			if ev.EventTime.After(t) {
				t = ev.EventTime
			}
		}
		fresh.LastObservedEventAt = &t
	}
	if fresh.CredentialLastSeenAt != nil && time.Since(*fresh.CredentialLastSeenAt) > staleAfter {
		fresh.Stale = true
	}
	r.DataAsOf = fresh
}
