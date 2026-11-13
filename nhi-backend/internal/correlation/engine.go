package correlation

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
	"time"
)

// Engine computes the blast radius of a non-human identity: everything it can
// reach directly, through role chains, across accounts and through workloads.
type Engine struct {
	repo  Repo
	cfg   TraversalConfig
	rules ruleCache

	graphMu sync.Mutex
	graphs  map[string]*graphEntry

	readOnly bool // compute and return only; write nothing anywhere
}

// SetReadOnly makes the engine compute without writing: no derived-edge rebuild,
// no result cache, no Neo4j graph. Use it to check results on a database you
// must not change.
func (e *Engine) SetReadOnly(v bool) { e.readOnly = v }

type graphEntry struct {
	g       *AssumeGraph
	expires time.Time
}

const graphCacheTTL = 5 * time.Minute

// assumeGraph returns the role-assumption graph for the scope, cached for a few
// minutes because building it reads every role's trust policy. With refresh the
// cache is bypassed.
func (e *Engine) assumeGraph(ctx context.Context, ds *Scope, refresh bool) *AssumeGraph {
	key := ds.Schema + "|" + strings.Join(ds.AccountIDs, ",") + "|" + strings.Join(ds.Regions, ",")
	e.graphMu.Lock()
	defer e.graphMu.Unlock()
	if !refresh {
		if ent := e.graphs[key]; ent != nil && time.Now().Before(ent.expires) {
			return ent.g
		}
	}
	rows, err := e.repo.LoadRoleTrust(ctx, ds)
	if err != nil {
		log.Printf("WARNING: load role trust: %v", err)
		return emptyAssumeGraph() // not cached, so the next request retries
	}
	perms, err := e.repo.LoadAssumePermissions(ctx, ds)
	if err != nil {
		log.Printf("WARNING: load assume permissions: %v", err)
		return emptyAssumeGraph()
	}
	g := BuildAssumeGraph(rows, perms)
	if obs, err := e.repo.LoadAssumeObservations(ctx, ds); err != nil {
		log.Printf("WARNING: assume observations: %v", err) // evidence is optional; keep the policy-based graph
	} else {
		g.ApplyObservations(obs)
	}
	if e.graphs == nil {
		e.graphs = map[string]*graphEntry{}
	}
	e.graphs[key] = &graphEntry{g: g, expires: time.Now().Add(graphCacheTTL)}
	return g
}

// WhoCanAssume answers the inward question: which principals can assume this
// role, and which roles can reach it through chains of up to depth hops.
func (e *Engine) WhoCanAssume(ctx context.Context, ds *Scope, roleARN string, depth int) (*InboundResult, bool) {
	return e.assumeGraph(ctx, ds, false).Inbound(roleARN, depth)
}

func NewEngine(repo Repo) *Engine {
	return &Engine{
		repo: repo,
		cfg:  DefaultTraversalConfig(),
	}
}

// ReverseAccess computes which credentials can access a given resource. Grants
// on Resource "*" are included and flagged as wildcard grants.
func (e *Engine) ReverseAccess(ctx context.Context, ds *Scope, resourceARN string) ([]BlastRadiusPath, error) {
	rows, err := e.repo.LoadReverseAccess(ctx, ds, resourceARN)
	if err != nil {
		return nil, fmt.Errorf("load reverse access: %w", err)
	}

	rb := e.ruleBook(ctx, ds)
	paths := make([]BlastRadiusPath, 0, len(rows))
	for _, row := range rows {
		name := row.SourceName
		if name == "" {
			name = nameFromARN(row.SourceARN)
		}
		rank := EvidenceRankConfigured
		evidence := EvidenceConfigured
		if row.EvidenceType == EvidenceEffective {
			rank, evidence = EvidenceRankEffective, EvidenceEffective
		}
		extra := []string{"does_not_prove_access_happened"}
		if isAllResourcesTarget(row.TargetARN) {
			extra = append(extra, "wildcard_resource_grant")
		}
		paths = append(paths, BlastRadiusPath{
			SourceARN:  row.SourceARN,
			TargetARN:  resourceARN,
			TargetType: resourceType(resourceARN),
			PathType:   PathDirectAccess,
			PathDescription: fmt.Sprintf("%s can %s on %s", name,
				summariseActions(row.Actions), shortARN(resourceARN)),
			Hops: []PathHop{{
				FromARN: row.SourceARN, ToARN: resourceARN, EdgeType: EdgeCanAccess,
				Evidence: evidence, Table: "ispm_access_edges",
			}},
			EvidenceRank:         rank,
			Confidence:           confidenceFromRank(rank),
			SecuritySignificance: grantSignificance(row.Actions, resourceARN),
			Limitations:          rb.Limitations(PathDirectAccess, extra...),
			Phase:                1,
			IsReverseAccess:      true,
		})
	}
	return paths, nil
}

