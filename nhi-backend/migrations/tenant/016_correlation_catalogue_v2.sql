BEGIN;

-- ===========================================================================
-- Catalogue v2: disposition per correlation, entity-type aliases, and the 15
-- composition families that replace the mis-wired RULE-001..009, 011..014.
-- Source: review of all 231 correlations for the NHI blast-radius graph
-- (AWS NHIs only: roles and workload identities; access keys as entry points).
-- ===========================================================================

ALTER TABLE :"schema".correlation_definitions
    ADD COLUMN IF NOT EXISTS disposition TEXT;

-- Disposition = the job a correlation does in the graph. Ranges are COR numbers.
UPDATE :"schema".correlation_definitions d SET disposition = m.disposition
FROM (VALUES
    ('runs_as',           ARRAY[1,3,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,25]),
    ('grant',             ARRAY(SELECT generate_series(39,63) UNION ALL SELECT generate_series(65,71) UNION ALL SELECT generate_series(96,105))),
    ('assume',            ARRAY[72,79,91,95,127,129]),
    ('passrole',          ARRAY[107,108,109,110,125]),
    ('escalate',          ARRAY[111,112,114,115,118,119,124,130,131,132,133,134,135]),
    ('destructive',       ARRAY[120,121,122,123]),
    ('link',              ARRAY(SELECT 162 UNION ALL SELECT 165 UNION ALL SELECT generate_series(167,184))),
    ('structure',         ARRAY[163,185,186,187,188,189,200]),
    ('policy',            ARRAY[26,27,29,30]),
    ('constraint',        ARRAY[28,221,226]),
    ('qualifier',         ARRAY[32,33,75,76,77,78,88,89,90,92,94,126,128]),
    ('overlap',           ARRAY[31,73,74,166,190,191,225]),
    ('evidence',          ARRAY(SELECT 106 UNION ALL SELECT generate_series(136,161) UNION ALL SELECT generate_series(201,220))),
    ('node_attribute',    ARRAY[34,35,36,37,38,222,223,224,227,228,229,230,231]),
    ('context',           ARRAY[164,192,193,194,195,196,197,198,199]),
    ('inverse_duplicate', ARRAY[80,83,84,85,86,87]),
    ('duplicate',         ARRAY[2,4]),
    ('out_of_scope',      ARRAY[24,64,81,82,93,113,116,117])
) AS m(disposition, nums)
WHERE d.rule_id LIKE 'COR-%'
  AND substring(d.rule_id FROM 5)::int = ANY(m.nums);

-- Duplicates, inverse duplicates and out-of-scope rows (IAM users/groups, Lightsail,
-- RAM-shared roles, internal ISPM artifact) no longer take part in the graph.
UPDATE :"schema".correlation_definitions
SET is_active = false
WHERE disposition IN ('duplicate', 'inverse_duplicate', 'out_of_scope');

CREATE INDEX IF NOT EXISTS idx_correlation_definitions_disposition
    ON :"schema".correlation_definitions (disposition);

-- ── Entity-type aliases: names that mean the same AWS resource ──────────────
CREATE TABLE IF NOT EXISTS :"schema".correlation_entity_aliases (
    alias      TEXT PRIMARY KEY,
    canonical  TEXT NOT NULL
);
INSERT INTO :"schema".correlation_entity_aliases (alias, canonical) VALUES
    ('EC2::VPC',         'VPC::VPC'),
    ('EC2::VPCEndpoint', 'VPC::Endpoint')
ON CONFLICT (alias) DO NOTHING;

-- ── Composition rules: retire the mis-wired ones ────────────────────────────
-- Their prerequisites referenced COR ids from an older numbering (e.g. RULE-002
-- "role chain" pointed at a DataSync agent and a Greengrass device). RULE-010 has
-- no prerequisites and drives converging-path detection, so it stays active.
UPDATE :"schema".correlation_composition_rules
SET is_active = false
WHERE rule_id IN ('RULE-001','RULE-002','RULE-003','RULE-004','RULE-005','RULE-006','RULE-007',
                  'RULE-008','RULE-009','RULE-011','RULE-012','RULE-013','RULE-014');

-- ── The 15 composition families ──────────────────────────────────────────────
-- prerequisites lists DISPOSITIONS (not single COR ids): a family applies to every
-- active correlation of those dispositions whose entity types join.
INSERT INTO :"schema".correlation_composition_rules
  (rule_id, rule_type, prerequisites, join_key, result_type, result_semantics,
   bidirectional, detection_key, resolution_strategy, flag_always, conditions, description, is_active, path_type)
