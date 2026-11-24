/* Menu content. Text only, as enterprise security sites do it: a name and one
   line per item, grouped by product line. adapID AI is a family of four
   products; Zenstra AI and ICMS are single platforms, so their
   columns list what the platform covers. */
export const PRODUCT_MENU = [
  {
    key: 'adapid', name: 'adapID AI', acc: 'var(--color-adap)', tag: '4 products', path: '/adapid-ai',
    blurb: 'Security for human and machine identities',
    kind: 'products',
    items: [
      { name: 'Continuous Identity Risk Management', desc: 'A live risk score for every person', path: '/adapid-ai' },
      { name: 'NHI Security for AWS', desc: 'Every role, key and workload identity', path: '/adapid-ai/nhi-security' },
      { name: 'Identity Fraud Prevention', desc: 'Mobile and internet banking, login to payment', path: '/adapid-ai/fraud-prevention' },
      { name: 'Active Directory Security', desc: 'Attack paths to Domain Admins', path: '/ad-security' },
    ],
  },
  {
    key: 'zenstra', name: 'Zenstra AI', acc: 'var(--color-zen)', tag: 'Platform', path: '/agentic-ai/agentic-identity',
    blurb: 'Security for AI agents, in one platform',
    kind: 'platform',
    covers: 'For copilots, cloud agents, workflow automations, coding agents and MCP servers.',
    items: [
      { name: 'Agent discovery', path: '/agentic-ai/agent-discovery' },
      { name: 'Agent identity and access', path: '/agentic-ai/agent-access' },
      { name: 'Runtime enforcement', path: '/agentic-ai/runtime-enforcement' },
      { name: 'MCP security', path: '/agentic-ai/mcp-security' },
      { name: 'Detection and response', path: '/agentic-ai/detection-response' },
      { name: 'Decision record', path: '/agentic-ai/decision-record' },
    ],
  },

  {
    key: 'icms', name: 'ICMS Compliance Suite', acc: 'var(--color-icms)', tag: 'Platform', path: '/dpdpa-compliance',
    blurb: 'DPDPA compliance, in one platform',
    kind: 'platform',
    covers: 'For customer data, patient records and employee data.',
    items: [
      { name: 'Personal data discovery', path: '/dpdpa-compliance#discover' },
      { name: 'Purpose and consent checks', path: '/dpdpa-compliance#consent' },
      { name: 'Breach response in 72 hours', path: '/dpdpa-compliance#breach' },
      { name: 'Audit evidence for DPDPA, RBI and SEBI', path: '/dpdpa-compliance#evidence' },
    ],
  },
];

/* Solutions by use case: what the buyer wants done, in three or four words. */
export const CHALLENGES = [
  { name: 'Catch stolen logins', desc: 'Spot the wrong person with the right password', path: '/adapid-ai', icon: 'Gauge' },
  { name: 'Secure AI agents', desc: 'Every agent owned, scoped and checked', path: '/agentic-ai/agentic-identity', icon: 'Robot' },
  { name: 'Stop payment fraud', desc: 'Account takeover, scams and mule accounts', path: '/adapid-ai/fraud-prevention', icon: 'Wallet' },
  { name: 'Secure cloud identities', desc: 'Unused access and leaked keys in AWS', path: '/adapid-ai/nhi-security', icon: 'Cloud' },
  { name: 'Protect Active Directory', desc: 'Close the paths to Domain Admins', path: '/ad-security', icon: 'TreeStructure' },
  { name: 'Protect PII for DPDPA', desc: 'Find, mask and prove every access', path: '/dpdpa-compliance', icon: 'Scales' },
];

/* What each product connects to and what it does, shown in the Products menu
   when that product is hovered. Keyed by the product's page. */
export const MENU_DETAIL = {
  adapid: { works: ['okta', 'entra', 'ad', 'aws', 'm365', 'upi', 'github', 'salesforce'], caps: ['Continuous Identity Risk Management', 'NHI Security for AWS', 'Identity Fraud Prevention', 'Active Directory Security'] },
  '/adapid-ai': { works: ['okta', 'entra', 'ad', 'google', 'm365', 'salesforce', 'slack', 'github'], caps: ['Behaviour baseline for every identity', 'Live risk score, with its reasons', 'Step-up or hold through your IdP', 'Sessions revoked across systems'] },
  '/adapid-ai/nhi-security': { works: ['aws', 'iam', 'lambda', 's3', 'rds', 'vault', 'actions', 'kubernetes'], caps: ['Role, key and workload inventory', 'Unused permissions removed', 'Leaked secrets found', 'Baselines from CloudTrail'] },
  '/adapid-ai/fraud-prevention': { works: ['upi', 'android', 'apple', 'chrome', 'visa', 'mastercard', 'paytm', 'phonepe'], caps: ['Behavioural biometrics', 'Silent TOTP and face verification', 'Device, call and SIM-swap signals', 'Mule account detection'] },
  '/ad-security': { works: ['ad', 'entra', 'windows', 'm365', 'splunk', 'vault'], caps: ['Attack paths to Domain Admins', 'Weak Kerberos tickets', 'Live abuse detection', 'Fixes, checked again'] },
  '/agentic-ai/agentic-identity': { works: ['copilotstudio', 'copilot', 'claude', 'n8n', 'langchain', 'cursor', 'mcp', 'aws'], caps: ['Agent and shadow agent discovery', 'Intent verification', 'Zero standing privilege', 'Runtime anomaly detection', 'Cryptographic audit trail'] },
  '/dpdpa-compliance': { works: ['postgres', 'mysql', 'mongodb', 'snowflake', 's3', 'm365', 'google', 'salesforce'], caps: ['PII discovery and classification', 'Masking and tokenisation', 'Purpose and consent checks', '72-hour breach response', 'Evidence for DPDPA, RBI and SEBI'] },
};

