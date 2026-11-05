# Tenant onboarding

A small standalone service for operators, with two tabs:

* **Onboard company** - type a company name and its collector details (step 1), optionally create
  its first user (step 2), and the company is set up.
* **Tenants** - see every registered company, search and sort, copy IDs, and **edit** a company's
  domain and collector details. Edits go to the `nhi_global.tenants` table only.

It is deployed on its own and shares no code with the API server or the frontend;
it only needs to reach the platform's Postgres.

## What one submit does (all or nothing, in one transaction)

1. **Company row.** Adds one row to `nhi_global.tenants`:

   | Column | Value |
   |---|---|
   | `db_name` | made from the company name: lowercase, `_` between words, at most 23 characters (`Acme Corp` -> `acme_corp`) |
   | `domain_name` | the same name with hyphens plus `DOMAIN_SUFFIX` (`acme-corp.nhi.local`) |
   | `tenant_id` | a new random UUID |
   | `created_at` | now |
   | `collector_aws_account_id`, `collector_external_id`, `collector_event_bridge_arn`, `collector_regions` | what you typed - all four are required |

2. **Company workspace.** Creates the schema named `db_name` with every tenant table
   (65 tables, the two time-partitioned posture tables with their first partitions, and the
   reference rows the posture engine needs: pillars, categories, rule weights, drift config).
   An existing schema is never altered.
3. **Customer account (optional field).** If you enter the customer's AWS account ID, a row is added
   to that schema's `accounts` table with `tenant_id`, `account_id`, `client_aws_account_id`,
   `regions` and **`external_id` = the collector External ID**, status `pending`. Leave the field empty
   and no row is added; the API creates it when the customer connects (it also copies the External
   ID then). The account is refused if another company already has it.
