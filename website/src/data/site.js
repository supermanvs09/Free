export const SITE = {
  name: 'Deep Algorithms',
  url: 'https://deepalgorithms.io',
  tagline: 'Fostering AI. Connecting Minds.',
  description:
    'Identity security for the AI era. Deep Algorithms discovers, secures and governs every human, non-human and AI agent identity, and stops fraud and data misuse.',
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
    { city: 'Texas, United States', label: 'Office', address: '6600 ChaseOaks Blvd, Ste 150, Plano, TX 75070, United States', map: 'https://www.google.com/maps/search/?api=1&query=6600+ChaseOaks+Blvd+Ste+150+Plano+TX+75070' },
  ],
  // the demo and contact forms post JSON here
  formEndpoint: 'https://asu79c3171.execute-api.ap-south-2.amazonaws.com/dev/Das_website2',
};

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

/* Where each product runs. Shared by the home page and Why Deep Algorithms. */
export const DEPLOY = [
  ['Zenstra AI', 'var(--color-zen)', 'A gateway inside your VPC, plus read-only connections to agent platforms'],
  ['adapID AI', 'var(--color-adap)', 'Read-only connectors to your IdP, IAM, HR and SaaS; one read-only role per AWS account'],
  ['ICMS Compliance Suite', 'var(--color-icms)', 'Connected to the stores that hold personal data and to your identity sources'],
];
