package engine

import "context"

// Family statuses: what the engine can do for a composition family today.
const (
	FamilyWorking   = "working"    // implemented and fed by data that exists
	FamilyPartial   = "partial"    // part of the family is implemented
	FamilyNeedsData = "needs_data" // implemented or designed, but the collectors do not provide its data
	FamilyNotBuilt  = "not_built"  // data exists, the engine does not do it yet
)

// FamilyInfo describes one composition family (FAM-01 to FAM-15) and whether it
// is switched on in the rule table.
type FamilyInfo struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Status    string `json:"status"`
	Enabled   bool   `json:"enabled"`   // is_active in correlation_composition_rules
	Relations int    `json:"relations"` // type-level relations the family can form (research)
	Effect    string `json:"effect"`    // what switching it off changes in the engine
	Needs     string `json:"needs,omitempty"`
}

// familyCatalogue is what the engine knows about each family. The rule table
// decides whether a family is on; this decides what it means and how far it goes.
var familyCatalogue = []FamilyInfo{
	{ID: "FAM-01", Name: "Role chain (assume, then assume)", Status: FamilyWorking, Relations: 36,
		Effect: "off: roles are followed one hop only, never in chains"},
	{ID: "FAM-02", Name: "Reach through an assumed role", Status: FamilyWorking, Relations: 252,
		Effect: "off: an assumed role is listed, but what it can access is not added"},
	{ID: "FAM-03", Name: "Escalation through a chain", Status: FamilyWorking, Relations: 108,
		Effect: "off: privilege-escalation paths are produced only for the identity itself, not for roles it assumes"},
	{ID: "FAM-04", Name: "A workload inherits its role's reach", Status: FamilyWorking, Relations: 1452,
		Effect: "off: only roles can be queried; a workload (Lambda, EC2, ECS ...) is not found"},
	{ID: "FAM-05", Name: "Modify a workload, become its role", Status: FamilyNotBuilt, Relations: 11,
		Needs: "engine logic: pair a write permission on a workload with the workload's role"},
	{ID: "FAM-06", Name: "PassRole plus create compute", Status: FamilyPartial, Relations: 15,
		Effect: "PassRole is reported as escalation; pairing it with a create-compute permission is not evaluated"},
	{ID: "FAM-07", Name: "Supply chain (push image, pulled by service)", Status: FamilyNeedsData, Relations: 4,
		Needs: "container image to service links (ECS task definitions, Lambda images)"},
	{ID: "FAM-08", Name: "Trigger injection (write queue, runs Lambda)", Status: FamilyPartial, Relations: 6,
		Effect: "off: writing to a bucket, queue or topic that starts a Lambda function is not reported as reaching the function's role",
		Needs:  "graph data (nhi_resource_links); the reached role's own reach is not expanded"},
	{ID: "FAM-09", Name: "Secret or parameter unlocks a datastore", Status: FamilyNeedsData, Relations: 10,
		Needs: "secret to database links, secret references in workload configuration"},
	{ID: "FAM-10", Name: "Decrypt dependency (data grant plus key grant)", Status: FamilyWorking, Relations: 20,
		Effect: "off: a path to a resource encrypted with a customer KMS key is not checked against the key policy and grants",
		Needs:  "graph data (nhi_resource_links encrypted_by, KMS key policies and grants)"},
	{ID: "FAM-11", Name: "Boundary or SCP caps a grant", Status: FamilyPartial, Relations: 126,
		Effect: "off: SCP Denies are not applied",
		Needs:  "graph data (nhi_org_policies); SCPs on OUs only flag (no OU tree); permission boundaries are empty"},
	{ID: "FAM-12", Name: "Conditions on an assume edge", Status: FamilyWorking, Relations: 66,
		Effect: "off: trust conditions are not shown on hops"},
	{ID: "FAM-13", Name: "CloudTrail confirms an edge", Status: FamilyWorking, Relations: 102,
		Effect: "off: nothing is upgraded to observed evidence, observed-only hops are not added, and Access Advisor usage flags are not shown"},
	{ID: "FAM-14", Name: "Overlap (second source for the same edge)", Status: FamilyWorking, Relations: 7,
		Effect: "off: resource policies are not used (no grants, Denies or inward principals from them); trust policy and trust_edges hops are still merged",
		Needs:  "graph data (nhi_resource_policies) for the resource-policy side"},
	{ID: "FAM-15", Name: "Destructive action reachable", Status: FamilyNotBuilt, Relations: 112,
		Needs: "engine logic: report delete and detach actions as their own finding"},
}

// FamilyEnabled reports whether a composition family is switched on. A database
// without the family rows (an older schema, or a demo) leaves every family on.
func (rb *RuleBook) FamilyEnabled(id string) bool {
	if rb == nil || rb.fam == nil {
		return true
	}
	v, ok := rb.fam[id]
	return !ok || v
}

// Families lists every family with its status and whether it is switched on.
func (e *Engine) Families(ctx context.Context, ds *Scope) []FamilyInfo {
	rb := e.ruleBook(ctx, ds)
	out := make([]FamilyInfo, len(familyCatalogue))
	for i, f := range familyCatalogue {
		f.Enabled = rb.FamilyEnabled(f.ID)
		out[i] = f
	}
	return out
}
