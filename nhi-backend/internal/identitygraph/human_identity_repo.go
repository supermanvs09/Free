package identitygraph

import (
	"context"
	"database/sql"
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
}

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

// HumanIdentityRepository reads the human_identities, human_identity_access
// and human_identity_groups tables.
type HumanIdentityRepository struct{}

func NewHumanIdentityRepository() *HumanIdentityRepository {
	return &HumanIdentityRepository{}
}

type humanArgs struct{ values []any }

func (a *humanArgs) add(v any) string {
	a.values = append(a.values, v)
	return fmt.Sprintf("$%d", len(a.values))
}

// humanWhere is the single filter used by overview, list and detail, so the
// same scope and filters always produce the same counts.
func humanWhere(resolved *scope.DataScope, a *humanArgs, source, humanType string, statuses []string, mfa *bool, search string) []string {
	accounts := resolved.AccountIDs
	if accounts == nil {
		accounts = []string{}
	}
	where := []string{
		"h.deleted_at IS NULL",
		fmt.Sprintf("h.account_id = ANY(%s::text[])", a.add(pq.Array(accounts))),
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
	return where
}

// Overview returns the summary counts for the Overview tab.
func (r *HumanIdentityRepository) Overview(ctx context.Context, resolved *scope.DataScope, source string) (*HumanIdentityOverview, error) {
	if resolved == nil || resolved.DB == nil {
		return nil, ErrScopeRequired
	}
	a := &humanArgs{}
	whereSQL := strings.Join(humanWhere(resolved, a, source, "", nil, nil, ""), " AND ")

	// The source and type values are code constants, not user input, so they
	// are written into the SQL text.
	q := fmt.Sprintf(`
		SELECT
			COUNT(*)::int,
			COUNT(*) FILTER (WHERE h.source = '%[3]s')::int,
			COUNT(*) FILTER (WHERE h.source = '%[4]s')::int,
			COUNT(*) FILTER (WHERE h.status = 'active')::int,
			COUNT(*) FILTER (WHERE h.status = 'inactive')::int,
			COUNT(*) FILTER (WHERE h.status = 'suspended')::int,
			COUNT(*) FILTER (WHERE h.mfa_active IS TRUE)::int,
			COUNT(*) FILTER (WHERE h.mfa_active IS FALSE)::int,
			COUNT(*) FILTER (WHERE h.mfa_active IS NULL)::int,
			COUNT(*) FILTER (WHERE h.source = '%[3]s' AND h.last_activity_at < NOW() - INTERVAL '90 days')::int,
			COUNT(*) FILTER (WHERE h.source = '%[3]s' AND h.last_activity_at IS NULL)::int,
			COUNT(*) FILTER (WHERE h.console_access IS TRUE AND h.mfa_active IS NOT TRUE)::int,
			COUNT(*) FILTER (WHERE h.person_id IS NULL)::int,
			COUNT(*) FILTER (WHERE EXISTS (
				SELECT 1 FROM %[1]s.human_identity_access a
				WHERE a.human_id = h.id
				  AND (a.permission_set_name ILIKE '%%admin%%' OR a.policy_arn ILIKE '%%AdministratorAccess%%')
			))::int,
			COUNT(*) FILTER (WHERE h.human_type = '%[5]s')::int,
			(SELECT COUNT(*)::int FROM (
				SELECT h.person_id
				FROM %[1]s.human_identities h
				WHERE %[2]s AND h.person_id IS NOT NULL
				GROUP BY h.person_id
				HAVING COUNT(DISTINCT h.source) > 1
			) p)
		FROM %[1]s.human_identities h
		WHERE %[2]s`,
		resolved.QSchema(), whereSQL, HumanSourceIAM, HumanSourceSSO, HumanTypeRoot)

	var o HumanIdentityOverview
	err := resolved.DB.QueryRowContext(ctx, q, a.values...).Scan(
		&o.TotalIdentities,
		&o.BySource.IAM, &o.BySource.SSO,
		&o.ByStatus.Active, &o.ByStatus.Inactive, &o.ByStatus.Suspended,
		&o.MFA.Enabled, &o.MFA.Disabled, &o.MFA.Unknown,
		&o.InactiveOver90Days, &o.NeverUsed, &o.ConsoleWithoutMFA,
		&o.UnlinkedCount, &o.PrivilegedCount,
		&o.RootAccounts,
		&o.BySource.Both,
	)
	if err != nil {
		return nil, fmt.Errorf("query human identity overview: %w", err)
	}

	// Separate arg set: this query only uses the placeholders in its own WHERE.
	ta := &humanArgs{}
	typeWhere := strings.Join(humanWhere(resolved, ta, source, "", nil, nil, ""), " AND ")
	typeQ := fmt.Sprintf(`
		SELECT h.human_type, COUNT(*)::int
		FROM %[1]s.human_identities h
		WHERE %[2]s
		GROUP BY h.human_type`,
		resolved.QSchema(), typeWhere)
	typeRows, err := resolved.DB.QueryContext(ctx, typeQ, ta.values...)
	if err != nil {
		return nil, fmt.Errorf("query human identity types: %w", err)
	}
	defer typeRows.Close()
	o.ByHumanType = make(map[string]int)
	for typeRows.Next() {
		var t string
		var n int
		if err := typeRows.Scan(&t, &n); err != nil {
			return nil, fmt.Errorf("scan human identity type: %w", err)
		}
		o.ByHumanType[t] = n
	}
	if err := typeRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate human identity types: %w", err)
	}
	return &o, nil
}