4. **First user (optional section).** Adds a row to `nhi_global.nhi_users`:
   `id` = next free number, `email` = `name@db_name` (what the sign-in page takes),
   `password` = **bcrypt hash** (the plain password is never stored or logged), `full_name`,
   `department`, `team`, `role` (default `admin`), `tenant_id` = the company's, `status` = `active`,
   `last_login_at` empty, `created_at` now. A CSV with the sign-in details downloads in the browser
   (the password lives only in the browser tab; it can't be fetched later).

`nhi_global.refresh_tokens` needs nothing here: the API writes a row each time someone signs in, and
removes them when the user is deleted.

## Editing a company (Tenants tab)

Select **Edit** on a row. You can change: domain, AWS account ID, External ID, event bus ARN, regions.
You cannot change the tenant ID, the workspace name (`db_name`) or the created date: every user,
account and table of the company is tied to them (users sign in as `name@db_name`), so the server
refuses any request that names them.

* Only the `nhi_global.tenants` row is written. Nothing in the company's workspace, its accounts or
  its users is touched. (An account already registered for the customer keeps the External ID it
  had until the API next verifies it.)
* **Same rules as onboarding**: 12-digit account, External ID 16-255 characters, a valid event bus
  ARN, valid regions, a dotted lowercase domain. A saved detail cannot be emptied.
* **Changing the External ID** shows a warning and needs "I understand": the customer's AWS role trusts
  the current value, so their connection stops until the role is updated.
* **No lost updates**: each save sends the values you were looking at; if someone changed the row
  meanwhile, nothing is written and the page offers to load the latest.
* **Old rows**: a company saved long ago in an old format (for example a domain without a dot, or an
  External ID under 16 characters) is marked "Needs update". The database refuses any change to such
  a row until the old values are fixed, so the page asks you to fix them in the same save.
* One company per domain and per External ID: a duplicate is refused.
* The server log records which fields changed (never their values).

## Deleting a company

At the bottom of a company's **Edit** window: **Delete...**. It opens a confirmation that shows what will be
removed (users, connected AWS accounts) and asks you to **type the workspace name**; the button stays
disabled until it matches, and the server checks the name again. In one transaction it:

1. deletes the company's users from `nhi_global.nhi_users` (and their rows in `refresh_tokens`),
2. drops the company's whole schema (`DROP SCHEMA ... CASCADE`: every table and all its data),
3. deletes the company's row from `nhi_global.tenants`.

If any step fails, nothing is deleted. It cannot be undone. It never deletes a protected schema (`public`,
`nhi_global`, `nhi_scanner`, `information_schema`, `pg_*`), even if a company row names one. Not touched:
ClickHouse data (a `<name>_clickhouse` database, if one exists) and anything in the customer's AWS account.
The audit log records `tenant_deleted` with who, the company and what was removed. The database user
therefore also needs `DELETE` on `nhi_global.tenants`, `nhi_global.nhi_users` and `nhi_global.refresh_tokens`,
and to own (or be allowed to drop) the company schemas it created.

## Submitting the same company twice

The company name decides the identity: `Acme Corp`, `acme corp`, `ACME-Corp.` all give `acme_corp`.
A second submit **adds no row**; it answers "already registered", shows any entries that differ from
what is saved (nothing is overwritten - an External ID must never change once a customer trusts it),
and still lets you add a user or fill a missing workspace. Two people submitting at once are
serialised by a database lock. If a row was added by hand earlier, submitting its company builds its
missing workspace without a second row.

Refused with a clear message, nothing saved: an External ID already used by another company, a
customer account already used by another company, a username already taken (`name@db_name`), a
company whose name is too close to a different registered one.

## Signing in

The page opens on a sign-in form. **Super admins are rows of a table in your database**
(`nhi_global.super_admins`: username and a bcrypt hash of the password), so there is nothing about sign-in
in the environment: no password, no hash, no session secret, no cookie setting.

**One-time setup** (in your `nhi_db` database, as the owner of `nhi_global`):

1. Open `sql/super_admin.sql`. Step 2 near the bottom has `'admin'` and `'CHANGE-THIS-TO-YOUR-PASSWORD'`:
   put your username and a password of 12 or more characters there.
2. Run the whole file once (psql, pgAdmin, DBeaver...). It creates two small tables and your first super admin,
   and ends with a line saying how many super admins exist. It is safe to run again; it refuses the placeholder
   password and a plain-text password can never be stored (the table only accepts bcrypt hashes).

   *Prefer not to type a password into SQL?* Run only the tables part, then create the admin from a terminal,
   which hides the password and never logs it:

   ```sh
   go run . create-admin            # asks for a username and a password (twice)
   go run . create-admin priya      # same, for the username "priya"
   ```
   It uses the database settings of your `.env`. Run it again for an existing username to set a new password
   (that admin is signed out everywhere).
3. Start the service and sign in with that username and password. The username is not case-sensitive.

Day to day, in SQL:

```sql
SELECT id, username, is_active, last_login_at FROM nhi_global.super_admins;                 -- who exists
UPDATE nhi_global.super_admins SET is_active = false WHERE lower(username) = lower('priya');  -- disable (signed out at once)
DELETE FROM nhi_global.super_admins WHERE lower(username) = lower('priya');                   -- remove
```

How it behaves:

* A wrong username and a wrong password give the same message and take the same time.
* Signing in creates a random cookie (`HttpOnly`, `SameSite=Strict`, gone when the browser closes, and `Secure`
  automatically when the page is served over https, including behind a load balancer). The database stores only the
  hash of that cookie, with an expiry 12 hours ahead. Because sessions live in the database, signing in survives a
  restart, works when several copies of the service run, and **Sign out** really ends the session.
* Several admins can be signed in at once; disabling or deleting one ends that one's sessions immediately.
* If the database is unreachable, the page says the problem is on our side, not "wrong password".
* Only the sign-in page and its stylesheet, logo and wave images are reachable without signing in.
* If the session ends while you are filling in a form, a banner says so and the form keeps what you typed; sign
  in again in a new tab and retry.
* Sign-ins, onboardings, edits and deletions write one JSON line each to the service's standard output (who and
  what; a failed sign-in says whether the username was a known one, the page never does). Never a password, a hash
  or a session value.

