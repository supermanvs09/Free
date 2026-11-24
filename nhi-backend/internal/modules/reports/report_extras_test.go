package reports

import "testing"

func TestSentenceEnd(t *testing.T) {
	for in, want := range map[string]string{
		"Switch to OIDC federation (e.g. GitHub OIDC). Then delete the key.": "Switch to OIDC federation (e.g. GitHub OIDC).",
		"Rotate it. Then remove it.":                                         "Rotate it.",
		"No sentence end here":                                               "No sentence end here",
		"Use roles, i.e. no keys etc":                                        "Use roles, i.e. no keys etc",
	} {
		if got := actionText(CheckGroup{Fix: in}); got != want {
			t.Errorf("%q: got %q want %q", in, got, want)
		}
	}
}
