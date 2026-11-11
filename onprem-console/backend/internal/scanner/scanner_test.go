package scanner

import (
	"strings"
	"testing"
)

// Fixtures are assembled at run time so no key-shaped literal sits in the
// source, where GitHub push protection (rightly) refuses it.
func j(parts ...string) string { return strings.Join(parts, "") }

func TestScanFindsSecretsAndKeepsThemRedacted(t *testing.T) {
	src := strings.Join([]string{
		"aws_access_key_id = " + j("AKIA", "Z7Q3XK2PLM4NVB6T"),
		`aws_secret_access_key = "` + j("wJalrXUtnFEMI/K7MD", "ENG/bPxRfiCYzzQ3XK2PLM") + `"`,
		"token: " + j("ghp_", "aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3z5A"),
		`-----BEGIN RSA PRIVATE KEY-----`,
		`db_password = "Sup3rS3cretValue!"`,
		`password = "changeme"`,
		`api_key: "${API_KEY}"`,
		"example = " + j("AKIA", "IOSFODNN7EXAMPLE"),
	}, "\n")
	got := Scan([]byte(src))
	names := map[string]int{}
	for _, f := range got {
		names[f.Detector] = f.Line
		if strings.Contains(src, f.Redacted) && f.Detector != "private_key" {
			t.Errorf("%s: redacted %q still appears in the source", f.Detector, f.Redacted)
		}
	}
	want := map[string]int{"aws_access_key_id": 1, "aws_secret_access_key": 2, "github_token": 3, "private_key": 4, "password_assignment": 5}
	for name, line := range want {
		if names[name] != line {
			t.Errorf("%s at line %d, want %d (all: %v)", name, names[name], line, names)
		}
	}
	if len(got) != len(want) {
		t.Errorf("found %d, want %d: %+v", len(got), len(want), got)
	}
}

func TestScanSkipsBinaryAndVendored(t *testing.T) {
	if Scan([]byte(j("AKIA", "Z7Q3XK2PLM4NVB6T", "\x00\x01"))) != nil {
		t.Fatal("binary content was scanned")
	}
	for _, p := range []string{"node_modules/x/a.js", "web/vendor/lib.go", "logo.png", "package-lock.json"} {
		if !Skip(p) {
			t.Errorf("Skip(%q) = false", p)
		}
	}
	if Skip("src/config.py") {
		t.Error("source file skipped")
	}
}

func TestFingerprintIsStable(t *testing.T) {
	if Fingerprint("a", "x") != Fingerprint("a", "x") || Fingerprint("a", "x") == Fingerprint("b", "x") {
		t.Fatal("fingerprint is not stable per detector and value")
	}
}
