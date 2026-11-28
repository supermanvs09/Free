import { prerender } from 'react-dom/static';
import { StaticRouter } from 'react-router';
import App, { PATHS } from './App.jsx';
import { HeadContext, headToHtml } from './lib/head.jsx';

export { PATHS };

export async function render(url) {
  const head = {};
  // Static pages: keep every boundary inline. Without this, React outlines large
  // boundaries into a later segment and the page shows its placeholder first.
  const { prelude } = await prerender(
    <HeadContext.Provider value={head}><StaticRouter location={url}><App /></StaticRouter></HeadContext.Provider>,
    { progressiveChunkSize: Number.MAX_SAFE_INTEGER },
  );
  const html = await new Response(prelude).text();
  return { html, head: headToHtml(head) };
}
