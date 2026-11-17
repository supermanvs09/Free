-- Apply once per tenant schema. Safe to run again:
--   psql "$DSN" -v schema=bimasugam -f migrations/tenant/018_identity_owner_assignment.sql
--
-- An owner a person confirms or sets from the console. It lives in its own
-- columns, not in `owner`, so a later discovery scan (which rewrites owner and
-- owner_reason) can never erase the decision or who made it.
BEGIN;
ALTER TABLE :"schema".identities ADD COLUMN IF NOT EXISTS owner_reason text;
ALTER TABLE :"schema".identities ADD COLUMN IF NOT EXISTS owner_assigned text;
ALTER TABLE :"schema".identities ADD COLUMN IF NOT EXISTS owner_assigned_by text;
ALTER TABLE :"schema".identities ADD COLUMN IF NOT EXISTS owner_assigned_reason text;
ALTER TABLE :"schema".identities ADD COLUMN IF NOT EXISTS owner_assigned_at timestamptz;
COMMIT;
