package tenants

import "testing"

func TestOnly(t *testing.T) {
	list := []Tenant{
		{ID: "3f7b2c14-8e9a-4d2b-b6c8-5e9f1a2b3c4d", DBName: "bimasugam"},
		{ID: "4ad35eee-f9e0-4c43-a6de-a53aa52fe5b6", DBName: "das_tenant"},
		{ID: "de300000-0000-4000-8000-000000000001", DBName: "tenant_demo"},
	}
	if got := Only(list, nil); len(got) != 3 {
		t.Fatalf("empty list must keep every tenant, got %d", len(got))
	}
	got := Only(list, []string{" BimaSugam "})
	if len(got) != 1 || got[0].DBName != "bimasugam" {
		t.Fatalf("by schema name: %+v", got)
	}
	got = Only(list, []string{"4AD35EEE-F9E0-4C43-A6DE-A53AA52FE5B6", "bimasugam"})
	if len(got) != 2 {
		t.Fatalf("by id and name: %+v", got)
	}
	if got := Only(list, []string{"unknown"}); len(got) != 0 {
		t.Fatalf("unknown name must match nothing: %+v", got)
	}
}
