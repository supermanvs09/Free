package identitytimeline

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"nhi-backend-api/internal/modules/genome/summarycommon"
)

// IdentityTimelineService implements
// GET /api/v1/identities/{source_type}/{identity_name}/timeline
// (backend_api_contract.md §5.6 / §10.3) — the lifecycle timeline derived
// from the current tables, newest first:
//
//   - anomaly                     alerts grouped per window_end, dimension and status
//     (occurred_at = window_end), titled "N active anomalies" while open
//   - baseline_version_published  one item per version      (baseline_versions.published_at)
//   - learning_started            baselines.first_seen_date
//   - baseline_established        baselines.active_since
//
// The identity is resolved from the tenant's discovery table first (unknown
// → ErrIdentityNotFound). Nothing is invented: a source table that cannot
// be read contributes no items (logged server-side); the milestones exist
// only when the baselines row carries the timestamp.
type IdentityTimelineService struct {
	lookup *summarycommon.MonitoredIdentityLookup
	repo   *IdentityTimelineRepository
}

// NewIdentityTimelineService wires the service.
func NewIdentityTimelineService(lookup *summarycommon.MonitoredIdentityLookup, repo *IdentityTimelineRepository) *IdentityTimelineService {
	return &IdentityTimelineService{lookup: lookup, repo: repo}
}

// IdentityTimelineParams are the parsed §5.6 query parameters.
type IdentityTimelineParams struct {
	Limit  int    // §2 page size: default 25, max 100
	Cursor string // opaque, from a previous meta.next_cursor; "" for the first page
}

// Display titles per item type (§10.3: "API display text from the timeline type").
var timelineTitles = map[string]string{
	TimelineTypeAnomalyDimension:         "Anomalies by dimension",
	TimelineTypeBaselineVersionPublished: "Baseline version published",
	TimelineTypeLearningStarted:          "Learning started",
	TimelineTypeBaselineEstablished:      "Baseline established",
}

// GetTimeline builds the §5.6 page and the meta.next_cursor (nil on the
// last page). Unknown identities are ErrIdentityNotFound, scope/discovery
// failures *StoreUnavailableError, a foreign cursor ErrInvalidCursor.
func (s *IdentityTimelineService) GetTimeline(ctx context.Context, userID, tenantID, dbName, sourceType, identityName string, p IdentityTimelineParams) (*IdentityTimelineResponse, *string, error) {
	after, err := decodeTimelineCursor(p.Cursor)
	if err != nil {
		return nil, nil, err
	}
	res, err := s.lookup.Resolve(ctx, userID, tenantID, dbName, sourceType, identityName)
	if err != nil {
		return nil, nil, err
	}
	id, sc := res.Identity, res.Scope
	keys := id.AllKeys() // identity key, then the shared workload key

	var entries []timelineEntry
	if dimensions, err :=
		s.repo.AlertDimensions(
			ctx,
			sc,
			keys,
		); summarycommon.ReadOK(
		ctx,
		"identity timeline alert dimensions",
		err,
	) {
		entries = append(
			entries,
			anomalyDimensionEntries(
				dimensions,
			)...,
		)
	}
	versionsKey := id.Key
	if row, err := s.repo.BaselineMilestones(ctx, sc, keys); summarycommon.ReadOK(ctx, "identity timeline baseline", err) && row != nil {
		versionsKey = row.Key
		if row.FirstSeenDate != nil {
			entries = append(entries, milestone(TimelineTypeLearningStarted, *row.FirstSeenDate))
		}
		if row.ActiveSince != nil {
			entries = append(entries, milestone(TimelineTypeBaselineEstablished, *row.ActiveSince))
		}
	}
	if versions, err := s.repo.PublishedVersions(ctx, sc, versionsKey); summarycommon.ReadOK(ctx, "identity timeline versions", err) {
		for _, v := range versions {
			desc := "Version " + strconv.FormatInt(v.Version, 10)
			entries = append(entries, timelineEntry{
				key: timelineKey{At: v.PublishedAt.UnixMilli(), Type: TimelineTypeBaselineVersionPublished, Ref: strconv.FormatInt(v.Version, 10)},
				item: IdentityTimelineItem{Type: TimelineTypeBaselineVersionPublished, Title: timelineTitles[TimelineTypeBaselineVersionPublished],
					Description: &desc, OccurredAt: v.PublishedAt},
			})
		}
	}

	sort.SliceStable(entries, func(i, j int) bool { return compareTimelineKeys(entries[i].key, entries[j].key) < 0 })
	if after != nil {
		cut := sort.Search(len(entries), func(i int) bool { return compareTimelineKeys(entries[i].key, *after) > 0 })
		entries = entries[cut:]
	}
	var next *string
	if len(entries) > p.Limit {
		entries = entries[:p.Limit]
		next = encodeTimelineCursor(entries[len(entries)-1].key)
	}
	out := &IdentityTimelineResponse{Items: make([]IdentityTimelineItem, 0, len(entries))}
	for _, e := range entries {
		out.Items = append(out.Items, e.item)
	}
	return out, next, nil
}

