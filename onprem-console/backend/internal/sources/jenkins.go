package sources

import (
	"context"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
)

// Jenkins reads credential metadata (never values) and job configurations as
// a read-only user with an API token.
type Jenkins struct {
	BaseURL string
	c       *client
}

func NewJenkins(baseURL, username, token, caPEM string) (*Jenkins, error) {
	c, err := newClient(caPEM, func(r *http.Request) { r.SetBasicAuth(username, token) })
	return &Jenkins{BaseURL: strings.TrimRight(baseURL, "/"), c: c}, err
}

type JenkinsCredential struct {
	Store       string
	Domain      string
	ID          string
	TypeName    string
	DisplayName string
	Description string
}

type JenkinsJob struct {
	Path  string // folder/job
	Class string
}

func (j *Jenkins) Verify(ctx context.Context) []Check {
	var root struct {
		Mode string `json:"mode"`
	}
	hdr, err := j.c.getJSON(ctx, j.BaseURL+"/api/json?tree=mode", nil, &root)
	if err != nil {
		detail := err.Error()
		if StatusOf(err) == 401 {
			detail = "Jenkins rejected the username and API token (401)"
		} else if StatusOf(err) == 403 {
			detail = "the user lacks Overall: Read (403)"
		}
		return []Check{{"Jenkins reachable", false, detail}}
	}
	version := hdr.Get("X-Jenkins")
	if version == "" {
		return []Check{{"Jenkins reachable", false, "this address does not answer like Jenkins"}}
	}
	checks := []Check{{"Jenkins reachable", true, "Jenkins " + version}}
	creds, err := j.Credentials(ctx)
	if err != nil {
		detail := err.Error()
		if s := StatusOf(err); s == 403 || s == 404 {
			detail = "the user cannot view credentials: grant Credentials: View (and check the Credentials plugin is installed)"
		}
		checks = append(checks, Check{"Credentials readable", false, detail})
	} else {
		checks = append(checks, Check{"Credentials readable", true, plural(len(creds), "credential", "credentials") + " (metadata only)"})
	}
	jobs, err := j.Jobs(ctx)
	if err != nil {
		checks = append(checks, Check{"Jobs listed", false, err.Error()})
	} else {
		checks = append(checks, Check{"Jobs listed", true, plural(len(jobs), "job", "jobs")})
	}
	return checks
}

// Credentials lists the system store's global domain.
func (j *Jenkins) Credentials(ctx context.Context) ([]JenkinsCredential, error) {
	var out struct {
		Credentials []struct {
			ID          string `json:"id"`
			TypeName    string `json:"typeName"`
			DisplayName string `json:"displayName"`
			Description string `json:"description"`
		} `json:"credentials"`
	}
	if _, err := j.c.getJSON(ctx, j.BaseURL+"/credentials/store/system/domain/_/api/json?tree=credentials[id,typeName,displayName,description]", nil, &out); err != nil {
		return nil, err
	}
	creds := make([]JenkinsCredential, 0, len(out.Credentials))
	for _, c := range out.Credentials {
		creds = append(creds, JenkinsCredential{"system", "_", c.ID, c.TypeName, c.DisplayName, c.Description})
	}
	return creds, nil
}

type jobNode struct {
	Name  string    `json:"name"`
	Class string    `json:"_class"`
	Jobs  []jobNode `json:"jobs"`
}

// Jobs lists jobs two folder levels deep.
// ponytail: two levels covers folder/job and org/repo/branch is left to the multibranch parent; go deeper if customers nest more.
func (j *Jenkins) Jobs(ctx context.Context) ([]JenkinsJob, error) {
	var out struct {
		Jobs []jobNode `json:"jobs"`
	}
	if _, err := j.c.getJSON(ctx, j.BaseURL+"/api/json?tree=jobs[name,_class,jobs[name,_class]]", nil, &out); err != nil {
		return nil, err
	}
	var jobs []JenkinsJob
	for _, n := range out.Jobs {
		jobs = append(jobs, JenkinsJob{n.Name, n.Class})
		for _, c := range n.Jobs {
			jobs = append(jobs, JenkinsJob{n.Name + "/" + c.Name, c.Class})
		}
	}
	return jobs, nil
}

func (j *Jenkins) jobURL(path string) string {
	var b strings.Builder
	b.WriteString(j.BaseURL)
	for _, p := range strings.Split(path, "/") {
		b.WriteString("/job/" + url.PathEscape(p))
	}
	return b.String()
}

// JobConfig is the job's config.xml (the pipeline script, when inline).
func (j *Jenkins) JobConfig(ctx context.Context, path string) ([]byte, error) {
	return j.c.getRaw(ctx, j.jobURL(path)+"/config.xml", nil, 4<<20)
}

func (j *Jenkins) JobURL(path string) string { return j.jobURL(path) + "/" }

var credRef = regexp.MustCompile(`(?:<credentialsId>\s*([^<\s]+)\s*</credentialsId>|credentialsId\s*:\s*['"]([^'"]+)['"]|credentials\(\s*['"]([^'"]+)['"]\s*\))`)

// CredentialRefs returns the credential ids a job configuration mentions.
func CredentialRefs(config []byte) []string {
	seen := map[string]bool{}
	for _, m := range credRef.FindAllSubmatch(config, -1) {
		for _, g := range m[1:] {
			if len(g) > 0 {
				seen[string(g)] = true
			}
		}
	}
	ids := make([]string, 0, len(seen))
	for id := range seen {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

// IsFolder: folders and multibranch parents hold jobs rather than run.
func IsFolder(class string) bool {
	return strings.Contains(class, "Folder") || strings.Contains(class, "MultiBranch") || strings.Contains(class, "OrganizationFolder")
}
