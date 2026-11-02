-- ============================================================
-- ispm-remediator: remediation_* tables (design section 10).
-- Created in the tenant ENGINE schema, next to the ispm_* tables.
-- :"schema" is the tenant schema (psql -v schema=<name>); the Go migrator substitutes it the same way.
-- No hard foreign key to ispm_nhi_findings: the engine owns that table.
-- ============================================================

-- 10.1 catalog of action types (seeded by the service, editable)
CREATE TABLE IF NOT EXISTS :"schema".remediation_actions (
    action_type         TEXT PRIMARY KEY,
    remediation_group   TEXT        NOT NULL,
    platform            TEXT        NOT NULL DEFAULT 'aws',
    title               TEXT        NOT NULL,
    description         TEXT        NOT NULL DEFAULT '',
    risk_level          TEXT        NOT NULL CHECK (risk_level IN ('LOW','MEDIUM','HIGH')),
    reversible          BOOLEAN     NOT NULL DEFAULT true,
    one_click_supported BOOLEAN     NOT NULL DEFAULT true,
    default_grace_days  INT         NOT NULL DEFAULT 0,
    required_permissions TEXT[]     NOT NULL DEFAULT '{}',
    steps_template      JSONB       NOT NULL DEFAULT '[]'::jsonb,
    enabled             BOOLEAN     NOT NULL DEFAULT true
);

-- 10.2 which action fixes which rule
CREATE TABLE IF NOT EXISTS :"schema".remediation_rule_actions (
    rule_id         TEXT    NOT NULL,
    action_type     TEXT    NOT NULL REFERENCES :"schema".remediation_actions (action_type) ON UPDATE CASCADE,
    is_default      BOOLEAN NOT NULL DEFAULT true,
    params_template JSONB   NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (rule_id, action_type)
);

-- 9.2 account opt-in and settings (own table: the onboarding table is not known)
CREATE TABLE IF NOT EXISTS :"schema".remediation_accounts (
    tenant_id               UUID        NOT NULL,
    account_id              TEXT        NOT NULL,
    remediation_enabled     BOOLEAN     NOT NULL DEFAULT false,
    remediation_role_arn    TEXT,
    remediation_external_id TEXT,
    allowed_action_types    TEXT[]      NOT NULL DEFAULT '{}',
    enabled_regions         TEXT[]      NOT NULL DEFAULT '{}',
    approval_policy         JSONB       NOT NULL DEFAULT '{"low":1,"medium":1,"high":1}'::jsonb,
    grace_days              JSONB       NOT NULL DEFAULT '{}'::jsonb,
    access_status           TEXT        NOT NULL DEFAULT 'UNKNOWN'
                            CHECK (access_status IN ('UNKNOWN','OK','CANNOT_ASSUME','MISSING_PERMISSIONS')),
    access_detail           TEXT,
    access_checked_at       TIMESTAMPTZ,
    enabled_by              TEXT,
    enabled_at              TIMESTAMPTZ,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, account_id)
);

