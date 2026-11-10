package passwordpolicy

import "testing"

func TestCheck(t *testing.T) {
	bad := []string{"111111111111", "            ", "abcdefghijkl", "ABCDEFGHIJKL", "Abcdefghijk1", " StrongPass1!", "StrongPass1! ", "Sh0rt!"}
	for _, pw := range bad {
		if Check(pw) == "" {
			t.Errorf("Check(%q) accepted a weak password", pw)
		}
	}
	for _, pw := range []string{"StrongPass123!", "Correct horse 9#"} {
		if msg := Check(pw); msg != "" {
			t.Errorf("Check(%q) = %q, want accepted", pw, msg)
		}
	}
}