// anomalyEntries groups alerts raised by the same detection window for the
// same dimension and status into one item: one window usually raises several
// alerts on one dimension, and the reviewer reads them as one departure.
// alerts arrive newest first; the group's Ref is its newest alert id.
func anomalyDimensionEntries(
	rows []TimelineDimensionRow,
) []timelineEntry {
	output := make(
		[]timelineEntry,
		0,
		len(rows),
	)

	for _, row := range rows {
		dimension := strings.TrimSpace(
			row.Dimension,
		)

		count := row.AlertCount
		openCount := row.OpenCount
		latestAlertID := row.LatestAlertID

		status := "closed"
		if openCount > 0 {
			status = "open"
		}

		title := fmt.Sprintf(
			"%d %s %s",
			count,
			dimension,
			plural(
				int(count),
				"anomaly",
				"anomalies",
			),
		)

		var description *string

		if reason := strings.TrimSpace(
			row.LatestReason,
		); reason != "" {
			value := "Latest reason: " + reason
			description = &value
		}

		output = append(
			output,
			timelineEntry{
				key: timelineKey{
					At: row.LatestOccurredAt.
						UnixMilli(),
					Type: TimelineTypeAnomalyDimension,
					Ref: strconv.FormatInt(
						latestAlertID,
						10,
					),
				},
				item: IdentityTimelineItem{
					Type:          TimelineTypeAnomalyDimension,
					Title:         title,
					Description:   description,
					OccurredAt:    row.LatestOccurredAt,
					Status:        &status,
					Dimension:     &dimension,
					Count:         &count,
					OpenCount:     &openCount,
					LatestAlertID: &latestAlertID,
				},
			},
		)
	}

	return output
}

// anomalyTitle: "1 active anomaly", "3 active anomalies", "2 resolved anomalies".
func anomalyTitle(n int, status string) string {
	state := "active"
	if status != "" && status != "open" {
		state = strings.ReplaceAll(status, "_", " ")
	}
	return fmt.Sprintf("%d %s %s", n, state, plural(n, "anomaly", "anomalies"))
}

func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

// milestone builds a baselines-derived item (no description, no status).
func milestone(typ string, at time.Time) timelineEntry {
	return timelineEntry{
		key:  timelineKey{At: at.UnixMilli(), Type: typ},
		item: IdentityTimelineItem{Type: typ, Title: timelineTitles[typ], OccurredAt: at},
	}
}

// ---------------------------------------------------------------------------
// ordering and the keyset cursor
// ---------------------------------------------------------------------------

// timelineEntry is one item with its total-order key.
type timelineEntry struct {
	key  timelineKey
	item IdentityTimelineItem
}

// timelineKey orders items: occurred_at descending, then type, then the
// source row reference (alert id / version) descending — a total order,
// so a keyset cursor can resume it.
type timelineKey struct {
	At   int64  `json:"t"` // occurred_at, unix milliseconds
	Type string `json:"k"`
	Ref  string `json:"r,omitempty"`
}

func compareTimelineKeys(a, b timelineKey) int {
	switch {
	case a.At != b.At:
		if a.At > b.At {
			return -1
		}
		return 1
	case a.Type != b.Type:
		return strings.Compare(a.Type, b.Type)
	}
	ra, ea := strconv.ParseInt(a.Ref, 10, 64)
	rb, eb := strconv.ParseInt(b.Ref, 10, 64)
	if ea == nil && eb == nil {
		switch {
		case ra > rb:
			return -1
		case ra < rb:
			return 1
		}
		return 0
	}
	return -strings.Compare(a.Ref, b.Ref)
}

func encodeTimelineCursor(k timelineKey) *string {
	raw, _ := json.Marshal(k)
	s := base64.RawURLEncoding.EncodeToString(raw)
	return &s
}

func decodeTimelineCursor(s string) (*timelineKey, error) {
	if s == "" {
		return nil, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return nil, summarycommon.ErrInvalidCursor
	}
	var k timelineKey
	if err := json.Unmarshal(raw, &k); err != nil || timelineTitles[k.Type] == "" {
		return nil, summarycommon.ErrInvalidCursor
	}
	return &k, nil
}
