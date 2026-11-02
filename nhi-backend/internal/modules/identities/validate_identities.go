package identities

var identitiesListAllowed = map[string]struct{}{
	"page": {}, "page_size": {}, "search": {},
	"identity_type": {}, "functional_class": {}, "environment": {},
	"status": {}, "owner": {}, "vpc_id": {},
	"is_publicly_accessible": {}, "min_idle_days": {},
	"sort_by": {}, "sort_order": {},
}

var IdentityDetailAllowed = map[string]struct{}{
	"tab": {}, "time_range": {}, "start_date": {}, "end_date": {},
	"service": {}, "used_only": {}, "depth": {}, "edge_type": {},
	"page": {}, "page_size": {},
}

// sort_by enums — must match repository maps
var identitySortColumnsAllowed = map[string]struct{}{
	"name": {}, "arn": {}, "identity_type": {}, "functional_class": {},
	"account_id": {}, "region": {}, "environment": {}, "owner": {},
	"status": {}, "last_activity_at": {}, "created_at_aws": {},
	"age_days": {}, "idle_days": {}, "bound_credentials_count": {},
	"permission_utilization_pct": {},
}

var validIdentityTabs = map[string]struct{}{
	"overview": {}, "permissions": {}, "activity": {}, "relationships": {},
	"credentials": {}, "raw": {}, "changes": {},
}
