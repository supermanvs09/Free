import { T } from '../components/visuals/ProductTour.jsx';
import { ZCAPS } from './zenstra.js';

/* Product pages (one template: pages/Product.jsx). Visual types:
   tour (product console with capability tabs), panel (one capability),
   table (ad-hoc table in the same UI), detail (identity risk walkthrough).
   Third-party statistics carry their source; product figures are
   attributed to Deep Algorithms. All UI data is illustrative. */

const GARTNER = { v: '40%+', l: 'of agentic AI projects will be cancelled by the end of 2027, due to costs, unclear value or weak risk controls', s: 'Gartner, June 2025' };
const IBM = { v: '$4.88M', l: 'average global cost of a data breach in 2024, an all-time high', s: 'IBM Cost of a Data Breach, 2024' };

export const PRODUCTS = {
  zenstra: {
    layout: 'hub', theme: 'agents',
    path: '/agentic-ai/agentic-identity', line: 'Zenstra AI', name: 'Zenstra AI',
    seoTitle: 'Zenstra AI: Runtime Security for AI Agents',
    description: 'Zenstra AI discovers every AI agent, MCP server and copilot, gives each one an owner and scoped access, and checks every action against its task before it runs.',
    hero: { tone: 'brand', lead: 'Runtime Security for', rotate: ['AI Agents', 'MCP Servers', 'Copilots', 'Agent Workflows'],
      sub: 'Discover every AI agent, give it an owner and scoped access, and check every action against its task before it runs.',
      visual: { type: 'tour', product: 'zenstra' }, secondary: { label: 'Visit zenstra.ai', href: 'https://www.zenstra.ai' } },
    sections: [
      { eyebrow: 'DISCOVER', title: 'Every agent, MCP server and copilot in one inventory', items: [
        { label: 'Agent inventory', heading: 'Find every agent, including the shadow ones', body: 'Custom, third-party and employee-built agents across workflows, cloud and staff devices, each with its owner, platform and what it can reach.', bullets: ['Copilot Studio, Claude, Cursor, n8n, LangGraph and more', 'Agents with no owner flagged for assignment', 'Risk ranked by access and behaviour'], visual: { type: 'panel', product: 'zenstra', cap: 0 } },
        { label: 'MCP security', heading: 'Trust MCP servers on purpose', body: 'Allow-list MCP servers per agent and catch unofficial or changed tools before an agent calls them.', visual: { type: 'panel', product: 'zenstra', cap: 2 } },
      ] },
      { eyebrow: 'ENFORCE', title: 'Every action checked before it runs', items: [
        { label: 'Runtime enforcement', heading: 'Allow, block, contain or ask, inline', body: 'A gateway inside your VPC checks each tool call against the agent’s declared task and grant. Payloads never leave your cloud.', bullets: ['Decisions in milliseconds', 'Human approval for high-impact actions', 'No agent rewrite'], visual: { type: 'panel', product: 'zenstra', cap: 1 } },
        { label: 'Agent identity', heading: 'An owner, a purpose and short-lived access', body: 'Each agent gets scoped grants that expire with the task, and a risk analysis that explains exactly why it is risky.', visual: { type: 'detail', variant: 'agent' } },
      ] },
      { eyebrow: 'PROVE', title: 'A decision record your auditor can read', items: [
        { label: 'Decision record', heading: 'Agent, task, policy and outcome on one line', body: 'Every decision is recorded and tamper-evident, ready for SOC 2, ISO/IEC 42001 and DPDPA questions.', visual: { type: 'panel', product: 'zenstra', cap: 3 } },
      ] },
    ],
    stats: [GARTNER, { v: '15:1', l: 'non-human to human identities in the average enterprise', s: 'Deep Algorithms Research' }, { v: '0', l: 'alerts raised when an authorised agent misuses legitimate access', s: 'Deep Algorithms Research' }],
    onboarding: { title: 'Works with the agents you already run', items: [
      { icon: 'MagnifyingGlass', title: 'Discovery first', body: 'See every agent and MCP server before you write a single policy.' },
      { icon: 'Cloud', title: 'Runs in your cloud', body: 'The gateway sits in your VPC. Prompts and payloads stay with you.' },
      { icon: 'Plug', title: 'No agent rewrite', body: 'Works with the platforms your teams already build on.' },
    ], logos: ['claude', 'gemini', 'copilot', 'cursor', 'mcp', 'n8n', 'zapier', 'langgraph', 'gcp', 'kubernetes', 'terraform', 'aws'] },
    research: ['ai-security-intelligence', 'ai-agent-governance', 'ai-security'],
    cta: { title: 'Let AI agents act. Keep every action accountable.', body: 'See Zenstra enforce a live policy against your own agent, in your own cloud.' },
    modules: ['zdiscovery', 'zidentity', 'zenforce', 'zmcp', 'zdetect', 'zrecord'],
  },

  adapid: {
    layout: 'tour', theme: 'human',
    path: '/adapid-ai', line: 'adapID AI', name: 'adapID AI',
    seoTitle: 'adapID AI: Continuous Identity Risk Management',
    description: 'adapID AI scores every human and machine identity continuously, stops identity fraud and closes Active Directory attack paths before credentials become a breach.',
    hero: { tone: 'navy', lead: 'Continuous Risk Management for', rotate: ['Human Identities', 'Machine Identities', 'Service Accounts', 'Customer Logins'],
      sub: 'adapID AI learns how every identity normally behaves and acts the moment that changes, before stolen credentials become a breach.',
      visual: { type: 'tour', product: 'adapid' } },
    sections: [
      { eyebrow: 'CIRM', title: 'A live risk score for every person', items: [
        { label: 'Identity risk', heading: 'Behaviour, not just credentials', body: 'A baseline for every user from your IdP, IAM, HR and SaaS logs. Deviations raise the score with the reasons attached.', bullets: ['Detection from day one, without a 30-day learning wait', 'Explainable 0 to 100 score', 'Step-up, session hold or block by policy'], visual: { type: 'panel', product: 'adapid', cap: 1 } },
        { label: 'Risk analysis', heading: 'Know why, then fix it', body: 'Each high-risk identity opens on its access graph and a plain-language summary of what changed.', visual: { type: 'detail', variant: 'human' } },
      ] },
      { eyebrow: 'MACHINE IDENTITIES', title: 'Non-human identities, discovered and scored', items: [
        { label: 'NHI Security for AWS', heading: 'Every role, key and workload identity', body: 'Agentless discovery across AWS accounts, posture scoring and a behavioural baseline for every workload.', link: '/adapid-ai/nhi-security', visual: { type: 'panel', product: 'adapid', cap: 0 } },
      ] },
      { eyebrow: 'FRAUD AND ACTIVE DIRECTORY', title: 'Stop misuse where it starts', items: [
        { label: 'Fraud prevention', heading: 'Every login, payee and payment scored', body: 'Device, behaviour, identity graph and transaction context fused into one decision in under 80 ms.', link: '/adapid-ai/fraud-prevention', visual: { type: 'panel', product: 'adapid', cap: 2 } },
        { label: 'AD attack paths', heading: 'Close the paths before they are taken', body: 'Every route to Domain Admins mapped and ranked by reach, with the single change that closes the most.', link: '/ad-security', visual: { type: 'panel', product: 'adapid', cap: 3 } },
      ] },
    ],
    stats: [IBM, { v: '94%', l: 'success rate of identity-centric attacks in our analysis', s: 'Deep Algorithms Research, 2026' }, { v: '0', l: 'average alerts generated while those attacks ran', s: 'Deep Algorithms Research, 2026' }],
    onboarding: { title: 'Connects to your identity sources', items: [
      { icon: 'Plug', title: 'Read-only connectors', body: 'IdP, IAM, HR systems, SaaS and application logs.' },
      { icon: 'Lightning', title: 'Day-one detection', body: 'Transfer learning means no long baselining period.' },
      { icon: 'ClipboardText', title: 'Evidence built in', body: 'Every decision logged for DPDPA, RBI and SEBI review.' },
    ], logos: ['okta', 'ad', 'm365', 'google', 'aws', 'github', 'atlassian'] },
    modules: ['nhi', 'fraud', 'ad'],
    research: ['identity-security', 'threat-intelligence', 'confessions-entry-01'],
    cta: { title: 'Stop the breach that starts with a login.', body: 'Run CIRM on your own identity data with a Deep Algorithms engineer.' },
  },

  nhi: {
    layout: 'split', theme: 'machine',
    path: '/adapid-ai/nhi-security', line: 'adapID AI', name: 'NHI Security for AWS', parent: '/adapid-ai',
    seoTitle: 'NHI Security for AWS: Discover, Score and Baseline Machine Identities',
    description: 'adapID NHI Security discovers every IAM role, user, key and workload identity across your AWS accounts, scores its posture, maps what it can reach and learns how it behaves.',
    hero: { tone: 'navy', lead: 'NHI Security for', rotate: ['IAM Roles', 'Access Keys', 'Lambda Functions', 'CI/CD Pipelines'],
      sub: 'Discover every machine identity across your AWS accounts, score its posture and catch the one that starts behaving differently.',
      visual: { type: 'panel', product: 'adapid', cap: 0, title: 'Non-Human Identities' } },
    sections: [
      { eyebrow: 'DISCOVER', title: 'Every role, user, key and workload identity', items: [
        { label: 'Inventory', heading: 'One view across accounts and regions', body: 'Connect each AWS account with one read-only IAM role. Identities, credentials and trust relationships are discovered on every sync.', bullets: ['IAM roles, users, service-linked roles and workload identities', 'Owner, network exposure and bound credentials', 'Every change since the last sync, with the CloudTrail call behind it'], visual: { type: 'panel', product: 'adapid', cap: 0 } },
      ] },
      { eyebrow: 'SECURE', title: 'Posture, access and behaviour for each identity', items: [
        { label: 'Posture and access', heading: 'Granted is not the same as used', body: 'Each identity is scored from 100 down by the checks it fails. The access graph shows who can assume what, and 90 days of CloudTrail show what is actually used.', visual: { type: 'detail', variant: 'nhi' } },
        { label: 'NHI Genome', heading: 'A behavioural baseline per workload', body: 'Each workload identity learns its normal calls, resources and schedule. Departures are graded, explained and sent for review.', visual: { type: 'table', title: 'NHI Genome', spec: { grid: '1.4fr 1.8fr 1fr .9fr', cols: ['Identity', 'Departure from baseline', 'Baseline', 'Status'], rows: [
          [T.name('aws', 'lambda-kyc-sync'), T.txt('GetSecretValue from eu-west-1'), T.txt('30 days'), T.chip('Needs review', 'amber')],
          [T.name('aws', 'ecs-notify-svc'), T.txt('New S3 bucket read, 2:14 am'), T.txt('Established'), T.chip('Malicious', 'coral')],
          [T.name('aws', 'glue-ledger-etl'), T.txt('Job ran 3x usual volume'), T.txt('Established'), T.chip('Legitimate', 'green')],
          [T.name('aws', 'sm-fraud-train'), T.txt('Called iam:PassRole'), T.txt('Learning'), T.chip('Needs review', 'amber')],
          [T.name('aws', 'stepfn-payouts'), T.txt('Within baseline'), T.txt('Established'), T.chip('Healthy', 'green')],
        ] } } },
        { label: 'Exposed secrets', heading: 'Keys that ended up in code', body: 'Secrets found in GitHub and AWS CodeCommit, triaged by models so analysts see real exposures first, with full-history deep scans on demand.', visual: { type: 'table', title: 'Credential Exposure', spec: { grid: '1.3fr 1.5fr .9fr 1fr', cols: ['Secret', 'Where', 'Found', 'Verdict'], rows: [
          [T.name('aws', 'AKIA••••7Q2F'), T.txt('payments-api/config.yml'), T.txt('2 days ago'), T.chip('Real secret', 'coral')],
          [T.name('github', 'ghp_••••x91'), T.txt('infra/deploy.sh'), T.txt('Today'), T.chip('Real secret', 'coral')],
          [T.name('aws', 'AKIA••••EXAMPLE'), T.txt('docs/setup.md'), T.txt('1 week ago'), T.chip('Known harmless', 'green')],
          [T.name('github', 'db_password'), T.txt('3 places in one commit'), T.txt('Yesterday'), T.chip('Repeated value', 'amber')],
          [T.name('aws', 'arn:aws:iam::…'), T.txt('README.md'), T.txt('3 days ago'), T.chip('Likely false alarm', 'blue')],
        ] } } },
      ] },
    ],
    stats: [{ v: '15:1', l: 'non-human to human identities in the average enterprise', s: 'Deep Algorithms Research' }, { v: '90 days', l: 'of CloudTrail compared with granted permissions to find what is never used', s: 'adapID NHI Security' }, { v: '26', l: 'AWS workload families with behavioural baselines, from Lambda to SageMaker', s: 'adapID NHI Security' }],
    onboarding: { title: 'Connect an AWS account in minutes', items: [
      { icon: 'LockKey', title: 'One read-only role', body: 'Agentless. Nothing is installed on workloads and nothing is written to your accounts.' },
      { icon: 'CheckCircle', title: 'Three connection checks', body: 'Access is verified before the first sync is queued.' },
      { icon: 'Users', title: 'Built for teams', body: 'Accept, suppress, assign or reopen findings, with every decision recorded.' },
    ], logos: ['aws', 'github'] },
    modules: ['adapid', 'fraud', 'ad'],
    research: ['identity-security', 'ai-security', 'threat-intelligence'],
    cta: { title: 'Know every machine identity in your cloud. Today.', body: 'Connect a sandbox account with a read-only role and walk through the results with our engineers.' },
  },

  fraud: {
    layout: 'ledger', theme: 'human',
    path: '/adapid-ai/fraud-prevention', line: 'adapID AI', name: 'Identity Fraud Prevention', parent: '/adapid-ai',
    seoTitle: 'adapID Identity Fraud Prevention: Stop Account Takeover and Mule Accounts',
    description: 'adapID fuses device, behaviour, identity graph and transaction signals into one real-time decision to stop account takeover, synthetic identities and mule accounts.',
    hero: { tone: 'navy', lead: 'Fraud Prevention for', rotate: ['Net Banking', 'UPI Payments', 'Mobile Apps', 'Onboarding'],
      sub: 'One decision engine across device, behaviour, identity graph and transaction context. Every login, payee and payment scored before it clears.',
      visual: { type: 'panel', product: 'adapid', cap: 2, title: 'Fraud Decisions' } },
    sections: [
      { eyebrow: 'DECIDE', title: 'Five signals. One decision.', items: [
        { label: 'Real-time decisions', heading: 'Scored before money moves', body: 'Device intelligence, behavioural biometrics, the identity thread, network and transaction context fused per event.', bullets: ['Account takeover and SIM-swap detection', 'Synthetic identity checks at onboarding', 'Every decision explained and logged'], visual: { type: 'panel', product: 'adapid', cap: 2 } },
        { label: 'Mule accounts', heading: 'Stop mules at the payee', body: 'Payees are scored the moment they are added, against registries and cross-account device links.', visual: { type: 'table', title: 'Payee Risk', spec: { grid: '1.3fr 1.5fr 1fr 1fr', cols: ['Payee', 'Signal', 'Linked accounts', 'Decision'], rows: [
          [T.who('Sunil Verma'), T.txt('Same device as 22 other accounts'), T.txt('23'), T.chip('Blocked', 'coral')],
          [T.who('Anita Desai'), T.txt('First payee, ₹2,40,000 transfer'), T.txt('1'), T.chip('Hold 4 h', 'amber')],
          [T.who('Kiran Patil'), T.txt('Known payee, usual amount'), T.txt('1'), T.chip('Approved', 'green')],
          [T.who('Rakesh Gupta'), T.txt('Account opened 6 days ago'), T.txt('4'), T.chip('Review', 'amber')],
          [T.who('Nisha Rao'), T.txt('Reported in national registry'), T.txt('9'), T.chip('Blocked', 'coral')],
        ] } } },
      ] },
    ],
    stats: [{ v: '26.5 lakh+', l: 'mule accounts identified by I4C as of December 2025', s: 'I4C, via Deep Algorithms Research' }, { v: '₹20,000 Cr', l: 'siphoned through mule networks, with under half recovered', s: 'I4C, via Deep Algorithms Research' }, { v: '< 80 ms', l: 'risk decision at every event', s: 'Deep Algorithms benchmark' }],
    onboarding: { title: 'Built for regulated payments', items: [
      { icon: 'Bank', title: 'RBI aligned', body: 'Supports digital payment security and authentication expectations.' },
      { icon: 'Lightning', title: 'Low friction', body: 'Good customers pass silently; step-up only where risk rises.' },
      { icon: 'ClipboardText', title: 'Explainable', body: 'Every contributing signal is kept for review and audit.' },
    ] },
    modules: ['adapid', 'nhi', 'ad'],
    research: ['india-mule-account-crisis', 'mythos-ai-banking-threat', 'ctem-bot-defence-fintech'],
    cta: { title: 'Stop the fraud before the money moves.', body: 'See live risk decisions on a sample of your sessions, with every signal explained.' },
  },

  ad: {
    layout: 'ledger', theme: 'human',
    path: '/ad-security', line: 'adapID AI', name: 'Active Directory Security', parent: '/adapid-ai',
    seoTitle: 'adapID Active Directory Security: Map and Close Attack Paths',
    description: 'See every account, privilege and path through Active Directory, catch the accounts being abused and close attack paths before they are taken.',
    hero: { tone: 'navy', lead: 'Active Directory Security for', rotate: ['Domain Admins', 'Service Accounts', 'Nested Groups', 'Hybrid Identity'],
      sub: 'See every account, privilege and path through Active Directory, and catch the account that starts behaving unlike itself.',
      visual: { type: 'panel', product: 'adapid', cap: 3, title: 'Attack Paths' } },
    sections: [
      { eyebrow: 'MAP', title: 'Six hops is the whole breach', items: [
        { label: 'Attack paths', heading: 'Every route to high-value identities', body: 'Paths ranked by how far they reach, with the one change that closes the most.', bullets: ['Nested privilege and delegation', 'Stale and orphaned accounts', 'GPO and trust weaknesses'], visual: { type: 'panel', product: 'adapid', cap: 3 } },
        { label: 'Live detection', heading: 'Catch the technique in progress', body: 'Per-identity baselines across Kerberos, NTLM and LDAP, with automatic containment.', visual: { type: 'table', title: 'AD Detections', spec: { grid: '1.3fr 1.3fr .9fr 1.1fr', cols: ['Technique', 'Identity', 'Seen', 'Response'], rows: [
          [T.txt('Kerberoasting'), T.name('ad', 'svc-sql-report'), T.txt('09:42'), T.chip('Password rotated', 'green')],
          [T.txt('Pass-the-hash'), T.who('r.kapoor'), T.txt('09:31'), T.chip('Sessions revoked', 'green')],
          [T.txt('DCSync attempt'), T.name('ad', 'WKS-2140'), T.txt('09:30'), T.chip('Host isolated', 'coral')],
          [T.txt('AS-REP roasting'), T.who('legacy-scan'), T.txt('Yesterday'), T.chip('Pre-auth enforced', 'green')],
          [T.txt('Golden ticket'), T.txt('None detected'), T.txt('7 days'), T.chip('Covered', 'blue')],
        ] } } },
      ] },
    ],
    stats: [{ v: '6', l: 'hops from one compromised user to Domain Admins in a typical path', s: 'Deep Algorithms Research' }, { v: '10', l: 'core AD techniques covered, from Kerberoasting to DCSync', s: 'adapID AD Security' }, IBM],
    onboarding: { title: 'Understand your directory in a day', items: [
      { icon: 'TreeStructure', title: 'Full directory map', body: 'Users, groups, computers, service accounts, GPOs and trusts.' },
      { icon: 'Eye', title: 'Behaviour baselines', body: 'Each identity profiled by when, where and against what.' },
      { icon: 'ShieldCheck', title: 'Fix or contain', body: 'Remove weak access at the source, or stop live abuse in seconds.' },
    ], logos: ['ad', 'm365'] },
    modules: ['adapid', 'nhi', 'fraud'],
    research: ['confessions-entry-01', 'identity-security', 'threat-intelligence'],
    cta: { title: 'See the path before it is taken', body: 'Run an attack path assessment on your directory with our engineers.' },
  },

  botshield: {
    layout: 'split', theme: 'bots',
    path: '/botshield-ai', line: 'BotShield AI', name: 'BotShield AI',
    seoTitle: 'BotShield AI: Continuous Threat Exposure Management and Bot Defence',
    description: 'BotShield AI runs reconnaissance, red team and blue team agents in a continuous loop to find, validate and fix exploitable exposure, and stops adversarial bots by intent.',
    hero: { tone: 'brand', lead: 'Exposure Management for', rotate: ['APIs', 'Login Flows', 'Payment Journeys', 'Bot Traffic'],
      sub: 'Agents map your environment, prove what is exploitable and deploy protection, continuously, while bot defence stops automation by intent.',
      visual: { type: 'tour', product: 'botshield' } },
    sections: [
      { eyebrow: 'EXPOSE', title: 'Only exploitable findings reach your teams', items: [
        { label: 'Exposure management', heading: 'Discover, simulate, validate, fix', body: 'A reconnaissance agent maps every asset, a red team agent proves what is exploitable and a blue team agent deploys protection and routes the fix.', bullets: ['Continuous, not quarterly', 'Virtual patches without waiting for a release', 'Fixes routed to the owning team'], visual: { type: 'panel', product: 'botshield', cap: 0 } },
        { label: 'Bot defence', heading: 'Intent, not signatures', body: 'Credential stuffing, scraping, OTP abuse and fake sign-ups identified by behaviour, even when they rotate identities.', visual: { type: 'panel', product: 'botshield', cap: 1 } },
      ] },
      { eyebrow: 'AVAILABILITY', title: 'DDoS protection at the edge', items: [
        { label: 'DDoS mitigation', heading: 'L3 to L7, inline, without diversion', body: 'Volumetric, protocol and application-layer attacks mitigated close to users, with no traffic detour.', link: '/botshield-ai/ddos-protection', visual: { type: 'panel', product: 'botshield', cap: 2 } },
      ] },
    ],
    stats: [{ v: '₹24 lakh Cr+', l: 'moved through UPI in a single month in early 2026', s: 'NPCI, via Deep Algorithms Research' }, { v: 'Hours', l: 'for adversarial bots to adapt, against weeks for signature updates', s: 'Deep Algorithms Research' }, IBM],
    onboarding: { title: 'Starts producing validated findings in days', items: [
      { icon: 'MagnifyingGlass', title: 'Attack surface mapped', body: 'Domains, APIs and login flows discovered automatically.' },
      { icon: 'Crosshair', title: 'Validated, not guessed', body: 'Every finding is replayed before it is raised.' },
      { icon: 'ShieldCheck', title: 'Protection deployed', body: 'Virtual patches and bot rules applied while fixes ship.' },
    ], logos: ['cloudflare', 'aws', 'gcp', 'kubernetes'] },
    modules: ['ddos'],
    research: ['ctem-bot-defence-fintech', 'ddos-mitigation-strategy-2026', 'ctem-dpdpa-india-2026'],
    cta: { title: 'The attack is autonomous. Your defence has to be too.', body: 'Watch the agent loop discover, validate and fix exposures in a 30-minute session.' },
  },

  ddos: {
    layout: 'split', theme: 'bots',
    path: '/botshield-ai/ddos-protection', line: 'BotShield AI', name: 'DDoS Protection', parent: '/botshield-ai',
    seoTitle: 'BotShield DDoS Protection: Always-On L3 to L7 Mitigation',
    description: 'BotShield AI protects applications, APIs and digital services from volumetric, protocol and application-layer DDoS at the edge, inline, without traffic diversion.',
    hero: { tone: 'brand', lead: 'DDoS Protection for', rotate: ['Web Apps', 'APIs', 'Citizen Services', 'Checkout'],
      sub: 'Inline, edge-ready protection against modern DDoS and AI-driven floods, without added latency or user friction.',
      visual: { type: 'panel', product: 'botshield', cap: 2, title: 'DDoS Mitigation' } },
    sections: [
      { eyebrow: 'MITIGATE', title: 'Always on. Always inline.', items: [
        { label: 'Mitigation', heading: 'Stopped in seconds, close to users', body: 'Deployed inside ISP and near-edge networks: no diversion, no extra hops, no latency penalty.', bullets: ['Volumetric, protocol and application-layer coverage', 'Automatic rate limiting, shaping and blocking', 'One control plane for SOC and NOC teams'], visual: { type: 'panel', product: 'botshield', cap: 2 } },
        { label: 'Human-like floods', heading: 'Attacks that look like users', body: 'Behavioural detection separates real surges from application-layer floods that evade rate limits.', visual: { type: 'panel', product: 'botshield', cap: 1 } },
      ] },
    ],
    stats: [{ v: 'L3 to L7', l: 'full-stack coverage, volumetric to application layer', s: 'BotShield AI' }, { v: 'Zero', l: 'traffic diversion required', s: 'BotShield AI' }, { v: '99.99%', l: 'availability SLA', s: 'Deep Algorithms' }],
    onboarding: { title: 'Fits the network you have', items: [
      { icon: 'Globe', title: 'Close to your users', body: 'Deployed inside ISP and near-edge networks.' },
      { icon: 'Lightning', title: 'No manual tuning', body: 'Mitigation adapts to traffic automatically.' },
      { icon: 'Gauge', title: 'Clear visibility', body: 'Every attack, response and outcome in one place.' },
    ] },
    modules: ['botshield'],
    research: ['ddos-mitigation-strategy-2026', 'ctem-bot-defence-fintech'],
    cta: { title: 'Stay online. Stay fast. Stay protected.', body: 'Talk to us about inline, edge-ready protection for your digital services.' },
  },

  icms: {
    layout: 'tour', theme: 'compliance',
    path: '/dpdpa-compliance', line: 'ICMS Compliance Suite', name: 'ICMS Compliance Suite',
    seoTitle: 'ICMS Compliance Suite: Automated DPDPA Compliance and Evidence',
    description: 'ICMS discovers personal data, checks every access against purpose and consent, and generates audit-ready evidence for DPDPA 2023, RBI and SEBI automatically.',
    hero: { tone: 'navy', lead: 'DPDPA Compliance for', rotate: ['Customer Data', 'Patient Records', 'Employee Data', 'Consent'],
      sub: 'Every access to personal data checked against purpose and consent, with audit-ready evidence generated as it happens.',
      visual: { type: 'tour', product: 'icms' } },
    sections: [
      { eyebrow: 'DISCOVER', title: 'Know where personal data lives', items: [
        { label: 'Data discovery', heading: 'Every store, every owner', body: 'Personal data found across structured and unstructured stores, including the places it should not be.', visual: { type: 'panel', product: 'icms', cap: 0 } },
      ] },
      { eyebrow: 'MONITOR', title: 'Purpose and consent on every access', items: [
        { label: 'Access monitoring', heading: 'Who touched what, and why', body: 'Every access is linked to an identity, human or machine, and checked against its declared purpose.', bullets: ['Access outside consent flagged instantly', 'Service accounts included', 'Breach workflows ready for the 72-hour report'], visual: { type: 'panel', product: 'icms', cap: 1 } },
        { label: 'Consent', heading: 'Consent you can enforce', body: 'Track, enforce and audit data principal consent across every touchpoint.', visual: { type: 'panel', product: 'icms', cap: 2 } },
      ] },
      { eyebrow: 'PROVE', title: 'Evidence in minutes, not weeks', items: [
        { label: 'Audit evidence', heading: 'One-click audit packages', body: 'Evidence assembled continuously and mapped to DPDPA, RBI and SEBI obligations.', visual: { type: 'panel', product: 'icms', cap: 3 } },
      ] },
    ],
    stats: [{ v: '₹250 Cr', l: 'maximum penalty for failing to safeguard personal data', s: 'DPDPA 2023' }, { v: '72 hrs', l: 'to report a personal data breach in full to the Data Protection Board', s: 'DPDP Rules 2025' }, { v: '< 5 min', l: 'to generate an audit package', s: 'Deep Algorithms benchmark' }],
    onboarding: { title: 'Built for India’s regulations', items: [
      { icon: 'Scales', title: 'India-first', body: 'Designed around DPDPA 2023 and RBI Master Directions.' },
      { icon: 'Fingerprint', title: 'Identity-linked', body: 'Every access tied to a person or a machine identity.' },
      { icon: 'Globe', title: 'GDPR aligned', body: 'The same evidence model supports global obligations.' },
    ], logos: ['aws', 'snowflake', 'databricks', 'm365', 'google'] },
    research: ['ctem-dpdpa-india-2026', 'india-mule-account-crisis'],
    cta: { title: 'Regulation is real-time. So is our compliance.', body: 'Book a DPDPA gap analysis with a compliance engineer.' },
  },
  ...ZCAPS,
};

export { CARD } from './site.js';
