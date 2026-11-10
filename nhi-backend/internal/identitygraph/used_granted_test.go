package identitygraph

import (
	"testing"

	"nhi-backend-api/internal/identitygraph/eventstore"
)

// The reported case (nhi-lambda-cloudtrail-generator): five actions allowed,
// calls only to actions none of them allows. The summary said 4 used and 1
// never used while every row read "Never used"; both must now say 0 used.
func TestUsedGrantedCountIgnoresCallsNoEntryAllows(t *testing.T) {
	granted := []GrantedAction{
		{Service: "cloudtrail", Action: "cloudtrail:LookupEvents"}, {Service: "s3", Action: "s3:PutObject"},
		{Service: "logs", Action: "logs:CreateLogStream"}, {Service: "logs", Action: "logs:PutLogEvents"},
		{Service: "kms", Action: "kms:Decrypt"},
	}
	sets := map[string][]eventstore.UsedAction{"arn:role": {
		{Service: "sts", Action: "GetCallerIdentity"}, {Service: "lambda", Action: "GetFunction"},
		{Service: "ec2", Action: "DescribeRegions"}, {Service: "iam", Action: "ListRoles"},
	}}
	if got := UsedGrantedCount(sets, []string{"arn:role"}, granted); got != 0 {
		t.Fatalf("used = %d, want 0", got)
	}
	sets["arn:role"] = append(sets["arn:role"], eventstore.UsedAction{Service: "s3", Action: "PutObject"}, eventstore.UsedAction{Service: "logs", Action: "PutLogEvents"})
	if got := UsedGrantedCount(sets, []string{"arn:role"}, granted); got != 2 {
		t.Fatalf("used = %d, want 2", got)
	}
	// Wildcards cover what they match; Deny entries allow nothing.
	wild := GrantedActionsFrom([]map[string]interface{}{{"service": "s3", "action": "s3:*"}, {"service": "logs", "action": "logs:PutLogEvents", "effect": "Deny"}})
	if got := UsedGrantedCount(sets, []string{"arn:role"}, wild); got != 1 {
		t.Fatalf("wildcard used = %d, want 1", got)
	}
	// No entries recorded: every distinct action counts, as before.
	if got := UsedGrantedCount(sets, []string{"arn:role"}, nil); got != 6 {
		t.Fatalf("no entries: used = %d, want 6", got)
	}
}
