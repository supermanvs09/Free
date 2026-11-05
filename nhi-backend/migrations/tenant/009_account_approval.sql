-- Approval of a new AWS connection. Run per tenant schema (psql -v schema=...).
-- Safe to run again.
--
-- A first connection that passes every check is not connected straight away:
-- it waits for a platform admin's approval (nhi_global.connection_approvals).
-- These columns are its state on the account itself:
--   approval_status  NULL (connected before approvals existed, or never
--                    asked) | pending | approved | rejected
-- Approving sets account_status 'active' and connects the account.
BEGIN;
ALTER TABLE :"schema".accounts ADD COLUMN IF NOT EXISTS approval_status       text;
ALTER TABLE :"schema".accounts ADD COLUMN IF NOT EXISTS approval_requested_at timestamptz;
ALTER TABLE :"schema".accounts ADD COLUMN IF NOT EXISTS approval_requested_by text;
ALTER TABLE :"schema".accounts ADD COLUMN IF NOT EXISTS approved_at           timestamptz;
ALTER TABLE :"schema".accounts ADD COLUMN IF NOT EXISTS approved_by           text;
ALTER TABLE :"schema".accounts ADD COLUMN IF NOT EXISTS approval_note         text;
COMMIT;

-- account_status (varchar 20, no constraint) may now also read
-- pending_approval or rejected.
