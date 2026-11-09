-- Bitbucket Data Center clients are tenants (secret scanner, DATABASE_HANDOVER
-- 2026-11-06, section 7b). The scanner's own migration adds these columns on
-- the live database; this makes a fresh database match. Safe to run again.
ALTER TABLE nhi_global.tenants
    ADD COLUMN IF NOT EXISTS bitbucket_active smallint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS bitbucket_created_by character varying(300),
    ADD COLUMN IF NOT EXISTS bitbucket_created_at timestamptz,
    ADD COLUMN IF NOT EXISTS bitbucket_updated_by character varying(300),
    ADD COLUMN IF NOT EXISTS bitbucket_updated_at timestamptz,
    ADD COLUMN IF NOT EXISTS bitbucket_last_verified_at timestamptz,
    ADD COLUMN IF NOT EXISTS bitbucket_last_event_at timestamptz,
    ADD COLUMN IF NOT EXISTS bitbucket_webhook_url character varying(1000);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_bitbucket_active_check'
                 AND conrelid = 'nhi_global.tenants'::regclass) THEN
    ALTER TABLE nhi_global.tenants ADD CONSTRAINT tenants_bitbucket_active_check CHECK (bitbucket_active IN (0, 1));
  END IF;
END $$;
