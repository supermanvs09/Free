# Code & CI/CD console (on-premises)

A separate product from the cloud NHI console: it runs inside the customer's
network and covers **GitHub** (as a GitHub App), **Bitbucket Data Center** and
**Jenkins**. The cloud console (`frontend/` + `nhi-backend/`) covers AWS only.

| | Cloud console | This console |
|---|---|---|
| Sources | AWS accounts, CodeCommit | GitHub, Bitbucket DC, Jenkins |
| Runs | adapID cloud | Customer's network |
| Code | `frontend/`, `nhi-backend/` | `onprem-console/frontend/`, `onprem-console/backend/` |

## What it does

- **Secrets in code**: a full scan of every repository the GitHub App or the
  Bitbucket token can read, then a scan of the changed files on every push
  (signed webhooks, HMAC-SHA256). Only a redacted form and a fingerprint are
  kept, never a value. A secret that disappears from the code closes itself; a
  finding marked "not a secret" stays closed.
- **Jenkins**: credential metadata (never values), which jobs use each one,
  which none use, and builds flagged when they run outside business hours or
  are the first run of a job that uses stored credentials (Notification plugin).
- **People**: local accounts. Admins do everything; **analysts** set up
  connections, scan and triage; **viewers** read. Connection setup is limited
  to admins and analysts. Five failed sign-ins lock an email for 15 minutes.

## Run it

```sh
cd onprem-console
cp .env.example .env      # fill in the required values
docker compose up -d --build
```

Open `http://<host>:8443`, sign in as `ONPREM_ADMIN_EMAIL`, add people under
**People**, then **Connections** → a source → follow the four tabs. Saving a
connection tests it; the first scan starts on its own once every check passes.

Put TLS in front of port 8443 (your reverse proxy or load balancer), and set
`ONPREM_PUBLIC_URL` to that HTTPS address: webhook URLs are built from it.

### Network

| From | To | Why |
|---|---|---|
| Console | GitHub API (api.github.com or GHES `/api/v3`) | read code |
| Console | Bitbucket, Jenkins | read code, credential metadata |
| GitHub, Bitbucket, Jenkins | Console `/webhooks/*` | push and build events |

GitHub.com webhooks need the console's `/webhooks/github` path reachable from
the internet (only that path needs exposing). Without it, full scans still run;
every connected source is also rescanned on a schedule (`ONPREM_SCAN_EVERY_HOURS`, default 24), and **Scan all now** runs one at once.

## Environment

See `.env.example`. Required: `ONPREM_DB_PASSWORD` (or `ONPREM_DATABASE_URL`),
`ONPREM_JWT_SECRET`, `ONPREM_ENCRYPTION_KEY`, `ONPREM_ADMIN_EMAIL`,
`ONPREM_ADMIN_PASSWORD`. The API refuses to start, saying which is wrong, when
one is missing. Back up `ONPREM_ENCRYPTION_KEY`: saved tokens and keys cannot be
read without it.

## Develop and test

```sh
# API (Postgres running locally)
cd backend
ONPREM_TEST_DATABASE_URL=postgres://postgres:pw@localhost/onprem_test?sslmode=disable go test ./...

# Web app, proxied to the API on :8090
cd frontend && npm install && npm run dev    # http://localhost:3100
```

`go test` without `ONPREM_TEST_DATABASE_URL` runs the unit tests only. With it,
`TestEndToEnd` runs the whole console against fake GitHub, Bitbucket and
Jenkins servers: roles, connection checks, full scans, signed pushes, triage,
Jenkins sync, unusual builds, secret rotation and lockout. The schema of that
database is wiped.

## API

All under `/api/v1`, bearer token from `POST /auth/login`.

| | Viewer | Analyst | Admin |
|---|---|---|---|
| `GET /overview`, `/findings`, `/repositories`, `/jenkins/*`, `/deliveries`, `/connections` | ✓ | ✓ | ✓ |
| `PUT/DELETE /connections/{kind}`, `POST …/verify`, `…/scan`, `…/webhook-secret`, `PATCH /findings/{id}` | | ✓ | ✓ |
| `/users`, `/audit` | | | ✓ |

Webhooks: `POST /webhooks/github`, `POST /webhooks/bitbucket`,
`POST /webhooks/jenkins/{secret}`.