// LoadCorrelationDefinitions loads correlation rules from PG.
func (e *Engine) LoadCorrelationDefinitions(ctx context.Context, ds *Scope, category string) ([]CorrelationDefinition, error) {
	return e.repo.LoadCorrelationDefinitions(ctx, ds, category)
}

// LoadCompositionRules loads composition rules from PG.
func (e *Engine) LoadCompositionRules(ctx context.Context, ds *Scope) ([]CompositionRule, error) {
	return e.repo.LoadCompositionRules(ctx, ds)
}

// LoadPathTypes loads path type definitions from PG.
func (e *Engine) LoadPathTypes(ctx context.Context, ds *Scope) ([]PathType, error) {
	return e.repo.LoadPathTypes(ctx, ds)
}

// cacheNotBefore is the oldest stored result the engine will still serve. The
// cache table has no version column, so results stored before this moment were
// computed by older traversal logic and are treated as a miss. Move it forward
// whenever a change alters what a computation returns; otherwise an upgrade
// keeps serving the previous version's answers for up to 24 hours.
var cacheNotBefore = time.Date(2026, 11, 13, 16, 30, 0, 0, time.UTC)

// ComputeBlastRadius returns the cached blast radius if fresh, else computes it.
func (e *Engine) ComputeBlastRadius(ctx context.Context, ds *Scope, credentialARN string) (*BlastRadiusResult, error) {
	return e.ComputeBlastRadiusOpts(ctx, ds, credentialARN, false)
}

// ComputeBlastRadiusOpts runs the traversal for a credential ARN. With refresh
// set the cache is bypassed and the result recomputed.
func (e *Engine) ComputeBlastRadiusOpts(ctx context.Context, ds *Scope, credentialARN string, refresh bool) (*BlastRadiusResult, error) {
	rb := e.ruleBook(ctx, ds)

	if !refresh {
		// A stored answer is only trusted if it was computed by the current logic.
		if cached, err := e.repo.LoadBlastRadius(ctx, ds, credentialARN); err == nil && cached != nil &&
			!cached.ComputedAt.Before(cacheNotBefore) {
			DeriveSummary(cached, rb.MultiPathEnabled())
			e.attachContext(ctx, ds, cached, nil)
			cached.FromCache = true
			return cached, nil
		}
	}

	cred, err := e.repo.LoadCredentialByARN(ctx, ds, credentialARN)
	if err != nil {
		return nil, fmt.Errorf("load credential: %w", err)
	}

	result := &BlastRadiusResult{
		SourceARN:  cred.ARN,
		SourceName: cred.Name,
		SourceType: cred.CredentialType,
		ComputedAt: time.Now(),
		Paths:      make([]BlastRadiusPath, 0),
	}

	// ispm_access_edges belongs to the ISPM worker in this backend: the engine
	// only reads it, and takes per-action grants from effective_permissions.

	// One ClickHouse query serves phases 3, 4 and evidence validation.
	observed, err := e.repo.LoadObservedActivity(ctx, ds, cred.ARN, 500)
	if err != nil {
		log.Printf("WARNING: observed activity for %s: %v", cred.ARN, err)
	}
	observed = dropFailedCalls(observed)

	t := &traversal{e: e, ds: ds, cred: cred, rb: rb, result: result, observed: observed,
		graph: e.assumeGraph(ctx, ds, refresh)}
	if rb.PhaseEnabled(1) {
		t.phase1DirectAccess(ctx)
	}
	if rb.PhaseEnabled(2) {
		t.phase2RoleChains(ctx)
	}
	if rb.PhaseEnabled(3) {
		t.phase3CrossAccount(ctx)
	}
	if rb.PhaseEnabled(4) {
		t.phase4ComputeMediated(ctx)
	}
	t.validateEvidence()

	result.Paths = e.dedupPaths(result.Paths)
	sortPaths(result.Paths)
	DeriveSummary(result, rb.MultiPathEnabled())
	e.attachContext(ctx, ds, result, observed)

	if e.readOnly {
		return result, nil
	}

	// Persistence is best-effort: the result is already computed, so a cache or
	// graph failure is logged rather than failing the request.
	if brID, err := e.repo.SaveBlastRadius(ctx, ds, result); err != nil {
		log.Printf("WARNING: save blast radius for %s: %v", cred.ARN, err)
	} else if err := e.repo.SaveBlastRadiusPaths(ctx, ds, brID, result.Paths); err != nil {
		log.Printf("WARNING: save blast radius paths for %s: %v", cred.ARN, err)
	}

	return result, nil
}

