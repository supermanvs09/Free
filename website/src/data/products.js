import { ZCAPS } from './zenstra.js';

/* Product facts shared by the product pages, the sitemap and SEO. Each product
   has its own page under src/pages/products/. Third-party statistics carry
   their source; product figures are attributed to Deep Algorithms. All
   product UI in the pictures is illustrative. */

const GARTNER = { v: '40%+', l: 'of agentic AI projects will be cancelled by the end of 2027, due to costs, unclear value or weak risk controls', s: 'Gartner, June 2025' };
const IBM = { v: '₹25.5 Cr', l: 'average cost of a data breach in India in 2026, the highest on record', s: 'IBM Cost of a Data Breach Report, 2026' };
const NHI = { v: '82:1', l: 'machine identities for every human identity in the average organisation', s: 'CyberArk Identity Security Landscape, 2025' };

export const PRODUCTS = {
  zenstra: {
    path: '/agentic-ai/agentic-identity', line: 'Zenstra AI', name: 'Zenstra AI',
    seoTitle: 'Zenstra AI: Runtime Security for AI Agents',
    description: 'Zenstra AI discovers every AI agent, MCP server and copilot, gives each one an owner and scoped access, and checks every action against its task before it runs.',
    stats: [GARTNER, NHI, { v: '0', l: 'alerts raised when an authorised agent misuses legitimate access', s: 'Deep Algorithms Blogs' }],
    research: ['ai-security-intelligence', 'ai-agent-governance', 'ai-security'],
    cta: { title: 'Let AI agents act. Keep every action accountable.', body: 'See Zenstra enforce a live policy against your own agent, in your own cloud.' },
  },
  adapid: {
    path: '/adapid-ai', line: 'adapID AI', name: 'adapID AI', kind: 'platform',
    seoTitle: 'adapID AI: Identity Security for Human and Machine Identities',
    description: 'adapID AI secures every human and machine identity: continuous identity risk management, non-human identity security for AWS, identity fraud prevention for banking and Active Directory security, on one explainable risk engine.',
    stats: [IBM, NHI],
    research: ['identity-security', 'threat-intelligence', 'confessions-entry-01'],
    cta: { title: 'Find your riskiest identity before an attacker does.', body: 'A 30-minute session with a Deep Algorithms engineer, on identities like yours.' },
  },
  cirm: {
    path: '/adapid-ai/continuous-identity-risk-management', line: 'adapID AI', name: 'Continuous Identity Risk Management', short: 'CIRM', parent: '/adapid-ai',
    seoTitle: 'Continuous Identity Risk Management (CIRM) | adapID AI',
    description: 'adapID CIRM learns how each person and machine identity normally works, scores every session continuously with the reasons attached, and steps up, holds or contains the identity the moment behaviour changes.',
    stats: [IBM],
    research: ['identity-security', 'threat-intelligence', 'confessions-entry-01'],
    cta: { title: 'Stop the breach that starts with a login.', body: 'Run CIRM on your own identity data with a Deep Algorithms engineer.' },
  },
  nhi: {
    path: '/adapid-ai/nhi-security', line: 'adapID AI', name: 'NHI Security for AWS', parent: '/adapid-ai',
    seoTitle: 'NHI Security for AWS: Discover, Score and Baseline Machine Identities',
    description: 'adapID NHI Security discovers every IAM role, user, key and workload identity across your AWS accounts, scores its posture, maps what it can reach and learns how it behaves.',
    stats: [NHI, { v: '90 days', l: 'of CloudTrail compared with granted permissions to find what is never used', s: 'adapID NHI Security' }, { v: '26', l: 'AWS workload families with behavioural baselines, from Lambda to SageMaker', s: 'adapID NHI Security' }],
    research: ['identity-security', 'ai-security', 'threat-intelligence'],
    cta: { title: 'Know every machine identity in your cloud. Today.', body: 'Connect a sandbox account with a read-only role and walk through the results with our engineers.' },
  },
  fraud: {
    path: '/adapid-ai/fraud-prevention', line: 'adapID AI', name: 'Identity Fraud Prevention', parent: '/adapid-ai',
    seoTitle: 'adapID Identity Fraud Prevention: Stop Account Takeover, Scams and Mule Accounts',
    description: 'Fraud prevention for mobile and internet banking: behavioural biometrics, silent TOTP, device security, scam signals and transaction intelligence stop account takeover, payment scams and mule accounts, with a reason for every decision.',
    stats: [{ v: '26.5 lakh+', l: 'mule accounts identified by I4C as of December 2025', s: 'I4C, via Deep Algorithms Blogs' }, { v: '₹20,000 Cr', l: 'siphoned through mule networks, with under half recovered', s: 'I4C, via Deep Algorithms Blogs' }, { v: '< 80 ms', l: 'risk decision at every event', s: 'Deep Algorithms benchmark' }],
    research: ['india-mule-account-crisis', 'mythos-ai-banking-threat', 'trusted-identities-attack-surface'],
    cta: { title: 'See your own fraud signals, explained.', body: 'Live risk decisions on a sample of your sessions, with the reason behind every one.' },
  },
  ad: {
    path: '/adapid-ai/active-directory-security', line: 'adapID AI', name: 'Active Directory Security', parent: '/adapid-ai',
    seoTitle: 'adapID Active Directory Security: Map and Close Attack Paths',
    description: 'See every account, privilege and path through Active Directory, catch the accounts being abused and close attack paths before they are taken.',
    stats: [{ v: '6', l: 'hops from one compromised user to Domain Admins in a typical path', s: 'Deep Algorithms Blogs' }, { v: '10', l: 'core AD techniques covered, from Kerberoasting to DCSync', s: 'adapID AD Security' }, IBM],
    research: ['confessions-entry-01', 'identity-security', 'threat-intelligence'],
    cta: { title: 'See the path before it is taken.', body: 'Run an attack path assessment on your directory with our engineers.' },
  },
  icms: {
    path: '/dpdpa-compliance', line: 'ICMS Compliance Suite', name: 'ICMS Compliance Suite',
    seoTitle: 'ICMS Compliance Suite: PII Protection and DPDPA Compliance',
    description: 'ICMS discovers and classifies PII, masks it where it should not be seen, checks every access against purpose and consent, and generates audit-ready evidence for DPDPA 2023, RBI and SEBI.',
    stats: [{ v: '₹250 Cr', l: 'maximum penalty for failing to safeguard personal data', s: 'DPDPA 2023' }, { v: '72 hrs', l: 'to report a personal data breach in full to the Data Protection Board', s: 'DPDP Rules 2025' }, { v: '< 5 min', l: 'to generate an audit package', s: 'Deep Algorithms benchmark' }],
    research: ['ctem-dpdpa-india-2026', 'india-mule-account-crisis'],
    cta: { title: 'Be ready the day the Data Protection Board asks.', body: 'Book a DPDPA gap analysis with a compliance engineer.' },
  },
  ...ZCAPS,
};
