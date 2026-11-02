// Package scoring computes the score impact of a plan from the engine's
// ispm_identity_checks (points lost per failing check) and ispm_identity_posture.
// Nothing is stored statically per rule.
package scoring

import (
	"context"
	"math"

	"nhi-backend-api/internal/remediation/store"
)

type Impact struct {
	Current   *float64 // score of the primary identity today
	Gain      *float64 // points the primary identity gains
	Projected *float64
	FleetGain *float64 // points the fleet mean gains
}

func round1(f float64) *float64 { v := math.Round(f*10) / 10; return &v }
func round2(f float64) *float64 { v := math.Round(f*100) / 100; return &v }

// Compute returns the impact of fixing the findings. Identities without a
// failing check (scan not run yet) give a zero Impact.
func Compute(ctx context.Context, st *store.Store, findingIDs []string, primaryIdentity string) (Impact, error) {
	checks, err := st.FailedChecks(ctx, findingIDs)
	if err != nil || len(checks) == 0 {
		return Impact{}, err
	}
	loss := map[string]float64{}
	var ids []string
	for _, c := range checks {
		if _, ok := loss[c.IdentityID]; !ok {
			ids = append(ids, c.IdentityID)
		}
		loss[c.IdentityID] += float64(c.PointsLost)
	}
	scores, scored, err := st.PostureScores(ctx, ids)
	if err != nil || len(scores) == 0 {
		return Impact{}, err
	}
	gainOf := func(id string) float64 { return math.Min(loss[id], 100-scores[id]) }
	if _, ok := scores[primaryIdentity]; !ok {
		primaryIdentity = ids[0]
	}
	cur, gain := scores[primaryIdentity], gainOf(primaryIdentity)
	imp := Impact{Current: round1(cur), Gain: round1(gain), Projected: round1(math.Min(100, cur+gain))}
	if scored > 0 {
		total := 0.0
		for id := range scores {
			total += gainOf(id)
		}
		imp.FleetGain = round2(total / float64(scored))
	}
	return imp, nil
}
