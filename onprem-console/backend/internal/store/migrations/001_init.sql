-- On-premises console: one organisation per installation. Applied at start,
-- safe to run again.

CREATE TABLE IF NOT EXISTS users (
    id             bigserial PRIMARY KEY,
    email          text        NOT NULL,
    name           text        NOT NULL DEFAULT '',
    password_hash  text        NOT NULL,
    role           text        NOT NULL CHECK (role IN ('admin', 'analyst', 'viewer')),
    active         boolean     NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     text        NOT NULL DEFAULT '',
    last_login_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users (lower(email));

-- One row per source. secret / webhook_secret are AES-256-GCM sealed; config
-- holds only what is safe to show (URLs, ids, usernames).
CREATE TABLE IF NOT EXISTS connections (
    kind            text PRIMARY KEY CHECK (kind IN ('github', 'bitbucket', 'jenkins')),
    config          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    secret          bytea,
    ca_cert         text        NOT NULL DEFAULT '',
    webhook_secret  bytea,
    status          text        NOT NULL DEFAULT 'not_configured',  -- not_configured | saved | connected | failing
    checks          jsonb       NOT NULL DEFAULT '[]'::jsonb,
    verified_at     timestamptz,
    sync_status     text        NOT NULL DEFAULT 'idle',            -- idle | running | done | failed
    sync_detail     text        NOT NULL DEFAULT '',
    sync_started_at timestamptz,
    last_sync_at    timestamptz,
    updated_by      text        NOT NULL DEFAULT '',
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS repositories (
    source          text        NOT NULL,
    full_name       text        NOT NULL,
    default_branch  text        NOT NULL DEFAULT '',
    web_url         text        NOT NULL DEFAULT '',
    files_scanned   integer     NOT NULL DEFAULT 0,
    last_scanned_at timestamptz,
    last_commit     text        NOT NULL DEFAULT '',
    PRIMARY KEY (source, full_name)
);

-- A secret found in code. Only a redacted form and a fingerprint are kept,
-- never the value. One row per (source, repository, file, secret).
CREATE TABLE IF NOT EXISTS findings (
    id           bigserial PRIMARY KEY,
    source       text        NOT NULL,
    repository   text        NOT NULL,
    branch       text        NOT NULL DEFAULT '',
    commit_sha   text        NOT NULL DEFAULT '',
    file_path    text        NOT NULL,
    line         integer     NOT NULL DEFAULT 0,
    detector     text        NOT NULL,
    severity     text        NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    redacted     text        NOT NULL,
    fingerprint  text        NOT NULL,
    author       text        NOT NULL DEFAULT '',
    found_by     text        NOT NULL DEFAULT 'scan',              -- scan | push
    first_seen   timestamptz NOT NULL DEFAULT now(),
    last_seen    timestamptz NOT NULL DEFAULT now(),
    status       text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'false_positive')),
    status_by    text        NOT NULL DEFAULT '',
    status_at    timestamptz,
    UNIQUE (source, repository, file_path, fingerprint)
);
CREATE INDEX IF NOT EXISTS findings_status ON findings (status, severity);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id           bigserial PRIMARY KEY,
    source       text        NOT NULL,
    event        text        NOT NULL DEFAULT '',
    delivery_id  text        NOT NULL DEFAULT '',
    repository   text        NOT NULL DEFAULT '',
    signature_ok boolean     NOT NULL,
    outcome      text        NOT NULL,   -- processed | rejected | ignored | failed
    detail       text        NOT NULL DEFAULT '',
    received_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_deliveries_time ON webhook_deliveries (received_at DESC);

-- Jenkins: credential metadata only (never a value) and the jobs using each.
CREATE TABLE IF NOT EXISTS jenkins_credentials (
    store        text        NOT NULL,
    domain       text        NOT NULL,
    credential_id text       NOT NULL,
    type_name    text        NOT NULL DEFAULT '',
    display_name text        NOT NULL DEFAULT '',
    description  text        NOT NULL DEFAULT '',
    used_by      jsonb       NOT NULL DEFAULT '[]'::jsonb,
    first_seen   timestamptz NOT NULL DEFAULT now(),
    last_seen    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (store, domain, credential_id)
);

CREATE TABLE IF NOT EXISTS jenkins_builds (
    id          bigserial PRIMARY KEY,
    job         text        NOT NULL,
    number      integer     NOT NULL DEFAULT 0,
    phase       text        NOT NULL DEFAULT '',
    status      text        NOT NULL DEFAULT '',
    url         text        NOT NULL DEFAULT '',
    unusual     text        NOT NULL DEFAULT '',
    received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jenkins_builds_time ON jenkins_builds (received_at DESC);
-- The Notification plugin can send STARTED, COMPLETED and FINALIZED for one build: keep one row.
CREATE UNIQUE INDEX IF NOT EXISTS jenkins_builds_job_number ON jenkins_builds (job, number);

CREATE TABLE IF NOT EXISTS audit_log (
    id      bigserial PRIMARY KEY,
    at      timestamptz NOT NULL DEFAULT now(),
    actor   text        NOT NULL,
    action  text        NOT NULL,
    target  text        NOT NULL DEFAULT '',
    detail  text        NOT NULL DEFAULT ''
);
