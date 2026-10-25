import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { Button, Icon } from '../components/ui.jsx';

const POPULAR = [
  ['Zenstra AI', '/agentic-ai/agentic-identity'], ['adapID AI', '/adapid-ai'], ['NHI Security for AWS', '/adapid-ai/nhi-security'],
  ['BotShield AI', '/botshield-ai'], ['ICMS Compliance Suite', '/dpdpa-compliance'], ['Research', '/blogs'],
];

export default function NotFound() {
  return (
    <>
      <Seo title="Page not found" path="/404" noindex description="The page you are looking for does not exist or has moved." />
      <section className="wrap py-24 text-center md:py-32">
        <p className="eyebrow">Error 404</p>
        <h1 className="t-h1 mx-auto mt-3 max-w-[760px]">This page does not exist</h1>
        <p className="t-lead mx-auto mt-5 max-w-[560px]">It may have moved when we rebuilt the site. Try one of these, or head back home.</p>
        <ul className="mx-auto mt-10 flex max-w-[760px] flex-wrap justify-center gap-3">
          {POPULAR.map(([n, to]) => (
            <li key={to}><Link to={to} className="inline-flex items-center gap-1.5 rounded-full border border-line-2 px-4 py-2 text-[15px] text-ink hover:border-brand hover:text-brand">{n}<Icon name="CaretRight" size={12} weight="bold" /></Link></li>
          ))}
        </ul>
        <div className="mt-10"><Button to="/">Back to home</Button></div>
      </section>
    </>
  );
}