// traversal holds the state of one blast-radius computation.
type traversal struct {
	e        *Engine
	ds       *Scope
	cred     *Credential
	rb       *RuleBook
	result   *BlastRadiusResult
	observed []ObservedEvent
	graph    *AssumeGraph
}

// add appends a path unless its type is disabled or the path cap is reached,
// merging the path type's limitations from the rule tables.
func (t *traversal) add(p BlastRadiusPath) {
	if !t.rb.PathActive(p.PathType) || len(t.result.Paths) >= t.e.cfg.MaxPaths {
		return
	}
	p.SourceARN = t.cred.ARN
	p.Limitations = t.rb.Limitations(p.PathType, p.Limitations...)
	if p.Confidence == "" {
		p.Confidence = confidenceFromRank(p.EvidenceRank)
	}
	t.result.Paths = append(t.result.Paths, p)
}

func (t *traversal) boundaryLimitations(base ...string) []string {
	lim := append([]string{}, base...)
	if t.cred.PermissionBoundary != nil && *t.cred.PermissionBoundary != "" {
		lim = append(lim, "permission_boundary_not_evaluated")
	}
	return lim
}

// grantPaths turns one resource grant into paths. hops are the hops already
// taken to reach the principal that holds the grant; rank is the weakest
// evidence along them.
func (t *traversal) grantPaths(holderName string, hops []PathHop, rank, phase int, g ResourceGrant, extraLimits []string) {
	hop := PathHop{
		FromARN:  lastTo(hops, t.cred.ARN),
		ToARN:    g.ResourceARN,
		EdgeType: EdgeCanAccess,
		Evidence: EvidenceEffective,
		Table:    "effective_permissions",
	}
	allHops := append(append([]PathHop{}, hops...), hop)
	if EvidenceRankEffective < rank {
		rank = EvidenceRankEffective
	}

	limits := t.boundaryLimitations(extraLimits...)
	limits = append(limits, "does_not_prove_access_happened")
	limits = append(limits, g.Flags...)
	if isAllResourcesTarget(g.ResourceARN) {
		limits = append(limits, "wildcard_resource_grant")
	}

	pathType := PathDirectAccess
	if len(hops) > 0 {
		pathType = PathRoleChain
	} else if serviceOfTarget(g.ResourceARN) == "kms" {
		pathType = PathKMSAccess
	}
	targetType := resourceType(g.ResourceARN)
	if g.ResourceARN == AllResourcesARN {
		targetType = "all_resources"
	} else if strings.HasPrefix(g.ResourceARN, "*:") {
		targetType = "all_" + serviceOfTarget(g.ResourceARN) + "_resources"
	}
	significance := g.Significance()

	var desc string
	if len(hops) == 0 {
		desc = fmt.Sprintf("%s can %s on %s", t.cred.Name, summariseActions(g.Actions), nameFromARN(g.ResourceARN))
	} else {
		desc = fmt.Sprintf("%s → %s can %s on %s", t.cred.Name, holderName,
			summariseActions(g.Actions), nameFromARN(g.ResourceARN))
	}
	t.add(BlastRadiusPath{
		TargetARN:            g.ResourceARN,
		TargetType:           targetType,
		PathType:             pathType,
		PathDescription:      desc,
		Hops:                 allHops,
		EvidenceRank:         rank,
		SecuritySignificance: significance,
		Limitations:          limits,
		Phase:                phaseFor(pathType, phase),
	})

	// Privilege-escalation primitives held by this principal (PATH-005).
	if ea := g.EscalationActions(); len(ea) > 0 {
		t.add(BlastRadiusPath{
			TargetARN:            g.ResourceARN,
			TargetType:           targetType,
			PathType:             PathEscalation,
			PathDescription:      fmt.Sprintf("%s can escalate privileges via %s on %s", holderOrSelf(t.cred.Name, holderName, len(hops)), summariseActions(ea), nameFromARN(g.ResourceARN)),
			Hops:                 allHops,
			EvidenceRank:         rank,
			SecuritySignificance: "high",
			Limitations:          limits,
			Phase:                2,
		})
	}
}