// List returns one page of identities. The count uses the same WHERE clause
// as the rows, so the total always matches the overview.
func (r *HumanIdentityRepository) List(ctx context.Context, resolved *scope.DataScope, f HumanIdentityListFilter) (*HumanIdentityListResponse, error) {
	if resolved == nil || resolved.DB == nil {
		return nil, ErrScopeRequired
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

	a := &humanArgs{}
	whereSQL := strings.Join(humanWhere(resolved, a, f.Source, f.HumanType, f.Statuses, f.MFA, f.Search), " AND ")

	countQ := fmt.Sprintf(`SELECT COUNT(*)::int FROM %s.human_identities h WHERE %s`, resolved.QSchema(), whereSQL)
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

	q := fmt.Sprintf(`
		SELECT
			h.id::text, h.source, h.source_id, h.human_type, h.account_id,
			COALESCE(h.arn, ''), COALESCE(h.user_name, ''), COALESCE(h.display_name, ''), COALESCE(h.email, ''),
			h.status, h.mfa_active, h.console_access, h.last_activity_at, h.created_at_source,
			(SELECT COUNT(*)::int FROM %[1]s.human_identity_access a WHERE a.human_id = h.id),
			(SELECT COUNT(*)::int FROM %[1]s.human_identity_groups g WHERE g.human_id = h.id)
		FROM %[1]s.human_identities h
		WHERE %[2]s
		ORDER BY %[3]s %[4]s NULLS LAST, h.id %[4]s
		LIMIT %[5]s OFFSET %[6]s`,
		resolved.QSchema(), whereSQL, sortExpr, dir, limitPh, offsetPh)

	rows, err := resolved.DB.QueryContext(ctx, q, a.values...)
	if err != nil {
		return nil, fmt.Errorf("query human identities: %w", err)
	}
	defer rows.Close()

	items := make([]HumanIdentityListItem, 0)
	for rows.Next() {
		var it HumanIdentityListItem
		var mfa, console sql.NullBool
		var lastAct, created sql.NullTime
		if err := rows.Scan(
			&it.ID, &it.Source, &it.SourceID, &it.HumanType, &it.AccountID,
			&it.ARN, &it.UserName, &it.DisplayName, &it.Email,
			&it.Status, &mfa, &console, &lastAct, &created,
			&it.AccessCount, &it.GroupCount,
		); err != nil {
			return nil, fmt.Errorf("scan human identity row: %w", err)
		}
		it.MFAActive = hiNullBool(mfa)
		it.ConsoleAccess = hiNullBool(console)
		it.LastActivityAt = hiNullTime(lastAct)
		it.CreatedAtSource = hiNullTime(created)
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

// Detail returns one identity with its access and group rows. Risk signals
// are added by the service layer.
func (r *HumanIdentityRepository) Detail(ctx context.Context, resolved *scope.DataScope, id string) (*HumanIdentityDetail, error) {
	if resolved == nil || resolved.DB == nil {
		return nil, ErrScopeRequired
	}
	a := &humanArgs{}
	whereSQL := strings.Join(humanWhere(resolved, a, "", "", nil, nil, ""), " AND ")
	idPh := a.add(id)

	q := fmt.Sprintf(`
		SELECT
			h.id::text, h.source, h.source_id, h.human_type, h.account_id,
			COALESCE(h.arn, ''), COALESCE(h.user_name, ''), COALESCE(h.display_name, ''),
			COALESCE(h.given_name, ''), COALESCE(h.family_name, ''), COALESCE(h.title, ''),
			COALESCE(h.email, ''), COALESCE(h.external_id, ''), COALESCE(h.external_id_issuer, ''),
			COALESCE(h.idp_name, ''), h.status, h.mfa_active, h.console_access,
			h.last_activity_at, h.created_at_source, COALESCE(h.details::text, '{}'), h.person_id::text,
			h.first_seen_at, h.last_seen_at
		FROM %[1]s.human_identities h
		WHERE %[2]s AND h.id::text = %[3]s`,
		resolved.QSchema(), whereSQL, idPh)

	var d HumanIdentityDetail
	var mfa, console sql.NullBool
	var lastAct, created sql.NullTime
	var details string
	var person sql.NullString
	err := resolved.DB.QueryRowContext(ctx, q, a.values...).Scan(
		&d.ID, &d.Source, &d.SourceID, &d.HumanType, &d.AccountID,
		&d.ARN, &d.UserName, &d.DisplayName,
		&d.GivenName, &d.FamilyName, &d.Title,
		&d.Email, &d.ExternalID, &d.ExternalIDIssuer,
		&d.IDPName, &d.Status, &mfa, &console,
		&lastAct, &created, &details, &person,
		&d.FirstSeenAt, &d.LastSeenAt,
	)
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

	d.Access = make([]HumanAccessItem, 0)
	accessRows, err := resolved.DB.QueryContext(ctx, fmt.Sprintf(`
		SELECT a.id::text, a.account_id, a.access_type,
		       a.permission_set_name, a.permission_set_arn, a.role_arn, a.policy_arn,
		       a.granted_via, a.group_id, a.session_duration, a.last_used_at
		FROM %s.human_identity_access a
		WHERE a.human_id = $1
		ORDER BY a.access_type, a.account_id`, resolved.QSchema()), d.ID)
	if err != nil {
		return nil, fmt.Errorf("query human identity access: %w", err)
	}
	defer accessRows.Close()
	for accessRows.Next() {
		var it HumanAccessItem
		var pName, pARN, role, policy, group, session sql.NullString
		var lastUsed sql.NullTime
		if err := accessRows.Scan(
			&it.ID, &it.AccountID, &it.AccessType,
			&pName, &pARN, &role, &policy,
			&it.GrantedVia, &group, &session, &lastUsed,
		); err != nil {
			return nil, fmt.Errorf("scan human identity access: %w", err)
		}
		it.PermissionSetName = hiNullString(pName)
		it.PermissionSetARN = hiNullString(pARN)
		it.RoleARN = hiNullString(role)
		it.PolicyARN = hiNullString(policy)
		it.GroupID = hiNullString(group)
		it.SessionDuration = hiNullString(session)
		it.LastUsedAt = hiNullTime(lastUsed)
		d.Access = append(d.Access, it)
	}
	if err := accessRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate human identity access: %w", err)
	}

	d.Groups = make([]HumanGroupItem, 0)
	groupRows, err := resolved.DB.QueryContext(ctx, fmt.Sprintf(`
		SELECT g.id::text, g.source, g.group_id, COALESCE(g.group_name, '')
		FROM %s.human_identity_groups g
		WHERE g.human_id = $1
		ORDER BY g.group_name`, resolved.QSchema()), d.ID)
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

	return &d, nil
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
