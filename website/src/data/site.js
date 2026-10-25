export const SITE = {
  name: 'Deep Algorithms',
  url: (import.meta.env.VITE_SITE_URL || 'https://deepalgorithms.io').replace(/\/$/, ''),
  tagline: 'Fostering AI. Connecting Minds.',
  description:
    'Identity security for the AI era. Deep Algorithms discovers, secures and governs every human, non-human and AI agent identity, and stops fraud, bots and data misuse.',
  email: 'info@deepalgorithms.in',
  careersEmail: 'hr@deepalgorithms.in',
  phone: '+91 77028 46856',
  phoneHref: 'tel:+917702846856',
  linkedin: 'https://www.linkedin.com/company/deepalgorithms.in',
  legalName: 'Deep Algorithms Solution Pvt. Ltd.',
  founded: 2022,
  offices: [
    { city: 'Hyderabad', label: 'Headquarters', address: 'Shanta Sriram Tech Park, adjacent to DLF Cyber City, Gachibowli, Hyderabad 500032', map: 'https://maps.app.goo.gl/1Z2MBY91jHJ5iNG67' },
    { city: 'Bengaluru', label: 'Office', address: 'Prestige Shantiniketan, ITPL Main Road, Whitefield, Bengaluru 560048' },
    { city: 'Maryland, USA', label: 'Office', address: '23231 Aurora Hills Drive, Clarksburg, MD 20871' },
  ],
  formEndpoint: import.meta.env.VITE_FORM_ENDPOINT || 'https://asu79c3171.execute-api.ap-south-2.amazonaws.com/dev/Das_website2',
  gaId: import.meta.env.VITE_GA_ID || '',
  gscToken: import.meta.env.VITE_GSC_VERIFICATION || '',
};

/* Product lines. Zenstra owns AI agents; adapID owns human and machine
   (non-human) identities plus fraud; BotShield owns bots, exposure and DDoS;
   ICMS owns personal-data compliance. */
export const LINES = [
  {
    key: 'zenstra', name: 'Zenstra AI', summary: 'AI agent security', icon: 'Sparkle',
    path: '/agentic-ai/agentic-identity',
    modules: [{ name: 'AI Agent Security', desc: 'Discover, govern and enforce every AI agent action', path: '/agentic-ai/agentic-identity' }],
  },
  {
    key: 'adapid', name: 'adapID AI', summary: 'Human and non-human identity security', icon: 'Fingerprint',
    path: '/adapid-ai',
    modules: [
      { name: 'Identity Risk Management (CIRM)', desc: 'Continuous risk scoring for every human identity', path: '/adapid-ai' },
      { name: 'NHI Security for AWS', desc: 'Discover, score and baseline machine identities', path: '/adapid-ai/nhi-security', badge: 'New' },
      { name: 'Identity Fraud Prevention', desc: 'Stop account takeover and mule accounts', path: '/adapid-ai/fraud-prevention' },
      { name: 'Active Directory Security', desc: 'Map and close attack paths through AD', path: '/ad-security' },
    ],
  },
  {
    key: 'botshield', name: 'BotShield AI', summary: 'Bot defence, CTEM and DDoS', icon: 'ShieldCheck',
    path: '/botshield-ai',
    modules: [
      { name: 'Continuous Threat Exposure Management', desc: 'Find, validate and fix exploitable exposure', path: '/botshield-ai' },
      { name: 'DDoS Protection', desc: 'Always-on L3 to L7 mitigation at the edge', path: '/botshield-ai/ddos-protection' },
    ],
  },
  {
    key: 'icms', name: 'ICMS Compliance Suite', summary: 'DPDPA data protection', icon: 'Scales',
    path: '/dpdpa-compliance',
    modules: [{ name: 'Data Protection & Compliance', desc: 'Automated DPDPA, RBI and SEBI evidence', path: '/dpdpa-compliance' }],
  },
];

export const SOLUTIONS = [
  { slug: 'bfsi', name: 'Banking & Financial Services', desc: 'Fraud, mule accounts, RBI and DPDPA', icon: 'Bank' },
  { slug: 'healthcare', name: 'Healthcare', desc: 'Patient data access and privileged misuse', icon: 'FirstAidKit' },
  { slug: 'government', name: 'Government & Public Sector', desc: 'Citizen services and critical infrastructure', icon: 'Buildings' },
  { slug: 'digital-platforms', name: 'Digital Platforms', desc: 'SaaS, e-commerce and EdTech', icon: 'Browsers' },
];

export const CUSTOMERS = [
  ['meity', 'MeitY, Government of India'], ['canara-bank', 'Canara Bank'], ['karnataka-bank', 'Karnataka Bank'],
  ['dcb-bank', 'DCB Bank'], ['ncrtc', 'NCRTC'], ['bhaktivedanta', 'Bhaktivedanta Hospital & Research Institute'],
  ['iit-kanpur', 'IIT Kanpur'], ['iit-mandi', 'IIT Mandi'], ['iiit-hyderabad', 'IIIT Hyderabad'],
  ['ccoe', 'Cybersecurity Centre of Excellence'], ['inmorphis', 'inMorphis'], ['sdet', 'SDET'], ['silda', 'Silda Enterprise'],
  ['corecys', 'Corecys'], ['fourthsquare', 'FourthSquare'], ['vibho', 'Vibho'], ['seizure-tracker', 'Seizure Tracker'],
];

export const CERTS = [
  { code: 'ISO 27001', name: 'ISO/IEC 27001', desc: 'Information security' },
  { code: 'SOC 2', name: 'SOC 2 Type II', desc: 'Security, availability, confidentiality' },
  { code: 'ISO 42001', name: 'ISO/IEC 42001', desc: 'AI management system' },
  { code: 'ISO 27701', name: 'ISO/IEC 27701', desc: 'Privacy information management' },
];
