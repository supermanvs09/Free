package identitygraph

import (
	"context"
	"time"

	"nhi-backend-api/internal/identitygraph/eventstore"
)

// fakeActivity is an in-memory ActivitySource for unit tests.
type FakeActivity struct {
	IsAvailable  bool
	degraded     bool
	Seen         map[string]time.Time
	CreatorByARN map[string]string
	Used         map[string][]eventstore.UsedAction
	perms        []eventstore.UsedPermission
	edges        []eventstore.AccessEdge

	SeenCalls int
	LastSince time.Time // the "since" the most recent windowed call used
}

func (f *FakeActivity) Available() bool { return f.IsAvailable }
func (f *FakeActivity) Degraded() bool  { return f.degraded }
func (f *FakeActivity) LastSeen(_ context.Context, keys []string) map[string]time.Time {
	f.SeenCalls++
	out := map[string]time.Time{}
	for _, k := range keys {
		if t, ok := f.Seen[k]; ok {
			out[k] = t
		}
	}
	return out
}
func (f *FakeActivity) Creators(_ context.Context, arns []string) map[string]string {
	out := map[string]string{}
	for _, a := range arns {
		if c, ok := f.CreatorByARN[a]; ok {
			out[a] = c
		}
	}
	return out
}
func (f *FakeActivity) UsedActionSets(_ context.Context, keys []string, since time.Time) map[string][]eventstore.UsedAction {
	f.LastSince = since
	out := map[string][]eventstore.UsedAction{}
	for _, k := range keys {
		if u, ok := f.Used[k]; ok {
			out[k] = u
		}
	}
	return out
}
func (f *FakeActivity) UsedPermissions(_ context.Context, _ []string, since time.Time) []eventstore.UsedPermission {
	f.LastSince = since
	return f.perms
}
func (f *FakeActivity) AccessEdges(_ context.Context, _ []string, since, _ time.Time) []eventstore.AccessEdge {
	f.LastSince = since
	return f.edges
}

func (f *FakeActivity) AccountVolume(context.Context, []string, time.Time) ([]eventstore.VolumePoint, bool) {
	return nil, false
}

var _ ActivitySource = (*FakeActivity)(nil)

var TestNow = time.Date(2026, 10, 13, 12, 0, 0, 0, time.UTC)

func Intp(v int) *int { return &v }
