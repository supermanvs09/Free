package identitygraph

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/lib/pq"

	"nhi-backend-api/internal/platform/scope"
)

// Stored values in human_identities. These must match what the collector writes.
// The API accepts source=sso, but the collector stores it as identity_center.
const (
	HumanSourceIAM = "iam"
	HumanSourceSSO = "identity_center"
	HumanTypeRoot  = "ROOT_USER"
)

// ErrHumanIdentityNotFound is returned when the id is missing, deleted, or outside the user's scope.
var ErrHumanIdentityNotFound = errors.New("human identity not found")

// ErrInvalidHumanRisk is returned when the risk filter is not a known rule key.
var ErrInvalidHumanRisk = errors.New("invalid human identity risk filter")

// humanSortColumns maps the public sort_by value to a SQL expression.
// Only these expressions are written into the query text. User input never is.
var humanSortColumns = map[string]string{
	"name":             "COALESCE(h.display_name, h.user_name, '')",
	"email":            "COALESCE(h.email, '')",
	"source":           "h.source",
	"status":           "h.status",
	"mfa":              "h.mfa_active",
	"last_activity_at": "h.last_activity_at",
	"created_at":       "h.created_at_source",
	"score":            "ps.score", // needs scoreJoin
}

// scoreJoin attaches each person's posture score, matched like the console
// does: by ARN first, then by user name, e-mail or display name (single sign-on
// people have no ARN). Only used when sorting by score.
const scoreJoin = `
		LEFT JOIN LATERAL (
			SELECT p.score FROM %[1]s.ispm_identity_posture p
			WHERE p.identity_arn = h.arn
			   OR lower(p.identity_name) IN (lower(NULLIF(h.user_name, '')), lower(NULLIF(h.email, '')), lower(NULLIF(h.display_name, '')))
			ORDER BY (p.identity_arn = h.arn) DESC, p.score
			LIMIT 1
		) ps ON true`

// ResolveHumanSource maps the API source value to the stored value.
// "iam" -> "iam", "sso" -> "identity_center". Anything else returns "" (no filter).
func ResolveHumanSource(apiValue string) string {
	switch strings.ToLower(strings.TrimSpace(apiValue)) {
	case "iam":
		return HumanSourceIAM
	case "sso":
		return HumanSourceSSO
	}
	return ""
}

// HumanIdentityRepository reads the human_identities, human_identity_access,
// human_identity_groups and human_identity_credentials tables.
type HumanIdentityRepository struct{}

func NewHumanIdentityRepository() *HumanIdentityRepository {
	return &HumanIdentityRepository{}
}

type humanArgs struct{ values []any }

func (a *humanArgs) add(v any) string {
	a.values = append(a.values, v)
	return fmt.Sprintf("$%d", len(a.values))
}

// humanWhere is the single filter used by overview, list, detail and permission
// sets, so the same scope and filters always produce the same counts.
func humanWhere(resolved *scope.DataScope, a *humanArgs, source, humanType string, statuses []string, mfa *bool, search, risk string) []string {
	accounts := resolved.AccountIDs
	if accounts == nil {
		accounts = []string{}
	}
	where := []string{
		"h.deleted_at IS NULL",
		// SSO users live in the Identity Center account (often the org's management
		// account, which the tenant may not connect), so they are not filtered by
		// their own account_id; the tenant schema already isolates the company.
		// A user with no accounts in scope still sees nothing.
		fmt.Sprintf("(h.account_id = ANY(%[1]s::text[]) OR (h.source = '%[2]s' AND cardinality(%[1]s::text[]) > 0))",
			a.add(pq.Array(accounts)), HumanSourceSSO),
	}
	if stored := ResolveHumanSource(source); stored != "" {
		where = append(where, fmt.Sprintf("h.source = %s", a.add(stored)))
	}
	if t := strings.TrimSpace(humanType); t != "" {
		where = append(where, fmt.Sprintf("h.human_type = %s", a.add(t)))
	}
	if len(statuses) > 0 {
		lowered := make([]string, 0, len(statuses))
		for _, s := range statuses {
			lowered = append(lowered, strings.ToLower(strings.TrimSpace(s)))
		}
		where = append(where, fmt.Sprintf("LOWER(h.status) = ANY(%s::text[])", a.add(pq.Array(lowered))))
	}
	if mfa != nil {
		where = append(where, fmt.Sprintf("h.mfa_active = %s", a.add(*mfa)))
	}
	if s := strings.TrimSpace(search); s != "" {
		ph := a.add("%" + s + "%")
		where = append(where, fmt.Sprintf(
			"(COALESCE(h.display_name, '') ILIKE %[1]s OR COALESCE(h.email, '') ILIKE %[1]s OR COALESCE(h.user_name, '') ILIKE %[1]s OR COALESCE(h.arn, '') ILIKE %[1]s)",
			ph))
	}
	if key := strings.TrimSpace(risk); key != "" {
		if rule, ok := HumanRiskRuleByKey(key); ok {
			where = append(where, "("+rule.where(resolved.QSchema())+")")
		}
	}
	return where
}

