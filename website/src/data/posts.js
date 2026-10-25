/* Research library. Bodies live in src/content/posts/<slug>.json. Dates are
   the original publication dates; month-only originals show month and year. */
export const POSTS = [
  { slug: 'identity-security', title: 'The Attack That Never Triggers an Alert', category: 'Identity Security', date: '2026-08-01', monthOnly: true, read: 13,
    excerpt: 'Every major breach of the last decade set off at least one alert. The next generation of identity attacks will not, because they simply log in.',
    product: { name: 'adapID AI', path: '/adapid-ai' } },
  { slug: 'ai-security-intelligence', title: 'The Authority Problem: When AI Agents Gain More Control Than They Should', category: 'AI Agent Security', date: '2026-08-01', monthOnly: true, read: 14,
    excerpt: 'Why autonomous AI needs an identity model before it becomes enterprise infrastructure.',
    product: { name: 'Zenstra AI', path: '/agentic-ai/agentic-identity' } },
  { slug: 'threat-intelligence', title: 'What the Aflac Japan Breach Really Changed', category: 'Threat Intelligence', date: '2026-08-01', monthOnly: true, read: 10,
    excerpt: 'Unauthorised activity reportedly ran for about 15 days before it was contained. The question is how trusted activity continues without looking abnormal.',
    product: { name: 'adapID AI', path: '/adapid-ai' } },
  { slug: 'ai-agent-governance', title: 'The Decision No One Approved: Why AI Agent Governance Is the Next Enterprise Security Crisis', category: 'AI Agent Security', date: '2026-07-01', monthOnly: true, read: 12,
    excerpt: 'A finance analyst asked an AI assistant for a contract summary. Twelve seconds later it had crawled three years of Microsoft 365 history.',
    product: { name: 'Zenstra AI', path: '/agentic-ai/agentic-identity' } },
  { slug: 'ai-security', title: 'The New Security Boundary: Governing Autonomous AI Before It Governs Your Infrastructure', category: 'AI Agent Security', date: '2026-07-01', monthOnly: true, read: 14,
    excerpt: 'Every new technology gave security a new thing to protect. Autonomous AI breaks the pattern, because the problem is no longer access.',
    product: { name: 'Zenstra AI', path: '/agentic-ai/agentic-identity' } },
  { slug: 'india-mule-account-crisis', title: "India's Mule Account Crisis: The Problem, the Gaps and How to Fight Back", category: 'Financial Crime', date: '2026-05-01', monthOnly: true, read: 12,
    excerpt: "Mule accounts are the engine of India's ₹20,000 crore cybercrime economy. 26.5 lakh accounts identified, and detection still falls short.",
    product: { name: 'adapID Fraud Prevention', path: '/adapid-ai/fraud-prevention' } },
  { slug: 'mythos-ai-banking-threat', title: 'From Trusted Tool to Transaction Thief: The Emerging Threat of Mythos-Class AI', category: 'Threat Intelligence', date: '2026-05-01', monthOnly: true, read: 14,
    excerpt: 'A new class of AI models can break into banking systems faster than any human attacker, and without the mistakes that stopped past attacks.',
    product: { name: 'adapID AI', path: '/adapid-ai' } },
  { slug: 'confessions-entry-01', title: 'Confessions of a Hacker, Entry 01: "I Was Inside for 47 Days"', category: 'Field Notes', date: '2026-03-06', read: 7, fiction: true,
    excerpt: 'A first-person account of a 47-day undetected intrusion, and an honest look at what would have stopped it.',
    author: 'Anonymous contributor', product: { name: 'adapID AI', path: '/adapid-ai' } },
  { slug: 'ctem-dpdpa-india-2026', title: 'CTEM and DPDPA: Building Autonomous Security and Compliance in Indian Organisations', category: 'Compliance', date: '2026-03-05', read: 10,
    excerpt: 'How continuous threat exposure management and DPDPA compliance work together to secure data, enforce privacy and reduce risk.',
    product: { name: 'ICMS Compliance Suite', path: '/dpdpa-compliance' } },
  { slug: 'ctem-bot-defence-fintech', title: 'CTEM for Bot Defence in Indian Fintech', category: 'Bot Defence', date: '2026-02-18', read: 8,
    excerpt: 'Why continuous threat exposure management is the only strategy that keeps pace with adversarial bots in UPI-native environments.',
    product: { name: 'BotShield AI', path: '/botshield-ai' } },
  { slug: 'ddos-mitigation-strategy-2026', title: "DDoS Has Evolved. Your Mitigation Strategy Probably Hasn't.", category: 'Bot Defence', date: '2026-01-30', read: 11,
    excerpt: "Volumetric floods are yesterday's problem. Application-layer attacks built to look like real users are what take platforms down in 2026.",
    product: { name: 'BotShield DDoS Protection', path: '/botshield-ai/ddos-protection' } },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function formatDate(p) {
  const [y, m, d] = p.date.split('-').map(Number);
  return p.monthOnly ? `${MONTHS[m - 1]} ${y}` : `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
}
export const authorOf = (p) => p.author || 'Deep Algorithms Research';
