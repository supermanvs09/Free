package identitycontainment

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/netip"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"nhi-backend-api/internal/modules/genome/common"
	"nhi-backend-api/internal/platform/scope"
)

var (
	ErrBaselineNotEstablished = errors.New("identity baseline is not established")
	errUnsupportedDimension   = errors.New("unsupported containment dimension")
	errNoEnforceablePolicy    = errors.New("no enforceable containment policy")
)

var iamActionPattern = regexp.MustCompile(`^[a-z0-9-]+:[A-Za-z0-9*?]+$`)
var iamServicePattern = regexp.MustCompile(`^[a-z0-9-]+$`)

var operationActionOverrides = map[string]string{
	"lambda.amazonaws.com:Invoke": "lambda:InvokeFunction",
}

type RepositoryReader interface {
	EstablishedBaseline(context.Context, *scope.DataScope, []common.MonitoringKey, string) (*BaselineRow, error)
	OpenAlerts(context.Context, *scope.DataScope, []common.MonitoringKey, string) ([]AlertRow, error)
}

type EventEvidenceReader interface {
	EventsByID(context.Context, []string) (map[string]common.AlertEventRow, error)
}

type Service struct {
	lookup *common.MonitoredIdentityLookup
	repo   RepositoryReader
	events EventEvidenceReader
	now    func() time.Time
}

func NewService(lookup *common.MonitoredIdentityLookup, repo RepositoryReader, events EventEvidenceReader) *Service {
	return &Service{lookup: lookup, repo: repo, events: events, now: func() time.Time { return time.Now().UTC() }}
}

func (s *Service) Get(
	ctx context.Context,
	userID string,
	tenantID string,
	dbName string,
	sourceType string,
	identityName string,
) (*Response, error) {
	resolved, err := s.lookup.Resolve(
		ctx,
		userID,
		tenantID,
		dbName,
		sourceType,
		identityName,
	)
	if err != nil {
		return nil, err
	}

	keys := resolved.Identity.AllKeys()
	accountID := resolved.Identity.AccountID

	baseline, err := s.repo.EstablishedBaseline(
		ctx,
		resolved.Scope,
		keys,
		accountID,
	)
	if err != nil {
		return nil, &common.StoreUnavailableError{
			Op:  "read identity containment baseline",
			Err: err,
		}
	}
	if baseline == nil {
		return nil, ErrBaselineNotEstablished
	}

	alerts, err := s.repo.OpenAlerts(
		ctx,
		resolved.Scope,
		keys,
		accountID,
	)
	if err != nil {
		return nil, &common.StoreUnavailableError{
			Op:  "read identity containment alerts",
			Err: err,
		}
	}

	clickHouseEvents := s.loadAlertEvents(
		ctx,
		alerts,
		accountID,
		keys,
	)

	items := make([]Item, 0, len(alerts))
	skipped := make([]SkippedAlert, 0)
	now := s.now().UTC()

	for _, alert := range alerts {
		evidence := evidenceFromAlert(alert)
		evidenceSource := "postgresql"

		eventID := strings.TrimSpace(alert.EventID)
		if event, ok := clickHouseEvents[eventID]; ok {
			evidence = mergeClickHouseEvidence(
				evidence,
				event,
			)
			evidenceSource = "postgresql+clickhouse"
		}

		item, generationErr := generateRemediation(
			*baseline,
			alert,
			evidence,
			evidenceSource,
			now,
		)

		switch {
		case errors.Is(generationErr, errUnsupportedDimension):
			log.Printf(
				"identity containment skipped alert_id=%d event_id=%s dimension=%s reason=unsupported_dimension",
				alert.ID,
				alert.EventID,
				alert.Dimension,
			)
			skipped = append(skipped, SkippedAlert{
				AlertID:   alert.ID,
				Dimension: normalizeDimension(alert.Dimension),
				Reason:    "unsupported_dimension",
			})
			continue

		case errors.Is(generationErr, errNoEnforceablePolicy):
			log.Printf(
				"identity containment skipped alert_id=%d event_id=%s dimension=%s reason=insufficient_remediation_evidence",
				alert.ID,
				alert.EventID,
				alert.Dimension,
			)
			skipped = append(skipped, SkippedAlert{
				AlertID:   alert.ID,
				Dimension: normalizeDimension(alert.Dimension),
				Reason:    "insufficient_remediation_evidence",
			})
			continue

		case generationErr != nil:
			// One alert whose stored values cannot be read (an empty or
			// unexpected baseline_value/observed_value) must not fail the
			// whole page: it is reported as skipped, like any alert without
			// enough evidence for a policy.
			log.Printf(
				"identity containment skipped alert_id=%d event_id=%s dimension=%s reason=unreadable_alert_data err=%v",
				alert.ID,
				alert.EventID,
				alert.Dimension,
				generationErr,
			)
			skipped = append(skipped, SkippedAlert{
				AlertID:   alert.ID,
				Dimension: normalizeDimension(alert.Dimension),
				Reason:    "insufficient_remediation_evidence",
			})
			continue
		}

		items = append(items, item)
	}

	if err := common.BudgetExceeded(
		ctx,
		"identity containment",
	); err != nil {
		return nil, err
	}

	return &Response{
		OpenAlertCount:       len(alerts),
		GeneratedPolicyCount: len(items),
		SkippedAlertCount:    len(skipped),
		SkippedAlerts:        skipped,
		Items:                items,
	}, nil
}

