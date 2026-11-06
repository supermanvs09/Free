/* The coloured story panel beside each product page's figures (Stats with a
   `story`, see Story.jsx). Each tells the page's own example in one card: the
   identity, what the product noticed, and what it did. People in the photos
   are models (Pexels, free licence); names, places and access are
   illustrations, and the panel says so. */
export const STORIES = {
  cirm: {
    proof: 'certs',
    story: {
      kicker: 'What it looks like', h: 'Kavya’s password worked. Her behaviour didn’t.',
      points: ['Her baseline from day one: where, when and how she works', 'Then a sign-in from Lagos at 02:14, a new forwarding rule and a bulk export', 'Her score passed 80, so policy held the session and told the SOC'],
      photo: '/img/roles/ciso.webp', pos: '50% 30%',
      chips: ['Kavya Reddy · Treasury', 'Usually Mumbai, 09:00 to 19:00', 'Today: Lagos, 02:14'], icons: ['User', 'MapPin', 'Warning'], alert: 2,
      apps: [['okta', 0], ['m365', 1], ['salesforce', 0], ['slack', 1]],
    },
  },
  nhi: {
    log: { product: 'adapid', title: 'Identity record', obj: 'ecs-notify-svc', sub: 'IAM role · AWS prod', verdict: 'Right-sized', rows: [['Day 0', 'Found in first scan, from 90 days of CloudTrail', 0], ['Owner', 'None on record · created by a 2023 deploy', 2], ['Usage', '214 permissions granted · 9 used', 2], ['Action', 'Owner assigned · 205 permissions removed', 1], ['Record', 'Before and after kept as evidence', 1]] },
    story: {
      kicker: 'What a first scan finds', h: 'A role nobody owns, with access nobody uses.',
      points: ['Found in the first scan, from 90 days of CloudTrail', '214 permissions granted, 9 of them used', 'An owner assigned and 205 permissions removed, with the evidence kept'],
      photo: '/img/photos/engineering.webp', pos: '50% 45%',
      chips: ['IAM role · ecs-notify-svc', 'Created by a deploy in 2023', 'No owner on record'], icons: ['Key', 'Clock', 'Warning'], alert: 2,
      apps: [['s3', 1], ['rds', 1], ['lambda', 1], ['iam', 0]],
    },
  },
  fraud: {
    proof: 'customers',
    story: {
      kicker: 'What it looks like', h: 'Anita was on a call with a scammer. Her bank saw it in time.',
      points: ['Her own phone, her own password, her own OTP', 'A new payee, a large amount and a call in progress', '₹2,40,000 paused, Anita warned, and an analyst calling her'],
      photo: '/img/photos/bfsi.webp', pos: '40% 50%',
      chips: ['Anita · savings account', 'New payee, ₹2,40,000', 'On a call while paying'], icons: ['User', 'Wallet', 'Phone'], alert: 2,
      apps: [['upi', 0]],
    },
  },
  ad: {
    log: { product: 'adapid', title: 'Attack path', obj: 'svc-helpdesk', sub: 'Service account · corp.local', verdict: 'Path closed', rows: [['Mapped', '6 hops from svc-helpdesk to Domain Admins', 2], ['Weak link', 'Kerberos ticket crackable offline (RC4)', 2], ['Fix', 'AES only · 30-char managed password', 1], ['Re-check', 'Path re-run against the live directory', 1], ['Result', '0 paths to Tier 0 from this account', 1]] },
    story: {
      kicker: 'What it looks like', h: 'A helpdesk account, six hops from Domain Admins. Closed first.',
      points: ['The path mapped from users, groups and permissions', 'The weak link: a service account with a crackable ticket', 'The fix applied and the path checked again: closed'],
      photo: '/img/roles/soc.webp', pos: '30% 30%',
      chips: ['svc-helpdesk', 'Ticket can be cracked offline', '6 hops to Domain Admins'], icons: ['User', 'Key', 'Warning'], alert: 2,
      apps: [['ad', 0], ['entra', 1], ['windows', 1]],
    },
  },
  zenstra: {
    log: { product: 'zenstra', title: 'Agent action', obj: 'invoice-bot', sub: 'Agent · Copilot Studio', verdict: 'Blocked · 4 ms', rows: [['Task', 'Read and pay approved invoices', 0], ['Call 1', 'invoices.read(status=approved) · allowed', 1], ['Call 2', 'payments.create(INV-2291) · allowed', 1], ['Call 3', 'vendors.export → outside address', 2], ['Decision', 'Stopped: outside the task · owner told', 1]] },
    story: {
      kicker: 'What it looks like', h: 'The agent had a task. It tried something else.',
      points: ['invoice-bot may read and pay approved invoices', 'It tried to send the full vendor list to an outside address', 'Zenstra stopped that one call and recorded why'],
      photo: '/img/roles/iam.webp', pos: '60% 30%',
      chips: ['Agent · invoice-bot', 'Task: pay approved invoices', 'Tried: export the vendor list'], icons: ['Robot', 'ClipboardText', 'Warning'], alert: 2,
      apps: [['copilotstudio', 1], ['salesforce', 0], ['slack', 1]],
    },
  },
  icms: {
    log: { product: 'icms', title: 'Access to personal data', obj: 'customer_kyc', sub: 'Personal data · Aadhaar, PAN', verdict: 'Audit pack ready', rows: [['10:02', 'Loan officer · KYC check · consent on file · allowed', 1], ['10:14', 'Marketing export · no consent for purpose · refused', 2], ['10:31', 'Support agent · masked view · allowed', 1], ['10:45', 'Erasure request · completed in 4 stores', 1], ['10:46', 'Each access logged with purpose for DPDPA', 0]] },
    story: {
      kicker: 'What it looks like', h: 'Every access to personal data, with its purpose on record.',
      points: ['Personal data found across your stores', 'Each access checked against purpose and consent', 'An audit package for DPDPA, RBI and SEBI in minutes'],
      photo: '/img/roles/dpo.webp', pos: '55% 30%',
      chips: ['Data protection officer', 'Access matched to purpose', 'Audit pack ready'], icons: ['User', 'ClipboardText', 'FileText'],
      apps: [['m365', 1], ['google', 1], ['salesforce', 1]],
    },
  },
};
