package humanidentities

import (
	"context"
	"strings"
	"time"

	"nhi-backend-api/internal/identitygraph"
	"nhi-backend-api/internal/platform/scope"
)

type HumanIdentityService struct {
	repo     *identitygraph.HumanIdentityRepository
	resolver *scope.Resolver
}

func NewHumanIdentityService(repo *identitygraph.HumanIdentityRepository, resolver *scope.Resolver) *HumanIdentityService {
	return &HumanIdentityService{repo: repo, resolver: resolver}
}

func (s *HumanIdentityService) GetOverview(ctx context.Context, userID, tenantID, dbName, source string) (*identitygraph.HumanIdentityOverview, error) {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	return s.repo.Overview(ctx, resolved, source)
}

func (s *HumanIdentityService) GetList(ctx context.Context, userID, tenantID, dbName string, f identitygraph.HumanIdentityListFilter) (*identitygraph.HumanIdentityListResponse, error) {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	return s.repo.List(ctx, resolved, f)
}

func (s *HumanIdentityService) GetDetail(ctx context.Context, userID, tenantID, dbName, id string) (*identitygraph.HumanIdentityDetail, error) {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	d, err := s.repo.Detail(ctx, resolved, id)
	if err != nil {
		return nil, err
	}
	d.RiskSignals = buildHumanRiskSignals(d, time.Now())
	return d, nil
}

// buildHumanRiskSignals uses the same definitions as the overview SQL:
// MFA not on = NULL or false; inactive = last activity older than 90 days;
// never used = no last activity; privileged = admin-like permission set or
// AdministratorAccess policy. Activity signals apply to IAM only, because SSO
// has no sign-in activity yet. Root without MFA is critical.
func buildHumanRiskSignals(d *identitygraph.HumanIdentityDetail, now time.Time) []identitygraph.HumanRiskSignal {
	signals := []identitygraph.HumanRiskSignal{}

	mfaNotOn := d.MFAActive == nil || !*d.MFAActive
	consoleOn := d.ConsoleAccess != nil && *d.ConsoleAccess

	isRoot := d.HumanType == identitygraph.HumanTypeRoot
	isIAM := d.Source == identitygraph.HumanSourceIAM

	switch {
	case isRoot && mfaNotOn:
		signals = append(signals, identitygraph.HumanRiskSignal{Label: "Root account without MFA", Severity: "critical"})
	case consoleOn && mfaNotOn:
		signals = append(signals, identitygraph.HumanRiskSignal{Label: "Console access without MFA", Severity: "critical"})
	}
	if d.MFAActive != nil && !*d.MFAActive {
		signals = append(signals, identitygraph.HumanRiskSignal{Label: "MFA disabled", Severity: "high"})
	}
	if isIAM {
		if d.LastActivityAt == nil {
			signals = append(signals, identitygraph.HumanRiskSignal{Label: "Never used", Severity: "medium"})
		} else if now.Sub(*d.LastActivityAt) > 90*24*time.Hour {
			signals = append(signals, identitygraph.HumanRiskSignal{Label: "Inactive over 90 days", Severity: "high"})
		}
	}
	for _, a := range d.Access {
		name := ""
		if a.PermissionSetName != nil {
			name = strings.ToLower(*a.PermissionSetName)
		}
		policy := ""
		if a.PolicyARN != nil {
			policy = strings.ToLower(*a.PolicyARN)
		}
		if strings.Contains(name, "admin") || strings.Contains(policy, "administratoraccess") {
			signals = append(signals, identitygraph.HumanRiskSignal{Label: "Privileged access", Severity: "high"})
			break
		}
	}
	return signals
}
