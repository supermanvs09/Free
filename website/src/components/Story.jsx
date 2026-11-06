import { useRef } from 'react';
import { Link } from 'react-router';
import { useOnView } from '../lib/nullmotion.jsx';
import { CERTS } from '../data/site.js';
import { PRODUCT_MENU } from '../data/nav.js';
import { CountUp, Icon, cx } from './ui.jsx';
import ProductMark from './ProductMark.jsx';
import CertSeal from './CertSeal.jsx';
import { Logo, logoTitle } from './viz/kit.jsx';

/* Coloured story panels, the grammar enterprise sites use to make a claim
   concrete: a large card with what the product does beside a person whose
   identity it protects (what it knows about them, what they can reach), a
   card with a sourced figure, and a card of proof. Used by the home page's
   "Who we help" and by the figures on every product page. People in the
   photos are models (Pexels, free licence); chips and access are
   illustrations, and every page that shows them says so. */

const Tick = ({ on }) => (
  <span className={cx('absolute -right-1.5 -top-1.5 grid h-[16px] w-[16px] place-items-center rounded-full text-white ring-2 ring-white', on ? 'bg-[#1f9d63]' : 'bg-[#e5484d]')}>
    {on ? <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true"><path d="m2.5 6.4 2.3 2.2L9.5 3.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      : <svg width="8" height="8" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>}
  </span>
);

export function Proof({ kind }) {
  if (kind === 'award') return (
    <div className="flex h-full flex-col">
      <img src="/img/events/dsci-excellence.webp" alt="" className="h-28 w-full rounded-[12px] object-cover" loading="lazy" decoding="async" />
      <p className="mt-4 text-[16px] font-semibold text-[var(--rc-ink)]">Cybersecurity Excellence, 2025</p>
      <p className="mt-1 text-[14px] text-[var(--rc-ink2)]">Awarded by the Data Security Council of India.</p>
      <Link to="/why-deep-algorithms#recognition" className="rc-link mt-auto pt-4">All recognition<Icon name="ArrowRight" size={13} weight="bold" /></Link>
    </div>
  );
  if (kind === 'customers') return (
    <div className="flex h-full flex-col">
      <p className="text-[13px] font-semibold uppercase tracking-[.1em] text-[var(--rc-ink2)]">Trusted by banks in India</p>
      <ul className="mt-5 space-y-4">
        {[['canara-bank', 'Canara Bank'], ['karnataka-bank', 'Karnataka Bank'], ['dcb-bank', 'DCB Bank']].map(([k, n]) => (
          <li key={k}>
            <img src={`/img/logos/${k}.webp`} alt={n} className="rc-on-light h-8 w-auto max-w-[150px] object-contain" loading="lazy" decoding="async" />
            <img src={`/img/logos/${k}-white.webp`} alt={n} className="rc-on-dark h-8 w-auto max-w-[150px] object-contain" loading="lazy" decoding="async" />
          </li>
        ))}
      </ul>
      <Link to="/solutions/bfsi" className="rc-link mt-auto pt-4">Banking and financial services<Icon name="ArrowRight" size={13} weight="bold" /></Link>
    </div>
  );
  if (kind === 'gov') return (
    <div className="flex h-full flex-col">
      <p className="text-[13px] font-semibold uppercase tracking-[.1em] text-[var(--rc-ink2)]">Trusted by government and public bodies</p>
      <ul className="mt-5 space-y-4">
        {[['meity', 'MeitY, Government of India'], ['ncrtc', 'NCRTC'], ['ccoe', 'Cybersecurity Centre of Excellence']].map(([k, n]) => (
          <li key={k}>
            <img src={`/img/logos/${k}.webp`} alt={n} className="rc-on-light h-9 w-auto max-w-[160px] object-contain" loading="lazy" decoding="async" />
            <img src={`/img/logos/${k}-white.webp`} alt={n} className="rc-on-dark h-9 w-auto max-w-[160px] object-contain" loading="lazy" decoding="async" />
          </li>
        ))}
      </ul>
      <Link to="/solutions/government" className="rc-link mt-auto pt-4">Government and public sector<Icon name="ArrowRight" size={13} weight="bold" /></Link>
    </div>
  );
  if (kind === 'deploy') return (
    <div className="flex h-full flex-col">
      <span className="grid h-11 w-11 place-items-center rounded-[12px] bg-white text-[#12171f] shadow-sm"><Logo k="aws" size="62%" /></span>
      <p className="mt-4 text-[16px] font-semibold text-[var(--rc-ink)]">Read-only, from the first day.</p>
      <p className="mt-1 text-[14px] leading-snug text-[var(--rc-ink2)]">One read-only role per AWS account. Nothing installed on your workloads.</p>
      <Link to="/adapid-ai/nhi-security" className="rc-link mt-auto pt-4">How it connects<Icon name="ArrowRight" size={13} weight="bold" /></Link>
    </div>
  );
  if (kind === 'regs') return (
    <div className="flex h-full flex-col">
      <p className="text-[13px] font-semibold uppercase tracking-[.1em] text-[var(--rc-ink2)]">Evidence mapped to</p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {['DPDP Act 2023', 'DPDP Rules 2025', 'RBI', 'SEBI', 'ISO 27701'].map((x) => <li key={x} className="rounded-full bg-white/80 px-3 py-1.5 text-[13.5px] font-medium text-[#151b24]">{x}</li>)}
      </ul>
      <Link to="/dpdpa-compliance" className="rc-link mt-auto pt-4">DPDPA compliance<Icon name="ArrowRight" size={13} weight="bold" /></Link>
    </div>
  );
  return (
    <div className="flex h-full flex-col">
      <p className="text-[13px] font-semibold uppercase tracking-[.1em] text-[var(--rc-ink2)]">Certified</p>
      <ul className="mt-4 space-y-3">
        {CERTS.map((c) => <li key={c.code} className="flex items-center gap-3 text-[14.5px] font-medium text-[var(--rc-ink)]"><CertSeal code={c.code} size={36} /><span>{c.name}<span className="block text-[12px] font-normal text-[var(--rc-ink2)]">{c.desc}</span></span></li>)}
      </ul>
    </div>
  );
}


