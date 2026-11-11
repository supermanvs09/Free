import { useState } from 'react';
import { Link } from 'react-router';
import { SITE } from '../data/site.js';
import { PLATFORMS, INDUSTRIES, COMPANY } from '../data/ia.js';
import { Icon, cx } from './ui.jsx';
import { Logo } from './Header.jsx';

/* The footer reads the same IA as the menus (src/data/ia.js). On a phone each
   column folds into a row you open; from tablets up all are open. */
function Col({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="max-md:border-b max-md:border-line">
      <h2 className="mb-5 font-mono text-[11.5px] font-medium uppercase tracking-[.14em] text-ink-3 max-md:hidden">{title}</h2>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between py-4 text-left md:hidden">
        <span className="text-[13px] font-semibold uppercase tracking-[.08em] text-ink-2">{title}</span>
        <Icon name="CaretDown" size={14} className={cx('text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>
      <ul className={cx('space-y-2.5 text-[14.5px] max-md:pb-5', !open && 'max-md:hidden')}>{children}</ul>
    </div>
  );
}
const L = ({ to, children, sub }) => <li className={sub ? 'pl-3' : undefined}><Link to={to} className={cx('transition-colors hover:text-white', sub ? 'text-ink-3' : 'text-ink-2')}>{children}</Link></li>;

export default function Footer() {
  const [adap, zen, icms] = PLATFORMS;
  return (
    <footer className="site-foot tone-d noprint relative">
      <div className="container pb-10 pt-16 md:pt-20">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_3fr]">
          <div>
            <Link to="/" aria-label="Deep Algorithms home" className="inline-block"><Logo inverse className="h-[32px]" /></Link>
            <p className="mt-5 max-w-[320px] text-[14.5px] leading-relaxed text-ink-3">Identity security, fraud prevention, AI agent security and DPDPA compliance, built in Hyderabad.</p>
            <ul className="mt-6 space-y-2.5 text-[14.5px]">
              <li><a href={`mailto:${SITE.email}`} className="inline-flex items-center gap-2 text-ink-2 hover:text-white"><Icon name="EnvelopeSimple" size={16} />{SITE.email}</a></li>
              <li><a href={SITE.phoneHref} className="inline-flex items-center gap-2 text-ink-2 hover:text-white"><Icon name="Phone" size={16} />{SITE.phone}</a></li>
              <li><a href={SITE.linkedin} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-ink-2 hover:text-white"><Icon name="LinkedinLogo" size={16} />LinkedIn<span className="sr-only"> (opens in a new tab)</span></a></li>
            </ul>
          </div>
          <div className="grid gap-x-8 md:grid-cols-4 md:gap-y-10">
            <Col title="Products">
              <L to={adap.path}>adapID AI</L>
              {adap.items.map((i) => <L key={i.key} to={i.path} sub>{i.short || i.name.replace('Identity Fraud Prevention', 'Fraud Prevention').replace('Active Directory Security', 'AD Security').replace('NHI Security for AWS', 'NHI for AWS')}</L>)}
              <L to={zen.path}>Zenstra AI</L>
              <L to={icms.path}>ICMS Compliance Suite</L>
              <L to="/products">All products</L>
            </Col>
            <Col title="Solutions">
              {INDUSTRIES.map((x) => <L key={x.slug} to={x.path}>{x.name}</L>)}
            </Col>
            <Col title="Resources">
              <L to="/blogs">Blog and research</L>
              <L to="/prompt-heist">Prompt Heist</L>
              <L to="/about-us#news">In the news</L>
            </Col>
            <Col title="Company">
              {COMPANY.map((x) => <L key={x.path} to={x.path}>{x.name}</L>)}
              <L to="/request-demo">Book a demo</L>
            </Col>
          </div>
        </div>
        <div className="mt-14 flex flex-col gap-4 border-t border-line pt-6 text-[13px] text-ink-3 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} {SITE.legalName} · Gachibowli, Hyderabad 500032, India</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {[['Terms of use', '/terms-of-use'], ['Privacy policy', '/privacy-policy'], ['Cookie policy', '/cookie-policy'], ['Accessibility', '/accessibility'], ['Sitemap', '/sitemap']].map(([n, to]) => (
              <li key={to}><Link to={to} className="hover:text-white">{n}</Link></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="container overflow-hidden pb-6" aria-hidden="true">
        <p className="wordmark wm-rise select-none text-center">Deep Algorithms</p>
      </div>
    </footer>
  );
}
