/**
 * Setup guides for this console's three sources. Every step is something the
 * customer does in their own GitHub, Bitbucket or Jenkins; the values only
 * this console has (webhook address and secret) are shown on the Webhook tab.
 */
export const GUIDES = {
  github: {
    name: 'GitHub',
    kind: 'Code scanning · GitHub App',
    minutes: 10,
    summary: 'A GitHub App that your organisation owns. No personal tokens: the App reads code, and GitHub tells this console about every push.',
    reads: ['Contents: read', 'Metadata: read', 'push events'],
    unlocks: ['Secrets found in every repository you choose', 'A scan on every push, changed files only', 'Short-lived tokens, minted per hour'],
    prerequisites: [
      'An organisation owner on GitHub.com or GitHub Enterprise Server.',
      'For push scans: GitHub must reach this console’s webhook address (GitHub.com needs it published, for example through a reverse proxy; GitHub Enterprise Server inside your network reaches it directly).',
    ],
    permissions: {
      columns: ['Permission', 'Level', 'Why it is needed'],
      rows: [
        ['Contents', 'Read-only', 'Read files to scan them'],
        ['Metadata', 'Read-only (mandatory)', 'List the repositories the installation can see'],
      ],
      note: 'No write access to code, issues, pull requests or settings.',
    },
    steps: [
      {
        title: 'Create the GitHub App',
        list: [
          'Organisation settings → Developer settings → GitHub Apps → New GitHub App',
          'Name: adapID Code Scanner (any name your organisation recognises)',
          'Homepage URL: this console’s address',
          'Webhook: untick Active for now; you switch it on in the last step',
          'Repository permissions: Contents → Read-only, Metadata → Read-only',
          'Subscribe to events: Push',
          'Where can this App be installed: Only on this account',
          'Create GitHub App, then note the App ID at the top of its page',
        ],
      },
      {
        title: 'Generate a private key',
        list: ['On the App’s page: Private keys → Generate a private key', 'A .pem file downloads. You paste its contents on the Connect tab; keep no other copy.'],
      },
      {
        title: 'Install the App on the organisation',
        list: [
          'On the App’s page: Install App → choose the organisation',
          'All repositories, or Only select repositories',
          'After installing, the address ends in /installations/12345678: that number is the installation ID',
        ],
        note: 'Change the repositories any time: Organisation settings → GitHub Apps → Configure.',
      },
    ],
    fields: [
      { key: 'app_id', label: 'App ID', placeholder: '123456', hint: 'General → App ID on the App’s page.', inputMode: 'numeric' },
      { key: 'installation_id', label: 'Installation ID', placeholder: '12345678', hint: 'The number at the end of the installation’s address.', inputMode: 'numeric' },
      { key: 'api_url', label: 'API address', placeholder: 'https://api.github.com', hint: 'Leave blank for GitHub.com. GitHub Enterprise Server: https://github.example.com/api/v3', optional: true },
    ],
    secret: { label: 'Private key (.pem)', placeholder: '-----BEGIN RSA PRIVATE KEY-----', multiline: true, hint: 'Open the downloaded .pem file and paste everything in it.' },
    caCert: true,
    webhook: {
      intro: 'Switch on the App’s webhook so each push is scanned as it lands.',
      list: ['On the App’s page: General → Webhook', 'Tick Active', 'Webhook URL and Webhook secret: the two values above', 'Save changes'],
      note: 'GitHub signs each delivery with HMAC-SHA256. Unsigned or wrongly signed deliveries are refused and listed under Webhook activity.',
      field: 'Webhook secret',
    },
  },

  bitbucket: {
    name: 'Bitbucket Data Center',
    kind: 'Code scanning · self-hosted',
    minutes: 15,
    summary: 'A read-only HTTP access token, plus a push webhook so scans follow every change.',
    reads: ['Project read', 'Repository read', 'push webhook'],
    unlocks: ['Secrets found in every repository the token reads', 'A scan on every push', 'Nothing writable: the token is read-only'],
    prerequisites: [
      'Bitbucket Data Center with a Data Center licence (needed for project- and repository-level tokens).',
      'This console can reach Bitbucket, and Bitbucket can reach this console’s webhook address.',
    ],
    permissions: {
      columns: ['Token permission', 'Why it is needed'],
      rows: [
        ['Project read', 'Read every repository in the project'],
        ['Repository read', 'Read a single repository'],
      ],
      note: 'A project-level token with Project read covers every repository in that project. No write or admin permission.',
    },
    steps: [
      {
        title: 'Create a read-only HTTP access token',
        list: [
          'Project settings → HTTP access tokens (or Repository settings, for one repository)',
          'Create token, named adapID Code Scanner',
          'Permissions: Project read and Repository read',
          'Expiry: per your policy; rotate it before it expires by saving a new one here',
          'Create, and copy the token at once: Bitbucket shows it only once',
        ],
      },
      {
        title: 'If Bitbucket uses a private certificate authority',
        list: ['Export the CA certificate (PEM, starts with -----BEGIN CERTIFICATE-----) to paste on the Connect tab.'],
      },
    ],
    fields: [{ key: 'url', label: 'Bitbucket address', placeholder: 'https://bitbucket.example.com', hint: 'The address people open in the browser.' }],
    secret: { label: 'HTTP access token', placeholder: 'Paste the token' },
    caCert: true,
    webhook: {
      intro: 'The token is read-only, so the push webhook is created by hand, once per project (or repository).',
      list: [
        'Project settings → Webhooks → Create webhook (or Repository settings for one repository)',
        'Name: adapID Code Scanner',
        'URL and Secret: the two values above',
        'Events: Repository → Push',
        'Test connection (it should say 200), then Save',
      ],
      note: 'Bitbucket signs each delivery with HMAC-SHA256 using the secret; the console refuses anything unsigned.',
      field: 'Secret',
    },
  },

  jenkins: {
    name: 'Jenkins',
    kind: 'CI/CD · credential store',
    minutes: 10,
    summary: 'A read-only Jenkins user shows which credentials Jenkins stores and which pipelines use them: metadata only, never values.',
    reads: ['Overall: Read', 'Job: Read', 'Credentials: View'],
    unlocks: ['Every credential Jenkins stores', 'Which pipelines use which credential, and which none use', 'Builds outside business hours flagged (optional webhook)'],
    prerequisites: ['A Jenkins admin, and the Credentials plugin (standard in most installations).'],
    permissions: {
      columns: ['Jenkins permission', 'Why it is needed'],
      rows: [
        ['Overall: Read', 'See Jenkins and its version'],
        ['Job: Read', 'Read job configurations to see which credentials they use'],
        ['Credentials: View', 'List credential IDs, types and descriptions'],
      ],
      note: 'Nothing to create, change, delete or run. Credential values are never read.',
    },
    steps: [
      { title: 'Create a read-only user', list: ['Manage Jenkins → Users → Create User', 'Username: adapid-reader, with a strong password'] },
      {
        title: 'Give it read-only permissions',
        list: ['Manage Jenkins → Security → Authorization', 'For adapid-reader grant only Overall: Read, Job: Read and Credentials: View'],
      },
      {
        title: 'Generate an API token',
        list: ['Sign in as adapid-reader → its name → Security (or Configure) → API Token → Add new Token', 'Generate, and copy it at once'],
      },
    ],
    fields: [
      { key: 'url', label: 'Jenkins address', placeholder: 'https://jenkins.example.com', hint: 'Include the path if Jenkins runs under one, for example https://ci.example.com/jenkins' },
      { key: 'username', label: 'Username', placeholder: 'adapid-reader' },
    ],
    secret: { label: 'API token', placeholder: 'Paste the API token' },
    caCert: true,
    webhook: {
      intro: 'Optional: send build events here to flag builds outside business hours and first runs of jobs that use stored credentials.',
      list: [
        'Install the Notification plugin (Manage Jenkins → Plugins)',
        'For each job to watch: Configure → Job Notifications → Add Endpoint',
        'Format: JSON · Protocol: HTTP · Event: All Events (or Job Completed)',
        'URL: the address above',
      ],
      note: 'The plugin cannot sign deliveries, so the address itself is the secret. Treat it like a password; generate a new one if it leaks.',
    },
  },
};
