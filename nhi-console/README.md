# NHI Console - frontend

React 19 + Vite + Tailwind v4. The console runs in the browser: every screen
reads the built-in API in `src/lib/local`, which answers the same endpoints the
platform API serves.

What people change - **users and roles, the audit log, verdicts, plans,
integration settings and alerts** - is one **live workspace shared by everyone
who opens the same address**. A change made in one browser appears in every
other open console within a moment, with no reload. There is no database: a
small zero-dependency Node server (`server/`) keeps the workspace in memory,
saves it to one JSON file, and streams changes to every console.

The same server sends alert **email through Gmail** (or Amazon SES) and opens
**Jira** issues, because a browser cannot do either safely.

## Run locally

```sh
npm install
npm run build && npm start      # http://localhost:3000 - console + live workspace + alerts
```

For development with hot reload, two terminals:

```sh
npm run relay                   # the workspace + alert server on :8787
npm run dev                     # http://localhost:3000, proxies /notify-api to it
```

Open the address in two browsers (or a normal and a private window), sign in
as two different people, and change something in one: it appears in the other.

Sign in with any of these (password `Welcome@2026`):

| User | Role |
|---|---|
| pranav@deepalgorithms.ai, charan@deepalgorithms.ai | Admin |
| harika@deepalgorithms.ai, raju@deepalgorithms.ai | Operator |
| swathi@, vamsi@, sashi@, venkat@deepalgorithms.ai | Analyst |
| sanju@, kiran@, divya@deepalgorithms.ai | Viewer |

Admins add people, change roles, reset passwords and switch accounts off in
**Users & roles**. Each takes effect for that person straight away: a new role
changes what they see within a second, and a switched-off account or a reset
password signs them out of every browser.

## Deploy

The console needs **one Node 20+ process** (no database, no other services).

| Where | How |
|---|---|
| Render | New → Blueprint → this repository (`render.yaml`, includes a 1 GB disk for the workspace) |
| Railway, Fly.io, a VM | `npm ci && npm run build && npm start` (listens on `$PORT`, default 3000) |
| ECS / EKS / Kubernetes | `docker build -t nhi-console .` (nginx + the server; mount a volume at `/var/lib/nhi`) |

Point everyone at the same deployment. Set `DATA_DIR` to a persistent disk so
the workspace survives restarts and redeploys (without one it starts over).

A static-only host (Netlify, Vercel static, S3) also works, but then each
browser keeps its own copy and nothing is shared or emailed.

## The live workspace

`src/lib/local/state.js` replicates the console's state through the server
(`server/sync-hub.mjs`):

- Changes travel as small path-level operations (`server/shared-ops.mjs`, used
  by both sides). Rows of a list are addressed by id, so two people editing
  different users, findings or plans at the same moment never overwrite each
  other.
- Every console holds a Server-Sent Events stream (`/notify-api/sync/stream`):
  changes, **who is online and on which screen** (top bar), and which console
  is the alert watcher.
- Other people's actions show as a toast ("Harika Reddy - Accepted a posture
  finding"), and every open screen refreshes in place.
- Offline: changes are kept and sent when the connection is back.
- Who is signed in stays per browser. Passwords are stored as salted hashes.
- Secrets typed in the console (the Jira API token, the Gmail app password) are
  kept by the server only (`DATA_DIR/secrets.json`, mode 600) and never sent to
  anyone's browser.

`DATA_DIR/workspace.json` is the whole workspace. Delete it (with the server
stopped) to start over.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3000 with `npm start`, 8787 for `npm run relay` | Where it listens |
| `DATA_DIR` | `./data` | Where the workspace and secrets are saved |
| `SYNC_ENABLED` | `true` | `false`: no shared workspace (each browser on its own) |
| `ALLOWED_ORIGINS` | any | Comma list of origins allowed to post changes |
| `SYNC_RATE_LIMIT_PER_MIN` | `1200` | Changes per client IP per minute |

## Integrations

**Settings → Integrations** lists eight applications, each with an on/off switch:

| Application | Kind | What its tab does |
|---|---|---|
| AWS | Identity source | Accounts, read-only role + EventBridge rule, regions, sync, CodeCommit scanning |
| Azure | Identity source | Subscriptions (federation or client secret), checks, sync |
| Jenkins | Identity source | Controllers (API token), jobs, agents, credential-store bindings |
| HashiCorp Vault | Identity source | Clusters (AppRole), auth roles, tokens, dynamic leases |
| GitHub | Credential exposure | Organisation (GitHub App), repositories, findings |
| Bitbucket | Credential exposure | Data Center URL + token, repositories, findings |
| Gmail | Alerts | Recipients you enter, severity and kinds of alert, test email, delivery log |
| Jira | Alerts | Site, account, token, project, issue type, priority mapping, test issue, log |

Switching an application **on** adds its tab and opens it. Switching it **off**
hides the tab, and its identities, credentials, findings and alerts leave every
screen (Discovery, Posture, Genome, Alerts, the dashboard) until it is switched
back on. Nothing is deleted. Credential exposure appears in the navigation only
while GitHub or Bitbucket is on.

Every identity, credential, finding and alert carries its application's real
brand mark (`src/ui/ProviderIcon.jsx`, from `react-icons`).

## Real-time alerts, Gmail and Jira

New detections (an exposed credential, a behaviour anomaly, a posture drop,
newly discovered identities) arrive while the console is open. Each one:

