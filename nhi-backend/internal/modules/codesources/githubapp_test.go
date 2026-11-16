package codesources

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/golang-jwt/jwt/v5"
)

func TestGitHubAppInstalledOn(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	pemText := string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}))

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tok, err := jwt.Parse(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "), func(*jwt.Token) (any, error) { return &key.PublicKey, nil })
		if err != nil || !tok.Valid || r.URL.Path != "/app/installations" {
			http.Error(w, "bad", http.StatusUnauthorized)
			return
		}
		if iss, _ := tok.Claims.GetIssuer(); iss != "12345" {
			http.Error(w, "wrong app", http.StatusUnauthorized)
			return
		}
		w.Write([]byte(`[{"account":{"login":"Acme-Corp"},"suspended_at":null},{"account":{"login":"paused-org"},"suspended_at":"2026-01-01T00:00:00Z"}]`))
	}))
	defer srv.Close()

	// The PEM as one env line with "\n" written out, and as base64: both load.
	for _, value := range []string{strings.ReplaceAll(pemText, "\n", `\n`), base64.StdEncoding.EncodeToString([]byte(pemText))} {
		t.Setenv("NHI_GITHUB_APP_ID", "12345")
		t.Setenv("NHI_GITHUB_APP_PRIVATE_KEY", value)
		t.Setenv("NHI_GITHUB_API_URL", srv.URL)
		app, err := loadGitHubApp()
		if err != nil || app == nil {
			t.Fatalf("load: %v", err)
		}
		for org, want := range map[string]bool{"acme-corp": true, "paused-org": false, "other": false} {
			got, err := app.installedOn(context.Background(), srv.Client(), org)
			if err != nil || got != want {
				t.Errorf("installedOn(%q) = %v, %v; want %v", org, got, err, want)
			}
		}
	}
}

func TestGitHubAppNotConfigured(t *testing.T) {
	t.Setenv("NHI_GITHUB_APP_ID", "")
	t.Setenv("NHI_GITHUB_APP_PRIVATE_KEY", "")
	if app, err := loadGitHubApp(); app != nil || err != nil {
		t.Fatalf("unset: %v %v", app, err)
	}
	t.Setenv("NHI_GITHUB_APP_ID", "12345")
	if _, err := loadGitHubApp(); err == nil {
		t.Fatal("an ID without a key must be reported")
	}
}
