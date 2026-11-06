import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { Button, Icon } from '../components/ui.jsx';

const POPULAR = [
  ['All products', '/products'], ['adapID AI', '/adapid-ai'], ['Zenstra AI', '/agentic-ai/agentic-identity'],
  ['ICMS Compliance Suite', '/dpdpa-compliance'], ['Solutions', '/solutions/bfsi'], ['Blog and research', '/blogs'], ['Contact', '/contact'],
];

export default function NotFound() {
  // the request line names the address the visitor typed (known only in the browser)
  const [path, setPath] = useState('');
  useEffect(() => { setPath(location.pathname); }, []);
  return (
    <>
      <Seo title="Page not found" path="/404" noindex description="The page you are looking for does not exist or has moved." />
      <section className="border-b border-line bg-[linear-gradient(180deg,#f6f8fb_0%,#fff_70%)]">
        <div className="container py-20 text-center md:py-28">
          <p className="eyebrow mx-auto">Error 404</p>
          <h1 className="t-h1 mx-auto mt-6 max-w-[760px]">This page does not exist.</h1>
          <p className="t-lead mx-auto mt-5 max-w-[560px]">It may have moved when we rebuilt the site. Try one of these, search, or head back home.</p>
          <p className="mono mx-auto mt-6 inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 rounded-full border border-line px-4 py-1.5 text-[12.5px] text-ink-3">
            <span>GET <span className="break-all text-ink-2">{path || '/…'}</span></span><span aria-hidden="true">·</span><span>404</span><span aria-hidden="true">·</span><span>risk 3/100</span><span aria-hidden="true">·</span><span className="text-[#6be3a4]">lost, not malicious</span>
          </p>
          <ul className="mx-auto mt-10 flex max-w-[760px] flex-wrap justify-center gap-3">
            {POPULAR.map(([n, to]) => (
              <li key={to}><Link to={to} className="inline-flex items-center gap-1.5 rounded-full border border-line-2 px-4 py-2 text-[15px] text-ink hover:border-brand hover:text-brand">{n}<Icon name="CaretRight" size={12} weight="bold" /></Link></li>
            ))}
          </ul>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button to="/" size="lg">Back to home</Button>
            <Button variant="secondary" size="lg" type="button" onClick={() => window.dispatchEvent(new CustomEvent('da:command', { detail: 'search' }))}><Icon name="MagnifyingGlass" size={16} />Search the site</Button>
          </div>
        </div>
      </section>
    </>
  );
}
