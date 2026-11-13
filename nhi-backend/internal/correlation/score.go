package correlation

import (
	"math"
	"sort"
	"strings"
)

// ReachableResource is the strongest way an NHI can reach one resource.
// scoreBreadth is how many of the strongest paths add to the overall score.
const scoreBreadth = 5

// ServiceReach summarises what an identity can reach inside one AWS service, so a
// client can start at "S3, KMS, IAM ..." and drill into the resources.
type ServiceReach struct {
	Service      string  `json:"service"` // s3, kms, ..., all-services, other
	Resources    int     `json:"resources"`
	Wildcard     bool    `json:"wildcard"`     // includes a grant on every resource of the service
	Significance string  `json:"significance"` // the highest among its resources
	MaxScore     float64 `json:"max_score"`
	Observed     bool    `json:"observed"` // some access was seen in CloudTrail
}

type ReachableResource struct {
	ARN              string   `json:"arn"`
	Type             string   `json:"type"`
	Score            float64  `json:"score"`
	Path             []string `json:"path"`
	PathARNs         []string `json:"path_arns"` // same order as path; names alone can collide across accounts
	Hops             int      `json:"hops"`
	PathType         string   `json:"path_type"`
	ObservedActivity bool     `json:"observed_activity"`
	Service          string   `json:"service"`
	Significance     string   `json:"significance"`
	Wildcard         bool     `json:"wildcard"` // a grant on every resource of the service
}

// ReachableIdentity is another identity the NHI can become by assuming roles.
type ReachableIdentity struct {
	ARN      string   `json:"arn"`
	Path     []string `json:"path"`
	PathARNs []string `json:"path_arns"`
	Hops     int      `json:"hops"`
	// PrivilegeLevel (0 to 10) is how powerful the identity is; compare it with
	// the source's own level to see whether the hop lands on a stronger role.
	PrivilegeLevel int `json:"privilege_level"`
}

func sigWeight(s string) float64 {
	switch s {
	case "high":
		return 1.0
	case "medium":
		return 0.6
	case "conditional":
		return 0.4
	default:
		return 0.2
	}
}

// isIdentityPath reports whether a path ends on an assumed identity rather than
// on a resource.
func isIdentityPath(p BlastRadiusPath) bool {
	return len(p.Hops) > 0 && p.Hops[len(p.Hops)-1].EdgeType == EdgeCanAssume
}

// pathScore is 0..1: significance x resource sensitivity x evidence strength x hop decay.
// Blast radius is about what is possible, so evidence and hop count only temper the score
// gently: wildcard admin reached through a chain must still rate HIGH.
func pathScore(p BlastRadiusPath) float64 {
	hops := len(p.Hops)
	if hops < 1 {
		hops = 1
	}
	evidence := 0.7 + 0.075*float64(p.EvidenceRank) // rank 4 -> 1.0, rank 1 -> 0.775
	return sigWeight(p.SecuritySignificance) * resourceSensitivity(p.TargetARN) *
		evidence * math.Pow(0.95, float64(hops-1))
}

func riskLevel(score float64) string {
	switch {
	case score >= 8:
		return "CRITICAL"
	case score >= 6:
		return "HIGH"
	case score >= 3:
		return "MEDIUM"
	case score > 0:
		return "LOW"
	default:
		return "NONE"
	}
}

func nameFromARN(arn string) string {
	if arn == AllResourcesARN {
		return "ALL_RESOURCES"
	}
	if strings.HasPrefix(arn, "*:") {
		return "all " + strings.TrimPrefix(arn, "*:") + " resources"
	}
	if i := strings.LastIndex(arn, "/"); i >= 0 && i < len(arn)-1 {
		return arn[i+1:]
	}
	if i := strings.LastIndex(arn, ":"); i >= 0 && i < len(arn)-1 {
		return arn[i+1:]
	}
	return arn
}

func pathARNs(p BlastRadiusPath, sourceARN string) []string {
	arns := []string{sourceARN}
	for _, h := range p.Hops {
		arns = append(arns, h.ToARN)
	}
	return arns
}

func pathNames(p BlastRadiusPath, sourceName string) []string {
	names := []string{sourceName}
	for _, h := range p.Hops {
		names = append(names, nameFromARN(h.ToARN))
	}
	return names
}