func holderOrSelf(self, holder string, hops int) string {
	if hops == 0 {
		return self
	}
	return holder
}

// phaseFor keeps PATH-006 (KMS) in phase 1 and everything else in the caller's phase.
func phaseFor(pathType string, phase int) int {
	if pathType == PathKMSAccess {
		return 1
	}
	return phase
}

func lastTo(hops []PathHop, def string) string {
	if len(hops) == 0 {
		return def
	}
	return hops[len(hops)-1].ToARN
}

// ── Phase 1: Direct Access ────────────────────────────────────────────────────

func (t *traversal) phase1DirectAccess(ctx context.Context) {
	// 1a: effective permissions, explicit Deny applied, collapsed per resource.
	perms, err := t.e.repo.LoadEffectivePermissions(ctx, t.ds, t.cred.ARN)
	if err != nil {
		log.Printf("WARNING: effective permissions for %s: %v", t.cred.ARN, err)
	}
	covered := map[string]bool{}
	for _, g := range GroupByResource(ApplyDenies(perms)) {
		covered[g.ResourceARN] = true
		t.grantPaths(t.cred.Name, nil, EvidenceRankEffective, 1, g, nil)
	}

	// 1b: derived ISPM edges for resources not already covered.
	ispmEdges, err := t.e.repo.LoadISPMEdges(ctx, t.ds, t.cred.ARN)
	if err != nil {
		return
	}
	for _, edge := range ispmEdges {
		if edge.Target == "" || covered[edge.Target] {
			continue
		}
		targetType := resourceType(edge.Target)
		if edge.Target == AllResourcesARN {
			targetType = "all_resources"
		} else if strings.HasPrefix(edge.Target, "*:") {
			targetType = "all_" + serviceOfTarget(edge.Target) + "_resources"
		}
		t.add(BlastRadiusPath{
			TargetARN:       edge.Target,
			TargetType:      targetType,
			PathType:        PathDirectAccess,
			PathDescription: fmt.Sprintf("%s can access %s", t.cred.Name, nameFromARN(edge.Target)),
			Hops: []PathHop{{
				FromARN: t.cred.ARN, ToARN: edge.Target, EdgeType: EdgeCanAccess,
				Evidence: EvidenceConfigured, Table: "ispm_access_edges",
			}},
			EvidenceRank:         EvidenceRankConfigured,
			SecuritySignificance: "conditional",
			Limitations:          t.boundaryLimitations("does_not_prove_access_happened"),
			Phase:                1,
		})
	}
}

// ── Phase 2: Role Chains ───────────────────────────────────────────────────────

const maxChainNodes = 500

type chainState struct {
	arn   string
	hops  []PathHop
	rank  int      // weakest evidence along hops
	flags []string // limitation tokens accumulated along the chain

	// allObserved is true while every hop so far was seen in CloudTrail.
	allObserved bool
}

// hopCandidate is one way to step from a role to another role.
type hopCandidate struct {
	to       string
	basis    string
	evidence string
	rank     int
	table    string
	conds    []string
	flags    []string

	observedCount  uint64
	lastObservedAt *time.Time
}

func evidenceRankOf(name string) int {
	switch name {
	case EvidenceObserved:
		return EvidenceRankObserved
	case EvidenceEffective:
		return EvidenceRankEffective
	case EvidenceConfigured:
		return EvidenceRankConfigured
	}
	return EvidenceRankDerived
}

// hopCandidates returns every role `from` can assume: first the hops resolved
// from trust policies and identity permissions, then any other assume rows in
// trust_edges that the resolution did not already produce.
func (t *traversal) hopCandidates(ctx context.Context, from string) []hopCandidate {
	var out []hopCandidate
	seen := map[string]bool{}
	for _, e := range t.graph.From[from] {
		table := "credentials.trust_policy"
		switch {
		case e.Basis == BasisObserved:
			table = "cloudtrail_events"
		case e.Basis != BasisNamesRole:
			table = "credentials.trust_policy + effective_permissions"
		}
		out = append(out, hopCandidate{to: e.To, basis: e.Basis, evidence: e.Evidence,
			rank: evidenceRankOf(e.Evidence), table: table, conds: e.Conditions, flags: e.Flags,
			observedCount: e.ObservedCount, lastObservedAt: e.LastObservedAt})
		seen[e.To] = true
	}
	edges, err := t.e.repo.LoadTrustEdges(ctx, t.ds, from)
	if err != nil {
		log.Printf("WARNING: trust edges for %s: %v", from, err)
		return out
	}
	for _, edge := range edges {
		// A target with a wildcard is a resource pattern the collector stored
		// literally ("arn:aws:iam::*:role/x"), not a role. The resolver already
		// matches such patterns against the real roles, so skip it here.
		if edge.TargetARN == "" || strings.ContainsAny(edge.TargetARN, "*?") ||
			!isAssumeHop(edge.EdgeType) || seen[edge.TargetARN] {
			continue
		}
		c := hopCandidate{to: edge.TargetARN, basis: BasisTrustEdgesTable, evidence: EvidenceConfigured,
			rank: EvidenceRankConfigured, table: "trust_edges"}
		if raw := string(edge.Conditions); hasConditions(raw) {
			c.conds = []string{raw}
			c.flags = []string{"trust_conditions_not_evaluated"}
		}
		out = append(out, c)
		seen[edge.TargetARN] = true
	}
	return out
}

