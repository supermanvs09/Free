import { createRoot } from 'react-dom/client';
import '../../src/styles.css';
import { Tile, Chip, Risk, Mark } from '../../src/components/visuals/kit.jsx';

/* Product card images. Dev only: `npm run dev`, open /tools/thumbs/index.html,
   screenshot each #t-<key> element at 2x and save as public/img/products/<key>.webp.
   Each is a 480 x 300 crop of an illustrative console (sample data). */
const W = ({ title, right, children }) => (
  <div className="flex h-full flex-col overflow-hidden rounded-[14px] bg-white p-3.5 shadow-[0_1px_2px_rgba(11,18,32,.08)]">
    <div className="flex items-center gap-2"><Mark size={18} /><span className="font-display text-[17px] font-light tracking-[-0.02em] text-ink">{title}</span><span className="ml-auto">{right}</span></div>
    <div className="mt-2.5 flex-1 space-y-2">{children}</div>
  </div>
);
const Row = ({ logo, a, b, chip, hot, extra }) => (
  <div className={`flex items-center gap-3 rounded-[10px] border px-3 py-2 ${hot ? 'border-coral bg-coral-soft' : 'border-line'}`}>
    {logo && <Tile name={logo} size={32} />}
    <div className="min-w-0 flex-1"><p className="truncate text-[14px] font-semibold text-ink">{a}</p><p className="truncate text-[12px] text-ink-3">{b}</p></div>
    {extra}{chip}
  </div>
);
const Bar = ({ pct, tone = 'bg-brand' }) => <div className="h-2 w-24 overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} /></div>;
const C = (t, tone) => <Chip tone={tone} className="!text-[11.5px]">{t}</Chip>;

