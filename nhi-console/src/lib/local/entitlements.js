/*
 * The entitlement model: one source of truth for what every identity can do.
 *
 *   RESOURCES  the resources in each account, subscription, controller and
 *              cluster, with what data they hold
 *   GRANTS     each principal's policy statements (role, user, service
 *              principal, AppRole, job), and which of them it actually uses
 *   LINKS      how identities become other identities: role chaining, a
 *              workload signing in to Vault or Entra ID, a CI server holding
 *              someone's key
 *   ANOMALIES  behaviour that departed from an identity's baseline
 *
 * Permissions, activity, the access graph, blast radius, who-can-assume,
 * posture utilisation and NHI Genome anomalies are all derived from this, so
 * every screen tells the same story.
 *
 * Nothing here reads seed.js at load time (seed.js calls `enrich` once it has
 * built the estate), so the two modules can import each other.
 */

import { credentialDeleted, identityDeleted, identityDisabled, keyDeactivated, keyRotated, linkBroken, madePrivate, responseRev, rightSized, rotationEnabled, scenario, trustPinned } from './response';

const P = '482915736104'; // prod-core
const D = '739204185562'; // data-platform
const S = '215660394871'; // staging
const AZP = 'a3f1c2d4-5b6e-4f70-8a91-b2c3d4e5f607'; // Payments-Prod
const AZD = '7e2d9c18-4a3b-42f1-9d6e-0c5b8a7f3e21'; // Analytics-Dev
const JK = 'ci.deepalgorithms.ai';
const VT = 'vault.deepalgorithms.ai';
const SH = '605218934417'; // shared-services
const R = 'ap-south-1';

/* ── Resources ─────────────────────────────────────────────────────────────
   [key, account, type, name, data class]. Data classes drive how damaging
   reaching a resource is: Secrets > PCI > PII > Financial > Internal > Logs. */
const AWS_TYPES = {
  ddb: ['dynamodb', 'AWS::DynamoDB::Table', (a, n) => `arn:aws:dynamodb:${R}:${a}:table/${n}`],
  s3: ['s3', 'AWS::S3::Bucket', (a, n) => `arn:aws:s3:::${n}`],
  sqs: ['sqs', 'AWS::SQS::Queue', (a, n) => `arn:aws:sqs:${R}:${a}:${n}`],
  sns: ['sns', 'AWS::SNS::Topic', (a, n) => `arn:aws:sns:${R}:${a}:${n}`],
  kms: ['kms', 'AWS::KMS::Key', (a, n) => `arn:aws:kms:${R}:${a}:alias/${n}`],
  rds: ['rds', 'AWS::RDS::DBCluster', (a, n) => `arn:aws:rds:${R}:${a}:cluster:${n}`],
  ecr: ['ecr', 'AWS::ECR::Repository', (a, n) => `arn:aws:ecr:${R}:${a}:repository/${n}`],
  ecs: ['ecs', 'AWS::ECS::Service', (a, n) => `arn:aws:ecs:${R}:${a}:service/payments-prod/${n}`],
  cfn: ['cloudformation', 'AWS::CloudFormation::Stack', (a, n) => `arn:aws:cloudformation:${R}:${a}:stack/${n}`],
  logs: ['logs', 'AWS::Logs::LogGroup', (a, n) => `arn:aws:logs:${R}:${a}:log-group:${n}`],
  kinesis: ['kinesis', 'AWS::Kinesis::Stream', (a, n) => `arn:aws:kinesis:${R}:${a}:stream/${n}`],
  glue: ['glue', 'AWS::Glue::Database', (a, n) => `arn:aws:glue:${R}:${a}:database/${n}`],
  athena: ['athena', 'AWS::Athena::WorkGroup', (a, n) => `arn:aws:athena:${R}:${a}:workgroup/${n}`],
  redshift: ['redshift', 'AWS::Redshift::Cluster', (a, n) => `arn:aws:redshift:${R}:${a}:cluster:${n}`],
  sagemaker: ['sagemaker', 'AWS::SageMaker::FeatureGroup', (a, n) => `arn:aws:sagemaker:${R}:${a}:feature-group/${n}`],
  bedrock: ['bedrock', 'AWS::Bedrock::Model', (a, n) => `arn:aws:bedrock:${R}::foundation-model/${n}`],
  ssm: ['ssm', 'AWS::SSM::Parameter', (a, n) => `arn:aws:ssm:${R}:${a}:parameter/${n}`],
  ec2: ['ec2', 'AWS::EC2::Instance', (a, n) => `arn:aws:ec2:${R}:${a}:instance/${n}`],
  cw: ['cloudwatch', 'AWS::CloudWatch::Metric', (a) => `arn:aws:cloudwatch:${R}:${a}:metric/*`],
};

const AWS_RESOURCES = [
  // prod-core
  ['ddb', P, 'payments-ledger', 'PCI'],
  ['ddb', P, 'card-tokens', 'PCI'],
  ['ddb', P, 'merchant-profiles', 'PII'],
  ['ddb', P, 'orders', 'Financial'],
  ['ddb', P, 'terraform-locks', 'Internal'],
  ['s3', P, 'dpa-payments-receipts', 'PII'],
  ['s3', P, 'dpa-kyc-documents', 'PII'],
  ['s3', P, 'dpa-settlement-files', 'Financial'],
  ['s3', P, 'dpa-finance-exports', 'Financial'],
  ['s3', P, 'dpa-invoices', 'Financial'],
  ['s3', P, 'dpa-terraform-state', 'Secrets'],
  ['s3', P, 'dpa-build-artifacts', 'Internal'],
  ['s3', P, 'dpa-cloudtrail-archive', 'Logs'],
  ['sqs', P, 'settlement-events', 'Financial'],
  ['sqs', P, 'refund-requests', 'Financial'],
  ['sqs', P, 'notification-queue', 'Internal'],
  ['sns', P, 'payment-alerts', 'Internal'],
  ['kms', P, 'payments-cmk', 'Secrets'],
  ['kms', P, 'kyc-cmk', 'Secrets'],
  ['kms', P, 'cards-hsm-wrap', 'Secrets'],
  ['rds', P, 'payments-db', 'PCI'],
  ['ecr', P, 'payments-api', 'Internal'],
  ['ecs', P, 'payments-api', 'Internal'],
  ['cfn', P, 'payments-prod', 'Internal'],
  ['logs', P, '/aws/lambda/payments', 'Logs'],
  ['ssm', P, 'prod/payments/config', 'Internal'],
  ['bedrock', P, 'anthropic.claude-sonnet', 'Internal'],
  ['cw', P, 'metrics', 'Logs'],
  // data-platform
  ['s3', D, 'dpa-data-lake-raw', 'PII'],
  ['s3', D, 'dpa-data-lake-curated', 'PII'],
  ['s3', D, 'dpa-ml-artifacts', 'Internal'],
  ['s3', D, 'dpa-athena-results', 'Internal'],
  ['kinesis', D, 'txn-stream', 'PCI'],
  ['kms', D, 'data-lake-cmk', 'Secrets'],
  ['glue', D, 'analytics', 'PII'],
  ['athena', D, 'reporting', 'Internal'],
  ['redshift', D, 'dpa-warehouse', 'PII'],
  ['sagemaker', D, 'customer-features', 'PII'],
  // staging
  ['ddb', S, 'payments-ledger-staging', 'Internal'],
  ['s3', S, 'dpa-staging-artifacts', 'Internal'],
  ['sqs', S, 'staging-events', 'Internal'],
  ['sns', S, 'sms-outbound', 'PII'],
  // shared-services
  ['s3', SH, 'dpa-org-cloudtrail', 'Logs'],
  ['s3', SH, 'dpa-backup-vault', 'Financial'],
  ['kms', SH, 'org-backup-cmk', 'Secrets'],
  ['ssm', SH, 'org/github-app-private-key', 'Secrets'],
];

