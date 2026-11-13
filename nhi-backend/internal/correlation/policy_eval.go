package correlation

import (
	"sort"
	"strconv"
	"strings"
)

// AllResourcesARN is the pseudo-target for a grant on every resource of every
// service (Action "*" on Resource "*"). A grant on Resource "*" limited to one
// service targets "*:<service>", for example "*:s3" ("all S3 resources"), because
// wildcard grants cannot be expanded without a full resource inventory.
const AllResourcesARN = "*"

// globMatch matches s against a pattern with IAM-style wildcards ('*' any run,
// '?' one character). Matching is case-insensitive, which is how IAM treats actions.
func globMatch(pattern, s string) bool {
	p, t := strings.ToLower(pattern), strings.ToLower(s)
	pi, ti := 0, 0
	star, mark := -1, 0
	for ti < len(t) {
		switch {
		case pi < len(p) && (p[pi] == '?' || p[pi] == t[ti]):
			pi++
			ti++
		case pi < len(p) && p[pi] == '*':
			star, mark = pi, ti
			pi++
		case star >= 0:
			pi = star + 1
			mark++
			ti = mark
		default:
			return false
		}
	}
	for pi < len(p) && p[pi] == '*' {
		pi++
	}
	return pi == len(p)
}

// isWildcardResource reports whether a grant applies to every resource.
func isWildcardResource(arn string) bool {
	return arn == "*" || arn == "arn:aws:*" || arn == "arn:aws:*:*:*:*"
}

// WildcardTarget is the target for a Resource "*" grant of the given service.
func WildcardTarget(service string) string {
	if service == "" || service == "*" {
		return AllResourcesARN
	}
	return "*:" + service
}

// isAllResourcesTarget reports whether a target stands for "every resource"
// (of everything, or of one service).
func isAllResourcesTarget(arn string) bool {
	return arn == AllResourcesARN || strings.HasPrefix(arn, "*:")
}

// serviceOfTarget returns the AWS service a target belongs to: "s3" for "*:s3"
// and for "arn:aws:s3:::bucket", or "" when it is not known.
func serviceOfTarget(arn string) string {
	if strings.HasPrefix(arn, "*:") {
		return strings.TrimPrefix(arn, "*:")
	}
	if strings.HasPrefix(arn, "arn:") {
		parts := strings.SplitN(arn, ":", 4)
		if len(parts) >= 3 {
			return strings.ToLower(parts[2])
		}
	}
	return ""
}

func isDeny(p ResourcePermission) bool { return strings.EqualFold(p.Effect, "Deny") }

func appendUnique(list []string, vals ...string) []string {
	for _, v := range vals {
		if !containsString(list, v) {
			list = append(list, v)
		}
	}
	return list
}

// denyCovers reports whether a Deny element covers the given Allow action.
func denyCovers(d ResourcePermission, allowAction string) bool {
	if !globMatch(d.Action, allowAction) {
		return false
	}
	for _, ex := range d.ExceptActions {
		if globMatch(ex, allowAction) {
			return false
		}
	}
	return true
}

// ApplyDenies removes Allow statements shadowed by an explicit Deny.
//
// Explicit Deny always wins in IAM evaluation. A Deny shadows an Allow when its
// action pattern covers the Allow's action and its resource pattern covers the
// Allow's resource. An unconditional Deny removes the Allow. A Deny with a
// Condition cannot be evaluated here, so it does not remove anything; the Allow
// it might shadow is flagged may_be_denied_by_conditional_deny instead. Deny
// statements are never returned. Not modelled (surfaced as limitations on the
// path): permission boundaries, SCPs/RCPs and session policies.
func ApplyDenies(perms []ResourcePermission) []ResourcePermission {
	var denies []ResourcePermission
	for _, p := range perms {
		if isDeny(p) {
			denies = append(denies, p)
		}
	}
	out := make([]ResourcePermission, 0, len(perms))
	for _, p := range perms {
		if isDeny(p) {
			continue
		}
		hard, soft := false, false
		for _, d := range denies {
			if !denyCovers(d, p.Action) {
				continue
			}
			if !(isWildcardResource(d.ResourceARN) || d.ResourceARN == "" ||
				globMatch(d.ResourceARN, p.ResourceARN)) {
				continue
			}
			if d.Conditional {
				soft = true
				continue
			}
			hard = true
			break
		}
		if hard {
			continue
		}
		if soft {
			p.Flags = appendUnique(append([]string{}, p.Flags...), "may_be_denied_by_conditional_deny")
		}
		out = append(out, p)
	}
	return out
}

// ResourceGrant is every allowed action on one resource, collapsed.
type ResourceGrant struct {
	ResourceARN string
	Actions     []string
	// Except lists actions excluded from a "*" action (NotAction); empty otherwise.
	Except []string
	// Flags are limitation tokens that apply to the grant as a whole.
	Flags []string
}

