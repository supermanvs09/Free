/*
 * What each application needs from the client, as the documents they paste.
 * AWS is in awsSetup.js (collector, EventBridge forwarding) and the account
 * Remediation tab (NHIPlatformRemediator). The same shape for the others:
 * a read-only identity for discovery, an activity feed, and - for One-click -
 * a separate, narrowly scoped remediation identity.
 */

const PLATFORM_ACCOUNT = '458854656380';

export const REQUIRED_ACCESS = {
  azure: {
    intro:
      'Read-only discovery through an app registration in your tenant, signed in without a secret (federated with adapID’s AWS role), plus your Activity and sign-in logs streamed to an Event Hub. One-click uses a second, narrowly scoped identity.',
    steps: [
      'Entra ID → App registrations → New registration: adapid-nhi-collector (single tenant).',
      'Certificates & secrets → Federated credentials → Add: "Other issuer", issuer https://cognito-identity.amazonaws.com, subject = the value shown in the connection form. No client secret is created.',
      'API permissions → Microsoft Graph → Application permissions (below) → Grant admin consent.',
      'Subscriptions → Access control (IAM) → Add role assignment: the custom role NHIPlatformCollector (below) to the app, on every subscription to read.',
      'Monitor → Diagnostic settings: stream Activity Log (Administrative, Security, Policy) and Entra ID sign-in logs (ServicePrincipalSignInLogs, ManagedIdentitySignInLogs, AuditLogs) to the Event Hub nhi-activity; give the app "Azure Event Hubs Data Receiver" on that hub.',
    ],
    policies: [
      {
        key: 'graph',
        title: 'Microsoft Graph application permissions (admin consent)',
        note: 'Read only. Directory and application objects, their credentials and owners, and the sign-in and audit logs.',
        document: {
          requiredResourceAccess: [
            {
              resourceAppId: '00000003-0000-0000-c000-000000000000',
              resourceAccess: [
                { name: 'Application.Read.All', type: 'Role' },
                { name: 'Directory.Read.All', type: 'Role' },
                { name: 'AuditLog.Read.All', type: 'Role' },
                { name: 'Policy.Read.All', type: 'Role' },
                { name: 'RoleManagement.Read.Directory', type: 'Role' },
              ],
            },
          ],
        },
      },
      {
        key: 'collector',
        title: 'Custom role NHIPlatformCollector (read-only, per subscription)',
        note: 'Narrower than Reader: identities, role assignments, Key Vault metadata (never secret values), compute that runs as an identity, and diagnostic settings.',
        document: {
          Name: 'NHIPlatformCollector',
          IsCustom: true,
          Description: 'adapID NHI discovery: read identities, their access and where they run. No data-plane access.',
          Actions: [
            'Microsoft.Authorization/roleAssignments/read',
            'Microsoft.Authorization/roleDefinitions/read',
            'Microsoft.ManagedIdentity/userAssignedIdentities/read',
            'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials/read',
            'Microsoft.KeyVault/vaults/read',
            'Microsoft.KeyVault/vaults/accessPolicies/read',
            'Microsoft.Web/sites/read',
            'Microsoft.Web/sites/config/read',
            'Microsoft.ContainerService/managedClusters/read',
            'Microsoft.Compute/virtualMachines/read',
            'Microsoft.Storage/storageAccounts/read',
            'Microsoft.Sql/servers/read',
            'Microsoft.Insights/diagnosticSettings/read',
            'Microsoft.Insights/eventtypes/values/read',
            'Microsoft.Resources/subscriptions/resourceGroups/read',
          ],
          NotActions: [],
          DataActions: [],
          NotDataActions: [],
          AssignableScopes: ['/subscriptions/<SUBSCRIPTION_ID>'],
        },
      },
      {
        key: 'eventhub',
        title: 'Diagnostic setting: Activity Log and sign-ins to Event Hub',
        note: 'Create once per subscription (Activity Log) and once in Entra ID (sign-in logs). The collector reads the hub with "Azure Event Hubs Data Receiver".',
        document: {
          name: 'adapid-nhi-activity',
          properties: {
            eventHubAuthorizationRuleId: '/subscriptions/<SUBSCRIPTION_ID>/resourceGroups/rg-nhi/providers/Microsoft.EventHub/namespaces/<NAMESPACE>/authorizationRules/RootManageSharedAccessKey',
            eventHubName: 'nhi-activity',
            logs: [
              { category: 'Administrative', enabled: true },
              { category: 'Security', enabled: true },
              { category: 'Policy', enabled: true },
              { category: 'ServicePrincipalSignInLogs', enabled: true },
              { category: 'ManagedIdentitySignInLogs', enabled: true },
              { category: 'AuditLogs', enabled: true },
            ],
          },
        },
      },
      {
        key: 'remediator',
        title: 'Custom role NHIPlatformRemediator (One-click only)',
        note: 'Assigned to a second app registration, adapid-nhi-remediator, on the same subscriptions; it may remove role assignments and rotate Key Vault secrets, nothing else. Plus Graph Application.ReadWrite.OwnedBy to remove expired client secrets from apps it owns.',
        document: {
          Name: 'NHIPlatformRemediator',
          IsCustom: true,
          Description: 'adapID One-click: narrow fixes on identities, applied only after approval.',
          Actions: [
            'Microsoft.Authorization/roleAssignments/read',
            'Microsoft.Authorization/roleAssignments/delete',
            'Microsoft.Authorization/roleAssignments/write',
            'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials/write',
            'Microsoft.KeyVault/vaults/read',
            'Microsoft.KeyVault/vaults/accessPolicies/write',
          ],
          NotActions: ['Microsoft.Authorization/*/Delete'],
          DataActions: ['Microsoft.KeyVault/vaults/secrets/setSecret/action'],
          NotDataActions: [],
          AssignableScopes: ['/subscriptions/<SUBSCRIPTION_ID>'],
        },
      },
      {
        key: 'federation',
        title: 'Federated credential (no client secret)',
        note: `Both app registrations trust adapID's AWS roles in account ${PLATFORM_ACCOUNT} through workload identity federation, so no secret is ever created or stored.`,
        document: {
          name: 'adapid-platform',
          issuer: 'https://cognito-identity.amazonaws.com',
          subject: '<value shown in the connection form>',
          audiences: ['api://AzureADTokenExchange'],
          description: `adapID platform (AWS ${PLATFORM_ACCOUNT})`,
        },
      },
    ],
  },
  vault: {
    intro:
      'An AppRole for adapID with a read-only Vault policy: it sees auth methods, roles, policies, lease metadata and secret metadata - never a secret value - and the audit device streams every login and read.',
    steps: [
      'vault policy write adapid-nhi-read adapid-nhi-read.hcl (the policy below).',
      'vault write auth/approle/role/adapid-nhi token_policies=adapid-nhi-read token_ttl=1h token_max_ttl=4h secret_id_ttl=24h secret_id_num_uses=0',
      'Enter the role_id and a secret_id in the connection form; the secret_id is kept in the platform’s secret store, not in the console.',
      'vault audit enable -path=adapid socket address=<collector address>:9090 socket_type=tcp (or forward your existing audit log).',
    ],
    policies: [
      {
        key: 'hcl',
        title: 'Vault policy adapid-nhi-read (HCL)',
        note: 'metadata/ paths only: the collector can list which secrets exist and when they changed, but cannot read a value.',
        document: `# Auth methods, their roles and who can log in
path "sys/auth" { capabilities = ["read"] }
path "auth/+/role" { capabilities = ["list"] }
path "auth/+/role/*" { capabilities = ["read"] }

# Policies, and what each one allows
path "sys/policies/acl" { capabilities = ["list"] }
path "sys/policies/acl/*" { capabilities = ["read"] }

# Entities, groups and aliases
path "identity/entity/id" { capabilities = ["list"] }
path "identity/entity/id/*" { capabilities = ["read"] }
path "identity/group/id" { capabilities = ["list"] }

# Secret metadata (never values) and leases
path "secret/metadata/*" { capabilities = ["list", "read"] }
path "sys/leases/lookup/*" { capabilities = ["list"] }

# Mounts and the audit devices in place
path "sys/mounts" { capabilities = ["read"] }
path "sys/audit" { capabilities = ["read", "sudo"] }`,
      },
    ],
  },
  jenkins: {
    intro:
      'A dedicated service user with read-only permissions, signed in with an API token, plus the Audit Trail plugin forwarding job and credential events.',
    steps: [
      'Manage Jenkins → Users → Create user adapid-nhi; Manage Jenkins → Security → give it only the permissions below (Matrix or Role-based strategy).',
      'As adapid-nhi: Configure → API Token → Add new token; enter it in the connection form.',
      'Install the Audit Trail plugin; Manage Jenkins → System → Audit Trail → add a Syslog or HTTP logger to the collector address.',
    ],
    policies: [
      {
        key: 'matrix',
        title: 'Role adapid-nhi (Role-based Authorization Strategy)',
        note: 'Credentials/View lists credential IDs and where they are bound, never the secret values.',
        document: {
          role: 'adapid-nhi',
          pattern: '.*',
          permissions: ['Overall/Read', 'Job/Read', 'Job/ExtendedRead', 'Agent/ExtendedRead', 'View/Read', 'Credentials/View', 'Run/Artifacts'],
          assigned_to: ['adapid-nhi'],
        },
      },
    ],
  },
  jira: {
    intro: 'A bot account that creates and updates issues for findings and remediation plans in one project, assigned to each identity’s owner.',
    steps: [
      'Create the account nhi-bot@deepalgorithms.ai and an API token at id.atlassian.com → Security → API tokens.',
      'Project settings → People: add nhi-bot to project NHI with the permissions below (a custom role "NHI automation").',
      'Enter the site, e-mail, token and project key in the connection form.',
    ],
    policies: [
      {
        key: 'project',
        title: 'Project role "NHI automation" (permission scheme)',
        note: 'Only what an automation needs to open, assign and progress its own issues.',
        document: {
          project: 'NHI',
          role: 'NHI automation',
          permissions: ['BROWSE_PROJECTS', 'CREATE_ISSUES', 'EDIT_ISSUES', 'ASSIGN_ISSUES', 'ASSIGNABLE_USER', 'TRANSITION_ISSUES', 'ADD_COMMENTS', 'LINK_ISSUES'],
        },
      },
    ],
  },
};
