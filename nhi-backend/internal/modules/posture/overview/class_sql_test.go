package overview

import (
	"reflect"
	"testing"
)

func TestClassScopingAddsOneBindAtTheEnd(t *testing.T) {
	if got := classSQL("", 2); got != "" {
		t.Fatalf("no class must add nothing, got %q", got)
	}
	if got := classSQL("HI", 4); got != " AND CASE WHEN upper(COALESCE(identity_class, 'NHI')) IN ('HI', 'HUMAN') THEN 'HI' ELSE 'NHI' END = $4" {
		t.Fatalf("got %q", got)
	}
	if got := classArgs("t1", "", "a", 3); !reflect.DeepEqual(got, []any{"t1", "a", 3}) {
		t.Fatalf("no class: %v", got)
	}
	if got := classArgs("t1", "HI", "a", 3); !reflect.DeepEqual(got, []any{"t1", "a", 3, "HI"}) {
		t.Fatalf("with class the value is last, so its $n is len(args): %v", got)
	}
}
