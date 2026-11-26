import { SearchType } from '../../lib/nullmotion.jsx';
import { useState } from 'react';
import { Seo } from '../../lib/head.jsx';
import { PRODUCTS } from '../../data/products.js';
import { Icon, Reveal, SectionHead, cx } from '../../components/ui.jsx';
import { CtaBand, ResearchRow } from '../../components/blocks.jsx';
import { Hero, Faq, Split, LINKS, ACC } from '../../components/ProductKit.jsx';
import { DataMap, BreachClock, ConsentLedger } from '../../components/viz/icms.jsx';
import { AuditorQuestions } from '../../components/Changes.jsx';

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


export default function Icms() {
  return (
    <>
      <Seo title={p.seoTitle} description={p.description} path={p.path} crumbs={[{ name: 'ICMS Compliance Suite', path: p.path }]} />
      <Hero glance={[['Protects', 'PII and sensitive personal data, where it already lives'], ['Stops', 'Access without consent or a lawful purpose'], ['Deploys', 'Connected to your data stores and identity sources'], ['Shows', 'DPDPA evidence, ready for the 72-hour breach report']]} acc="icms" crumbs={[{ name: 'Products', path: '/products' }, { name: 'ICMS Compliance Suite' }]} eyebrow="ICMS Compliance Suite · DPDPA"
        title={<>Protect every piece of PII. <span style={{ color: 'var(--acc)' }}>Prove DPDPA compliance.</span></>}
        lead="ICMS finds the PII your organisation holds, from Aadhaar and PAN to account numbers and health records, masks it where it should not be seen, checks every access against purpose and consent, and keeps the evidence an auditor asks for."
        note="For customer data, patient records and employee data.">
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
      <Faq items={FAQ} />
      <ResearchRow slugs={p.research} />
      <CtaBand related={[LINKS.cirm, LINKS.zenstra, LINKS.nhi]} accent="icms" title={p.cta.title} body={p.cta.body} primary={{ label: 'Book a gap analysis', to: '/request-demo' }} />
    </>
  );
}
