package engine

// summaryResources is how many reachable resources a summary keeps.
const summaryResources = 25

// SummarizeResult returns a short copy of a result for ?summary=true: the score,
// service groups, reachable identities and the strongest resources, without the
// full path list (which can run to megabytes for a broad role).
func SummarizeResult(r *BlastRadiusResult) *BlastRadiusResult {
	s := *r
	s.Summary = true
	s.Paths = []BlastRadiusPath{}
	s.ReachableResourcesTotal = len(r.ReachableResources)
	if len(s.ReachableResources) > summaryResources {
		s.ReachableResources = s.ReachableResources[:summaryResources]
	}
	return &s
}
