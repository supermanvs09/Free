BEGIN;

-- =============================================================================
-- Seed Data: Correlation Rules, Composition Rules, Path Types
-- Generated from research catalogue (231 correlations + 10 composition + 10 path)
-- =============================================================================

-- bimasugam schema

-- correlation_definitions (the 231 rules) are seeded by 012_correlation_engine.sql.
-- ── 2. correlation_composition_rules (10 rules) ─────────────────────────

INSERT INTO :"schema".correlation_composition_rules
  (rule_id, rule_type, prerequisites, join_key, result_type, result_semantics,
   bidirectional, detection_key, resolution_strategy, flag_always, conditions, description, is_active)
VALUES
('RULE-001', 'composition', '["COR-001", "COR-043"]', 'workload_arn', 'path', 'NHI can access Resource through Workload', false, 'source_arn + target_arn + semantics', 'keep_strongest', false, '[]', 'Workload-Mediated Access: NHI → Workload + Workload → Resource = NHI → Resource', true),
('RULE-002', 'composition', '["COR-019", "COR-025"]', 'role_arn', 'path', 'NHI can access Resource by assuming another Role', false, 'source_arn + target_arn + semantics', 'keep_strongest', false, '[]', 'Role Chain Composition: NHI → can_assume Role A + Role A → can_access Resource = NHI → Resource', true),
('RULE-003', 'composition', '["COR-014", "COR-076"]', 'policy_arn', 'path', 'NHI can access Resource through attached Policy', false, 'source_arn + target_arn + semantics', 'keep_strongest', false, '[]', 'Policy Composition: NHI → has Policy + Policy → grants access to Resource = NHI → Resource', true),
('RULE-004', 'composition', '["COR-019", "COR-047"]', 'assumption_arn', 'path', 'NHI can assume Role B and use Role B''s permissions', false, 'source_arn + target_arn + semantics', 'keep_strongest', true, '["iam:PassRole"]', 'Trust Composition: NHI → trusts Role B + Role B → has permissions = escalation risk', true),
('RULE-005', 'composition', '["COR-031", "COR-025"]', 'account_id', 'path', 'NHI can access Resource in another account', false, 'source_arn + target_arn + account_id', 'keep_strongest', true, '[]', 'Cross-Account Composition: NHI → cross-account trust + Role in other account → Resource', true),
('RULE-006', 'composition', '["COR-001", "COR-080"]', 'workload_arn', 'path', 'NHI is used by Workload that accesses Resource', false, 'source_arn + target_arn + semantics', 'keep_strongest', false, '[]', 'Compute Composition: NHI → used by Workload + Workload → accessed Resource', true),
('RULE-007', 'overlap', '["COR-025", "COR-076"]', '', 'resource', 'Same access from configured and effective views', false, 'source_arn + target_arn + semantics', 'keep_strongest', false, '[]', 'Overlap Detection: configured permissions and effective permissions say the same thing', true),
('RULE-008', 'evidence', '["COR-025", "COR-047"]', 'resource_arn', 'validation', 'Observed activity confirms configured access', false, '', 'keep_strongest', false, '[]', 'Evidence Validation: log_events (observed) confirms effective_permissions (effective)', true),
('RULE-009', 'consequence', '["COR-019", "COR-025"]', '', 'flag', 'Can assume role with higher privileges = escalation', false, '', 'keep_strongest', true, '["target has higher privilege_level"]', 'Consequence Chain: Can assume Role B + Role B has higher privileges = escalation risk', true),
('RULE-010', 'composition', '[]', 'source_arn + target_arn', 'multi_path', 'Same resource reached by multiple paths', false, 'source_arn + target_arn', 'keep_strongest', false, '[]', 'Multiple Path Detection: same target reached through different paths', true),
-- RULE-011..014 complete the rule-type set named in the implementation plan
-- (connectivity, dependency, path_assembly, evidence_validation). They are derived from
-- that plan's rule-type table, not from the research catalogue — review before relying on them.
('RULE-011', 'connectivity', '["COR-019", "COR-025"]', 'target_arn', 'link', 'Target of one correlation is the source of another', false, 'source_arn + target_arn', 'keep_strongest', false, '[]', 'Connectivity: the target entity of one correlation is the source entity of the next, so they can be chained', true),
('RULE-012', 'dependency', '["COR-019", "COR-025"]', 'role_arn', 'order', 'Role assumption must be established before the role''s permissions apply', false, 'source_arn + target_arn', 'keep_strongest', false, '[]', 'Dependency: a can_assume correlation must fire before the assumed role''s can_access correlations', true),
('RULE-013', 'path_assembly', '["COR-019", "COR-025", "COR-001"]', 'source_arn', 'path', 'Individual correlations assembled into one end-to-end path', false, 'source_arn + target_arn + semantics', 'keep_strongest', false, '[]', 'Path Assembly: ordered hops from the source NHI to the resource form one blast-radius path', true),
('RULE-014', 'evidence_validation', '["COR-025", "COR-047"]', 'resource_arn', 'validation', 'Observed activity strengthens configured or effective access', false, 'resource_arn', 'keep_strongest', false, '[]', 'Evidence Validation: CloudTrail activity on a resource upgrades the evidence rank of a path reaching it', true)
ON CONFLICT (rule_id) DO NOTHING;