const AZ = (sub, rg, path) => `/subscriptions/${sub}/resourceGroups/${rg}/providers/${path}`;
/* [key, scope, service, type, name, arn, data] */
const OTHER_RESOURCES = [
  ['kv:kv-payments-prod', AZP, 'keyvault', 'Azure::KeyVault::Vault', 'kv-payments-prod', AZ(AZP, 'rg-payments-prod', 'Microsoft.KeyVault/vaults/kv-payments-prod'), 'Secrets'],
  ['kv:upi-signing-key', AZP, 'keyvault', 'Azure::KeyVault::Secret', 'kv-payments-prod/upi-signing-key', AZ(AZP, 'rg-payments-prod', 'Microsoft.KeyVault/vaults/kv-payments-prod/secrets/upi-signing-key'), 'Secrets'],
  ['kv:pos-terminal-hmac', AZP, 'keyvault', 'Azure::KeyVault::Secret', 'kv-payments-prod/pos-terminal-hmac', AZ(AZP, 'rg-payments-prod', 'Microsoft.KeyVault/vaults/kv-payments-prod/secrets/pos-terminal-hmac'), 'Secrets'],
  ['st:stpaymentsprod/receipts', AZP, 'storage', 'Azure::Storage::Container', 'stpaymentsprod/receipts', AZ(AZP, 'rg-payments-prod', 'Microsoft.Storage/storageAccounts/stpaymentsprod/blobServices/default/containers/receipts'), 'PII'],
  ['st:stpaymentsprod/settlements', AZP, 'storage', 'Azure::Storage::Container', 'stpaymentsprod/settlements', AZ(AZP, 'rg-payments-prod', 'Microsoft.Storage/storageAccounts/stpaymentsprod/blobServices/default/containers/settlements'), 'Financial'],
  ['sql:sql-payments/merchants', AZP, 'sql', 'Azure::Sql::Database', 'sql-payments/merchants', AZ(AZP, 'rg-payments-prod', 'Microsoft.Sql/servers/sql-payments/databases/merchants'), 'PII'],
  ['aks:aks-payments', AZP, 'aks', 'Azure::ContainerService::ManagedCluster', 'aks-payments', AZ(AZP, 'rg-payments-prod', 'Microsoft.ContainerService/managedClusters/aks-payments'), 'Internal'],
  ['sb:sb-payments/refunds', AZP, 'servicebus', 'Azure::ServiceBus::Queue', 'sb-payments/refunds', AZ(AZP, 'rg-payments-prod', 'Microsoft.ServiceBus/namespaces/sb-payments/queues/refunds'), 'Financial'],
  ['acr:acrpayments', AZP, 'acr', 'Azure::ContainerRegistry::Registry', 'acrpayments', AZ(AZP, 'rg-payments-prod', 'Microsoft.ContainerRegistry/registries/acrpayments'), 'Internal'],
  ['sub:Payments-Prod', AZP, 'authorization', 'Azure::Subscription', 'Payments-Prod subscription', `/subscriptions/${AZP}`, 'Secrets'],
  ['entra:directory', AZP, 'entra', 'Azure::EntraID::Directory', 'Entra ID directory', '/tenants/9c4e1b72-0d3a-4f6b-a8e2-51c7d93f0b14/directory', 'PII'],
  ['st:stanalyticsdev/lake', AZD, 'storage', 'Azure::Storage::Container', 'stanalyticsdev/lake', AZ(AZD, 'rg-analytics-dev', 'Microsoft.Storage/storageAccounts/stanalyticsdev/blobServices/default/containers/lake'), 'PII'],
  ['dbw:dbw-analytics', AZD, 'databricks', 'Azure::Databricks::Workspace', 'dbw-analytics', AZ(AZD, 'rg-analytics-dev', 'Microsoft.Databricks/workspaces/dbw-analytics'), 'Internal'],
  ['syn:syn-analytics', AZD, 'synapse', 'Azure::Synapse::Workspace', 'syn-analytics', AZ(AZD, 'rg-analytics-dev', 'Microsoft.Synapse/workspaces/syn-analytics'), 'PII'],
  ['sql:sql-legacy/reporting', AZD, 'sql', 'Azure::Sql::Database', 'sql-legacy/reporting', AZ(AZD, 'rg-analytics-dev', 'Microsoft.Sql/servers/sql-legacy/databases/reporting'), 'Financial'],
  ['sub:Analytics-Dev', AZD, 'authorization', 'Azure::Subscription', 'Analytics-Dev subscription', `/subscriptions/${AZD}`, 'Internal'],
  // Vault
  ['vault:secret/data/payments', VT, 'vault-kv', 'Vault::KV::Path', 'secret/data/payments/*', `vault://${VT}/secret/data/payments`, 'Secrets'],
  ['vault:secret/data/settlement', VT, 'vault-kv', 'Vault::KV::Path', 'secret/data/settlement/*', `vault://${VT}/secret/data/settlement`, 'Secrets'],
  ['vault:secret/data/fraud', VT, 'vault-kv', 'Vault::KV::Path', 'secret/data/fraud/*', `vault://${VT}/secret/data/fraud`, 'Secrets'],
  ['vault:secret/data/ci', VT, 'vault-kv', 'Vault::KV::Path', 'secret/data/ci/*', `vault://${VT}/secret/data/ci`, 'Secrets'],
  ['vault:transit/keys/payments', VT, 'vault-transit', 'Vault::Transit::Key', 'transit/keys/payments', `vault://${VT}/transit/keys/payments`, 'Secrets'],
  ['vault:database/creds/readonly', VT, 'vault-db', 'Vault::Database::Role', 'database/creds/readonly', `vault://${VT}/database/creds/readonly`, 'PCI'],
  ['vault:database/creds/readwrite', VT, 'vault-db', 'Vault::Database::Role', 'database/creds/readwrite', `vault://${VT}/database/creds/readwrite`, 'PCI'],
  ['vault:sys/policies/acl', VT, 'vault-sys', 'Vault::Sys::Policy', 'sys/policies/acl/*', `vault://${VT}/sys/policies/acl`, 'Secrets'],
  // Jenkins and code
  ['jenkins:payments-api/deploy-prod', JK, 'jenkins', 'Jenkins::Job', 'payments-api/deploy-prod', `jenkins://${JK}/job/payments-api/job/deploy-prod`, 'Internal'],
  ['jenkins:credentials', JK, 'jenkins', 'Jenkins::CredentialStore', 'System credential store', `jenkins://${JK}/credentials/store/system`, 'Secrets'],
  ['repo:payments-api', JK, 'github', 'GitHub::Repository', 'deepalgo-labs/payments-api', 'https://github.com/deepalgo-labs/payments-api', 'Internal'],
  ['repo:mobile-app', JK, 'github', 'GitHub::Repository', 'deepalgo-labs/mobile-app', 'https://github.com/deepalgo-labs/mobile-app', 'Internal'],
  ['repo:infra-terraform', JK, 'github', 'GitHub::Repository', 'deepalgo-labs/infra-terraform', 'https://github.com/deepalgo-labs/infra-terraform', 'Secrets'],
  ['repo:data-pipelines', JK, 'github', 'GitHub::Repository', 'deepalgo-labs/data-pipelines', 'https://github.com/deepalgo-labs/data-pipelines', 'Internal'],
  ['repo:releases', JK, 'github', 'GitHub::Repository', 'deepalgo-labs (all repositories)', 'https://github.com/deepalgo-labs', 'Internal'],
  ['saas:snowflake', JK, 'snowflake', 'SaaS::Snowflake::Warehouse', 'Snowflake ANALYTICS_WH', 'saas://snowflake/dpa.ap-south-1/ANALYTICS_WH', 'PII'],
  ['saas:play-console', JK, 'googleplay', 'SaaS::GooglePlay::App', 'Google Play: in.deepalgo.pay', 'saas://play.google.com/apps/in.deepalgo.pay', 'Internal'],
  ['saas:dockerhub', JK, 'dockerhub', 'SaaS::DockerHub::Repository', 'Docker Hub: deepalgo/*', 'saas://hub.docker.com/deepalgo', 'Internal'],
  ['saas:browserstack', JK, 'browserstack', 'SaaS::BrowserStack::Account', 'BrowserStack automate', 'saas://browserstack.com/automate', 'Internal'],
];

const DATA_SCORE = { Secrets: 9.2, PCI: 8.6, PII: 8, Financial: 7.2, Internal: 4.2, Logs: 2.6 };

