/* About page content, from the previous site's About page. */
const li = (h) => `https://www.linkedin.com/in/${h}/`;

export const LEADERS = [
  { name: 'JP Mishra', role: 'Founder & CEO', img: 'jp-mishra', bio: 'EPBA, IIM Calcutta. 18+ years in AI, cybersecurity, cloud and blockchain.', linkedin: li('jp-mishra-97272011') },
  { name: 'Manish Parganiha', role: 'CTO', img: 'manish-parganiha', bio: 'M.Tech, IIIT Bangalore. 21+ years in solution design, cloud, blockchain, AI and analytics.', linkedin: li('manishparganiha') },
  { name: 'Dr. Amit Shukla', role: 'CRO', img: 'amit-shukla-cro', bio: 'B.Tech, IIT Kanpur. PhD, Imperial College London. 16+ years. Chairperson at IIT Mandi.', linkedin: li('amit-shukla-11a0391a') },
  { name: 'Abhishek Tripathi', role: 'Chief of Innovation', img: 'abhishek-tripathi', bio: 'B.Tech, JNTU Hyderabad. 6+ patents and 5+ years in innovation and research.', linkedin: li('abhishek-tripathi-software') },
];

export const ADVISORS = [
  { name: 'Dr. Amarendra Sahoo', role: 'Senior Advisor', img: 'amarendra-sahoo', bio: '31+ years at RBI. Former World Bank consultant. Multi-firm board member.', linkedin: li('dr-amarendra-sahoo') },
  { name: 'Yogesh Chadha', role: 'Business Growth Advisor', img: 'yogesh-chadha', bio: '30+ years in investment banking and private equity: JPMorgan Chase, Mirae Asset.', linkedin: li('yogesh-chadha-74b46219') },
  { name: 'Prakash Govindan', role: 'Strategic Advisor', img: 'prakash-govindan', bio: 'Co-founder and CEO, Gradiant.', linkedin: li('prakash-govindan') },
  { name: 'Himanshu Singhal', role: 'Strategic Advisor', img: 'himanshu-singhal', bio: 'Chief Executive Officer. Times 40 under 40.', linkedin: li('himanshusinghal29') },
  { name: 'Ajitesh Shukla', role: 'Technology Mentor', img: 'ajitesh-shukla', bio: '25 years in AI, analytics, cloud and enterprise security.', linkedin: li('ajitesh') },
  { name: 'Amit Shukla', role: 'Business Mentor', img: 'amit-shukla', bio: 'Founder and MD, EasyGov (Jio Platforms).', linkedin: li('amit-shukla-b7023a3') },
  { name: 'Dr. Anil Rachamalla', role: 'Business Growth Advisor', img: 'anil-rachamalla', bio: 'Founder, End Now Foundation. 26 years of experience.', linkedin: li('anilrachamalla') },
  { name: 'Dr. Satvasheel Powar', role: 'Advisor', img: 'satvasheel-powar', bio: 'Dean (Finance & Accounts), IIT Mandi.', linkedin: li('satvasheel') },
];

export const RECOGNITION = [
  { title: 'Cybersecurity Excellence', where: 'Data Security Council of India', year: 2025, img: 'dsci-excellence' },
  { title: 'Business Excellence Award', where: 'Best Cybersecurity Solutions Provider', year: 2025, img: 'business-excellence-award' },
  { title: 'GITEX GLOBAL × Expand North Star', where: 'Dubai', year: 2025, img: 'gitex-dubai' },
  { title: 'NEC–Globis Innovation', where: 'T-Hub', year: 2025, img: 'nec-globis-thub' },
  { title: 'Cyber Security Training', where: 'Cyber Bureau Hyderabad', year: 2026, img: 'cyber-bureau-training' },
  { title: 'Bharat Mandapam', where: 'Delhi', year: 2024, img: 'bharat-mandapam' },
  { title: 'CCoE DSCI Chapter Meet', where: 'Hyderabad', year: 2024, img: 'dsci-chapter-meet' },
];

export const TEAM_PHOTOS = [
  { title: 'GoWest MAXX, Aurora, USA, 2026', img: 'gowest-maxx-2026' },
  { title: 'CISO Conclave 2026 by UBS', img: 'ciso-conclave-2026-team' },
  { title: 'Team cricket night', img: 'team-cricket' },
  { title: 'AI Summit Delhi, 2026', img: 'ai-summit-delhi' },
  { title: 'New office inauguration, 2026', img: 'office-inauguration' },
  { title: 'GFF, Mumbai, 2025', img: 'gff-mumbai' },
  { title: 'Republic Day celebration, 2026', img: 'republic-day' },
  { title: 'Holi at the office, 2026', img: 'holi' },
  { title: 'Cybersecurity and Privacy conference, Telangana, 2024', img: 'privacy-conference' },
];

