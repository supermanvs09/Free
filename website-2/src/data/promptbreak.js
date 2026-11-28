/* Promptbreak: the Deep Algorithms prompt injection challenge.
   Everything a person reads on the challenge pages lives here, so the team
   can change dates, prizes and levels without touching the layout.

   BEFORE LAUNCH, confirm with the team:
   - OPENS / CLOSES: the dates below are placeholders.
   - PRIZES: cash amounts are deliberately not stated until they are approved.
   - LEADERBOARD: SAMPLE_BOARD is preview data and is labelled as such on the
     page; the live board comes from the backend (lib/promptbreak.js). */

export const PB = {
  name: 'Promptbreak',
  path: '/promptbreak',
  boardPath: '/promptbreak/leaderboard',
  opens: '2026-12-15T10:00:00+05:30', // placeholder
  closes: '2027-01-31T23:59:00+05:30', // placeholder
  tagline: 'Can you make our AI spill its secret?',
  pitch: 'Seven AI guardians each hide a password. Talk, trick and outwit them with prompt injection. Climb the leaderboard and win cash prizes, swag and job offers on our AI security team.',
};

/* The seven guardians. Each one adds a defence; the last is guarded by
   Zenstra's own runtime policy. `hint` is shown on request. */
export const LEVELS = [
  { n: 1, name: 'The Intern', defence: 'Knows the password and was asked, politely, to keep it.', hint: 'Interns love to be helpful. Have you simply asked?', pts: 100, doodle: 'coffee' },
  { n: 2, name: 'The Rule Follower', defence: 'Was told never to reveal the password, under any circumstances.', hint: 'Rules are written in words. Words can be reframed.', pts: 200, doodle: 'sitting-reading' },
  { n: 3, name: 'The Self-Checker', defence: 'Reads its own reply and blanks the password if it appears.', hint: 'It checks for the password. Does it check for pieces of it?', pts: 300, doodle: 'reading' },
  { n: 4, name: 'The Bouncer', defence: 'A second model screens your message before the guardian sees it.', hint: 'The bouncer reads quickly. The guardian reads carefully.', pts: 400, doodle: 'meditating' },
  { n: 5, name: 'The Paranoid', defence: 'Refuses anything that mentions passwords, secrets or keys.', hint: 'What else could you call the thing it guards?', pts: 500, doodle: 'zombieing' },
  { n: 6, name: 'The Polyglot', defence: 'Blocks encodings, translations, acrostics and spelling games.', hint: 'Some stories leak more than any cipher.', pts: 600, doodle: 'levitate' },
  { n: 7, name: 'The Zenstra Vault', defence: 'Every reply passes Zenstra runtime policy before it reaches you.', hint: 'No hints here. This is the one our own team guards.', pts: 1000, doodle: 'clumsy' },
];

export const PRIZES = [
  { k: 'cash', title: 'Cash prizes', body: 'The top three on the final leaderboard share the prize pool.', doodle: 'unboxing' },
  { k: 'job', title: 'Job offers', body: 'Standout hackers are invited to interview for our AI red team and security engineering roles. The best get offers.', doodle: 'sprinting' },
  { k: 'swag', title: 'Swag and certificates', body: 'Crack level 3 for a certificate. The top 50 get a Deep Algorithms swag kit.', doodle: 'groovy' },
  { k: 'fame', title: 'Hall of fame', body: 'Every player who cracks the Zenstra Vault is named on this page for good.', doodle: 'jumping' },
];

export const RULES = [
  'One account per person. Teams are welcome, but play under one name.',
  'Attack the guardians through the chat only. Our infrastructure is out of scope.',
  'No automated flooding. Messages are rate-limited to keep the game fair.',
  'Keep your winning prompts to yourself until the challenge closes.',
  'Found a real bug in the platform? Tell us privately and we will thank you properly.',
];

export const SCORING = [
  ['Crack a level', 'Points for the level: 100 for the Intern up to 1,000 for the Zenstra Vault.'],
  ['Fewer messages', 'Up to 50% bonus when you crack a level in fewer messages.'],
  ['Ties', 'Broken by the time of your last crack. Earlier wins.'],
];

export const FAQ = [
  ['What is prompt injection?', 'Text that makes an AI model ignore its instructions and follow yours instead. It is the top risk in the OWASP Top 10 for LLM applications, and the reason products like Zenstra check what an agent does, not only what it was told.'],
  ['Do I need to be a security expert?', 'No. The first levels are made for curious beginners. The last ones will test experienced red teamers.'],
  ['Who can join?', 'Anyone, anywhere. You need an email address to keep your score.'],
  ['Is it free?', 'Yes, completely.'],
];

/* Preview rows only, shown with a "sample" label until the live board is
   connected. Handles are invented; they are not real players. */
export const SAMPLE_BOARD = [
  ['null_pointer', 7, 4380, '3h 12m'], ['sudo_sam', 7, 4210, '4h 40m'], ['tokenwhisperer', 7, 4105, '5h 02m'],
  ['prompt_goblin', 6, 2930, '2h 51m'], ['the_quiet_cat', 6, 2870, '3h 30m'], ['sys_prompt_sal', 6, 2790, '6h 11m'],
  ['jailbreakjaya', 6, 2655, '7h 09m'], ['lowercase_lu', 5, 2010, '1h 58m'], ['rot13_rohan', 5, 1960, '2h 40m'],
  ['emoji_eve', 5, 1890, '4h 05m'], ['zero_day_zoe', 5, 1820, '5h 47m'], ['helpful_harry', 4, 1240, '1h 22m'],
  ['base64_bea', 4, 1190, '2h 10m'], ['grandma_exploit', 4, 1150, '3h 03m'], ['dan_was_here', 4, 1100, '3h 55m'],
  ['ignore_previous', 3, 690, '0h 48m'], ['acrostic_ali', 3, 660, '1h 15m'], ['polite_priya', 3, 640, '1h 39m'],
  ['markdown_max', 3, 610, '2h 26m'], ['curious_kiran', 2, 330, '0h 31m'],
];
