/**
 * The AWS connection, as data: the documents the client pastes and the
 * checks the API runs. Every value comes from `GET /api/v1/integrations/aws`,
 * so what the page tells the client to type is exactly what the API verifies.
 */

export const AWS_CONSOLE = {
  cloudTrail: 'https://console.aws.amazon.com/cloudtrailv2/home#/trails',
  iamRoles: 'https://console.aws.amazon.com/iam/home#/roles',
  eventBridgeRules: 'https://console.aws.amazon.com/events/home#/rules',
  secretsManager: 'https://console.aws.amazon.com/secretsmanager/listsecrets',
  codeCommit: 'https://console.aws.amazon.com/codesuite/codecommit/repositories',
};

export const GITHUB_NEW_TOKEN = 'https://github.com/settings/personal-access-tokens/new';

/** The trust policy for "Edit trust relationship", as an alternative to the clicks. */
export function trustPolicyJson(setup) {
  return JSON.stringify(
    {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'AllowAdapIDAssume',
          Effect: 'Allow',
          Principal: { AWS: setup.assumerRoleArn },
          Action: 'sts:AssumeRole',
          Condition: { StringEquals: { 'sts:ExternalId': setup.externalId } },
        },
      ],
    },
    null,
    2,
  );
}

/** The event sources of the rule; aws.codecommit only with code scanning. */
export function eventSourcesFor(setup, { codeScanning = true } = {}) {
  return setup.eventSources.filter((source) => codeScanning || source !== 'aws.codecommit');
}

/** The EventBridge rule's custom event pattern. */
export function eventPatternJson(setup, options) {
  /* Four sources to a line: the same JSON as JSON.stringify, laid out to be
     read at a glance rather than one value per line. */
  const quoted = eventSourcesFor(setup, options).map((source) => JSON.stringify(source));
  const lines = [];
  for (let i = 0; i < quoted.length; i += 4) lines.push(quoted.slice(i, i + 4).join(', '));
  return `{\n  "source": [\n    ${lines.join(',\n    ')}\n  ]\n}`;
}

/** Optional inline policy NHIPlatformTrailRead: read the trail's log history in S3. */
export function trailReadPolicyJson({ bucket, kmsKeyArn, region, encrypted = true } = {}) {
  const name = String(bucket ?? '').trim() || '<TRAIL_BUCKET_NAME>';
  const statements = [
    {
      Sid: 'ReadTrailLogs',
      Effect: 'Allow',
      Action: ['s3:GetObject', 's3:ListBucket'],
      Resource: [`arn:aws:s3:::${name}`, `arn:aws:s3:::${name}/AWSLogs/*`],
    },
  ];
  if (encrypted) {
    statements.push({
      Sid: 'DecryptTrailLogs',
      Effect: 'Allow',
      Action: 'kms:Decrypt',
      Resource: String(kmsKeyArn ?? '').trim() || '<TRAIL_KMS_KEY_ARN>',
      Condition: { StringEquals: { 'kms:ViaService': `s3.${String(region ?? '').trim() || '<REGION>'}.amazonaws.com` } },
    });
  }
  return JSON.stringify({ Version: '2012-10-17', Statement: statements }, null, 2);
}

/** The CodeCommit reads code scanning needs (NHIPlatformCodeCommitRead). */
export const CODECOMMIT_READ_ACTIONS = [
  'codecommit:GitPull',
  'codecommit:ListRepositories',
  'codecommit:GetRepository',
  'codecommit:BatchGetRepositories',
  'codecommit:ListBranches',
  'codecommit:GetBranch',
  'codecommit:GetReferences',
  'codecommit:GetFile',
  'codecommit:GetFolder',
  'codecommit:GetBlob',
  'codecommit:GetCommit',
  'codecommit:BatchGetCommits',
  'codecommit:GetDifferences',
];

/** Optional inline policy NHIPlatformCodeCommitRead, for code scanning. */
export function codeCommitReadPolicyJson({ customerKey = true } = {}) {
  const statements = [{ Sid: 'CodeCommitReadOnly', Effect: 'Allow', Action: CODECOMMIT_READ_ACTIONS, Resource: '*' }];
  if (customerKey) {
    statements.push({
      Sid: 'CodeCommitKMSDecrypt',
      Effect: 'Allow',
      Action: ['kms:Decrypt', 'kms:DescribeKey'],
      Resource: '*',
      Condition: { StringLike: { 'kms:ViaService': 'codecommit.*.amazonaws.com' } },
    });
  }
  return JSON.stringify({ Version: '2012-10-17', Statement: statements }, null, 2);
}