-- ── 3. correlation_path_types (10 types) ────────────────────────────────

INSERT INTO :"schema".correlation_path_types
  (path_id, path_name, min_hops, max_hops, confidence_formula, limitations,
   security_significance, phase, description, is_active)
VALUES
('PATH-001', 'Direct Access', 1, 1, 'evidence × completeness × freshness', '["does_not_prove_access_happened"]', 'conditional', 1, 'NHI directly accesses a resource through its own permissions', true),
('PATH-002', 'Role Chain', 2, 5, 'evidence × completeness × freshness', '["does_not_prove_assumption_happened", "does_not_prove_no_SCP_blocks"]', 'conditional', 2, 'NHI accesses a resource by assuming another role in a chain', true),
('PATH-003', 'Cross-Account', 2, 2, 'evidence × completeness × freshness', '["does_not_prove_cross_account_access_happened"]', 'high', 3, 'NHI reaches a resource in another account through trust relationships', true),
('PATH-004', 'Workload Access', 2, 2, 'evidence × completeness × freshness', '["does_not_prove_workload_used_this_role"]', 'conditional', 4, 'NHI is used by a workload that accesses resources', true),
('PATH-005', 'Escalation', 2, 5, 'evidence × completeness × freshness', '["does_not_prove_escalation_happened"]', 'high', 2, 'NHI can pass a role to a resource with higher permissions', true),
('PATH-006', 'KMS Access', 2, 2, 'evidence × completeness × freshness', '["does_not_prove_decryption_happened"]', 'medium', 1, 'NHI can read encrypted data and decrypt it', true),
('PATH-007', 'Secrets Access', 2, 2, 'evidence × completeness × freshness', '["does_not_prove_secret_read_happened"]', 'high', 4, 'NHI''s workload retrieved secrets from Secrets Manager', true),
('PATH-008', 'Observed Activity', 1, 1, 'evidence × completeness × freshness', '["observed_does_not_mean_authorized"]', 'medium', 1, 'NHI actually performed an API call (CloudTrail confirmed)', true),
('PATH-009', 'Historical', 1, 1, 'evidence × completeness × freshness', '["access_may_no_longer_be_possible"]', 'low', 1, 'NHI could access a resource previously, but policy was changed', true),
('PATH-010', 'Multiple Paths', 2, 5, 'evidence × completeness × freshness', '["multiple_paths_do_not_mean_multiple_accesses"]', 'medium', 2, 'Same resource reached through multiple different paths', true)
ON CONFLICT (path_id) DO NOTHING;

-- =============================================================================
-- END OF SEED DATA
-- =============================================================================

COMMIT;