let CATALOG = null; // key -> resource
function catalog() {
  if (CATALOG) return CATALOG;
  CATALOG = new Map();
  for (const [kind, account, name, data] of AWS_RESOURCES) {
    const [service, type, arnOf] = AWS_TYPES[kind];
    const key = `${kind}:${name}${account === P ? '' : `@${account}`}`;
    CATALOG.set(key, { key, arn: arnOf(account, name), name, service, type, provider: 'aws', account_id: account, region: R, data, sensitive: ['Secrets', 'PCI', 'PII'].includes(data) });
  }
  for (const [key, scope, service, type, name, arn, data] of OTHER_RESOURCES) {
    const provider = scope === VT ? 'vault' : scope === JK ? 'jenkins' : 'azure';
    CATALOG.set(key, { key, arn, name, service, type, provider, account_id: scope, region: provider === 'azure' ? 'centralindia' : provider === 'vault' ? R : 'on-prem', data, sensitive: ['Secrets', 'PCI', 'PII'].includes(data) });
  }
  return CATALOG;
}

/* ── Grants ────────────────────────────────────────────────────────────────
   Keyed by principal: the role a workload runs as (shared roles once), the
   IAM user, the service principal, the AppRole, the job.
   Each grant: [actions, resource, flags, seen?]
     resource  a catalog key; 'sec:<name>' a Secrets Manager secret,
               'fn:<name>' a Lambda function, '*' every resource in the
               account, 'svc:<service>' every resource of that service there
     flags     'u' used (appears in its activity), '' allowed but never used
     seen      for a wildcard grant that is used: what it was used on        */
const ADMIN = (seen) => ['*', '*', 'u', seen];