-- 10.5 batches
CREATE TABLE IF NOT EXISTS :"schema".remediation_batches (
    batch_id     UUID PRIMARY KEY,
    tenant_id    UUID        NOT NULL,
    mode         TEXT        NOT NULL CHECK (mode IN ('INDEPENDENT','ALL_OR_NOTHING')),
    requested_by TEXT        NOT NULL,
    plan_count   INT         NOT NULL DEFAULT 0,
    status       TEXT        NOT NULL DEFAULT 'RUNNING'
                 CHECK (status IN ('RUNNING','COMPLETED','PARTIAL','FAILED','ROLLED_BACK','ROLLBACK_FAILED','CANCELLED')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- 10.3 plans: WHAT to change
CREATE TABLE IF NOT EXISTS :"schema".remediation_plans (
    plan_id            UUID PRIMARY KEY,
    tenant_id          UUID        NOT NULL,
    batch_id           UUID,
    finding_ids        UUID[]      NOT NULL DEFAULT '{}',
    rule_ids           TEXT[]      NOT NULL DEFAULT '{}',
    identity_ids       TEXT[]      NOT NULL DEFAULT '{}',
    action_type        TEXT        NOT NULL,
    platform           TEXT        NOT NULL DEFAULT 'aws',
    account_id         TEXT        NOT NULL,
    region             TEXT,
    target_arn         TEXT        NOT NULL,
    target_type        TEXT        NOT NULL,
    params             JSONB       NOT NULL DEFAULT '{}'::jsonb,
    before_state       JSONB       NOT NULL DEFAULT '{}'::jsonb,
    after_state        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    diff               JSONB       NOT NULL DEFAULT '[]'::jsonb,
    live_state_hash    TEXT        NOT NULL DEFAULT '',
    steps              JSONB       NOT NULL DEFAULT '[]'::jsonb,
    prechecks          JSONB       NOT NULL DEFAULT '[]'::jsonb,
    usage_basis        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    risk_level         TEXT        NOT NULL CHECK (risk_level IN ('LOW','MEDIUM','HIGH')),
    required_approvals INT         NOT NULL DEFAULT 1,
    score_current      NUMERIC(6,1),
    score_gain         NUMERIC(6,1),
    score_projected    NUMERIC(6,1),
    fleet_gain         NUMERIC(6,2),
    mode               TEXT        NOT NULL CHECK (mode IN ('GUIDED','ONE_CLICK')),
    status             TEXT        NOT NULL CHECK (status IN (
        'DRAFT','READY','WAITING_EXTERNAL','PENDING_APPROVAL','APPROVED','SCHEDULED','EXECUTING',
        'EXECUTED','VERIFIED','RESOLVED','REJECTED','FAILED','ROLLED_BACK','MANUALLY_DONE',
        'EXPIRED','SUPERSEDED','CANCELLED')),
    status_reason      TEXT,
    plan_hash          TEXT        NOT NULL DEFAULT '',
    superseded_by      UUID,
    valid_until        TIMESTAMPTZ,
    created_by         TEXT        NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rem_plans_tenant_status ON :"schema".remediation_plans (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rem_plans_findings      ON :"schema".remediation_plans USING GIN (finding_ids);
CREATE INDEX IF NOT EXISTS idx_rem_plans_target        ON :"schema".remediation_plans (tenant_id, target_arn);
CREATE INDEX IF NOT EXISTS idx_rem_plans_batch         ON :"schema".remediation_plans (batch_id) WHERE batch_id IS NOT NULL;

-- 10.4 executions: HOW / WHEN it was applied. This table is also the queue.
CREATE TABLE IF NOT EXISTS :"schema".remediation_executions (
    execution_id     UUID PRIMARY KEY,
    plan_id          UUID        NOT NULL,
    tenant_id        UUID        NOT NULL,
    kind             TEXT        NOT NULL CHECK (kind IN ('EXECUTE','ROLLBACK','FINALIZE')),
    rollback_of      UUID,
    attempt          INT         NOT NULL DEFAULT 0,
    triggered_by     TEXT        NOT NULL,
    status           TEXT        NOT NULL CHECK (status IN
                     ('QUEUED','RUNNING','SUCCEEDED','FAILED','ROLLED_BACK','ROLLBACK_FAILED','CANCELLED')),
    scheduled_for    TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at       TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,
    assumed_role_arn TEXT,
    session_name     TEXT,
    steps            JSONB       NOT NULL DEFAULT '[]'::jsonb,
    rollback_state   JSONB       NOT NULL DEFAULT '{}'::jsonb,
    result           JSONB       NOT NULL DEFAULT '{}'::jsonb,
    verify_result    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    error_code       TEXT,
    error_message    TEXT,
    rescan_job_id    TEXT,
    grace_notified   BOOLEAN     NOT NULL DEFAULT false,
    locked_by        TEXT,
    locked_until     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rem_exec_queue ON :"schema".remediation_executions (scheduled_for) WHERE status = 'QUEUED';
CREATE INDEX IF NOT EXISTS idx_rem_exec_plan  ON :"schema".remediation_executions (plan_id, created_at DESC);

-- approvals (one row per approver decision)
CREATE TABLE IF NOT EXISTS :"schema".remediation_approvals (
    approval_id   UUID PRIMARY KEY,
    plan_id       UUID        NOT NULL,
    tenant_id     UUID        NOT NULL,
    approver      TEXT        NOT NULL,
    approver_role TEXT        NOT NULL,
    decision      TEXT        NOT NULL CHECK (decision IN ('APPROVED','REJECTED')),
    comment       TEXT,
    plan_hash     TEXT        NOT NULL,
    decided_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (plan_id, approver, plan_hash)
);
CREATE INDEX IF NOT EXISTS idx_rem_approvals_plan ON :"schema".remediation_approvals (plan_id);

-- 10.7 append-only audit log
CREATE TABLE IF NOT EXISTS :"schema".remediation_audit_log (
    id           BIGSERIAL PRIMARY KEY,
    tenant_id    UUID        NOT NULL,
    plan_id      UUID,
    execution_id UUID,
    batch_id     UUID,
    event        TEXT        NOT NULL,
    actor        TEXT        NOT NULL,
    details      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rem_audit_plan   ON :"schema".remediation_audit_log (plan_id, id);
CREATE INDEX IF NOT EXISTS idx_rem_audit_tenant ON :"schema".remediation_audit_log (tenant_id, id);

CREATE OR REPLACE FUNCTION :"schema".remediation_audit_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'remediation_audit_log is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS remediation_audit_no_change ON :"schema".remediation_audit_log;
CREATE TRIGGER remediation_audit_no_change BEFORE UPDATE OR DELETE ON :"schema".remediation_audit_log
    FOR EACH ROW EXECUTE FUNCTION :"schema".remediation_audit_immutable();

-- 10.8 Jira / email settings per tenant
CREATE TABLE IF NOT EXISTS :"schema".remediation_integrations (
    integration_id UUID PRIMARY KEY,
    tenant_id      UUID        NOT NULL,
    type           TEXT        NOT NULL CHECK (type IN ('JIRA','SMTP','SES')),
    enabled        BOOLEAN     NOT NULL DEFAULT false,
    config         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    secret_ref     TEXT,
    cursor_at      TIMESTAMPTZ,            -- Jira: last ispm_finding_history.created_at processed
    cursor_id      TEXT,                   -- ... and its id (history ids are UUIDs, not sequences)
    audit_cursor   BIGINT      NOT NULL DEFAULT 0,  -- Jira: last remediation_audit_log.id commented
    last_sync_at   TIMESTAMPTZ,
    last_error     TEXT,
    UNIQUE (tenant_id, type)
);

-- 10.9 one ticket per finding
CREATE TABLE IF NOT EXISTS :"schema".remediation_ticket_links (
    finding_id     UUID PRIMARY KEY,
    tenant_id      UUID        NOT NULL,
    integration_id UUID        NOT NULL,
    external_key   TEXT        NOT NULL,
    external_id    TEXT,
    url            TEXT,
    ticket_state   TEXT        NOT NULL DEFAULT 'OPEN' CHECK (ticket_state IN ('OPEN','CLOSED')),
    last_event     TEXT,
    last_synced_at TIMESTAMPTZ,
    last_checked_at TIMESTAMPTZ,
    last_error     TEXT
);
CREATE INDEX IF NOT EXISTS idx_rem_tickets_tenant ON :"schema".remediation_ticket_links (tenant_id, ticket_state);

-- 10.10 email outbox
CREATE TABLE IF NOT EXISTS :"schema".remediation_notifications (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       UUID        NOT NULL,
    type            TEXT        NOT NULL CHECK (type IN
                    ('APPROVAL_REQUESTED','EXECUTED','FAILED','ROLLED_BACK','GRACE_ENDING','DIGEST')),
    plan_id         UUID,
    recipients      TEXT[]      NOT NULL DEFAULT '{}',
    subject         TEXT        NOT NULL,
    body_html       TEXT        NOT NULL,
    body_text       TEXT        NOT NULL,
    status          TEXT        NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED')),
    attempts        INT         NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at         TIMESTAMPTZ,
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rem_notif_pending ON :"schema".remediation_notifications (next_attempt_at) WHERE status = 'PENDING';
