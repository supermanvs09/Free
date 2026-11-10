package findingfix

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/catalog"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
	"nhi-backend-api/internal/remediation/store"
)

type FindingFixRepository struct {
	core *engine.Service
}

func NewFindingFixRepository(core *engine.Service) *FindingFixRepository {
	return &FindingFixRepository{core: core}
}

// fixData is what the service needs: the finding, the actions mapped to its rule (default
// first) and their catalog rows.
type fixData struct {
	finding   domain.Finding
	ruleActs  []domain.RuleAction
	actions   map[string]*domain.Action
	oneClick  map[string]oneClickCheck // per action type
	pending   *domain.Plan             // plan waiting for approval or about to run, if any
	dashboard string
}

type oneClickCheck struct {
	ok  bool
	why string
}

// Get reads the finding (ispm_nhi_findings), its rule mapping (ispm_rule_weights), the
// catalog (remediation_actions), the account settings (accounts) and a pending plan of the
// finding (remediation_plans). Read only.
func (r *FindingFixRepository) Get(ctx context.Context, tenantID, findingID string) (*fixData, error) {
	st, err := r.core.Store(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	fs, err := st.GetFindings(ctx, []string{findingID})
	if err != nil {
		return nil, err
	}
	if len(fs) == 0 {
		return nil, common.NotFound("finding", store.ErrNotFound)
	}
	d := &fixData{finding: fs[0], actions: map[string]*domain.Action{}, oneClick: map[string]oneClickCheck{},
		dashboard: r.core.DashboardURL()}
	if d.ruleActs, err = st.RuleActions(ctx, d.finding.RuleID); err != nil {
		return nil, err
	}
	for _, ra := range d.ruleActs {
		a, err := st.GetAction(ctx, ra.ActionType)
		if err != nil {
			continue
		}
		d.actions[ra.ActionType] = a
		target, _ := catalog.Resolve(ra.ParamsTemplate, d.finding, nil)["target_arn"].(string)
		if target == "" {
			target = d.finding.CredentialARN
		}
		ok, why := r.core.OneClickAvailable(ctx, st, d.finding.AccountID, a, target)
		d.oneClick[ra.ActionType] = oneClickCheck{ok: ok, why: why}
	}
	if d.pending, err = st.PendingPlanFor(ctx, []string{d.finding.ID}); err != nil {
		return nil, err
	}
	return d, nil
}
