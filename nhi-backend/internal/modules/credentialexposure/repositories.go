package credentialexposure

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"

	"nhi-backend-api/internal/platform/scope"
)

// Repositories and branches as the scanner's own tables know them. The
// scanner's GET /api/branches reads the client's platform live; this API
// never calls the scanner or a code platform, so it answers from what the
// scanner has recorded: the per-branch ledger (one row per scanned branch,
// repo_key "<repo>" for the default branch and "<repo>:<branch>" for the
// others), the findings, and the deep-scan rows. A branch appears once the
// scanner has scanned it - within an hour of its first push.

// BranchInfo is one branch of a repository.
type BranchInfo struct {
	Name            string          `json:"name"`
	Default         bool            `json:"default"`
	LastCommitID    *string         `json:"last_commit_id"`
	LastScannedAt   *string         `json:"last_scanned_at"`
	PendingCommitID *string         `json:"pending_commit_id,omitempty"`
	PendingSince    *string         `json:"pending_since,omitempty"`
	Findings        int             `json:"findings"`
	DeepFindings    int             `json:"deep_findings"`
	DeepScan        *DeepScanResult `json:"deep_scan,omitempty"`
}

// Repository is one repository the scanner knows for a client.
type Repository struct {
	ClientID      string       `json:"client_id"`
	Repository    string       `json:"repository"`
	Platform      string       `json:"platform"`
	DefaultBranch *string      `json:"default_branch"`
	Branches      []BranchInfo `json:"branches"`
	Findings      int          `json:"findings"`
	DeepFindings  int          `json:"deep_findings"`
	LastScannedAt *string      `json:"last_scanned_at"`
	// DeepScan is the latest deep scan requested without choosing branches.
	DeepScan *DeepScanResult `json:"deep_scan,omitempty"`
}

type RepositoriesResponse struct {
	Repositories []Repository `json:"repositories"`
}

// BranchOption is one entry of the deep-scan branch dropdown; Value is sent
// back unchanged as "branches" (the scanner guide's shape).
type BranchOption struct {
	Value any    `json:"value"`
	Label string `json:"label"`
	Kind  string `json:"kind"` // default | all | branch
}

type BranchesResponse struct {
	ClientID      string         `json:"client_id"`
	Repository    string         `json:"repository"`
	Platform      string         `json:"platform"`
	DefaultBranch *string        `json:"default_branch"`
	Branches      []string       `json:"branches"`
	Complete      bool           `json:"complete"`
	Warning       *string        `json:"warning"`
	Options       []BranchOption `json:"options"`
	Details       []BranchInfo   `json:"details"`
}

// splitRepoKey reads a ledger / deep-scan repo_key: "<repo>" or
// "<repo>:<branch>". Git forbids ':' in branch names and no platform allows it
// in a repository name, so the first ':' separates them.
func splitRepoKey(key string) (repo, branch string) {
	if i := strings.Index(key, ":"); i >= 0 {
		return key[:i], key[i+1:]
	}
	return key, ""
}

func shortBranch(b string) string { return strings.TrimPrefix(b, "refs/heads/") }

type repoAcc struct {
	repo         Repository
	ledger       map[string]BranchInfo // branch ("" = default) -> ledger state
	findingsBy   map[string]int        // normal findings per branch (short name)
	deepBy       map[string]int        // deep findings per branch
	deepScans    map[string]*DeepScanResult
	findingTotal int
}