// groupCounts runs a query that returns (key, count) rows and returns them as a map.
func (r *HumanIdentityRepository) groupCounts(ctx context.Context, resolved *scope.DataScope, q string, args []any) (map[string]int, error) {
	rows, err := resolved.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string]int)
	for rows.Next() {
		var key string
		var n int
		if err := rows.Scan(&key, &n); err != nil {
			return nil, fmt.Errorf("scan group count: %w", err)
		}
		out[key] += n
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate group counts: %w", err)
	}
	return out, nil
}

// Overview returns the summary counts for the Overview tab.
func (r *HumanIdentityRepository) Overview(ctx context.Context, resolved *scope.DataScope, source string) (*HumanIdentityOverview, error) {
	if resolved == nil || resolved.DB == nil {
		return nil, ErrScopeRequired
	}
	schema := resolved.QSchema()
	a := &humanArgs{}
	whereSQL := strings.Join(humanWhere(resolved, a, source, "", nil, nil, "", ""), " AND ")

	// One FILTER count per risk rule. These are the same definitions used by the
	// list filter and the detail risk signals.
	var ruleCols strings.Builder
	for _, rule := range HumanRiskRules {
		ruleCols.WriteString(",\n\t\t\tCOUNT(*) FILTER (WHERE (" + rule.where(schema) + "))::int")
	}

	// Source and type values are code constants, not user input.
	q := fmt.Sprintf(`
		SELECT
			COUNT(*)::int,
			COUNT(*) FILTER (WHERE h.source = '%[3]s')::int,
			COUNT(*) FILTER (WHERE h.source = '%[4]s')::int,
			COUNT(*) FILTER (WHERE h.status = 'active')::int,
			COUNT(*) FILTER (WHERE h.status = 'inactive')::int,
			COUNT(*) FILTER (WHERE h.status = 'suspended')::int,
			COUNT(*) FILTER (WHERE h.status = 'disabled')::int,
			COUNT(*) FILTER (WHERE h.mfa_active IS TRUE)::int,
			COUNT(*) FILTER (WHERE h.mfa_active IS FALSE)::int,
			COUNT(*) FILTER (WHERE h.mfa_active IS NULL)::int,
			COUNT(*) FILTER (WHERE h.person_id IS NULL)::int,
			COUNT(*) FILTER (WHERE h.human_type = '%[5]s')::int,
			(SELECT COUNT(*)::int FROM (
				SELECT h.person_id
				FROM %[1]s.human_identities h
				WHERE %[2]s AND h.person_id IS NOT NULL
				GROUP BY h.person_id
				HAVING COUNT(DISTINCT h.source) > 1
			) p)%[6]s
		FROM %[1]s.human_identities h
		WHERE %[2]s`,
		schema, whereSQL, HumanSourceIAM, HumanSourceSSO, HumanTypeRoot, ruleCols.String())

	var o HumanIdentityOverview
	ruleCounts := make([]int, len(HumanRiskRules))
	dest := []any{
		&o.TotalIdentities,
		&o.BySource.IAM, &o.BySource.SSO,
		&o.ByStatus.Active, &o.ByStatus.Inactive, &o.ByStatus.Suspended, &o.ByStatus.Disabled,
		&o.MFA.Enabled, &o.MFA.Disabled, &o.MFA.Unknown,
		&o.UnlinkedCount, &o.RootAccounts,
		&o.BySource.Both,
	}
	for i := range ruleCounts {
		dest = append(dest, &ruleCounts[i])
	}
	if err := resolved.DB.QueryRowContext(ctx, q, a.values...).Scan(dest...); err != nil {
		return nil, fmt.Errorf("query human identity overview: %w", err)
	}

	counts := make(map[string]int, len(HumanRiskRules))
	for i, rule := range HumanRiskRules {
		counts[rule.Key] = ruleCounts[i]
	}
	o.InactiveOver90Days = counts["inactive_90d"]
	o.NeverUsed = counts["never_used"]
	o.ConsoleWithoutMFA = counts["console_no_mfa"]
	o.PrivilegedCount = counts["admin"]
	o.AdminByPolicy = counts["admin_policy"]
	o.EscalationCount = counts["escalation"]
	o.AdminsVirtualMFAOnly = counts["virtual_mfa_admin"]
	o.AccessKeys = HumanOverviewAccessKeys{
		UsersWithActiveKey: counts["active_access_key"],
		OlderThan90Days:    counts["old_access_key"],
		NeverUsed:          counts["unused_access_key"],
		TwoActiveKeys:      counts["two_active_keys"],
	}
	o.Passwords = HumanOverviewPasswords{
		OlderThan90Days: counts["old_password"],
		NeverChanged:    counts["password_never_changed"],
	}
	o.SignIns = HumanOverviewSignIns{
		LoginWithoutMFA90Days: counts["login_without_mfa"],
		FailedLogin7Days:      counts["failed_login"],
	}

	// Identities by human_type.
	ta := &humanArgs{}
	typeWhere := strings.Join(humanWhere(resolved, ta, source, "", nil, nil, "", ""), " AND ")
	typeCounts, err := r.groupCounts(ctx, resolved, fmt.Sprintf(`
		SELECT h.human_type, COUNT(*)::int
		FROM %[1]s.human_identities h
		WHERE %[2]s
		GROUP BY h.human_type`, schema, typeWhere), ta.values)
	if err != nil {
		return nil, fmt.Errorf("query human identity types: %w", err)
	}
	o.ByHumanType = typeCounts

	// Active MFA devices by type.
	ma := &humanArgs{}
	mfaWhere := strings.Join(humanWhere(resolved, ma, source, "", nil, nil, "", ""), " AND ")
	mfaCounts, err := r.groupCounts(ctx, resolved, fmt.Sprintf(`
		SELECT LOWER(COALESCE(c.mfa_type, '')), COUNT(*)::int
		FROM %[1]s.human_identity_credentials c
		JOIN %[1]s.human_identities h ON h.id = c.human_id
		WHERE %[2]s AND c.credential_type = '%[3]s' AND c.status = 'active'
		GROUP BY 1`, schema, mfaWhere, CredTypeMFADevice), ma.values)
	if err != nil {
		return nil, fmt.Errorf("query human identity mfa devices: %w", err)
	}
	for mfaType, n := range mfaCounts {
		switch mfaType {
		case "virtual":
			o.MFADevices.Virtual += n
		case "hardware":
			o.MFADevices.Hardware += n
		case "passkey":
			o.MFADevices.Passkey += n
		default:
			o.MFADevices.Other += n
		}
	}

	// Access rows by how access was granted. A row is group-based when it has a
	// group_id or granted_via is not 'direct'.
	aa := &humanArgs{}
	accessWhere := strings.Join(humanWhere(resolved, aa, source, "", nil, nil, "", ""), " AND ")
	accessCounts, err := r.groupCounts(ctx, resolved, fmt.Sprintf(`
		SELECT CASE WHEN a.group_id IS NULL AND a.granted_via = 'direct' THEN 'direct' ELSE 'group' END,
		       COUNT(*)::int
		FROM %[1]s.human_identity_access a
		JOIN %[1]s.human_identities h ON h.id = a.human_id
		WHERE %[2]s
		GROUP BY 1`, schema, accessWhere), aa.values)
	if err != nil {
		return nil, fmt.Errorf("query human identity access sources: %w", err)
	}
	o.AccessBySource = HumanOverviewAccessSource{
		Direct: accessCounts["direct"],
		Group:  accessCounts["group"],
	}

	return &o, nil
}

