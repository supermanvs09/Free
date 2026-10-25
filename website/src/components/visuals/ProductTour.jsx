import { useRef } from 'react';
import { CheckCircle, FileText, SealCheck } from '@phosphor-icons/react/dist/ssr';
import { Frame, Mark, Risk, Person, Tile, Chip, Cursor, useScript, cx } from './kit.jsx';

/* Product tour: products are the main tabs; every capability is listed as a
   sub-tab, and the script demonstrates the two strongest per product.
   All data is illustrative sample data. */

const C = { name: (icon, text) => ({ t: 'name', icon, text }), txt: (text, mono) => ({ t: 'txt', text, mono }), risk: (l) => ({ t: 'risk', l }), who: (n) => ({ t: 'who', n }), chip: (text, tone) => ({ t: 'chip', text, tone }), tiles: (list) => ({ t: 'tiles', list }) };

export const PRODUCTS = [
  {
    key: 'zenstra', name: 'Zenstra AI', caps: ['Agent Inventory', 'Runtime Enforcement', 'MCP Security', 'Decision Record'], demo: [0, 1],
    panels: {
      0: { grid: '1.6fr 1.1fr 1fr .8fr 1.15fr', cols: ['Agent', 'Platform', 'Accesses', 'Risk', 'Owner'], rows: [
        [C.name('copilot', 'invoice-agent'), C.txt('Copilot Studio'), C.tiles(['aws', 'snowflake']), C.risk('High'), C.who('Rahul Menon')],
        [C.name('cursor', 'release-agent'), C.txt('Cursor'), C.tiles(['github', 'kubernetes']), C.risk('High'), C.who('Arjun Nair')],
        [C.name('claude', 'HR Assistant'), C.txt('Claude'), C.tiles(['m365', 'jira']), C.risk('Medium'), C.who('Ananya Rao')],
        [C.name('n8n', 'support-triage'), C.txt('n8n'), C.tiles(['jira']), C.risk('Low'), C.who('Priya Sharma')],
        [C.name('langgraph', 'kyc-orchestrator'), C.txt('LangGraph'), C.tiles(['gcp']), C.risk('Medium'), C.chip('No owner', 'coral')],
      ] },
      1: { grid: '1.3fr 1.6fr .9fr .6fr', cols: ['Agent', 'Tool call', 'Decision', 'Time'], rows: [
        [C.name('aws', 'loan-servicing'), C.txt('accounts.transfer', true), C.chip('Blocked', 'coral'), C.txt('3 ms')],
        [C.name('copilot', 'invoice-agent'), C.txt('crm.export → external', true), C.chip('Blocked', 'coral'), C.txt('5 ms')],
        [C.name('n8n', 'support-triage'), C.txt('kb.search', true), C.chip('Allowed', 'green'), C.txt('4 ms')],
        [C.name('claude', 'research-assistant'), C.txt('mcp · sharepoint.search', true), C.chip('Allowed', 'green'), C.txt('7 ms')],
        [C.name('copilot', 'finance-copilot'), C.txt('payments.approve', true), C.chip('Needs approval', 'amber'), C.txt('5 ms')],
      ] },
      2: { grid: '1.5fr 1fr 1.3fr .9fr', cols: ['MCP server', 'Source', 'Used by', 'Status'], rows: [
        [C.name('github', 'github-mcp'), C.chip('Official', 'green'), C.txt('release-agent, code-review'), C.chip('Allowed', 'green')],
        [C.name('m365', 'sharepoint-mcp'), C.chip('Official', 'green'), C.txt('research-assistant'), C.chip('Allowed', 'green')],
        [C.name('mcp', 'pdf-tools-mcp'), C.chip('Unofficial', 'coral'), C.txt('invoice-agent'), C.chip('Blocked', 'coral')],
        [C.name('mcp', 'crm-bridge-mcp'), C.chip('Unofficial', 'coral'), C.txt('support-triage'), C.chip('Review', 'amber')],
        [C.name('jira', 'jira-mcp'), C.chip('Official', 'green'), C.txt('support-triage'), C.chip('Allowed', 'green')],
      ] },
      3: { grid: '1fr 1.2fr 1.5fr .9fr', cols: ['Record', 'Agent', 'Action and policy', 'Outcome'], rows: [
        [C.txt('DR-48213', true), C.name('copilot', 'invoice-agent'), C.txt('crm.export · Finance data stays internal'), C.chip('Blocked', 'coral')],
        [C.txt('DR-48212', true), C.name('copilot', 'finance-copilot'), C.txt('payments.approve · Human approval over ₹1L'), C.chip('Approved by Meera', 'green')],
        [C.txt('DR-48211', true), C.name('aws', 'loan-servicing'), C.txt('accounts.transfer · Not in task grant'), C.chip('Blocked', 'coral')],
        [C.txt('DR-48210', true), C.name('n8n', 'support-triage'), C.txt('kb.search · Within task'), C.chip('Allowed', 'green')],
        [C.txt('DR-48209', true), C.name('cursor', 'release-agent'), C.txt('file.read ~/.aws · Secrets off-limits'), C.chip('Contained', 'coral')],
      ] },
    },
  },
  {
    key: 'adapid', name: 'adapID AI', caps: ['NHI Inventory', 'Identity Risk', 'Fraud Prevention', 'AD Attack Paths'], demo: [0, 1],
    panels: {
      0: { grid: '1.6fr 1fr 1fr .8fr 1.15fr', cols: ['Identity', 'Type', 'Account', 'Risk', 'Owner'], rows: [
        [C.name('aws', 'ci-deploy-user'), C.txt('IAM user'), C.txt('shared-ci'), C.risk('Critical'), C.chip('No owner', 'coral')],
        [C.name('aws', 'svc-payments-recon'), C.txt('IAM role'), C.txt('prod-payments'), C.risk('High'), C.who('Rahul Menon')],
        [C.name('github', 'gh-actions-deploy'), C.txt('OIDC role'), C.txt('prod-web'), C.risk('High'), C.who('Priya Sharma')],
        [C.name('aws', 'glue-ledger-etl'), C.txt('Glue job role'), C.txt('data-lake'), C.risk('Medium'), C.who('Arjun Nair')],
        [C.name('aws', 'lambda-kyc-sync'), C.txt('Lambda role'), C.txt('prod-kyc'), C.risk('Low'), C.who('Kavya Iyer')],
      ] },
      1: { grid: '1.4fr 1fr 1.6fr .8fr', cols: ['User', 'Source', 'Latest signal', 'Risk'], rows: [
        [C.who('Vikram Shah'), C.tiles(['ad']), C.txt('Sign-in after contract end'), C.risk('Critical')],
        [C.who('Kavya Iyer'), C.tiles(['okta']), C.txt('Unmanaged device at 23:47'), C.risk('High')],
        [C.who('Rahul Menon'), C.tiles(['ad']), C.txt('1,240 records in 6 minutes'), C.risk('Medium')],
        [C.who('Sara Joseph'), C.tiles(['okta']), C.txt('Within baseline'), C.risk('Low')],
        [C.who('Meera Pillai'), C.tiles(['okta']), C.txt('Within baseline'), C.risk('Low')],
      ] },
      2: { grid: '1.3fr 1.3fr 1.4fr .9fr', cols: ['Customer', 'Event', 'Signals', 'Decision'], rows: [
        [C.who('Meera Pillai'), C.txt('Add beneficiary'), C.txt('Device linked to 23 accounts'), C.chip('Blocked · mule', 'coral')],
        [C.who('Sara Joseph'), C.txt('Transfer ₹67,000'), C.txt('Payee added 2 min ago'), C.chip('Review', 'amber')],
        [C.who('Arjun Nair'), C.txt('Login'), C.txt('New device, credential match'), C.chip('Step-up', 'amber')],
        [C.who('Priya Sharma'), C.txt('UPI ₹4,500'), C.txt('Trusted device, usual rhythm'), C.chip('Approved', 'green')],
        [C.txt('New applicant'), C.txt('Onboarding'), C.txt('Synthetic profile pattern'), C.chip('Blocked', 'coral')],
      ] },
      3: { grid: '1.4fr 1.4fr .6fr 1.2fr', cols: ['From', 'Reaches', 'Hops', 'Fix with most reach'], rows: [
        [C.who('r.kapoor'), C.txt('Domain Admins'), C.txt('6'), C.chip('Remove nested group', 'blue')],
        [C.name('ad', 'svc-backup'), C.txt('DC01 (DCSync)'), C.txt('3'), C.chip('Revoke replication right', 'blue')],
        [C.name('ad', 'WKS-2140'), C.txt('SRV-FILE02'), C.txt('2'), C.chip('Clear cached admin', 'blue')],
        [C.who('helpdesk-07'), C.txt('Server-Admins'), C.txt('4'), C.chip('Retire stale account', 'blue')],
        [C.name('ad', 'svc-sql-report'), C.txt('Finance share'), C.txt('3'), C.chip('Rotate SPN password', 'blue')],
      ] },
    },
  },
  {
    key: 'botshield', name: 'BotShield AI', caps: ['Exposure Management', 'Bot Defence', 'DDoS Mitigation'], demo: [0, 1],
    panels: {
      0: { grid: '1.5fr 1.8fr .9fr', cols: ['Asset', 'Exposure', 'Status'], rows: [
        [C.txt('payments-api /v2/refund', true), C.txt('Rate limit bypass via header rotation'), C.chip('Patched', 'green')],
        [C.txt('netbanking /otp/verify', true), C.txt('OTP brute force via proxies'), C.chip('Rule active', 'green')],
        [C.txt('partner-api /accounts', true), C.txt('Credential stuffing, no device binding'), C.chip('Validating', 'amber')],
        [C.txt('staging-assets bucket', true), C.txt('Public listing enabled'), C.chip('Ticket ENG-2291', 'blue')],
        [C.txt('mobile-api /signup', true), C.txt('Scripted fake registrations'), C.chip('Patched', 'green')],
      ] },
      1: { grid: '1.4fr 1.5fr .9fr .9fr', cols: ['Source', 'Behaviour', 'Requests/min', 'Verdict'], rows: [
        [C.txt('Residential proxy pool'), C.txt('Rotating headers, human-like timing'), C.txt('4,812'), C.chip('Blocked', 'coral')],
        [C.txt('Headless Chrome farm'), C.txt('Scraping price endpoints'), C.txt('2,130'), C.chip('Blocked', 'coral')],
        [C.txt('Mobile app users'), C.txt('Normal session rhythm'), C.txt('18,240'), C.chip('Allowed', 'green')],
        [C.txt('Partner integration'), C.txt('Known API client'), C.txt('960'), C.chip('Allowed', 'green')],
        [C.txt('New ASN, 41 IPs'), C.txt('Login bursts on OTP'), C.txt('1,104'), C.chip('Challenged', 'amber')],
      ] },
      2: { grid: '1.4fr 1fr 1fr 1fr', cols: ['Attack', 'Layer', 'Peak', 'Mitigated in'], rows: [
        [C.txt('HTTP flood on /search'), C.chip('L7', 'blue'), C.txt('1.2M req/s'), C.chip('6 s', 'green')],
        [C.txt('SYN flood'), C.chip('L4', 'blue'), C.txt('38 Gbps'), C.chip('3 s', 'green')],
        [C.txt('Slow POST on checkout'), C.chip('L7', 'blue'), C.txt('22k conns'), C.chip('9 s', 'green')],
        [C.txt('UDP reflection'), C.chip('L3', 'blue'), C.txt('61 Gbps'), C.chip('4 s', 'green')],
        [C.txt('Login burst on /otp'), C.chip('L7', 'blue'), C.txt('340k req/s'), C.chip('Active', 'amber')],
      ] },
    },
  },
  {
    key: 'icms', name: 'ICMS Compliance', caps: ['Data Discovery', 'Access Monitoring', 'Consent', 'Audit Evidence'], demo: [1, 3],
    panels: {
      0: { grid: '1.4fr 1.6fr .8fr 1fr', cols: ['Data store', 'Personal data found', 'Records', 'Owner'], rows: [
        [C.name('aws', 'kyc-documents (S3)'), C.txt('PAN, Aadhaar refs, addresses'), C.txt('2.1M'), C.who('Kavya Iyer')],
        [C.name('snowflake', 'customer_360'), C.txt('Names, phones, email'), C.txt('8.4M'), C.who('Rahul Kumar')],
        [C.name('databricks', 'loan_features'), C.txt('Income, credit score'), C.txt('640K'), C.who('Arjun Nair')],
        [C.name('m365', 'HR SharePoint'), C.txt('Payroll, bank details'), C.txt('12K'), C.chip('No owner', 'coral')],
        [C.name('aws', 'support-logs'), C.txt('Phone numbers in free text'), C.txt('390K'), C.chip('Unexpected PII', 'coral')],
      ] },
      1: { grid: '1.4fr 1.4fr 1.1fr 1fr', cols: ['Who', 'Personal data', 'Purpose', 'Consent'], rows: [
        [C.who('Rahul Kumar'), C.txt('Loan applications'), C.txt('Underwriting'), C.chip('Within consent', 'green')],
        [C.name('aws', 'svc-marketing-sync'), C.txt('Customer contacts'), C.txt('Marketing'), C.chip('Outside consent', 'coral')],
        [C.who('Ananya Menon'), C.txt('KYC records'), C.txt('Fraud analytics'), C.chip('Within consent', 'green')],
        [C.who('Suresh Reddy'), C.txt('Customer records DB'), C.txt('None declared'), C.chip('Flagged', 'coral')],
        [C.who('Priya Sinha'), C.txt('Consent registry'), C.txt('DPDPA review'), C.chip('Within consent', 'green')],
      ] },
      2: { grid: '1.3fr 1.4fr 1fr 1fr', cols: ['Data principal', 'Purpose', 'Consent', 'Expires'], rows: [
        [C.who('Aditya Rao'), C.txt('Loan servicing'), C.chip('Given', 'green'), C.txt('Mar 2028')],
        [C.who('Fatima Khan'), C.txt('Marketing offers'), C.chip('Withdrawn', 'coral'), C.txt('Ended 12 Oct')],
        [C.who('Rohan Das'), C.txt('Credit bureau check'), C.chip('Given', 'green'), C.txt('Jan 2027')],
        [C.who('Lakshmi N'), C.txt('Insurance cross-sell'), C.chip('Not asked', 'amber'), C.txt('n/a')],
        [C.who('Imran Shaikh'), C.txt('Account statements'), C.chip('Given', 'green'), C.txt('Aug 2029')],
      ] },
      3: { evidence: true },
    },
  },
];

