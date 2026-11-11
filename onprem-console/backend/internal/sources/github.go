package sources

import (
	"context"
	"crypto/rsa"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const ghAccept = "application/vnd.github+json"

// GitHub reads code as an installation of a GitHub App: a short-lived
// installation token is minted from the App's private key for each hour.
type GitHub struct {
	APIURL         string // https://api.github.com, or https://<host>/api/v3 for GitHub Enterprise Server
	AppID          string
	InstallationID string
	key            *rsa.PrivateKey
	c              *client

	mu      sync.Mutex
	token   string
	expires time.Time
}

func ParseGitHubKey(pemKey string) (*rsa.PrivateKey, error) {
	k, err := jwt.ParseRSAPrivateKeyFromPEM([]byte(strings.TrimSpace(pemKey)))
	if err != nil {
		return nil, errors.New("the private key is not the .pem file GitHub generated for the App")
	}
	return k, nil
}

func NewGitHub(apiURL, appID, installationID, pemKey, caPEM string) (*GitHub, error) {
	key, err := ParseGitHubKey(pemKey)
	if err != nil {
		return nil, err
	}
	if apiURL == "" {
		apiURL = "https://api.github.com"
	}
	g := &GitHub{APIURL: strings.TrimRight(apiURL, "/"), AppID: appID, InstallationID: installationID, key: key}
	g.c, err = newClient(caPEM, nil)
	return g, err
}

func (g *GitHub) appJWT() (string, error) {
	now := time.Now()
	return jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.RegisteredClaims{
		Issuer: g.AppID, IssuedAt: jwt.NewNumericDate(now.Add(-time.Minute)), ExpiresAt: jwt.NewNumericDate(now.Add(9 * time.Minute)),
	}).SignedString(g.key)
}

func (g *GitHub) appHeaders() (map[string]string, error) {
	t, err := g.appJWT()
	return map[string]string{"Authorization": "Bearer " + t, "Accept": ghAccept}, err
}

func (g *GitHub) installationToken(ctx context.Context) (string, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.token != "" && time.Until(g.expires) > 5*time.Minute {
		return g.token, nil
	}
	hdr, err := g.appHeaders()
	if err != nil {
		return "", err
	}
	resp, err := g.c.do(ctx, http.MethodPost, g.APIURL+"/app/installations/"+url.PathEscape(g.InstallationID)+"/access_tokens", hdr)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var out struct {
		Token     string    `json:"token"`
		ExpiresAt time.Time `json:"expires_at"`
	}
	if err := decode(resp, &out); err != nil || out.Token == "" {
		return "", errors.New("GitHub did not return an installation token")
	}
	g.token, g.expires = out.Token, out.ExpiresAt
	return g.token, nil
}

func (g *GitHub) instHeaders(ctx context.Context, accept string) (map[string]string, error) {
	t, err := g.installationToken(ctx)
	return map[string]string{"Authorization": "Bearer " + t, "Accept": accept}, err
}

// Verify runs the checks a person sees after saving.
func (g *GitHub) Verify(ctx context.Context) []Check {
	var checks []Check
	hdr, err := g.appHeaders()
	var app struct {
		Name string `json:"name"`
		Slug string `json:"slug"`
	}
	if err == nil {
		_, err = g.c.getJSON(ctx, g.APIURL+"/app", hdr, &app)
	}
	if err != nil {
		detail := err.Error()
		if StatusOf(err) == 401 {
			detail = "GitHub rejected the App ID and private key pair (401): check both come from the same App"
		}
		return append(checks, Check{"GitHub App found", false, detail})
	}
	checks = append(checks, Check{"GitHub App found", true, app.Name})

	if _, err := g.installationToken(ctx); err != nil {
		detail := err.Error()
		if StatusOf(err) == 404 {
			detail = "no installation " + g.InstallationID + " for this App: install it on the organisation, then copy the number from the installation's URL"
		}
		return append(checks, Check{"Installed on your organisation", false, detail})
	}
	checks = append(checks, Check{"Installed on your organisation", true, "installation " + g.InstallationID})

	repos, err := g.Repos(ctx)
	switch {
	case err != nil:
		checks = append(checks, Check{"Repositories readable", false, err.Error()})
	case len(repos) == 0:
		checks = append(checks, Check{"Repositories readable", false, "the installation has no repositories: choose some under Configure on the App's installation"})
	default:
		checks = append(checks, Check{"Repositories readable", true, plural(len(repos), "repository", "repositories")})
	}
	return checks
}

func (g *GitHub) Repos(ctx context.Context) ([]Repo, error) {
	var repos []Repo
	for page := 1; page <= 100; page++ {
		hdr, err := g.instHeaders(ctx, ghAccept)
		if err != nil {
			return nil, err
		}
		var out struct {
			Total        int `json:"total_count"`
			Repositories []struct {
				FullName      string `json:"full_name"`
				DefaultBranch string `json:"default_branch"`
				HTMLURL       string `json:"html_url"`
				Archived      bool   `json:"archived"`
			} `json:"repositories"`
		}
		if _, err := g.c.getJSON(ctx, g.APIURL+"/installation/repositories?per_page=100&page="+strconv.Itoa(page), hdr, &out); err != nil {
			return nil, err
		}
		for _, r := range out.Repositories {
			repos = append(repos, Repo{FullName: r.FullName, DefaultBranch: r.DefaultBranch, WebURL: r.HTMLURL})
		}
		if len(out.Repositories) < 100 || len(repos) >= out.Total {
			break
		}
	}
	return repos, nil
}

func (g *GitHub) ListFiles(ctx context.Context, repo Repo) ([]string, error) {
	hdr, err := g.instHeaders(ctx, ghAccept)
	if err != nil {
		return nil, err
	}
	var out struct {
		Tree []struct {
			Path string `json:"path"`
			Type string `json:"type"`
		} `json:"tree"`
		Truncated bool `json:"truncated"`
	}
	if _, err := g.c.getJSON(ctx, g.APIURL+"/repos/"+escapePath(repo.FullName)+"/git/trees/"+url.PathEscape(repo.DefaultBranch)+"?recursive=1", hdr, &out); err != nil {
		if StatusOf(err) == 409 { // empty repository
			return nil, nil
		}
		return nil, err
	}
	var files []string
	for _, t := range out.Tree {
		if t.Type == "blob" {
			files = append(files, t.Path)
		}
	}
	return files, nil
}

func (g *GitHub) ReadFile(ctx context.Context, repo, path, ref string, max int64) ([]byte, error) {
	hdr, err := g.instHeaders(ctx, "application/vnd.github.raw")
	if err != nil {
		return nil, err
	}
	return g.c.getRaw(ctx, g.APIURL+"/repos/"+escapePath(repo)+"/contents/"+escapePath(path)+"?ref="+url.QueryEscape(ref), hdr, max)
}

func decode(resp *http.Response, out any) error {
	return jsonDecode(resp.Body, out)
}

func plural(n int, one, many string) string {
	if n == 1 {
		return "1 " + one
	}
	return fmt.Sprintf("%d %s", n, many)
}
