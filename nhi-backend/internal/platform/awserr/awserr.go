// Package awserr makes AWS error text safe to show customers.
package awserr

import (
	"regexp"
	"strings"
)

/*
An AWS error names the caller - our scanner's account and task role - as in

	"User: arn:aws:sts::<ours>:assumed-role/<role>/<session> is not authorized".
	Customers must not see our side, so the caller is removed before a sync
	error leaves the API. Their own account and role ARN stay: they need those.
*/
var (
	callerRe = regexp.MustCompile(`(?i)\bUser:\s*arn:aws[a-z-]*:(?:sts|iam)::\d{12}:[\w+=,.@/:-]+\s*`)
	stsRe    = regexp.MustCompile(`(?i)arn:aws[a-z-]*:sts::\d{12}:[\w+=,.@/:-]+`)
	spaceRe  = regexp.MustCompile(`\s{2,}`)
)

// ScrubCaller removes our side (the calling account and role) from an AWS error.
func ScrubCaller(s string) string {
	if s == "" {
		return s
	}
	s = callerRe.ReplaceAllString(s, "")
	s = stsRe.ReplaceAllString(s, "the scanner")
	return strings.TrimSpace(spaceRe.ReplaceAllString(s, " "))
}