const GRANTS = {
  /* prod-core: payments workloads */
  'payments-lambda-exec': [
    ['dynamodb:GetItem,dynamodb:PutItem,dynamodb:UpdateItem,dynamodb:Query', 'ddb:payments-ledger', 'u'],
    ['sqs:SendMessage', 'sqs:settlement-events', 'u'],
    ['sqs:SendMessage', 'sqs:refund-requests', 'u'],
    ['secretsmanager:GetSecretValue', 'sec:prod/payments/npci-api-key', 'u'],
    ['kms:Decrypt', 'kms:payments-cmk', 'u'],
    ['s3:PutObject', 's3:dpa-payments-receipts', 'u'],
    ['logs:CreateLogStream,logs:PutLogEvents', 'logs:/aws/lambda/payments', 'u'],
    ['dynamodb:*', 'svc:dynamodb', ''],
  ],
  'settlement-batch-worker': [
    ['dynamodb:Query,dynamodb:GetItem', 'ddb:payments-ledger', 'u'],
    ['sqs:ReceiveMessage,sqs:DeleteMessage', 'sqs:settlement-events', 'u'],
    ['s3:PutObject,s3:GetObject', 's3:dpa-settlement-files', 'u'],
    ['secretsmanager:GetSecretValue', 'sec:prod/settlement/bank-sftp', 'u'],
    ['kms:Decrypt', 'kms:payments-cmk', 'u'],
    ['sns:Publish', 'sns:payment-alerts', ''],
  ],
  'kyc-document-verifier': [
    ['s3:GetObject', 's3:dpa-kyc-documents', 'u'],
    ['kms:Decrypt', 'kms:kyc-cmk', 'u'],
    ['secretsmanager:GetSecretValue', 'sec:prod/kyc/digilocker-client', 'u'],
    ['dynamodb:UpdateItem', 'ddb:merchant-profiles', 'u'],
  ],
  'fraud-scoring-api': [
    ['dynamodb:GetItem,dynamodb:Query', 'ddb:payments-ledger', 'u'],
    ['dynamodb:GetItem', 'ddb:merchant-profiles', 'u'],
    ['sagemaker:GetRecord', `sagemaker:customer-features@${D}`, 'u'],
    ['kms:Decrypt', 'kms:payments-cmk', ''],
  ],
  'ledger-reconciler': [
    ['dynamodb:Scan,dynamodb:Query', 'ddb:payments-ledger', 'u'],
    ['s3:GetObject', 's3:dpa-settlement-files', 'u'],
    ['rds-db:connect', 'rds:payments-db', 'u'],
    ['s3:PutObject', 's3:dpa-finance-exports', ''],
  ],
  'invoice-pdf-renderer': [
    ['s3:PutObject', 's3:dpa-invoices', 'u'],
    ['dynamodb:GetItem', 'ddb:orders', 'u'],
    ['s3:*', 'svc:s3', ''],
  ],
  'notification-dispatcher': [
    ['sqs:ReceiveMessage,sqs:DeleteMessage', 'sqs:notification-queue', 'u'],
    ['secretsmanager:GetSecretValue', 'sec:prod/notify/msg91-auth-key', 'u'],
    ['sns:Publish', 'sns:payment-alerts', 'u'],
  ],
  'merchant-onboarding-svc': [
    ['dynamodb:PutItem,dynamodb:GetItem,dynamodb:UpdateItem', 'ddb:merchant-profiles', 'u'],
    ['s3:PutObject', 's3:dpa-kyc-documents', 'u'],
    ['kms:Encrypt', 'kms:kyc-cmk', 'u'],
    ['s3:GetObject', 's3:dpa-kyc-documents', ''],
  ],
  /* The web tier's instance role: AdministratorAccess, used for one secret. */
  'payments-gateway-01': [ADMIN(['sec:prod/payments/npci-api-key'])],
  'bastion-prod': [
    ['ssm:StartSession', 'svc:ec2', 'u', ['ec2:payments-gateway-01']],
    ['ec2:DescribeInstances', 'svc:ec2', 'u', ['ec2:payments-gateway-01']],
  ],
  'svc-tally-sync': [ADMIN(['s3:dpa-settlement-files', 'ddb:payments-ledger', 's3:dpa-finance-exports'])],
  'svc-razorpay-webhook': [
    ['sqs:SendMessage', 'sqs:refund-requests', 'u'],
    ['dynamodb:PutItem', 'ddb:payments-ledger', 'u'],
  ],
  'cards-tokenization-svc': [
    ['secretsmanager:GetSecretValue', 'sec:prod/cards/hsm-pin', 'u'],
    ['kms:Decrypt,kms:GenerateDataKey', 'kms:cards-hsm-wrap', 'u'],
    ['dynamodb:PutItem,dynamodb:GetItem', 'ddb:card-tokens', 'u'],
  ],
  'order-saga-orchestrator': [
    ['lambda:InvokeFunction', 'fn:upi-payment-processor', 'u'],
    ['lambda:InvokeFunction', 'fn:refund-processor', 'u'],
    ['dynamodb:UpdateItem', 'ddb:orders', 'u'],
  ],
  'support-copilot-agent': [
    ['bedrock:InvokeModel', 'bedrock:anthropic.claude-sonnet', 'u'],
    ['dynamodb:GetItem', 'ddb:orders', 'u'],
    ['dynamodb:GetItem', 'ddb:merchant-profiles', 'u'],
    ['lambda:InvokeFunction', 'fn:refund-processor', 'u'],
    ['s3:GetObject', 's3:dpa-kyc-documents', ''],
  ],
  'cloudwatch-log-shipper': [
    ['logs:FilterLogEvents,logs:GetLogEvents', 'logs:/aws/lambda/payments', 'u'],
    ['s3:PutObject', 's3:dpa-cloudtrail-archive', 'u'],
  ],
  /* prod-core: delivery */
  'deploy-prod-pipeline': [
    ADMIN(['ecs:payments-api', 'cfn:payments-prod', 's3:dpa-build-artifacts', 'fn:upi-payment-processor']),
  ],
  'build-payments-api': [
    ['ecr:PutImage,ecr:InitiateLayerUpload,ecr:CompleteLayerUpload', 'ecr:payments-api', 'u'],
    ['s3:PutObject,s3:GetObject', 's3:dpa-build-artifacts', 'u'],
    ['logs:PutLogEvents', 'logs:/aws/lambda/payments', 'u'],
  ],
  'github-actions-deploy': [
    ['lambda:UpdateFunctionCode', 'fn:upi-payment-processor', 'u'],
    ['lambda:UpdateFunctionCode', 'fn:refund-processor', 'u'],
    ['ecr:PutImage', 'ecr:payments-api', 'u'],
    ['s3:GetObject,s3:PutObject', 's3:dpa-terraform-state', 'u'],
    ['iam:PassRole', 'svc:iam', ''],
    ADMIN(['ecs:payments-api']),
  ],
  'terraform-runner': [
    ADMIN(['s3:dpa-terraform-state', 'ddb:terraform-locks', 'cfn:payments-prod']),
  ],
  'datadog-integration': [
    ['cloudwatch:GetMetricData,cloudwatch:ListMetrics', 'cw:metrics', 'u'],
    ['ec2:DescribeInstances,tag:GetResources', 'svc:ec2', 'u', ['ec2:payments-gateway-01']],
    ['logs:FilterLogEvents', 'logs:/aws/lambda/payments', 'u'],
  ],
  'snowflake-external-stage': [
    ['s3:GetObject,s3:ListBucket', 's3:dpa-finance-exports', 'u'],
  ],
  'pranav.reddy': [
    ['ec2:Describe*,iam:Get*,iam:List*', 'svc:iam', 'u', []],
    ['s3:GetObject', 's3:dpa-cloudtrail-archive', 'u'],
  ],
  'raju-ops-automation': [
    ADMIN(['ec2:payments-gateway-01', 'ddb:payments-ledger', 'ssm:prod/payments/config']),
  ],
  /* data-platform */
  'gst-report-generator': [
    ['glue:GetTable,glue:GetPartitions', `glue:analytics@${D}`, 'u'],
    ['athena:StartQueryExecution,athena:GetQueryResults', `athena:reporting@${D}`, 'u'],
    ['s3:GetObject', `s3:dpa-data-lake-curated@${D}`, 'u'],
    ['s3:PutObject', 's3:dpa-finance-exports', 'u'],
  ],
  'clickstream-etl': [
    ['s3:GetObject', `s3:dpa-data-lake-raw@${D}`, 'u'],
    ['s3:PutObject', `s3:dpa-data-lake-curated@${D}`, 'u'],
    ['glue:UpdateTable', `glue:analytics@${D}`, 'u'],
  ],
  'customer-360-builder': [
    ['s3:*', 'svc:s3', 'u', [`s3:dpa-data-lake-raw@${D}`, `s3:dpa-data-lake-curated@${D}`]],
    ['redshift-data:ExecuteStatement', `redshift:dpa-warehouse@${D}`, 'u'],
    ADMIN([`glue:analytics@${D}`]),
  ],
  'churn-model-notebook': [
    ['s3:GetObject', `s3:dpa-data-lake-curated@${D}`, 'u'],
    ['s3:GetObject,s3:PutObject', `s3:dpa-ml-artifacts@${D}`, 'u'],
    ['sagemaker:CreateTrainingJob', `sagemaker:customer-features@${D}`, ''],
  ],
  'feature-store-sync': [
    ['sagemaker:PutRecord', `sagemaker:customer-features@${D}`, 'u'],
    ['s3:GetObject', `s3:dpa-data-lake-curated@${D}`, 'u'],
  ],
  'kinesis-txn-consumer': [
    ['kinesis:GetRecords,kinesis:GetShardIterator', `kinesis:txn-stream@${D}`, 'u'],
    ['s3:PutObject', `s3:dpa-data-lake-raw@${D}`, 'u'],
    ['kms:Decrypt', `kms:data-lake-cmk@${D}`, 'u'],
  ],
  'redshift-loader': [
    ['redshift-data:ExecuteStatement', `redshift:dpa-warehouse@${D}`, 'u'],
    ['secretsmanager:GetSecretValue', 'sec:data/redshift/loader-password', 'u'],
    ['s3:GetObject', `s3:dpa-data-lake-curated@${D}`, 'u'],
  ],
  'svc-airflow-scheduler': [
    ['s3:GetObject,s3:PutObject', `s3:dpa-data-lake-raw@${D}`, 'u'],
    ['s3:GetObject,s3:PutObject', `s3:dpa-data-lake-curated@${D}`, 'u'],
    ['glue:StartJobRun', `glue:analytics@${D}`, 'u'],
    ['iam:PassRole', 'svc:iam', ''],
    ['s3:ListAllMyBuckets', 'svc:s3', ''],
  ],
  'data-lake-crawler': [
    ['s3:GetObject,s3:ListBucket', `s3:dpa-data-lake-raw@${D}`, 'u'],
    ['glue:CreateTable,glue:UpdateTable', `glue:analytics@${D}`, 'u'],
  ],
  'athena-reporting-svc': [
    ['athena:StartQueryExecution', `athena:reporting@${D}`, 'u'],
    ['s3:GetObject', `s3:dpa-data-lake-curated@${D}`, 'u'],
    ['s3:PutObject', `s3:dpa-athena-results@${D}`, 'u'],
  ],
  'risk-model-endpoint': [
    ['s3:GetObject', `s3:dpa-ml-artifacts@${D}`, 'u'],
    ['kms:Decrypt', `kms:data-lake-cmk@${D}`, 'u'],
  ],
  [`OrganizationAccountAccessRole@${D}`]: [ADMIN([`s3:dpa-data-lake-raw@${D}`, `glue:analytics@${D}`])],
  /* staging */
  'payments-api-staging': [
    ['dynamodb:GetItem,dynamodb:PutItem', `ddb:payments-ledger-staging@${S}`, 'u'],
    ['sqs:SendMessage', `sqs:staging-events@${S}`, 'u'],
  ],
  'qa-regression-runner': [
    ['s3:GetObject', `s3:dpa-staging-artifacts@${S}`, 'u'],
    ['dynamodb:Scan', `ddb:payments-ledger-staging@${S}`, 'u'],
  ],
  'load-test-agent': [['dynamodb:PutItem,dynamodb:GetItem', `ddb:payments-ledger-staging@${S}`, 'u']],
  'temp-debug-role': [ADMIN([`ddb:payments-ledger-staging@${S}`])],
  'mobile-api-staging': [
    ['dynamodb:GetItem', `ddb:payments-ledger-staging@${S}`, 'u'],
    ['s3:GetObject', `s3:dpa-staging-artifacts@${S}`, 'u'],
  ],
  'svc-old-sms-gateway': [['sns:Publish', 'svc:sns', 'u', [`sns:sms-outbound@${S}`]]],
  'preview-env-builder': [
    ['cloudformation:CreateStack,cloudformation:DeleteStack', 'svc:cloudformation', ''],
    ['s3:PutObject', `s3:dpa-staging-artifacts@${S}`, 'u'],
  ],
  [`OrganizationAccountAccessRole@${S}`]: [ADMIN([`s3:dpa-staging-artifacts@${S}`])],
  [`OrganizationAccountAccessRole@${SH}`]: [ADMIN([`s3:dpa-org-cloudtrail@${SH}`])],
  /* Scenario: a CI user whose key ends up in a repository. */
  'svc-deploy-bot': [
    ['sts:AssumeRole', 'svc:iam', 'u', []],
    ADMIN(['ecs:payments-api', 'cfn:payments-prod', 'ecr:payments-api']),
  ],
  /* Scenario: a harmless-looking role that can chain its way to admin. */
  'reporting-readonly': [
    ['s3:GetObject', 's3:dpa-invoices', 'u'],
    ['dynamodb:GetItem,dynamodb:Query', 'ddb:orders', 'u'],
    ['sts:AssumeRole', 'svc:iam', '', []],
  ],
  'ops-support-role': [
    ['logs:FilterLogEvents', 'logs:/aws/lambda/payments', 'u'],
    ['ssm:GetParameter', 'ssm:prod/payments/config', 'u'],
    ['sts:AssumeRole', 'svc:iam', '', []],
  ],
  'break-glass-admin': [ADMIN([])],
  /* Scenario: the role a deleted Lambda leaves behind. */
  'invoice-legacy-export-role': [
    ['s3:GetObject,s3:PutObject', 's3:dpa-invoices', ''],
    ['s3:PutObject', 's3:dpa-finance-exports', ''],
    ['dynamodb:Scan,dynamodb:GetItem', 'ddb:orders', ''],
  ],
  /* Azure Payments-Prod */
  'mi-payments-aks': [
    ['Microsoft.KeyVault/vaults/secrets/getSecret/action', 'kv:upi-signing-key', 'u'],
    ['Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read', 'st:stpaymentsprod/receipts', 'u'],
    ['Microsoft.ContainerRegistry/registries/pull/read', 'acr:acrpayments', 'u'],
  ],
  'mi-keyvault-reader': [
    ['Microsoft.KeyVault/vaults/secrets/getSecret/action', 'kv:kv-payments-prod', 'u'],
  ],
  'sp-pos-terminal-sync': [
    ['Microsoft.Sql/servers/databases/read', 'sql:sql-payments/merchants', 'u'],
    ['Microsoft.Storage/storageAccounts/blobServices/containers/blobs/write', 'st:stpaymentsprod/settlements', 'u'],
    ['Microsoft.KeyVault/vaults/secrets/getSecret/action', 'kv:pos-terminal-hmac', 'u'],
    ['Microsoft.Graph/Directory.ReadWrite.All', 'entra:directory', ''],
    ['Microsoft.Authorization/roleAssignments/write', 'sub:Payments-Prod', ''],
  ],
  'app-merchant-portal': [
    ['Microsoft.Sql/servers/databases/read,Microsoft.Sql/servers/databases/write', 'sql:sql-payments/merchants', 'u'],
    ['Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read', 'st:stpaymentsprod/receipts', 'u'],
  ],
  'sp-powerbi-refresh': [['Microsoft.Sql/servers/databases/read', 'sql:sql-payments/merchants', 'u']],
  'aks-settlement-pod': [
    ['Microsoft.ServiceBus/namespaces/queues/messages/send/action', 'sb:sb-payments/refunds', 'u'],
    ['Microsoft.Storage/storageAccounts/blobServices/containers/blobs/write', 'st:stpaymentsprod/settlements', 'u'],
  ],
  'func-refund-notifier': [['Microsoft.ServiceBus/namespaces/queues/messages/receive/action', 'sb:sb-payments/refunds', 'u']],
  'sp-github-deploy': [
    ['Microsoft.ContainerService/managedClusters/listClusterUserCredential/action', 'aks:aks-payments', 'u'],
    ['Microsoft.ContainerRegistry/registries/push/write', 'acr:acrpayments', 'u'],
    ['Microsoft.Authorization/roleAssignments/write', 'sub:Payments-Prod', ''],
  ],
  'sp-backup-automation': [['Microsoft.Storage/storageAccounts/listKeys/action', 'st:stpaymentsprod/settlements', 'u']],
  'sp-terraform-prod': [
    ['Microsoft.Authorization/roleAssignments/write', 'sub:Payments-Prod', 'u'],
    ['Microsoft.KeyVault/vaults/write', 'kv:kv-payments-prod', 'u'],
    ['Microsoft.ContainerService/managedClusters/write', 'aks:aks-payments', 'u'],
  ],
  /* Azure Analytics-Dev */
  'sp-databricks-jobs': [
    ['Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read,Microsoft.Storage/storageAccounts/blobServices/containers/blobs/write', 'st:stanalyticsdev/lake', 'u'],
    ['Microsoft.Databricks/workspaces/read', 'dbw:dbw-analytics', 'u'],
  ],
  'mi-synapse-pipeline': [
    ['Microsoft.Synapse/workspaces/read', 'syn:syn-analytics', 'u'],
    ['Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read', 'st:stanalyticsdev/lake', 'u'],
  ],
  'sp-legacy-reporting': [['Microsoft.Sql/servers/databases/read', 'sql:sql-legacy/reporting', 'u']],
  'app-ml-experiments': [['Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read', 'st:stanalyticsdev/lake', 'u']],
  /* Jenkins */
  'payments-api/deploy-prod': [
    ['Job/Build,Job/Configure', 'jenkins:payments-api/deploy-prod', 'u'],
    ['Credentials/UseItem', 'jenkins:credentials', 'u'],
    ['scm.checkout', 'repo:payments-api', 'u'],
  ],
  'mobile-app/release-android': [
    ['Credentials/UseItem', 'jenkins:credentials', 'u'],
    ['scm.checkout', 'repo:mobile-app', 'u'],
    ['androidpublisher.edits.commit', 'saas:play-console', 'u'],
  ],
  'infra/terraform-apply': [
    ['Credentials/UseItem', 'jenkins:credentials', 'u'],
    ['scm.checkout', 'repo:infra-terraform', 'u'],
  ],
  'data/nightly-etl': [
    ['scm.checkout', 'repo:data-pipelines', 'u'],
    ['snowflake.COPY INTO,snowflake.SELECT', 'saas:snowflake', 'u'],
  ],
  'qa/regression-suite': [['browserstack.automate.session', 'saas:browserstack', 'u']],
  'agent-linux-01': [['agent.connect', 'jenkins:credentials', 'u']],
  'agent-docker-02': [['docker.push', 'saas:dockerhub', 'u']],
  'jenkins-svc-bot': [
    ['Overall/Administer', 'jenkins:credentials', ''],
    ['repo.contents:write,releases:write', 'repo:releases', 'u'],
  ],
  /* Vault */
  'approle/payments-api': [
    ['read', 'vault:secret/data/payments', 'u'],
    ['update (encrypt)', 'vault:transit/keys/payments', 'u'],
  ],
  'approle/settlement-worker': [['read', 'vault:secret/data/settlement', 'u']],
  'approle/jenkins-ci': [
    ['read', 'vault:secret/data/ci', 'u'],
    ['read,update,delete', 'svc:vault-kv', '', []],
    ['update', 'vault:sys/policies/acl', ''],
  ],
  'k8s/fraud-scoring': [['read', 'vault:secret/data/fraud', 'u']],
  'token/legacy-batch': [
    ['read', 'vault:secret/data/payments', 'u'],
    ['read', 'vault:database/creds/readwrite', 'u'],
  ],
  'aws-secrets-engine/db-readonly': [['read', 'vault:database/creds/readonly', 'u']],
};

