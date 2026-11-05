-- Secret scanner v2 (DATABASE_HANDOVER 2026-11-05). Run per tenant schema
-- (psql -v schema=...). Safe to run again; the scanner itself creates the same
-- tables the first time it needs them, so this only makes them exist up front.
--
--   * bitbucket_uri on every findings table (the third platform's link)
--   * the Bitbucket stack's tables (secscan_*_bitbucket)
--   * secscan_deep_findings_<platform>: deep-scan findings, one row per branch
--     (finding_id ends in "@<branch>"); no longer written to secscan_findings_*
BEGIN;
ALTER TABLE IF EXISTS :"schema".secscan_findings_codecommit ADD COLUMN IF NOT EXISTS bitbucket_uri character varying(2000);
ALTER TABLE IF EXISTS :"schema".secscan_findings_github ADD COLUMN IF NOT EXISTS bitbucket_uri character varying(2000);
-- TABLE: secscan_findings_bitbucket
CREATE TABLE IF NOT EXISTS :"schema".secscan_findings_bitbucket (
    finding_id character varying(1000) NOT NULL,
    client_id character varying(200) NOT NULL,
    repository character varying(500) NOT NULL,
    branch character varying(500) NOT NULL,
    commit_id character varying(100) NOT NULL,
    author character varying(300) NOT NULL,
    created_at character varying(50) NOT NULL,
    detector character varying(100) NOT NULL,
    severity character varying(50) NOT NULL,
    file_path character varying(1000) NOT NULL,
    line_number integer NOT NULL,
    redacted character varying(4000) NOT NULL,
    verification_status character varying(50) NOT NULL,
    risk_tier character varying(50) NOT NULL,
    recommended_action character varying(200) NOT NULL,
    codecommit_uri character varying(2000),
    platform character varying(50),
    github_uri character varying(2000),
    line_preview character varying(4000),
    confidence character varying(50),
    category character varying(100),
    committer character varying(300),
    commit_message character varying(4000),
    commit_authored_at character varying(50),
    files_changed integer,
    additions integer,
    deletions integer,
    repo_visibility character varying(50),
    repo_stars integer,
    repo_forks integer,
    repo_pushed_at character varying(50),
    ml_score double precision,
    ml_decision character varying(50),
    ml_model_version character varying(100),
    analyst_decision character varying(50),
    analyst_decided_at character varying(50),
    analyst_decided_by character varying(300),
    value_fingerprint character varying(64),
    noise_flags character varying(500),
    ml_veto_score double precision,
    ml_veto_model_version character varying(100),
    ml_features text,
    bitbucket_uri character varying(2000),
    PRIMARY KEY (finding_id)
);

-- TABLE: secscan_deep_findings_codecommit
CREATE TABLE IF NOT EXISTS :"schema".secscan_deep_findings_codecommit (
    finding_id character varying(1000) NOT NULL,
    client_id character varying(200) NOT NULL,
    repository character varying(500) NOT NULL,
    branch character varying(500) NOT NULL,
    commit_id character varying(100) NOT NULL,
    author character varying(300) NOT NULL,
    created_at character varying(50) NOT NULL,
    detector character varying(100) NOT NULL,
    severity character varying(50) NOT NULL,
    file_path character varying(1000) NOT NULL,
    line_number integer NOT NULL,
    redacted character varying(4000) NOT NULL,
    verification_status character varying(50) NOT NULL,
    risk_tier character varying(50) NOT NULL,
    recommended_action character varying(200) NOT NULL,
    codecommit_uri character varying(2000),
    platform character varying(50),
    github_uri character varying(2000),
    line_preview character varying(4000),
    confidence character varying(50),
    category character varying(100),
    committer character varying(300),
    commit_message character varying(4000),
    commit_authored_at character varying(50),
    files_changed integer,
    additions integer,
    deletions integer,
    repo_visibility character varying(50),
    repo_stars integer,
    repo_forks integer,
    repo_pushed_at character varying(50),
    ml_score double precision,
    ml_decision character varying(50),
    ml_model_version character varying(100),
    analyst_decision character varying(50),
    analyst_decided_at character varying(50),
    analyst_decided_by character varying(300),
    value_fingerprint character varying(64),
    noise_flags character varying(500),
    ml_veto_score double precision,
    ml_veto_model_version character varying(100),
    ml_features text,
    bitbucket_uri character varying(2000),
    PRIMARY KEY (finding_id)
);

-- TABLE: secscan_deep_findings_github
CREATE TABLE IF NOT EXISTS :"schema".secscan_deep_findings_github (
    finding_id character varying(1000) NOT NULL,
    client_id character varying(200) NOT NULL,
    repository character varying(500) NOT NULL,
    branch character varying(500) NOT NULL,
    commit_id character varying(100) NOT NULL,
    author character varying(300) NOT NULL,
    created_at character varying(50) NOT NULL,
    detector character varying(100) NOT NULL,
    severity character varying(50) NOT NULL,
    file_path character varying(1000) NOT NULL,
    line_number integer NOT NULL,
    redacted character varying(4000) NOT NULL,
    verification_status character varying(50) NOT NULL,
    risk_tier character varying(50) NOT NULL,
    recommended_action character varying(200) NOT NULL,
    codecommit_uri character varying(2000),
    platform character varying(50),
    github_uri character varying(2000),
    line_preview character varying(4000),
    confidence character varying(50),
    category character varying(100),
    committer character varying(300),
    commit_message character varying(4000),
    commit_authored_at character varying(50),
    files_changed integer,
    additions integer,
    deletions integer,
    repo_visibility character varying(50),
    repo_stars integer,
    repo_forks integer,
    repo_pushed_at character varying(50),
    ml_score double precision,
    ml_decision character varying(50),
    ml_model_version character varying(100),
    analyst_decision character varying(50),
    analyst_decided_at character varying(50),
    analyst_decided_by character varying(300),
    value_fingerprint character varying(64),
    noise_flags character varying(500),
    ml_veto_score double precision,
    ml_veto_model_version character varying(100),
    ml_features text,
    bitbucket_uri character varying(2000),
    PRIMARY KEY (finding_id)
);

-- TABLE: secscan_deep_findings_bitbucket
CREATE TABLE IF NOT EXISTS :"schema".secscan_deep_findings_bitbucket (
    finding_id character varying(1000) NOT NULL,
    client_id character varying(200) NOT NULL,
    repository character varying(500) NOT NULL,
    branch character varying(500) NOT NULL,
    commit_id character varying(100) NOT NULL,
    author character varying(300) NOT NULL,
    created_at character varying(50) NOT NULL,
    detector character varying(100) NOT NULL,
    severity character varying(50) NOT NULL,
    file_path character varying(1000) NOT NULL,
    line_number integer NOT NULL,
    redacted character varying(4000) NOT NULL,
    verification_status character varying(50) NOT NULL,
    risk_tier character varying(50) NOT NULL,
    recommended_action character varying(200) NOT NULL,
    codecommit_uri character varying(2000),
    platform character varying(50),
    github_uri character varying(2000),
    line_preview character varying(4000),
    confidence character varying(50),
    category character varying(100),
    committer character varying(300),
    commit_message character varying(4000),
    commit_authored_at character varying(50),
    files_changed integer,
    additions integer,
    deletions integer,
    repo_visibility character varying(50),
    repo_stars integer,
    repo_forks integer,
    repo_pushed_at character varying(50),
    ml_score double precision,
    ml_decision character varying(50),
    ml_model_version character varying(100),
    analyst_decision character varying(50),
    analyst_decided_at character varying(50),
    analyst_decided_by character varying(300),
    value_fingerprint character varying(64),
    noise_flags character varying(500),
    ml_veto_score double precision,
    ml_veto_model_version character varying(100),
    ml_features text,
    bitbucket_uri character varying(2000),
    PRIMARY KEY (finding_id)
);

-- TABLE: secscan_ledger_bitbucket
CREATE TABLE IF NOT EXISTS :"schema".secscan_ledger_bitbucket (
    client_id character varying(200) NOT NULL,
    repo_key character varying(500) NOT NULL,
    platform character varying(50) NOT NULL,
    last_commit_id character varying(100),
    updated_at character varying(50),
    pending_commit_id character varying(100),
    pending_since character varying(50),
    PRIMARY KEY (client_id, repo_key, platform)
);

-- TABLE: secscan_deepscan_bitbucket
CREATE TABLE IF NOT EXISTS :"schema".secscan_deepscan_bitbucket (
    client_id character varying(200) NOT NULL,
    repo_key character varying(500) NOT NULL,
    platform character varying(50) NOT NULL,
    requested_at character varying(50) NOT NULL,
    completed_at character varying(50),
    commits_scanned integer,
    findings integer,
    failed_at character varying(50),
    error character varying(4000),
    PRIMARY KEY (client_id, repo_key, platform)
);

-- TABLE: secscan_allowlist_bitbucket
CREATE TABLE IF NOT EXISTS :"schema".secscan_allowlist_bitbucket (
    client_id character varying(200) NOT NULL,
    file_path character varying(1000) NOT NULL,
    detector character varying(200) NOT NULL,
    redacted character varying(500) NOT NULL,
    reason character varying(1000) DEFAULT ''::character varying NOT NULL,
    dismissed_by character varying(200) DEFAULT ''::character varying NOT NULL,
    dismissed_at character varying(50) NOT NULL,
    PRIMARY KEY (client_id, file_path, detector, redacted)
);

-- TABLE: secscan_jobs_bitbucket
CREATE TABLE IF NOT EXISTS :"schema".secscan_jobs_bitbucket (
    id bigserial PRIMARY KEY,
    payload text NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    error text,
    created_at character varying(50) NOT NULL,
    updated_at character varying(50) NOT NULL
);
COMMIT;