function Cell({ c }) {
  switch (c.t) {
    case 'name': return <span className="flex min-w-0 items-center gap-2"><Tile name={c.icon} size={24} /><span className="truncate text-[12.5px] font-medium text-ink">{c.text}</span></span>;
    case 'risk': return <span><Risk level={c.l} /></span>;
    case 'who': return <span className="min-w-0"><Person name={c.n} small /></span>;
    case 'chip': return <span><Chip tone={c.tone}>{c.text}</Chip></span>;
    case 'tiles': return <span className="flex gap-1.5">{c.list.map((l) => <Tile key={l} name={l} size={22} />)}</span>;
    default: return <span className={cx('truncate text-[11.5px] text-ink-2', c.mono && 'font-medium text-ink')}>{c.text}</span>;
  }
}

function Evidence() {
  return (
    <div className="grid gap-3 rounded-[12px] bg-white p-4 md:grid-cols-[1.2fr_1fr]">
      <div>
        <div className="flex items-center gap-2 text-[14px] font-semibold text-ink"><FileText size={18} className="text-brand" />DPDPA audit package</div>
        <p className="mt-1 text-[12px] text-ink-3">Last 90 days · generated in 4 min 12 s</p>
        <ul className="mt-3 space-y-2">
          {['Personal data inventory (14 systems)', 'Access trail, 1,284 events, identity-linked', 'Purpose and consent checks', 'Breach notification workflow test', 'RBI and SEBI mapping'].map((x) => (
            <li key={x} className="flex items-center gap-2 text-[12px] text-ink-2"><CheckCircle size={16} weight="fill" className="text-ok" />{x}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-[10px] border border-line p-3">
        <div className="text-[11px] text-ink-3">Compliance posture</div>
        <div className="mt-1 font-display text-[40px] font-light leading-none text-ink">92<span className="text-[18px] text-ink-3">/100</span></div>
        <div className="mt-3 space-y-2">
          {[['DPDPA 2023', 96], ['RBI Master Directions', 90], ['SEBI CSCRF', 88]].map(([k, v]) => (
            <div key={k}><div className="flex justify-between text-[11px] text-ink-2"><span>{k}</span><span>{v}%</span></div><div className="mt-1 h-1.5 rounded-full bg-line"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${v}%` }} /></div></div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-ok"><SealCheck size={14} weight="fill" />Ready for examiner</div>
      </div>
    </div>
  );
}

export const T = C;

export function CapabilityPanel({ product, cap }) {
  const p = typeof product === 'string' ? PRODUCTS.find((x) => x.key === product) : product;
  const panel = p.panels[cap];
  if (panel.evidence) return <Evidence />;
  return <TablePanel spec={panel} />;
}

/* Generic product table: { grid, cols, rows } with typed cells. */
export function TablePanel({ spec: panel }) {
  return (
    <div>
      <div className="hidden gap-3 rounded-[8px] bg-navy px-4 py-2.5 text-[11px] font-medium text-white md:grid" style={{ gridTemplateColumns: panel.grid }}>
        {panel.cols.map((c) => <span key={c} className="truncate">{c}</span>)}
      </div>
      <ul className="mt-2.5 space-y-1 rounded-[12px] bg-white p-2 md:p-2.5">
        {panel.rows.map((r, k) => (
          <li key={k} className="grid h-[46px] grid-cols-[1fr_auto] items-center gap-3 rounded-[8px] px-2 md:px-2.5 md:[grid-template-columns:var(--g)]" style={{ '--g': panel.grid }}>
            {r.map((c, i) => (
              <span key={i} className={cx('min-w-0', i > 0 && i < r.length - 1 && 'hidden md:block')}><Cell c={c} /></span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tabs({ items, active, prefix, sub }) {
  return (
    <div className={cx('flex gap-1.5 overflow-hidden', sub ? 'border-b border-line-2' : '')}>
      {items.map((t, k) => (
        <span key={t} data-cur={`${prefix}-${k}`}
          className={cx('truncate transition-colors duration-500',
            sub ? cx('-mb-px border-b-2 px-2.5 pb-2 pt-1 text-[12px]', k === active ? 'border-brand font-medium text-brand' : 'border-transparent text-ink-3')
              : cx('flex-1 rounded-[8px] px-3 py-2 text-center text-[12.5px] md:text-[13px]', k === active ? 'bg-navy text-white' : 'bg-white/70 text-ink-3'))}>
          {t}
        </span>
      ))}
    </div>
  );
}

/* Steps per product: open product, show first capability, switch to second. */
const STEPS = PRODUCTS.flatMap((p, pi) => [
  { p: pi, cap: p.demo[0], cur: `prod-${pi}`, dur: 900 },
  { p: pi, cap: p.demo[0], cur: `prod-${pi}`, click: true, dur: 2300 },
  { p: pi, cap: p.demo[0], cur: `cap-${p.demo[1]}`, dur: 900 },
  { p: pi, cap: p.demo[1], cur: `cap-${p.demo[1]}`, click: true, dur: 2800 },
]);

export default function ProductTour({ className, only }) {
  const box = useRef(null);
  const steps = only ? STEPS.filter((s) => PRODUCTS[s.p].key === only) : STEPS;
  const { step, reduce } = useScript(steps, box, 1);
  const p = PRODUCTS[step.p];
  return (
    <Frame className={className}>
      <div ref={box} className="relative" role="img" aria-label={`Illustration: the Deep Algorithms console showing ${p.name}, ${p.caps[step.cap]}.`}>
        <div className="flex items-center gap-2.5 px-1 pb-3 pt-0.5">
          <Mark size={20} />
          <span className="font-display text-[20px] font-light tracking-[-0.02em] text-ink md:text-[24px]">{only ? p.name : 'Deep Algorithms Platform'}</span>
        </div>
        {!only && <Tabs items={PRODUCTS.map((x) => x.name)} active={step.p} prefix="prod" />}
        <div className="mt-3 rounded-[12px] bg-white/60 px-2 pt-1"><Tabs items={p.caps} active={step.cap} prefix="cap" sub /></div>
        <div key={`${step.p}-${step.cap}`} className="fadein mt-3 min-h-[300px]">
          <CapabilityPanel product={p} cap={step.cap} />
        </div>
        {!reduce && <div className="hidden md:block"><Cursor box={box} target={step.cur} click={step.click} /></div>}
      </div>
    </Frame>
  );
}
