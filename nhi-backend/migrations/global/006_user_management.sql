-- Apply once to nhi_db, after 001-005. Safe to run again.
--
-- What user management needs on top of the table the console already signs in
-- against: who created an account, when it was last changed, and the four
-- roles the console knows.
BEGIN;

ALTER TABLE nhi_global.nhi_users ADD COLUMN IF NOT EXISTS created_by  text;
ALTER TABLE nhi_global.nhi_users ADD COLUMN IF NOT EXISTS updated_at  timestamptz;
ALTER TABLE nhi_global.nhi_users ADD COLUMN IF NOT EXISTS updated_by  text;
-- Production rows carry a department (the tenant-onboarding service writes it);
-- databases built only from these migrations did not have the column.
ALTER TABLE nhi_global.nhi_users ADD COLUMN IF NOT EXISTS department  text;

-- One account per email. Case does not matter: signing in does not care, so
-- two accounts differing only in case would be one account with two passwords.
CREATE UNIQUE INDEX IF NOT EXISTS nhi_users_email_key ON nhi_global.nhi_users (lower(email));

-- The console's roles. Older values are mapped on read
-- (internal/platform/authz: manager -> operator, user -> viewer), so existing
-- rows keep working; new ones must name a role the console knows.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nhi_users_role_known') THEN
        ALTER TABLE nhi_global.nhi_users ADD CONSTRAINT nhi_users_role_known
            CHECK (role IS NULL OR lower(role) IN
                ('admin', 'super_admin', 'analyst', 'operator', 'viewer', 'manager', 'user'))
            NOT VALID;   -- NOT VALID: existing rows are not re-checked
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nhi_users_status_known') THEN
        ALTER TABLE nhi_global.nhi_users ADD CONSTRAINT nhi_users_status_known
            CHECK (status IS NULL OR lower(status) IN ('active', 'inactive', 'suspended'))
            NOT VALID;
    END IF;
END $$;

COMMIT;
