-- =====================================================================
-- 009: shared tables with the engine's automatic remediation.
--   1. account settings: remediation_* columns on the platform's accounts table
--      (also added by 007 and by engine migration 015; repeated here for schemas that
--      ran the first 007, which kept them in remediation_accounts)
--   2. settings saved in remediation_accounts are copied to accounts, then the
--      first version's tables (remediation_rule_actions, remediation_accounts) are dropped
--   3. rule -> action mapping in the rule catalog ispm_rule_weights (same as engine
--      migration 012; rows already filled are not overwritten)
-- Needs the accounts table and the engine's ispm_rule_weights: until both exist, this
-- migration fails and the tenant reports "not ready".
-- =====================================================================

-- 1. account settings
ALTER TABLE IF EXISTS :"schema".accounts ADD COLUMN IF NOT EXISTS remediation_enabled           BOOLEAN NOT NULL DEFAULT false;  -- One-click opt-in
ALTER TABLE IF EXISTS :"schema".accounts ADD COLUMN IF NOT EXISTS auto_remediation_enabled      BOOLEAN NOT NULL DEFAULT false;  -- engine automatic opt-in
ALTER TABLE IF EXISTS :"schema".accounts ADD COLUMN IF NOT EXISTS remediation_role_arn          TEXT;
ALTER TABLE IF EXISTS :"schema".accounts ADD COLUMN IF NOT EXISTS remediation_external_id       TEXT;     -- else external_id is used
ALTER TABLE IF EXISTS :"schema".accounts ADD COLUMN IF NOT EXISTS remediation_allowed_actions   TEXT[]  NOT NULL DEFAULT '{}';
ALTER TABLE IF EXISTS :"schema".accounts ADD COLUMN IF NOT EXISTS remediation_regions           TEXT[]  NOT NULL DEFAULT '{}';
ALTER TABLE IF EXISTS :"schema".accounts ADD COLUMN IF NOT EXISTS remediation_approval_policy   JSONB   NOT NULL DEFAULT '{"low":1,"medium":1,"high":1}'::jsonb;
ALTER TABLE IF EXISTS :"schema".accounts ADD COLUMN IF NOT EXISTS remediation_grace_days        JSONB   NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS :"schema".accounts ADD COLUMN IF NOT EXISTS remediation_access_status     TEXT    NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE IF EXISTS :"schema".accounts ADD COLUMN IF NOT EXISTS remediation_access_detail     TEXT;
ALTER TABLE IF EXISTS :"schema".accounts ADD COLUMN IF NOT EXISTS remediation_access_checked_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS :"schema".accounts ADD COLUMN IF NOT EXISTS remediation_enabled_by        TEXT;
ALTER TABLE IF EXISTS :"schema".accounts ADD COLUMN IF NOT EXISTS remediation_enabled_at        TIMESTAMPTZ;
ALTER TABLE IF EXISTS :"schema".accounts ADD COLUMN IF NOT EXISTS remediation_updated_at        TIMESTAMPTZ;

-- 2. move the settings of the first version, then drop its tables. Plain SQL on purpose (psql
--    does not substitute :"schema" inside DO blocks): the old table is created empty when it
--    does not exist, so the copy is a no-op there. Settings of an account that is not in
--    accounts cannot be kept (save them again after onboarding the account).
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
    access_status           TEXT        NOT NULL DEFAULT 'UNKNOWN',
    access_detail           TEXT,
    access_checked_at       TIMESTAMPTZ,
    enabled_by              TEXT,
    enabled_at              TIMESTAMPTZ,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, account_id)
);
UPDATE :"schema".accounts a SET
    remediation_enabled           = r.remediation_enabled,
    remediation_role_arn          = r.remediation_role_arn,
    remediation_external_id       = CASE WHEN r.remediation_external_id IS DISTINCT FROM a.external_id::text
                                         THEN r.remediation_external_id ELSE a.remediation_external_id END,
    remediation_allowed_actions   = r.allowed_action_types,
    remediation_regions           = r.enabled_regions,
    remediation_approval_policy   = r.approval_policy,
    remediation_grace_days        = r.grace_days,
    remediation_access_status     = r.access_status,
    remediation_access_detail     = r.access_detail,
    remediation_access_checked_at = r.access_checked_at,
    remediation_enabled_by        = r.enabled_by,
    remediation_enabled_at        = r.enabled_at,
    remediation_updated_at        = r.updated_at
FROM :"schema".remediation_accounts r
WHERE a.account_id::text = r.account_id AND a.remediation_role_arn IS NULL AND NOT a.remediation_enabled;
DROP TABLE IF EXISTS :"schema".remediation_rule_actions;
DROP TABLE IF EXISTS :"schema".remediation_accounts;

