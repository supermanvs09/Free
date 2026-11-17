BEGIN;

-- ===========================================================================
-- The engine's own derived access-edge table.
--
-- The standalone engine first created this table as ispm_access_edges, but that
-- name belongs to the ISPM posture service (a different table: tenant_id,
-- source_type, attributes, ... and no actions column), so the engine's reads
-- failed. The engine uses this table of its own and never touches
-- ispm_access_edges. Nothing here alters or drops an existing table.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS :"schema".correlation_access_edges (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    source_arn        TEXT        NOT NULL,         -- credential ARN
    target_arn        TEXT        NOT NULL,         -- resource ARN, "*" or "*:<service>"
    actions           TEXT[]      NOT NULL DEFAULT '{}',
    evidence_type     TEXT        NOT NULL DEFAULT 'configured',
    first_observed_at TIMESTAMPTZ,
    last_observed_at  TIMESTAMPTZ,
    observed_count    INTEGER     NOT NULL DEFAULT 0,
    edge_type         TEXT        NOT NULL DEFAULT 'CAN_ACCESS',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_arn, target_arn)
);

CREATE INDEX IF NOT EXISTS idx_correlation_access_edges_source
    ON :"schema".correlation_access_edges (source_arn);
CREATE INDEX IF NOT EXISTS idx_correlation_access_edges_target
    ON :"schema".correlation_access_edges (target_arn);

COMMIT;
