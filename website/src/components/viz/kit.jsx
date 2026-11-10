import { useRef } from 'react';
import {
  siOkta, siGithub, siGithubcopilot, siClaude, siGooglegemini, siKubernetes, siTerraform, siN8n, siZapier,
  siLanggraph, siGooglecloud, siCursor, siJira, siGitlab, siModelcontextprotocol, siCloudflare, siDatabricks, siSnowflake,
  siAtlassian, siGoogle, siPostgresql, siStripe, siHubspot, siZendesk, siGmail, siGoogledrive, siPaytm, siPhonepe, siGooglepay,
  siVisa, siMastercard, siRazorpay, siGooglechrome, siSelenium, siPuppeteer, siAndroid, siApple, siMongodb, siMysql, siApachekafka,
  siDocker, siSplunk, siAnthropic, siKeycloak, siAuth0, siDropbox, siWhatsapp, siLinux, siKalilinux, siConfluence, siBitbucket,
  siNotion, siGithubactions, siVault, siLangchain, siHuggingface, siSap, siElasticsearch, siRedis, siPagerduty, siAirtel, siJio,
  siHdfcbank, siIcicibank, siMetasploit, siNginx,
} from 'simple-icons';
import { cx, useSteps } from '../../lib/motion.js';

export { cx };

/* `k` classes for the cumulative step engine: k(3) -> "k0 k1 k2 k3" */
export const kc = (k) => Array.from({ length: k + 1 }, (_, i) => `k${i}`).join(' ');

/* A picture wrapper: container-sized, plays its steps while on screen. */
export function Viz({ steps, loop = true, hold, speed, className, label, children, style, k: forced }) {
  const ref = useRef(null);
  const auto = useSteps(ref, steps || [], { loop, hold, speed });
  const k = forced ?? auto; // the product film drives steps from its own clock
  return (
    <figure ref={ref} className={cx('vzw', className)} aria-label={label} role={label ? 'img' : undefined} style={style}>
      <div className={cx('vz', kc(k))} aria-hidden={label ? 'true' : undefined}>{typeof children === 'function' ? children(k) : children}</div>
    </figure>
  );
}

export function Win({ title, right, className, children, glow, style, bodyClass = 'vz-body' }) {
  return (
    <div className={cx('vz-win', className)} style={{ ...(glow ? { '--glow': glow } : null), ...style }}>
      <div className="vz-bar"><i /><i /><i /><b>{title}</b>{right && <span>{right}</span>}</div>
      <div className={bodyClass}>{children}</div>
    </div>
  );
}

export const Chip = ({ tone = 'mute', plain, children, className }) => <span className={cx('vz-chip', `c-${tone}`, plain && 'plain', className)}>{children}</span>;

const AV = ['#7fd3ff', '#9fb0ff', '#7ef0c9', '#ffd27a', '#ffa3c4', '#b6f07f'];
export function Av({ name, i = 0 }) {
  const ini = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <span className="vz-av" style={{ background: AV[i % AV.length] }}>{ini}</span>;
}