// List returns one page of identities. The count uses the same WHERE clause
// as the rows, so the total always matches the overview.
func (r *HumanIdentityRepository) List(ctx context.Context, resolved *scope.DataScope, f HumanIdentityListFilter) (*HumanIdentityListResponse, error) {
	if resolved == nil || resolved.DB == nil {
		return nil, ErrScopeRequired
	}
	if risk := strings.TrimSpace(f.Risk); risk != "" && !IsValidHumanRisk(risk) {
		return nil, ErrInvalidHumanRisk
	}
	page, pageSize := f.Page, f.PageSize
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 25
	}
	if pageSize > 100 {
		pageSize = 100
	}

	schema := resolved.QSchema()
	a := &humanArgs{}
	whereSQL := strings.Join(humanWhere(resolved, a, f.Source, f.HumanType, f.Statuses, f.MFA, f.Search, f.Risk), " AND ")

	countQ := fmt.Sprintf(`SELECT COUNT(*)::int FROM %s.human_identities h WHERE %s`, schema, whereSQL)
	var total int
	if err := resolved.DB.QueryRowContext(ctx, countQ, a.values...).Scan(&total); err != nil {
		return nil, fmt.Errorf("count human identities: %w", err)
	}

	sortKey := strings.ToLower(strings.TrimSpace(f.SortBy))
	sortExpr, ok := humanSortColumns[sortKey]
	if !ok {
		sortExpr = humanSortColumns["last_activity_at"]
	}
	dir := "DESC"
	if strings.EqualFold(strings.TrimSpace(f.SortOrder), "asc") {
		dir = "ASC"
	}

	limitPh := a.add(pageSize)
	offsetPh := a.add((page - 1) * pageSize)

	join := ""
	if sortKey == "score" {
		join = fmt.Sprintf(scoreJoin, schema)
	}
	q := fmt.Sprintf(`
		SELECT
			h.id::text, h.source, h.source_id, h.human_type, h.account_id,
			COALESCE(h.arn, ''), COALESCE(h.user_name, ''), COALESCE(h.display_name, ''), COALESCE(h.email, ''),
			h.status, h.mfa_active, h.console_access, h.last_activity_at, h.created_at_source,
			(SELECT COUNT(*)::int FROM %[1]s.human_identity_access a WHERE a.human_id = h.id),
			(SELECT COUNT(*)::int FROM %[1]s.human_identity_groups g WHERE g.human_id = h.id),
			%[9]s,
			(SELECT c.mfa_type FROM %[1]s.human_identity_credentials c
			  WHERE c.human_id = h.id AND c.credential_type = '%[4]s' AND c.status = 'active'
			  ORDER BY c.mfa_type NULLS LAST LIMIT 1),
			(SELECT COUNT(*)::int FROM %[1]s.human_identity_credentials c
			  WHERE c.human_id = h.id AND c.credential_type = '%[5]s' AND c.status = 'active')
		FROM %[1]s.human_identities h%[10]s
		WHERE %[2]s
		ORDER BY %[3]s %[6]s NULLS LAST, h.id %[6]s
		LIMIT %[7]s OFFSET %[8]s`,
		schema, whereSQL, sortExpr, CredTypeMFADevice, CredTypeAccessKey, dir, limitPh, offsetPh, hiLastConsoleLogin, join)

	rows, err := resolved.DB.QueryContext(ctx, q, a.values...)
	var pgErr *pq.Error
	if err != nil && join != "" && errors.As(err, &pgErr) && pgErr.Code == "42P01" && strings.Contains(pgErr.Message, "ispm_identity_posture") {
		// No posture table in this tenant yet: keep the list, sorted by last activity.
		q = strings.Replace(q, join, "", 1)
		q = strings.Replace(q, "ORDER BY "+sortExpr, "ORDER BY "+humanSortColumns["last_activity_at"], 1)
		rows, err = resolved.DB.QueryContext(ctx, q, a.values...)
	}
	if err != nil {
		return nil, fmt.Errorf("query human identities: %w", err)
	}
	defer rows.Close()

	items := make([]HumanIdentityListItem, 0)
	for rows.Next() {
		var it HumanIdentityListItem
		var mfa, console sql.NullBool
		var lastAct, created, lastLogin sql.NullTime
		var mfaType sql.NullString
		if err := rows.Scan(
			&it.ID, &it.Source, &it.SourceID, &it.HumanType, &it.AccountID,
			&it.ARN, &it.UserName, &it.DisplayName, &it.Email,
			&it.Status, &mfa, &console, &lastAct, &created,
			&it.AccessCount, &it.GroupCount,
			&lastLogin, &mfaType, &it.ActiveKeyCount,
		); err != nil {
			return nil, fmt.Errorf("scan human identity row: %w", err)
		}
		it.MFAActive = hiNullBool(mfa)
		it.ConsoleAccess = hiNullBool(console)
		it.LastActivityAt = hiNullTime(lastAct)
		it.CreatedAtSource = hiNullTime(created)
		it.LastConsoleLoginAt = hiNullTime(lastLogin)
		it.MFAType = hiNullString(mfaType)
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate human identities: %w", err)
	}

	totalPages := 0
	if pageSize > 0 {
		totalPages = (total + pageSize - 1) / pageSize
	}
	return &HumanIdentityListResponse{
		Data: items,
		Pagination: HumanIdentityPagination{
			Page:       page,
			PageSize:   pageSize,
			TotalCount: total,
			TotalPages: totalPages,
		},
	}, nil
}

