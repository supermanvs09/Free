package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sort"
	"sync"
	"time"

	"onprem-console/internal/scanner"
	"onprem-console/internal/sources"
)

// ResetInterrupted marks scans that were running when the console stopped.
func (s *Server) ResetInterrupted(ctx context.Context) error {
	_, err := s.st.DB.Exec(ctx, `UPDATE connections SET sync_status = 'failed', sync_detail = 'Stopped by a console restart: start it again.' WHERE sync_status = 'running'`)
	return err
}

var errRunning = errors.New("A scan of this source is already running.")

// startSync claims the source (one run at a time) and runs in the background.
func (s *Server) startSync(kind, by string) error {
	ctx := context.Background()
	tag, err := s.st.DB.Exec(ctx, `UPDATE connections SET sync_status = 'running', sync_detail = 'Starting…', sync_started_at = now()
		WHERE kind = $1 AND sync_status <> 'running'`, kind)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errRunning
	}
	s.st.Audit(ctx, by, "scan_started", kind, "")
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 4*time.Hour)
		defer cancel()
		detail, err := s.runSync(ctx, kind)
		status := "done"
		if err != nil {
			status, detail = "failed", err.Error()
			log.Printf("%s sync failed: %v", kind, err)
		}
		_, _ = s.st.DB.Exec(context.Background(), `UPDATE connections SET sync_status = $2, sync_detail = $3, last_sync_at = CASE WHEN $2 = 'done' THEN now() ELSE last_sync_at END WHERE kind = $1`,
			kind, status, clip(detail, 500))
	}()
	return nil
}

func (s *Server) progress(kind, detail string) {
	_, _ = s.st.DB.Exec(context.Background(), `UPDATE connections SET sync_detail = $2 WHERE kind = $1 AND sync_status = 'running'`, kind, clip(detail, 500))
}

func (s *Server) runSync(ctx context.Context, kind string) (string, error) {
	c, err := s.loadConnection(ctx, kind)
	if err != nil {
		return "", err
	}
	cl, err := s.client(c)
	if err != nil {
		return "", err
	}
	if j, ok := cl.(*sources.Jenkins); ok {
		return s.syncJenkins(ctx, j)
	}
	return s.scanAll(ctx, kind, cl.(sources.CodeSource))
}

// scanAll reads every file of every repository the source can see.
func (s *Server) scanAll(ctx context.Context, kind string, src sources.CodeSource) (string, error) {
	repos, err := src.Repos(ctx)
	if err != nil {
		return "", fmt.Errorf("listing repositories: %w", err)
	}
	var files, added, failedRepos int
	for i, repo := range repos {
		s.progress(kind, fmt.Sprintf("Scanning %s (%d of %d)", repo.FullName, i+1, len(repos)))
		var started time.Time // the database's clock, which stamps last_seen
		_ = s.st.DB.QueryRow(ctx, `SELECT now()`).Scan(&started)
		paths, err := src.ListFiles(ctx, repo)
		if err != nil {
			failedRepos++
			log.Printf("%s %s: listing files: %v", kind, repo.FullName, err)
			continue
		}
		complete := len(paths) <= s.cfg.MaxRepoFiles
		if !complete {
			paths = paths[:s.cfg.MaxRepoFiles]
		}
		res := s.scanFiles(ctx, kind, repo.FullName, repo.DefaultBranch, repo.DefaultBranch, "", "scan", paths, src)
		files += res.files
		added += res.added
		if complete && res.errors == 0 {
			// A secret no longer in the code was removed: close its finding.
			_, _ = s.st.DB.Exec(ctx, `UPDATE findings SET status = 'resolved', status_by = 'scan: no longer in the code', status_at = now()
				WHERE source = $1 AND repository = $2 AND status = 'open' AND last_seen < $3`, kind, repo.FullName, started)
		}
		_, _ = s.st.DB.Exec(ctx, `INSERT INTO repositories (source, full_name, default_branch, web_url, files_scanned, last_scanned_at)
			VALUES ($1, $2, $3, $4, $5, now()) ON CONFLICT (source, full_name) DO UPDATE SET default_branch = $3, web_url = $4, files_scanned = $5, last_scanned_at = now()`,
			kind, repo.FullName, repo.DefaultBranch, repo.WebURL, res.files)
		if ctx.Err() != nil {
			return "", errors.New("the scan ran past its 4-hour limit")
		}
	}
	detail := fmt.Sprintf("Scanned %s, %s: %s.", plural(len(repos), "repository", "repositories"), plural(files, "file", "files"), plural(added, "new finding", "new findings"))
	if failedRepos > 0 {
		detail += fmt.Sprintf(" %s could not be read.", plural(failedRepos, "repository", "repositories"))
	}
	return detail, nil
}

type scanResult struct{ files, added, errors int }

