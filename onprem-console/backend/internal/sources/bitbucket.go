package sources

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// Bitbucket reads a Bitbucket Data Center instance with an HTTP access token
// (project or repository level, Project read + Repository read).
type Bitbucket struct {
	BaseURL string
	c       *client
}

func NewBitbucket(baseURL, token, caPEM string) (*Bitbucket, error) {
	c, err := newClient(caPEM, func(r *http.Request) { r.Header.Set("Authorization", "Bearer "+token) })
	return &Bitbucket{BaseURL: strings.TrimRight(baseURL, "/"), c: c}, err
}

func (b *Bitbucket) api(p string) string { return b.BaseURL + "/rest/api/1.0" + p }

func (b *Bitbucket) Verify(ctx context.Context) []Check {
	var props struct {
		Version     string `json:"version"`
		DisplayName string `json:"displayName"`
	}
	if _, err := b.c.getJSON(ctx, b.api("/application-properties"), nil, &props); err != nil || props.Version == "" {
		detail := "this address does not answer like Bitbucket Data Center"
		if err != nil {
			detail = err.Error()
			if strings.Contains(detail, "certificate") {
				detail += ": add the CA certificate that signed Bitbucket's certificate"
			}
		}
		return []Check{{"Bitbucket reachable", false, detail}}
	}
	checks := []Check{{"Bitbucket reachable", true, props.DisplayName + " " + props.Version}}
	repos, err := b.Repos(ctx)
	switch {
	case StatusOf(err) == 401:
		checks = append(checks, Check{"Token accepted", false, "Bitbucket rejected the token (401): it may have expired or been revoked"})
	case err != nil:
		checks = append(checks, Check{"Token accepted", false, err.Error()})
	case len(repos) == 0:
		checks = append(checks, Check{"Token accepted", true, ""}, Check{"Repositories readable", false, "the token sees no repository: give it Project read and Repository read"})
	default:
		checks = append(checks, Check{"Token accepted", true, ""}, Check{"Repositories readable", true, plural(len(repos), "repository", "repositories")})
	}
	return checks
}

type bbPage struct {
	IsLastPage    bool `json:"isLastPage"`
	NextPageStart int  `json:"nextPageStart"`
}

func (b *Bitbucket) Repos(ctx context.Context) ([]Repo, error) {
	var repos []Repo
	for start := 0; ; {
		var out struct {
			bbPage
			Values []struct {
				Slug    string `json:"slug"`
				Project struct {
					Key string `json:"key"`
				} `json:"project"`
				Links struct {
					Self []struct {
						Href string `json:"href"`
					} `json:"self"`
				} `json:"links"`
			} `json:"values"`
		}
		// permission=REPO_READ limits the list to what the token can read.
		if _, err := b.c.getJSON(ctx, b.api("/repos?permission=REPO_READ&limit=100&start="+strconv.Itoa(start)), nil, &out); err != nil {
			return nil, err
		}
		for _, v := range out.Values {
			r := Repo{FullName: v.Project.Key + "/" + v.Slug}
			if len(v.Links.Self) > 0 {
				r.WebURL = v.Links.Self[0].Href
			}
			repos = append(repos, r)
		}
		if out.IsLastPage || len(out.Values) == 0 || len(repos) > 10000 {
			return repos, nil
		}
		start = out.NextPageStart
	}
}

func splitRepo(full string) (string, string, error) {
	p, r, ok := strings.Cut(full, "/")
	if !ok || p == "" || r == "" {
		return "", "", errors.New("repository must be PROJECT/slug")
	}
	return url.PathEscape(p), url.PathEscape(r), nil
}

func (b *Bitbucket) repoAPI(full string) (string, error) {
	p, r, err := splitRepo(full)
	return b.api("/projects/" + p + "/repos/" + r), err
}

// ListFiles lists the default branch (Bitbucket's files API without ?at).
func (b *Bitbucket) ListFiles(ctx context.Context, repo Repo) ([]string, error) {
	base, err := b.repoAPI(repo.FullName)
	if err != nil {
		return nil, err
	}
	var files []string
	for start := 0; ; {
		var out struct {
			bbPage
			Values []string `json:"values"`
		}
		u := base + "/files?limit=1000&start=" + strconv.Itoa(start)
		if repo.DefaultBranch != "" {
			u += "&at=" + url.QueryEscape(repo.DefaultBranch)
		}
		if _, err := b.c.getJSON(ctx, u, nil, &out); err != nil {
			if StatusOf(err) == 404 && start == 0 { // empty repository
				return nil, nil
			}
			return nil, err
		}
		files = append(files, out.Values...)
		if out.IsLastPage || len(out.Values) == 0 {
			return files, nil
		}
		start = out.NextPageStart
	}
}

func (b *Bitbucket) ReadFile(ctx context.Context, repo, path, ref string, max int64) ([]byte, error) {
	base, err := b.repoAPI(repo)
	if err != nil {
		return nil, err
	}
	u := base + "/raw/" + escapePath(path)
	if ref != "" {
		u += "?at=" + url.QueryEscape(ref)
	}
	return b.c.getRaw(ctx, u, nil, max)
}

// ChangedFiles lists the files a push added or changed (deletions left out):
// everything between from and to, or the one commit for a new branch.
func (b *Bitbucket) ChangedFiles(ctx context.Context, repo, from, to string) ([]string, error) {
	base, err := b.repoAPI(repo)
	if err != nil {
		return nil, err
	}
	u := base + "/commits/" + url.PathEscape(to) + "/changes?limit=1000"
	if strings.Trim(from, "0") != "" {
		u = base + "/compare/changes?from=" + url.QueryEscape(to) + "&to=" + url.QueryEscape(from) + "&limit=1000"
	}
	var out struct {
		Values []struct {
			Type string `json:"type"`
			Path struct {
				ToString string `json:"toString"`
			} `json:"path"`
		} `json:"values"`
	}
	if _, err := b.c.getJSON(ctx, u, nil, &out); err != nil {
		return nil, err
	}
	var files []string
	for _, v := range out.Values {
		if v.Type != "DELETE" && v.Path.ToString != "" {
			files = append(files, v.Path.ToString)
		}
	}
	return files, nil
}