// Detail returns one identity with its access, groups, credentials and sign-in
// data. Risk signals are computed here from the shared rules.
func (r *HumanIdentityRepository) Detail(ctx context.Context, resolved *scope.DataScope, id string) (*HumanIdentityDetail, error) {
	if resolved == nil || resolved.DB == nil {
		return nil, ErrScopeRequired
	}
	schema := resolved.QSchema()
	a := &humanArgs{}
	whereSQL := strings.Join(humanWhere(resolved, a, "", "", nil, nil, "", ""), " AND ")
	idPh := a.add(id)

	// Each risk rule is evaluated for this identity in the same row.
	var flagCols strings.Builder
	for _, rule := range HumanRiskRules {
		flagCols.WriteString(",\n\t\t\tCOALESCE((" + rule.where(schema) + "), false)")
	}

	q := fmt.Sprintf(`
		SELECT
			h.id::text, h.source, h.source_id, h.human_type, h.account_id,
			COALESCE(h.arn, ''), COALESCE(h.user_name, ''), COALESCE(h.display_name, ''),
			COALESCE(h.given_name, ''), COALESCE(h.family_name, ''), COALESCE(h.title, ''),
			COALESCE(h.email, ''), COALESCE(h.external_id, ''), COALESCE(h.external_id_issuer, ''),
			COALESCE(h.idp_name, ''), h.status, h.mfa_active, h.console_access,
			h.last_activity_at, h.created_at_source, COALESCE(h.details::text, '{}'), h.person_id::text,
			h.first_seen_at, h.last_seen_at%[4]s
		FROM %[1]s.human_identities h
		WHERE %[2]s AND h.id::text = %[3]s`,
		schema, whereSQL, idPh, flagCols.String())

	var d HumanIdentityDetail
	var mfa, console sql.NullBool
	var lastAct, created sql.NullTime
	var details string
	var person sql.NullString
	flags := make([]bool, len(HumanRiskRules))
	dest := []any{
		&d.ID, &d.Source, &d.SourceID, &d.HumanType, &d.AccountID,
		&d.ARN, &d.UserName, &d.DisplayName,
		&d.GivenName, &d.FamilyName, &d.Title,
		&d.Email, &d.ExternalID, &d.ExternalIDIssuer,
		&d.IDPName, &d.Status, &mfa, &console,
		&lastAct, &created, &details, &person,
		&d.FirstSeenAt, &d.LastSeenAt,
	}
	for i := range flags {
		dest = append(dest, &flags[i])
	}
	err := resolved.DB.QueryRowContext(ctx, q, a.values...).Scan(dest...)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrHumanIdentityNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query human identity detail: %w", err)
	}
	d.MFAActive = hiNullBool(mfa)
	d.ConsoleAccess = hiNullBool(console)
	d.LastActivityAt = hiNullTime(lastAct)
	d.CreatedAtSource = hiNullTime(created)
	d.PersonID = hiNullString(person)
	d.Details = []byte(details)

	signIn, err := parseHumanSignIn(details)
	if err != nil {
		return nil, fmt.Errorf("parse human identity details: %w", err)
	}
	d.SignIn = signIn
	d.RiskSignals = humanSignalsFromFlags(flags)

	// Access rows, with each policy document and its admin and escalation flags.
	accessQ := fmt.Sprintf(`
		SELECT a.id::text, a.account_id, a.access_type,
		       a.permission_set_name, a.permission_set_arn, a.role_arn, a.policy_arn,
		       a.granted_via, a.group_id, a.session_duration, a.last_used_at,
		       a.policy_document::jsonb::text,
		       COALESCE((%[2]s), false),
		       COALESCE((%[3]s), false),
		       to_jsonb(a)->>'policy_name',
		       (SELECT g.group_name FROM %[1]s.human_identity_groups g
		         WHERE g.human_id = a.human_id AND a.group_id IS NOT NULL
		           AND (g.group_id = a.group_id OR g.id::text = a.group_id)
		         LIMIT 1)
		FROM %[1]s.human_identity_access a
		WHERE a.human_id = $1
		ORDER BY a.access_type, a.account_id`,
		schema, adminAccessCond("a"), escalationAccessCond("a"))

	d.Access = make([]HumanAccessItem, 0)
	accessRows, err := resolved.DB.QueryContext(ctx, accessQ, d.ID)
	if err != nil {
		return nil, fmt.Errorf("query human identity access: %w", err)
	}
	defer accessRows.Close()
	for accessRows.Next() {
		var it HumanAccessItem
		var pName, pARN, role, policy, group, session sql.NullString
		var lastUsed sql.NullTime
		var policyDoc, policyName, groupName sql.NullString
		if err := accessRows.Scan(
			&it.ID, &it.AccountID, &it.AccessType,
			&pName, &pARN, &role, &policy,
			&it.GrantedVia, &group, &session, &lastUsed,
			&policyDoc, &it.IsAdmin, &it.HasEscalation,
			&policyName, &groupName,
		); err != nil {
			return nil, fmt.Errorf("scan human identity access: %w", err)
		}
		it.PermissionSetName = hiNullString(pName)
		it.PermissionSetARN = hiNullString(pARN)
		it.RoleARN = hiNullString(role)
		it.PolicyARN = hiNullString(policy)
		it.GroupID = hiNullString(group)
		it.PolicyName = hiNullString(policyName)
		it.GroupName = hiNullString(groupName)
		it.SessionDuration = hiNullString(session)
		it.LastUsedAt = hiNullTime(lastUsed)
		if policyDoc.Valid {
			it.PolicyDocument = json.RawMessage(policyDoc.String)
		}
		d.Access = append(d.Access, it)
	}
	if err := accessRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate human identity access: %w", err)
	}

	// Groups.
	d.Groups = make([]HumanGroupItem, 0)
	groupRows, err := resolved.DB.QueryContext(ctx, fmt.Sprintf(`
		SELECT g.id::text, g.source, g.group_id, COALESCE(g.group_name, '')
		FROM %s.human_identity_groups g
		WHERE g.human_id = $1
		ORDER BY g.group_name`, schema), d.ID)
	if err != nil {
		return nil, fmt.Errorf("query human identity groups: %w", err)
	}
	defer groupRows.Close()
	for groupRows.Next() {
		var it HumanGroupItem
		if err := groupRows.Scan(&it.ID, &it.Source, &it.GroupID, &it.GroupName); err != nil {
			return nil, fmt.Errorf("scan human identity group: %w", err)
		}
		d.Groups = append(d.Groups, it)
	}
	if err := groupRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate human identity groups: %w", err)
	}

	// Credentials: metadata only.
	d.Credentials = make([]HumanCredentialItem, 0)
	credRows, err := resolved.DB.QueryContext(ctx, fmt.Sprintf(`
		SELECT c.id::text, c.credential_type, c.credential_ref, COALESCE(c.status, ''),
		       c.mfa_type, c.created_at, c.last_rotated_at, c.last_used_at, c.last_used_service
		FROM %s.human_identity_credentials c
		WHERE c.human_id = $1
		ORDER BY c.credential_type, c.created_at DESC NULLS LAST`, schema), d.ID)
	if err != nil {
		return nil, fmt.Errorf("query human identity credentials: %w", err)
	}
	defer credRows.Close()
	for credRows.Next() {
		var it HumanCredentialItem
		var mfaType, lastSvc sql.NullString
		var created, rotated, used sql.NullTime
		if err := credRows.Scan(
			&it.ID, &it.CredentialType, &it.CredentialRef, &it.Status,
			&mfaType, &created, &rotated, &used, &lastSvc,
		); err != nil {
			return nil, fmt.Errorf("scan human identity credential: %w", err)
		}
		it.MFAType = hiNullString(mfaType)
		it.CreatedAt = hiNullTime(created)
		it.LastRotatedAt = hiNullTime(rotated)
		it.LastUsedAt = hiNullTime(used)
		it.LastUsedService = hiNullString(lastSvc)
		d.Credentials = append(d.Credentials, it)
	}
	if err := credRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate human identity credentials: %w", err)
	}

	return &d, nil
}