-- 3. rule -> action mapping
--   remediation_action_type  default action for the rule (NULL = no remediation)
--   remediation_alt_actions  other actions that may be chosen
--   remediation_params       where the target is found in the finding
--                            ($.evidence.<key> / $.finding.<column>; "a|b" = first found)
ALTER TABLE :"schema".ispm_rule_weights ADD COLUMN IF NOT EXISTS remediation_action_type TEXT;
ALTER TABLE :"schema".ispm_rule_weights ADD COLUMN IF NOT EXISTS remediation_alt_actions TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE :"schema".ispm_rule_weights ADD COLUMN IF NOT EXISTS remediation_params JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE :"schema".ispm_rule_weights w
SET remediation_action_type = m.action, remediation_alt_actions = m.alts::text[], remediation_params = m.params
FROM (VALUES
('CICD-02', 'scope_policy', '{replace_managed_policy,remove_statement}', '{"target_arn":"$.evidence.role_arn|$.evidence.execution_role_arn|$.finding.credential_arn"}'::jsonb),
 ('CICD-03', 'replace_key_with_role', '{}', '{"user_name":"$.evidence.user_name","access_key_id":"$.evidence.access_key_id|$.evidence.active_keys|$.evidence.access_keys|$.evidence.access_key_ids|$.evidence.keys"}'::jsonb),
 ('CR-006', 'rotate_secret', '{}', '{"secret_id":"$.evidence.secret_arn|$.evidence.secret|$.finding.credential_arn"}'::jsonb),
 ('CR-009', 'deactivate_key', '{}', '{"user_name":"$.evidence.user_name","access_key_id":"$.evidence.access_key_id|$.evidence.active_keys|$.evidence.access_keys|$.evidence.access_key_ids|$.evidence.keys","skip_usage_check":true}'::jsonb),
 ('EI-C04', 'update_key_policy', '{}', '{"key_id":"$.evidence.key_arn|$.evidence.key_id|$.evidence.key|$.finding.credential_arn"}'::jsonb),
 ('EI-C08', 'revoke_grant', '{update_key_policy}', '{"key_id":"$.evidence.key_arn|$.evidence.key_id|$.evidence.key|$.finding.credential_arn","grantee_principal":"$.evidence.grantee_principal|$.evidence.grantees[0]"}'::jsonb),
 ('EKS-04', 'rewrite_trust', '{}', '{"target_arn":"$.evidence.role_arn|$.finding.credential_arn","oidc_pin":true}'::jsonb),
 ('I10', 'set_session_duration', '{}', '{"target_arn":"$.evidence.role_arn|$.finding.credential_arn","new_max_session":3600}'::jsonb),
 ('IAM-01', 'rotate_access_key', '{deactivate_key}', '{"user_name":"$.evidence.user_name","access_key_id":"$.evidence.access_key_id|$.evidence.active_keys|$.evidence.access_keys|$.evidence.access_key_ids|$.evidence.keys"}'::jsonb),
 ('IAM-02', 'deactivate_key', '{}', '{"user_name":"$.evidence.user_name","access_key_id":"$.evidence.access_key_id|$.evidence.active_keys|$.evidence.access_keys|$.evidence.access_key_ids|$.evidence.keys"}'::jsonb),
 ('IAM-03', 'deactivate_key', '{}', '{"user_name":"$.evidence.user_name","access_key_id":"$.evidence.access_key_id|$.evidence.active_keys|$.evidence.access_keys|$.evidence.access_key_ids|$.evidence.keys"}'::jsonb),
 ('IAM-04', 'replace_key_with_role', '{}', '{"user_name":"$.evidence.user_name","access_key_id":"$.evidence.access_key_id|$.evidence.active_keys|$.evidence.access_keys|$.evidence.access_key_ids|$.evidence.keys"}'::jsonb),
 ('IAM-05', 'replace_managed_policy', '{scope_policy,remove_statement}', '{"target_arn":"$.evidence.role_arn|$.evidence.execution_role_arn|$.finding.credential_arn"}'::jsonb),
 ('IAM-06', 'scope_policy', '{replace_managed_policy,remove_statement}', '{"target_arn":"$.evidence.role_arn|$.evidence.execution_role_arn|$.finding.credential_arn"}'::jsonb),
 ('IAM-07', 'scope_policy', '{replace_managed_policy,remove_statement}', '{"target_arn":"$.evidence.role_arn|$.evidence.execution_role_arn|$.finding.credential_arn"}'::jsonb),
 ('IAM-09', 'scope_policy', '{replace_managed_policy,remove_statement}', '{"target_arn":"$.evidence.role_arn|$.evidence.execution_role_arn|$.finding.credential_arn"}'::jsonb),
 ('IAM-14', 'rewrite_trust', '{}', '{"target_arn":"$.evidence.role_arn|$.evidence.execution_role_arn|$.finding.credential_arn"}'::jsonb),
 ('IAM-15', 'rewrite_trust', '{}', '{"target_arn":"$.evidence.role_arn|$.finding.credential_arn","add_external_id":true}'::jsonb),
 ('IAM-16', 'rewrite_trust', '{}', '{"target_arn":"$.evidence.role_arn|$.evidence.execution_role_arn|$.finding.credential_arn"}'::jsonb),
 ('IAM-17', 'rewrite_trust', '{}', '{"target_arn":"$.evidence.role_arn|$.evidence.execution_role_arn|$.finding.credential_arn"}'::jsonb),
 ('IAM-19', 'set_session_duration', '{}', '{"target_arn":"$.evidence.role_arn|$.finding.credential_arn","new_max_session":3600}'::jsonb),
 ('K-C08', 'review_key_access', '{}', '{"key_id":"$.evidence.key_arn|$.evidence.key_id|$.evidence.key|$.finding.credential_arn"}'::jsonb),
 ('K-I04', 'scope_policy', '{replace_managed_policy,remove_statement}', '{"target_arn":"$.evidence.role_arn|$.evidence.execution_role_arn|$.finding.credential_arn"}'::jsonb),
 ('K-I05', 'rewrite_trust', '{}', '{"target_arn":"$.evidence.role_arn|$.evidence.execution_role_arn|$.finding.credential_arn"}'::jsonb),
 ('KMS-01', 'update_key_policy', '{}', '{"key_id":"$.evidence.key_arn|$.evidence.key_id|$.evidence.key|$.finding.credential_arn"}'::jsonb),
 ('KMS-02', 'revoke_grant', '{}', '{"key_id":"$.evidence.key_arn|$.evidence.key_id|$.evidence.key|$.finding.credential_arn","grantee_principal":"$.evidence.grantee_principal|$.evidence.external_accounts[0]"}'::jsonb),
 ('KMS-03', 'enable_key_rotation', '{}', '{"key_id":"$.evidence.key_arn|$.evidence.key_id|$.evidence.key|$.finding.credential_arn"}'::jsonb),
 ('M09', 'deactivate_key', '{}', '{"user_name":"$.evidence.user_name|$.finding.identity_name","access_key_id":"$.evidence.access_key_id|$.evidence.active_keys|$.evidence.access_keys|$.evidence.access_key_ids|$.evidence.keys"}'::jsonb),
 ('NHI-010', 'scope_policy', '{replace_managed_policy,remove_statement}', '{"target_arn":"$.evidence.role_arn|$.evidence.execution_role_arn|$.finding.credential_arn"}'::jsonb),
 ('O03', 'rewrite_trust', '{}', '{"target_arn":"$.evidence.role_arn|$.evidence.execution_role_arn|$.finding.credential_arn"}'::jsonb),
 ('O04', 'rewrite_trust', '{}', '{"target_arn":"$.evidence.role_arn|$.evidence.execution_role_arn|$.finding.credential_arn"}'::jsonb),
 ('O08', 'set_session_duration', '{}', '{"target_arn":"$.evidence.role_arn|$.finding.credential_arn","new_max_session":3600}'::jsonb),
 ('O10', 'deactivate_key', '{}', '{"user_name":"$.evidence.user_name|$.finding.identity_name","access_key_id":"$.evidence.access_key_id|$.evidence.active_keys|$.evidence.access_keys|$.evidence.access_key_ids|$.evidence.keys"}'::jsonb),
 ('RS-01', 'scope_policy', '{replace_managed_policy,remove_statement}', '{"target_arn":"$.evidence.role_arn|$.evidence.execution_role_arn|$.finding.credential_arn"}'::jsonb),
 ('SEC-01', 'rotate_secret', '{}', '{"secret_id":"$.evidence.secret_arn|$.evidence.secret|$.finding.credential_arn"}'::jsonb),
 ('SEC-02', 'update_secret_policy', '{}', '{"secret_id":"$.evidence.secret_arn|$.evidence.secret|$.finding.credential_arn"}'::jsonb),
 ('SEC-03', 'update_secret_policy', '{}', '{"secret_id":"$.evidence.secret_arn|$.evidence.secret|$.finding.credential_arn"}'::jsonb),
 ('STS-01', 'rewrite_trust', '{}', '{"target_arn":"$.evidence.role_arn|$.finding.credential_arn","oidc_pin":true}'::jsonb),
 ('STS-04', 'rewrite_trust', '{}', '{"target_arn":"$.evidence.role_arn|$.finding.credential_arn","oidc_pin":true}'::jsonb)
) AS m (rule_id, action, alts, params)
WHERE w.rule_id = m.rule_id AND w.remediation_action_type IS NULL;

-- EI-C08 evidence names the grantees ({"grantees": [...]}); revoke_grant needs one of them.
-- Also fixes a row filled earlier by engine migration 012 without it.
UPDATE :"schema".ispm_rule_weights
SET remediation_params = remediation_params || '{"grantee_principal":"$.evidence.grantee_principal|$.evidence.grantees[0]"}'::jsonb
WHERE rule_id = 'EI-C08' AND remediation_action_type = 'revoke_grant' AND NOT (remediation_params ? 'grantee_principal');
