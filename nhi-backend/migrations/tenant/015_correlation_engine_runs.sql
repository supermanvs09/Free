BEGIN;

-- ===========================================================================
-- Queue of blast-radius computations, consumed by the poller.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS :"schema".correlation_engine_runs (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    source_arn    TEXT        NOT NULL,
    status        TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    refresh       BOOLEAN     NOT NULL DEFAULT true,
    error         TEXT,
    total_paths   INTEGER,
    requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at    TIMESTAMPTZ,
    finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_correlation_engine_runs_status
    ON :"schema".correlation_engine_runs (status, requested_at);
CREATE INDEX IF NOT EXISTS idx_correlation_engine_runs_source
    ON :"schema".correlation_engine_runs (source_arn);

COMMIT;
