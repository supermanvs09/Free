package datasource

import (
	"context"
	"reflect"
	"testing"
)

func TestRecorder(t *testing.T) {
	ctx, rec := With(context.Background())
	From(ctx).Postgres("nhi_acme", "alerts")
	From(ctx).Postgres("nhi_acme", "alerts")
	From(ctx).ClickHouse("`acme`.`log_events`")
	From(context.Background()).Postgres("x", "y") // nil recorder: no panic
	pg, ch := rec.Tables()
	if !reflect.DeepEqual(pg, []string{"nhi_acme.alerts"}) || !reflect.DeepEqual(ch, []string{"acme.log_events"}) {
		t.Fatal(pg, ch)
	}
}
