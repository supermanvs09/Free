package awsprov

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/iam"
	iamtypes "github.com/aws/aws-sdk-go-v2/service/iam/types"
)

// Usage is the permission-usage baseline of a role (design section 5):
// IAM Access Advisor, service-level for all services and action-level for
// the services AWS tracks. No CloudTrail needed.
type Usage struct {
	WindowDays  int            `json:"window_days"`
	AsOf        time.Time      `json:"as_of"`
	Granularity string         `json:"granularity"` // service | action
	Services    []ServiceUsage `json:"services"`
	Used        []string       `json:"used_patterns"` // what the scoped policy keeps
}

type ServiceUsage struct {
	Namespace         string    `json:"namespace"`
	LastAuthenticated time.Time `json:"last_authenticated"`
	Actions           []string  `json:"actions,omitempty"` // tracked actions used in the window
	ActionTracking    bool      `json:"action_tracking"`
}

// accessAdvisor reads last-accessed data of a role. granularity "service"
// keeps "ns:*" for every used service (safe); "action" keeps the tracked
// actions that were used and "ns:*" for services without action tracking.
func accessAdvisor(ctx context.Context, c *Clients, roleARN string, windowDays int, granularity string) (*Usage, error) {
	gen, err := c.IAM.GenerateServiceLastAccessedDetails(ctx, &iam.GenerateServiceLastAccessedDetailsInput{
		Arn: aws.String(roleARN), Granularity: iamtypes.AccessAdvisorUsageGranularityTypeActionLevel,
	})
	if err != nil {
		return nil, fmt.Errorf("access advisor: %w", err)
	}
	var services []iamtypes.ServiceLastAccessed
	ok, err := waitFor(ctx, func() (bool, error) {
		services = nil
		var marker *string
		for {
			out, err := c.IAM.GetServiceLastAccessedDetails(ctx, &iam.GetServiceLastAccessedDetailsInput{JobId: gen.JobId, Marker: marker})
			if err != nil {
				return false, err
			}
			if out.JobStatus == iamtypes.JobStatusTypeFailed {
				return false, fmt.Errorf("access advisor job failed")
			}
			if out.JobStatus != iamtypes.JobStatusTypeCompleted {
				return false, nil
			}
			services = append(services, out.ServicesLastAccessed...)
			if !out.IsTruncated {
				return true, nil
			}
			marker = out.Marker
		}
	})
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("access advisor job did not finish in time")
	}

	if granularity != "action" {
		granularity = "service"
	}
	cutoff := time.Now().AddDate(0, 0, -windowDays)
	u := &Usage{WindowDays: windowDays, AsOf: time.Now().UTC(), Granularity: granularity}
	used := map[string]bool{}
	for _, s := range services {
		if s.LastAuthenticated == nil || s.LastAuthenticated.Before(cutoff) {
			continue
		}
		ns := strings.ToLower(aws.ToString(s.ServiceNamespace))
		su := ServiceUsage{Namespace: ns, LastAuthenticated: s.LastAuthenticated.UTC(), ActionTracking: len(s.TrackedActionsLastAccessed) > 0}
		for _, a := range s.TrackedActionsLastAccessed {
			if a.LastAccessedTime != nil && !a.LastAccessedTime.Before(cutoff) {
				su.Actions = append(su.Actions, ns+":"+aws.ToString(a.ActionName))
			}
		}
		sort.Strings(su.Actions)
		u.Services = append(u.Services, su)
		if granularity == "action" && su.ActionTracking && len(su.Actions) > 0 {
			for _, a := range su.Actions {
				used[a] = true
			}
		} else {
			used[ns+":*"] = true
		}
	}
	for k := range used {
		u.Used = append(u.Used, k)
	}
	sort.Strings(u.Used)
	sort.Slice(u.Services, func(i, j int) bool { return u.Services[i].Namespace < u.Services[j].Namespace })
	return u, nil
}

func (u *Usage) basis() map[string]any {
	if u == nil {
		return map[string]any{"source": "access_advisor", "available": false}
	}
	return map[string]any{"source": "access_advisor", "available": true, "window_days": u.WindowDays, "as_of": u.AsOf,
		"granularity": u.Granularity, "services": u.Services, "used_patterns": u.Used}
}