VALUES
('FAM-01', 'composition',         '["assume", "assume"]',                 'target_arn = source_arn', 'path', 'Role chain: a role can become another role through one or more assumptions', false, 'source_arn + target_arn + semantics', 'keep_strongest', false, '[]', 'F1 role chain (assume o assume)', true, 'PATH-002'),
('FAM-02', 'composition',         '["assume", "grant"]',                  'target_arn = source_arn', 'path', 'Reach via assume: resources of every role the identity can become', false, 'source_arn + target_arn + semantics', 'keep_strongest', false, '[]', 'F2 reach via assume (assume o grant)', true, 'PATH-002'),
('FAM-03', 'consequence',         '["assume", "passrole|escalate"]',      'target_arn = source_arn', 'flag', 'Escalation reachable through a role chain', false, 'source_arn + target_arn + semantics', 'keep_strongest', true,  '[]', 'F3 escalation via chain (assume o passrole/escalate)', true, 'PATH-005'),
('FAM-04', 'composition',         '["runs_as", "grant|assume|passrole|escalate"]', 'target_arn = source_arn', 'path', 'A workload inherits everything its role can reach', false, 'source_arn + target_arn + semantics', 'keep_strongest', false, '[]', 'F4 workload inherits role reach (runs_as o grant/assume/passrole/escalate)', true, 'PATH-004'),
('FAM-05', 'composition',         '["grant", "runs_as"]',                 'grant.target = runs_as.source (via structure)', 'path', 'Modify a workload and become the role it runs as', false, 'source_arn + target_arn + semantics', 'keep_strongest', true,  '["write action on the workload"]', 'F5 modify workload -> its role', true, 'PATH-005'),
('FAM-06', 'composition',         '["passrole", "grant", "runs_as"]',     'passrole.target = grant.target', 'path', 'PassRole plus permission to create compute gives the passed role', false, 'source_arn + target_arn + semantics', 'keep_strongest', true,  '["iam:PassRole", "create/update compute"]', 'F6 PassRole + create compute -> target role', true, 'PATH-005'),
('FAM-07', 'composition',         '["grant", "link", "runs_as"]',         'grant.target = link.source; link.target = runs_as.source', 'path', 'Push an image that a service pulls and runs as its role', false, 'source_arn + target_arn + semantics', 'keep_strongest', true,  '["ecr:PutImage or equivalent"]', 'F7 supply chain: push image -> pulled by -> role', true, 'PATH-004'),
('FAM-08', 'composition',         '["grant", "link", "runs_as"]',         'grant.target = link.source; link.target = runs_as.source', 'path', 'Write to a queue, topic or stream that triggers a Lambda running as its role', false, 'source_arn + target_arn + semantics', 'keep_strongest', false, '["write action", "data-driven, weaker"]', 'F8 trigger injection -> Lambda role', true, 'PATH-004'),
('FAM-09', 'composition',         '["grant", "link"]',                    'grant.target = link.source', 'path', 'A readable secret or parameter unlocks a datastore or workload', false, 'source_arn + target_arn + semantics', 'keep_strongest', true,  '["read action on the secret"]', 'F9 secret/parameter unlocks datastore or workload', true, 'PATH-007'),
('FAM-10', 'dependency',          '["grant", "grant", "link"]',           'kms grant + data grant on the resource the key encrypts', 'requirement', 'Encrypted data is readable only with both the data grant and the KMS grant', false, 'source_arn + target_arn', 'keep_strongest', false, '["kms:Decrypt on the key"]', 'F10 decrypt dependency (data + KMS + key link)', true, 'PATH-006'),
('FAM-11', 'dependency',          '["constraint", "grant"]',              'same principal', 'constraint', 'A permission boundary or SCP caps a grant', false, 'source_arn + target_arn', 'keep_strongest', false, '[]', 'F11 constraint caps a grant', true, NULL),
('FAM-12', 'dependency',          '["qualifier", "assume"]',              'same trust edge', 'attribute', 'MFA, ExternalId, session limits and conditions qualify an assume edge', false, 'source_arn + target_arn', 'keep_strongest', false, '[]', 'F12 qualifier on an assume edge', true, NULL),
('FAM-13', 'evidence_validation', '["evidence", "grant|assume|passrole|runs_as"]', 'same principal and target (or session)', 'validation', 'CloudTrail activity confirms an edge and raises its evidence rank', false, 'source_arn + target_arn', 'keep_strongest', false, '[]', 'F13 evidence confirms an edge', true, 'PATH-008'),
('FAM-14', 'overlap',             '["overlap", "assume|grant|link|constraint"]', 'same edge from another data source', 'confidence', 'A second data source for the same edge raises confidence', true,  'source_arn + target_arn + semantics', 'keep_strongest', false, '[]', 'F14 overlap: second source for same edge', true, NULL),
('FAM-15', 'consequence',         '["assume|runs_as", "destructive"]',    'target_arn = source_arn', 'flag', 'Destructive IAM actions are reachable (delete roles, policies, keys)', false, 'source_arn + target_arn + semantics', 'keep_strongest', true,  '[]', 'F15 destructive impact reachable', true, NULL)
ON CONFLICT (rule_id) DO NOTHING;

COMMIT;