// GroupByResource collapses permissions to one grant per resource. A grant on
// Resource "*" is grouped per service (target "*:s3"), or under AllResourcesARN
// when the action is "*"; rows with no resource are dropped.
func GroupByResource(perms []ResourcePermission) []ResourceGrant {
	type acc struct {
		actions    map[string]bool
		uncond     map[string]bool
		cond       map[string]bool
		exceptSets [][]string
		plainStar  bool
		flags      []string
	}
	byRes := map[string]*acc{}
	for _, p := range perms {
		res := p.ResourceARN
		if res == "" {
			continue
		}
		var extraFlag string
		if isWildcardResource(res) {
			res = WildcardTarget(serviceOfAction(p.Action))
		} else if strings.ContainsAny(res, "*?") {
			extraFlag = "resource_pattern"
		}
		a := byRes[res]
		if a == nil {
			a = &acc{actions: map[string]bool{}, uncond: map[string]bool{}, cond: map[string]bool{}}
			byRes[res] = a
		}
		a.actions[p.Action] = true
		if p.Conditional {
			if !a.uncond[p.Action] {
				a.cond[p.Action] = true
			}
		} else {
			a.uncond[p.Action] = true
			delete(a.cond, p.Action)
		}
		if p.Action == "*" {
			if len(p.ExceptActions) > 0 {
				a.exceptSets = append(a.exceptSets, p.ExceptActions)
			} else {
				a.plainStar = true
			}
		}
		a.flags = appendUnique(a.flags, p.Flags...)
		if extraFlag != "" {
			a.flags = appendUnique(a.flags, extraFlag)
		}
	}

	out := make([]ResourceGrant, 0, len(byRes))
	for res, a := range byRes {
		actions := make([]string, 0, len(a.actions))
		for act := range a.actions {
			actions = append(actions, act)
		}
		sort.Strings(actions)
		g := ResourceGrant{ResourceARN: res, Actions: actions, Flags: a.flags}
		if len(a.cond) > 0 {
			g.Flags = appendUnique(g.Flags, "grant_has_conditions")
		}
		if !a.plainStar && len(a.exceptSets) > 0 {
			g.Except = a.exceptSets[0]
			for _, s := range a.exceptSets[1:] {
				var keep []string
				for _, x := range g.Except {
					if containsString(s, x) {
						keep = append(keep, x)
					}
				}
				g.Except = keep
			}
			sort.Strings(g.Except)
			g.Flags = appendUnique(g.Flags, "not_action_statement")
		}
		sort.Strings(g.Flags)
		out = append(out, g)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ResourceARN < out[j].ResourceARN })
	return out
}

// escalationPatterns are IAM actions that let a principal raise its own or
// another principal's privileges.
var escalationPatterns = []string{
	"iam:passrole",
	"iam:createpolicyversion",
	"iam:setdefaultpolicyversion",
	"iam:attachuserpolicy",
	"iam:attachrolepolicy",
	"iam:attachgrouppolicy",
	"iam:putuserpolicy",
	"iam:putrolepolicy",
	"iam:putgrouppolicy",
	"iam:updateassumerolepolicy",
	"iam:createaccesskey",
	"iam:createloginprofile",
	"iam:updateloginprofile",
	"iam:addusertogroup",
}

// escalationActionsExcept returns the actions that grant a privilege-escalation
// primitive, including wildcard grants such as "iam:*" or "*". A primitive that
// the except list (NotAction) removes does not count.
func escalationActionsExcept(actions, except []string) []string {
	var out []string
	for _, a := range actions {
		for _, e := range escalationPatterns {
			if !globMatch(a, e) {
				continue
			}
			excluded := false
			for _, ex := range except {
				if globMatch(ex, e) {
					excluded = true
					break
				}
			}
			if !excluded {
				out = append(out, a)
				break
			}
		}
	}
	return out
}

func escalationActions(actions []string) []string { return escalationActionsExcept(actions, nil) }

// EscalationActions are the escalation primitives this grant provides.
func (g ResourceGrant) EscalationActions() []string {
	return escalationActionsExcept(g.Actions, g.Except)
}

// Significance rates the grant by what it allows on the resource.
func (g ResourceGrant) Significance() string {
	return grantSignificanceEx(g.Actions, g.Except, g.ResourceARN)
}

func containsAction(actions []string, target string) bool {
	for _, a := range actions {
		if globMatch(a, target) {
			return true
		}
	}
	return false
}

// resourceSensitivity is a 0..1 multiplier from what the resource is.
func resourceSensitivity(arn string) float64 {
	if arn == AllResourcesARN {
		return 1.0
	}
	switch serviceOfTarget(arn) {
	case "secretsmanager", "kms":
		return 1.0
	case "iam", "sts":
		return 0.9
	case "ssm", "rds", "dynamodb":
		return 0.8
	case "s3", "ecr":
		return 0.6
	default:
		return 0.4
	}
}

// grantSignificance rates a grant by what it allows on the resource.
func grantSignificance(actions []string, resourceARN string) string {
	return grantSignificanceEx(actions, nil, resourceARN)
}

func grantSignificanceEx(actions, except []string, resourceARN string) string {
	if resourceARN == AllResourcesARN && containsAction(actions, "*") {
		return "high" // effectively administrator
	}
	if len(escalationActionsExcept(actions, except)) > 0 {
		return "high"
	}
	best := "low"
	for _, a := range actions {
		// Broad wildcards (s3:*, ec2:Delete*) include write/delete; only pure read prefixes are safe.
		if strings.Contains(a, "*") && !readOnlyWildcard(a) {
			return "high"
		}
		if s := securitySignificance(a, resourceARN); significanceRank(s) > significanceRank(best) {
			best = s
		}
	}
	return best
}

// readOnlyWildcard reports whether a wildcard action only spans read-style verbs, e.g. s3:Get*.
func readOnlyWildcard(a string) bool {
	_, verb, ok := strings.Cut(strings.ToLower(a), ":")
	if !ok {
		return false
	}
	for _, p := range []string{"get", "list", "describe", "head", "batchget"} {
		if strings.HasPrefix(verb, p) {
			return true
		}
	}
	return false
}

func significanceRank(s string) int {
	switch s {
	case "high":
		return 3
	case "medium":
		return 2
	case "conditional":
		return 1
	default:
		return 0
	}
}

// summariseActions renders a short "a, b, c (+N more)" string.
func summariseActions(actions []string) string {
	const max = 3
	if len(actions) <= max {
		return strings.Join(actions, ", ")
	}
	return strings.Join(actions[:max], ", ") + " (+" + strconv.Itoa(len(actions)-max) + " more)"
}