/* ── Links: how one identity becomes another ───────────────────────────────
   assume       role chaining (sts:AssumeRole), shown as "can assume"
   signs_in_as  a workload authenticates as another identity (Vault AppRole,
                Kubernetes auth, Entra workload identity)
   stores       a CI credential that IS another identity's secret          */
const LINKS = [
  ['assume', 'github-actions-deploy', 'terraform-runner', 'Trust policy of terraform-runner allows github-actions-deploy'],
  ['assume', 'terraform-runner', `OrganizationAccountAccessRole@${D}`, 'Organization role in data-platform trusts prod-core'],
  ['assume', 'terraform-runner', `OrganizationAccountAccessRole@${S}`, 'Organization role in staging trusts prod-core'],
  ['assume', 'raju-ops-automation', 'temp-debug-role', 'Trust policy of temp-debug-role allows the prod-core account'],
  ['assume', 'svc-deploy-bot', `OrganizationAccountAccessRole@${D}`, 'Organization role in data-platform trusts prod-core'],
  ['assume', 'svc-deploy-bot', `OrganizationAccountAccessRole@${S}`, 'Organization role in staging trusts prod-core'],
  ['assume', 'svc-deploy-bot', `OrganizationAccountAccessRole@${SH}`, 'Organization role in shared-services trusts prod-core'],
  ['assume', 'reporting-readonly', 'ops-support-role', 'Trust policy of ops-support-role names reporting-readonly (added for incident INC-2231, never removed)'],
  ['assume', 'ops-support-role', 'break-glass-admin', 'Trust policy of break-glass-admin names ops-support-role'],
  ['signs_in_as', 'upi-payment-processor', 'approle/payments-api', 'Vault AppRole login with a secret_id from Secrets Manager'],
  ['signs_in_as', 'settlement-batch-worker', 'approle/settlement-worker', 'Vault AppRole login'],
  ['signs_in_as', 'fraud-scoring-api', 'k8s/fraud-scoring', 'Vault Kubernetes auth with its service account token'],
  ['signs_in_as', 'ledger-reconciler', 'token/legacy-batch', 'Periodic Vault token in the job environment'],
  ['signs_in_as', 'redshift-loader', 'aws-secrets-engine/db-readonly', 'Dynamic database credentials from Vault'],
  ['signs_in_as', 'aks-settlement-pod', 'mi-payments-aks', 'Entra workload identity federation'],
  ['stores', 'aws-prod-deploy-keys', 'raju-ops-automation', 'Jenkins holds an access key of raju-ops-automation'],
  ['stores', 'vault-approle-ci', 'approle/jenkins-ci', 'Jenkins holds the AppRole role_id and secret_id'],
  ['stores', 'azure-sp-terraform', 'sp-terraform-prod', 'Jenkins holds the client secret of sp-terraform-prod'],
];

