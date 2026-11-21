package identitygraph

// ApplyPermissionSetUsageFilter trims each group's actions to the requested
// usage view. usage is "all", "used" or "unused"; "" is treated as "all".
//
// Summary counts are left unchanged, so they always describe the whole group.
// For "used" and "unused", groups without usage data (SSO, or ClickHouse off)
// and groups with no matching actions are removed.
func ApplyPermissionSetUsageFilter(sets []HumanPermissionSet, usage string) []HumanPermissionSet {
	if usage != "used" && usage != "unused" {
		return sets
	}
	want := usage == "used"
	out := make([]HumanPermissionSet, 0, len(sets))
	for _, s := range sets {
		if !s.UsageAvailable {
			continue
		}
		kept := make([]HumanPermissionAction, 0, len(s.Actions))
		for _, a := range s.Actions {
			if a.Used90d != nil && *a.Used90d == want {
				kept = append(kept, a)
			}
		}
		if len(kept) == 0 {
			continue
		}
		s.Actions = kept
		out = append(out, s)
	}
	return out
}
