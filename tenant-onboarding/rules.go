package main

import (
	"fmt"
	"regexp"
	"strings"
)

// The rules a company's details must meet. The database enforces the same ones
// (migrations/global/004_tenant_collector.sql), so the page says what is wrong
// before the database has to. Each check returns "" or a message for the person.
var (
	domainRE = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$`)
)

func checkAccount(v string) string {
	if !accountRE.MatchString(v) {
		return "Must be exactly 12 digits."
	}
	return ""
}

func checkExternal(v string) string {
	if !externalRE.MatchString(v) {
		return "Use 16-255 characters: letters, digits and + = , . @ : / _ -"
	}
	return ""
}

func checkBus(v string) string {
	if len(v) > 320 || !busARNRE.MatchString(v) {
		return "Must look like arn:aws:events:ap-south-1:123456789012:event-bus/default"
	}
	return ""
}

func checkDomain(v string) string {
	if len(v) > 255 || !domainRE.MatchString(v) {
		return "Use a lowercase domain with a dot, such as acme-corp.nhi.local."
	}
	return ""
}

// cleanRegions lower-cases, de-duplicates and checks a list of regions. The
// message is "" when every region is valid.
func cleanRegions(in []string) ([]string, string) {
	var out []string
	seen := map[string]bool{}
	for _, r := range in {
		r = strings.ToLower(strings.TrimSpace(r))
		if r == "" || seen[r] {
			continue
		}
		if !regionRE.MatchString(r) {
			return nil, fmt.Sprintf("%q is not a region such as ap-south-1.", r)
		}
		seen[r] = true
		out = append(out, r)
	}
	return out, ""
}
