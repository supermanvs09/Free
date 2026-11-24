import { useState } from 'react';
import { Link } from 'react-router';
import { SITE, SOLUTIONS, CERTS } from '../data/site.js';
import { PRODUCT_MENU } from '../data/nav.js';
import { Icon, cx } from './ui.jsx';
import { Logo } from './Header.jsx';
import ProductMark from './ProductMark.jsx';
import CertSeal from './CertSeal.jsx';

/* On a phone each column folds into a row you open; from tablets up all are open. */
function Col({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="max-md:border-b max-md:border-line">
      <p className="mb-4 text-[12.5px] font-semibold uppercase tracking-[.1em] text-ink-3 max-md:hidden">{title}</p>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between py-4 text-left md:hidden">
        <span className="text-[12.5px] font-semibold uppercase tracking-[.1em] text-ink-3">{title}</span>
        <Icon name="CaretDown" size={14} className={cx('text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>
      <ul className={cx('space-y-2.5 text-[14.5px] max-md:pb-5', !open && 'max-md:hidden')}>{children}</ul>
    </div>
  );
}
const L = ({ to, children }) => <li><Link to={to} className="text-ink-2 transition-colors hover:text-ink">{children}</Link></li>;

export default function Footer() {
  return (
    <footer className="site-foot noprint relative border-t border-line bg-[#0b0e13]">
      <div className="wrap pb-10 pt-16 md:pt-20">
        <div className="grid gap-12 lg:grid-cols-[1.25fr_2.6fr]">
          <div>
            <Link to="/" aria-label="Deep Algorithms home" className="inline-block"><Logo className="h-[32px]" /></Link>
            <p className="mt-5 max-w-[340px] text-[15px] leading-relaxed text-ink-2">Identity security, fraud prevention, AI agent security and DPDPA compliance, built in Hyderabad for organisations that cannot afford a breach.</p>
            <ul className="mt-6 space-y-2 text-[14.5px]">
              <li><a href={`mailto:${SITE.email}`} className="inline-flex items-center gap-2 text-ink-2 hover:text-ink"><Icon name="EnvelopeSimple" size={16} />{SITE.email}</a></li>
              <li><a href={SITE.phoneHref} className="inline-flex items-center gap-2 text-ink-2 hover:text-ink"><Icon name="Phone" size={16} />{SITE.phone}</a></li>
              <li><a href={SITE.linkedin} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-ink-2 hover:text-ink"><Icon name="LinkedinLogo" size={16} />Deep Algorithms on LinkedIn</a></li>
            </ul>
            <ul className="mt-7 flex flex-wrap gap-2" aria-label="Certifications">
              {CERTS.map((c) => <li key={c.code} title={c.name}><CertSeal code={c.code} size={46} title={c.name} /></li>)}
            </ul>
          </div>
          <div className="grid gap-x-8 md:grid-cols-4 md:gap-y-10">
            <Col title="Products">
              {PRODUCT_MENU.map((l) => <li key={l.key}><Link to={l.path} className="inline-flex items-center gap-2 text-ink-2 transition-colors hover:text-ink"><ProductMark p={l.key} size={18} />{l.name}</Link></li>)}
              <L to="/adapid-ai/nhi-security">NHI Security for AWS</L>
              <L to="/adapid-ai/fraud-prevention">Identity Fraud Prevention</L>
              <L to="/ad-security">Active Directory Security</L>
            </Col>
            <Col title="Solutions">
              {SOLUTIONS.map((s) => <L key={s.slug} to={`/solutions/${s.slug}`}>{s.name}</L>)}
              <L to="/products">All products</L>
              <L to="/why-deep-algorithms">Why Deep Algorithms</L>
            </Col>
            <Col title="Resources">
              <L to="/blogs">All blogs</L>
              <L to="/blogs/india-mule-account-crisis">Mule account crisis</L>
              <L to="/blogs/ai-agent-governance">AI agent governance</L>
              <L to="/blogs/ai-code-reviewer-trust">AI code reviewer trust</L>
              <L to="/blogs/confessions-entry-01">Confessions of a Hacker</L>
            </Col>
            <Col title="Company">
              <L to="/why-deep-algorithms#leadership">Leadership</L>
              <L to="/why-deep-algorithms#careers">Careers</L>
              <L to="/contact">Contact</L>
              <L to="/product-tour">Product tour</L>
              <L to="/request-demo">Book a demo</L>
            </Col>
          </div>
        </div>
        <div className="mt-16 flex flex-col gap-4 border-t border-line pt-7 text-[13.5px] text-ink-3 lg:flex-row lg:items-center lg:justify-between">
          <p>© {new Date().getFullYear()} {SITE.legalName} · Gachibowli, Hyderabad 500032, India</p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {[['Terms of use', '/terms-of-use'], ['Privacy policy', '/privacy-policy'], ['Cookie policy', '/cookie-policy'], ['Accessibility', '/accessibility'], ['Sitemap', '/sitemap']].map(([t, to]) => <li key={to}><Link to={to} className="hover:text-ink">{t}</Link></li>)}
          </ul>
        </div>
      </div>
    </footer>
  );
}
