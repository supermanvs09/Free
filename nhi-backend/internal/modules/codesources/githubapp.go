package codesources

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

/*
 * GitHub App credentials held by this API, so Verify asks GitHub directly
 * instead of going through the secret scanner:
 *
 *   NHI_GITHUB_APP_ID                 the App's ID (a number)
 *   NHI_GITHUB_APP_PRIVATE_KEY        its private key: the PEM text (real or
 *                                     "\n"-escaped newlines) or the PEM in base64
 *   NHI_GITHUB_APP_PRIVATE_KEY_FILE   or a path to the .pem file
 *   NHI_GITHUB_API_URL                optional; GitHub Enterprise Server's
 *                                     https://<host>/api/v3 (default api.github.com)
 *
 * The key signs a 10-minute App JWT (RS256), which lists the App's
 * installations. Nothing is stored and no installation token is minted.
 */
type githubApp struct {
	appID string
	key   *rsa.PrivateKey
	api   string
}

// loadGitHubApp reads the App from the environment; nil when it is not set
// up. A key that is set but unreadable is an error, so a deploy with a bad
// key says so at start instead of failing every Verify.
func loadGitHubApp() (*githubApp, error) {
	id := strings.TrimSpace(os.Getenv("NHI_GITHUB_APP_ID"))
	pemText := strings.TrimSpace(os.Getenv("NHI_GITHUB_APP_PRIVATE_KEY"))
	if file := strings.TrimSpace(os.Getenv("NHI_GITHUB_APP_PRIVATE_KEY_FILE")); pemText == "" && file != "" {
		b, err := os.ReadFile(file)
		if err != nil {
			return nil, fmt.Errorf("read NHI_GITHUB_APP_PRIVATE_KEY_FILE: %w", err)
		}
		pemText = string(b)
	}
	if id == "" && pemText == "" {
		return nil, nil
	}
	if id == "" || pemText == "" {
		return nil, fmt.Errorf("GitHub App: set both NHI_GITHUB_APP_ID and NHI_GITHUB_APP_PRIVATE_KEY (or _FILE)")
	}
	if _, err := strconv.ParseInt(id, 10, 64); err != nil {
		return nil, fmt.Errorf("GitHub App: NHI_GITHUB_APP_ID must be the App's numeric ID")
	}
	key, err := parseAppKey(pemText)
	if err != nil {
		return nil, err
	}
	api := strings.TrimRight(strings.TrimSpace(os.Getenv("NHI_GITHUB_API_URL")), "/")
	if api == "" {
		api = "https://api.github.com"
	}
	return &githubApp{appID: id, key: key, api: api}, nil
}

// parseAppKey accepts the PEM as GitHub gives it, with "\n" written out (one
// line in an env file), or base64 of the PEM.
func parseAppKey(text string) (*rsa.PrivateKey, error) {
	text = strings.ReplaceAll(strings.TrimSpace(text), `\n`, "\n")
	if !strings.Contains(text, "-----BEGIN") {
		if b, err := base64.StdEncoding.DecodeString(text); err == nil {
			text = string(b)
		}
	}
	key, err := jwt.ParseRSAPrivateKeyFromPEM([]byte(text))
	if err != nil {
		return nil, fmt.Errorf("GitHub App: the private key is not a valid RSA PEM key: %w", err)
	}
	return key, nil
}

func (a *githubApp) jwt(now time.Time) (string, error) {
	return jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iat": now.Add(-60 * time.Second).Unix(), // GitHub allows for clock drift this way
		"exp": now.Add(9 * time.Minute).Unix(),   // under GitHub's 10-minute cap
		"iss": a.appID,
	}).SignedString(a.key)
}

// installedOn reports whether the App is installed (and not suspended) on
// the GitHub organisation or user org, reading every page of installations.
func (a *githubApp) installedOn(ctx context.Context, client *http.Client, org string) (bool, error) {
	token, err := a.jwt(time.Now())
	if err != nil {
		return false, err
	}
	for page := 1; page <= 20; page++ { // 2,000 installations
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/app/installations?per_page=100&page=%d", a.api, page), nil)
		if err != nil {
			return false, err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Accept", "application/vnd.github+json")
		req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
		resp, err := client.Do(req)
		if err != nil {
			return false, err
		}
		raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
		resp.Body.Close()
		if err != nil {
			return false, err
		}
		if resp.StatusCode != http.StatusOK {
			return false, fmt.Errorf("GitHub answered %d listing installations", resp.StatusCode)
		}
		var list []struct {
			Account struct {
				Login string `json:"login"`
			} `json:"account"`
			SuspendedAt *string `json:"suspended_at"`
		}
		if err := json.Unmarshal(raw, &list); err != nil {
			return false, fmt.Errorf("read GitHub installations: %w", err)
		}
		for _, inst := range list {
			if strings.EqualFold(inst.Account.Login, org) && inst.SuspendedAt == nil {
				return true, nil
			}
		}
		if len(list) < 100 {
			return false, nil
		}
	}
	return false, nil
}