1. appears as a toast in **everyone's** console and at the top of **Alerts**,
2. is emailed to the Gmail recipients if Gmail is on and the alert matches its
   severity and kinds,
3. opens a Jira issue if Jira is on and the alert matches its rules. The same
   detection firing again comments on its issue instead of opening a duplicate.

Exactly one console across all users does the watching and sending (the server
names it, and hands the job on when that console closes), and the server sends
each alert once however many consoles ask. **Sync now** picks up the next
detection immediately, from anyone's console.

### Gmail (two minutes, no server settings)

In **Integrations → Gmail** an admin enters the Gmail or Google Workspace
address alerts come from and an **app password** (Google Account → Security →
2-Step Verification → [App passwords](https://myaccount.google.com/apppasswords)),
adds recipients, and presses **Send a test email**. Mail goes out through
`smtp.gmail.com:465` (TLS). Google limits a Gmail account to about 500
recipients a day; use a Workspace account or SES for more.

Instead, the sender can be set on the server (it then overrides the console):

| Variable | Meaning |
|---|---|
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Gmail / Workspace sender |
| `SMTP_HOST`, `SMTP_PORT` (465), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Any SMTP server (587 uses STARTTLS) |
| `MAIL_FROM` + an AWS role | Amazon SES (below), used when no SMTP sender is set |

### Jira

In **Integrations → Jira**: site (`https://yourteam.atlassian.net`), the
account email, an [API token](https://id.atlassian.com/manage-profile/security/api-tokens),
the project key, issue type and priority mapping. **Test connection** checks
the account and project; **Create a test issue** opens one. Issues are created
with Jira Cloud REST v3; repeats are found by label and get a comment.

### Amazon SES (optional)

The server signs SES requests (SigV4) with the credentials of the service it
runs on, found in this order:

1. `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (avoid in production)
2. ECS task role / EKS Pod Identity (container credentials endpoint)
3. EKS IRSA (`AWS_WEB_IDENTITY_TOKEN_FILE` + `AWS_ROLE_ARN`)
4. EC2 instance profile (IMDSv2)

Attach this policy to the service's role and set `MAIL_FROM` to an
SES-verified identity:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["ses:SendEmail", "ses:SendRawEmail"],
    "Resource": "arn:aws:ses:ap-south-1:<account-id>:identity/deepalgorithms.ai",
    "Condition": { "StringEquals": { "ses:FromAddress": "alerts@deepalgorithms.ai" } }
  }]
}
```

While the SES account is in the sandbox, recipients must be verified too.

### Relay environment

| Variable | Default | Meaning |
|---|---|---|
| `MAIL_FROM` | - | The From address for SES (a verified SES identity) |
| `MAIL_FROM_NAME` | `NHI Security` | Display name |
| `AWS_REGION` / `SES_REGION` | `ap-south-1` | SES region |
| `SES_CONFIGURATION_SET` | - | Optional SES configuration set |
| `ALLOWED_RECIPIENT_DOMAINS` | any | Comma list; mail only goes to these domains |
| `ALLOWED_ORIGINS` | any | Comma list of console origins allowed to call the relay |
| `RATE_LIMIT_PER_MIN` | `30` | Per client IP |
| `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` | - | Optional server-side Jira account, used instead of the one entered in the console |
| `JIRA_ALLOWED_HOSTS` | `*.atlassian.net` | Jira hosts the relay may call (add your Data Center host) |
| `NOTIFY_RELAY_ENABLED` | `true` | Set `false` to not start the relay |

`GET /notify-api/health` reports whether the relay is ready; the Gmail tab shows
the result under **Sender**.

## Docker

```sh
docker build -t nhi-console:latest .
docker run --rm -p 3000:3000 -e MAIL_FROM=alerts@deepalgorithms.ai -e AWS_REGION=ap-south-1 nhi-console:latest
```

The image is nginx + Node (for the relay only). nginx serves the app, adds the
security headers (CSP `connect-src 'self'`), and proxies `/notify-api`. The
relay is restarted automatically if it exits.

## Where things are

| Path | What |
|---|---|
| `src/lib/api/client.js` | axios-compatible client; routes every request to the built-in API |
| `src/lib/local/` | the built-in API: estate (`seed.js`), scoping (`world.js`), posture rules, exposure, genome, remediation, alerts, users, integrations, live alerts (`notifyBus.js`) |
| `src/lib/local/state.js` | the shared workspace: replication, presence, live refresh |
| `src/lib/notify.js` | email and Jira calls to the server |
| `server/notify-relay.mjs` | the server: static files, workspace, Gmail/SES, Jira |
| `server/sync-hub.mjs`, `server/shared-ops.mjs` | the live workspace and its change operations |
| `server/smtp.mjs` | SMTP client for Gmail (no dependencies) |
| `src/features/integrations/` | the Integrations hub and each application's tab |
| `src/ui/ProviderIcon.jsx` | brand marks |

To point the console at a real platform API later, replace the body of
`request()` in `src/lib/api/client.js` with an HTTP call; every API module and
screen stays as it is.

## Limits to know

- Alerts are detected and delivered while at least one console is open
  somewhere; there is no separate scheduler.
- The workspace is one JSON document in memory (a few MB at most). It suits a
  team, not thousands of concurrent users; run one server process, not several
  replicas behind a load balancer.
- Anyone who can reach the address can use the console's sign-in; put it behind
  your SSO proxy or VPN if it should not be public.