func (s *Service) loadAlertEvents(ctx context.Context, alerts []AlertRow, accountID string, keys []common.MonitoringKey) map[string]common.AlertEventRow {
	out := map[string]common.AlertEventRow{}
	if s.events == nil || len(alerts) == 0 {
		return out
	}
	alertByID := make(map[string]AlertRow, len(alerts))
	ids := make([]string, 0, len(alerts))
	for _, alert := range alerts {
		id := strings.TrimSpace(alert.EventID)
		if id == "" {
			continue
		}
		if _, exists := alertByID[id]; exists {
			continue
		}
		alertByID[id] = alert
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return out
	}
	rows, err := s.events.EventsByID(ctx, ids)
	if err != nil {
		log.Printf("identity containment ClickHouse enrichment failed event_count=%d err=%v", len(ids), err)
		return out
	}
	for id, event := range rows {
		alert, ok := alertByID[id]
		if !ok || !clickHouseEventMatches(event, alert, accountID, keys) {
			log.Printf("identity containment ignored mismatched ClickHouse event_id=%s account_id=%s source_type=%s identity_name=%s", id, event.AccountID, event.SourceType, event.IdentityName)
			continue
		}
		out[id] = event
	}
	return out
}

func clickHouseEventMatches(
	event common.AlertEventRow,
	alert AlertRow,
	accountID string,
	keys []common.MonitoringKey,
) bool {
	if strings.TrimSpace(event.EventID) != strings.TrimSpace(alert.EventID) {
		return false
	}
	if strings.TrimSpace(event.AccountID) != strings.TrimSpace(accountID) {
		return false
	}

	eventSourceType := strings.ToUpper(strings.TrimSpace(event.SourceType))
	eventIdentityName := strings.TrimSpace(event.IdentityName)
	identityMatched := false

	for _, key := range keys {
		if strings.ToUpper(strings.TrimSpace(key.SourceType)) == eventSourceType &&
			strings.TrimSpace(key.IdentityName) == eventIdentityName {
			identityMatched = true
			break
		}
	}
	if !identityMatched {
		return false
	}

	const eventWindowTolerance = time.Minute
	eventTime := event.EventTime.UTC()

	if alert.WindowStart.Valid {
		earliest := alert.WindowStart.Time.UTC().Add(-eventWindowTolerance)
		if eventTime.Before(earliest) {
			return false
		}
	}
	if alert.WindowEnd.Valid {
		latest := alert.WindowEnd.Time.UTC().Add(eventWindowTolerance)
		if !eventTime.Before(latest) {
			return false
		}
	}

	return true
}

func mergeClickHouseEvidence(
	evidence EventEvidence,
	row common.AlertEventRow,
) EventEvidence {
	if evidence.EventID == "" {
		evidence.EventID = strings.TrimSpace(row.EventID)
	}
	if evidence.EventSource == "" {
		evidence.EventSource = strings.TrimSpace(row.EventSource)
	}
	if evidence.EventName == "" {
		evidence.EventName = strings.TrimSpace(row.EventName)
	}
	if evidence.AWSRegion == "" {
		evidence.AWSRegion = strings.TrimSpace(row.Region)
	}
	if evidence.SourceIP == "" {
		evidence.SourceIP = strings.TrimSpace(row.SourceIP)
	}
	if evidence.UserAgent == "" {
		evidence.UserAgent = strings.TrimSpace(row.UserAgent)
	}
	if evidence.RoleARN == "" {
		evidence.RoleARN = strings.TrimSpace(row.RoleARN)
	}
	if evidence.PrincipalARN == "" {
		evidence.PrincipalARN = strings.TrimSpace(row.RoleARN)
	}
	if len(evidence.ResourceARNs) == 0 {
		evidence.ResourceARNs = splitResourceARNs(row.ResourceARNs)
	}
	if evidence.EventTime.IsZero() {
		evidence.EventTime = row.EventTime.UTC()
	}

	mergeRequestParameters(&evidence, row.RequestParameters)
	return evidence
}

func mergeRequestParameters(
	evidence *EventEvidence,
	raw string,
) {
	raw = strings.TrimSpace(raw)
	if evidence == nil || raw == "" || !json.Valid([]byte(raw)) {
		return
	}

	evidence.RequestParameters = json.RawMessage(raw)

	var parameters map[string]any
	if err := json.Unmarshal([]byte(raw), &parameters); err != nil {
		return
	}

	if evidence.SourceARN == "" {
		evidence.SourceARN = firstMapString(
			parameters,
			"sourceArn",
			"source_arn",
			"SourceArn",
		)
	}
	if evidence.SourceAccount == "" {
		evidence.SourceAccount = firstMapString(
			parameters,
			"sourceAccount",
			"source_account",
			"SourceAccount",
		)
	}
}

