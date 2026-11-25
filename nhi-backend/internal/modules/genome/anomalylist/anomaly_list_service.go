package anomalylist

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"nhi-backend-api/internal/modules/genome/common"
)

const (
	severityBatchSize      = 1000
	maxSeverityAggregation = 50000
)

// Service implements GET /api/v1/genome/anomalies.
type Service struct {
	lookup *common.MonitoredIdentityLookup
	repo   *Repository
	events *common.MonitoringEvents
}

func NewService(
	lookup *common.MonitoredIdentityLookup,
	repo *Repository,
	events *common.MonitoringEvents,
) *Service {
	return &Service{
		lookup: lookup,
		repo:   repo,
		events: events,
	}
}

type Params struct {
	Severity     string
	Dimension    string
	State        string
	SourceType   string
	IdentityName string
	EventID      string
	Search       string

	From *time.Time
	To   *time.Time

	Page   int
	Limit  int
	Cursor string
}

func (s *Service) List(
	ctx context.Context,
	userID string,
	tenantID string,
	dbName string,
	p Params,
) (*Response, *string, error) {
	if p.Page < 1 {
		p.Page = 1
	}
	if p.Limit < 1 {
		p.Limit = 25
	}
	if p.Limit > 100 {
		p.Limit = 100
	}

	after, err := decodeCursor(p.Cursor)
	if err != nil {
		return nil, nil, err
	}

	sc, fleet, err := s.lookup.Fleet(
		ctx,
		userID,
		tenantID,
		dbName,
	)
	if err != nil {
		return nil, nil, err
	}

	set := common.NewIdentityIndex(fleet)
	filter := Filter{
		Dimension:    p.Dimension,
		Status:       p.State,
		SourceType:   p.SourceType,
		IdentityName: p.IdentityName,
		EventID:      p.EventID,
		Search:       p.Search,
		From:         p.From,
		To:           p.To,
		After:        after,
		Accounts:     sc.AccountIDs,
	}

	if p.Cursor == "" {
		filter.Offset = (p.Page - 1) * p.Limit
	}

	if p.Search != "" {
		needle := strings.ToLower(strings.TrimSpace(p.Search))
		for _, identity := range fleet {
			if strings.Contains(
				strings.ToLower(identity.DisplayName),
				needle,
			) {
				filter.SearchKeys = append(
					filter.SearchKeys,
					identity.AllKeys()...,
				)
			}
		}
	}

	postgresTotal, err := s.repo.Count(ctx, sc, filter)
	if err != nil {
		return nil, nil, &common.StoreUnavailableError{
			Op:  "count alerts",
			Err: err,
		}
	}

	if postgresTotal > maxSeverityAggregation {
		return nil, nil, &common.StoreUnavailableError{
			Op: "severity aggregation",
			Err: fmt.Errorf(
				"filtered anomaly count %d exceeds aggregation limit %d; narrow the filters",
				postgresTotal,
				maxSeverityAggregation,
			),
		}
	}

	// Severity is a property of the latest ClickHouse event result, not the
	// PostgreSQL alert row. Load the complete filtered alert population so the
	// severity filter, totals and page count describe the same result set.
	allRows, err := s.repo.All(
		ctx,
		sc,
		filter,
		maxSeverityAggregation+1,
	)
	if err != nil {
		return nil, nil, &common.StoreUnavailableError{
			Op:  "read alerts for severity aggregation",
			Err: err,
		}
	}
	// Exclude alerts whose identity key is not backed by a live inventory
	// identity. Do this before severity counts, filtering and pagination.
	mappedRows := allRows[:0]
	for _, alert := range allRows {
		if _, mapped := set.IndexOf(alert.Key); !mapped {
			continue
		}
		mappedRows = append(mappedRows, alert)
	}
	allRows = mappedRows
	postgresTotal = len(allRows)

	if len(allRows) > maxSeverityAggregation {
		return nil, nil, &common.StoreUnavailableError{
			Op: "severity aggregation",
			Err: fmt.Errorf(
				"filtered anomaly count exceeds aggregation limit %d; narrow the filters",
				maxSeverityAggregation,
			),
		}
	}

	riskEvents, err := s.alertRiskEvents(ctx, allRows)
	if err != nil {
		return nil, nil, &common.StoreUnavailableError{
			Op:  "read latest anomaly risk events",
			Err: err,
		}
	}

	severityCounts := SeverityCounts{}

	filteredItems := make(
		[]Item,
		0,
		len(allRows),
	)

	for _, alert := range allRows {
		eventID := strings.TrimSpace(
			alert.EventID,
		)

		riskEvent, found :=
			riskEvents[eventID]

		item := listItem(
			alert,
			riskEvent,
			found,
			set,
		)

		// Severity counts are alert-row counts. Several alert rows may share
		// one event_id when one event violates multiple baseline dimensions.
		addSeverity(
			&severityCounts,
			item.Severity,
		)

		if p.Severity != "" {
			if item.Severity == nil ||
				!strings.EqualFold(
					strings.TrimSpace(
						*item.Severity,
					),
					p.Severity,
				) {
				continue
			}
		}

		filteredItems = append(
			filteredItems,
			item,
		)
	}
	totalCount := len(filteredItems)
	pageCount := 0
	if totalCount > 0 {
		pageCount = (totalCount + p.Limit - 1) / p.Limit
	}

	start := (p.Page - 1) * p.Limit
	pageItems := []Item{}
	if start < totalCount {
		end := start + p.Limit
		if end > totalCount {
			end = totalCount
		}
		pageItems = filteredItems[start:end]
	}

	out := &Response{
		Items:          pageItems,
		Page:           p.Page,
		Limit:          p.Limit,
		PageCount:      pageCount,
		TotalCount:     totalCount,
		SeverityCounts: severityCounts,
	}

	if budgetErr := common.BudgetExceeded(ctx, "anomaly list"); budgetErr != nil {
		return nil, nil, budgetErr
	}

	// Page-number pagination is authoritative. Cursor remains accepted by the
	// handler for backward compatibility, but this response does not emit one.
	return out, nil, nil
}

