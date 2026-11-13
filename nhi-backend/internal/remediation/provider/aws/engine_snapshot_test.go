package awsprov

import (
	"testing"

	"nhi-backend-api/internal/remediation/catalog"
)

// Engine (internal/autorem) rollback snapshots convert to the handler format.
func TestFromEngineSnapshot(t *testing.T) {
	trust := `{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":"*"},"Action":"sts:AssumeRole"}]}`
	s, err := fromEngineSnapshot(catalog.RewriteTrust, map[string]any{"role_arn": "arn:aws:iam::884264984984:role/ispm-test-trust", "trust_policy": trust})
	if err != nil || str(s, "role_name") != "ispm-test-trust" || str(s, "trust_policy") != trust {
		t.Fatalf("rewrite_trust: %v %v", s, err)
	}
	s, _ = fromEngineSnapshot(catalog.SetSessionDuration, map[string]any{"role_arn": "arn:aws:iam::1:role/path/vendor", "max_session_duration": float64(43200)})
	if str(s, "role_name") != "vendor" || integer(s, "max_session_duration", 0) != 43200 {
		t.Fatalf("set_session_duration: %v", s)
	}
	s, _ = fromEngineSnapshot(catalog.UpdateKeyPolicy, map[string]any{"key_arn": "arn:aws:kms:ap-south-1:1:key/k", "key_policy": trust})
	if str(s, "policy") != trust {
		t.Fatalf("update_key_policy: %v", s)
	}
	s, _ = fromEngineSnapshot(catalog.UpdateSecretPolicy, map[string]any{"secret_arn": "arn:aws:secretsmanager:ap-south-1:1:secret:x", "resource_policy": trust})
	if str(s, "policy") != trust {
		t.Fatalf("update_secret_policy: %v", s)
	}
	s, _ = fromEngineSnapshot(catalog.RevokeGrant, map[string]any{"key_arn": "k", "grants": []any{map[string]any{
		"grant_id": "g1", "grantee": "arn:aws:iam::9:role/x", "retiring_principal": "arn:aws:iam::9:root", "operations": []any{"Decrypt"}}}})
	gs := s["grants"].([]grantInfo)
	if len(gs) != 1 || gs[0].ID != "g1" || gs[0].Retiring != "arn:aws:iam::9:root" || gs[0].Operations[0] != "Decrypt" {
		t.Fatalf("revoke_grant: %+v", gs)
	}
	s, _ = fromEngineSnapshot(catalog.DeactivateKey, map[string]any{"user_name": "ci", "access_key_id": "AKIA1", "status": "Active"})
	if str(s, "user_name") != "ci" || str(s, "access_key_id") != "AKIA1" {
		t.Fatalf("deactivate_key: %v", s)
	}
	if _, err := fromEngineSnapshot(catalog.DeactivateKey, map[string]any{}); err == nil {
		t.Fatal("an empty snapshot must be an error")
	}
}
