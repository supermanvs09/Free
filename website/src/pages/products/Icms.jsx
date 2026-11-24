import { SearchType, useOnView } from '../../lib/nullmotion.jsx';
import { useRef, useState } from 'react';
import { Seo } from '../../lib/head.jsx';
import { PRODUCTS } from '../../data/products.js';
import { Icon, Reveal, SectionHead, cx } from '../../components/ui.jsx';
import { CtaBand, ResearchRow } from '../../components/blocks.jsx';
import { Hero, Stats, Faq, Split, LINKS, ACC } from '../../components/ProductKit.jsx';
import { DataMap, BreachClock, ConsentLedger } from '../../components/viz/icms.jsx';
import { AuditorQuestions } from '../../components/Changes.jsx';
import { STORIES } from '../../data/stories.js';
import ProductMark from '../../components/ProductMark.jsx';

const p = PRODUCTS.icms;
const A = ACC.icms;

/* What the Act asks, what ICMS does about it, and the evidence it leaves behind. */
const DUTIES = [
  { d: 'Know what personal data you hold', how: 'Discovers personal data across structured and unstructured stores, including the places it should not be.', ev: 'Data inventory by store, category and owner' },
  { d: 'Process only for a stated purpose', how: 'Links every access to an identity, human or machine, and checks it against the declared purpose.', ev: 'Access log with purpose and identity' },
  { d: 'Honour consent and its withdrawal', how: 'Tracks consent per data principal and purpose, and flags access that falls outside it.', ev: 'Consent ledger with every change' },
  { d: 'Protect data with reasonable safeguards', how: 'Watches who reads what, catches unusual reads and exports, and connects to identity risk.', ev: 'Safeguard checks and exceptions raised' },
  { d: 'Report a breach in time', how: 'Scopes affected records and data principals and drafts the report from evidence already held.', ev: 'Breach file with timeline and scope' },
];
function Duties() {
  const [o, setO] = useState(0);
  return (
    <div className="overflow-hidden rounded-[22px] border border-line">
      {DUTIES.map((x, i) => (
        <div key={x.d} className={cx('border-b border-line last:border-0 transition-colors', o === i && 'bg-icms/[.06]')}>
          <button type="button" aria-expanded={o === i} onClick={() => setO(o === i ? -1 : i)} className="flex w-full items-center gap-5 px-5 py-5 text-left md:px-7">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[13px] font-semibold num" style={{ borderColor: o === i ? A : 'var(--color-line-2)', color: o === i ? A : 'var(--color-ink-3)' }}>{i + 1}</span>
            <span className="flex-1 text-[17px] font-semibold tracking-[-0.015em] md:text-[19px]">{x.d}</span>
            <Icon name="CaretDown" size={16} className={cx('shrink-0 text-ink-3 transition-transform', o === i && 'rotate-180')} />
          </button>
          {o === i && (
            <div className="fadein grid gap-4 px-5 pb-6 md:grid-cols-2 md:px-7 md:pl-[76px]">
              <div><p className="text-[12px] font-semibold uppercase tracking-[.08em] text-ink-3">What ICMS does</p><p className="mt-2 text-[15.5px] leading-relaxed text-ink-2">{x.how}</p></div>
              <div><p className="text-[12px] font-semibold uppercase tracking-[.08em]" style={{ color: A }}>Evidence you keep</p><p className="mt-2 flex gap-2 text-[15.5px] leading-relaxed text-ink"><Icon name="FileText" size={18} className="mt-[3px] shrink-0" style={{ color: A }} />{x.ev}</p></div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const FAQ = [
  { title: 'Which regulations does ICMS cover?', body: 'It is built around the Digital Personal Data Protection Act 2023 and the DPDP Rules 2025, with evidence mapped to RBI and SEBI expectations. The same evidence model supports GDPR obligations.' },
  { title: 'Does it include service accounts?', body: 'Yes. Every access is tied to an identity, human or machine, so service accounts and integrations are checked against purpose too.' },
  { title: 'How quickly can we produce an audit package?', body: 'Evidence is assembled continuously, so a package can be generated in minutes rather than collected over weeks.' },
];


/* Hero: the evidence ledger. A search for one kind of personal data, and every
   access to it streaming in with who, why, and the consent verdict; the audit
   package is the last line, not a floating card. Names are illustrations. */
const LEDGER = [
  ['10:02:14', 'kyc-review@bank', 'Aadhaar · 1 record', 'KYC review', 'Allowed', 1],
  ['10:02:31', 'loan-app (service)', 'Aadhaar, PAN · 1', 'Loan underwriting', 'Allowed', 1],
  ['10:03:05', 'mkt-export@bank', 'Aadhaar · 48,210', 'Campaign targeting', 'Refused · no consent', 2],
  ['10:03:40', 'support-l1@bank', 'Aadhaar · 1 record', 'Customer call', 'Masked view', 0],
  ['10:04:12', 'analytics-bot (agent)', 'Aadhaar · 9,300', 'Model training', 'Refused · purpose', 2],
];
const VERDICT = ['bg-[#eef3f9] text-[#3d5a80]', 'bg-[#e8f6ef] text-[#0c7546]', 'bg-[#fdecec] text-[#c4352a]'];
function Ledger() {
  const ref = useRef(null);
  useOnView(ref, (g, el) => {
    const q = el.querySelector('.lg-q'), word = 'Aadhaar', o = { n: 0 };
    return g.timeline()
      .fromTo(o, { n: 0 }, { n: word.length, duration: 0.9, ease: 'none', onUpdate: () => { q.textContent = word.slice(0, Math.round(o.n)); } }, 0.3)
      .from(el.querySelectorAll('.lg-r'), { opacity: 0, y: 10, filter: 'blur(4px)', duration: 0.45, stagger: 0.32, ease: 'power3.out' }, 1.3)
      .from(el.querySelectorAll('.lg-v'), { scale: 0.6, opacity: 0, duration: 0.4, stagger: 0.32, ease: 'back.out(2.2)' }, 1.5)
      .from(el.querySelector('.lg-done'), { y: 14, opacity: 0, duration: 0.5, ease: 'back.out(1.8)' }, 3.4);
  }, { threshold: 0.1 });
  return (
    <div ref={ref} className="overflow-hidden rounded-[22px] border border-[#0a5ea3]/12 bg-white text-left shadow-[0_40px_90px_-40px_rgb(10_94_163/.5)]" role="img"
      aria-label="ICMS evidence ledger: every access to Aadhaar data with who, purpose and consent verdict. A marketing export and an analytics agent are refused; the audit package is ready.">
      <div className="flex items-center gap-3 border-b border-line bg-[#f6f9fd] px-5 py-3">
        <span className="flex items-center gap-2 text-[13.5px] font-semibold text-ink"><ProductMark p="icms" size={20} />ICMS · PII access</span>
        <span className="ml-auto flex h-9 min-w-[44%] items-center gap-2 rounded-full border border-line bg-white px-3.5 text-[13px] text-ink shadow-sm max-sm:hidden">
          <Icon name="MagnifyingGlass" size={14} className="text-ink-3" /><span className="lg-q">Aadhaar</span><i className="h-4 w-px animate-pulse bg-[#0a6dbb]" />
          <span className="ml-auto text-[11.5px] text-ink-3">Today</span>
        </span>
      </div>
      <div className="grid grid-cols-[64px_1.2fr_1fr_1fr_150px] gap-3 border-b border-line px-5 py-2 text-[11px] font-semibold uppercase tracking-[.08em] text-ink-3 max-sm:grid-cols-[1fr_auto]">
        <span className="max-sm:hidden">Time</span><span>Who</span><span className="max-sm:hidden">Data</span><span className="max-sm:hidden">Purpose</span><span className="text-right">Verdict</span>
      </div>
      <ol>
        {LEDGER.map(([t, who, data, why, v, tone]) => (
          <li key={t} className="lg-r grid grid-cols-[64px_1.2fr_1fr_1fr_150px] items-center gap-3 border-b border-line px-5 py-3 text-[13px] max-sm:grid-cols-[1fr_auto]">
            <span className="mono text-[11.5px] text-ink-3 max-sm:hidden">{t}</span>
            <span className="min-w-0"><span className="mono block truncate text-[12.5px] text-ink">{who}</span><span className="block truncate text-[11.5px] text-ink-3 sm:hidden">{data} · {why}</span></span>
            <span className="truncate text-ink-2 max-sm:hidden">{data}</span>
            <span className="truncate text-ink-2 max-sm:hidden">{why}</span>
            <span className={cx('lg-v justify-self-end whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold', VERDICT[tone])}>{v}</span>
          </li>
        ))}
      </ol>
      <div className="lg-done m-4 flex items-center gap-3 rounded-[14px] bg-gradient-to-r from-[#0a5ea3] to-[#1e88d8] px-4 py-3 text-white shadow-[0_16px_30px_-14px_rgb(10_94_163/.8)]">
        <Icon name="FileText" size={22} weight="fill" />
        <span className="min-w-0 flex-1"><span className="block text-[14.5px] font-semibold">Audit package ready in 4 minutes</span><span className="block text-[12.5px] text-white/80">Every access above, with its purpose and consent, for DPDPA, RBI and SEBI</span></span>
      </div>
    </div>
  );
}

export default function Icms() {
  return (
    <>
      <Seo title={p.seoTitle} description={p.description} path={p.path} crumbs={[{ name: 'ICMS Compliance Suite', path: p.path }]} />
      <Hero glance={[['Protects', 'PII and sensitive personal data, where it already lives'], ['Stops', 'Access without consent or a lawful purpose'], ['Deploys', 'Connected to your data stores and identity sources'], ['Shows', 'DPDPA evidence, ready for the 72-hour breach report']]} acc="icms" crumbs={[{ name: 'Products', path: '/products' }, { name: 'ICMS Compliance Suite' }]} eyebrow="ICMS Compliance Suite · DPDPA"
        title={<>Protect every piece of PII. <span style={{ color: 'var(--acc)' }}>Prove DPDPA compliance.</span></>}
        lead="ICMS finds the PII your organisation holds, from Aadhaar and PAN to account numbers and health records, masks it where it should not be seen, checks every access against purpose and consent, and keeps the evidence an auditor asks for."
        note="For customer data, patient records and employee data.">
        <Ledger />
      </Hero>

      <section className="sec" aria-labelledby="duty-h">
        <div className="wrap grid gap-12 lg:grid-cols-[.75fr_1.25fr] lg:gap-16">
          <Reveal>
            <p className="eyebrow" style={{ '--acc': A }}>The Act, duty by duty</p>
            <h2 id="duty-h" className="t-h2 mt-6">Every DPDPA duty, and the evidence that proves you met it.</h2>
            <p className="t-lead mt-5">Open a duty to see what ICMS does about it and the evidence it leaves behind.</p>
          </Reveal>
          <Reveal delay={100}><Duties /></Reveal>
        </div>
      </section>

      {/* the PII lifecycle, in one row: what ICMS does to personal data from the moment it is found */}
      <section className="sec-tight" aria-labelledby="pii-h">
        <div className="wrap">
          <SectionHead align="left" id="pii-h" acc={A} eyebrow="PII protection" title="From the moment PII is found to the day it is erased." />
          <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[['MagnifyingGlass', 'Discover', 'Scan every store for PII and sensitive personal data'], ['Tag', 'Classify', 'Label Aadhaar, PAN, financial and health data by sensitivity'], ['EyeSlash', 'Mask', 'Mask or tokenise PII for people and apps that do not need it'], ['Fingerprint', 'Govern access', 'Check each access against identity, purpose and consent'], ['Trash', 'Retain and erase', 'Erase on request or at retention end, with proof']].map(([ic, h, d], i) => (
              <Reveal as="li" key={h} delay={i * 60} className="card relative p-5">
                <span className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-[12px] text-white" style={{ background: 'linear-gradient(140deg,#1e88d8,#0a5ea3)' }}><Icon name={ic} size={19} /></span><span className="mono text-[12px] text-ink-3">{String(i + 1).padStart(2, '0')}</span></span>
                <h3 className="mt-4 text-[17px] font-semibold">{h}</h3>
                <p className="mt-1.5 text-[14px] leading-snug text-ink-2">{d}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <Split id="discover" acc="icms" eyebrow="PII discovery and classification" title="Find every piece of PII, even where it should not be." lead="Databases, buckets, warehouses and shared drives scanned and classified: Aadhaar, PAN, phone numbers, account numbers, health records. Each store gets an owner, and PII outside its approved place is flagged." visual={<DataMap />} />
      <Split id="consent" className="stage" acc="icms" flip eyebrow="Purpose and consent" title="Who touched what, and why." lead="Every access is linked to an identity and checked against its declared purpose and the principal’s consent. Access outside consent is flagged the moment it happens." visual={<ConsentLedger />} />
      <Split id="breach" acc="icms" eyebrow="Breach response" title="Inside the 72 hours, with evidence in hand." lead="When a breach happens, ICMS scopes the affected records and data principals and drafts the report from evidence it already holds." visual={<BreachClock />} />

      <section className="sec" aria-labelledby="chg-h">
        <div className="wrap">
          <SectionHead align="left" id="chg-h" acc="var(--color-icms)" eyebrow="What changes" title="Five questions every auditor asks. How long they take to answer." lead="Today, and with ICMS keeping the evidence as personal data is used." />
          <div className="mt-12"><AuditorQuestions /></div>
        </div>
      </section>

      <section id="evidence" className="sec scroll-mt-20" aria-labelledby="ev-h">
        <div className="wrap">
          <SectionHead id="ev-h" acc={A} eyebrow="Audit evidence" title="Audit packages in one click, not one quarter." lead="Evidence assembled continuously and mapped to DPDPA, RBI and SEBI obligations." />
          <SearchType />
          <div className="m-rail mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[['ClipboardText', 'Records of processing', 'Purposes, categories and the systems that process them'], ['ListChecks', 'Consent ledger', 'Every consent, withdrawal and change, per principal'], ['Fingerprint', 'Identity-linked access', 'Who read what, when, and under which purpose'], ['Siren', 'Breach readiness', 'Runbooks, contacts and the 72-hour timeline']].map(([ic, h, t], i) => (
              <Reveal key={h} delay={i * 70} className="card p-6">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] bg-icms/12 text-icms"><Icon name={ic} size={22} /></span>
                <h3 className="t-h3 mt-5">{h}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{t}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Stats acc="icms" items={p.stats} {...STORIES.icms} />
      <Faq items={FAQ} />
      <ResearchRow slugs={p.research} />
      <CtaBand related={[LINKS.cirm, LINKS.zenstra, LINKS.nhi]} accent="icms" title={p.cta.title} body={p.cta.body} primary={{ label: 'Book a gap analysis', to: '/request-demo' }} />
    </>
  );
}
