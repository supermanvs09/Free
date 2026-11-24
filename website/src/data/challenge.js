/* Prompt Heist: the Deep Algorithms prompt-injection challenge.
   Everything a person might want to change before launch lives here: the name,
   dates, prizes, levels and rules. Dates left as null show "Opening soon".
   The chat talks to the challenge backend through src/lib/challengeApi.js. */

export const CHALLENGE = {
  name: 'Prompt Heist',
  by: 'Deep Algorithms',
  path: '/prompt-heist',
  play: '/prompt-heist/play',
  tagline: 'Talk an AI vault into giving up its secret.',
  pitch: 'Five AI guards. Five secrets. Every level adds a new defence. Use nothing but words to make the vault talk, climb the leaderboard and win an internship.',
  // ISO strings, e.g. '2026-12-01T10:00:00+05:30'. Leave null until dates are final.
  opensAt: null,
  closesAt: null,
  who: ['Students', 'Job seekers', 'Working professionals', 'Pentesters for fun'],
};

export const PRIZES = [
  { icon: 'Briefcase', title: 'Internship offers', body: 'Top finishers are fast-tracked to an interview for a security or AI internship at Deep Algorithms.', tag: 'Top ranks' },
  { icon: 'Gift', title: 'Deep Algorithms goodies', body: 'Hoodies, stickers and desk kit for everyone who cracks the final vault.', tag: 'Level 5' },
  { icon: 'Certificate', title: 'Certificate of completion', body: 'A verifiable certificate for every level you break, for your CV and LinkedIn.', tag: 'Every level' },
  { icon: 'Trophy', title: 'Hall of fame', body: 'Your handle on the Deep Algorithms leaderboard, for the whole security community to see.', tag: 'Leaderboard' },
];

/* Each level is a guard with one more defence than the last. `layers` are the
   defences the guard runs, shown on the defence panel as the player plays. */
export const LEVELS = [
  { n: 1, name: 'The Intern', guard: 'VAULT-1', difficulty: 'Warm-up', points: 100, layers: ['prompt'],
    brief: 'A brand-new assistant with a secret and almost no rules. Ask nicely.' },
  { n: 2, name: 'The Clerk', guard: 'VAULT-2', difficulty: 'Easy', points: 200, layers: ['prompt', 'refusal'],
    brief: 'Told never to reveal the secret. It refuses direct questions. Indirect ones?' },
  { n: 3, name: 'The Auditor', guard: 'VAULT-3', difficulty: 'Medium', points: 350, layers: ['prompt', 'refusal', 'output'],
    brief: 'Its answers are scanned before you see them. If the secret appears, the reply is blocked.' },
  { n: 4, name: 'The Gatekeeper', guard: 'VAULT-4', difficulty: 'Hard', points: 550, layers: ['prompt', 'refusal', 'output', 'input'],
    brief: 'Your messages are checked for attack patterns before the guard even reads them.' },
  { n: 5, name: 'The Agent', guard: 'VAULT-5', difficulty: 'Expert', points: 800, layers: ['prompt', 'refusal', 'output', 'input', 'intent'],
    brief: 'An AI agent with tools, guarded by intent checks on every action. The final vault.' },
];

export const LAYERS = {
  prompt: { name: 'System prompt', desc: 'The rules the guard is given' },
  refusal: { name: 'Refusal training', desc: 'Says no to direct asks' },
  output: { name: 'Output filter', desc: 'Blocks replies that contain the secret' },
  input: { name: 'Input filter', desc: 'Flags known attack patterns in your message' },
  intent: { name: 'Intent check', desc: 'Every action checked against the task, like Zenstra AI' },
};

export const STEPS = [
  ['Register', 'Pick a handle. Students, job seekers, professionals and hobbyists all welcome.'],
  ['Chat with the guard', 'Each vault is an AI with a secret passphrase. Use words, roles, stories, anything.'],
  ['Submit the passphrase', 'Got it out? Enter it to unlock the next level and bank your points.'],
  ['Climb the board', 'Fewer prompts and faster cracks score higher. Top ranks win internships.'],
];

export const RULES = [
  'Words only. No attacks on the platform, the servers or other players.',
  'One account per person. Teams are not allowed in this edition.',
  'Fewer messages and less time to crack a level earn a higher score.',
  'Do not share passphrases publicly while the challenge is running.',
  'Winners are verified before prizes and internship interviews are confirmed.',
];

export const FAQ = [
  { q: 'Do I need to know how to code?', a: 'No. Prompt injection is done in plain language. Curiosity and creativity matter more than code.' },
  { q: 'Who can take part?', a: 'Anyone in India aged 18 or over: students, job seekers, working professionals and anyone who enjoys breaking things for fun.' },
  { q: 'What is prompt injection?', a: 'Getting an AI to ignore its instructions by what you write to it. It is the top risk in the OWASP Top 10 for LLM applications, and it is exactly what Zenstra AI defends against.' },
  { q: 'How are winners chosen?', a: 'By leaderboard score: points for each level, with bonuses for fewer messages and faster cracks. Ties go to whoever got there first.' },
  { q: 'Is my data safe?', a: 'We keep your handle, email and score for the challenge and for internship follow-up only. Conversations may be used, anonymised, to improve AI defences.' },
];
