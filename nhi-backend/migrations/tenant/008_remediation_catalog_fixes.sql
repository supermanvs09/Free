-- =====================================================================
-- 002: correct the default rule -> action mapping (remediation_rule_actions).
-- The seed only inserts missing rows (ON CONFLICT DO NOTHING), so rows written by
-- the first version are removed here; the seed then inserts the corrected defaults
-- right after the migrations.
--
-- Corrected:  IAM-01/02/03, O10, M09, CR-009, IAM-04, CICD-03 (key lists, user lookup),
--             KMS-02 (grantee_principal from external_accounts)
-- Removed:    ECS-04, IAM-29 (disabled in the engine as duplicates)
--             M02, M03 (no single key ARN; M03 was mapped to a secret action by mistake)
--             S-C01 (target is a permission set / Roles Anywhere profile, not a role)
--             ACM-02 (target is a Private CA, not a role policy)
-- Plans already created are not changed.
-- =====================================================================
DELETE FROM :"schema".remediation_rule_actions
WHERE rule_id IN ('IAM-01','IAM-02','IAM-03','O10','M09','CR-009','IAM-04','CICD-03','KMS-02',
                  'ECS-04','IAM-29','M02','M03','S-C01','ACM-02');
