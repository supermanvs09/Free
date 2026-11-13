-- 012: alert triage - who owns an alert on the Alerts page and its history.
-- The API also creates these on first use (internal/modules/alerts/triage.go).
CREATE TABLE IF NOT EXISTS :"schema".alert_triage (
  tenant_id   TEXT        NOT NULL,
  alert_key   TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'open',
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, alert_key)
);
CREATE TABLE IF NOT EXISTS :"schema".alert_activity (
  id         BIGSERIAL   PRIMARY KEY,
  tenant_id  TEXT        NOT NULL,
  alert_key  TEXT        NOT NULL,
  actor      TEXT        NOT NULL,
  action     TEXT        NOT NULL,
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alert_activity_key_idx ON :"schema".alert_activity (tenant_id, alert_key, created_at);