// Inventory reads every repository the scanner knows in this schema,
// optionally for one client, platform and repository.
func (r *DeepScanRepository) Inventory(ctx context.Context, resolved *scope.DataScope, clientID, platform, repository string) ([]Repository, error) {
	cat, err := loadCatalog(ctx, resolved)
	if err != nil {
		return nil, err
	}
	schema := resolved.QSchema()
	accs := map[string]*repoAcc{}
	get := func(p, client, repo string) *repoAcc {
		k := p + "\x00" + client + "\x00" + repo
		a := accs[k]
		if a == nil {
			a = &repoAcc{repo: Repository{ClientID: client, Repository: repo, Platform: p},
				ledger: map[string]BranchInfo{}, findingsBy: map[string]int{}, deepBy: map[string]int{}, deepScans: map[string]*DeepScanResult{}}
			accs[k] = a
		}
		return a
	}
	filter := func(alias string, repoCol string, args *[]any) string {
		parts := []string{}
		if clientID != "" {
			*args = append(*args, clientID)
			parts = append(parts, fmt.Sprintf("%sclient_id=$%d", alias, len(*args)))
		}
		if repository != "" {
			*args = append(*args, repository)
			parts = append(parts, fmt.Sprintf("%s=$%d", repoCol, len(*args)))
		}
		if len(parts) == 0 {
			return ""
		}
		return " WHERE " + strings.Join(parts, " AND ")
	}
	for _, p := range ScannerPlatforms {
		if (platform != "" && platform != p) || !cat.on(p) {
			continue
		}
		// Ledger: one row per scanned branch.
		if t := "secscan_ledger_" + p; cat.has(t) {
			args := []any{}
			where := filter("", "split_part(repo_key, ':', 1)", &args)
			rows, err := resolved.DB.QueryContext(ctx, `SELECT client_id, repo_key, last_commit_id, updated_at, pending_commit_id, pending_since FROM `+schema+`.`+t+where, args...)
			if err != nil {
				return nil, fmt.Errorf("read scan ledger: %w", err)
			}
			for rows.Next() {
				var client, key string
				var last, updated, pending, since sql.NullString
				if err := rows.Scan(&client, &key, &last, &updated, &pending, &since); err != nil {
					rows.Close()
					return nil, fmt.Errorf("read scan ledger: %w", err)
				}
				repo, branch := splitRepoKey(key)
				get(p, client, repo).ledger[branch] = BranchInfo{Name: branch, Default: branch == "",
					LastCommitID: strPtr(last), LastScannedAt: scannerTimePtr(strPtr(updated)), PendingCommitID: strPtr(pending), PendingSince: scannerTimePtr(strPtr(since))}
			}
			rows.Close()
			if err := rows.Err(); err != nil {
				return nil, fmt.Errorf("read scan ledger: %w", err)
			}
		}
		// Findings and deep findings, counted per branch.
		for _, kind := range []string{kindFindings, kindDeepFindings} {
			pt, ok := cat.platformTable(kind, p)
			if !ok {
				continue
			}
			args := []any{}
			where := filter("f.", "f.repository", &args)
			if pt.where != "" {
				if where == "" {
					where = " WHERE " + pt.where
				} else {
					where += " AND " + pt.where
				}
			}
			q := `SELECT f.client_id, f.repository, f.branch, COUNT(*)::int FROM ` + schema + `.` + pt.table + ` f` + where
			if cat.has("secscan_allowlist_dashboard") {
				join := " WHERE "
				if where != "" {
					join = " AND "
				}
				q += join + `NOT EXISTS (SELECT 1 FROM ` + schema + `.secscan_allowlist_dashboard a
				 WHERE a.client_id=f.client_id AND a.file_path=f.file_path AND a.detector=f.detector AND a.redacted=f.redacted)`
			}
			q += ` GROUP BY f.client_id, f.repository, f.branch`
			rows, err := resolved.DB.QueryContext(ctx, q, args...)
			if err != nil {
				return nil, fmt.Errorf("count findings per branch: %w", err)
			}
			for rows.Next() {
				var client, repo string
				var branch sql.NullString
				var n int
				if err := rows.Scan(&client, &repo, &branch, &n); err != nil {
					rows.Close()
					return nil, fmt.Errorf("count findings per branch: %w", err)
				}
				a := get(p, client, repo)
				if kind == kindFindings {
					a.findingsBy[shortBranch(branch.String)] += n
					a.findingTotal += n
				} else {
					a.deepBy[shortBranch(branch.String)] += n
				}
			}
			rows.Close()
			if err := rows.Err(); err != nil {
				return nil, fmt.Errorf("count findings per branch: %w", err)
			}
		}
		// Deep-scan requests: "<repo>" (no branch chosen) and "<repo>:<branch>".
		if t := "secscan_deepscan_" + p; cat.has(t) {
			args := []any{}
			where := filter("", "split_part(repo_key, ':', 1)", &args)
			rows, err := resolved.DB.QueryContext(ctx, `SELECT client_id, repo_key, requested_at, completed_at, commits_scanned, findings, failed_at, error FROM `+schema+`.`+t+where, args...)
			if err != nil {
				return nil, fmt.Errorf("read deep scans: %w", err)
			}
			for rows.Next() {
				item, err := scanDeepRow(rows, p)
				if err != nil {
					rows.Close()
					return nil, err
				}
				repo, branch := splitRepoKey(item.RepoKey)
				get(p, item.ClientID, repo).deepScans[branch] = item
			}
			rows.Close()
			if err := rows.Err(); err != nil {
				return nil, fmt.Errorf("read deep scans: %w", err)
			}
		}
	}

	out := make([]Repository, 0, len(accs))
	for _, a := range accs {
		out = append(out, a.build())
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Findings != out[j].Findings {
			return out[i].Findings > out[j].Findings
		}
		if out[i].Repository != out[j].Repository {
			return out[i].Repository < out[j].Repository
		}
		return out[i].Platform < out[j].Platform
	})
	return out, nil
}

