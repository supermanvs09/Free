BEGIN;

-- ===========================================================================
-- Extra rule parameters (Level 1 = correlation_definitions,
-- Level 2 = correlation_composition_rules). All nullable so existing seeds stay valid.
-- ===========================================================================

ALTER TABLE :"schema".correlation_definitions
    ADD COLUMN IF NOT EXISTS security_significance      TEXT,
    ADD COLUMN IF NOT EXISTS confidence_level           TEXT,
    ADD COLUMN IF NOT EXISTS confidence_formula         TEXT,
    ADD COLUMN IF NOT EXISTS evidence_strength_rank     INTEGER,
    ADD COLUMN IF NOT EXISTS temporal_alignment         TEXT,
    ADD COLUMN IF NOT EXISTS session_duration           TEXT,
    ADD COLUMN IF NOT EXISTS condition_keys             JSONB,
    ADD COLUMN IF NOT EXISTS trust_policy_field         TEXT,
    ADD COLUMN IF NOT EXISTS policy_field               TEXT,
    ADD COLUMN IF NOT EXISTS resource_field             TEXT,
    ADD COLUMN IF NOT EXISTS account_scope              TEXT,
    ADD COLUMN IF NOT EXISTS region_scope               TEXT,
    ADD COLUMN IF NOT EXISTS prerequisites              JSONB,
    ADD COLUMN IF NOT EXISTS limitations                JSONB,
    ADD COLUMN IF NOT EXISTS complexity                 TEXT,
    ADD COLUMN IF NOT EXISTS use_cases                  JSONB,
    ADD COLUMN IF NOT EXISTS temporal_behavior          TEXT,
    ADD COLUMN IF NOT EXISTS freshness_requirement      TEXT,
    ADD COLUMN IF NOT EXISTS valid_from                 TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS valid_until                TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS services                   JSONB,
    ADD COLUMN IF NOT EXISTS apis                       JSONB,
    ADD COLUMN IF NOT EXISTS permissions                JSONB,
    ADD COLUMN IF NOT EXISTS data_source                TEXT,
    ADD COLUMN IF NOT EXISTS collection_method          TEXT,
    ADD COLUMN IF NOT EXISTS direction                  TEXT,
    ADD COLUMN IF NOT EXISTS entity_compatibility       JSONB,
    ADD COLUMN IF NOT EXISTS consequence_type           TEXT;

-- Backfill only what is derivable from existing columns.
UPDATE :"schema".correlation_definitions SET
    evidence_strength_rank = CASE evidence_type
        WHEN 'derived' THEN 1 WHEN 'configured' THEN 2
        WHEN 'effective' THEN 3 WHEN 'observed' THEN 4 END,
    data_source = COALESCE(data_source, evidence_source),
    direction   = COALESCE(direction, 'directed')
WHERE evidence_strength_rank IS NULL OR data_source IS NULL OR direction IS NULL;

ALTER TABLE :"schema".correlation_composition_rules
    ADD COLUMN IF NOT EXISTS connectivity_entity_compatibility JSONB,
    ADD COLUMN IF NOT EXISTS dependency_type                   TEXT,
    ADD COLUMN IF NOT EXISTS dependency_order                  INTEGER,
    ADD COLUMN IF NOT EXISTS dependency_strength               TEXT,
    ADD COLUMN IF NOT EXISTS overlap_type                      TEXT,
    ADD COLUMN IF NOT EXISTS evidence_validation_type          TEXT,
    ADD COLUMN IF NOT EXISTS evidence_strength_rank            INTEGER,
    ADD COLUMN IF NOT EXISTS evidence_temporal_alignment       TEXT,
    ADD COLUMN IF NOT EXISTS consequence_type                  TEXT,
    ADD COLUMN IF NOT EXISTS path_type                         TEXT,
    ADD COLUMN IF NOT EXISTS path_min_hops                     INTEGER,
    ADD COLUMN IF NOT EXISTS path_max_hops                     INTEGER,
    ADD COLUMN IF NOT EXISTS path_confidence_formula           TEXT,
    ADD COLUMN IF NOT EXISTS path_limitations                  JSONB,
    ADD COLUMN IF NOT EXISTS path_security_significance        TEXT,
    ADD COLUMN IF NOT EXISTS max_hops_per_phase                JSONB,
    ADD COLUMN IF NOT EXISTS super_node_protection             BOOLEAN;

COMMIT;
