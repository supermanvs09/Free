// Package scanner finds secrets in file contents. It returns what was found
// in redacted form with a fingerprint; the value itself never leaves this
// package, so it cannot reach the database, a log or an API answer.
package scanner

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"path"
	"regexp"
	"strings"
)

type Detector struct {
	Name     string
	Severity string // critical | high | medium | low
	re       *regexp.Regexp
	group    int // capture group holding the secret (0 = whole match)
}

// Detectors, most specific first: a line is reported once, by the first match.
var Detectors = []Detector{
	{Name: "private_key", Severity: "critical", re: regexp.MustCompile(`-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----`)},
	{Name: "aws_secret_access_key", Severity: "critical", re: regexp.MustCompile(`(?i)aws.{0,24}(?:secret|private).{0,24}['"=:\s]([0-9A-Za-z/+]{40})(?:['"\s]|$)`), group: 1},
	{Name: "github_token", Severity: "critical", re: regexp.MustCompile(`\b(gh[pousr]_[A-Za-z0-9]{36,255})\b`), group: 1},
	{Name: "github_fine_grained_token", Severity: "critical", re: regexp.MustCompile(`\b(github_pat_[A-Za-z0-9_]{60,255})\b`), group: 1},
	{Name: "stripe_live_key", Severity: "critical", re: regexp.MustCompile(`\b((?:sk|rk)_live_[0-9A-Za-z]{24,})\b`), group: 1},
	{Name: "aws_access_key_id", Severity: "high", re: regexp.MustCompile(`\b((?:AKIA|ASIA|ABIA|ACCA|A3T[A-Z0-9])[A-Z0-9]{16})\b`), group: 1},
	{Name: "slack_token", Severity: "high", re: regexp.MustCompile(`\b(xox[abprs]-[A-Za-z0-9-]{10,})\b`), group: 1},
	{Name: "google_api_key", Severity: "high", re: regexp.MustCompile(`\b(AIza[0-9A-Za-z_\-]{35})\b`), group: 1},
	{Name: "slack_webhook", Severity: "medium", re: regexp.MustCompile(`(https://hooks\.slack\.com/services/T[A-Z0-9]+/B[A-Z0-9]+/[A-Za-z0-9]+)`), group: 1},
	{Name: "jwt", Severity: "medium", re: regexp.MustCompile(`\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b`), group: 1},
	{Name: "password_assignment", Severity: "medium", re: regexp.MustCompile(`(?i)\b[a-z0-9_.-]*(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)["']?\s*[:=]\s*["']([^"'\s]{8,})["']`), group: 1},
}

// Values that are obviously not secrets: examples, templates and variables.
var placeholder = regexp.MustCompile(`(?i)^(?:x{4,}|\*{4,}|changeme|change_me|password|secret|example|sample|dummy|test|null|none|your[_-].*|<.*>|\$\{.*\}|\{\{.*\}\}|%\(.*\)s|.*example.*|AKIAIOSFODNN7EXAMPLE)$`)

type Finding struct {
	Detector    string
	Severity    string
	Line        int
	Redacted    string
	Fingerprint string
}

var skipExt = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".ico": true, ".svg": true, ".webp": true,
	".pdf": true, ".zip": true, ".gz": true, ".tgz": true, ".jar": true, ".war": true, ".class": true,
	".woff": true, ".woff2": true, ".ttf": true, ".eot": true, ".mp4": true, ".mp3": true, ".lock": true,
	".so": true, ".dll": true, ".exe": true, ".bin": true,
}

// Skip reports whether a path is not worth reading: binaries, archives,
// lock files and vendored dependencies.
func Skip(filePath string) bool {
	p := strings.ToLower(filePath)
	if skipExt[path.Ext(p)] {
		return true
	}
	for _, dir := range []string{"node_modules/", "vendor/", ".git/", "dist/", "bower_components/"} {
		if strings.HasPrefix(p, dir) || strings.Contains(p, "/"+dir) {
			return true
		}
	}
	return strings.HasSuffix(p, "package-lock.json") || strings.HasSuffix(p, "yarn.lock") || strings.HasSuffix(p, "go.sum")
}

// Scan returns the secrets in content. A binary file (a NUL byte in its first
// 8 KB) is skipped.
func Scan(content []byte) []Finding {
	head := content
	if len(head) > 8192 {
		head = head[:8192]
	}
	if bytes.IndexByte(head, 0) >= 0 {
		return nil
	}
	var out []Finding
	seen := map[string]bool{}
	for i, line := range strings.Split(string(content), "\n") {
		if len(line) > 4000 { // minified bundles: one huge line, mostly noise
			line = line[:4000]
		}
		for _, d := range Detectors {
			m := d.re.FindStringSubmatch(line)
			if m == nil {
				continue
			}
			value := m[d.group]
			if d.Name == "password_assignment" && placeholder.MatchString(value) {
				continue
			}
			if d.Name == "aws_access_key_id" && strings.Contains(value, "EXAMPLE") {
				continue
			}
			fp := Fingerprint(d.Name, value)
			if seen[fp] {
				break
			}
			seen[fp] = true
			out = append(out, Finding{Detector: d.Name, Severity: d.Severity, Line: i + 1, Redacted: Redact(value), Fingerprint: fp})
			break
		}
	}
	return out
}

// Redact keeps enough to recognise a secret, never enough to use it.
func Redact(value string) string {
	if strings.HasPrefix(value, "-----BEGIN") {
		return value
	}
	n := len(value)
	switch {
	case n <= 8:
		return strings.Repeat("*", n)
	case n <= 16:
		return value[:2] + strings.Repeat("*", n-4) + value[n-2:]
	default:
		return value[:4] + strings.Repeat("*", 8) + value[n-4:]
	}
}

func Fingerprint(detector, value string) string {
	sum := sha256.Sum256([]byte(detector + "\x00" + value))
	return hex.EncodeToString(sum[:])
}
