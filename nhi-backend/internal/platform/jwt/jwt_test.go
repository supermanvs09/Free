package jwt

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"
)

const testSecret = "0123456789abcdef0123456789abcdef"

func TestTokenCarriesSessionID(t *testing.T) {
	tok, err := GenerateToken("a@b.com", "11111111-1111-1111-1111-111111111111", "tenant_a", "admin", "22222222-2222-2222-2222-222222222222", testSecret, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	claims, err := ValidateToken(tok, testSecret)
	if err != nil {
		t.Fatal(err)
	}
	if claims.ID != "22222222-2222-2222-2222-222222222222" {
		t.Fatalf("jti = %q", claims.ID)
	}
}

func TestGenerateTokenRequiresSessionID(t *testing.T) {
	_, err := GenerateToken("a@b.com", "t", "d", "r", " ", testSecret, time.Minute)
	if err == nil || !strings.Contains(err.Error(), "session") {
		t.Fatalf("expected session id error, got %v", err)
	}
}

// The discovery scan service reads db_name from the token.
func TestTokenCarriesDBName(t *testing.T) {
	tok, err := GenerateToken("a@b.com", "11111111-1111-1111-1111-111111111111", "tenant_a", "admin", "22222222-2222-2222-2222-222222222222", testSecret, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	claims, err := ValidateToken(tok, testSecret)
	if err != nil || claims.DBName != "tenant_a" {
		t.Fatalf("db_name = %q, %v", claims.DBName, err)
	}
	payload, _ := base64.RawURLEncoding.DecodeString(strings.Split(tok, ".")[1])
	if !strings.Contains(string(payload), `"db_name":"tenant_a"`) {
		t.Fatalf("token payload lacks db_name: %s", payload)
	}
	if _, err := GenerateToken("a@b.com", "t", "", "r", "s", testSecret, time.Minute); err == nil {
		t.Fatal("a token without a database name must be refused")
	}
}