// DeriveSummary fills every field computed from Paths: counters, score, risk
// level and the reachable resource/identity lists. It is deterministic, so it
// is also applied to results loaded from the cache.
func DeriveSummary(r *BlastRadiusResult, multiPath bool) {
	r.TotalPaths = len(r.Paths)
	r.TotalResources, r.DirectPaths, r.ChainPaths = 0, 0, 0
	r.CrossAccountPaths, r.ComputePaths, r.SecretsAccessFound, r.ConvergingPathsFound = 0, 0, 0, 0

	targets := map[string]bool{}
	byTarget := map[string]map[string]bool{}
	bestRes := map[string]BlastRadiusPath{}
	observed := map[string]bool{}
	bestID := map[string]BlastRadiusPath{}

	for _, p := range r.Paths {
		switch p.Phase {
		case 1:
			r.DirectPaths++
		case 2:
			r.ChainPaths++
		case 3:
			r.CrossAccountPaths++
		case 4:
			r.ComputePaths++
		}
		if p.PathType == PathSecretsAccess {
			r.SecretsAccessFound++
		}
		if p.TargetARN == "" {
			continue
		}
		targets[p.TargetARN] = true
		if byTarget[p.TargetARN] == nil {
			byTarget[p.TargetARN] = map[string]bool{}
		}
		byTarget[p.TargetARN][p.PathType] = true
		if p.EvidenceRank == EvidenceRankObserved {
			observed[p.TargetARN] = true
		}

		if isIdentityPath(p) {
			if cur, ok := bestID[p.TargetARN]; !ok || len(p.Hops) < len(cur.Hops) {
				bestID[p.TargetARN] = p
			}
		} else if cur, ok := bestRes[p.TargetARN]; !ok || pathScore(p) > pathScore(cur) {
			bestRes[p.TargetARN] = p
		}
	}
	r.TotalResources = len(targets)
	if multiPath {
		for _, types := range byTarget {
			if len(types) > 1 {
				r.ConvergingPathsFound++
			}
		}
	}
	r.SecretsAccess = r.SecretsAccessFound > 0
	for arn := range bestRes {
		if strings.Contains(strings.ToLower(arn), ":secretsmanager:") {
			r.SecretsAccess = true // reachable by permission, even if never observed
		}
	}
	r.ConvergingPaths = r.ConvergingPathsFound > 0

	r.ReachableResources = make([]ReachableResource, 0, len(bestRes))
	scores := make([]float64, 0, len(bestRes))
	byService := map[string]*ServiceReach{}
	for arn, p := range bestRes {
		s := pathScore(p)
		scores = append(scores, s)
		svc := serviceOfTarget(arn)
		if arn == AllResourcesARN {
			svc = "all-services"
		} else if svc == "" {
			svc = "other"
		}
		r.ReachableResources = append(r.ReachableResources, ReachableResource{
			ARN: arn, Type: p.TargetType, Score: round1(s * 10),
			Path: pathNames(p, r.SourceName), PathARNs: pathARNs(p, r.SourceARN), Hops: len(p.Hops),
			PathType: p.PathType, ObservedActivity: observed[arn],
			Service: svc, Significance: p.SecuritySignificance, Wildcard: isAllResourcesTarget(arn),
		})
		sr := byService[svc]
		if sr == nil {
			sr = &ServiceReach{Service: svc, Significance: "low"}
			byService[svc] = sr
		}
		sr.Resources++
		sr.Wildcard = sr.Wildcard || isAllResourcesTarget(arn)
		sr.Observed = sr.Observed || observed[arn]
		if significanceRank(p.SecuritySignificance) > significanceRank(sr.Significance) {
			sr.Significance = p.SecuritySignificance
		}
		if v := round1(s * 10); v > sr.MaxScore {
			sr.MaxScore = v
		}
	}
	r.ReachByService = make([]ServiceReach, 0, len(byService))
	for _, sr := range byService {
		r.ReachByService = append(r.ReachByService, *sr)
	}
	sort.Slice(r.ReachByService, func(i, j int) bool {
		a, b := r.ReachByService[i], r.ReachByService[j]
		if significanceRank(a.Significance) != significanceRank(b.Significance) {
			return significanceRank(a.Significance) > significanceRank(b.Significance)
		}
		if a.MaxScore != b.MaxScore {
			return a.MaxScore > b.MaxScore
		}
		return a.Service < b.Service
	})
	sort.Float64s(scores)
	maxPath, top := 0.0, 0.0
	for i := len(scores) - 1; i >= 0 && len(scores)-1-i < scoreBreadth; i-- {
		if i == len(scores)-1 {
			maxPath = scores[i]
		}
		top += scores[i]
	}
	sort.Slice(r.ReachableResources, func(i, j int) bool {
		if r.ReachableResources[i].Score != r.ReachableResources[j].Score {
			return r.ReachableResources[i].Score > r.ReachableResources[j].Score
		}
		return r.ReachableResources[i].ARN < r.ReachableResources[j].ARN
	})

	r.ReachableIdentities = make([]ReachableIdentity, 0, len(bestID))
	for arn, p := range bestID {
		r.ReachableIdentities = append(r.ReachableIdentities, ReachableIdentity{
			ARN: arn, Path: pathNames(p, r.SourceName), PathARNs: pathARNs(p, r.SourceARN), Hops: len(p.Hops),
		})
	}
	sort.Slice(r.ReachableIdentities, func(i, j int) bool {
		if r.ReachableIdentities[i].Hops != r.ReachableIdentities[j].Hops {
			return r.ReachableIdentities[i].Hops < r.ReachableIdentities[j].Hops
		}
		return r.ReachableIdentities[i].ARN < r.ReachableIdentities[j].ARN
	})

	// One strong path dominates; the next strongest ones accumulate with
	// diminishing returns. Only the top scoreBreadth paths count, so hundreds of
	// weak findings (for example "Describe" on every service) cannot add up to a
	// high score.
	score := 10 * math.Max(maxPath, 1-math.Exp(-top/3))
	r.BlastRadiusScore = round1(math.Min(score, 10))
	r.RiskLevel = riskLevel(r.BlastRadiusScore)
}

func round1(f float64) float64 { return math.Round(f*10) / 10 }