/* Stored credentials that open something outside the estate. */
const STORED_EXTERNAL = {
  'snowflake-etl-user': 'saas:snowflake',
  'github-pat-release-bot': 'repo:releases',
  'play-store-service-account': 'saas:play-console',
  'dockerhub-push-token': 'saas:dockerhub',
  'browserstack-key': 'saas:browserstack',
};

/* ── Anomalies: departures from each identity's baseline ───────────────── */
export const ANOMALY_SPECS = [
  { who: 'fraud-scoring-api', dimension: 'source_ip', severity: 'critical', value: '185.220.101.47', baseline: '10.x private addresses only', ip: '185.220.101.47', action: 'sts:AssumeRole', target: `arn:aws:iam::${D}:role/OrganizationAccountAccessRole`, errors: 6, hoursAgo: 3, description: 'sts:AssumeRole into data-platform from a known Tor exit node; 6 AccessDenied errors followed.', untrusted: true },
  { who: 'svc-airflow-scheduler', dimension: 'source_ip', severity: 'critical', value: '45.137.21.9', baseline: '10.x private addresses only', ip: '45.137.21.9', action: 'sts:GetCallerIdentity', target: null, errors: 0, hoursAgo: 5, description: 'Its access key was used from a hosting provider it has never used, right after the key was committed to DATA/airflow-dags.', untrusted: true },
  { who: 'approle/jenkins-ci', dimension: 'resource', severity: 'high', value: 'secret/data/payments/*', baseline: 'secret/data/ci/* only', action: 'read', target: 'vault:secret/data/payments', hoursAgo: 9, description: 'Read secret/data/payments/npci and secret/data/payments/hsm, outside every path in its 14-day baseline.' },
  { who: 'terraform-runner', dimension: 'api_call', severity: 'high', value: 'iam:PutRolePolicy', baseline: 'Not seen in 14 days of baseline', action: 'iam:PutRolePolicy', target: `arn:aws:iam::${P}:role/terraform-runner`, hoursAgo: 14, description: 'Added an inline policy to itself that allows iam:PassRole on every role.' },
  { who: 'payments-gateway-01', dimension: 'volume', severity: 'high', value: '9x the usual hourly calls', baseline: 'About 40 calls an hour', action: 'secretsmanager:GetSecretValue', target: 'sec:prod/payments/npci-api-key', hoursAgo: 26, description: 'Read the NPCI API key 9 times more often than usual in one hour.' },
  { who: 'sp-pos-terminal-sync', dimension: 'api_call', severity: 'high', value: 'roleAssignments/write', baseline: 'Not seen in 14 days of baseline', action: 'Microsoft.Authorization/roleAssignments/write', target: 'sub:Payments-Prod', hoursAgo: 40, description: 'Created a role assignment on the Payments-Prod subscription.' },
  { who: 'raju-ops-automation', dimension: 'time_of_day', severity: 'medium', value: '02:00 UTC', baseline: '04:00-14:00 UTC', action: 'iam:CreateAccessKey', target: `arn:aws:iam::${P}:user/svc-tally-sync`, hoursAgo: 52, description: 'Created an access key for svc-tally-sync at 02:00 UTC, outside its working hours.' },
  { who: 'mi-payments-aks', dimension: 'user_agent', severity: 'medium', value: 'curl/8.5.0', baseline: 'azsdk-python-identity only', action: 'Microsoft.KeyVault/vaults/secrets/getSecret/action', target: 'kv:upi-signing-key', hoursAgo: 61, description: 'Read the UPI signing key with curl instead of the SDK it always uses.' },
  { who: 'clickstream-etl', dimension: 'region', severity: 'medium', value: 'eu-central-1', baseline: 'ap-south-1', action: 's3:GetObject', target: `s3:dpa-data-lake-raw@${D}`, hoursAgo: 80, description: 'Called from eu-central-1, a region it has never run in.' },
  { who: 'kinesis-txn-consumer', dimension: 'volume', severity: 'low', value: '4x the usual hourly calls', baseline: 'About 120 calls an hour', action: 'kinesis:GetRecords', target: `kinesis:txn-stream@${D}`, hoursAgo: 24 * 23, description: 'Read the transaction stream 4 times more often than usual during a backfill.', resolved: true },
  { who: 'notification-dispatcher', dimension: 'time_of_day', severity: 'low', value: '23:00 UTC', baseline: '01:00-17:00 UTC', action: 'sns:Publish', target: 'sns:payment-alerts', hoursAgo: 24 * 26, description: 'Published alerts late at night during a festival sale.', resolved: true },
];

/* Departures raised by a live scenario: present from the moment it ran. */
function scenarioAnomalies() {
  const run = scenario('agent');
  if (!run) return [];
  const hoursAgo = Math.max(0.02, (Date.now() - run.at) / 3600000);
  return [
    { who: 'support-copilot-agent', dimension: 'resource', severity: 'critical', value: 'dpa-kyc-documents', baseline: 'orders and merchant-profiles tables only', action: 's3:GetObject', target: 's3:dpa-kyc-documents', hoursAgo, burst: 48, count: 1240, description: 'The support agent read 1,240 KYC documents in 4 minutes. Its role allows it, but in 14 days of baseline it never touched this bucket.', untrusted: false, live: true },
  ];
}
export const activeAnomalySpecs = () => [...ANOMALY_SPECS, ...scenarioAnomalies()];

/* ── Building it against the estate ────────────────────────────────────── */
let model = null;

const principalKey = (identity) => {
  const shared = identity.__role;
  if (shared && GRANTS[shared]) return shared;
  if (identity.name === 'OrganizationAccountAccessRole') return `OrganizationAccountAccessRole@${identity.account_id}`;
  return identity.name;
};

function accessLevel(actions) {
  if (actions.some((a) => a === '*' || /roleAssignments\/write|Administer|sudo|Directory\.ReadWrite|sys\/policies|^iam:(PassRole|Put|Create|Attach)/.test(a))) return 'admin';
  if (actions.every((a) => /^(read|scm\.checkout|agent\.connect)$|:(Get|List|Describe|Query|Scan|Receive|Filter)|\/read$|getSecret|listClusterUserCredential|^athena:Start|InvokeModel|GetRecord|Decrypt/.test(a))) return 'read';
  return 'write';
}

/**
 * Called by seed.js once the estate exists: resolves every grant against the
 * catalog and the estate, and sets what other modules read from identities.
 */