/** Trust policy of the forwarding role: EventBridge, from the client's own account only. */
export function forwardRoleTrustJson(clientAccountId) {
  return JSON.stringify(
    {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { Service: 'events.amazonaws.com' },
          Action: 'sts:AssumeRole',
          Condition: { StringEquals: { 'aws:SourceAccount': clientAccountId || '<CLIENT_ACCOUNT_ID>' } },
        },
      ],
    },
    null,
    2,
  );
}

/** Inline policy on the forwarding role: put events on our bus, nothing else. */
export const FORWARD_POLICY_NAME = 'NHIForwardToAdapID';
const forwardPolicy = (setup) => ({
  Version: '2012-10-17',
  Statement: [{ Effect: 'Allow', Action: 'events:PutEvents', Resource: setup.eventBusArn }],
});
export const forwardRolePolicyJson = (setup) => JSON.stringify(forwardPolicy(setup), null, 2);

/** The regions the rule must exist in: the chosen ones, plus us-east-1 for IAM and STS. */
export function ruleRegions(regions = []) {
  const list = [...new Set(regions.filter(Boolean))];
  if (!list.includes('us-east-1')) list.push('us-east-1');
  return list;
}

/** The forwarding role from a terminal signed in to the client's account. */
export function forwardRoleCli(setup) {
  return [
    'ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)',
    '# $ACCOUNT_ID is filled in by the shell (the heredoc is unquoted).',
    'cat > nhi-forward-trust.json <<EOF',
    forwardRoleTrustJson('$ACCOUNT_ID'),
    'EOF',
    `aws iam create-role --role-name ${setup.forwardRoleName} \\`,
    '  --assume-role-policy-document file://nhi-forward-trust.json',
    `aws iam put-role-policy --role-name ${setup.forwardRoleName} \\`,
    `  --policy-name ${FORWARD_POLICY_NAME} \\`,
    `  --policy-document '${JSON.stringify(forwardPolicy(setup))}'`,
  ].join('\n');
}

/** The rule and its target in every region, from a terminal. */
export function ruleCli(setup, regions = [], options) {
  const pattern = JSON.stringify({ source: eventSourcesFor(setup, options) });
  return [
    'ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)',
    `for REGION in ${ruleRegions(regions).join(' ')}; do`,
    '  aws events put-rule --region "$REGION" \\',
    `    --name ${setup.ruleName} --event-bus-name default \\`,
    `    --event-pattern '${pattern}'`,
    '  aws events put-targets --region "$REGION" \\',
    `    --rule ${setup.ruleName} --event-bus-name default \\`,
    `    --targets "Id=adapid,Arn=${setup.eventBusArn},RoleArn=arn:aws:iam::$ACCOUNT_ID:role/${setup.forwardRoleName}"`,
    'done',
  ].join('\n');
}

/** What a pasted role ARN should look like, with the client's account left open. */
export function exampleRoleArn(setup) {
  return `arn:aws:iam::<your-account-id>:role/${setup?.roleName || 'NHIPlatformCollector'}`;
}

const ROLE_ARN = /^arn:aws:iam::(\d{12}):role\/(?:[\x21-\x7E]+\/)?([\w+=,.@-]{1,64})$/;
const OTHER_IAM = /^arn:aws[\w-]*:iam::\d{12}:(user|group|policy|instance-profile|oidc-provider|saml-provider)\//;

/**
 * Checks a pasted role ARN before it is sent, with the same rules as the API
 * (`internal/awsconnect/arn.go`), so the common slips are caught as they are
 * typed. Returns '' when it looks right. The API checks again.
 */
export function roleArnProblem(value, platformAccountId) {
  const arn = String(value ?? '').trim();
  if (!arn) return 'Paste the ARN of the role you created.';
  const other = OTHER_IAM.exec(arn);
  if (other) return `That is an IAM ${other[1].replace('-', ' ')} ARN. Paste the role's ARN - it contains ":role/".`;
  const match = ROLE_ARN.exec(arn);
  if (!match) {
    if (arn.startsWith('arn:aws-')) return 'Only accounts in the standard AWS partition can be connected.';
    return 'That is not a role ARN. It looks like arn:aws:iam::123456789012:role/RoleName.';
  }
  if (platformAccountId && match[1] === platformAccountId) {
    return `That ARN is in our account (${platformAccountId}). Paste the ARN of the role you created in your own AWS account.`;
  }
  return '';
}

