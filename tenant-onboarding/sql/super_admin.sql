-- Super Admin sign-in. Run this ONCE, in your nhi_db database, as the owner of the nhi_global schema.
--
-- Two small tables: the super admins themselves, and their sign-in sessions (so that signing in
-- survives a restart and works when the service runs as several copies, with nothing to configure).

-- Only needed for step 2 below (hashing the first password inside SQL). Harmless otherwise.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------------------------
-- 1. The tables
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nhi_global.super_admins (
    id             integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username       text        NOT NULL,
    password_hash  text        NOT NULL,                   -- a bcrypt hash, never the password itself
    is_active      boolean     NOT NULL DEFAULT true,      -- false = cannot sign in, now or later
    created_at     timestamptz NOT NULL DEFAULT now(),
    last_login_at  timestamptz,
    CONSTRAINT super_admins_username_format CHECK (username ~ '^[A-Za-z0-9._@-]{3,64}$'),
    -- Refuses a plain-text password by mistake: only a real bcrypt hash can be stored.
    CONSTRAINT super_admins_password_is_bcrypt CHECK (password_hash ~ '^\$2[abxy]\$[0-9]{2}\$[./A-Za-z0-9]{53}$')
);

-- One account per username, ignoring upper/lower case ("Admin" and "admin" are the same person).
CREATE UNIQUE INDEX IF NOT EXISTS super_admins_username_key ON nhi_global.super_admins (lower(username));

CREATE TABLE IF NOT EXISTS nhi_global.super_admin_sessions (
    token_hash  text        PRIMARY KEY,                   -- sha-256 of the cookie value; the cookie itself is never stored
    admin_id    integer     NOT NULL REFERENCES nhi_global.super_admins (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS super_admin_sessions_expires_idx ON nhi_global.super_admin_sessions (expires_at);

-- ---------------------------------------------------------------------------------------------
-- 2. The first super admin  (EDIT the username and the password, then run)
--
--    The password is hashed here, in the database, and only the hash is stored.
--    Use at least 12 characters. After this runs, clear your SQL client's history, or use the
--    command-line way instead (it never shows the password anywhere):   go run . create-admin
-- ---------------------------------------------------------------------------------------------
INSERT INTO nhi_global.super_admins (username, password_hash)
SELECT v.username, crypt(v.password, gen_salt('bf', 12))
FROM (VALUES ('admin', 'CHANGE-THIS-TO-YOUR-PASSWORD')) AS v (username, password)
WHERE v.password <> 'CHANGE-THIS-TO-YOUR-PASSWORD'   -- the placeholder is never accepted as a password
  AND length(v.password) >= 12
ON CONFLICT DO NOTHING;

-- Tells you how it went:
SELECT CASE WHEN count(*) = 0
            THEN 'NO SUPER ADMIN EXISTS YET: put your username and a password of 12+ characters in step 2, and run step 2 again'
            ELSE count(*) || ' active super admin(s): ' || string_agg(username, ', ')
       END AS result
FROM nhi_global.super_admins WHERE is_active;

-- ---------------------------------------------------------------------------------------------
-- 3. Only if the service connects as a different database user than the one running this:
--    GRANT SELECT, UPDATE ON nhi_global.super_admins TO <service_user>;
--    GRANT SELECT, INSERT, DELETE ON nhi_global.super_admin_sessions TO <service_user>;
--    (create-admin additionally needs INSERT on super_admins.)
-- ---------------------------------------------------------------------------------------------

-- Handy later:
--   Disable an admin:   UPDATE nhi_global.super_admins SET is_active = false WHERE lower(username) = lower('admin');
--   Change a password:  UPDATE nhi_global.super_admins SET password_hash = crypt('NEW-PASSWORD', gen_salt('bf', 12)) WHERE lower(username) = lower('admin');
--                       DELETE FROM nhi_global.super_admin_sessions;   -- signs everyone out
--   See who exists:     SELECT id, username, is_active, last_login_at FROM nhi_global.super_admins;
