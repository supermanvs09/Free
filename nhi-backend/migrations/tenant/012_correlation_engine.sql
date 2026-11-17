BEGIN;

-- ===========================================================================
-- NHI Correlation Engine — Combined Migration
-- ===========================================================================
-- Creates all correlation engine tables AND inserts 231 correlation rules.
-- This is a merged migration (was 009 + 010). Safe to run multiple times.
-- Apply once per tenant schema: psql "$DSN" -v schema=<tenant> -f migrations/tenant/012_correlation_engine.sql
-- ===========================================================================


-- ── correlation_definitions: 231 correlation rules ───────────────────────────
CREATE TABLE IF NOT EXISTS :"schema".correlation_definitions (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id                  TEXT        NOT NULL UNIQUE,
    category                 TEXT        NOT NULL,
    source_entity_type       TEXT        NOT NULL,
    source_entity_identifiers JSONB      NOT NULL,
    source_table             TEXT        NOT NULL,
    target_entity_type       TEXT        NOT NULL,
    target_entity_identifiers JSONB      NOT NULL,
    target_table             TEXT        NOT NULL,
    relationship_type        TEXT        NOT NULL,
    edge_type                TEXT        NOT NULL,
    evidence_source          TEXT        NOT NULL,
    evidence_type            TEXT        NOT NULL,
    phase                    INTEGER     NOT NULL DEFAULT 1,
    max_hops                 INTEGER     NOT NULL DEFAULT 1,
    description              TEXT        NOT NULL DEFAULT '',
    is_active                BOOLEAN     NOT NULL DEFAULT true,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_correlation_definitions_category
    ON :"schema".correlation_definitions (category);
CREATE INDEX IF NOT EXISTS idx_correlation_definitions_active
    ON :"schema".correlation_definitions (is_active);
CREATE INDEX IF NOT EXISTS idx_correlation_definitions_source_table
    ON :"schema".correlation_definitions (source_table);
CREATE INDEX IF NOT EXISTS idx_correlation_definitions_target_table
    ON :"schema".correlation_definitions (target_table);

-- ── correlation_composition_rules: 14 composition rules ──────────────────────
CREATE TABLE IF NOT EXISTS :"schema".correlation_composition_rules (
    id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id                TEXT        NOT NULL UNIQUE,
    rule_type              TEXT        NOT NULL,
    prerequisites          JSONB       NOT NULL DEFAULT '[]',
    join_key               TEXT        NOT NULL,
    result_type            TEXT        NOT NULL,
    result_semantics       TEXT        NOT NULL,
    bidirectional          BOOLEAN     NOT NULL DEFAULT false,
    detection_key          TEXT        NOT NULL,
    resolution_strategy    TEXT        NOT NULL DEFAULT 'keep_strongest',
    flag_always            BOOLEAN     NOT NULL DEFAULT false,
    conditions             JSONB       NOT NULL DEFAULT '[]',
    description            TEXT        NOT NULL DEFAULT '',
    is_active              BOOLEAN     NOT NULL DEFAULT true,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_composition_rules_type
    ON :"schema".correlation_composition_rules (rule_type);
CREATE INDEX IF NOT EXISTS idx_composition_rules_active
    ON :"schema".correlation_composition_rules (is_active);

-- ── correlation_path_types: 10 path types ────────────────────────────────────
CREATE TABLE IF NOT EXISTS :"schema".correlation_path_types (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    path_id                  TEXT        NOT NULL UNIQUE,
    path_name                TEXT        NOT NULL,
    min_hops                 INTEGER     NOT NULL DEFAULT 1,
    max_hops                 INTEGER     NOT NULL DEFAULT 1,
    confidence_formula       TEXT        NOT NULL DEFAULT '',
    limitations              JSONB       NOT NULL DEFAULT '[]',
    security_significance    TEXT        NOT NULL DEFAULT 'conditional',
    phase                    INTEGER     NOT NULL DEFAULT 1,
    description              TEXT        NOT NULL DEFAULT '',
    is_active                BOOLEAN     NOT NULL DEFAULT true,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_path_types_phase
    ON :"schema".correlation_path_types (phase);
CREATE INDEX IF NOT EXISTS idx_path_types_active
    ON :"schema".correlation_path_types (is_active);

-- ── nhi_blast_radius: blast radius summary (cached) ──────────────────────────
CREATE TABLE IF NOT EXISTS :"schema".nhi_blast_radius (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    source_arn               TEXT        NOT NULL,
    source_name              TEXT        NOT NULL DEFAULT '',
    source_type              TEXT        NOT NULL DEFAULT '',
    total_paths              INTEGER     NOT NULL DEFAULT 0,
    total_resources          INTEGER     NOT NULL DEFAULT 0,
    direct_paths             INTEGER     NOT NULL DEFAULT 0,
    chain_paths              INTEGER     NOT NULL DEFAULT 0,
    cross_account_paths      INTEGER     NOT NULL DEFAULT 0,
    compute_paths            INTEGER     NOT NULL DEFAULT 0,
    secrets_access_found     INTEGER     NOT NULL DEFAULT 0,
    converging_paths_found   INTEGER     NOT NULL DEFAULT 0,
    computed_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at               TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blast_radius_source
    ON :"schema".nhi_blast_radius (source_arn);
CREATE INDEX IF NOT EXISTS idx_blast_radius_expires
    ON :"schema".nhi_blast_radius (expires_at);

-- ── nhi_blast_radius_paths: per-path detail ──────────────────────────────────
CREATE TABLE IF NOT EXISTS :"schema".nhi_blast_radius_paths (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    blast_radius_id          UUID        NOT NULL REFERENCES :"schema".nhi_blast_radius (id) ON DELETE CASCADE,
    source_arn               TEXT        NOT NULL,
    target_arn               TEXT        NOT NULL,
    target_type              TEXT        NOT NULL DEFAULT '',
    target_name              TEXT        NOT NULL DEFAULT '',
    path_type                TEXT        NOT NULL,
    path_description         TEXT        NOT NULL DEFAULT '',
    hops                     JSONB       NOT NULL DEFAULT '[]',
    evidence_rank            INTEGER     NOT NULL DEFAULT 1,
    confidence               TEXT        NOT NULL DEFAULT 'LOW',
    security_significance    TEXT        NOT NULL DEFAULT 'conditional',
    limitations              JSONB       NOT NULL DEFAULT '[]',
    phase                    INTEGER     NOT NULL DEFAULT 1,
    is_reverse_access        BOOLEAN     NOT NULL DEFAULT false,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blast_radius_paths_br
    ON :"schema".nhi_blast_radius_paths (blast_radius_id);
CREATE INDEX IF NOT EXISTS idx_blast_radius_paths_target
    ON :"schema".nhi_blast_radius_paths (target_arn);
CREATE INDEX IF NOT EXISTS idx_blast_radius_paths_phase
    ON :"schema".nhi_blast_radius_paths (phase);

-- ── updated_at triggers (the engine's own tables only) ────────────────────────
-- Not applied to ecs_task_registry: that table belongs to the collector, and a
-- trigger here would overwrite the updated_at it writes itself.
CREATE OR REPLACE FUNCTION :"schema".correlation_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_correlation_definitions_updated_at ON :"schema".correlation_definitions;
CREATE TRIGGER trg_correlation_definitions_updated_at BEFORE UPDATE ON :"schema".correlation_definitions
    FOR EACH ROW EXECUTE FUNCTION :"schema".correlation_set_updated_at();

DROP TRIGGER IF EXISTS trg_correlation_composition_rules_updated_at ON :"schema".correlation_composition_rules;
CREATE TRIGGER trg_correlation_composition_rules_updated_at BEFORE UPDATE ON :"schema".correlation_composition_rules
    FOR EACH ROW EXECUTE FUNCTION :"schema".correlation_set_updated_at();

DROP TRIGGER IF EXISTS trg_correlation_path_types_updated_at ON :"schema".correlation_path_types;
CREATE TRIGGER trg_correlation_path_types_updated_at BEFORE UPDATE ON :"schema".correlation_path_types
    FOR EACH ROW EXECUTE FUNCTION :"schema".correlation_set_updated_at();

-- ===========================================================================
-- Correlation Rules (231 rules)
-- ===========================================================================

INSERT INTO :"schema".correlation_definitions (rule_id, category, source_entity_type, source_entity_identifiers, source_table, target_entity_type, target_entity_identifiers, target_table, relationship_type, edge_type, evidence_source, evidence_type, phase, max_hops, description) VALUES
('COR-001', 'NHI → Workload', 'EC2::Instance', '["instance-arn"]', 'credentials', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'credentials', 'configured', 1, 1, 'EC2 instance has an instance profile with a role'),
('COR-002', 'NHI → Workload', 'EC2::Instance', '["instance-arn"]', 'credentials', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'credentials', 'configured', 1, 1, 'EC2 instance uses a service role'),
('COR-003', 'NHI → Workload', 'Lambda::Function', '["function-arn"]', 'credentials', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'credentials', 'configured', 1, 1, 'Lambda function has an execution role'),
('COR-004', 'NHI → Workload', 'Lambda::Function', '["function-arn"]', 'credentials', 'IAM::Role', '["role-arn"]', 'credentials', 'uses', 'HAS_ROLE', 'credentials', 'configured', 1, 1, 'Lambda function uses a specific execution role'),
('COR-005', 'NHI → Workload', 'ECS::Task', '["task-arn"]', 'ecs_task_registry', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'ecs_task_registry', 'configured', 4, 1, 'ECS task has a task role'),
('COR-006', 'NHI → Workload', 'ECS::Task', '["task-arn"]', 'ecs_task_registry', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'ecs_task_registry', 'configured', 4, 1, 'ECS task has an execution role'),
('COR-007', 'NHI → Workload', 'EKS::Pod', '["pod-arn"]', 'nhi_genome_identities', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'nhi_genome_identities', 'configured', 4, 1, 'EKS pod uses a service account role'),
('COR-008', 'NHI → Workload', 'ECS::Service', '["service-arn"]', 'ecs_task_registry', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'ecs_task_registry', 'configured', 4, 1, 'ECS service uses a task role'),
('COR-009', 'NHI → Workload', 'StepFunction::StateMachine', '["sm-arn"]', 'credentials', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'credentials', 'configured', 1, 1, 'Step Functions state machine has a role'),
('COR-010', 'NHI → Workload', 'Glue::Crawler', '["crawler-arn"]', 'credentials', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'credentials', 'configured', 1, 1, 'Glue crawler has a service role'),
('COR-011', 'NHI → Workload', 'SageMaker::TrainingJob', '["job-arn"]', 'credentials', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'credentials', 'configured', 1, 1, 'SageMaker training job has a role'),
('COR-012', 'NHI → Workload', 'SageMaker::ProcessingJob', '["job-arn"]', 'credentials', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'credentials', 'configured', 1, 1, 'SageMaker processing job has a role'),
('COR-013', 'NHI → Workload', 'Batch::Job', '["job-arn"]', 'credentials', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'credentials', 'configured', 1, 1, 'Batch job has a job role'),
('COR-014', 'NHI → Workload', 'CodePipeline::Pipeline', '["pipeline-arn"]', 'credentials', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'credentials', 'configured', 1, 1, 'CodePipeline pipeline has a role'),
('COR-015', 'NHI → Workload', 'AppRunner::Service', '["service-arn"]', 'credentials', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'credentials', 'configured', 1, 1, 'AppRunner service has a role'),
('COR-016', 'NHI → Workload', 'MediaConvert::Job', '["job-arn"]', 'credentials', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'credentials', 'configured', 1, 1, 'MediaConvert job has a role'),
('COR-017', 'NHI → Workload', 'MediaLive::Channel', '["channel-arn"]', 'credentials', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'credentials', 'configured', 1, 1, 'MediaLive channel has a role'),
('COR-018', 'NHI → Workload', 'MWAA::Environment', '["env-arn"]', 'credentials', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'credentials', 'configured', 1, 1, 'MWAA environment has a role'),
('COR-019', 'NHI → Workload', 'DataSync::Agent', '["agent-arn"]', 'credentials', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'credentials', 'configured', 1, 1, 'DataSync agent has a role'),
('COR-020', 'NHI → Workload', 'DMS::ReplicationInstance', '["ri-arn"]', 'credentials', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'credentials', 'configured', 1, 1, 'DMS replication instance has a role'),
('COR-021', 'NHI → Workload', 'Kinesis::AnalyticsApp', '["app-arn"]', 'credentials', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'credentials', 'configured', 1, 1, 'Kinesis Analytics app has a role'),
('COR-022', 'NHI → Workload', 'Firehose::Stream', '["stream-arn"]', 'credentials', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'credentials', 'configured', 1, 1, 'Firehose stream has a role'),
('COR-023', 'NHI → Workload', 'Transfer::Server', '["server-arn"]', 'credentials', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'credentials', 'configured', 1, 1, 'Transfer Family server has a role'),
('COR-024', 'NHI → Workload', 'Lightsail::Instance', '["instance-arn"]', 'credentials', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'credentials', 'configured', 1, 1, 'Lightsail instance has a role'),
('COR-025', 'NHI → Workload', 'Greengrass::CoreDevice', '["device-arn"]', 'credentials', 'IAM::Role', '["role-arn"]', 'credentials', 'is_associated_with', 'HAS_ROLE', 'credentials', 'configured', 1, 1, 'Greengrass core device has a role')
ON CONFLICT (rule_id) DO NOTHING;

-- Category 2: NHI → Policy (13 rules)
INSERT INTO :"schema".correlation_definitions (rule_id, category, source_entity_type, source_entity_identifiers, source_table, target_entity_type, target_entity_identifiers, target_table, relationship_type, edge_type, evidence_source, evidence_type, phase, max_hops, description) VALUES
('COR-026', 'NHI → Policy', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Policy', '["policy-arn"]', 'credentials', 'has_attached', 'ATTACHED_TO', 'credentials', 'configured', 1, 1, 'Role has a managed policy attached'),
('COR-027', 'NHI → Policy', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Policy', '["policy-arn"]', 'credentials', 'has_inline', 'ATTACHED_TO', 'credentials', 'configured', 1, 1, 'Role has an inline policy'),
('COR-028', 'NHI → Policy', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Policy', '["policy-arn"]', 'credentials', 'has_boundary', 'HAS_BOUNDARY', 'credentials', 'configured', 1, 1, 'Role has a permission boundary set'),
('COR-029', 'NHI → Policy', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Policy', '["policy-arn"]', 'effective_permissions', 'grants', 'ATTACHED_TO', 'effective_permissions', 'effective', 1, 1, 'Role has resolved effective permissions'),
('COR-030', 'NHI → Policy', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Policy', '["policy-arn"]', 'credentials', 'trusts', 'HAS_TRUST', 'credentials', 'configured', 2, 1, 'Role has a trust policy allowing assumption'),
('COR-031', 'NHI → Policy', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Policy', '["policy-arn"]', 'credentials', 'has_assumable_roles', 'HAS_TRUST', 'credentials', 'configured', 2, 1, 'Role lists assumable role ARNs'),
('COR-032', 'NHI → Policy', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Policy', '["policy-arn"]', 'credentials', 'has_max_session', 'HAS_TRUST', 'credentials', 'configured', 2, 1, 'Role has max session duration set'),
('COR-033', 'NHI → Policy', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Policy', '["policy-arn"]', 'credentials', 'has_conditions', 'HAS_TRUST', 'credentials', 'configured', 2, 1, 'Role trust policy has condition keys'),
('COR-034', 'NHI → Policy', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Policy', '["policy-arn"]', 'credentials', 'has_owner', 'ATTACHED_TO', 'credentials', 'configured', 1, 1, 'Role has an owner principal'),
('COR-035', 'NHI → Policy', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Policy', '["policy-arn"]', 'credentials', 'has_privilege_level', 'ATTACHED_TO', 'credentials', 'configured', 1, 1, 'Role has a calculated privilege level'),
('COR-036', 'NHI → Policy', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Policy', '["policy-arn"]', 'credentials', 'has_type_attributes', 'ATTACHED_TO', 'credentials', 'configured', 1, 1, 'Role has type-specific attributes'),
('COR-037', 'NHI → Policy', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Policy', '["policy-arn"]', 'credentials', 'has_discovery_source', 'ATTACHED_TO', 'credentials', 'configured', 1, 1, 'Role was discovered by a specific scanner'),
('COR-038', 'NHI → Policy', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Policy', '["policy-arn"]', 'credentials', 'has_raw_response', 'ATTACHED_TO', 'credentials', 'configured', 1, 1, 'Role has raw API response stored')
ON CONFLICT (rule_id) DO NOTHING;

-- Category 3: NHI → Resource Access (33 rules)
INSERT INTO :"schema".correlation_definitions (rule_id, category, source_entity_type, source_entity_identifiers, source_table, target_entity_type, target_entity_identifiers, target_table, relationship_type, edge_type, evidence_source, evidence_type, phase, max_hops, description) VALUES
('COR-039', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'S3::Bucket', '["bucket-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access S3 bucket'),
('COR-040', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'S3::Object', '["object-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access S3 object'),
('COR-041', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'KMS::Key', '["key-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access KMS key'),
('COR-042', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'DynamoDB::Table', '["table-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access DynamoDB table'),
('COR-043', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'SecretsManager::Secret', '["secret-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access Secrets Manager secret'),
('COR-044', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'SSM::Parameter', '["param-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access SSM parameter'),
('COR-045', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'SQS::Queue', '["queue-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access SQS queue'),
('COR-046', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'SNS::Topic', '["topic-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access SNS topic'),
('COR-047', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'EC2::Instance', '["instance-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access EC2 instance'),
('COR-048', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'EC2::SecurityGroup', '["sg-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access EC2 security group'),
('COR-049', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'ECR::Repository', '["repo-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access ECR repository'),
('COR-050', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'ECS::Cluster', '["cluster-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access ECS cluster'),
('COR-051', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'EKS::Cluster', '["cluster-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access EKS cluster'),
('COR-052', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'Lambda::Function', '["func-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access Lambda function'),
('COR-053', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'RDS::DB', '["db-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access RDS database'),
('COR-054', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'RDS::Cluster', '["cluster-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access RDS cluster'),
('COR-055', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'Redshift::Cluster', '["cluster-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access Redshift cluster'),
('COR-056', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'ElastiCache::Cluster', '["cluster-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access ElastiCache cluster'),
('COR-057', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'OpenSearch::Domain', '["domain-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access OpenSearch domain'),
('COR-058', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'MSK::Cluster', '["cluster-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access MSK cluster'),
('COR-059', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'Glue::Database', '["db-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access Glue database'),
('COR-060', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'Glue::Table', '["table-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access Glue table'),
('COR-061', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'Athena::WorkGroup', '["wg-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access Athena workgroup'),
('COR-062', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'CloudWatch::LogGroup', '["log-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access CloudWatch log group'),
('COR-063', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'CloudWatch::MetricAlarm', '["alarm-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access CloudWatch metric alarm'),
('COR-064', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["role-arn"]', 'ispm_access_edges', 'can_access', 'CAN_ACCESS', 'ispm_access_edges', 'configured', 1, 1, 'Role has pre-computed ISPM access edge'),
('COR-065', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'CloudTrail::Trail', '["trail-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access CloudTrail trail'),
('COR-066', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'Config::Recorder', '["recorder-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access Config recorder'),
('COR-067', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'Organizations::Org', '["org-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access Organizations org'),
('COR-068', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'Billing::Budget', '["budget-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access Billing budget'),
('COR-069', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'EC2::VPC', '["vpc-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access VPC'),
('COR-070', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'EC2::VPCEndpoint', '["vpce-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access VPC endpoint'),
('COR-071', 'NHI → Resource Access', 'IAM::Role', '["role-arn"]', 'credentials', 'Route53::HostedZone', '["zone-arn"]', 'effective_permissions', 'can_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Role can access Route53 hosted zone')
ON CONFLICT (rule_id) DO NOTHING;

-- Category 4: NHI → NHI (19 rules)
INSERT INTO :"schema".correlation_definitions (rule_id, category, source_entity_type, source_entity_identifiers, source_table, target_entity_type, target_entity_identifiers, target_table, relationship_type, edge_type, evidence_source, evidence_type, phase, max_hops, description) VALUES
('COR-072', 'NHI → NHI', 'IAM::Role', '["role-arn"]', 'trust_edges', 'IAM::Role', '["target-role-arn"]', 'trust_edges', 'can_assume', 'CAN_ASSUME', 'trust_edges', 'configured', 2, 1, 'Role can assume another role'),
('COR-073', 'NHI → NHI', 'IAM::Role', '["role-arn"]', 'trust_edges', 'IAM::Role', '["target-role-arn"]', 'trust_edges', 'trusts', 'CAN_ASSUME', 'trust_edges', 'configured', 2, 1, 'Role trusts another role'),
('COR-074', 'NHI → NHI', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'has_assumable_role', 'CAN_ASSUME', 'credentials', 'configured', 2, 1, 'Role lists another role as assumable'),
('COR-075', 'NHI → NHI', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'has_trust_condition', 'CAN_ASSUME', 'credentials', 'configured', 2, 1, 'Role trust policy has conditions for another role'),
('COR-076', 'NHI → NHI', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'has_external_id', 'CAN_ASSUME', 'credentials', 'configured', 2, 1, 'Role trust policy requires ExternalId'),
('COR-077', 'NHI → NHI', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'has_mfa', 'CAN_ASSUME', 'credentials', 'configured', 2, 1, 'Role trust policy requires MFA'),
('COR-078', 'NHI → NHI', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'has_session_duration', 'CAN_ASSUME', 'credentials', 'configured', 2, 1, 'Role has session duration limit'),
('COR-079', 'NHI → NHI', 'IAM::Role', '["role-arn"]', 'nhi_lineage_aws', 'IAM::Role', '["target-role-arn"]', 'nhi_lineage_aws', 'is_lineage_linked', 'CAN_ASSUME', 'nhi_lineage_aws', 'derived', 2, 1, 'Role is lineage-linked to another role'),
('COR-080', 'NHI → NHI', 'IAM::Role', '["role-arn"]', 'identity_credentials', 'IAM::Role', '["target-role-arn"]', 'identity_credentials', 'is_bound_to', 'HAS_ROLE', 'identity_credentials', 'configured', 1, 1, 'Role is bound to an identity via identity_credentials'),
('COR-081', 'NHI → NHI', 'IAM::Role', '["role-arn"]', 'identity_credentials', 'IAM::User', '["user-arn"]', 'identity_credentials', 'is_bound_to', 'HAS_ROLE', 'identity_credentials', 'configured', 1, 1, 'Role is bound to a user identity'),
('COR-082', 'NHI → NHI', 'IAM::Role', '["role-arn"]', 'identity_credentials', 'IAM::Group', '["group-arn"]', 'identity_credentials', 'is_bound_to', 'HAS_ROLE', 'identity_credentials', 'configured', 1, 1, 'Role is bound to a group identity'),
('COR-083', 'NHI → NHI', 'IAM::Role', '["role-arn"]', 'identity_credentials', 'Lambda::Function', '["func-arn"]', 'identity_credentials', 'is_bound_to', 'HAS_ROLE', 'identity_credentials', 'configured', 1, 1, 'Role is bound to a Lambda function'),
('COR-084', 'NHI → NHI', 'IAM::Role', '["role-arn"]', 'identity_credentials', 'ECS::Task', '["task-arn"]', 'identity_credentials', 'is_bound_to', 'HAS_ROLE', 'identity_credentials', 'configured', 1, 1, 'Role is bound to an ECS task'),
('COR-085', 'NHI → NHI', 'IAM::Role', '["role-arn"]', 'identity_credentials', 'EC2::Instance', '["instance-arn"]', 'identity_credentials', 'is_bound_to', 'HAS_ROLE', 'identity_credentials', 'configured', 1, 1, 'Role is bound to an EC2 instance'),
('COR-086', 'NHI → NHI', 'IAM::Role', '["role-arn"]', 'identity_credentials', 'EKS::Pod', '["pod-arn"]', 'identity_credentials', 'is_bound_to', 'HAS_ROLE', 'identity_credentials', 'configured', 1, 1, 'Role is bound to an EKS pod'),
('COR-087', 'NHI → NHI', 'IAM::Role', '["role-arn"]', 'identity_credentials', 'SSM::ManagedInstance', '["mi-arn"]', 'identity_credentials', 'is_bound_to', 'HAS_ROLE', 'identity_credentials', 'configured', 1, 1, 'Role is bound to an SSM managed instance'),
('COR-088', 'NHI → NHI', 'IAM::Role', '["role-arn"]', 'identity_credentials', 'IAM::Role', '["target-role-arn"]', 'identity_credentials', 'is_primary_binding', 'HAS_ROLE', 'identity_credentials', 'configured', 1, 1, 'Role has a primary binding to another identity'),
('COR-089', 'NHI → NHI', 'IAM::Role', '["role-arn"]', 'identity_credentials', 'IAM::Role', '["target-role-arn"]', 'identity_credentials', 'is_secondary_binding', 'HAS_ROLE', 'identity_credentials', 'configured', 1, 1, 'Role has a secondary binding to another identity'),
('COR-090', 'NHI → NHI', 'IAM::Role', '["role-arn"]', 'identity_credentials', 'IAM::Role', '["target-role-arn"]', 'identity_credentials', 'has_binding_source', 'HAS_ROLE', 'identity_credentials', 'configured', 1, 1, 'Role binding has a source annotation')
ON CONFLICT (rule_id) DO NOTHING;

-- Category 5: Cross-Account (16 rules)
INSERT INTO :"schema".correlation_definitions (rule_id, category, source_entity_type, source_entity_identifiers, source_table, target_entity_type, target_entity_identifiers, target_table, relationship_type, edge_type, evidence_source, evidence_type, phase, max_hops, description) VALUES
('COR-091', 'Cross-Account', 'IAM::Role', '["role-arn"]', 'trust_edges', 'IAM::Role', '["target-role-arn"]', 'trust_edges', 'cross_account_trust', 'CROSS_ACCOUNT', 'trust_edges', 'configured', 3, 1, 'Role has cross-account trust relationship'),
('COR-092', 'Cross-Account', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'has_cross_account_condition', 'CROSS_ACCOUNT', 'credentials', 'configured', 3, 1, 'Role trust policy allows another account'),
('COR-093', 'Cross-Account', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'has_ram_share', 'CROSS_ACCOUNT', 'credentials', 'configured', 3, 1, 'Role is shared via RAM'),
('COR-094', 'Cross-Account', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'has_external_id_cross_account', 'CROSS_ACCOUNT', 'credentials', 'configured', 3, 1, 'Role requires ExternalId for cross-account access'),
('COR-095', 'Cross-Account', 'IAM::Role', '["role-arn"]', 'nhi_lineage_aws', 'IAM::Role', '["target-role-arn"]', 'nhi_lineage_aws', 'is_external_lineage', 'CROSS_ACCOUNT', 'nhi_lineage_aws', 'derived', 3, 1, 'Role has external lineage link'),
('COR-096', 'Cross-Account', 'IAM::Role', '["role-arn"]', 'credentials', 'S3::Bucket', '["bucket-arn"]', 'effective_permissions', 'cross_account_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 3, 1, 'Role can access resource in another account'),
('COR-097', 'Cross-Account', 'IAM::Role', '["role-arn"]', 'credentials', 'KMS::Key', '["key-arn"]', 'effective_permissions', 'cross_account_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 3, 1, 'Role can use KMS key in another account'),
('COR-098', 'Cross-Account', 'IAM::Role', '["role-arn"]', 'credentials', 'SecretsManager::Secret', '["secret-arn"]', 'effective_permissions', 'cross_account_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 3, 1, 'Role can access secret in another account'),
('COR-099', 'Cross-Account', 'IAM::Role', '["role-arn"]', 'credentials', 'DynamoDB::Table', '["table-arn"]', 'effective_permissions', 'cross_account_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 3, 1, 'Role can access DynamoDB table in another account'),
('COR-100', 'Cross-Account', 'IAM::Role', '["role-arn"]', 'credentials', 'SQS::Queue', '["queue-arn"]', 'effective_permissions', 'cross_account_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 3, 1, 'Role can access SQS queue in another account'),
('COR-101', 'Cross-Account', 'IAM::Role', '["role-arn"]', 'credentials', 'SNS::Topic', '["topic-arn"]', 'effective_permissions', 'cross_account_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 3, 1, 'Role can access SNS topic in another account'),
('COR-102', 'Cross-Account', 'IAM::Role', '["role-arn"]', 'credentials', 'Lambda::Function', '["func-arn"]', 'effective_permissions', 'cross_account_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 3, 1, 'Role can access Lambda function in another account'),
('COR-103', 'Cross-Account', 'IAM::Role', '["role-arn"]', 'credentials', 'ECR::Repository', '["repo-arn"]', 'effective_permissions', 'cross_account_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 3, 1, 'Role can access ECR repository in another account'),
('COR-104', 'Cross-Account', 'IAM::Role', '["role-arn"]', 'credentials', 'ECS::Cluster', '["cluster-arn"]', 'effective_permissions', 'cross_account_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 3, 1, 'Role can access ECS cluster in another account'),
('COR-105', 'Cross-Account', 'IAM::Role', '["role-arn"]', 'credentials', 'EKS::Cluster', '["cluster-arn"]', 'effective_permissions', 'cross_account_access', 'CAN_ACCESS', 'effective_permissions', 'effective', 3, 1, 'Role can access EKS cluster in another account'),
('COR-106', 'Cross-Account', 'IAM::Role', '["role-arn"]', 'cloudtrail_events', 'CloudTrail::Event', '["event-arn"]', 'cloudtrail_events', 'cross_account_observed', 'ACCESSED', 'cloudtrail_events', 'observed', 3, 1, 'Role observed cross-account activity in CloudTrail')
ON CONFLICT (rule_id) DO NOTHING;

-- Category 6: Privilege Escalation (29 rules)
INSERT INTO :"schema".correlation_definitions (rule_id, category, source_entity_type, source_entity_identifiers, source_table, target_entity_type, target_entity_identifiers, target_table, relationship_type, edge_type, evidence_source, evidence_type, phase, max_hops, description) VALUES
('COR-107', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_passrole', 'CAN_ASSUME', 'credentials', 'configured', 2, 1, 'Role can pass itself to another role'),
('COR-108', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'Lambda::Function', '["func-arn"]', 'credentials', 'can_passrole', 'CAN_ASSUME', 'credentials', 'configured', 2, 1, 'Role can pass to Lambda function'),
('COR-109', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'ECS::Task', '["task-arn"]', 'credentials', 'can_passrole', 'CAN_ASSUME', 'credentials', 'configured', 2, 1, 'Role can pass to ECS task'),
('COR-110', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'EC2::Instance', '["instance-arn"]', 'credentials', 'can_passrole', 'CAN_ASSUME', 'credentials', 'configured', 2, 1, 'Role can pass to EC2 instance'),
('COR-111', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_attach_policy', 'ATTACHED_TO', 'credentials', 'configured', 2, 1, 'Role can attach policies to another role'),
('COR-112', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_put_role_policy', 'ATTACHED_TO', 'credentials', 'configured', 2, 1, 'Role can put inline policy to another role'),
('COR-113', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_put_user_policy', 'ATTACHED_TO', 'credentials', 'configured', 2, 1, 'Role can put inline policy to a user'),
('COR-114', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_create_role', 'ATTACHED_TO', 'credentials', 'configured', 2, 1, 'Role can create new roles'),
('COR-115', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_create_access_key', 'ATTACHED_TO', 'credentials', 'configured', 2, 1, 'Role can create access keys'),
('COR-116', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_create_login_profile', 'ATTACHED_TO', 'credentials', 'configured', 2, 1, 'Role can create console login profile'),
('COR-117', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_attach_role_to_group', 'ATTACHED_TO', 'credentials', 'configured', 2, 1, 'Role can attach role to group'),
('COR-118', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_update_assume_role_policy', 'HAS_TRUST', 'credentials', 'configured', 2, 1, 'Role can update its own trust policy'),
('COR-119', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_update_attached_policy', 'ATTACHED_TO', 'credentials', 'configured', 2, 1, 'Role can update attached policies'),
('COR-120', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_detach_policy', 'ATTACHED_TO', 'credentials', 'configured', 2, 1, 'Role can detach policies'),
('COR-121', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_delete_role', 'ATTACHED_TO', 'credentials', 'configured', 2, 1, 'Role can delete roles'),
('COR-122', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_delete_policy', 'ATTACHED_TO', 'credentials', 'configured', 2, 1, 'Role can delete policies'),
('COR-123', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_delete_access_key', 'ATTACHED_TO', 'credentials', 'configured', 2, 1, 'Role can delete access keys'),
('COR-124', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_set_boundary', 'HAS_BOUNDARY', 'credentials', 'configured', 2, 1, 'Role can set permission boundary'),
('COR-125', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_pass_role_to_service', 'CAN_ASSUME', 'credentials', 'configured', 2, 1, 'Role can pass to a specific AWS service'),
('COR-126', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_assume_with_condition', 'CAN_ASSUME', 'credentials', 'configured', 2, 1, 'Role can assume with conditions'),
('COR-127', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_chain_assume', 'CAN_ASSUME', 'trust_edges', 'configured', 2, 5, 'Role can chain assume multiple roles'),
('COR-128', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'has_higher_privilege', 'ATTACHED_TO', 'credentials', 'derived', 2, 1, 'Role has higher privilege level than target'),
('COR-129', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_escalate', 'CAN_ASSUME', 'credentials', 'derived', 2, 1, 'Role can escalate privileges via role chaining'),
('COR-130', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_modify_trust', 'HAS_TRUST', 'credentials', 'configured', 2, 1, 'Role can modify trust policy of another role'),
('COR-131', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_modify_permission_boundary', 'HAS_BOUNDARY', 'credentials', 'configured', 2, 1, 'Role can modify permission boundary'),
('COR-132', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_create_saml_provider', 'ATTACHED_TO', 'credentials', 'configured', 2, 1, 'Role can create SAML provider'),
('COR-133', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_create_oidc_provider', 'ATTACHED_TO', 'credentials', 'configured', 2, 1, 'Role can create OIDC provider'),
('COR-134', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_create_service_linked_role', 'ATTACHED_TO', 'credentials', 'configured', 2, 1, 'Role can create service-linked roles'),
('COR-135', 'Privilege Escalation', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Role', '["target-role-arn"]', 'credentials', 'can_create_instance_profile', 'ATTACHED_TO', 'credentials', 'configured', 2, 1, 'Role can create instance profiles')
ON CONFLICT (rule_id) DO NOTHING;

-- Category 7: Workload → Resource (26 rules)
INSERT INTO :"schema".correlation_definitions (rule_id, category, source_entity_type, source_entity_identifiers, source_table, target_entity_type, target_entity_identifiers, target_table, relationship_type, edge_type, evidence_source, evidence_type, phase, max_hops, description) VALUES
('COR-136', 'Workload → Resource', 'EC2::Instance', '["instance-arn"]', 'cloudtrail_events', 'S3::Bucket', '["bucket-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'EC2 instance accessed S3 bucket'),
('COR-137', 'Workload → Resource', 'EC2::Instance', '["instance-arn"]', 'cloudtrail_events', 'S3::Object', '["object-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'EC2 instance accessed S3 object'),
('COR-138', 'Workload → Resource', 'EC2::Instance', '["instance-arn"]', 'cloudtrail_events', 'KMS::Key', '["key-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'EC2 instance accessed KMS key'),
('COR-139', 'Workload → Resource', 'EC2::Instance', '["instance-arn"]', 'cloudtrail_events', 'SecretsManager::Secret', '["secret-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'EC2 instance accessed Secrets Manager secret'),
('COR-140', 'Workload → Resource', 'EC2::Instance', '["instance-arn"]', 'cloudtrail_events', 'SSM::Parameter', '["param-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'EC2 instance accessed SSM parameter'),
('COR-141', 'Workload → Resource', 'EC2::Instance', '["instance-arn"]', 'cloudtrail_events', 'DynamoDB::Table', '["table-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'EC2 instance accessed DynamoDB table'),
('COR-142', 'Workload → Resource', 'Lambda::Function', '["func-arn"]', 'cloudtrail_events', 'S3::Bucket', '["bucket-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'Lambda function accessed S3 bucket'),
('COR-143', 'Workload → Resource', 'Lambda::Function', '["func-arn"]', 'cloudtrail_events', 'DynamoDB::Table', '["table-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'Lambda function accessed DynamoDB table'),
('COR-144', 'Workload → Resource', 'Lambda::Function', '["func-arn"]', 'cloudtrail_events', 'SecretsManager::Secret', '["secret-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'Lambda function accessed Secrets Manager secret'),
('COR-145', 'Workload → Resource', 'Lambda::Function', '["func-arn"]', 'cloudtrail_events', 'SQS::Queue', '["queue-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'Lambda function accessed SQS queue'),
('COR-146', 'Workload → Resource', 'Lambda::Function', '["func-arn"]', 'cloudtrail_events', 'SNS::Topic', '["topic-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'Lambda function accessed SNS topic'),
('COR-147', 'Workload → Resource', 'Lambda::Function', '["func-arn"]', 'cloudtrail_events', 'KMS::Key', '["key-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'Lambda function accessed KMS key'),
('COR-148', 'Workload → Resource', 'ECS::Task', '["task-arn"]', 'cloudtrail_events', 'S3::Bucket', '["bucket-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'ECS task accessed S3 bucket'),
('COR-149', 'Workload → Resource', 'ECS::Task', '["task-arn"]', 'cloudtrail_events', 'DynamoDB::Table', '["table-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'ECS task accessed DynamoDB table'),
('COR-150', 'Workload → Resource', 'ECS::Task', '["task-arn"]', 'cloudtrail_events', 'SecretsManager::Secret', '["secret-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'ECS task accessed Secrets Manager secret'),
('COR-151', 'Workload → Resource', 'ECS::Task', '["task-arn"]', 'cloudtrail_events', 'SSM::Parameter', '["param-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'ECS task accessed SSM parameter'),
('COR-152', 'Workload → Resource', 'ECS::Task', '["task-arn"]', 'cloudtrail_events', 'KMS::Key', '["key-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'ECS task accessed KMS key'),
('COR-153', 'Workload → Resource', 'ECS::Task', '["task-arn"]', 'cloudtrail_events', 'SQS::Queue', '["queue-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'ECS task accessed SQS queue'),
('COR-154', 'Workload → Resource', 'EKS::Pod', '["pod-arn"]', 'cloudtrail_events', 'S3::Bucket', '["bucket-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'EKS pod accessed S3 bucket'),
('COR-155', 'Workload → Resource', 'EKS::Pod', '["pod-arn"]', 'cloudtrail_events', 'DynamoDB::Table', '["table-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'EKS pod accessed DynamoDB table'),
('COR-156', 'Workload → Resource', 'EKS::Pod', '["pod-arn"]', 'cloudtrail_events', 'SecretsManager::Secret', '["secret-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'EKS pod accessed Secrets Manager secret'),
('COR-157', 'Workload → Resource', 'EKS::Pod', '["pod-arn"]', 'cloudtrail_events', 'KMS::Key', '["key-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'EKS pod accessed KMS key'),
('COR-158', 'Workload → Resource', 'StepFunction::StateMachine', '["sm-arn"]', 'cloudtrail_events', 'S3::Bucket', '["bucket-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'Step Functions accessed S3 bucket'),
('COR-159', 'Workload → Resource', 'StepFunction::StateMachine', '["sm-arn"]', 'cloudtrail_events', 'DynamoDB::Table', '["table-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'Step Functions accessed DynamoDB table'),
('COR-160', 'Workload → Resource', 'StepFunction::StateMachine', '["sm-arn"]', 'cloudtrail_events', 'Lambda::Function', '["func-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'Step Functions accessed Lambda function'),
('COR-161', 'Workload → Resource', 'StepFunction::StateMachine', '["sm-arn"]', 'cloudtrail_events', 'SQS::Queue', '["queue-arn"]', 'cloudtrail_events', 'accessed', 'ACCESSED', 'cloudtrail_events', 'observed', 4, 1, 'Step Functions accessed SQS queue')
ON CONFLICT (rule_id) DO NOTHING;

-- Category 8: Resource → Resource (39 rules)
INSERT INTO :"schema".correlation_definitions (rule_id, category, source_entity_type, source_entity_identifiers, source_table, target_entity_type, target_entity_identifiers, target_table, relationship_type, edge_type, evidence_source, evidence_type, phase, max_hops, description) VALUES
('COR-162', 'Resource → Resource', 'S3::Bucket', '["bucket-arn"]', 'effective_permissions', 'KMS::Key', '["key-arn"]', 'effective_permissions', 'is_encrypted_with', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'S3 bucket is encrypted with KMS key'),
('COR-163', 'Resource → Resource', 'S3::Bucket', '["bucket-arn"]', 'effective_permissions', 'S3::Object', '["object-arn"]', 'effective_permissions', 'contains', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'S3 bucket contains objects'),
('COR-164', 'Resource → Resource', 'S3::Bucket', '["bucket-arn"]', 'effective_permissions', 'VPC::Endpoint', '["vpce-arn"]', 'effective_permissions', 'has_endpoint', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'S3 bucket has VPC endpoint'),
('COR-165', 'Resource → Resource', 'KMS::Key', '["key-arn"]', 'effective_permissions', 'SecretsManager::Secret', '["secret-arn"]', 'effective_permissions', 'encrypts', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'KMS key encrypts Secrets Manager secret'),
('COR-166', 'Resource → Resource', 'KMS::Key', '["key-arn"]', 'effective_permissions', 'S3::Bucket', '["bucket-arn"]', 'effective_permissions', 'encrypts', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'KMS key encrypts S3 bucket'),
('COR-167', 'Resource → Resource', 'KMS::Key', '["key-arn"]', 'effective_permissions', 'DynamoDB::Table', '["table-arn"]', 'effective_permissions', 'encrypts', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'KMS key encrypts DynamoDB table'),
('COR-168', 'Resource → Resource', 'KMS::Key', '["key-arn"]', 'effective_permissions', 'RDS::DB', '["db-arn"]', 'effective_permissions', 'encrypts', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'KMS key encrypts RDS database'),
('COR-169', 'Resource → Resource', 'KMS::Key', '["key-arn"]', 'effective_permissions', 'SSM::Parameter', '["param-arn"]', 'effective_permissions', 'encrypts', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'KMS key encrypts SSM parameter'),
('COR-170', 'Resource → Resource', 'KMS::Key', '["key-arn"]', 'effective_permissions', 'EKS::Cluster', '["cluster-arn"]', 'effective_permissions', 'encrypts', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'KMS key encrypts EKS cluster secrets'),
('COR-171', 'Resource → Resource', 'SecretsManager::Secret', '["secret-arn"]', 'effective_permissions', 'RDS::DB', '["db-arn"]', 'effective_permissions', 'is_credential_for', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Secret is RDS database credential'),
('COR-172', 'Resource → Resource', 'SecretsManager::Secret', '["secret-arn"]', 'effective_permissions', 'ElastiCache::Cluster', '["cluster-arn"]', 'effective_permissions', 'is_credential_for', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Secret is ElastiCache credential'),
('COR-173', 'Resource → Resource', 'SecretsManager::Secret', '["secret-arn"]', 'effective_permissions', 'DocDB::Cluster', '["cluster-arn"]', 'effective_permissions', 'is_credential_for', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Secret is DocumentDB credential'),
('COR-174', 'Resource → Resource', 'SecretsManager::Secret', '["secret-arn"]', 'effective_permissions', 'MemoryDB::Cluster', '["cluster-arn"]', 'effective_permissions', 'is_credential_for', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Secret is MemoryDB credential'),
('COR-175', 'Resource → Resource', 'SSM::Parameter', '["param-arn"]', 'effective_permissions', 'EC2::Instance', '["instance-arn"]', 'effective_permissions', 'is_managed_by', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'SSM parameter is managed by EC2 instance'),
('COR-176', 'Resource → Resource', 'SSM::Parameter', '["param-arn"]', 'effective_permissions', 'ECS::Task', '["task-arn"]', 'effective_permissions', 'is_managed_by', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'SSM parameter is managed by ECS task'),
('COR-177', 'Resource → Resource', 'DynamoDB::Table', '["table-arn"]', 'effective_permissions', 'DynamoDB::Stream', '["stream-arn"]', 'effective_permissions', 'has_stream', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'DynamoDB table has a stream'),
('COR-178', 'Resource → Resource', 'DynamoDB::Table', '["table-arn"]', 'effective_permissions', 'Lambda::Function', '["func-arn"]', 'effective_permissions', 'has_trigger', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'DynamoDB table has Lambda trigger'),
('COR-179', 'Resource → Resource', 'SQS::Queue', '["queue-arn"]', 'effective_permissions', 'Lambda::Function', '["func-arn"]', 'effective_permissions', 'has_trigger', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'SQS queue has Lambda trigger'),
('COR-180', 'Resource → Resource', 'SNS::Topic', '["topic-arn"]', 'effective_permissions', 'Lambda::Function', '["func-arn"]', 'effective_permissions', 'has_subscription', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'SNS topic has Lambda subscription'),
('COR-181', 'Resource → Resource', 'SNS::Topic', '["topic-arn"]', 'effective_permissions', 'SQS::Queue', '["queue-arn"]', 'effective_permissions', 'has_subscription', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'SNS topic has SQS subscription'),
('COR-182', 'Resource → Resource', 'ECR::Repository', '["repo-arn"]', 'effective_permissions', 'ECS::Service', '["service-arn"]', 'effective_permissions', 'is_pulled_by', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'ECR repository is pulled by ECS service'),
('COR-183', 'Resource → Resource', 'ECR::Repository', '["repo-arn"]', 'effective_permissions', 'Lambda::Function', '["func-arn"]', 'effective_permissions', 'is_pulled_by', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'ECR repository is pulled by Lambda'),
('COR-184', 'Resource → Resource', 'ECR::Repository', '["repo-arn"]', 'effective_permissions', 'CodeBuild::Project', '["project-arn"]', 'effective_permissions', 'is_pulled_by', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'ECR repository is pulled by CodeBuild'),
('COR-185', 'Resource → Resource', 'ECS::Cluster', '["cluster-arn"]', 'effective_permissions', 'ECS::Service', '["service-arn"]', 'effective_permissions', 'contains', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'ECS cluster contains services'),
('COR-186', 'Resource → Resource', 'ECS::Cluster', '["cluster-arn"]', 'effective_permissions', 'ECS::Task', '["task-arn"]', 'effective_permissions', 'contains', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'ECS cluster contains tasks'),
('COR-187', 'Resource → Resource', 'EKS::Cluster', '["cluster-arn"]', 'effective_permissions', 'EKS::Pod', '["pod-arn"]', 'effective_permissions', 'contains', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'EKS cluster contains pods'),
('COR-188', 'Resource → Resource', 'EKS::Cluster', '["cluster-arn"]', 'effective_permissions', 'EKS::NodeGroup', '["ng-arn"]', 'effective_permissions', 'has_node_group', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'EKS cluster has node groups'),
('COR-189', 'Resource → Resource', 'RDS::Cluster', '["cluster-arn"]', 'effective_permissions', 'RDS::DB', '["db-arn"]', 'effective_permissions', 'contains', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'RDS cluster contains databases'),
('COR-190', 'Resource → Resource', 'RDS::Cluster', '["cluster-arn"]', 'effective_permissions', 'SecretsManager::Secret', '["secret-arn"]', 'effective_permissions', 'has_credentials', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'RDS cluster has Secrets Manager credentials'),
('COR-191', 'Resource → Resource', 'ElastiCache::Cluster', '["cluster-arn"]', 'effective_permissions', 'SecretsManager::Secret', '["secret-arn"]', 'effective_permissions', 'has_credentials', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'ElastiCache cluster has Secrets Manager credentials'),
('COR-192', 'Resource → Resource', 'VPC::VPC', '["vpc-arn"]', 'effective_permissions', 'EC2::Instance', '["instance-arn"]', 'effective_permissions', 'contains', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'VPC contains EC2 instances'),
('COR-193', 'Resource → Resource', 'VPC::VPC', '["vpc-arn"]', 'effective_permissions', 'ECS::Cluster', '["cluster-arn"]', 'effective_permissions', 'contains', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'VPC contains ECS clusters'),
('COR-194', 'Resource → Resource', 'VPC::VPC', '["vpc-arn"]', 'effective_permissions', 'EKS::Cluster', '["cluster-arn"]', 'effective_permissions', 'contains', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'VPC contains EKS clusters'),
('COR-195', 'Resource → Resource', 'VPC::VPC', '["vpc-arn"]', 'effective_permissions', 'RDS::DB', '["db-arn"]', 'effective_permissions', 'contains', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'VPC contains RDS databases'),
('COR-196', 'Resource → Resource', 'VPC::VPC', '["vpc-arn"]', 'effective_permissions', 'VPC::Endpoint', '["vpce-arn"]', 'effective_permissions', 'has_endpoint', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'VPC has VPC endpoints'),
('COR-197', 'Resource → Resource', 'CloudWatch::LogGroup', '["log-arn"]', 'effective_permissions', 'Lambda::Function', '["func-arn"]', 'effective_permissions', 'is_logged_by', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'CloudWatch log group is logged by Lambda'),
('COR-198', 'Resource → Resource', 'CloudWatch::LogGroup', '["log-arn"]', 'effective_permissions', 'ECS::Task', '["task-arn"]', 'effective_permissions', 'is_logged_by', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'CloudWatch log group is logged by ECS task'),
('COR-199', 'Resource → Resource', 'CloudWatch::LogGroup', '["log-arn"]', 'effective_permissions', 'EKS::Pod', '["pod-arn"]', 'effective_permissions', 'is_logged_by', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'CloudWatch log group is logged by EKS pod'),
('COR-200', 'Resource → Resource', 'Glue::Database', '["db-arn"]', 'effective_permissions', 'Glue::Table', '["table-arn"]', 'effective_permissions', 'contains', 'CAN_ACCESS', 'effective_permissions', 'effective', 1, 1, 'Glue database contains tables')
ON CONFLICT (rule_id) DO NOTHING;

-- Category 9: NHI → Activity (20 rules)
INSERT INTO :"schema".correlation_definitions (rule_id, category, source_entity_type, source_entity_identifiers, source_table, target_entity_type, target_entity_identifiers, target_table, relationship_type, edge_type, evidence_source, evidence_type, phase, max_hops, description) VALUES
('COR-201', 'NHI → Activity', 'IAM::Role', '["role-arn"]', 'cloudtrail_events', 'CloudTrail::Event', '["event-id"]', 'cloudtrail_events', 'performed', 'ACCESSED', 'cloudtrail_events', 'observed', 1, 1, 'Role performed an API call'),
('COR-202', 'NHI → Activity', 'IAM::Role', '["role-arn"]', 'cloudtrail_events', 'CloudTrail::Event', '["event-id"]', 'cloudtrail_events', 'performed_read', 'ACCESSED', 'cloudtrail_events', 'observed', 1, 1, 'Role performed a read API call'),
('COR-203', 'NHI → Activity', 'IAM::Role', '["role-arn"]', 'cloudtrail_events', 'CloudTrail::Event', '["event-id"]', 'cloudtrail_events', 'performed_write', 'ACCESSED', 'cloudtrail_events', 'observed', 1, 1, 'Role performed a write API call'),
('COR-204', 'NHI → Activity', 'IAM::Role', '["role-arn"]', 'cloudtrail_events', 'CloudTrail::Event', '["event-id"]', 'cloudtrail_events', 'performed_list', 'ACCESSED', 'cloudtrail_events', 'observed', 1, 1, 'Role performed a list API call'),
('COR-205', 'NHI → Activity', 'IAM::Role', '["role-arn"]', 'cloudtrail_events', 'CloudTrail::Event', '["event-id"]', 'cloudtrail_events', 'performed_delete', 'ACCESSED', 'cloudtrail_events', 'observed', 1, 1, 'Role performed a delete API call'),
('COR-206', 'NHI → Activity', 'IAM::Role', '["role-arn"]', 'cloudtrail_events', 'CloudTrail::Event', '["event-id"]', 'cloudtrail_events', 'performed_create', 'ACCESSED', 'cloudtrail_events', 'observed', 1, 1, 'Role performed a create API call'),
('COR-207', 'NHI → Activity', 'IAM::Role', '["role-arn"]', 'cloudtrail_events', 'CloudTrail::Event', '["event-id"]', 'cloudtrail_events', 'performed_passrole', 'ACCESSED', 'cloudtrail_events', 'observed', 1, 1, 'Role performed iam:PassRole'),
('COR-208', 'NHI → Activity', 'IAM::Role', '["role-arn"]', 'cloudtrail_events', 'CloudTrail::Event', '["event-id"]', 'cloudtrail_events', 'performed_assume_role', 'ACCESSED', 'cloudtrail_events', 'observed', 1, 1, 'Role performed AssumeRole'),
('COR-209', 'NHI → Activity', 'IAM::Role', '["role-arn"]', 'cloudtrail_events', 'CloudTrail::Event', '["event-id"]', 'cloudtrail_events', 'performed_get_object', 'ACCESSED', 'cloudtrail_events', 'observed', 1, 1, 'Role performed S3 GetObject'),
('COR-210', 'NHI → Activity', 'IAM::Role', '["role-arn"]', 'cloudtrail_events', 'CloudTrail::Event', '["event-id"]', 'cloudtrail_events', 'performed_put_object', 'ACCESSED', 'cloudtrail_events', 'observed', 1, 1, 'Role performed S3 PutObject'),
('COR-211', 'NHI → Activity', 'IAM::Role', '["role-arn"]', 'cloudtrail_events', 'CloudTrail::Event', '["event-id"]', 'cloudtrail_events', 'performed_get_secret_value', 'ACCESSED', 'cloudtrail_events', 'observed', 1, 1, 'Role performed GetSecretValue'),
('COR-212', 'NHI → Activity', 'IAM::Role', '["role-arn"]', 'cloudtrail_events', 'CloudTrail::Event', '["event-id"]', 'cloudtrail_events', 'performed_decrypt', 'ACCESSED', 'cloudtrail_events', 'observed', 1, 1, 'Role performed KMS Decrypt'),
('COR-213', 'NHI → Activity', 'IAM::Role', '["role-arn"]', 'cloudtrail_events', 'CloudTrail::Event', '["event-id"]', 'cloudtrail_events', 'performed_get_parameter', 'ACCESSED', 'cloudtrail_events', 'observed', 1, 1, 'Role performed SSM GetParameter'),
('COR-214', 'NHI → Activity', 'IAM::Role', '["role-arn"]', 'cloudtrail_events', 'CloudTrail::Event', '["event-id"]', 'cloudtrail_events', 'performed_get_item', 'ACCESSED', 'cloudtrail_events', 'observed', 1, 1, 'Role performed DynamoDB GetItem'),
('COR-215', 'NHI → Activity', 'IAM::Role', '["role-arn"]', 'cloudtrail_events', 'CloudTrail::Event', '["event-id"]', 'cloudtrail_events', 'performed_put_item', 'ACCESSED', 'cloudtrail_events', 'observed', 1, 1, 'Role performed DynamoDB PutItem'),
('COR-216', 'NHI → Activity', 'IAM::Role', '["role-arn"]', 'cloudtrail_events', 'CloudTrail::Event', '["event-id"]', 'cloudtrail_events', 'performed_send_message', 'ACCESSED', 'cloudtrail_events', 'observed', 1, 1, 'Role performed SQS SendMessage'),
('COR-217', 'NHI → Activity', 'IAM::Role', '["role-arn"]', 'cloudtrail_events', 'CloudTrail::Event', '["event-id"]', 'cloudtrail_events', 'performed_publish', 'ACCESSED', 'cloudtrail_events', 'observed', 1, 1, 'Role performed SNS Publish'),
('COR-218', 'NHI → Activity', 'IAM::Role', '["role-arn"]', 'cloudtrail_events', 'CloudTrail::Event', '["event-id"]', 'cloudtrail_events', 'performed_invoke', 'ACCESSED', 'cloudtrail_events', 'observed', 1, 1, 'Role performed Lambda Invoke'),
('COR-219', 'NHI → Activity', 'IAM::Role', '["role-arn"]', 'cloudtrail_events', 'CloudTrail::Event', '["event-id"]', 'cloudtrail_events', 'had_error', 'ACCESSED', 'cloudtrail_events', 'observed', 1, 1, 'Role had a failed API call'),
('COR-220', 'NHI → Activity', 'IAM::Role', '["role-arn"]', 'cloudtrail_events', 'CloudTrail::Event', '["event-id"]', 'cloudtrail_events', 'had_access_from_ip', 'ACCESSED', 'cloudtrail_events', 'observed', 1, 1, 'Role had access from a specific IP')
ON CONFLICT (rule_id) DO NOTHING;

-- Category 10: Governance (13 rules)
INSERT INTO :"schema".correlation_definitions (rule_id, category, source_entity_type, source_entity_identifiers, source_table, target_entity_type, target_entity_identifiers, target_table, relationship_type, edge_type, evidence_source, evidence_type, phase, max_hops, description) VALUES
('COR-221', 'Governance', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Policy', '["policy-arn"]', 'credentials', 'has_scp_compliance', 'ATTACHED_TO', 'credentials', 'configured', 1, 1, 'Role is subject to SCP'),
('COR-222', 'Governance', 'IAM::Role', '["role-arn"]', 'credentials', 'Organizations::Org', '["org-arn"]', 'credentials', 'is_in_org', 'ATTACHED_TO', 'credentials', 'configured', 1, 1, 'Role is in an AWS Organization'),
('COR-223', 'Governance', 'IAM::Role', '["role-arn"]', 'credentials', 'Organizations::Account', '["acct-arn"]', 'credentials', 'is_in_account', 'ATTACHED_TO', 'credentials', 'configured', 1, 1, 'Role is in a specific AWS account'),
('COR-224', 'Governance', 'IAM::Role', '["role-arn"]', 'credentials', 'Organizations::DelegatedAdmin', '["admin-arn"]', 'credentials', 'is_delegated_admin', 'ATTACHED_TO', 'credentials', 'configured', 1, 1, 'Role is a delegated administrator'),
('COR-225', 'Governance', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Policy', '["policy-arn"]', 'credentials', 'has_permission_boundary', 'HAS_BOUNDARY', 'credentials', 'configured', 1, 1, 'Role has a permission boundary'),
('COR-226', 'Governance', 'IAM::Role', '["role-arn"]', 'credentials', 'IAM::Policy', '["policy-arn"]', 'credentials', 'has_service_control_policy', 'ATTACHED_TO', 'credentials', 'configured', 1, 1, 'Role is governed by SCP'),
('COR-227', 'Governance', 'IAM::Role', '["role-arn"]', 'credentials', 'Config::Recorder', '["recorder-arn"]', 'credentials', 'is_config_recorded', 'ATTACHED_TO', 'credentials', 'configured', 1, 1, 'Role is recorded by AWS Config'),
('COR-228', 'Governance', 'IAM::Role', '["role-arn"]', 'credentials', 'CloudTrail::Trail', '["trail-arn"]', 'credentials', 'is_cloudtrail_logged', 'ATTACHED_TO', 'credentials', 'configured', 1, 1, 'Role activity is logged by CloudTrail'),
	('COR-229', 'Governance', 'IAM::Role', '["role-arn"]', 'credentials', 'AccessAnalyzer::Analyzer', '["analyzer-arn"]', 'credentials', 'is_analyzed_by', 'ATTACHED_TO', 'credentials', 'configured', 1, 1, 'Role is analyzed by Access Analyzer'),
	('COR-230', 'Governance', 'IAM::Role', '["role-arn"]', 'credentials', 'GuardDuty::Detector', '["detector-arn"]', 'credentials', 'is_monitored_by', 'ATTACHED_TO', 'credentials', 'configured', 1, 1, 'Role is monitored by GuardDuty'),
	('COR-231', 'Governance', 'IAM::Role', '["role-arn"]', 'credentials', 'SecurityHub::Hub', '["hub-arn"]', 'credentials', 'is_reported_to', 'ATTACHED_TO', 'credentials', 'configured', 1, 1, 'Role findings are reported to SecurityHub')
ON CONFLICT (rule_id) DO NOTHING;

-- =============================================================================
-- END OF 231 CORRELATION DEFINITIONS
-- =============================================================================

COMMIT;
