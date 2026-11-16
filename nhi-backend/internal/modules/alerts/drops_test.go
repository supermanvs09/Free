package alerts

import (
	"database/sql"
	"reflect"
	"testing"
)

func TestSplitReason(t *testing.T) {
	cases := map[string]struct {
		text string
		pts  int
	}{
		"Administrator access on NHI role (-25)": {"Administrator access on NHI role", 25},
		"Trust policy Principal:* (-25)":         {"Trust policy Principal:*", 25},
		"Wildcard actions (−8 points)":           {"Wildcard actions", 8},
		"No number here":                         {"No number here", 0},
	}
	for in, want := range cases {
		text, pts := splitReason(in)
		if text != want.text || pts != want.pts {
			t.Errorf("splitReason(%q) = %q, %d; want %q, %d", in, text, pts, want.text, want.pts)
		}
	}
}

func TestParseReasons(t *testing.T) {
	want := []string{"A (-25)", "B (-5)"}
	for _, raw := range []string{
		`["A (-25)", "B (-5)"]`,      // jsonb or text[] through to_jsonb
		`"[\"A (-25)\",\"B (-5)\"]"`, // a text column holding JSON
	} {
		if got := parseReasons(sql.NullString{String: raw, Valid: true}); !reflect.DeepEqual(got, want) {
			t.Errorf("parseReasons(%s) = %v", raw, got)
		}
	}
	if got := parseReasons(sql.NullString{String: `"only one"`, Valid: true}); !reflect.DeepEqual(got, []string{"only one"}) {
		t.Errorf("single reason: %v", got)
	}
	if got := parseReasons(sql.NullString{}); got != nil {
		t.Errorf("null: %v", got)
	}
}
