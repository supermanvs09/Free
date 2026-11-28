/* What each industry page can show as proof. Everything here is real and
   already published by Deep Algorithms: customers from CUSTOMERS (site.js),
   events and awards from company.js with our own photographs, the one named
   partner (Innorve, GoWest MAXX 2026), and integrations the product pages
   already describe. No customer quote is shown: none has been published.
   When one is approved, add `quote: { text, name, role, org }` to that
   industry and the page will show it. */

const LI = 'https://www.linkedin.com/company/deepalgorithms.in/';

export const INDUSTRY_PROOF = {
  bfsi: {
    hero: { img: 'ind-bfsi', pos: '50% 35%', alt: 'A banker shaking hands with a client across a meeting table' },
    customers: ['canara-bank', 'karnataka-bank', 'dcb-bank'],
    field: [
      { img: 'ciso-conclave-2026', when: 'October 2026', title: 'CISO Conclave 2026 by UBS', body: 'Cybersecurity and DPDPA compliance with security leaders from banking and government.', href: LI },
      { img: 'gowest-maxx-2026', when: 'October 2026', title: 'Zenstra AI at GoWest MAXX, USA', body: 'With our partner Innorve, for credit unions: every AI agent discovered, governed and secured.', href: LI },
      { img: 'gff-mumbai', when: '2025', title: 'GFF, Mumbai', body: 'Identity risk and fraud prevention for banks and fintechs.' },
    ],
    notes: ['DPDPA readiness sessions with the Kolhapur Urban Co-operative Banking Association', 'Silver Partner, BFSI AI Kumbh 2026, Nashik'],
    partners: [{ name: 'Innorve', what: 'Partner for Zenstra AI with credit unions in the USA' }],
    works: [['okta', 'Okta'], ['entra', 'Microsoft Entra ID'], ['microsoft', 'Microsoft 365'], ['aws', 'AWS'], ['android', 'Android apps'], ['apple', 'iOS apps']],
  },
  healthcare: {
    hero: { img: 'healthcare', pos: '50% 50%', alt: 'Two doctors reviewing a patient record on a tablet' },
    customers: ['bhaktivedanta', 'seizure-tracker'],
    field: [
      { img: 'privacy-conference', when: '2024', title: 'Cybersecurity and Privacy conference, Telangana', body: 'Personal data protection and DPDPA readiness, shown live.' },
      { img: 'dsci-chapter-meet', when: '2024', title: 'CCoE DSCI Chapter Meet, Hyderabad', body: 'Identity attacks and how to contain them, with security teams across sectors.' },
      { img: 'dsci-excellence', when: '2025', title: 'Cybersecurity Excellence award', body: 'Recognised by the Data Security Council of India.' },
    ],
    works: [['entra', 'Microsoft Entra ID'], ['microsoft', 'Microsoft 365'], ['okta', 'Okta'], ['google', 'Google Workspace'], ['aws', 'AWS'], ['postgresql', 'PostgreSQL']],
  },
  government: {
    hero: { img: 'ind-government', pos: '50% 40%', alt: 'Two colleagues working together at a desk in an office' },
    customers: ['meity', 'ncrtc', 'ccoe', 'iit-kanpur', 'iit-mandi', 'iiit-hyderabad'],
    field: [
      { img: 'cyber-bureau-training', when: '2026', title: 'Cyber Security Training, Cyber Bureau Hyderabad', body: 'Hands-on identity and fraud defence for investigators.' },
      { img: 'bharat-mandapam', when: '2024', title: 'Bharat Mandapam, Delhi', body: 'Showing identity security for citizen services.' },
      { img: 'ai-summit-delhi', when: '2026', title: 'AI Summit, Delhi', body: 'Securing the AI agents government teams are beginning to deploy.' },
    ],
    works: [['entra', 'Microsoft Entra ID'], ['microsoft', 'Active Directory'], ['microsoft', 'Microsoft 365'], ['aws', 'AWS'], ['okta', 'Okta'], ['postgresql', 'PostgreSQL']],
  },
  'digital-platforms': {
    hero: { img: 'digital-platforms', pos: '50% 50%', alt: 'A product team reviewing work together on a laptop' },
    customers: ['inmorphis', 'sdet', 'silda', 'corecys', 'fourthsquare', 'vibho'],
    field: [
      { img: 'gitex-dubai', when: '2025', title: 'GITEX GLOBAL × Expand North Star, Dubai', body: 'AI agent security and identity risk for global platforms.' },
      { img: 'nec-globis-thub', when: '2025', title: 'NEC–Globis Innovation, T-Hub', body: 'Selected for the innovation programme at T-Hub, Hyderabad.' },
      { img: 'business-excellence-award', when: '2025', title: 'Business Excellence Award', body: 'Best Cybersecurity Solutions Provider.' },
    ],
    works: [['aws', 'AWS'], ['github', 'GitHub'], ['kubernetes', 'Kubernetes'], ['okta', 'Okta'], ['google', 'Google Workspace'], ['claude', 'Claude'], ['chatgpt', 'ChatGPT'], ['n8n', 'n8n']],
  },
};
