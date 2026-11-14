# NHI Console - frontend

React 19 + Vite + Tailwind v4. The full console runs in the browser with **no
backend and no database**: every screen reads the built-in API in
`src/lib/local`, which answers the same endpoints the platform API serves, from
a consistent estate generated at load time. Changes people make (verdicts,
plans, users, integration settings) are kept in the browser's localStorage and
shared by its tabs.

The one server-side piece is a ~400-line, zero-dependency **notification relay**
(`server/notify-relay.mjs`) that runs next to nginx in the same container. It
sends alert email through **Amazon SES** and opens **Jira** issues, because a
browser cannot do either safely.

## Run locally

```sh
npm install                 # creates package-lock.json (the old one was removed with axios)
cp .env.example .env
npm run dev                 # http://localhost:3000
npm run relay               # optional, in a second terminal: email + Jira
npm run lint && npm run build
```

Sign in with any of these (password `Welcome@2026`):

| User | Role |
|---|---|
| pranav@deepalgorithms.ai, charan@deepalgorithms.ai | Admin |
| harika@deepalgorithms.ai, raju@deepalgorithms.ai | Operator |
| swathi@, vamsi@, sashi@, venkat@deepalgorithms.ai | Analyst |
| sanju@, kiran@, divya@deepalgorithms.ai | Viewer |

Admins can add people, change roles and reset passwords in **Users & roles**.
To start over in a browser: `localStorage.removeItem('nhi.console.state.v2')`.

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

1. appears as a toast and at the top of **Alerts** (the badge updates),
2. is emailed to the Gmail recipients if Gmail is on and the alert matches its
   severity and kinds,
3. opens a Jira issue if Jira is on and the alert matches its rules. The same
   alert firing again comments on its issue instead of opening a duplicate.

Exactly one tab of a browser does the watching and sending (Web Locks).
**Sync now** picks up the next detection immediately.

### How email is sent (SES, no keys)

The browser cannot use the IAM role of the service it is served from - its
JavaScript runs on each user's machine. So the relay runs **inside the
frontend container**, bound to 127.0.0.1, and nginx forwards `/notify-api/*`
to it. The relay signs SES requests (SigV4, verified against AWS's test
vectors) with the container's own credentials, found in this order:

1. `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (avoid in production)
2. ECS task role / EKS Pod Identity (container credentials endpoint)
3. EKS IRSA (`AWS_WEB_IDENTITY_TOKEN_FILE` + `AWS_ROLE_ARN`)
4. EC2 instance profile (IMDSv2)

So: **attach this policy to the frontend service's task/pod/instance role** and
set `MAIL_FROM` to an SES-verified identity:

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
| `MAIL_FROM` | - | Required for email. The From address (a verified SES identity) |
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
it as **Sender**.

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
| `src/lib/notify.js` | the only network calls: the relay |
| `src/features/integrations/` | the Integrations hub and each application's tab |
| `src/ui/ProviderIcon.jsx` | brand marks |
| `server/notify-relay.mjs` | SES + Jira relay |

To point the console at a real platform API later, replace the body of
`request()` in `src/lib/api/client.js` with an HTTP call; every API module and
screen stays as it is.

## Limits to know

- Alerts are emailed and ticketed while at least one console tab is open; there
  is no server-side scheduler.
- What people change is kept per browser (localStorage), not shared between people.
- A Jira token entered in the console is kept in that browser's storage and sent
  only to the relay. Prefer the `JIRA_*` relay variables in production.