// humanConsoleLoginRaw is one console sign-in event as stored in details.
type humanConsoleLoginRaw struct {
	At       string `json:"at"`
	Region   string `json:"region"`
	MFAUsed  string `json:"mfa_used"`
	SourceIP string `json:"source_ip"`
}

// humanDetailsRaw reads only the sign-in fields from details.
type humanDetailsRaw struct {
	LastConsoleLogin       *humanConsoleLoginRaw `json:"last_console_login"`
	LastFailedConsoleLogin *humanConsoleLoginRaw `json:"last_failed_console_login"`
}

// parseHumanSignIn returns nil when the identity has no sign-in data. Details it
// cannot read as sign-in data are treated as none rather than failing the page.
func parseHumanSignIn(details string) (*HumanSignIn, error) {
	var raw humanDetailsRaw
	if err := json.Unmarshal([]byte(details), &raw); err != nil {
		return nil, nil
	}
	success := toHumanConsoleLogin(raw.LastConsoleLogin)
	failure := toHumanConsoleLogin(raw.LastFailedConsoleLogin)
	if success == nil && failure == nil {
		return nil, nil
	}
	return &HumanSignIn{LastSuccess: success, LastFailure: failure}, nil
}

func toHumanConsoleLogin(raw *humanConsoleLoginRaw) *HumanConsoleLogin {
	if raw == nil {
		return nil
	}
	out := &HumanConsoleLogin{Region: raw.Region, SourceIP: raw.SourceIP}
	if t, err := time.Parse(time.RFC3339, raw.At); err == nil {
		out.At = &t
	}
	switch strings.ToLower(strings.TrimSpace(raw.MFAUsed)) {
	case "yes", "true":
		v := true
		out.MFAUsed = &v
	case "no", "false":
		v := false
		out.MFAUsed = &v
	}
	return out
}

