/* The information architecture, in one place (docs/redesign/INFORMATION_ARCHITECTURE.md).
   The header menus, the mobile drawer, the footer and the sitemap page all
   read from here, so the product hierarchy cannot drift between them again.
   Vocabulary: Platform (adapID AI, Zenstra AI), Suite (ICMS), Product (the four
   adapID products), Capability (the six Zenstra capabilities). */

export const PLATFORMS = [
  {
    key: 'adapid', name: 'adapID AI', kind: 'Platform', acc: 'var(--color-adap)', path: '/adapid-ai',
    tagline: 'Identity security for every human and machine identity',
    items: [
      { key: 'cirm', name: 'Continuous Identity Risk Management', short: 'CIRM', desc: 'A live, explained risk score for every identity', path: '/adapid-ai/continuous-identity-risk-management', icon: 'Gauge', need: ['people'] },
      { key: 'nhi', name: 'NHI Security for AWS', desc: 'Every IAM role, key and workload identity, right-sized', path: '/adapid-ai/nhi-security', icon: 'Cloud', need: ['machine'] },
      { key: 'fraud', name: 'Identity Fraud Prevention', desc: 'Mobile and internet banking, from login to payment', path: '/adapid-ai/fraud-prevention', icon: 'CreditCard', need: ['payments', 'people'] },
      { key: 'ad', name: 'Active Directory Security', desc: 'Attack paths to Domain Admins, closed', path: '/adapid-ai/active-directory-security', icon: 'TreeStructure', need: ['ad', 'people', 'machine'] },
    ],
  },
  {
    key: 'zenstra', name: 'Zenstra AI', kind: 'Platform', acc: 'var(--color-zen)', path: '/agentic-ai/agentic-identity',
    tagline: 'Security for AI agents, from discovery to decision record',
    groups: [
      { name: 'Discover and govern', items: ['zdiscovery', 'zidentity', 'zmcp'] },
      { name: 'Enforce and prove', items: ['zenforce', 'zdetect', 'zrecord'] },
    ],
    items: [
      { key: 'zdiscovery', name: 'Agent Discovery', desc: 'Every agent, including the shadow ones', path: '/agentic-ai/agent-discovery', icon: 'MagnifyingGlass', need: ['agents'] },
      { key: 'zidentity', name: 'Agent Identity and Access', desc: 'An owner, a task and access that expires', path: '/agentic-ai/agent-access', icon: 'Fingerprint', need: ['agents'] },
      { key: 'zenforce', name: 'Runtime Enforcement', desc: 'Allow, hold or block every tool call', path: '/agentic-ai/runtime-enforcement', icon: 'ShieldCheck', need: ['agents'] },
      { key: 'zmcp', name: 'MCP Security', desc: 'MCP servers allow-listed per agent', path: '/agentic-ai/mcp-security', icon: 'PlugsConnected', need: ['agents'] },
      { key: 'zdetect', name: 'Detection and Response', desc: 'Misuse of legitimate access, contained', path: '/agentic-ai/detection-response', icon: 'Pulse', need: ['agents'] },
      { key: 'zrecord', name: 'Decision Record', desc: 'Tamper-evident evidence for auditors', path: '/agentic-ai/decision-record', icon: 'ClipboardText', need: ['agents'] },
    ],
  },
  {
    key: 'icms', name: 'ICMS Compliance Suite', kind: 'Suite', acc: 'var(--color-icms)', path: '/dpdpa-compliance',
    tagline: 'Personal data protection and DPDPA compliance',
    items: [
      { key: 'icms-discover', name: 'Personal data discovery', desc: 'PII found and classified across your stores', path: '/dpdpa-compliance#pii-map', icon: 'Database', need: ['data'] },
      { key: 'icms-consent', name: 'Purpose and consent checks', desc: 'Every access checked against its purpose', path: '/dpdpa-compliance#duties', icon: 'Scales', need: ['data'] },
      { key: 'icms-breach', name: 'Breach response in 72 hours', desc: 'From detection to the Data Protection Board', path: '/dpdpa-compliance#breach', icon: 'Timer', need: ['data'] },
      { key: 'icms-evidence', name: 'Audit evidence', desc: 'For DPDPA, RBI and SEBI, generated continuously', path: '/dpdpa-compliance#evidence', icon: 'Certificate', need: ['data'] },
    ],
  },
];