const CHIP_ICONS = ['User', 'MapPin', 'DeviceMobile'];

/* What the product itself recorded: one object, the steps it took, the verdict.
   Rows tick in one after another (Null Motion notification-stack timing), the
   verdict lands last with a small squash. tone: 0 neutral, 1 good, 2 risk. */
const TONE = [['bg-[#eef1f5] text-[#5b6472]', 'Info'], ['bg-[#e8f6ef] text-[#0c7546]', 'OK'], ['bg-[#fdecec] text-[#c4352a]', 'Risk']];
function DecisionLog({ log: L }) {
  const ref = useRef(null);
  useOnView(ref, (g, el) => g.timeline()
    .from(el.querySelectorAll('.dl-row'), { opacity: 0, x: -14, filter: 'blur(4px)', duration: 0.5, stagger: 0.22, ease: 'power3.out' })
    .from(el.querySelector('.dl-verdict'), { opacity: 0, scale: 0.6, duration: 0.55, ease: 'back.out(2.2)' }, '-=0.1')
    .to(el.querySelector('.dl-verdict'), { scaleX: 1.08, scaleY: 0.92, duration: 0.1, yoyo: true, repeat: 1 }));
  return (
    <div ref={ref} className="rc-rec w-full max-w-[470px] overflow-hidden rounded-[18px] bg-white" role="img" aria-label={`${L.title}, ${L.obj}: ${L.rows.map((r) => r[1]).join('; ')}. ${L.verdict}.`}>
      <div className="flex items-center justify-between gap-3 border-b border-[#0e1116]/[.07] bg-[#f8fafc] px-4 py-2.5">
        <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[.08em] text-[#5b6472]"><ProductMark p={L.product} size={18} />{L.title}</span>
        <span className="flex items-center gap-1.5 text-[11.5px] text-[#0c7546]"><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#1f9d63]" />Live</span>
      </div>
      <div className="px-4 pt-3.5">
        <p className="mono text-[15px] font-semibold text-[#0e1116]">{L.obj}</p>
        <p className="text-[12.5px] text-[#5b6472]">{L.sub}</p>
      </div>
      <ol className="mt-3 px-4">
        {L.rows.map(([k, t, tone], i) => (
          <li key={i} className="dl-row grid grid-cols-[66px_1fr_auto] items-start gap-3 border-t border-[#0e1116]/[.06] py-2.5 text-[13px]">
            <span className="mono pt-px text-[11.5px] text-[#8a909b]">{k}</span>
            <span className={cx('min-w-0 break-words leading-snug', tone === 2 ? 'font-medium text-[#c4352a]' : 'text-[#2b313b]')}>{t}</span>
            <span className={cx('rounded-full px-2 py-0.5 text-[10.5px] font-semibold', TONE[tone][0])}>{TONE[tone][1]}</span>
          </li>
        ))}
      </ol>
      <div className="flex justify-end border-t border-[#0e1116]/[.07] px-4 py-3">
        <span className="dl-verdict inline-flex items-center gap-1.5 rounded-full bg-[#0a6dbb] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-[0_8px_20px_-8px_rgb(10_109_187/.7)]"><Icon name="CheckCircle" size={14} weight="fill" />{L.verdict}</span>
      </div>
    </div>
  );
}

export function StoryCard({ story: R, log }) {
  const alert = R.alert !== undefined && R.alert !== null && R.alert >= 0;
  const products = PRODUCT_MENU.filter((m) => (R.products || []).includes(m.key));
  return (
    <div className={cx('rc-main grid overflow-hidden rounded-[22px]', log ? 'md:grid-cols-[.8fr_1.2fr]' : 'md:grid-cols-[1.05fr_.95fr]')}>
      <div className="flex flex-col p-7 md:p-9">
        {R.kicker && <p className="mb-4 text-[13px] font-semibold uppercase tracking-[.1em] text-[var(--rc-ink2)]">{R.kicker}</p>}
        <h3 className="text-[clamp(22px,2vw,27px)] font-semibold leading-tight tracking-[-0.02em] text-[var(--rc-ink)]">{R.h}</h3>
        <ul className="mt-6 space-y-3">
          {R.points.map((x) => (
            <li key={x} className="flex gap-3 text-[15.5px] leading-snug text-[var(--rc-ink2)]">
              <Icon name="CheckCircle" size={20} weight="fill" className="mt-px shrink-0 text-[#2f6fe4]" />{x}
            </li>
          ))}
        </ul>
        {products.length > 0 && (
          <div className="mt-7 flex flex-wrap items-center gap-2">
            {products.map((p) => <Link key={p.key} to={p.path} className="rc-pill inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-[14px] font-medium"><ProductMark p={p.key} size={24} />{p.name}</Link>)}
          </div>
        )}
        {R.to && <Link to={R.to} className="rc-link mt-auto pt-7">{R.cta}<Icon name="ArrowRight" size={14} weight="bold" /></Link>}
      </div>
      {/* the identity as the product sees it: a profile record, not a poster */}
      <div className={cx('rc-side relative flex items-center justify-center p-5 md:p-8', log && 'rc-photo min-h-[520px] items-end md:justify-end max-md:pt-56')}>
        {log && <>
          {/* the person behind the record, as enterprise sites show it: a real working moment, the product's view laid over it */}
          <img src={R.photo} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: R.pos || '50% 30%' }} loading="lazy" decoding="async" />
          <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-l from-[#06213f]/45 via-transparent to-transparent" />
        </>}
        {log ? <div className="relative w-full max-w-[330px] md:origin-bottom-right md:scale-[.92] md:-mb-2 md:-mr-2"><DecisionLog log={log} /></div> : <div aria-hidden="true" className="rc-rec w-full max-w-[380px] overflow-hidden rounded-[18px] bg-white">
          <div className="relative h-[150px] md:h-[170px]">
            <img src={R.photo} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: R.pos || '50% 30%' }} loading="lazy" decoding="async" />
            <span className={cx('absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold shadow-sm', alert ? 'bg-[#fdecec] text-[#c4352a]' : 'bg-[#e8f6ef] text-[#0c7546]')}>
              <i className={cx('h-1.5 w-1.5 rounded-full', alert ? 'bg-[#e5484d]' : 'bg-[#1f9d63]')} />{alert ? 'Flagged' : 'Verified'}
            </span>
          </div>
          <ul className="divide-y divide-[#0e1116]/[.07] px-4">
            {R.chips.map((c, i) => (
              <li key={c} className={cx('rc-chip flex items-center gap-3 py-2.5 text-[13.5px]', i === 0 ? 'font-semibold text-[#0e1116]' : 'text-[#434852]', R.alert === i && 'font-medium !text-[#c4352a]')} style={{ animationDelay: `${150 + i * 120}ms` }}>
                <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-[7px]', R.alert === i ? 'bg-[#fdecec] text-[#c4352a]' : 'bg-[#eef5fc] text-[#0a6dbb]')}><Icon name={(R.icons || CHIP_ICONS)[i]} size={13} weight="bold" /></span>{c}
              </li>
            ))}
          </ul>
          {R.apps?.length > 0 && (
            <div className="flex items-center justify-between gap-3 border-t border-[#0e1116]/[.07] bg-[#f8fafc] px-4 py-3">
              <span className="text-[11.5px] font-semibold uppercase tracking-[.08em] text-[#8a909b]">Access</span>
              <ul className="flex gap-2">
                {R.apps.map(([k, ok], i) => (
                  <li key={k} title={logoTitle(k)} className="rc-chip relative grid h-8 w-8 place-items-center rounded-[8px] border border-[#0e1116]/[.08] bg-white text-[#12171f]" style={{ animationDelay: `${500 + i * 90}ms` }}>
                    <Logo k={k} size="55%" /><Tick on={ok} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>}
      </div>
    </div>
  );
}

/* One sourced figure, large; any others listed under it. */
export function StatCard({ items, className }) {
  const [a, ...rest] = items;
  return (
    <div className={cx('rc-stat rounded-[22px] p-7', className)}>
      <p className="rc-num font-semibold tracking-[-0.04em]" style={{ fontSize: 'clamp(40px, 3.6vw, 54px)', lineHeight: 1 }}><CountUp value={a.v} /></p>
      <p className="mt-3 text-[15px] leading-snug text-[var(--rc-ink)]">{a.l}</p>
      {a.s && <p className="mt-3 text-[12.5px] text-[var(--rc-ink2)]">Source: {a.s}</p>}
      {rest.length > 0 && (
        <ul className="mt-5 space-y-4 border-t border-[#151b24]/10 pt-5">
          {rest.map((x) => (
            <li key={x.l}>
              <p className="text-[15px] leading-snug text-[var(--rc-ink)]"><span className="mr-1.5 text-[22px] font-semibold tracking-[-0.02em]">{x.v}</span>{x.l}</p>
              {x.s && <p className="mt-1 text-[12px] text-[var(--rc-ink2)]">Source: {x.s}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
