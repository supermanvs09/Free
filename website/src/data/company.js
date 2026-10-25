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
