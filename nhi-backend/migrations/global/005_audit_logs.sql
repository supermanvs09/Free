-- Apply once to nhi_db, after 001-004. Safe to run again.
--
-- The audit log: one row per action anybody took in the console. It lives in
-- the global schema with a tenant column rather than in each tenant schema, so
-- that a tenant's log survives its schema being rebuilt, and so a deployment
-- can be reviewed in one place.
--
-- Written by the audit middleware (internal/platform/audit), which records
-- every state change, every refusal, every sign-in and every export. Values
-- that look like secrets are replaced before they are stored.
BEGIN;

CREATE TABLE IF NOT EXISTS nhi_global.audit_logs (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at  timestamptz NOT NULL DEFAULT now(),
    tenant_id    uuid,                       -- null for an action taken before sign-in
    actor        text        NOT NULL,       -- the user's email, or 'anonymous'
    actor_role   text        NOT NULL DEFAULT '',
    action       text        NOT NULL,       -- 'aws.accounts.create', 'login', ...
    method       text        NOT NULL DEFAULT '',
    route        text        NOT NULL DEFAULT '',
    path         text        NOT NULL DEFAULT '',
    target       text        NOT NULL DEFAULT '',  -- the id the action was about
    status       integer     NOT NULL DEFAULT 0,
    outcome      text        NOT NULL DEFAULT '',  -- success | denied | invalid | failed
    error_code   text        NOT NULL DEFAULT '',
    request_id   text        NOT NULL DEFAULT '',
    ip           inet,
    user_agent   text        NOT NULL DEFAULT '',
    duration_ms  integer     NOT NULL DEFAULT 0,
    screen       text        NOT NULL DEFAULT '',  -- the console screen it came from
    details      jsonb       NOT NULL DEFAULT '{}'::jsonb
);

-- The console reads the log newest-first for one tenant; everything else is a
-- filter on top of that.
CREATE INDEX IF NOT EXISTS audit_logs_tenant_time_idx ON nhi_global.audit_logs (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_time_idx  ON nhi_global.audit_logs (tenant_id, actor, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_time_idx ON nhi_global.audit_logs (tenant_id, action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_outcome_idx     ON nhi_global.audit_logs (tenant_id, outcome, occurred_at DESC)
    WHERE outcome <> 'success';

-- Free-text search over the columns a person searches by.
CREATE INDEX IF NOT EXISTS audit_logs_search_idx ON nhi_global.audit_logs
    USING gin (to_tsvector('simple', actor || ' ' || action || ' ' || target || ' ' || path));

COMMIT;

-- Keeping the log from growing without end. Choose a retention and run this
-- from a scheduled job; the console never deletes audit entries itself.
--   DELETE FROM nhi_global.audit_logs WHERE occurred_at < now() - interval '400 days';
