import { ANCHOR, hashString } from './world';

/* The log each application keeps, and what an identity's entries in it look like. */
export const LOG_SOURCE = {
  aws: 'CloudTrail',
  azure: 'Entra ID sign-in and Azure activity logs',
  github: 'GitHub audit log',
  bitbucket: 'Bitbucket audit log',
  vault: 'Vault audit device',
};

const ACTIONS = {
  aws: [
    ['sts:AssumeRole', 'sts.amazonaws.com'],
    ['s3:GetObject', 's3://corvane-prod-ledger/settlements/'],
    ['s3:PutObject', 's3://corvane-customer-exports/daily/'],
    ['kms:Decrypt', 'alias/payments'],
    ['secretsmanager:GetSecretValue', 'prod/stripe-api'],
    ['dynamodb:Query', 'sessions'],
    ['sqs:SendMessage', 'settlement-queue'],
    ['logs:PutLogEvents', '/aws/lambda/invoice-renderer'],
    ['ec2:DescribeInstances', 'us-east-1'],
  ],
  azure: [
    ['Sign-in (service principal)', 'login.microsoftonline.com'],
    ['secrets/read', 'kv-corvane-prod/stripe-webhook'],
    ['blobServices/containers/read', 'stcorvaneprod/exports'],
    ['databases/read', 'sql-orders-prod/orders'],
    ['managedClusters/listClusterUserCredential', 'aks-prod-weu'],
    ['roleAssignments/read', '/subscriptions/Production'],
  ],
  github: [
    ['git.clone', 'corvane/payments-api'],
    ['git.push', 'corvane/helm-charts'],
    ['workflows.prepared_workflow_job', 'deploy-payments-api.yml'],
    ['repo.download_zip', 'corvane/ledger-service'],
    ['pull_request.create', 'corvane/web-app'],
    ['packages.package_version_published', 'ghcr.io/corvane/checkout'],
  ],
  bitbucket: [
    ['Repository cloned', 'corvane-legacy/billing-batch'],
    ['Pushed to branch', 'corvane-legacy/partner-sync:main'],
    ['Pipeline started', 'billing-batch-deploy'],
    ['Repository variable read', 'AWS_SECRET_ACCESS_KEY'],
    ['Pull request merged', 'corvane-legacy/report-engine'],
  ],
  vault: [
    ['auth/approle/login', 'approle'],
    ['read', 'kv/data/prod/payments/stripe'],
    ['create', 'database/creds/orders-ro'],
    ['update', 'transit/encrypt/pii'],
    ['read', 'aws/creds/deployer'],
    ['renew-self', 'auth/token'],
  ],
};

const SOURCES = {
  aws: ['10.40.12.8 (vpc-prod)', '3.91.204.17 (NAT us-east-1)', 'lambda.amazonaws.com', 'eks.amazonaws.com'],
  azure: ['20.62.134.9 (GitHub Actions)', '10.1.4.20 (aks-prod-weu)', '52.168.12.40 (Azure Functions)'],
  github: ['140.82.112.4 (GitHub Actions)', '35.231.145.151 (Argo CD)', '81.2.69.160'],
  bitbucket: ['18.205.93.0 (Bitbucket Pipelines)', '10.20.0.5 (jenkins-legacy)', '81.2.69.160'],
  vault: ['10.40.0.0/16 (k8s prod)', '10.20.0.5 (jenkins-legacy)', '172.31.8.14 (batch)'],
};

/** The newest entries for one identity in its application's log. */
export function eventsFor(identity, count = 36) {
  if (!identity?.lastUsedAt) return [];
  let seed = hashString(identity.id);
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const actions = ACTIONS[identity.provider];
  const sources = SOURCES[identity.provider];
  const out = [];
  let t = Math.min(ANCHOR, Date.parse(identity.lastUsedAt));
  for (let k = 0; k < count; k += 1) {
    const [action, target] = actions[Math.floor(rnd() * actions.length)];
    const denied = rnd() < 0.06;
    out.push({
      id: `${identity.id}-e${k}`,
      at: new Date(t).toISOString(),
      action,
      target,
      source: sources[Math.floor(rnd() * sources.length)],
      result: denied ? 'denied' : 'success',
      region: identity.region,
    });
    t -= Math.floor(rnd() * (identity.status === 'active' ? 50 : 9000) * 60e3);
  }
  return out;
}
