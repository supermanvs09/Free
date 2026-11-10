/**
 * Setup guides for code scanning (GitHub App, Bitbucket Data Center) and
 * CI/CD (Jenkins), as data. The steps are what the customer does in their own
 * tools; the values only adapID can give (the GitHub App's install link, a
 * workspace's webhook URL and secret) are shown when this deployment has them
 * and otherwise said to come from adapID, never invented.
 */

/* Set in the console's build when the GitHub App is published. */
export const GITHUB_APP_INSTALL_URL = import.meta.env.VITE_GITHUB_APP_INSTALL_URL || '';

export const GUIDES = {
  github: {
    key: 'github',
    name: 'GitHub',
    kind: 'Code scanning · GitHub App',
    summary:
      'Install the adapID AI CIRM GitHub App. No personal access tokens or passwords: the App reads code, and GitHub tells us about every push.',
    intro:
      'adapID AI CIRM integrates with GitHub through a GitHub App, the standard way for platforms to connect. No personal access tokens or passwords are involved.',
    permissions: {
      columns: ['Permission', 'Level', 'What it allows', 'Why we need it'],
      rows: [
        ['Contents', 'Read-only', 'Read file contents and browse the repository tree', 'Clone and scan repository code'],
        ['Metadata', 'Read-only (mandatory)', 'List the repositories the installation can access', 'Discover the repositories in your organisation'],
      ],
      note: 'No write access to code, issues, pull requests or settings is requested.',
    },
    events: { columns: ['Webhook event', 'What it triggers'], rows: [['push', 'A scan on every code push']] },
    steps: [
      {
        title: 'Install the GitHub App',
        body: 'Open the installation link. GitHub shows every permission listed above for review before an organisation owner approves the installation.',
        action: 'install',
      },
      {
        title: 'Choose the repositories',
        body: 'GitHub asks whether to grant access to all repositories in the organisation or only selected ones.',
        list: ['All repositories in the organisation, or', 'Only selected repositories'],
        note: 'You can change this at any time: GitHub → Organization settings → Installed GitHub Apps → adapID AI CIRM Code Scanner → Configure.',
      },
      {
        title: 'Webhook registered automatically',
        body: 'Once installed, the App registers its webhook on the organisation. Nothing is created or configured by hand.',
        note: 'Every push is delivered as an HMAC-SHA256 signed event. The platform verifies the signature before processing; unsigned or tampered payloads are rejected.',
      },
      {
        title: 'Scanning begins',
        body: 'A full scan of every connected repository runs straight away. After that, each push triggers an incremental scan of the changed files only.',
      },
    ],
    sections: [],
    footnote: 'Source code and full secret values are never stored.',
  },

  bitbucket: {
    key: 'bitbucket',
    name: 'Bitbucket Data Center',
    kind: 'Code scanning · self-hosted',
    summary: 'A read-only HTTP access token for your self-hosted Bitbucket, plus a push webhook so scans follow every change.',
    intro:
      'adapID AI CIRM integrates with a self-hosted Bitbucket Data Center instance using an HTTP access token, the standard authentication method for Data Center integrations.',
    prerequisites: [
      'A Bitbucket Data Center instance with a Data Center licence (required for project- and repository-level tokens).',
      'Your Bitbucket instance reachable from the adapID platform (public URL, VPN or private link).',
    ],
    permissions: {
      columns: ['Token permission', 'What it allows', 'Why we need it'],
      rows: [
        ['Project read', 'Pull and clone the repositories in the project', 'Clone repositories for scanning'],
        ['Repository read', 'Pull and clone individual repositories', 'Clone specific repositories'],
      ],
      note: 'No write or admin permission is required. The token is strictly read-only.',
    },
    sections: [
      {
        title: 'Network connectivity',
        table: {
          columns: ['Option', 'How'],
          rows: [
            ['Public URL with an IP allowlist', 'Expose Bitbucket on a public URL and allowlist adapID’s IP range'],
            ['VPN / private link', 'Site-to-site VPN or AWS PrivateLink between adapID and your network'],
            ['On-premise deployment', 'The adapID platform runs inside your network; no external access is needed'],
          ],
        },
      },
      {
        title: 'Token levels',
        table: {
          columns: ['Token level', 'Scope', 'Best for'],
          rows: [
            ['Project-level token (recommended)', 'Every repository in a project', 'Scanning all repositories in a project with one token'],
            ['Repository-level token', 'One repository', 'Granular control per repository'],
          ],
        },
        note: 'A project-level token with Project read and Repository read covers every repository in that project.',
      },
    ],
    steps: [
      {
        title: 'Create a read-only HTTP access token',
        body: 'In Bitbucket Data Center:',
        list: [
          'Project settings → HTTP access tokens (project token), or Repository settings → HTTP access tokens (repository token)',
          'Create token',
          'Name: adapID AI CIRM',
          'Permissions: Project read + Repository read',
          'Expiry: per your security policy (recommended 30 days, rotated before it expires)',
          'Create, and copy the token straight away - it is shown only once',
        ],
      },
      {
        title: 'Give adapID the connection details',
        body: 'Send through the adapID dashboard:',
        list: [
          'The Bitbucket instance URL (for example https://bitbucket.example.com)',
          'The HTTP access token',
          'If the instance uses a self-signed certificate: the CA certificate, for TLS verification',
        ],
        note: 'The token is stored encrypted and never shown again.',
      },
      {
        title: 'Create the webhook',
        body: 'The token is read-only, so the push webhook is created by hand:',
        list: [
          'Repository settings → Webhooks → Create webhook (or at project level, to cover every repository in the project)',
          'Name: adapID AI CIRM',
          'URL and Secret: the values adapID gives for your workspace once step 2 is done',
          'Events: Repository → Push only',
          'Save',
        ],
        note: 'With a webhook secret Bitbucket signs each payload with HMAC-SHA256; the platform verifies it and rejects unsigned or tampered payloads.',
      },
    ],
    after: [
      {
        title: 'Token rotation',
        list: [
          'Data Center tokens expire on the date set at creation and cannot be extended.',
          'Before expiry, create a new token with the same permissions in Bitbucket.',
          'Update it in the adapID dashboard; the platform switches to it without a gap.',
        ],
        note: 'The dashboard shows the token’s expiry date and warns before it expires.',
      },
      {
        title: 'Check the webhook is active',
        list: ['Repository settings → Webhooks → open the webhook → Recent deliveries, which lists every delivery with its status and response.'],
      },
      {
        title: 'Revoke access',
        list: ['Project or Repository settings → HTTP access tokens → revoke the token. Cloning stops, API calls fail and webhooks stop delivering at once.'],
      },
    ],
    footnote: 'Source code and full secret values are never stored.',
  },

  jenkins: {
    key: 'jenkins',
    name: 'Jenkins',
    kind: 'CI/CD · credential store',
    summary: 'A read-only Jenkins user shows which credentials Jenkins stores and which pipelines use them - metadata only, never values.',
    intro:
      'adapID AI CIRM connects to your Jenkins instance to discover the credentials Jenkins stores internally, adding visibility into Jenkins’ own credential store.',
    already:
      'Without any setup: Jenkins pipelines that run on AWS and call AWS APIs are already discovered, classified as CI/CD identities, baselined and scored.',
    permissions: {
      columns: ['Jenkins permission', 'What it allows', 'Why we need it'],
      rows: [
        ['Overall: Read', 'View Jenkins system information', 'Discover the Jenkins version and configuration'],
        ['Job: Read', 'View pipeline and job configurations', 'See which credentials each pipeline uses'],
        ['Credentials: View', 'View stored credential metadata (ID, type, description)', 'Discover stored secrets, their age and use'],
      ],
      note: 'No permission to create, modify, delete or run anything. Credential values are never read - only metadata (ID, type, description, age).',
    },
    sections: [],
    steps: [
      {
        title: 'Create a read-only service user',
        body: 'In Jenkins:',
        list: ['Manage Jenkins → Users → Create User', 'Username: adapid-reader', 'Set a strong password'],
      },
      {
        title: 'Assign read-only permissions',
        body: 'In Jenkins:',
        list: [
          'Manage Jenkins → Security → Authorization',
          'For adapid-reader grant only: Overall: Read, Job: Read, Credentials: View',
          'Leave everything else unchecked',
        ],
      },
      {
        title: 'Generate an API token',
        body: 'In Jenkins:',
        list: [
          'People → adapid-reader → Configure → API Token',
          'Add new Token, named adapID AI CIRM',
          'Generate, and copy the token straight away - Jenkins shows it only once',
        ],
      },
      {
        title: 'Give adapID the connection details',
        body: 'Send through the adapID dashboard:',
        list: ['The Jenkins URL (for example https://jenkins.example.com)', 'Username: adapid-reader', 'The API token from step 3'],
        note: 'The token is stored encrypted and never shown again.',
      },
      {
        title: 'Verify',
        body: 'The connection is tested: Jenkins reachable, credentials readable and jobs listed. The status reads Connected when every check passes.',
      },
    ],
    after: [
      {
        title: 'Real-time monitoring (optional webhook)',
        list: [
          'Install the Notification plugin (Manage Jenkins → Plugins → search "Notification")',
          'Manage Jenkins → Configure System → Notification Endpoint',
          'URL: the value adapID gives for your workspace',
          'Event: Job Completed · Format: JSON',
        ],
        note: 'This lets the platform spot unusual build times, builds outside business hours, and new pipelines using privileged credentials.',
      },
      {
        title: 'Revoke access',
        list: ['People → adapid-reader → Configure → API Token → Revoke, or delete the adapid-reader user. All access ends at once.'],
      },
    ],
    footnote: null,
  },
};
