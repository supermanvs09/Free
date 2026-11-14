# NHI console relay: real Jira and Gmail

One Cloudflare Worker (free plan) that:

- serves the console from its own address;
- keeps the workspace in a Durable Object, so everyone with the link sees every change live over a WebSocket;
- creates real Jira Cloud issues when someone raises one in the console. Changing status, assignee or priority in the console updates the issue in Jira, and comments are copied to it;
- receives Jira webhooks, so a change made in Jira shows up in every open console;
- sends alert, assignment and mention emails through the Gmail API.

Jira and Gmail credentials live only in the Worker. The browser never sees them.

## 1. Deploy

```sh
cd relay
npm install
npx wrangler login          # your Cloudflare account
npm run deploy              # builds the console, deploys the Worker
```

Wrangler prints the address, for example `https://corvane-nhi-console.<you>.workers.dev`. Open it and sign in with your work email.

## 2. Jira Cloud

1. Create an API token: https://id.atlassian.com/manage-profile/security/api-tokens. The issues are created as that Atlassian account.
2. Store the credentials:

   ```sh
   npx wrangler secret put JIRA_BASE_URL        # https://your-site.atlassian.net
   npx wrangler secret put JIRA_EMAIL           # the account that owns the token
   npx wrangler secret put JIRA_API_TOKEN
   npx wrangler secret put JIRA_WEBHOOK_SECRET  # any long random string
   ```

   The project key defaults to `SEC`. To change it, edit `JIRA_PROJECT_KEY` in `wrangler.toml`.
3. To send Jira changes back to the console, go to Jira, then Settings, then System, then WebHooks, and create a webhook:
   - URL: `https://<your relay>/api/jira/webhook?secret=<JIRA_WEBHOOK_SECRET>`
   - Events: Issue updated and Comment created
   - JQL: `project = SEC AND labels = nhi`

Jira emails assignees and watchers itself, as usual. The console assigns an issue by looking up the assignee's work email in Jira.

## 3. Gmail

1. In Google Cloud console, enable the Gmail API and create an OAuth client of type Web application. Add `https://developers.google.com/oauthplayground` as an authorised redirect URI.
2. On the OAuth consent screen, choose Internal for a Google Workspace organisation. Otherwise publish the app In production, because refresh tokens from apps in Testing expire after 7 days.
3. Get a refresh token for the mailbox that sends the mail (for example `nhi-alerts@company.com`):
   1. Open https://developers.google.com/oauthplayground and, under the gear icon, choose Use your own OAuth credentials.
   2. Authorise the scope `https://www.googleapis.com/auth/gmail.send` while signed in as that mailbox.
   3. Choose Exchange authorization code for tokens and copy the refresh token.
4. Store the credentials:

   ```sh
   npx wrangler secret put GMAIL_CLIENT_ID
   npx wrangler secret put GMAIL_CLIENT_SECRET
   npx wrangler secret put GMAIL_REFRESH_TOKEN
   npx wrangler secret put GMAIL_SENDER          # nhi-alerts@company.com
   npx wrangler secret put MAIL_ALLOWED_DOMAINS  # company.com (comma separated)
   npx wrangler secret put CONSOLE_ORIGIN        # https://<your relay>, used for links in mail and Jira
   ```

Mail only goes to addresses in `MAIL_ALLOWED_DOMAINS`. The console marks anything else as held back, so a typo can't email the outside world.

## 4. Check it

Open Integrations in the console:
- Jira and Gmail should both show as Connected.
- Test connection signs in to Jira.
- Send test email delivers a message.

## Who can open it

The Worker URL is public. To limit it to your company, put Cloudflare Access (Zero Trust, free for up to 50 users) in front of it with your identity provider (Okta, Entra ID or Google). Add a Bypass rule for `/api/jira/webhook` so Jira can still reach it; the webhook checks its own secret.

## Tests

```sh
npm test                    # the Worker against stand-in Jira and Gmail APIs (17 checks)
node test/ui.mjs            # two people in two browsers through the relay (8 checks)
```