// build merges what was read into one repository. The default branch's name
// is not in the ledger (its row is "<repo>"), so it is the branch most of the
// normal findings were made on among those that are not another ledger
// branch: the default branch is the only one scanned in full, the others only
// for what they add.
func (a *repoAcc) build() Repository {
	r := a.repo
	r.Findings = a.findingTotal
	names := map[string]bool{}
	for b := range a.ledger {
		if b != "" {
			names[b] = true
		}
	}
	for b := range a.deepScans {
		if b != "" {
			names[b] = true
		}
	}
	// Candidates: branches with normal findings that are not another
	// (non-default) ledger branch.
	var def string
	best := 0
	for b, n := range a.findingsBy {
		if _, other := a.ledger[b]; b == "" || other {
			continue
		}
		if n > best || (n == best && b < def) {
			def, best = b, n
		}
	}
	if def == "" {
		// No finding to go by: a branch called main or master that is not
		// another ledger branch is almost certainly it.
		for _, guess := range []string{"main", "master"} {
			if _, other := a.ledger[guess]; !other && (names[guess] || a.findingsBy[guess] > 0) {
				def = guess
				break
			}
		}
	}
	if def != "" {
		r.DefaultBranch = &def
		names[def] = true
	}
	for b := range a.findingsBy {
		if b != "" {
			names[b] = true
		}
	}
	for b := range a.deepBy {
		if b != "" {
			names[b] = true
		}
	}
	branches := make([]BranchInfo, 0, len(names)+1)
	for name := range names {
		info, ok := a.ledger[name]
		if name == def {
			if l, ok2 := a.ledger[""]; ok2 {
				info, ok = l, true
			}
		}
		if !ok {
			info = BranchInfo{}
		}
		info.Name, info.Default = name, name == def
		info.Findings, info.DeepFindings = a.findingsBy[name], a.deepBy[name]
		info.DeepScan = a.deepScans[name]
		branches = append(branches, info)
	}
	// A default branch whose name is unknown still has a ledger row.
	if def == "" {
		if l, ok := a.ledger[""]; ok {
			l.Name, l.Default = "", true
			branches = append(branches, l)
		}
	}
	sort.Slice(branches, func(i, j int) bool {
		if branches[i].Default != branches[j].Default {
			return branches[i].Default
		}
		return branches[i].Name < branches[j].Name
	})
	r.Branches = branches
	for _, n := range a.deepBy {
		r.DeepFindings += n
	}
	for _, b := range branches {
		if b.LastScannedAt != nil && (r.LastScannedAt == nil || *b.LastScannedAt > *r.LastScannedAt) {
			r.LastScannedAt = b.LastScannedAt
		}
	}
	r.DeepScan = a.deepScans[""]
	return r
}

// branchesOf turns one repository into the dropdown answer.
func branchesOf(repo Repository) BranchesResponse {
	out := BranchesResponse{ClientID: repo.ClientID, Repository: repo.Repository, Platform: repo.Platform,
		DefaultBranch: repo.DefaultBranch, Branches: []string{}, Details: repo.Branches}
	for _, b := range repo.Branches {
		if b.Name != "" {
			out.Branches = append(out.Branches, b.Name)
		}
	}
	defLabel := "Default branch"
	if repo.DefaultBranch != nil {
		defLabel += " (" + *repo.DefaultBranch + ")"
	}
	out.Options = []BranchOption{{Value: "default", Label: defLabel, Kind: "default"}}
	if len(out.Branches) > 0 {
		out.Options = append(out.Options, BranchOption{Value: "all", Label: fmt.Sprintf("All branches (%d)", len(out.Branches)), Kind: "all"})
		for _, name := range out.Branches {
			out.Options = append(out.Options, BranchOption{Value: []string{name}, Label: name, Kind: "branch"})
		}
	}
	out.Complete = repo.DefaultBranch != nil
	if !out.Complete {
		w := "The default branch's name is not known yet (it is learnt from the scanner's findings). \"Default branch\" still scans it."
		out.Warning = &w
	}
	return out
}

// scanDeepRow reads one secscan_deepscan_* row and derives its status.
func scanDeepRow(row interface{ Scan(...any) error }, platform string) (*DeepScanResult, error) {
	var item DeepScanResult
	var requested, completed, failed, errText sql.NullString
	var commits, findings sql.NullInt64
	if err := row.Scan(&item.ClientID, &item.RepoKey, &requested, &completed, &commits, &findings, &failed, &errText); err != nil {
		return nil, fmt.Errorf("read deep scan: %w", err)
	}
	item.Platform = platform
	item.RequestedAt, item.CompletedAt, item.FailedAt, item.Error = scannerTimePtr(strPtr(requested)), scannerTimePtr(strPtr(completed)), scannerTimePtr(strPtr(failed)), strPtr(errText)
	item.CommitsScanned, item.Findings = intPtr(commits), intPtr(findings)
	item.Status = deepStatus(&item)
	return &item, nil
}

// deepStatus: failed if failed_at, complete if completed_at, else running
// (the scanner's own derivation, DATABASE_HANDOVER section 7).
func deepStatus(item *DeepScanResult) string {
	switch {
	case item.FailedAt != nil:
		return "failed"
	case item.CompletedAt != nil:
		return "complete"
	case item.RequestedAt != nil:
		return "running"
	}
	return "not_started"
}