export function enrich(world) {
  const cat = catalog();
  const byName = new Map();
  for (const i of world.identities) {
    const key = i.name === 'OrganizationAccountAccessRole' ? `OrganizationAccountAccessRole@${i.account_id}` : i.name;
    byName.set(key, i);
  }
  const credByName = new Map(world.credentials.map((c) => [c.name, c]));
  /* The shared Lambda role. */
  for (const i of world.identities) {
    const role = (i.credential_ids ?? []).map((id) => world.credentials.find((c) => c.id === id)).find((c) => c?.credential_type === 'iam_role');
    if (role && GRANTS[role.name] && role.name !== i.name) i.__role = role.name;
  }

  const resolve = (key) => {
    if (key.startsWith('sec:')) {
      const c = credByName.get(key.slice(4));
      return c ? { key, arn: c.arn, name: c.name, service: 'secretsmanager', type: 'AWS::SecretsManager::Secret', provider: 'aws', account_id: c.account_id, region: c.region, data: 'Secrets', sensitive: true, credential_id: c.id } : null;
    }
    if (key.startsWith('fn:')) {
      const t = byName.get(key.slice(3));
      return t ? { key, arn: t.arn, name: t.name, service: 'lambda', type: 'AWS::Lambda::Function', provider: 'aws', account_id: t.account_id, region: t.region, data: 'Financial', sensitive: false, identity_id: t.id } : null;
    }
    if (key.startsWith('ec2:')) {
      const t = byName.get(key.slice(4));
      return t ? { key, arn: t.arn, name: t.name, service: 'ec2', type: 'AWS::EC2::Instance', provider: 'aws', account_id: t.account_id, region: t.region, data: 'Internal', sensitive: false, identity_id: t.id } : null;
    }
    return cat.get(key) ?? null;
  };
  /* Everything a wildcard covers, in the principal's own account. */
  const expand = (spec, identity) => {
    const account = identity.account_id;
    const all = [...cat.values()].filter((r) => r.account_id === account);
    const secrets = world.credentials.filter((c) => c.credential_type === 'secret' && c.account_id === account).map((c) => resolve(`sec:${c.name}`));
    const functions = world.identities.filter((x) => x.identity_type === 'lambda_function' && x.account_id === account).map((x) => resolve(`fn:${x.name}`));
    const pool = [...all, ...secrets, ...functions].filter(Boolean);
    if (spec === '*') return pool;
    const service = spec.slice(4);
    if (service === 'iam') return [];
    return pool.filter((r) => r.service === service);
  };

  const grants = new Map(); // principal key -> resolved grants
  for (const [principal, rows] of Object.entries(GRANTS)) {
    const owner = byName.get(principal) ?? world.identities.find((i) => i.__role === principal);
    if (!owner) continue;
    const resolved = rows.map(([actions, res, flags, seen], index) => {
      const list = actions.split(',');
      const wildcard = res === '*' || res.startsWith('svc:');
      const targets = wildcard ? expand(res, owner) : [resolve(res, owner)].filter(Boolean);
      const seenOn = wildcard ? (seen ?? []).map((k) => resolve(k, owner)).filter(Boolean) : targets;
      const policy =
        res === '*' ? (owner.provider === 'aws' ? 'AdministratorAccess' : 'Owner') : owner.provider === 'aws' ? `${principal.split('@')[0]}-policy` : owner.provider === 'azure' ? 'Custom role' : owner.provider === 'jenkins' ? 'Matrix authorization' : `${principal.split('/').pop()}-policy`;
      return {
        id: `${principal}#${index}`,
        actions: list,
        resource_spec: res,
        wildcard,
        targets,
        used: flags.includes('u'),
        seen_on: flags.includes('u') ? seenOn : [],
        level: accessLevel(list),
        policy_source: policy,
        policy_type: res === '*' ? (owner.provider === 'aws' ? 'aws_managed' : 'role_assignment') : owner.provider === 'aws' ? 'inline' : owner.provider === 'azure' ? 'role_assignment' : owner.provider === 'jenkins' ? 'matrix' : 'acl',
      };
    });
    grants.set(principal, resolved);
  }

  const links = [];
  for (const [kind, from, to, why] of LINKS) {
    const a = kind === 'stores' ? credByName.get(from) : byName.get(from) ?? world.identities.find((i) => i.__role === from);
    const b = byName.get(to);
    if (!a || !b) continue;
    links.push({ id: `${kind}:${from}->${to}`, kind, from: a, fromKind: kind === 'stores' ? 'credential' : 'identity', to: b, why });
  }
  /* A Jenkins job using a stored credential signs in as what it holds. */
  for (const l of links.filter((x) => x.kind === 'stores')) {
    for (const jobId of l.from.bound_identities ?? []) {
      const job = world.identities.find((i) => i.id === jobId);
      if (job) links.push({ id: `${l.id}|${job.name}`, kind: 'signs_in_as', from: job, fromKind: 'identity', to: l.to, why: `Uses Jenkins credential ${l.from.name}`, via: l.from });
    }
  }

  model = { grants, links, resolve, byName, credByName };

  /* An identity seen misbehaving recently was, by definition, active then. */
  const now = Date.now();
  for (const a of ANOMALY_SPECS) {
    const i = world.identities.find((x) => x.name === a.who);
    if (!i) continue;
    const at = now - a.hoursAgo * 3600 * 1000;
    if (Date.parse(i.last_activity_at) >= at) continue;
    i.last_activity_at = new Date(at).toISOString();
    i.idle_days = Math.floor(a.hoursAgo / 24);
    i.status = 'active';
    for (const id of i.credential_ids ?? []) {
      const c = world.credentials.find((x) => x.id === id);
      if (c && Date.parse(c.last_used_at) < at) {
        c.last_used_at = i.last_activity_at;
        c.idle_days = i.idle_days;
      }
    }
  }

  /* What the inventory shows must match what the permissions tab counts. */
  for (const i of world.identities) {
    const rows = permissionRows(i);
    const used = rows.filter((r) => r.used).length;
    i.permission_utilization_pct = rows.length ? Math.round((used / rows.length) * 100) : i.permission_utilization_pct;
  }
  return model;
}

/* ── Reading the model ─────────────────────────────────────────────────── */
export function grantsOf(identity) {
  if (!model || identity.__disabled) return [];
  return grantsForPrincipal(principalKey(identity));
}

/** A principal's grants after what people did: right-sized, or none once deleted. */
let previewKey = null;
export function grantsForPrincipal(key) {
  const base = model?.grants.get(key) ?? [];
  if (!rightSized(key) && previewKey !== key) return base;
  return rightSize(base);
}
/** Computes something as if a principal were already right-sized. */
export function withRightSizePreview(key, fn) {
  previewKey = key;
  try {
    return fn();
  } finally {
    previewKey = null;
  }
}

/* What it actually uses, as named grants: the least-privilege policy. */
export function rightSize(grants) {
  const out = [];
  for (const g of grants) {
    if (!g.used) continue;
    if (!g.wildcard) {
      out.push({ ...g, id: `${g.id}~ls` });
      continue;
    }
    for (const res of g.seen_on) {
      const actions = g.resource_spec === '*' ? [TYPICAL_ACTION[res.service] ?? `${res.service}:Get*`] : g.actions.filter((a) => a !== 'sts:AssumeRole');
      if (!actions.length) continue;
      out.push({ ...g, id: `${g.id}~${res.key}`, actions, resource_spec: res.key, wildcard: false, targets: [res], seen_on: [res], level: accessLevel(actions), policy_source: 'least-privilege', policy_type: 'inline' });
    }
  }
  return out;
}

/** The grants a principal had before anyone changed it. */
export const originalGrants = (key) => model?.grants.get(key) ?? [];
export const principalOf = (identity) => principalKey(identity);

export function resolveResource(key, _identity) {
  return model?.resolve(key) ?? null;
}

/** Permission rows in the shape the permissions tab and posture read. */
const ADMIN_SERVICES = {
  aws: ['iam', 'sts', 's3', 'dynamodb', 'kms', 'secretsmanager', 'ssm', 'ec2', 'lambda', 'ecs', 'ecr', 'rds', 'sqs', 'sns', 'cloudformation', 'logs', 'organizations', 'cloudtrail', 'route53', 'elasticloadbalancing', 'autoscaling', 'eks', 'glue', 'athena', 'backup'],
  azure: ['Microsoft.Authorization', 'Microsoft.KeyVault', 'Microsoft.Storage', 'Microsoft.Compute', 'Microsoft.Sql', 'Microsoft.ContainerService', 'Microsoft.Network'],
};

export function permissionRows(identity) {
  const rows = [];
  for (const g of grantsOf(identity)) {
    if (g.resource_spec === '*') {
      /* Administrator access, read the way access advisors read it: one row
         per service, used only where the activity log shows it. */
      const usedServices = new Set(g.seen_on.map((r) => (identity.provider === 'aws' ? r.service : r.type?.split('::')[1] && `Microsoft.${r.type.split('::')[1]}`)));
      for (const service of ADMIN_SERVICES[identity.provider] ?? ['*']) {
        rows.push({ action: identity.provider === 'aws' ? `${service}:*` : `${service}/*`, resource_arn: '*', policy_source: g.policy_source, policy_type: g.policy_type, used: usedServices.has(service), grant_id: g.id, level: 'admin', wildcard: true });
      }
      continue;
    }
    for (const action of g.actions) {
      const resource = g.resource_spec === '*' ? '*' : g.wildcard ? `${g.resource_spec.slice(4)}:*` : g.targets[0]?.arn ?? '*';
      rows.push({ action, resource_arn: resource, policy_source: g.policy_source, policy_type: g.policy_type, used: g.used, grant_id: g.id, level: g.level, wildcard: g.wildcard });
    }
  }
  return rows;
}

/** Edges out of this identity to identities it can become. */
const live = (l) => !linkBroken(l.id.split('|')[0]) && !l.from.__deleted && !l.to.__deleted && !l.from.__disabled && !l.to.__disabled && !(l.via && (keyDeactivated(l.via.id) || l.via.__deleted)) && !(l.fromKind === 'credential' && (keyDeactivated(l.from.id) || l.from.__deleted));
export function linksFrom(identity) {
  if (!model) return [];
  return model.links.filter((l) => l.fromKind === 'identity' && l.from.id === identity.id && live(l));
}
export function linksTo(identity) {
  if (!model) return [];
  return model.links.filter((l) => l.to.id === identity.id && live(l));
}
export const linkById = (id) => model?.links.find((l) => l.id === id) ?? null;