func stringsOrEmpty(v pq.StringArray) []string {
	if v == nil {
		return []string{}
	}
	return []string(v)
}

func hiNullString(v sql.NullString) *string {
	if !v.Valid {
		return nil
	}
	s := v.String
	return &s
}

func hiNullBool(v sql.NullBool) *bool {
	if !v.Valid {
		return nil
	}
	b := v.Bool
	return &b
}

func hiNullTime(v sql.NullTime) *time.Time {
	if !v.Valid {
		return nil
	}
	t := v.Time
	return &t
}

// PostureRef returns the ARN and user name of one human identity in scope,
// for matching it to its posture row. ErrHumanIdentityNotFound when it is
// not visible to the caller.
func (r *HumanIdentityRepository) PostureRef(ctx context.Context, resolved *scope.DataScope, id string) (string, string, error) {
	if resolved == nil || resolved.DB == nil {
		return "", "", ErrScopeRequired
	}
	a := &humanArgs{}
	whereSQL := strings.Join(humanWhere(resolved, a, "", "", nil, nil, "", ""), " AND ")
	idPh := a.add(id)
	q := fmt.Sprintf(`SELECT COALESCE(h.arn, ''), COALESCE(h.user_name, '') FROM %s.human_identities h WHERE %s AND h.id::text = %s`,
		resolved.QSchema(), whereSQL, idPh)
	var arn, name string
	err := resolved.DB.QueryRowContext(ctx, q, a.values...).Scan(&arn, &name)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", ErrHumanIdentityNotFound
	}
	if err != nil {
		return "", "", fmt.Errorf("human posture ref: %w", err)
	}
	return arn, name, nil
}