export function Spark({ data, color = '#27b8f2', w = 120, h = 32, fill = true, className, domain }) {
  const [min, max] = domain || [Math.min(...data), Math.max(...data)];
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 3 - ((v - min) / (max - min || 1)) * (h - 6)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} style={{ width: '100%', height: '100%' }}>
      {fill && <path d={`${d} L${w} ${h} L0 ${h} Z`} fill={color} opacity=".12" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/* A product pointer that glides between targets given in % of the picture. */
export function Cursor({ x, y, click, hidden }) {
  if (hidden) return null;
  return (
    <svg className={cx('vz-cursor', click && 'click')} style={{ left: `${x}%`, top: `${y}%` }} viewBox="0 0 22 24" aria-hidden="true">
      <path d="M2 2 L20 9.5 L11.5 12 L8 21 Z" fill="#fff" stroke="#12171f" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

/* brand marks of tools the products connect to (simple-icons, CC0) */
const SI = {
  okta: siOkta, github: siGithub, copilot: siGithubcopilot, claude: siClaude, gemini: siGooglegemini, kubernetes: siKubernetes,
  terraform: siTerraform, n8n: siN8n, zapier: siZapier, langgraph: siLanggraph, gcp: siGooglecloud, cursor: siCursor, jira: siJira,
  gitlab: siGitlab, mcp: siModelcontextprotocol, cloudflare: siCloudflare, databricks: siDatabricks, snowflake: siSnowflake,
  atlassian: siAtlassian, google: siGoogle, postgres: siPostgresql, stripe: siStripe, hubspot: siHubspot, zendesk: siZendesk,
  gmail: siGmail, gdrive: siGoogledrive, paytm: siPaytm, phonepe: siPhonepe, gpay: siGooglepay, visa: siVisa, mastercard: siMastercard,
  razorpay: siRazorpay, chrome: siGooglechrome, selenium: siSelenium, puppeteer: siPuppeteer, android: siAndroid, apple: siApple,
  mongodb: siMongodb, mysql: siMysql, kafka: siApachekafka, docker: siDocker, splunk: siSplunk, anthropic: siAnthropic,
  keycloak: siKeycloak, auth0: siAuth0, dropbox: siDropbox, whatsapp: siWhatsapp, linux: siLinux, kali: siKalilinux,
  confluence: siConfluence, bitbucket: siBitbucket, notion: siNotion, actions: siGithubactions, vault: siVault, langchain: siLangchain,
  huggingface: siHuggingface, sap: siSap, elastic: siElasticsearch, redis: siRedis, pagerduty: siPagerduty, airtel: siAirtel, jio: siJio,
  hdfc: siHdfcbank, icici: siIcicibank, metasploit: siMetasploit, nginx: siNginx,
};
/* Marks simple-icons no longer carries (Microsoft, Slack, Salesforce, AWS
   services), drawn as plain, recognisable shapes in each brand's colours. */
const ms4 = (a, b, c, d) => <><rect x="2" y="2" width="9.5" height="9.5" fill={a} /><rect x="12.5" y="2" width="9.5" height="9.5" fill={b} /><rect x="2" y="12.5" width="9.5" height="9.5" fill={c} /><rect x="12.5" y="12.5" width="9.5" height="9.5" fill={d} /></>;
const tile = (bg, glyph) => <><rect x="1.5" y="1.5" width="21" height="21" rx="4.5" fill={bg} /><g fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{glyph}</g></>;
const DRAWN = {
  microsoft: ['Microsoft', () => ms4('#f25022', '#7fba00', '#00a4ef', '#ffb900')],
  m365: ['Microsoft 365', () => ms4('#f25022', '#7fba00', '#00a4ef', '#ffb900')],
  copilotstudio: ['Copilot Studio', () => <><defs><linearGradient id="cps" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2aa0f5" /><stop offset=".5" stopColor="#8f5cf7" /><stop offset="1" stopColor="#f7629b" /></linearGradient></defs><path d="M8.5 3h7a4 4 0 0 1 3.8 2.8l2.4 8.4A3.6 3.6 0 0 1 18.3 19H15l-1.4 2H8.6a3.6 3.6 0 0 1-3.4-4.7L7.9 5.6A3.6 3.6 0 0 1 8.5 3z" fill="url(#cps)" /><path d="M9.5 9.5h5M9 13.5h4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" /></>],
  outlook: ['Outlook', () => <><rect x="9" y="4" width="13" height="16" rx="2" fill="#28a8ea" /><rect x="2" y="6.5" width="11" height="11" rx="2" fill="#0a64ad" /><ellipse cx="7.5" cy="12" rx="2.6" ry="3.1" fill="none" stroke="#fff" strokeWidth="1.6" /></>],
  sharepoint: ['SharePoint', () => <><circle cx="13" cy="8.5" r="6.5" fill="#036c70" /><circle cx="17" cy="14" r="5" fill="#1a9ba1" /><circle cx="13" cy="18.5" r="3.6" fill="#37c6d0" /><rect x="2" y="7" width="11" height="11" rx="2" fill="#03787c" /><path d="M9.5 10.2c-.6-.6-1.4-.9-2.3-.9-1.2 0-2 .6-2 1.5 0 2 4.4 1.2 4.4 3.3 0 .9-.9 1.6-2.3 1.6-.9 0-1.8-.4-2.4-1" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" /></>],
  teams: ['Microsoft Teams', () => <><circle cx="17.5" cy="6.5" r="2.6" fill="#7b83eb" /><rect x="13" y="9.5" width="9" height="9" rx="3" fill="#7b83eb" /><circle cx="11" cy="5.5" r="3.2" fill="#5059c9" /><rect x="2" y="7" width="12" height="12" rx="2" fill="#4b53bc" /><path d="M5 10.5h6M8 10.5v6" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" /></>],
  entra: ['Microsoft Entra ID', () => <><path d="M12 2 3 13l9 9 9-9-9-11z" fill="#225086" /><path d="M12 2 3 13l9-3.5V2z" fill="#6df" /><path d="M12 9.5 21 13l-9 9V9.5z" fill="#0294e4" /><path d="M12 2v7.5l9 3.5L12 2z" fill="#cbf8ff" opacity=".9" /></>],
  slack: ['Slack', () => <><rect x="9.5" y="2" width="3.2" height="9" rx="1.6" fill="#36c5f0" /><rect x="2" y="11.3" width="9" height="3.2" rx="1.6" fill="#e01e5a" /><rect x="11.3" y="13" width="3.2" height="9" rx="1.6" fill="#ecb22e" /><rect x="13" y="9.5" width="9" height="3.2" rx="1.6" fill="#2eb67d" /></>],
  salesforce: ['Salesforce', () => <path d="M9.8 5.7a4 4 0 0 1 6.6.9 4.6 4.6 0 0 1 6.1 4.4 4.6 4.6 0 0 1-5.6 4.5 3.5 3.5 0 0 1-5 1.4 4 4 0 0 1-7.4-.5A3.7 3.7 0 0 1 1.5 10a3.8 3.8 0 0 1 5.4-3.5 4 4 0 0 1 2.9-.8z" fill="#00a1e0" />],
  windows: ['Windows', () => <path d="M2 4.6 10 3.5v7.7H2zM11 3.4 22 2v9.2H11zM2 12.2h8v7.7l-8-1.1zM11 12.2h11V22l-11-1.5z" fill="#00a4ef" />],
  lambda: ['AWS Lambda', () => tile('#ed7100', <path d="M8 6h3l5.5 12M12.6 10.5 8.5 18" />)],
  s3: ['Amazon S3', () => tile('#7aa116', <><ellipse cx="12" cy="7.5" rx="6" ry="2" /><path d="M6 7.5l1.4 9.3c.3 1.3 2.3 2.2 4.6 2.2s4.3-.9 4.6-2.2L18 7.5" /></>)],
  iam: ['AWS IAM', () => tile('#dd344c', <><circle cx="9" cy="12" r="3.2" /><path d="M12.2 12H19M16.5 12v2.6M19 12v2" /></>)],
  secrets: ['AWS Secrets Manager', () => tile('#dd344c', <><rect x="7" y="11" width="10" height="7" rx="1.5" /><path d="M9.2 11V9a2.8 2.8 0 0 1 5.6 0v2" /></>)],
  sns: ['Amazon SNS', () => tile('#e7157b', <><path d="M5.5 10.5h3l5-4v11l-5-4h-3z" /><path d="M16.5 9.5a4 4 0 0 1 0 5" /></>)],
  ec2: ['Amazon EC2', () => tile('#ed7100', <><rect x="7.5" y="7.5" width="9" height="9" rx="1" /><path d="M10 5v2.5M14 5v2.5M10 16.5V19M14 16.5V19M5 10h2.5M5 14h2.5M16.5 10H19M16.5 14H19" /></>)],
  rds: ['Amazon RDS', () => tile('#2e73b8', <><ellipse cx="12" cy="7.5" rx="5" ry="2" /><path d="M7 7.5v9c0 1.1 2.2 2 5 2s5-.9 5-2v-9M7 12c0 1.1 2.2 2 5 2s5-.9 5-2" /></>)],
  cloudtrail: ['AWS CloudTrail', () => tile('#e7157b', <><path d="M6 17l4-5 3 3 5-7" /><circle cx="18" cy="8" r="1" /></>)],
  ecs: ['Amazon ECS', () => tile('#ed7100', <><rect x="6" y="6" width="5" height="5" rx=".6" /><rect x="13" y="6" width="5" height="5" rx=".6" /><rect x="9.5" y="13" width="5" height="5" rx=".6" /></>)],
  glue: ['AWS Glue', () => tile('#8c4fff', <path d="M6 7h12l-4.5 5.5V18l-3-1.5v-4z" />)],
  upi: ['UPI', () => <><path d="M6 3l5.5 9L6 21h3.6L15 12 9.6 3z" fill="#f47920" /><path d="M11.5 3 17 12l-5.5 9h3.6L20.6 12 15.1 3z" fill="#097939" /></>],
  dc: ['Domain controller', () => tile('#1f6fd1', <><rect x="6" y="5" width="12" height="5.5" rx="1" /><rect x="6" y="13.5" width="12" height="5.5" rx="1" /><path d="M9 7.75h.01M9 16.25h.01" /></>)],
};
const CUSTOM = {
  m365: { title: 'Microsoft 365', path: 'M2 3h9v9H2zm11 0h9v9h-9zM2 13h9v9H2zm11 0h9v9h-9z' },
  ad: { title: 'Active Directory', path: 'M12 2 3 6v6c0 5 3.8 9.4 9 10 5.2-.6 9-5 9-10V6l-9-4zm0 2.2 7 3.1V12c0 3.9-2.9 7.4-7 8-4.1-.6-7-4.1-7-8V7.3l7-3.1zM8 11h8v2H8z' },
  upi: { title: 'UPI', path: 'M5 3l5.5 9L5 21h3.5L14 12 8.5 3H5zm6 0 5.5 9L11 21h3.5L20 12 14.5 3H11z' },
  azure: { title: 'Microsoft Azure', path: 'M9.5 3h5.3L8.3 21H3l6.5-18zm6.2 4.4L21 21h-9.6l7.2-2.1-3-11.5z' },
};
/* near-black brand colours (GitHub, Cursor, Notion…) take the text colour, so
   they read on a dark window and on a light page alike */
const brandFill = (hex) => {
  const n = parseInt(hex, 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 60 ? 'currentColor' : `#${hex}`;
};

/* an app icon: the brand mark on a small rounded tile */
export function App({ k, className, style }) {
  return <span className={cx('vz-app', className)} style={style} title={logoTitle(k)}><Logo k={k} size="1.15em" /></span>;
}
export function Logo({ k, size = '1.25em', color, className }) {
  if (DRAWN[k] && !(color && (k === 'm365' || k === 'microsoft'))) {
    const [title, draw] = DRAWN[k];
    return <svg viewBox="0 0 24 24" width={size} height={size} className={className} role="img" aria-label={title}>{draw()}</svg>;
  }
  if (k === 'aws') {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} className={className} role="img" aria-label="AWS">
        <text x="12" y="13.2" textAnchor="middle" fontSize="9.6" fontWeight="800" fontFamily="Inter Variable, Arial, sans-serif" fill={color || 'currentColor'}>aws</text>
        <path d="M5 16.6c4.2 2.4 9.6 2.4 13.6 0" fill="none" stroke="#ff9900" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  const s = SI[k] || CUSTOM[k];
  if (!s) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} role="img" aria-label={s.title}>
      <path d={s.path} fill={color || (SI[k] ? brandFill(SI[k].hex) : 'currentColor')} />
    </svg>
  );
}
export const logoTitle = (k) => (k === 'aws' ? 'AWS' : DRAWN[k]?.[0] || (SI[k] || CUSTOM[k])?.title || k);

/* small line icons for inside pictures (stroke follows currentColor) */
const G = {
  agent: <><rect x="5" y="7" width="14" height="11" rx="3" /><path d="M12 3v4M9 12h.01M15 12h.01M9.5 15h5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  key: <><circle cx="8" cy="12" r="4" /><path d="M12 12h9M18 12v3M21 12v2" /></>,
  server: <><rect x="4" y="4" width="16" height="7" rx="2" /><rect x="4" y="13" width="16" height="7" rx="2" /><path d="M8 7.5h.01M8 16.5h.01" /></>,
  db: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></>,
  shield: <path d="M12 3 4 6v6c0 4.6 3.4 8.4 8 9 4.6-.6 8-4.4 8-9V6l-8-3z" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  bolt: <path d="M13 3 5 13h6l-1 8 8-10h-6l1-8z" />,
  doc: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
  bank: <><path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></>,
  card: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h4" /></>,
  phone: <><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18h2" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
  bot: <><rect x="5" y="8" width="14" height="10" rx="3" /><path d="M12 4v4M9 13h.01M15 13h.01M2 13h3M19 13h3" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  laptop: <><rect x="5" y="5" width="14" height="10" rx="1.5" /><path d="M3 19h18" /></>,
  cloud: <path d="M7 18a5 5 0 0 1-.5-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9H7z" />,
  flow: <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M7 6h10M6 8l5 8.5M18 8l-5 8.5" /></>,
  plug: <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v4" />,
  tree: <><rect x="9" y="3" width="6" height="5" rx="1" /><rect x="3" y="16" width="6" height="5" rx="1" /><rect x="15" y="16" width="6" height="5" rx="1" /><path d="M12 8v4M6 16v-4h12v4" /></>,
  scale: <><path d="M12 3v18M6 21h12M4 8h16M4 8l-2 6a3 3 0 0 0 4 0L4 8zM20 8l-2 6a3 3 0 0 0 4 0l-2-6z" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 5 5" /></>,
  wave: <path d="M2 12c2.5-5 4.5-5 7 0s4.5 5 7 0 4.5-5 6 0" />,
  pulse: <path d="M2 12h4l3-7 4 14 3-7h6" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  git: <><circle cx="6" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="9" r="2" /><path d="M6 8v8M18 11c0 4-6 3-11 6" /></>,
  money: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
};
export function Gl({ g, className, style }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">{G[g]}</svg>;
}