/**
 * Privilege escalation: role chains from an identity without administrator
 * access to one with it. Each path is the identities in order.
 */
export function escalationPaths(identity) {
  if (!model || identity.is_admin) return [];
  const out = [];
  const walk = (node, path, links) => {
    if (path.length > 5) return;
    for (const l of linksFrom(node).filter((x) => x.kind === 'assume')) {
      if (path.some((p) => p.id === l.to.id)) continue;
      const next = [...path, l.to];
      const via = [...links, l];
      if (l.to.is_admin) out.push({ identities: next, links: via });
      else walk(l.to, next, via);
    }
  };
  walk(identity, [identity], []);
  return out;
}
/** Paths that pass through this identity (it is a step, not the start). */
export function escalationThrough(identity) {
  if (!model) return [];
  const out = [];
  for (const i of overlayWorld?.identities ?? []) {
    if (i.id === identity.id || i.__deleted) continue;
    for (const p of escalationPaths(i)) if (p.identities.slice(1).some((x) => x.id === identity.id)) out.push(p);
  }
  return out;
}
export function storedTarget(credential) {
  if (!model) return null;
  const link = model.links.find((l) => l.kind === 'stores' && l.from.id === credential.id);
  if (link) return { identity: link.to, why: link.why };
  const ext = STORED_EXTERNAL[credential.name];
  return ext ? { resource: catalog().get(ext) } : null;
}
export const sharedRoleOf = (identity) => identity.__role ?? null;
export const anomalySpecsFor = (identity) => activeAnomalySpecs().filter((a) => a.who === identity.name && identity.name !== 'OrganizationAccountAccessRole');
export const dataScore = (data) => DATA_SCORE[data] ?? 4;

/* ── Applying what people did to the estate ────────────────────────────── */
const TYPICAL_ACTION = {
  dynamodb: 'dynamodb:Query', s3: 's3:GetObject', sqs: 'sqs:SendMessage', sns: 'sns:Publish', kms: 'kms:Decrypt',
  secretsmanager: 'secretsmanager:GetSecretValue', ssm: 'ssm:GetParameter', ecs: 'ecs:UpdateService', cloudformation: 'cloudformation:UpdateStack',
  lambda: 'lambda:UpdateFunctionCode', ec2: 'ec2:DescribeInstances', glue: 'glue:GetTable', rds: 'rds:DescribeDBClusters', kinesis: 'kinesis:GetRecords',
  ecr: 'ecr:PutImage',
};
export { TYPICAL_ACTION };

let overlayWorld = null;
let appliedRev = -1;
const overlayListeners = new Set();
/** Derived caches (activity, permissions, posture, anomalies) clear on a change. */
export function onOverlayChange(fn) {
  overlayListeners.add(fn);
  return () => overlayListeners.delete(fn);
}

/* A short stable hex string from text (for ids that must not change on reload). */
function hexOf(text) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const ch of String(text)) {
    h1 = Math.imul(h1 ^ ch.charCodeAt(0), 16777619) >>> 0;
    h2 = Math.imul(h2 + ch.charCodeAt(0), 2246822519) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}${(h1 ^ h2).toString(36)}`.replace(/[^a-z0-9]/g, '').padEnd(16, '7');
}

function severityOf(i) {
  return i.is_admin && (i.is_publicly_accessible || !i.owner) ? 'CRITICAL' : i.is_admin || i.is_shadow ? 'HIGH' : i.idle_days > 90 ? 'MEDIUM' : null;
}
function signalOf(i) {
  return !i.owner ? 'Orphaned' : i.is_admin ? 'Admin access' : i.idle_days > 90 ? 'Unused 90+ days' : i.is_publicly_accessible ? 'Publicly reachable' : null;
}

/** Called on every read of the estate: re-applies the overlay when it moved. */
export function syncOverlay(world) {
  overlayWorld = world;
  if (!model) return;
  let rev;
  try {
    rev = responseRev();
  } catch {
    return;
  }
  if (rev === appliedRev) return;
  appliedRev = rev;
  for (const i of world.identities) {
    i.__base ??= { is_admin: i.is_admin, status: i.status, public: i.is_publicly_accessible };
    i.__deleted = Boolean(identityDeleted(i.id));
    const key = principalKey(i);
    const sized = rightSized(key);
    i.is_admin = sized ? false : i.__base.is_admin;
    i.right_sized_at = sized?.at ? new Date(sized.at).toISOString() : null;
    /* Fixes a remediation plan carried out. */
    const priv = madePrivate(i.id);
    i.is_publicly_accessible = priv ? false : i.__base.public;
    const off = identityDisabled(i.id);
    i.__disabled = Boolean(off);
    i.status = off ? 'disabled' : i.__base.status;
    i.disabled_at = off ? new Date(off.at).toISOString() : null;
  }
  for (const c of world.credentials) {
    c.__base ??= {
      status: c.status,
      bound: [...(c.bound_identities ?? [])],
      is_orphaned: c.is_orphaned,
      access_key_id: c.access_key_id,
      name: c.name,
      arn: c.arn,
      created_at: c.created_at,
      age_days: c.age_days,
      last_rotated_at: c.last_rotated_at,
      rotation_overdue: c.rotation_overdue,
      rotation_enabled: c.rotation_enabled,
    };
    /* A rotated key is a new key: new id, new age; the leaked value is dead. */
    const rot = keyRotated(c.id);
    const b = c.__base;
    if (rot && b.access_key_id) {
      const fresh = `AKIA${hexOf(`${c.id}:${rot.at}`).toUpperCase().slice(0, 16)}`;
      c.access_key_id = fresh;
      c.name = b.name.replace(/AKIA\w{0,4}…\w{4}/, `${fresh.slice(0, 4)}…${fresh.slice(-4)}`);
      c.created_at = new Date(rot.at).toISOString();
      c.age_days = 0;
      c.last_rotated_at = c.created_at;
      c.rotation_overdue = false;
      c.rotated_by = rot.by_name ?? rot.by ?? null;
    } else {
      Object.assign(c, { access_key_id: b.access_key_id, name: b.name, created_at: b.created_at, age_days: b.age_days, last_rotated_at: b.last_rotated_at, rotation_overdue: b.rotation_overdue, rotated_by: null });
    }
    const rotOn = rotationEnabled(c.id);
    c.rotation_enabled = rotOn ? true : b.rotation_enabled;
    if (rotOn) {
      c.rotation_overdue = false;
      c.last_rotated_at = new Date(rotOn.at).toISOString();
    }
    const pin = trustPinned(c.id);
    c.trust_condition = pin ? (String(c.external_principal ?? '').startsWith('arn:') ? 'sts:ExternalId required' : 'subject pinned to repo:deepalgo-labs/payments-api:environment:production') : null;
    c.__deleted = Boolean(credentialDeleted(c.id));
    const off = keyDeactivated(c.id);
    c.status = off ? 'inactive' : c.__base.status;
    c.deactivated_at = off ? new Date(off.at).toISOString() : null;
    c.deactivated_by = off ? off.by_name ?? off.by ?? null : null;
    c.bound_identities = c.__base.bound.filter((id) => !identityDeleted(id));
    c.bound_identities_count = c.bound_identities.length;
    c.is_orphaned = c.__base.is_orphaned || (c.__base.bound.length > 0 && c.bound_identities.length === 0);
    const gone = c.__base.bound.find((id) => identityDeleted(id));
    c.orphaned_by = gone ? { identity_id: gone, name: world.identities.find((x) => x.id === gone)?.name, at: new Date(identityDeleted(gone).at).toISOString(), by: identityDeleted(gone).by } : null;
  }
  for (const i of world.identities) {
    const rows = permissionRows(i);
    if (rows.length) i.permission_utilization_pct = Math.round((rows.filter((r) => r.used).length / rows.length) * 100);
    i.severity = severityOf(i);
    i.signal = signalOf(i);
  }
  for (const fn of overlayListeners) fn();
}
export { catalog as resourceCatalog };
