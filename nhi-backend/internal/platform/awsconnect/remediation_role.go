// Package awsconnect builds AWS SDK configs that act inside a customer account:
// the platform identity assumes the customer's remediation role with the
// tenant ExternalId, a session name that carries the execution id (CloudTrail
// attribution) and an optional session policy that narrows the call to one
// target.
package awsconnect

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials/stscreds"
	"github.com/aws/aws-sdk-go-v2/service/sts"
)

type Factory struct {
	base          aws.Config
	platformRole  string
	duration      time.Duration
	DefaultRegion string
}

// NewFactory loads the platform's own credentials (env, instance profile,
// IRSA, ...). When platformRoleARN is set the platform first assumes it.
func NewFactory(ctx context.Context, region, platformRoleARN string, duration time.Duration) (*Factory, error) {
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("load aws config: %w", err)
	}
	if duration < 15*time.Minute {
		duration = 15 * time.Minute
	}
	f := &Factory{base: cfg, platformRole: platformRoleARN, duration: duration, DefaultRegion: region}
	if platformRoleARN != "" {
		p := stscreds.NewAssumeRoleProvider(sts.NewFromConfig(cfg), platformRoleARN, func(o *stscreds.AssumeRoleOptions) {
			o.RoleSessionName = "ispm-remediator"
		})
		f.base.Credentials = aws.NewCredentialsCache(p)
	}
	return f, nil
}

type Role struct {
	ARN        string
	ExternalID string
}

var sessionNameRe = regexp.MustCompile(`[^\w+=,.@-]`)

// SessionName makes a valid RoleSessionName (<= 64 chars) from an id.
func SessionName(id string) string {
	n := "ispm-" + sessionNameRe.ReplaceAllString(id, "")
	if len(n) > 64 {
		n = n[:64]
	}
	return n
}

var ErrCannotAssume = errors.New("cannot assume the remediation role")

// Config returns an SDK config whose credentials are the assumed remediation
// role. The credentials are fetched once here so a bad role / ExternalId fails
// immediately with ErrCannotAssume.
func (f *Factory) Config(ctx context.Context, role Role, region, sessionName, sessionPolicy string) (aws.Config, error) {
	if role.ARN == "" {
		return aws.Config{}, fmt.Errorf("%w: the account has no remediation_role_arn", ErrCannotAssume)
	}
	if region == "" {
		region = f.DefaultRegion
	}
	cfg := f.base.Copy()
	cfg.Region = region
	p := stscreds.NewAssumeRoleProvider(sts.NewFromConfig(f.base), role.ARN, func(o *stscreds.AssumeRoleOptions) {
		o.RoleSessionName = sessionName
		o.Duration = f.duration
		if role.ExternalID != "" {
			o.ExternalID = aws.String(role.ExternalID)
		}
		if sessionPolicy != "" {
			o.Policy = aws.String(sessionPolicy)
		}
	})
	cfg.Credentials = aws.NewCredentialsCache(p)
	if _, err := cfg.Credentials.Retrieve(ctx); err != nil {
		return aws.Config{}, fmt.Errorf("%w: %v", ErrCannotAssume, err)
	}
	return cfg, nil
}