func firstMapString(
	values map[string]any,
	keys ...string,
) string {
	for _, key := range keys {
		raw, exists := values[key]
		if !exists {
			continue
		}
		value, ok := raw.(string)
		if !ok {
			continue
		}
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}

func splitResourceARNs(value string) []string {
	return uniqueStrings(strings.Split(value, ","))
}

func generateRemediation(
	baseline BaselineRow,
	alert AlertRow,
	evidence EventEvidence,
	evidenceSource string,
	now time.Time,
) (Item, error) {
	if item, ok := generateServiceRemediation(
		alert,
		evidence,
		evidenceSource,
		now,
	); ok {
		return item, nil
	}

	description, document, err := generatePolicy(
		baseline,
		alert,
		evidence,
		now,
	)
	if err != nil {
		return Item{}, err
	}

	targetARN := firstNonEmpty(
		evidence.RoleARN,
		evidence.PrincipalARN,
	)
	if targetARN == "" {
		return Item{}, errNoEnforceablePolicy
	}

	targetType := "iam_role"
	applyAction := "put_inline_role_policy"
	rollbackAction := "delete_inline_role_policy"
	if strings.Contains(targetARN, ":user/") {
		targetType = "iam_user"
		applyAction = "put_inline_user_policy"
		rollbackAction = "delete_inline_user_policy"
	}

	policyName := containmentPolicyName(alert.ID, alert.Dimension)
	expiresAt := now.Add(time.Hour).UTC()
	enforcement := description.Enforcement
	enforcement.RequiresApproval = true
	enforcement.ExpiresAt = &expiresAt

	return Item{
		AlertID:        alert.ID,
		Dimension:      normalizeDimension(alert.Dimension),
		Title:          description.Title,
		Reason:         alert.Reason,
		Confidence:     normalizeScore(alert.Score),
		EvidenceSource: evidenceSource,
		Enforcement:    enforcement,
		Remediation: Remediation{
			Type: "identity_policy",
			Target: Target{
				Type:      targetType,
				ARN:       targetARN,
				Name:      arnResourceName(targetARN),
				Region:    evidence.AWSRegion,
				AccountID: alert.AccountID,
			},
			Apply: Apply{
				Action:     applyAction,
				AttachAs:   "inline",
				PolicyName: policyName,
			},
			Rollback: Rollback{
				Action:     rollbackAction,
				PolicyName: policyName,
			},
			PolicyDocument: &document,
		},
	}, nil
}

func generateServiceRemediation(
	alert AlertRow,
	evidence EventEvidence,
	evidenceSource string,
	now time.Time,
) (Item, bool) {
	if normalizeDimension(alert.Dimension) != "frequency" ||
		!strings.EqualFold(strings.TrimSpace(evidence.EventSource), "lambda.amazonaws.com") ||
		!strings.EqualFold(strings.TrimSpace(evidence.EventName), "Invoke") ||
		!strings.EqualFold(strings.TrimSpace(evidence.SourceIP), "events.amazonaws.com") {
		return Item{}, false
	}

	sourceARN := strings.TrimSpace(evidence.SourceARN)
	if !strings.HasPrefix(sourceARN, "arn:aws:events:") {
		return Item{}, false
	}

	expiresAt := now.Add(time.Hour).UTC()
	return Item{
		AlertID:        alert.ID,
		Dimension:      normalizeDimension(alert.Dimension),
		Title:          "contain-lambda-invocation-frequency-anomaly",
		Reason:         alert.Reason,
		Confidence:     normalizeScore(alert.Score),
		EvidenceSource: evidenceSource,
		Enforcement: Enforcement{
			Type:                     EnforcementTemporaryCorrelated,
			BlocksTriggeringBehavior: true,
			RequiresApproval:         true,
			ExpiresAt:                &expiresAt,
			Limitation: "Disabling the rule stops all invocations " +
				"from the rule until rollback.",
		},
		Remediation: Remediation{
			Type: "disable_eventbridge_rule",
			Target: Target{
				Type:   "eventbridge_rule",
				ARN:    sourceARN,
				Name:   arnResourceName(sourceARN),
				Region: evidence.AWSRegion,
				AccountID: firstNonEmpty(
					evidence.SourceAccount,
					alert.AccountID,
				),
			},
			Apply: Apply{
				Action:   "disable_eventbridge_rule",
				AttachAs: "service_action",
			},
			Rollback: Rollback{
				Action: "enable_eventbridge_rule",
			},
			PolicyDocument: nil,
		},
	}, true
}

func containmentPolicyName(alertID int64, dimension string) string {
	dimension = strings.ReplaceAll(normalizeDimension(dimension), "_", "-")
	return fmt.Sprintf("nhi-containment-%d-%s", alertID, dimension)
}

func arnResourceName(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if index := strings.LastIndexByte(value, '/'); index >= 0 {
		return value[index+1:]
	}
	if index := strings.LastIndexByte(value, ':'); index >= 0 {
		return value[index+1:]
	}
	return value
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}

func generatePolicy(b BaselineRow, a AlertRow, e EventEvidence, now time.Time) (PolicyDescription, PolicyDocument, error) {
	switch normalizeDimension(a.Dimension) {
	case "region":
		return generateRegionPolicy(b, a)
	case "source_ip":
		return generateSourceIPPolicy(b, a)
	case "api_operation":
		return generateOperationPolicy(a, e, "deny-new-api-operation", "Blocks the API operation that triggered the anomaly.", EnforcementDirect)
	case "api_service":
		return generateServicePolicy(a, e)
	case "read_write":
		return generateOperationPolicy(a, e, "deny-unexpected-write-operation", "Blocks the concrete API operation that triggered the read/write anomaly.", EnforcementDirect)
	case "resource_pattern", "resource_type":
		return generateResourcePolicy(a, e)
	case "hour_of_week_utc":
		return generateSchedulePolicy(b, a, now)
	case "frequency":
		return generateFrequencyPolicy(a, e)
	case "source_network_class":
		return generateNetworkPolicy(a, e)
	case "user_agent_family":
		return generateUserAgentPolicy(a, e)
	case "error_code", "result", "event_category":
		return generateEvidenceBasedPolicy(a, e)
	case "issuer_type", "cross_account":
		return PolicyDescription{}, PolicyDocument{}, errNoEnforceablePolicy
	default:
		return PolicyDescription{}, PolicyDocument{}, fmt.Errorf("%w: %s", errUnsupportedDimension, a.Dimension)
	}
}

func generateRegionPolicy(b BaselineRow, a AlertRow) (PolicyDescription, PolicyDocument, error) {
	values, err := baselineValues(b, a)
	if err != nil {
		return PolicyDescription{}, PolicyDocument{}, fmt.Errorf("read baseline regions: %w", err)
	}
	regions := normalizeRegions(values)
	if len(regions) == 0 {
		return PolicyDescription{}, PolicyDocument{}, errNoEnforceablePolicy
	}
	d := PolicyDescription{Category: CategoryExactMatch, Title: "deny-regions-out-of-baseline", Enforcement: Enforcement{Type: EnforcementDirect, BlocksTriggeringBehavior: true, RequiresApproval: true}, WhatItDoes: "Blocks requests outside the established baseline regions.", WhatItCosts: "Legitimate activity in a new region will also be blocked."}
	p := PolicyDocument{Version: "2012-10-17", Statement: []PolicyStatement{{Sid: fmt.Sprintf("DenyOutOfBaselineRegion_%d", a.ID), Effect: "Deny", Action: "*", Resource: "*", Condition: map[string]any{"Null": map[string]string{"aws:RequestedRegion": "false"}, "StringNotEquals": map[string]any{"aws:RequestedRegion": regions}}}}}
	return d, p, nil
}

func generateSourceIPPolicy(b BaselineRow, a AlertRow) (PolicyDescription, PolicyDocument, error) {
	values, err := baselineValues(b, a)
	if err != nil {
		return PolicyDescription{}, PolicyDocument{}, fmt.Errorf("read baseline source IPs: %w", err)
	}
	cidrs, err := normalizeCIDRs(values)
	if err != nil || len(cidrs) == 0 {
		return PolicyDescription{}, PolicyDocument{}, errNoEnforceablePolicy
	}
	d := PolicyDescription{Category: CategoryExactMatch, Title: "deny-source-ip-out-of-baseline", Enforcement: Enforcement{Type: EnforcementDirect, BlocksTriggeringBehavior: true, RequiresApproval: true, Limitation: "Applies only when aws:SourceIp is present; service-to-service calls can use different network context."}, WhatItDoes: "Blocks requests outside the established source IP ranges.", WhatItCosts: "Legitimate traffic after a network or egress change can be blocked."}
	p := PolicyDocument{Version: "2012-10-17", Statement: []PolicyStatement{{Sid: fmt.Sprintf("DenyOutsideBaselineSourceIP_%d", a.ID), Effect: "Deny", Action: "*", Resource: "*", Condition: map[string]any{"Null": map[string]string{"aws:SourceIp": "false"}, "NotIpAddress": map[string]any{"aws:SourceIp": cidrs}}}}}
	return d, p, nil
}

func generateOperationPolicy(a AlertRow, e EventEvidence, title, what, enforcement string) (PolicyDescription, PolicyDocument, error) {
	actions := []string{}
	if action := actionFromEvidence(e); action != "" {
		actions = append(actions, action)
	}
	observed, err := observedValues(a)
	if err != nil && len(actions) == 0 {
		return PolicyDescription{}, PolicyDocument{}, fmt.Errorf("read observed API operations: %w", err)
	}
	actions = uniqueStrings(append(actions, normalizeActions(observed)...))
	if len(actions) == 0 {
		return PolicyDescription{}, PolicyDocument{}, errNoEnforceablePolicy
	}
	resource := resourceFromEvidence(e)
	limitation := ""
	if text, ok := resource.(string); ok && text == "*" {
		limitation = "No resource ARN was recorded. This policy denies the operation across all matching resources."
	}
	d := PolicyDescription{Category: CategoryScopedDeny, Title: title, Enforcement: Enforcement{Type: enforcement, BlocksTriggeringBehavior: true, RequiresApproval: true, Limitation: limitation}, WhatItDoes: what, WhatItCosts: "Legitimate use of the same operation and resource will also be blocked."}
	p := PolicyDocument{Version: "2012-10-17", Statement: []PolicyStatement{{Sid: fmt.Sprintf("DenyObservedAction_%d", a.ID), Effect: "Deny", Action: scalarOrSlice(actions), Resource: resource}}}
	return d, p, nil
}

func generateServicePolicy(a AlertRow, e EventEvidence) (PolicyDescription, PolicyDocument, error) {
	service := normalizeService(e.EventSource)
	if service == "" {
		values, err := observedValues(a)
		if err != nil {
			return PolicyDescription{}, PolicyDocument{}, err
		}
		if len(values) > 0 {
			service = normalizeService(values[0])
		}
	}
	if service == "" {
		return PolicyDescription{}, PolicyDocument{}, errNoEnforceablePolicy
	}
	d := PolicyDescription{Category: CategoryScopedDeny, Title: "deny-new-api-service", Enforcement: Enforcement{Type: EnforcementDirect, BlocksTriggeringBehavior: true, RequiresApproval: true}, WhatItDoes: "Blocks all operations for the newly observed AWS service.", WhatItCosts: "All legitimate operations for the service will also be blocked."}
	p := PolicyDocument{Version: "2012-10-17", Statement: []PolicyStatement{{Sid: fmt.Sprintf("DenyObservedService_%d", a.ID), Effect: "Deny", Action: service + ":*", Resource: "*"}}}
	return d, p, nil
}

func generateResourcePolicy(a AlertRow, e EventEvidence) (PolicyDescription, PolicyDocument, error) {
	action := actionFromEvidence(e)
	resources := normalizeResourcePatterns(e.ResourceARNs)
	if action == "" || len(resources) == 0 {
		return PolicyDescription{}, PolicyDocument{}, errNoEnforceablePolicy
	}
	d := PolicyDescription{Category: CategoryScopedDeny, Title: "deny-observed-resource", Enforcement: Enforcement{Type: EnforcementDirect, BlocksTriggeringBehavior: true, RequiresApproval: true, Limitation: "The IAM action must support resource-level permissions for the returned resource ARN."}, WhatItDoes: "Blocks the observed operation against the anomalous resource.", WhatItCosts: "Legitimate use of the same action and resource will also be blocked."}
	p := PolicyDocument{Version: "2012-10-17", Statement: []PolicyStatement{{Sid: fmt.Sprintf("DenyObservedResource_%d", a.ID), Effect: "Deny", Action: action, Resource: scalarOrSlice(resources)}}}
	return d, p, nil
}

func generateSchedulePolicy(b BaselineRow, a AlertRow, now time.Time) (PolicyDescription, PolicyDocument, error) {
	hours, err := baselineHoursOfWeek(b.ProfileJSON)
	if err != nil || len(hours) == 0 {
		return PolicyDescription{}, PolicyDocument{}, errNoEnforceablePolicy
	}
	start := now.UTC()
	end, err := nextAllowedScheduleTime(start, hours)
	if err != nil || !end.After(start) {
		return PolicyDescription{}, PolicyDocument{}, errNoEnforceablePolicy
	}
	d := PolicyDescription{Category: CategoryProxyGuardrail, Title: "deny-until-next-baseline-window", Enforcement: Enforcement{Type: EnforcementTemporary, BlocksTriggeringBehavior: true, RequiresApproval: true, Limitation: "This is an absolute timestamp interval and does not automatically repeat every week."}, WhatItDoes: "Temporarily blocks identity activity until the next established schedule window.", WhatItCosts: "All identity activity is denied during the temporary interval."}
	p := PolicyDocument{Version: "2012-10-17", Statement: []PolicyStatement{{Sid: fmt.Sprintf("DenyUntilNextScheduleWindow_%d", a.ID), Effect: "Deny", Action: "*", Resource: "*", Condition: map[string]any{"DateGreaterThanEquals": map[string]string{"aws:CurrentTime": start.Format(time.RFC3339)}, "DateLessThan": map[string]string{"aws:CurrentTime": end.Format(time.RFC3339)}}}}}
	return d, p, nil
}

func generateFrequencyPolicy(a AlertRow, e EventEvidence) (PolicyDescription, PolicyDocument, error) {
	action := actionFromEvidence(e)
	if action == "" {
		if values, err := observedValues(a); err == nil {
			actions := normalizeActions(values)
			if len(actions) > 0 {
				action = actions[0]
			}
		}
	}
	if action == "" {
		return PolicyDescription{}, PolicyDocument{}, errNoEnforceablePolicy
	}
	d := PolicyDescription{Category: CategoryProxyGuardrail, Title: "contain-operation-after-frequency-anomaly", Enforcement: Enforcement{Type: EnforcementCorrelated, BlocksTriggeringBehavior: true, RequiresApproval: true, Limitation: "IAM cannot enforce a request-count threshold. The policy blocks subsequent matching operations and uses the representative event linked to the alert."}, WhatItDoes: "Blocks the action and resource associated with the detected frequency spike.", WhatItCosts: "Legitimate subsequent calls matching the same action and resource will also be blocked."}
	p := PolicyDocument{Version: "2012-10-17", Statement: []PolicyStatement{{Sid: fmt.Sprintf("ContainFrequencyAnomaly_%d", a.ID), Effect: "Deny", Action: action, Resource: resourceFromEvidence(e)}}}
	return d, p, nil
}

func generateNetworkPolicy(a AlertRow, e EventEvidence) (PolicyDescription, PolicyDocument, error) {
	addr, err := netip.ParseAddr(strings.TrimSpace(e.SourceIP))
	if err != nil {
		return PolicyDescription{}, PolicyDocument{}, errNoEnforceablePolicy
	}
	action := actionFromEvidence(e)
	if action == "" {
		action = "*"
	}
	bits := 128
	if addr.Is4() {
		bits = 32
	}
	cidr := netip.PrefixFrom(addr, bits).String()
	d := PolicyDescription{Category: CategoryProxyGuardrail, Title: "deny-observed-source-network", Enforcement: Enforcement{Type: EnforcementCorrelated, BlocksTriggeringBehavior: true, RequiresApproval: true, Limitation: "Legitimate traffic from the same source IP will also be denied."}, WhatItDoes: "Blocks matching requests from the observed anomalous source IP.", WhatItCosts: "The IP can be shared or change over time."}
	p := PolicyDocument{Version: "2012-10-17", Statement: []PolicyStatement{{Sid: fmt.Sprintf("DenyObservedSourceIP_%d", a.ID), Effect: "Deny", Action: action, Resource: resourceFromEvidence(e), Condition: map[string]any{"Null": map[string]string{"aws:SourceIp": "false"}, "IpAddress": map[string]string{"aws:SourceIp": cidr}}}}}
	return d, p, nil
}

func generateUserAgentPolicy(a AlertRow, e EventEvidence) (PolicyDescription, PolicyDocument, error) {
	ua := strings.TrimSpace(e.UserAgent)
	if ua == "" {
		return PolicyDescription{}, PolicyDocument{}, errNoEnforceablePolicy
	}
	d := PolicyDescription{Category: CategoryProxyGuardrail, Title: "deny-observed-user-agent", Enforcement: Enforcement{Type: EnforcementCorrelated, BlocksTriggeringBehavior: true, RequiresApproval: true, Limitation: "The user-agent string is client-controlled and can be spoofed."}, WhatItDoes: "Blocks requests using the raw user-agent string observed in the anomaly.", WhatItCosts: "SDK upgrades or legitimate clients using the same string can be blocked."}
	p := PolicyDocument{Version: "2012-10-17", Statement: []PolicyStatement{{Sid: fmt.Sprintf("DenyObservedUserAgent_%d", a.ID), Effect: "Deny", Action: "*", Resource: "*", Condition: map[string]any{"Null": map[string]string{"aws:UserAgent": "false"}, "StringEquals": map[string]string{"aws:UserAgent": ua}}}}}
	return d, p, nil
}

func generateEvidenceBasedPolicy(a AlertRow, e EventEvidence) (PolicyDescription, PolicyDocument, error) {
	if actionFromEvidence(e) == "" {
		return PolicyDescription{}, PolicyDocument{}, errNoEnforceablePolicy
	}
	return generateOperationPolicy(a, e, "contain-observed-operation", "Blocks the concrete API operation associated with the anomaly.", EnforcementCorrelated)
}

func evidenceFromAlert(a AlertRow) EventEvidence {
	e := EventEvidence{EventID: strings.TrimSpace(a.EventID)}
	if len(a.IdentityMetadata) == 0 || strings.TrimSpace(string(a.IdentityMetadata)) == "null" {
		return e
	}
	var metadata map[string]any
	if json.Unmarshal(a.IdentityMetadata, &metadata) != nil {
		return e
	}
	e.IAMAction = firstMetadataString(metadata, "iam_action", "iamAction")
	e.EventSource = firstMetadataString(metadata, "event_source", "eventSource", "api_service", "service")
	e.EventName = firstMetadataString(metadata, "event_name", "eventName", "api_operation", "operation", "action")
	e.AWSRegion = firstMetadataString(metadata, "aws_region", "awsRegion", "region")
	e.SourceIP = firstMetadataString(metadata, "source_ip", "sourceIPAddress", "sourceIp")
	e.UserAgent = firstMetadataString(metadata, "user_agent", "userAgent", "raw_user_agent")
	e.ResourceARNs = firstMetadataStrings(metadata, "resource_arns", "resourceArns", "resources", "resource_arn")
	return e
}

func firstMetadataString(metadata map[string]any, fields ...string) string {
	for _, field := range fields {
		if raw, ok := metadata[field]; ok {
			if text, ok := raw.(string); ok && strings.TrimSpace(text) != "" {
				return strings.TrimSpace(text)
			}
		}
	}
	for _, raw := range metadata {
		if nested, ok := raw.(map[string]any); ok {
			if text := firstMetadataString(nested, fields...); text != "" {
				return text
			}
		}
	}
	return ""
}

func firstMetadataStrings(metadata map[string]any, fields ...string) []string {
	for _, field := range fields {
		raw, ok := metadata[field]
		if !ok {
			continue
		}
		switch v := raw.(type) {
		case string:
			return splitResourceARNs(v)
		case []string:
			return uniqueStrings(v)
		case []any:
			out := []string{}
			for _, item := range v {
				switch x := item.(type) {
				case string:
					out = append(out, x)
				case map[string]any:
					if arn := firstMetadataString(x, "ARN", "arn", "resource_arn", "resourceArn"); arn != "" {
						out = append(out, arn)
					}
				}
			}
			return uniqueStrings(out)
		}
	}
	for _, raw := range metadata {
		if nested, ok := raw.(map[string]any); ok {
			if values := firstMetadataStrings(nested, fields...); len(values) > 0 {
				return values
			}
		}
	}
	return nil
}

func actionFromEvidence(e EventEvidence) string {
	iamAction := strings.TrimSpace(e.IAMAction)
	if iamActionPattern.MatchString(iamAction) {
		return iamAction
	}
	source := strings.ToLower(strings.TrimSpace(e.EventSource))
	name := strings.TrimSpace(e.EventName)
	if source == "" || name == "" {
		return ""
	}
	if action, ok := operationActionOverrides[source+":"+name]; ok {
		return action
	}
	service := normalizeService(source)
	if service == "" {
		return ""
	}
	action := service + ":" + name
	if !iamActionPattern.MatchString(action) {
		return ""
	}
	return action
}

func resourceFromEvidence(e EventEvidence) any {
	resources := normalizeResourcePatterns(e.ResourceARNs)
	if len(resources) == 0 {
		return "*"
	}
	return scalarOrSlice(resources)
}

func normalizeService(value string) string {
	value = strings.TrimSuffix(strings.ToLower(strings.TrimSpace(value)), ".amazonaws.com")
	if !iamServicePattern.MatchString(value) {
		return ""
	}
	return value
}

func baselineValues(b BaselineRow, a AlertRow) ([]string, error) {
	if values, err := decodeStringValues(a.BaselineValue); err == nil && len(values) > 0 {
		return values, nil
	}
	return profileValues(b.ProfileJSON, normalizeDimension(a.Dimension))
}
func observedValues(a AlertRow) ([]string, error) { return decodeStringValues(a.ObservedValue) }

func decodeStringValues(raw json.RawMessage) ([]string, error) {
	if len(raw) == 0 || strings.TrimSpace(string(raw)) == "" || strings.TrimSpace(string(raw)) == "null" {
		return nil, nil
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, fmt.Errorf("decode JSON value: %w", err)
	}
	values, err := extractStringValues(value)
	if err != nil {
		return nil, err
	}
	return uniqueStrings(values), nil
}

func extractStringValues(value any) ([]string, error) {
	switch v := value.(type) {
	case nil:
		return nil, nil
	case string:
		if strings.TrimSpace(v) == "" {
			return nil, nil
		}
		return []string{strings.TrimSpace(v)}, nil
	case float64:
		return []string{strconv.FormatFloat(v, 'f', -1, 64)}, nil
	case bool:
		return []string{strconv.FormatBool(v)}, nil
	case []any:
		out := []string{}
		for _, item := range v {
			x, err := extractStringValues(item)
			if err != nil {
				return nil, err
			}
			out = append(out, x...)
		}
		return out, nil
	case map[string]any:
		if raw, ok := v["counts"]; ok {
			counts, ok := raw.(map[string]any)
			if !ok {
				return nil, fmt.Errorf("counts must be a JSON object")
			}
			out := []string{}
			for key := range counts {
				out = append(out, key)
			}
			return out, nil
		}
		for _, field := range []string{"observed_value", "observed", "new_value", "current_value", "current", "value", "values", "api_operation", "operation", "action", "api_service", "service", "region", "source_ip", "resource", "resource_pattern"} {
			if raw, ok := v[field]; ok {
				return extractStringValues(raw)
			}
		}
		if len(v) == 1 {
			for _, raw := range v {
				return extractStringValues(raw)
			}
		}
		return nil, fmt.Errorf("unsupported JSON object fields: %s", sortedObjectKeys(v))
	default:
		return nil, fmt.Errorf("unsupported JSON value type %T", value)
	}
}

func sortedObjectKeys(value map[string]any) string {
	keys := make([]string, 0, len(value))
	for key := range value {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return strings.Join(keys, ", ")
}
func profileValues(raw json.RawMessage, dimension string) ([]string, error) {
	if len(raw) == 0 || strings.TrimSpace(string(raw)) == "null" {
		return nil, nil
	}
	var p map[string]json.RawMessage
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, fmt.Errorf("decode baseline profile: %w", err)
	}
	v, ok := p[normalizeDimension(dimension)]
	if !ok {
		return nil, nil
	}
	return decodeStringValues(v)
}
func baselineHoursOfWeek(raw json.RawMessage) ([]int, error) {
	values, err := profileValues(raw, "hour_of_week_utc")
	if err != nil {
		return nil, err
	}
	hours := []int{}
	for _, v := range values {
		h, err := strconv.Atoi(strings.TrimSpace(v))
		if err == nil && h >= 0 && h <= 167 {
			hours = append(hours, h)
		}
	}
	sort.Ints(hours)
	return uniqueInts(hours), nil
}
func nextAllowedScheduleTime(start time.Time, hours []int) (time.Time, error) {
	if len(hours) == 0 {
		return time.Time{}, fmt.Errorf("baseline schedule is empty")
	}
	candidate := start.UTC().Truncate(time.Hour).Add(time.Hour)
	for i := 0; i <= 168; i++ {
		if containsHourOfWeek(hours, hourOfWeekUTC(candidate)) {
			return candidate, nil
		}
		candidate = candidate.Add(time.Hour)
	}
	return time.Time{}, fmt.Errorf("no next allowed schedule hour found")
}
func hourOfWeekUTC(v time.Time) int {
	v = v.UTC()
	day := (int(v.Weekday()) + 6) % 7
	return day*24 + v.Hour()
}
func containsHourOfWeek(hours []int, target int) bool {
	i := sort.SearchInts(hours, target)
	return i < len(hours) && hours[i] == target
}
func uniqueInts(values []int) []int {
	out := []int{}
	last := -1
	for _, v := range values {
		if v != last {
			out = append(out, v)
			last = v
		}
	}
	return out
}
func normalizeDimension(v string) string { return strings.ToLower(strings.TrimSpace(v)) }
func normalizeRegions(values []string) []string {
	out := []string{}
	for _, v := range values {
		v = strings.ToLower(strings.TrimSpace(v))
		if v != "" {
			out = append(out, v)
		}
	}
	return uniqueStrings(out)
}
func normalizeActions(values []string) []string {
	out := []string{}
	for _, v := range values {
		parts := strings.SplitN(strings.TrimSpace(v), ":", 2)
		if len(parts) != 2 {
			continue
		}
		service := normalizeService(parts[0])
		action := strings.TrimSpace(parts[1])
		candidate := service + ":" + action
		if service != "" && action != "" && iamActionPattern.MatchString(candidate) {
			out = append(out, candidate)
		}
	}
	return uniqueStrings(out)
}
func normalizeResourcePatterns(values []string) []string {
	out := []string{}
	for _, v := range values {
		v = strings.ReplaceAll(strings.TrimSpace(v), "{hex-id}", "*")
		if v != "" {
			out = append(out, v)
		}
	}
	return uniqueStrings(out)
}
func normalizeCIDRs(values []string) ([]string, error) {
	out := []string{}
	for _, v := range values {
		v = strings.TrimSpace(v)
		if p, err := netip.ParsePrefix(v); err == nil {
			out = append(out, p.Masked().String())
			continue
		}
		a, err := netip.ParseAddr(v)
		if err != nil {
			return nil, fmt.Errorf("invalid IP or CIDR %q", v)
		}
		bits := 128
		if a.Is4() {
			bits = 32
		}
		out = append(out, netip.PrefixFrom(a, bits).String())
	}
	return uniqueStrings(out), nil
}
func uniqueStrings(values []string) []string {
	seen := map[string]struct{}{}
	out := []string{}
	for _, v := range values {
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	sort.Strings(out)
	return out
}
func scalarOrSlice(values []string) any {
	if len(values) == 1 {
		return values[0]
	}
	return values
}
func normalizeScore(score float64) float64 {
	if score < 0 {
		return 0
	}
	if score > 1 {
		return 1
	}
	return score
}