/** The account id inside a role ARN, or ''. */
export function accountOfRoleArn(value) {
  return ROLE_ARN.exec(String(value ?? '').trim())?.[1] ?? '';
}

/** The role's name (without its path) from a role ARN, or ''. */
export function roleNameOfArn(value) {
  return ROLE_ARN.exec(String(value ?? '').trim())?.[2] ?? '';
}

/**
 * The three connection checks, in the order the API runs them, and the setup
 * step that fixes each one - so a failed check can open the step it points at.
 */
export const AWS_CHECKS = [
  { key: 'assume_role', label: 'The role can be assumed', step: 2, proves: 'sts:AssumeRole with your External ID' },
  { key: 'read_access', label: 'Your configuration is readable', step: 2, proves: 'One read with SecurityAudit and ViewOnlyAccess' },
  { key: 'events', label: 'Events arrive from your account', step: 4, proves: 'An event from at least one of your regions' },
];

/** Workspace-level state, from `status` on the integration. */
export const AWS_STATUS = {
  not_connected: { label: 'Not connected', tone: 'neutral' },
  pending_approval: { label: 'Waiting for approval', tone: 'info' },
  action_needed: { label: 'Needs attention', tone: 'medium' },
  connected: { label: 'Connected', tone: 'low' },
};

/** One account's state, from `account_status`. */
export const ACCOUNT_STATUS = {
  pending: { label: 'Setting up', tone: 'info' },
  pending_approval: { label: 'Waiting for approval', tone: 'info' },
  rejected: { label: 'Not approved', tone: 'critical' },
  action_needed: { label: 'Needs attention', tone: 'medium' },
  connected: { label: 'Connected', tone: 'low' },
};

/** The events check of a run, and whether it is still watching for events. */
export const eventsCheckOf = (checks) => (checks ?? []).find((check) => check.key === 'events') ?? null;
export const isWatching = (checks) => eventsCheckOf(checks)?.state === 'running';

/**
 * The whole setup as Markdown, with this workspace's values filled in - for
 * the common case where the admin connecting the account is not the person
 * with access to that AWS account.
 */
export function setupGuideMarkdown(setup, regions = [], { codeScanning = true } = {}) {
  const fence = '```';
  const ruleList = ruleRegions(regions);
  return `# Connect AWS to the adapID NHI console

Four read-only changes in the AWS account you want to connect, then one check from the console. About 20 minutes.

| Value | |
|---|---|
| adapID AWS account ID | \`${setup.accountId}\` |
| Your unique External ID | \`${setup.externalId}\` (unique to this workspace; keep it within your team) |
| adapID event bus ARN | \`${setup.eventBusArn}\` |
| adapID AWS Region | \`${setup.region}\` |

Also have ready the list of AWS regions you use.

## Step 1 - CloudTrail trail

CloudTrail records the API activity that EventBridge forwards. **Reuse an existing trail** if one is multi-region and logs both Read and Write management events (an organization trail also qualifies): the first copy of management events per region is free, extra trails logging the same events are charged.

Only if no qualifying trail exists:

1. CloudTrail → Trails → **Create trail**. Trail name: \`${setup.trailName}\`.
2. Storage location: create a new S3 bucket (accept the suggested name). Log file validation: enabled. SSE-KMS encryption is optional. **Next**.
3. Event type: **Management events**; API activity: **Read** and **Write**. Leave data events and Insights off. **Next** → **Create trail**.
4. Open the trail and confirm **Multi-region trail: Yes**.

## Step 2 - IAM role ${setup.roleName}

1. IAM → Roles → **Create role** → **Custom trust policy**, paste the trust policy below. **Next**.
2. Tick ${setup.managedPolicies.map((policy) => `**${policy}**`).join(' and ')}. **Next**.
3. Role name: \`${setup.roleName}\` → **Create role**.
4. Optional: role → **Add permissions** → **Create inline policy** → JSON, and paste a policy below. Repeat for each one you need.
5. Copy the role **ARN**.

Trust policy:

${fence}json
${trustPolicyJson(setup)}
${fence}

Optional - **NHIPlatformTrailRead** (CloudTrail log history). Drop DecryptTrailLogs if the trail isn't encrypted with SSE-KMS:

${fence}json
${trailReadPolicyJson()}
${fence}

Optional - **NHIPlatformCodeCommitRead** (code scanning). Drop CodeCommitKMSDecrypt if repositories use the default AWS-managed key:

${fence}json
${codeCommitReadPolicyJson()}
${fence}

## Step 3 - EventBridge forwarding role ${setup.forwardRoleName}

This role lets EventBridge send events to adapID's event bus. Create it once; the rule in every region uses it.

1. IAM → Roles → **Create role** → **Custom trust policy**, paste (with this account's ID in place of \`<CLIENT_ACCOUNT_ID>\`):

${fence}json
${forwardRoleTrustJson()}
${fence}

2. **Next**, skip attaching policies, **Next**. Role name: \`${setup.forwardRoleName}\` → **Create role**.
3. Role → **Add permissions** → **Create inline policy** → JSON, paste, and name it \`${FORWARD_POLICY_NAME}\`:

${fence}json
${forwardRolePolicyJson(setup)}
${fence}

## Step 4 - EventBridge rule ${setup.ruleName} (default event bus)

Create this rule in each of these regions: ${ruleList.map((code) => `\`${code}\``).join(', ')}. us-east-1 is always needed: IAM and STS global events are delivered there.

