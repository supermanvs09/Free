package awsintegration

import (
	"context"
	"log/slog"

	"nhi-backend-api/internal/platform/awsconnect"
)

// PlatformIdentityChecker is awsconnect.Client.
type PlatformIdentityChecker interface {
	CheckPlatformIdentity(ctx context.Context, p awsconnect.Platform) awsconnect.Diagnosis
}

// CheckPlatformAtStart verifies, for every collector account the tenants are
// set up with, that this process calls AWS in that account and as the role
// customer trust policies name. A mismatch makes every customer's "Verify
// connection" fail with AccessDenied, so it is logged as an error at start
// instead of being found by the first customer.
func CheckPlatformAtStart(ctx context.Context, repo *AWSIntegrationRepository, client PlatformIdentityChecker, assumerRoleName string) {
	platforms, err := repo.CollectorPlatforms(ctx)
	if err != nil {
		slog.Warn("aws integration: start-up check of our AWS identity skipped", "err", err)
		return
	}
	for _, cp := range platforms {
		p, err := awsconnect.PlatformForTenant(cp[0], cp[1], assumerRoleName)
		if err != nil {
			slog.Error("aws integration: a tenant's collector settings are inconsistent", "collector_account", cp[0], "event_bus", cp[1], "err", err)
			continue
		}
		d := client.CheckPlatformIdentity(ctx, p)
		switch {
		case d.OurFault():
			slog.Error("aws integration: OUR AWS identity does not match what customers trust - every Verify connection will be refused",
				"collector_account", p.AccountID, "assumer_role", p.AssumerRoleARN, "caller_arn", d.CallerARN, "problems", d.Problems)
		case len(d.NotChecked) > 0:
			slog.Warn("aws integration: could not check our AWS identity at start", "collector_account", p.AccountID, "not_checked", d.NotChecked)
		default:
			slog.Info("aws integration: our AWS identity matches what customers trust", "collector_account", p.AccountID, "caller_arn", d.CallerARN)
		}
	}
}
