-- =====================================================================
-- 010: remediation_plans, remediation_executions and accounts shared with the engine's
-- automatic remediation (ispm-worker). One set of tables for both paths:
--   dashboard plan : policy_id NULL      -> created, approved and executed through this API
--   engine plan    : policy_id set       -> created and executed by the engine;
--                                           approved or rejected through this API
-- Safe to run again. Also added by the engine's own migrations (same names, IF NOT EXISTS).
-- =====================================================================

-- plans created by the engine's policies
ALTER TABLE :"schema".remediation_plans ADD COLUMN IF NOT EXISTS policy_id    UUID;   -- ispm_auto_policies.policy_id (NULL = dashboard plan)
ALTER TABLE :"schema".remediation_plans ADD COLUMN IF NOT EXISTS target_key   TEXT;   -- engine: one plan per role / key / secret
ALTER TABLE :"schema".remediation_plans ADD COLUMN IF NOT EXISTS follow_up_of UUID;   -- engine: second step of a key rotation
ALTER TABLE :"schema".remediation_plans ADD COLUMN IF NOT EXISTS scan_id      TEXT;   -- engine: the scan that found the finding

-- the engine also records DRY_RUN and SKIPPED plans
ALTER TABLE :"schema".remediation_plans DROP CONSTRAINT IF EXISTS remediation_plans_status_check;
ALTER TABLE :"schema".remediation_plans ADD CONSTRAINT remediation_plans_status_check CHECK (status IN (
    'DRAFT','READY','WAITING_EXTERNAL','PENDING_APPROVAL','APPROVED','SCHEDULED','EXECUTING',
    'EXECUTED','VERIFIED','RESOLVED','REJECTED','FAILED','ROLLED_BACK','MANUALLY_DONE',
    'EXPIRED','SUPERSEDED','CANCELLED','DRY_RUN','SKIPPED'));

CREATE INDEX IF NOT EXISTS idx_rem_plans_policy ON :"schema".remediation_plans (tenant_id, policy_id, target_key)
    WHERE policy_id IS NOT NULL;

-- Jira project of an account's tickets (empty = JIRA_PROJECT_KEY); the engine reads it too
ALTER TABLE IF EXISTS :"schema".accounts ADD COLUMN IF NOT EXISTS jira_project_key TEXT;
ALTER TABLE IF EXISTS :"schema".accounts ADD COLUMN IF NOT EXISTS auto_remediation_enabled BOOLEAN NOT NULL DEFAULT false;