1. Switch the console to the region → EventBridge → Rules → **Create rule**.
2. Name: \`${setup.ruleName}\`. Event bus: **default**. **Next**.
3. Event source: **AWS events**. Creation method: **Custom pattern (JSON editor)**. Paste:

${fence}json
${eventPatternJson(setup, { codeScanning })}
${fence}

4. **Next**. Target type: **EventBridge event bus** → **Event bus in a different account or Region** → \`${setup.eventBusArn}\`.
5. Execution role: **Use existing role** → \`${setup.forwardRoleName}\`. **Next** → **Create rule**.
${codeScanning ? '\nRemove `aws.codecommit` from the pattern if you are not using code scanning.\n' : ''}
## Step 5 - Verify

In the console's Integrations page, paste the role ARN, choose the regions${regions.length ? ` (${regions.join(', ')})` : ''} and choose **Verify connection**. It confirms:

- the role can be assumed
- your configuration is readable
- events are arriving from at least one of the chosen regions

When all checks pass, adapID reviews the new connection; once approved it shows as **Connected** and scanning begins.
`;
}

/** The setup steps: what each produces and roughly how long it takes. */
export const SETUP_STEPS = [
  { number: 1, title: 'Check for a CloudTrail trail', where: 'CloudTrail console', minutes: 3 },
  { number: 2, title: `Create the read-only role`, where: 'IAM console', minutes: 4 },
  { number: 3, title: 'Create the forwarding role', where: 'IAM console', minutes: 3 },
  { number: 4, title: 'Forward events from each region', where: 'EventBridge console', minutes: 6 },
  { number: 5, title: 'Verify the connection', where: 'This page', minutes: 2 },
];
/** The steps done in the AWS console, which the admin marks as done. */
export const MANUAL_STEPS = [1, 2, 3, 4];

/* ── Exposed credentials ────────────────────────────────────────────────── */

/** The checks the API runs when a platform is switched on, per platform. */
export const EXPOSURE_CHECKS = {
  codecommit: [
    { key: 'codecommit_list', label: 'List your repositories', proves: 'codecommit:ListRepositories in your regions' },
    { key: 'codecommit_read', label: 'Read repository contents', proves: 'codecommit:GetFolder on one repository' },
  ],
  github: [
    { key: 'github_secret', label: 'Read the token secret', proves: 'secretsmanager:GetSecretValue with the role' },
    { key: 'github_token', label: 'GitHub accepts the token', proves: 'Lists repositories and reads one' },
  ],
};

export const EXPOSURE_PLATFORMS = {
  github: { key: 'github', name: 'GitHub', summary: 'Repositories a read-only GitHub token can see.' },
  codecommit: { key: 'codecommit', name: 'AWS CodeCommit', summary: 'Repositories in this AWS account, in the regions it reads.' },
};

