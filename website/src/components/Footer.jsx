import { Link } from 'react-router';
import { LINES, SOLUTIONS, SITE } from '../data/site.js';
import { Logo } from './Header.jsx';
import { Icon } from './ui.jsx';

function Col({ title, children }) {
  return (
    <div>
      <h2 className="font-sans text-[15px] font-medium text-ink">{title}</h2>
      <ul className="mt-4 space-y-2.5 text-[14px]">{children}</ul>
    </div>
  );
}
const L = ({ to, children }) => <li><Link to={to} className="text-ink-3 hover:text-brand">{children}</Link></li>;

export default function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="wrap pb-10 pt-16">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-5 max-w-[300px] text-[14px] leading-relaxed text-ink-3">Identity security for the AI era. Built in Hyderabad for regulated enterprises.</p>
          </div>
          <Col title="Products">
            <L to="/products">All products</L>
            {LINES.map((l) => <L key={l.key} to={l.path}>{l.name}</L>)}
            <L to="/adapid-ai/nhi-security">NHI Security for AWS</L>
            <L to="/platform">Why Deep Algorithms</L>
          </Col>
          <Col title="Solutions">{SOLUTIONS.map((s) => <L key={s.slug} to={`/solutions/${s.slug}`}>{s.name}</L>)}</Col>
          <Col title="Company">
            <L to="/about-us">About us</L>
            <L to="/about-us#careers">Careers</L>
            <L to="/contact">Contact</L>
            <L to="/request-demo">Book a demo</L>
          </Col>
          <Col title="Research">
            <L to="/blogs">All research</L>
            <L to="/blogs/india-mule-account-crisis">Mule account crisis</L>
            <L to="/blogs/ai-agent-governance">AI agent governance</L>
            <L to="/blogs/confessions-entry-01">Confessions of a Hacker</L>
          </Col>
        </div>
        <div className="mt-14 flex flex-col gap-4 border-t border-line pt-6 text-[13px] text-ink-3 md:flex-row md:items-center">
          <span className="flex items-center gap-1.5"><Icon name="MapPin" size={14} />Gachibowli, Hyderabad 500032, India</span>
          <Link to="/terms-of-use" className="hover:text-brand">Terms of use</Link>
          <Link to="/privacy-policy" className="hover:text-brand">Privacy policy</Link>
          <Link to="/cookie-policy" className="hover:text-brand">Cookie policy</Link>
          <span>© {new Date().getFullYear()} {SITE.legalName}</span>
          <a href={SITE.linkedin} target="_blank" rel="noreferrer" aria-label="Deep Algorithms on LinkedIn" className="hover:text-brand md:ml-auto"><Icon name="LinkedinLogo" size={22} /></a>
        </div>
      </div>
    </footer>
  );
}