export const BELIEFS = [
  { icon: 'Clock', title: 'Continuous over periodic', body: 'Security that runs on a schedule gives attackers the gaps between. Everything we build operates in real time.' },
  { icon: 'Eye', title: 'Behaviour over signatures', body: 'Signatures describe yesterday’s attacks. Behavioural intelligence catches attacks that have never been seen before.' },
  { icon: 'Lightning', title: 'Autonomous over manual', body: 'Human-speed response cannot match machine-speed attacks. Autonomous action is a requirement, not a feature.' },
  { icon: 'Target', title: 'Context first', body: 'Every environment has its own regulation, attack patterns and infrastructure. We build for the environment we protect.' },
  { icon: 'ClipboardText', title: 'Evidence over assertion', body: 'Every detection is explainable and every compliance claim is documented. Our customers can always show their work.' },
  { icon: 'Stack', title: 'Platform over product', body: 'Separate tools leave gaps between them. One intelligence layer across identity, traffic and compliance leaves nowhere to hide.' },
];

/* News, from the company's own LinkedIn page (read November 2026) and the
   articles it links to. Dates are approximate where LinkedIn shows "1w"/"1mo".
   Every item links to where it was published. */
const LI = 'https://www.linkedin.com/company/deepalgorithms.in/';
export const NEWS = [
  { kind: 'Patent', date: 'October 2026', title: 'Patent granted for multi-domain fraud detection', body: '“Intelligent Centralized Middleware System and Method for Multi-Domain Fraud Detection, Investigation, and Resolution.”', meta: 'Patent No. 602726', href: LI, cta: 'See the announcement' },
  { kind: 'Press', date: 'October 2026', title: 'Featured in Mint', body: 'The new enterprise security test for cybersecurity startups: proving, not just promising.', meta: 'Mint', href: 'https://www.livemint.com/companies/start-ups/cybersecurity-startups-enterprise-security-checks-11791263076605.html', cta: 'Read in Mint' },
  { kind: 'Event', date: 'October 2026', title: 'Zenstra AI at GoWest MAXX, Aurora, USA', body: 'With our partner Innorve at Booth 402, 6 to 9 October 2026: Zenstra AI for credit unions, with discovery, observability, governance and security for every AI agent.', meta: 'Aurora · Booth 402', img: 'gowest-maxx-2026', href: LI, cta: 'See the post' },
  { kind: 'Event', date: 'October 2026', title: 'CISO Conclave 2026 by UBS', img: 'ciso-conclave-2026', body: 'Cybersecurity and DPDPA compliance: one conversation, two priorities, with security leaders from banking and government.', meta: 'CISO Conclave', href: LI, cta: 'See the post' },
  { kind: 'Field', date: 'October 2026', title: 'DPDPA readiness with co-operative banks', body: 'With the Kolhapur Urban Co-operative Banking Association: banks from Kolhapur, Sangli and Karad on the DPDP Act, 2023, and a live look at the compliance platform.', meta: 'Kolhapur · Sangli · Karad', href: LI, cta: 'See the post' },
  { kind: 'Perspective', date: 'September 2026', title: 'When the agent becomes the attacker: securing agentic AI in banking', body: 'JP Mishra, Founder and CEO, sets out the controls a bank needs before an AI agent is allowed to act.', meta: 'TechStoriess', href: 'https://www.techstoriess.com/when-the-agent-becomes-the-attacker-securing-agentic-ai-in-banking/', cta: 'Read the article' },
  { kind: 'Interview', date: 'August 2026', title: 'AI agent security must assess behaviour, context and intent', body: '“Having a valid credential does not mean that the actions performed by an AI agent are safe.” JP Mishra to CIOL.', meta: 'CIOL', href: 'https://www.ciol.com/founders/ai-agent-security-must-assess-behaviour-context-and-intent-says-deep-algorithms-ceo-12402890', cta: 'Read the interview' },
  { kind: 'Interview', date: 'July 2026', title: 'Securing the agentic future: human and AI identity', body: '“Today our average enterprise customer sees a 0.2% end user step up rate.” JP Mishra to CXOToday.', meta: 'CXOToday', href: 'https://cxotoday.com/corner-office/securing-the-agentic-future-how-deep-algorithms-tackles-human-and-ai-identity/', cta: 'Read the interview' },
  { kind: 'Event', date: 'September 2026', title: 'Silver Partner, BFSI AI Kumbh 2026', body: 'Identity and data security for banks, shown at the booth in Nashik, 26 to 28 September 2026.', meta: 'Nashik · 26–28 Sep', href: LI, cta: 'See the post' },
  { kind: 'Funding', date: 'April 2026', title: '₹16 crore pre-Series A, led by Unicorn India Ventures', body: 'Funding to take our AI security products to more banks and enterprises, in India and abroad.', meta: '₹16 Cr', href: 'https://techobserver.in/news/startups/deep-algorithm-raises-16-crore-cybersecurity-funding-323348/', cta: 'Read the report' },
];

/* the founder, in his own published words (CXOToday, 24 July 2026) */
export const FOUNDER_QUOTE = { text: 'Our mission is to make trust dynamic, invisible, and resilient across every human and machine identity in the enterprise.', name: 'JP Mishra', role: 'Founder & CEO', img: 'jp-mishra', source: 'CXOToday, July 2026', href: 'https://cxotoday.com/corner-office/securing-the-agentic-future-how-deep-algorithms-tackles-human-and-ai-identity/' };