There is no lockout or second factor, to keep this simple, so use a long password and keep the service off the
public internet (VPN, or an IP allow-list at the load balancer).

The look is light only: a deep-blue gradient sidebar with soft wave edges, white rounded cards, pill buttons.
Who is signed in and the sign-out icon are at the top right.

## Run

```sh
cp .env.example .env     # put your database settings in it; the service reads it by itself
go run .                 # http://localhost:8090
```

**Settings file.** On start the service reads `.env` from the folder it is started from (then from next to
the program), or the file named by `ENV_FILE`. A value already set in the real environment wins over the file,
so a container platform's own variables still take precedence. Values are read literally (no `$` expansion);
quotes are optional and `#` starts a comment. The start-up log says which file was read and how many values it
set (never the values). A broken line stops the start with its line number. `.env` is in `.gitignore`.

## Deploying

Only the database settings are needed, and they are the same ones your backend already uses:

```
DB_HOST  DB_PORT  DB_NAME  DB_USER  DB_PASSWORD  DB_SSLMODE      (or DATABASE_URL)
```

* **Docker:** `docker build -t tenant-onboarding .` then `docker run -p 8090:8090 --env-file .env tenant-onboarding`
  (or the platform's own variables; do not bake `.env` into the image, the `.dockerignore` already leaves it out).
  There is no sign-in secret to inject: the image needs nothing but the database connection.
* **Order:** run `sql/super_admin.sql` once before the first start. If the tables are missing the service refuses
  to start and says so; if no super admin exists yet it starts and says how to create one.
* **https:** terminate https at the load balancer; the service listens on plain http (`PORT`, default 8090). The
  cookie turns `Secure` by itself when the request arrives as https (`X-Forwarded-Proto`). Use `GET /healthz` as
  the health check (it needs the database to answer).
* **Several copies:** nothing to do. Sessions are in the database, so any copy accepts a sign-in made on another.
* **Network:** the service must reach Postgres (security group / VPC). Keep the page itself private.
* **Database user:** see below. The user the service runs as must be able to read and update `super_admins` and
  read, add and delete `super_admin_sessions` (the GRANTs are at the bottom of `sql/super_admin.sql`).
* **Logs:** the audit lines go to standard output, so they appear in CloudWatch or your log system.

API (behind the sign-in cookie): `GET /api/workspace?company=`, `POST /api/onboard`,
`GET /api/tenants`, `PATCH /api/tenants/{id}` (body `{"expected": {...}, "changes": {...}}`).
Public: `GET /api/session`, `POST /api/login`, `POST /api/logout`, `GET /healthz`.

The database user needs: `SELECT`/`UPDATE` on `nhi_global.super_admins`, `SELECT`/`INSERT`/`DELETE` on
`nhi_global.super_admin_sessions`, `INSERT`/`SELECT`/`UPDATE`/`DELETE` on `nhi_global.tenants`, `INSERT`/`SELECT`/`DELETE` on
`nhi_global.nhi_users` and `DELETE` on `nhi_global.refresh_tokens`, and `CREATE` on the database (to create new schemas). Existing company
schemas are only read.

## Tests

```sh
go test ./...                                            # logic only
DB_HOST=localhost DB_USER=postgres DB_PASSWORD=... go test ./...   # plus Postgres tests (each makes and drops its own scratch database)
```

## Regenerating the table definitions

`sql/tenant_schema.sql` and `sql/tenant_seed.sql` are generated from a `pg_dump` of nhi_db:

```sh
python3 scripts/extract_tenant_schema.py nhi_db.sql <a_tenant_schema_name>
```

Run it after the tenant tables change, review the diff, run the tests (they expect 65 tables - update
the number in `TestTemplates` if the count changed on purpose).
