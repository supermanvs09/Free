package awsintegration

import (
	"context"
	"strings"
	"sync"
	"time"

	"nhi-backend-api/internal/platform/awsconnect"
)

// SimulatedAWS stands in for AWS on a developer machine or a demo stack with
// no AWS account behind it (NHI_AWS_SIMULATE=true, refused in production; see
// cmd/api-server). It lets the whole connection flow - verify, the events
// watch, the approval request and e-mail, approval in tenant onboarding - be
// exercised end to end.
//
// Every role can be assumed and read, except in account 000000000401 (assume
// is refused) and 000000000403 (the read is refused), so the failure paths can
// be seen too. Events "arrive" from one region every EventEvery after the
// first poll, us-east-1 first; account 000000000404 never sends any, so the
// watch runs out of time.
type SimulatedAWS struct {
	EventEvery time.Duration

	mu    sync.Mutex
	first map[string]time.Time // account -> the first poll of its current watch
	last  map[string]time.Time // account -> its latest poll
	now   func() time.Time
}

// NewSimulatedAWS returns the simulator; every <= 0 means 6 seconds.
func NewSimulatedAWS(every time.Duration) *SimulatedAWS {
	if every <= 0 {
		every = 6 * time.Second
	}
	return &SimulatedAWS{EventEvery: every, first: map[string]time.Time{}, last: map[string]time.Time{}, now: time.Now}
}

const (
	simDenyAssume = "000000000401"
	simDenyRead   = "000000000403"
	simNoEvents   = "000000000404"
)

func (s *SimulatedAWS) AssumeRole(_ context.Context, _ awsconnect.Platform, role awsconnect.RoleARN, _ string) (*awsconnect.Session, error) {
	if role.AccountID == simDenyAssume {
		return nil, awsconnect.ErrAccessDenied
	}
	return &awsconnect.Session{}, nil
}

func (s *SimulatedAWS) TestRead(_ context.Context, sess *awsconnect.Session) error {
	return nil
}

func (s *SimulatedAWS) AllowAccountOnBus(context.Context, awsconnect.Platform, string) error {
	return nil
}
func (s *SimulatedAWS) RevokeAccountOnBus(context.Context, awsconnect.Platform, string) error {
	return nil
}

func (s *SimulatedAWS) ListCodeCommit(_ context.Context, _ *awsconnect.Session, regions []string) (awsconnect.CodeCommitResult, error) {
	return awsconnect.CodeCommitResult{Regions: regions}, nil
}

func (s *SimulatedAWS) ProbeCodeCommit(_ context.Context, _ *awsconnect.Session, region, repository string) awsconnect.RepoProbe {
	return awsconnect.RepoProbe{Region: region, Repository: repository}
}

func (s *SimulatedAWS) ReadSecretToken(context.Context, *awsconnect.Session, awsconnect.SecretARN) (string, error) {
	return "", awsconnect.ErrSecretNotFound
}

// simRegionOrder is the order regions start sending: us-east-1 (IAM, STS)
// first, then the rest as AWS lists them.
var simRegionOrder = []string{
	"us-east-1", "ap-south-1", "ap-south-2", "eu-west-1", "us-west-2", "us-east-2", "eu-central-1", "ap-southeast-1",
	"ap-southeast-2", "ap-northeast-1", "eu-west-2", "us-west-1", "ca-central-1", "sa-east-1", "eu-north-1",
	"ap-northeast-2", "eu-west-3", "me-south-1", "af-south-1", "ap-east-1", "eu-south-1", "ap-northeast-3",
}

func (s *SimulatedAWS) PollEvents(_ context.Context, _ awsconnect.Platform, accountID string) (awsconnect.EventPoll, error) {
	s.mu.Lock()
	now := s.now()
	first, ok := s.first[accountID]
	// A watch polls every few seconds; a poll after a longer pause is a new
	// watch, which starts from no events again.
	if last, seen := s.last[accountID]; !ok || !seen || now.Sub(last) > 30*time.Second {
		first = now
		s.first[accountID] = now
	}
	s.last[accountID] = now
	s.mu.Unlock()
	poll := awsconnect.EventPoll{Regions: map[string]int{}, Seen: 3}
	if accountID == simNoEvents {
		return poll, nil
	}
	elapsed := now.Sub(first)
	for i, region := range simRegionOrder {
		if elapsed >= time.Duration(i+1)*s.EventEvery {
			poll.Regions[region] = 1 + i%3
		}
	}
	return poll, nil
}

// simulatedReads wraps the simulator so the read refusal for 000000000403
// works: the session from AssumeRole remembers its account.
type simulatedReads struct {
	*SimulatedAWS
	mu       sync.Mutex
	sessions map[*awsconnect.Session]string
}

// NewSimulatedVerifier returns the simulator as an AWSVerifier and the same
// simulator as the AWSEventSource.
func NewSimulatedVerifier(every time.Duration) (AWSVerifier, AWSEventSource) {
	sim := NewSimulatedAWS(every)
	return &simulatedReads{SimulatedAWS: sim, sessions: map[*awsconnect.Session]string{}}, sim
}

func (r *simulatedReads) AssumeRole(ctx context.Context, p awsconnect.Platform, role awsconnect.RoleARN, ext string) (*awsconnect.Session, error) {
	sess, err := r.SimulatedAWS.AssumeRole(ctx, p, role, ext)
	if err == nil {
		r.mu.Lock()
		r.sessions[sess] = role.AccountID
		r.mu.Unlock()
	}
	return sess, err
}

func (r *simulatedReads) TestRead(_ context.Context, sess *awsconnect.Session) error {
	r.mu.Lock()
	account := r.sessions[sess]
	delete(r.sessions, sess)
	r.mu.Unlock()
	if strings.TrimSpace(account) == simDenyRead {
		return awsconnect.ErrAccessDenied
	}
	return nil
}