const SECRET_ARN = /^arn:(aws[a-z-]*):secretsmanager:([a-z]{2}(-[a-z]+)+-\d):(\d{12}):secret:([A-Za-z0-9/_+=.@-]{1,512})$/;

/**
 * Checks a pasted secret ARN with the API's rules
 * (`awsconnect.ParseSecretARN`), so a slip is named before the round trip.
 */
export function secretArnProblem(value, accountId, prefix) {
  const arn = String(value ?? '').trim();
  if (!arn) return 'Paste the ARN of the secret that holds your GitHub token.';
  const match = SECRET_ARN.exec(arn);
  if (!match) {
    if (/^arn:aws[\w-]*:secretsmanager:/.test(arn) && !arn.includes(':secret:')) {
      return 'That is not a secret ARN. Copy the "Secret ARN" from the secret\'s page.';
    }
    return 'That is not a Secrets Manager secret ARN. It looks like arn:aws:secretsmanager:<region>:<account>:secret:<name>.';
  }
  if (accountId && match[4] !== accountId) {
    return `The secret is in account ${match[4]}; store it in ${accountId}, the account this role belongs to.`;
  }
  if (prefix && !match[5].startsWith(prefix)) {
    return `Name the secret starting with ${prefix} - the read permission is limited to that name.`;
  }
  return '';
}

/** The secret name the setup suggests. */
export const suggestedSecretName = (prefix) => `${prefix || 'nhi/github'}/token`;

/**
 * Inline policy with the four CodeCommit reads the secret scanner uses. The
 * resources are the repositories of the regions the account reads (one ARN
 * pattern per region); narrow them to named repositories to grant less.
 */
export function codeCommitPolicyJson(setup, accountId, regions = []) {
  const list = regions.length > 0 ? regions : [setup.region || '<region>'];
  return JSON.stringify(
    {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'SecretScannerReadCode',
          Effect: 'Allow',
          Action: setup.exposure.codecommit.actions,
          Resource: list.map((region) => `arn:aws:codecommit:${region}:${accountId}:*`),
        },
      ],
    },
    null,
    2,
  );
}

/**
 * Inline policy letting the role read only the token secret. The resource is
 * the name prefix rather than one ARN, so replacing the secret later keeps
 * working.
 */
export function githubSecretPolicyJson(setup, accountId) {
  return JSON.stringify(
    {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'NHIExposedCredentialsGitHubToken',
          Effect: 'Allow',
          Action: setup.exposure.github.actions,
          Resource: `arn:aws:secretsmanager:*:${accountId}:secret:${setup.exposure.github.secretPrefix}*`,
        },
      ],
    },
    null,
    2,
  );
}

/** Only when the secret is encrypted with a customer managed KMS key. */
export function kmsDecryptPolicyJson(accountId) {
  return JSON.stringify(
    {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'NHIExposedCredentialsDecryptToken',
          Effect: 'Allow',
          Action: 'kms:Decrypt',
          Resource: `arn:aws:kms:<region>:${accountId}:key/<key-id>`,
          Condition: { StringLike: { 'kms:ViaService': 'secretsmanager.*.amazonaws.com' } },
        },
      ],
    },
    null,
    2,
  );
}

/** Save the policy above as codecommit-read.json, then add it to the role. */
export function codeCommitCli(roleName) {
  return `aws iam put-role-policy \\
  --role-name ${roleName} \\
  --policy-name SecretScannerReadCode \\
  --policy-document file://codecommit-read.json`;
}

/**
 * Store the token and grant the read, from a terminal signed in to the
 * client's account. `read -s` keeps the token out of shell history and off
 * the screen.
 */
export function githubCli(setup, accountId, roleName, region) {
  const name = suggestedSecretName(setup.exposure.github.secretPrefix);
  return `# 1. Store the token (typed, not echoed, not kept in history)
read -rs GITHUB_TOKEN
aws secretsmanager create-secret \\
  --region ${region} \\
  --name ${name} \\
  --secret-string "$GITHUB_TOKEN" \\
  --query ARN --output text
unset GITHUB_TOKEN

# 2. Let the role read only that secret
cat > nhi-github-secret-read.json <<'EOF'
${githubSecretPolicyJson(setup, accountId)}
EOF
aws iam put-role-policy \\
  --role-name ${roleName} \\
  --policy-name nhi-github-secret-read \\
  --policy-document file://nhi-github-secret-read.json`;
}