export const NEEDS = [
  ['people', 'People and workforce'], ['machine', 'Machine identities'], ['agents', 'AI agents'],
  ['payments', 'Customer payments'], ['ad', 'Active Directory'], ['data', 'Personal data'],
];

export const INDUSTRIES = [
  { slug: 'bfsi', name: 'Banking and Financial Services', short: 'BFSI', desc: 'Account takeover, scams and mule accounts', icon: 'Bank', path: '/solutions/bfsi' },
  { slug: 'healthcare', name: 'Healthcare', short: 'Healthcare', desc: 'Patient data access and privileged misuse', icon: 'FirstAidKit', path: '/solutions/healthcare' },
  { slug: 'government', name: 'Government and Public Sector', short: 'Government', desc: 'Domain security and citizen data', icon: 'Buildings', path: '/solutions/government' },
  { slug: 'digital-platforms', name: 'Digital Platforms', short: 'Digital platforms', desc: 'SaaS, e-commerce and EdTech', icon: 'Browsers', path: '/solutions/digital-platforms' },
];

export const BY_NEED = [
  { name: 'Catch stolen logins', desc: 'The right password in the wrong hands', path: '/adapid-ai/continuous-identity-risk-management', icon: 'Gauge' },
  { name: 'Stop payment fraud', desc: 'Account takeover, scams and mules', path: '/adapid-ai/fraud-prevention', icon: 'CreditCard' },
  { name: 'Secure cloud identities', desc: 'Unused access and leaked keys in AWS', path: '/adapid-ai/nhi-security', icon: 'Cloud' },
  { name: 'Protect Active Directory', desc: 'Close the paths to Domain Admins', path: '/adapid-ai/active-directory-security', icon: 'TreeStructure' },
  { name: 'Secure AI agents', desc: 'Every agent owned, scoped and checked', path: '/agentic-ai/agentic-identity', icon: 'Robot' },
  { name: 'Protect personal data', desc: 'DPDPA duties, with the evidence', path: '/dpdpa-compliance', icon: 'Scales' },
];

export const RESOURCES = {
  learn: [
    { name: 'Blog and research', desc: 'Every article, newest first', path: '/blogs', icon: 'BookOpen' },
    { name: 'Identity security', path: '/blogs?topic=identity-security', icon: 'Fingerprint' },
    { name: 'AI agent security', path: '/blogs?topic=ai-agent-security', icon: 'Robot' },
    { name: 'Financial crime', path: '/blogs?topic=financial-crime', icon: 'Bank' },
  ],
  explore: [
    { name: 'Prompt Heist', desc: 'Our prompt-injection challenge', path: '/prompt-heist', icon: 'Trophy' },
    { name: 'In the news', desc: 'Press, interviews and events', path: '/about-us#news', icon: 'Newspaper' },
  ],
};

export const COMPANY = [
  { name: 'About Deep Algorithms', desc: 'Our story, milestones and recognition', path: '/about-us', icon: 'Buildings' },
  { name: 'Why Deep Algorithms', desc: 'How our approach is different', path: '/why-deep-algorithms', icon: 'Target' },
  { name: 'Leadership', desc: 'Founders, leaders and advisors', path: '/about-us#leadership', icon: 'Users' },
  { name: 'Careers', desc: 'Build the defence attackers think about', path: '/careers', icon: 'Briefcase' },
  { name: 'Contact', desc: 'Offices, email and phone', path: '/contact', icon: 'EnvelopeSimple' },
];

/* Breadcrumb trail for a path, derived from the tree. */
export function trail(path) {
  for (const p of PLATFORMS) {
    if (p.path === path) return [{ name: 'Products', path: '/products' }, { name: p.name }];
    const it = p.items.find((i) => i.path === path);
    if (it) return [{ name: 'Products', path: '/products' }, { name: p.name, path: p.path }, { name: it.name }];
  }
  const ind = INDUSTRIES.find((i) => i.path === path);
  if (ind) return [{ name: 'Solutions' }, { name: ind.name }];
  return [];
}
export const allProducts = () => PLATFORMS.flatMap((p) => p.items.filter((i) => !i.path.includes('#')).map((i) => ({ ...i, platform: p })));
