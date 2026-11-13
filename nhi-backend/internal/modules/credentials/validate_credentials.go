package credentials

var credentialsListAllowed = map[string]struct{}{
	"page": {}, "page_size": {}, "search": {},
	"credential_type": {}, "status": {}, "owner_principal_arn": {},
	"rotation_enabled": {}, "rotation_overdue": {},
	"is_orphaned": {}, "has_external_trust": {},
	"min_idle_days": {}, "max_days_until_expiry": {}, "expired": {},
	"sort_by": {}, "sort_order": {},
}

var credentialDetailAllowed = map[string]struct{}{
	"tab": {}, "time_range": {}, "start_date": {}, "end_date": {},
	"depth": {}, "edge_type": {}, "page": {}, "page_size": {},
}

var credentialSortColumnsAllowed = map[string]struct{}{
	"name": {}, "arn": {}, "credential_type": {}, "account_id": {},
	"region": {}, "status": {}, "last_used_at": {}, "last_rotated_at": {},
	"expires_at": {}, "age_days": {}, "idle_days": {},
	"days_until_expiry": {}, "bound_identities_count": {},
}

var validCredentialTabs = map[string]struct{}{
	"overview": {}, "trust": {}, "activity": {}, "rotation": {}, "sessions": {},
	"relationships": {}, "raw": {}, "changes": {},
}
