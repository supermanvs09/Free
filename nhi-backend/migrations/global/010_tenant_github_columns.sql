-- GitHub scanning is switched on for the whole company, like Bitbucket
-- (008): nhi_global.tenants.github_active. Per-AWS-account GitHub settings
-- (accounts.github_enabled ...) are no longer read or written by the API.
-- Safe to run again.
ALTER TABLE nhi_global.tenants
    ADD COLUMN IF NOT EXISTS github_active smallint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS github_updated_by character varying(300),
    ADD COLUMN IF NOT EXISTS github_updated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_github_active_check'
                 AND conrelid = 'nhi_global.tenants'::regclass) THEN
    ALTER TABLE nhi_global.tenants ADD CONSTRAINT tenants_github_active_check CHECK (github_active IN (0, 1));
  END IF;
END $$;

-- Companies that already had GitHub on for an AWS account keep it, now for the company.
-- (Run per database; tenant schemas are listed in nhi_global.tenants.db_name.)