// phase2RoleChains walks the assumption graph breadth-first, so each role is
// reached by its shortest chain, and records the full hop list of every chain.
func (t *traversal) phase2RoleChains(ctx context.Context) {
	maxDepth := t.rb.MaxHops(PathRoleChain, t.e.cfg.MaxHopsPhase2)
	visited := map[string]bool{t.cred.ARN: true}
	queue := []chainState{{arn: t.cred.ARN, rank: EvidenceRankObserved, allObserved: true}}

	for len(queue) > 0 && len(visited) < maxChainNodes {
		cur := queue[0]
		queue = queue[1:]
		if len(cur.hops) >= maxDepth {
			continue
		}

		for _, cand := range t.hopCandidates(ctx, cur.arn) {
			if cand.to == "" || (t.e.cfg.CycleDetection && visited[cand.to]) {
				continue
			}
			visited[cand.to] = true

			hop := PathHop{
				FromARN: cur.arn, ToARN: cand.to, EdgeType: EdgeCanAssume,
				Evidence: cand.evidence, Table: cand.table, Basis: cand.basis, Conditions: cand.conds,
				ObservedCount: cand.observedCount, LastObservedAt: cand.lastObservedAt,
			}
			allObserved := cur.allObserved && cand.evidence == EvidenceObserved
			extra := unionStrings(cur.flags, cand.flags)
			if fa, ta := arnAccount(cur.arn), arnAccount(cand.to); fa != "" && ta != "" && fa != ta {
				extra = unionStrings(extra, []string{"crosses_account_boundary"})
			}
			hops := append(append([]PathHop{}, cur.hops...), hop)
			rank := minInt(cur.rank, cand.rank)

			targetName := nameFromARN(cand.to)
			target, err := t.e.repo.LoadCredentialByARN(ctx, t.ds, cand.to)
			if err == nil {
				targetName = target.Name
			} else {
				extra = append(extra, "target_outside_scope")
			}

			var grants []ResourceGrant
			if err == nil {
				perms, _ := t.e.repo.LoadEffectivePermissions(ctx, t.ds, cand.to)
				grants = GroupByResource(ApplyDenies(perms))
			}

			// The assumed identity itself (reachable_identities).
			idSig := "conditional"
			for _, g := range grants {
				if significanceRank(g.Significance()) > significanceRank(idSig) {
					idSig = g.Significance()
				}
			}
			t.add(BlastRadiusPath{
				TargetARN:            cand.to,
				TargetType:           resourceType(cand.to),
				TargetName:           targetName,
				PathType:             PathRoleChain,
				PathDescription:      fmt.Sprintf("%s → assumes %s (%d hop%s)", t.cred.Name, targetName, len(hops), plural(len(hops))),
				Hops:                 hops,
				EvidenceRank:         rank,
				SecuritySignificance: idSig,
				Limitations:          append([]string{assumptionLimitation(allObserved)}, extra...),
				Phase:                2,
			})

			for _, g := range grants {
				t.grantPaths(targetName, hops, rank, 2, g, extra)
			}

			queue = append(queue, chainState{arn: cand.to, hops: hops, rank: rank, flags: extra, allObserved: allObserved})
		}
	}
}

// assumptionLimitation says what a role-chain path does not prove: a chain seen
// end to end in CloudTrail proves the assumptions happened, but not that they
// were authorised; a chain resolved from policies proves neither.
func assumptionLimitation(allObserved bool) string {
	if allObserved {
		return "observed_does_not_mean_authorized"
	}
	return "does_not_prove_assumption_happened"
}

