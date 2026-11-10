-- 008: the first version corrected rows of remediation_rule_actions here. That table is gone:
-- the rule -> action mapping is in ispm_rule_weights and the account settings are on the
-- accounts table. Migration 009 moves any old settings and drops the old tables.
SELECT 1;