const SHOTS = {
  zenstra: <W title="Agent inventory" right={C('248 agents', 'blue')}>
    <Row logo="copilot" a="invoice-agent" b="Copilot Studio · Finance" chip={<Risk level="High" />} hot />
    <Row logo="cursor" a="release-agent" b="Cursor · Engineering" chip={<Risk level="High" />} />
    <Row logo="claude" a="HR Assistant" b="Claude · People" chip={<Risk level="Medium" />} />
    <Row logo="n8n" a="support-triage" b="n8n · Support" chip={<Risk level="Low" />} />
  </W>,
  adapid: <W title="Identity risk" right={C('14 high risk', 'coral')}>
    {[['Kavya Reddy', 'Treasury · Okta', 94, 'Critical', 'bg-coral'], ['Rahul Menon', 'Payments · AD', 78, 'High', 'bg-coral'], ['Ananya Rao', 'HR · M365', 52, 'Medium', 'bg-[#f2b04a]'], ['Arjun Nair', 'Engineering · GitHub', 18, 'Low', 'bg-[#3fc58a]']].map(([n, r, s, l, t]) => (
      <Row key={n} a={n} b={r} hot={l === 'Critical'} extra={<Bar pct={s} tone={t} />} chip={<span className="w-9 text-right font-display font-light leading-none text-ink" style={{ fontSize: 24 }}>{s}</span>} />
    ))}
  </W>,
  nhi: <W title="Non-human identities" right={C('2,847 identities', 'blue')}>
    <Row logo="aws" a="svc-payments-recon" b="IAM role · prod-payments · 3% used" chip={<Risk level="Critical" />} hot />
    <Row logo="aws" a="lambda-kyc-sync" b="Lambda role · ap-south-1" chip={<Risk level="High" />} />
    <Row logo="github" a="deploy-bot" b="GitHub app · 412 days old" chip={<Risk level="Medium" />} />
    <Row logo="aws" a="glue-ledger-etl" b="Glue job role · data-lake" chip={<Risk level="Low" />} />
  </W>,
  fraud: <W title="Fraud decisions" right={C('< 80 ms', 'green')}>
    <Row logo="phonepe" a="₹2,40,000 transfer" b="New payee · same device as 22 accounts" chip={C('Blocked', 'coral')} hot />
    <Row logo="paytm" a="₹4,200 UPI collect" b="Known payee · usual amount" chip={C('Approved', 'green')} />
    <Row logo="razorpay" a="₹58,000 card payment" b="New device · usual city" chip={C('Step-up', 'amber')} />
    <Row logo="okta" a="Login · Mumbai → Lagos" b="Impossible travel in 2 min" chip={C('Held', 'coral')} />
  </W>,
  ad: <W title="Attack paths" right={C('6 hops to Domain Admins', 'coral')}>
    <div className="relative rounded-[10px] bg-mist" style={{ height: 205 }}>
      <svg viewBox="0 0 440 190" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <path d="M50 150 C120 150 120 100 190 100 S260 50 330 50 M190 100 C250 120 300 150 360 150" fill="none" stroke="#cfd6df" strokeWidth="2" />
        <path d="M50 150 C120 150 120 100 190 100 S260 50 330 50" fill="none" stroke="#f0644d" strokeWidth="3" strokeDasharray="6 5" />
      </svg>
      {[[5, 66, 'ad', 'r.kapoor', false], [36, 36, 'ad', 'svc-sql-report', false], [60, 4, 'ad', 'Domain Admins', true], [66, 68, 'm365', 'Exchange', false]].map(([l0, t0, l, n, hot]) => (
        <div key={n} style={{ left: `${l0}%`, top: `${t0}%` }} className={`absolute flex items-center gap-2 rounded-[10px] border bg-white px-2.5 py-1.5 shadow-sm ${hot ? 'border-coral' : 'border-line-2'}`}><Tile name={l} size={24} /><span className="text-[12px] font-semibold text-ink">{n}</span></div>
      ))}
    </div>
  </W>,
  botshield: <W title="Traffic by intent" right={C('Bots 38%', 'coral')}>
    <div className="rounded-[10px] border border-line p-2.5">
      <svg viewBox="0 0 420 110" className="block w-full">
        <path d="M0 80 C50 78 90 70 140 72 S230 60 280 64 S370 70 420 66 V110 H0Z" fill="#e6f3fb" /><path d="M0 80 C50 78 90 70 140 72 S230 60 280 64 S370 70 420 66" fill="none" stroke="#0068ac" strokeWidth="2.5" />
        <path d="M0 98 C60 96 110 90 160 80 S230 20 280 14 S360 60 420 56" fill="none" stroke="#f0644d" strokeWidth="2.5" /><circle cx="280" cy="14" r="5" fill="#f0644d" />
      </svg>
    </div>
    <Row logo="okta" a="Credential stuffing" b="/login · 14,200 attempts" chip={C('Blocked', 'coral')} />
    <Row logo="razorpay" a="OTP abuse" b="/verify-otp · rotating IPs" chip={C('Challenged', 'amber')} />
  </W>,
  ddos: <W title="DDoS mitigation" right={C('Protected', 'green')}>
    <div className="rounded-[10px] border border-line p-2.5">
      <svg viewBox="0 0 420 120" className="block w-full">
        <path d="M0 100 C60 100 90 96 130 90 C160 80 170 10 210 8 C250 10 260 80 290 90 C330 96 360 100 420 100 V120 H0Z" fill="#fdebe7" stroke="#f0644d" strokeWidth="2" />
        <path d="M0 100 C120 100 300 100 420 100" stroke="#0068ac" strokeWidth="3" fill="none" />
      </svg>
    </div>
    <Row a="HTTP flood · Layer 7" b="Mitigated in 41 s · 0 traffic diverted" chip={C('Mitigated', 'green')} />
    <Row a="SYN flood · Layer 4" b="Rate shaped at the edge" chip={C('Mitigated', 'green')} />
  </W>,
  icms: <W title="Audit evidence" right={C('Ready for examiner', 'green')}>
    <div className="flex gap-3">
      <div className="flex-1 space-y-2">
        {[['DPDPA 2023', 96], ['RBI Master Directions', 90], ['SEBI CSCRF', 88]].map(([k, v]) => (
          <div key={k} className="rounded-[10px] border border-line px-3 py-2.5"><div className="flex justify-between text-[12.5px] font-semibold text-ink"><span>{k}</span><span>{v}%</span></div><div className="mt-1.5 h-2 rounded-full bg-line"><div className="h-2 rounded-full bg-brand" style={{ width: `${v}%` }} /></div></div>
        ))}
      </div>
      <div className="flex w-[120px] flex-col items-center justify-center rounded-[10px] bg-mist"><span className="font-display font-light leading-none text-ink" style={{ fontSize: 48 }}>92</span><span className="text-[11.5px] text-ink-3">posture score</span></div>
    </div>
    <Row a="Personal data inventory" b="14 systems · 1,284 access events linked to identity" chip={C('Complete', 'green')} />
  </W>,
};

createRoot(document.getElementById('root')).render(
  <div className="space-y-10 bg-white p-10">
    {Object.entries(SHOTS).map(([k, v]) => (
      <div key={k} id={`t-${k}`} className="frame overflow-hidden !rounded-none !p-[14px]" style={{ width: 480, height: 300, boxSizing: 'border-box' }}>{v}</div>
    ))}
  </div>,
);