// dropFailedCalls removes failed API calls (AccessDenied and the like): a call
// that failed is not evidence that the access works.
func dropFailedCalls(events []ObservedEvent) []ObservedEvent {
	out := events[:0:0]
	for _, ev := range events {
		if ev.ErrorCode == "" {
			out = append(out, ev)
		}
	}
	return out
}

// isAssumeHop reports whether a trust_edges row is an identity-to-role hop.
// The collector also writes pass_role edges (permission to pass a role to a
// service, not to become it) and trust-policy edges whose source is a service
// or federated principal rather than a role; following those as hops would
// invent role chains. An empty type is accepted for older rows.
func isAssumeHop(edgeType string) bool {
	switch edgeType {
	case "", "assume_role", "cross_account":
		return true
	}
	return false
}

func hasConditions(c string) bool {
	c = strings.TrimSpace(c)
	return c != "" && c != "null" && c != "{}" && c != "[]"
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ── Phase 3: Cross-Account ─────────────────────────────────────────────────────

func (t *traversal) phase3CrossAccount(ctx context.Context) {
	lineageEdges, err := t.e.repo.LoadCrossAccountLineage(ctx, t.ds, t.cred.ARN)
	if err == nil {
		for _, edge := range lineageEdges {
			if !edge.IsExternal || edge.TargetID == "" {
				continue
			}
			t.add(BlastRadiusPath{
				TargetARN:       edge.TargetID,
				TargetType:      edge.TargetType,
				PathType:        PathCrossAccount,
				PathDescription: fmt.Sprintf("%s → cross-account trust → %s", t.cred.Name, shortARN(edge.TargetID)),
				Hops: []PathHop{{
					FromARN: t.cred.ARN, ToARN: edge.TargetID, EdgeType: EdgeCrossAccount,
					Evidence: EvidenceDerived, Table: "nhi_lineage_aws",
				}},
				EvidenceRank:         EvidenceRankDerived,
				SecuritySignificance: "high",
				Limitations:          []string{"does_not_prove_cross_account_access_happened"},
				Phase:                3,
			})
		}
	}

	// Confirm with CloudTrail: calls on resources owned by another account.
	home := t.ds.AccountIDs
	if len(home) == 0 && t.cred.AccountID != "" {
		home = []string{t.cred.AccountID}
	}
	for _, ev := range t.observed {
		if ev.ResourceARN == "" || !isCrossAccount(ev.ResourceARN, home) {
			continue
		}
		if hasPath(t.result.Paths, t.cred.ARN, ev.ResourceARN, PathCrossAccount) {
			continue
		}
		t.add(BlastRadiusPath{
			TargetARN:       ev.ResourceARN,
			TargetType:      ev.ResourceType,
			PathType:        PathCrossAccount,
			PathDescription: fmt.Sprintf("%s performed %s on %s in another account", t.cred.Name, ev.EventName, shortARN(ev.ResourceARN)),
			Hops: []PathHop{{
				FromARN: t.cred.ARN, ToARN: ev.ResourceARN, EdgeType: EdgeAccessed,
				Evidence: EvidenceObserved, Table: "cloudtrail_events",
			}},
			EvidenceRank:         EvidenceRankObserved,
			SecuritySignificance: "high",
			Limitations:          []string{"observed_does_not_mean_authorized"},
			Phase:                3,
		})
	}
}

// ── Phase 4: Compute-Mediated ──────────────────────────────────────────────────

// classifyEvent maps a CloudTrail event to a path type by service, not by
// substring, so a Secrets Manager read is never relabelled as KMS.
func classifyEvent(ev ObservedEvent) string {
	src := strings.ToLower(ev.EventSource)
	arn := strings.ToLower(ev.ResourceARN)
	switch {
	case src == "secretsmanager.amazonaws.com", strings.Contains(arn, ":secretsmanager:"):
		return PathSecretsAccess
	case src == "ssm.amazonaws.com" && strings.HasPrefix(ev.EventName, "GetParameter"):
		return PathSecretsAccess
	case src == "kms.amazonaws.com", strings.Contains(arn, ":kms:"):
		return PathKMSAccess
	default:
		return PathWorkloadAccess
	}
}

func (t *traversal) phase4ComputeMediated(ctx context.Context) {
	tasks, err := t.e.repo.LoadECSTasksForRole(ctx, t.ds, t.cred.ARN)
	if err != nil || len(tasks) == 0 {
		return
	}

	for _, ev := range t.observed {
		if ev.ResourceARN == "" {
			continue
		}
		pathType := classifyEvent(ev)
		if hasPath(t.result.Paths, t.cred.ARN, ev.ResourceARN, pathType) {
			continue
		}

		// CloudTrail records the task in the assumed-role session name; only
		// attribute an event to a task when that name appears in the caller.
		var task *ECSTask
		for i := range tasks {
			if id := nameFromARN(tasks[i].TaskARN); id != "" && strings.Contains(ev.CallerARN, id) {
				task = &tasks[i]
				break
			}
		}

		var hops []PathHop
		var desc string
		limits := []string{"does_not_prove_workload_used_this_role"}
		if task != nil {
			hops = []PathHop{
				{FromARN: t.cred.ARN, ToARN: task.TaskARN, EdgeType: EdgeHasRole, Evidence: EvidenceConfigured, Table: "ecs_task_registry"},
				{FromARN: task.TaskARN, ToARN: ev.ResourceARN, EdgeType: EdgeAccessed, Evidence: EvidenceObserved, Table: "cloudtrail_events"},
			}
			desc = fmt.Sprintf("%s is used by ECS task %s → task called %s on %s",
				t.cred.Name, nameFromARN(task.TaskARN), ev.EventName, nameFromARN(ev.ResourceARN))
		} else {
			hops = []PathHop{
				{FromARN: t.cred.ARN, ToARN: ev.ResourceARN, EdgeType: EdgeAccessed, Evidence: EvidenceObserved, Table: "cloudtrail_events"},
			}
			desc = fmt.Sprintf("%s (used by %d ECS task%s) called %s on %s",
				t.cred.Name, len(tasks), plural(len(tasks)), ev.EventName, nameFromARN(ev.ResourceARN))
			limits = append(limits, "task_attribution_unverified")
		}

		sig := "conditional"
		switch pathType {
		case PathSecretsAccess:
			sig = "high"
		case PathKMSAccess:
			sig = "medium"
		}
		t.add(BlastRadiusPath{
			TargetARN:            ev.ResourceARN,
			TargetType:           ev.ResourceType,
			PathType:             pathType,
			PathDescription:      desc,
			Hops:                 hops,
			EvidenceRank:         EvidenceRankObserved,
			SecuritySignificance: sig,
			Limitations:          limits,
			Phase:                4,
		})
	}
}

// ── Evidence validation ────────────────────────────────────────────────────────

// validateEvidence upgrades paths whose target CloudTrail shows this credential
// actually touching, and adds an observed-activity path (PATH-008) for every
// touched resource, including ones no configured permission explains.
func (t *traversal) validateEvidence() {
	if len(t.observed) == 0 {
		return
	}
	latest := map[string]ObservedEvent{}
	var order []string
	for _, ev := range t.observed { // newest first
		if ev.ResourceARN == "" {
			continue
		}
		if _, ok := latest[ev.ResourceARN]; !ok {
			latest[ev.ResourceARN] = ev
			order = append(order, ev.ResourceARN)
		}
	}

	for i := range t.result.Paths {
		p := &t.result.Paths[i]
		if p.PathType == PathObservedActivity {
			continue
		}
		if _, ok := latest[p.TargetARN]; ok && p.EvidenceRank < EvidenceRankObserved {
			p.EvidenceRank = EvidenceRankObserved
			p.Confidence = "HIGH"
			if !containsString(p.Limitations, "observed_does_not_mean_authorized") {
				p.Limitations = append(p.Limitations, "observed_does_not_mean_authorized")
			}
		}
	}

	for _, arn := range order {
		if hasPath(t.result.Paths, t.cred.ARN, arn, PathObservedActivity) {
			continue
		}
		ev := latest[arn]
		t.add(BlastRadiusPath{
			TargetARN:       arn,
			TargetType:      ev.ResourceType,
			PathType:        PathObservedActivity,
			PathDescription: fmt.Sprintf("%s performed %s on %s at %s", t.cred.Name, ev.EventName, nameFromARN(arn), ev.EventTime.Format(time.RFC3339)),
			Hops: []PathHop{{
				FromARN: t.cred.ARN, ToARN: arn, EdgeType: EdgeAccessed,
				Evidence: EvidenceObserved, Table: "cloudtrail_events",
			}},
			EvidenceRank:         EvidenceRankObserved,
			SecuritySignificance: "medium",
			Limitations:          []string{"observed_does_not_mean_authorized"},
			Phase:                1,
		})
	}
}

// ── Deduplication ──────────────────────────────────────────────────────────────

// dedupPaths keeps one path per (source, target, path type): the one with the
// strongest evidence, and among equals the shortest.
func (e *Engine) dedupPaths(paths []BlastRadiusPath) []BlastRadiusPath {
	if e.cfg.DedupStrategy != "keep_strongest" {
		return paths
	}
	type pathKey struct {
		source, target, pathType string
		identity                 bool // 'assumes role X' and 'X can act on Y' are different findings
	}
	best := map[pathKey]int{}
	var order []pathKey
	for i, p := range paths {
		k := pathKey{p.SourceARN, p.TargetARN, p.PathType, isIdentityPath(p)}
		cur, ok := best[k]
		if !ok {
			best[k] = i
			order = append(order, k)
			continue
		}
		c := paths[cur]
		if p.EvidenceRank > c.EvidenceRank ||
			(p.EvidenceRank == c.EvidenceRank && len(p.Hops) < len(c.Hops)) {
			best[k] = i
		}
	}
	out := make([]BlastRadiusPath, 0, len(order))
	for _, k := range order {
		out = append(out, paths[best[k]])
	}
	return out
}

func sortPaths(paths []BlastRadiusPath) {
	sort.SliceStable(paths, func(i, j int) bool {
		if paths[i].Phase != paths[j].Phase {
			return paths[i].Phase < paths[j].Phase
		}
		if paths[i].PathType != paths[j].PathType {
			return paths[i].PathType < paths[j].PathType
		}
		return paths[i].TargetARN < paths[j].TargetARN
	})
}

// ── Helpers ────────────────────────────────────────────────────────────────────

func hasPath(paths []BlastRadiusPath, source, target, pathType string) bool {
	for _, p := range paths {
		if p.SourceARN == source && p.TargetARN == target && p.PathType == pathType {
			return true
		}
	}
	return false
}

func containsString(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}

func confidenceFromRank(rank int) string {
	switch rank {
	case EvidenceRankObserved:
		return "HIGH"
	case EvidenceRankEffective, EvidenceRankConfigured:
		return "MEDIUM"
	default:
		return "LOW"
	}
}

func resourceType(arn string) string {
	// arn:aws:service:region:account:resource-type/resource-name
	parts := strings.Split(arn, ":")
	if len(parts) >= 6 && parts[2] == "s3" {
		// arn:aws:s3:::bucket[/key]: S3 ARNs carry no resource-type segment.
		if strings.Contains(parts[5], "/") {
			return "object"
		}
		return "bucket"
	}
	// Services whose ARN ends in the bare name carry no type segment.
	if len(parts) == 6 && !strings.Contains(parts[5], "/") {
		switch parts[2] {
		case "sqs":
			return "queue"
		case "sns":
			return "topic"
		}
	}
	if len(parts) >= 6 {
		resourcePart := parts[5]
		if idx := strings.Index(resourcePart, "/"); idx > 0 {
			return resourcePart[:idx]
		}
		return resourcePart
	}
	return "unknown"
}

func shortARN(arn string) string {
	// arn:aws:iam::123456789012:role/MyRole → role/MyRole
	if idx := strings.LastIndex(arn, ":"); idx >= 0 && idx < len(arn)-1 {
		return arn[idx+1:]
	}
	return arn
}

// securitySignificance rates a single action on a resource.
func securitySignificance(action, resourceARN string) string {
	action = strings.ToLower(action)
	resourceARN = strings.ToLower(resourceARN)
	_, verb, ok := strings.Cut(action, ":")
	if !ok {
		verb = action
	}

	// An action that changes, runs, sends or removes something is a write.
	for _, w := range writeVerbs {
		if strings.HasPrefix(verb, w) {
			return "high"
		}
	}

	switch serviceOfTarget(resourceARN) {
	case "secretsmanager", "kms", "ssm", "iam":
		return "high"
	}

	for _, r := range readVerbs {
		if strings.HasPrefix(verb, r) {
			return "conditional"
		}
	}

	return "low"
}

// writeVerbs and readVerbs classify an action by the start of its name
// ("RunInstances" starts with "run", "GetObject" with "get").
var writeVerbs = []string{
	"delete", "destroy", "terminate", "put", "create", "update", "modify", "attach", "detach",
	"passrole", "run", "start", "stop", "invoke", "send", "publish", "write", "set", "add",
	"remove", "grant", "revoke", "import", "upload", "register", "deregister", "enable",
	"disable", "reboot", "associate", "disassociate", "replace", "restore", "reset", "rotate",
}

var readVerbs = []string{"get", "list", "describe", "head", "batchget", "lookup", "search", "read", "scan", "query", "select", "view"}
