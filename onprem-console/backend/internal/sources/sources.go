// Package sources talks to GitHub (as a GitHub App), Bitbucket Data Center and
// Jenkins. Every call is read-only.
package sources

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Check is one line of a connection test, shown to the person setting it up.
type Check struct {
	Name   string `json:"name"`
	OK     bool   `json:"ok"`
	Detail string `json:"detail"`
}

type Repo struct {
	FullName      string
	DefaultBranch string
	WebURL        string
}

// CodeSource is what a full scan and a push scan need from GitHub or Bitbucket.
type CodeSource interface {
	Repos(ctx context.Context) ([]Repo, error)
	ListFiles(ctx context.Context, repo Repo) ([]string, error)
	ReadFile(ctx context.Context, repo, path, ref string, max int64) ([]byte, error)
}

// HTTPError keeps the status so callers can say what it means for this source.
type HTTPError struct {
	Status int
	URL    string
}

func (e *HTTPError) Error() string {
	switch e.Status {
	case 401:
		return "the credentials were rejected (401)"
	case 403:
		return "the account lacks a permission this needs (403)"
	case 404:
		return "not found (404)"
	}
	return fmt.Sprintf("unexpected answer %d", e.Status)
}

func StatusOf(err error) int {
	var he *HTTPError
	if errors.As(err, &he) {
		return he.Status
	}
	return 0
}

// ErrTooLarge: the file is over the scan size limit and was skipped.
var ErrTooLarge = errors.New("file over the size limit")

type client struct {
	http *http.Client
	auth func(*http.Request)
}

func newClient(caPEM string, auth func(*http.Request)) (*client, error) {
	tr := http.DefaultTransport.(*http.Transport).Clone()
	if strings.TrimSpace(caPEM) != "" {
		pool, err := x509.SystemCertPool()
		if err != nil || pool == nil {
			pool = x509.NewCertPool()
		}
		if !pool.AppendCertsFromPEM([]byte(caPEM)) {
			return nil, errors.New("the CA certificate is not a PEM certificate")
		}
		tr.TLSClientConfig = &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}
	}
	return &client{http: &http.Client{Transport: tr, Timeout: 30 * time.Second}, auth: auth}, nil
}

func (c *client) do(ctx context.Context, method, u string, hdr map[string]string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, u, nil)
	if err != nil {
		return nil, err
	}
	if c.auth != nil {
		c.auth(req)
	}
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		var ue *url.Error
		if errors.As(err, &ue) {
			err = ue.Err
		}
		return nil, fmt.Errorf("could not reach %s: %v", hostOf(u), err)
	}
	if resp.StatusCode >= 300 {
		_ = resp.Body.Close()
		return nil, &HTTPError{Status: resp.StatusCode, URL: u}
	}
	return resp, nil
}

func (c *client) getJSON(ctx context.Context, u string, hdr map[string]string, out any) (http.Header, error) {
	resp, err := c.do(ctx, http.MethodGet, u, hdr)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if err := json.NewDecoder(io.LimitReader(resp.Body, 32<<20)).Decode(out); err != nil {
		return nil, fmt.Errorf("%s did not answer with JSON: is the URL right?", hostOf(u))
	}
	return resp.Header, nil
}

func (c *client) getRaw(ctx context.Context, u string, hdr map[string]string, max int64) ([]byte, error) {
	resp, err := c.do(ctx, http.MethodGet, u, hdr)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, max+1))
	if err != nil {
		return nil, err
	}
	if int64(len(b)) > max {
		return nil, ErrTooLarge
	}
	return b, nil
}

func hostOf(u string) string {
	p, err := url.Parse(u)
	if err != nil || p.Host == "" {
		return u
	}
	return p.Host
}

// escapePath escapes each segment of a file path for a URL.
func escapePath(p string) string {
	parts := strings.Split(p, "/")
	for i, s := range parts {
		parts[i] = url.PathEscape(s)
	}
	return strings.Join(parts, "/")
}

// BaseURL checks a URL typed by a person and trims the trailing slash.
func BaseURL(raw string) (string, error) {
	raw = strings.TrimRight(strings.TrimSpace(raw), "/")
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.RawQuery != "" || u.User != nil {
		return "", errors.New("enter the full address, for example https://bitbucket.example.com")
	}
	return raw, nil
}

func jsonDecode(r io.Reader, out any) error {
	return json.NewDecoder(io.LimitReader(r, 32<<20)).Decode(out)
}