func (s *Service) alertRiskEvents(
	ctx context.Context,
	alerts []common.AlertRow,
) (map[string]common.AlertRiskEvent, error) {
	result := make(map[string]common.AlertRiskEvent)
	eventIDs := uniqueAlertEventIDs(alerts)

	if len(eventIDs) == 0 {
		return result, nil
	}
	if s.events == nil || !s.events.Enabled() {
		return nil, fmt.Errorf("clickhouse monitoring events are unavailable")
	}

	for start := 0; start < len(eventIDs); start += severityBatchSize {
		end := start + severityBatchSize
		if end > len(eventIDs) {
			end = len(eventIDs)
		}

		batch, err := s.events.AlertRiskEvents(
			ctx,
			eventIDs[start:end],
		)
		if err != nil {
			return nil, err
		}

		for eventID, event := range batch {
			result[strings.TrimSpace(eventID)] = event
		}
	}

	return result, nil
}
func listItem(
	alert common.AlertRow,
	riskEvent common.AlertRiskEvent,
	riskEventFound bool,
	set *common.IdentityIndex,
) Item {
	var region *string

	if riskEventFound {
		value := strings.TrimSpace(
			riskEvent.Region,
		)

		if value != "" {
			region = &value
		}
	}

	return Item{
		ID: alert.ID,

		EventID: strings.TrimSpace(
			alert.EventID,
		),

		Identity: common.AnomalyIdentityRefFor(
			alert,
			set,
		),

		WhatChanged: common.WhatChangedText(
			alert,
		),

		Dimension: alert.Dimension,

		Severity: latestSeverity(
			riskEvent,
			riskEventFound,
		),

		State: alert.Status,

		DetectedAt: alert.CreatedAt,

		Region: region,
	}
}
func uniqueAlertEventIDs(alerts []common.AlertRow) []string {
	seen := make(map[string]struct{}, len(alerts))
	eventIDs := make([]string, 0, len(alerts))

	for _, alert := range alerts {
		eventID := strings.TrimSpace(alert.EventID)
		if eventID == "" {
			continue
		}
		if _, exists := seen[eventID]; exists {
			continue
		}
		seen[eventID] = struct{}{}
		eventIDs = append(eventIDs, eventID)
	}

	return eventIDs
}

func latestSeverity(
	event common.AlertRiskEvent,
	found bool,
) *string {
	if !found {
		return nil
	}

	severity := strings.TrimSpace(
		event.EventRiskSeverity,
	)

	switch {
	case strings.EqualFold(
		severity,
		"Critical",
	):
		value := "Critical"
		return &value

	case strings.EqualFold(
		severity,
		"High",
	):
		value := "High"
		return &value

	case strings.EqualFold(
		severity,
		"Medium",
	):
		value := "Medium"
		return &value

	case strings.EqualFold(
		severity,
		"Low",
	):
		value := "Low"
		return &value

	case strings.EqualFold(
		severity,
		"Pending",
	):
		value := "Pending"
		return &value

	case strings.EqualFold(
		severity,
		"Unknown",
	):
		value := "Unknown"
		return &value

	default:
		return nil
	}
}

func addSeverity(
	counts *SeverityCounts,
	severity *string,
) {
	if severity == nil {
		counts.Unknown++
		return
	}

	switch {
	case strings.EqualFold(
		*severity,
		"Critical",
	):
		counts.Critical++

	case strings.EqualFold(
		*severity,
		"High",
	):
		counts.High++

	case strings.EqualFold(
		*severity,
		"Medium",
	):
		counts.Medium++

	case strings.EqualFold(
		*severity,
		"Low",
	):
		counts.Low++

	case strings.EqualFold(
		*severity,
		"Pending",
	):
		counts.Pending++

	case strings.EqualFold(
		*severity,
		"Unknown",
	):
		counts.Unknown++

	default:
		counts.Unknown++
	}
}

type cursorPayload struct {
	CreatedAt string `json:"t"`
	ID        int64  `json:"i"`
}

func encodeCursor(c common.AlertCursor) *string {
	raw, _ := json.Marshal(cursorPayload{
		CreatedAt: c.CreatedAt.UTC().Format(time.RFC3339Nano),
		ID:        c.ID,
	})
	value := base64.RawURLEncoding.EncodeToString(raw)
	return &value
}

func decodeCursor(value string) (*common.AlertCursor, error) {
	if value == "" {
		return nil, nil
	}

	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return nil, common.ErrInvalidCursor
	}

	var payload cursorPayload
	if err := json.Unmarshal(raw, &payload); err != nil || payload.ID < 1 {
		return nil, common.ErrInvalidCursor
	}

	createdAt, err := time.Parse(time.RFC3339Nano, payload.CreatedAt)
	if err != nil {
		return nil, common.ErrInvalidCursor
	}

	return &common.AlertCursor{
		CreatedAt: createdAt.UTC(),
		ID:        payload.ID,
	}, nil
}