// scanFiles reads the paths at ref with a few workers and records what it finds.
func (s *Server) scanFiles(ctx context.Context, kind, repo, branch, ref, commit, foundBy string, paths []string, src sources.CodeSource) scanResult {
	var mu sync.Mutex
	var res scanResult
	jobs := make(chan string)
	var wg sync.WaitGroup
	for range 6 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for p := range jobs {
				body, err := src.ReadFile(ctx, repo, p, ref, s.cfg.MaxFileBytes)
				mu.Lock()
				switch {
				case errors.Is(err, sources.ErrTooLarge), sources.StatusOf(err) == 404:
				case err != nil:
					res.errors++
				default:
					res.files++
				}
				mu.Unlock()
				if err != nil {
					continue
				}
				for _, f := range scanner.Scan(body) {
					if s.recordFinding(ctx, kind, repo, branch, commit, p, foundBy, "", f) {
						mu.Lock()
						res.added++
						mu.Unlock()
					}
				}
			}
		}()
	}
	for _, p := range paths {
		if !scanner.Skip(p) {
			jobs <- p
		}
	}
	close(jobs)
	wg.Wait()
	return res
}

// recordFinding inserts a finding or refreshes it; it reports whether it is new.
// A resolved finding seen again reopens; one marked false positive stays so.
func (s *Server) recordFinding(ctx context.Context, kind, repo, branch, commit, path, foundBy, author string, f scanner.Finding) bool {
	var inserted bool
	err := s.st.DB.QueryRow(ctx, `INSERT INTO findings (source, repository, branch, commit_sha, file_path, line, detector, severity, redacted, fingerprint, author, found_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		ON CONFLICT (source, repository, file_path, fingerprint) DO UPDATE SET
			last_seen = now(), line = EXCLUDED.line, branch = EXCLUDED.branch,
			commit_sha = CASE WHEN EXCLUDED.commit_sha <> '' THEN EXCLUDED.commit_sha ELSE findings.commit_sha END,
			author = CASE WHEN EXCLUDED.author <> '' THEN EXCLUDED.author ELSE findings.author END,
			status = CASE WHEN findings.status = 'resolved' THEN 'open' ELSE findings.status END,
			status_by = CASE WHEN findings.status = 'resolved' THEN 'reopened: found again' ELSE findings.status_by END
		RETURNING (xmax = 0)`, kind, repo, branch, commit, path, f.Line, f.Detector, f.Severity, f.Redacted, f.Fingerprint, author, foundBy).Scan(&inserted)
	if err != nil {
		log.Printf("recording finding: %v", err)
		return false
	}
	return inserted
}

// syncJenkins refreshes credential metadata and which jobs use each one.
func (s *Server) syncJenkins(ctx context.Context, j *sources.Jenkins) (string, error) {
	creds, err := j.Credentials(ctx)
	if err != nil {
		return "", fmt.Errorf("reading credentials: %w", err)
	}
	jobs, err := j.Jobs(ctx)
	if err != nil {
		return "", fmt.Errorf("listing jobs: %w", err)
	}
	usedBy := map[string][]string{}
	read := 0
	for i, job := range jobs {
		if sources.IsFolder(job.Class) {
			continue
		}
		if i%20 == 0 {
			s.progress("jenkins", fmt.Sprintf("Reading job configurations (%d of %d)", i+1, len(jobs)))
		}
		cfg, err := j.JobConfig(ctx, job.Path)
		if err != nil {
			continue
		}
		read++
		for _, id := range sources.CredentialRefs(cfg) {
			usedBy[id] = append(usedBy[id], job.Path)
		}
	}
	tx, err := s.st.DB.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	for _, c := range creds {
		users := usedBy[c.ID]
		sort.Strings(users)
		if users == nil {
			users = []string{}
		}
		u, _ := json.Marshal(users)
		if _, err := tx.Exec(ctx, `INSERT INTO jenkins_credentials (store, domain, credential_id, type_name, display_name, description, used_by)
			VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (store, domain, credential_id) DO UPDATE SET
			type_name = $4, display_name = $5, description = $6, used_by = $7, last_seen = now()`,
			c.Store, c.Domain, c.ID, c.TypeName, c.DisplayName, c.Description, u); err != nil {
			return "", err
		}
	}
	// Removed from Jenkins: no longer a credential to track. (now() is the transaction's start.)
	if _, err := tx.Exec(ctx, `DELETE FROM jenkins_credentials WHERE last_seen < now()`); err != nil {
		return "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	unused := 0
	for _, c := range creds {
		if len(usedBy[c.ID]) == 0 {
			unused++
		}
	}
	return fmt.Sprintf("Found %s (%d not used by any job) across %s.", plural(len(creds), "credential", "credentials"), unused, plural(read, "job", "jobs")), nil
}

func plural(n int, one, many string) string {
	if n == 1 {
		return "1 " + one
	}
	return fmt.Sprintf("%d %s", n, many)
}
