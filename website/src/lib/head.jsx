import { createContext, useContext, useEffect } from 'react';
import { SITE } from '../data/site.js';

/* Per-page <head>. During prerender values go into a context object that
   scripts/prerender.mjs writes into the HTML; in the browser they update
   document.head on navigation. */
export const HeadContext = createContext(null);

const ORG = {
  '@type': 'Organization', '@id': `${SITE.url}/#org`, name: SITE.name, legalName: SITE.legalName, url: SITE.url,
  logo: `${SITE.url}/icon-512.png`, foundingDate: String(SITE.founded), email: SITE.email, telephone: SITE.phone,
  sameAs: [SITE.linkedin],
  address: { '@type': 'PostalAddress', streetAddress: 'Shanta Sriram Tech Park, Gachibowli', addressLocality: 'Hyderabad', addressRegion: 'Telangana', postalCode: '500032', addressCountry: 'IN' },
};

export function buildHead({ title, description, path = '/', image, type = 'website', schema = [], crumbs, noindex }) {
  const fullTitle = title ? `${title} | ${SITE.name}` : `${SITE.name} | Identity Security for the AI Era`;
  const desc = description || SITE.description;
  const url = SITE.url + path;
  const graph = [ORG, ...schema];
  if (crumbs?.length) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [{ name: 'Home', path: '/' }, ...crumbs].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: SITE.url + c.path })),
    });
  }
  return { fullTitle, desc, url, img: SITE.url + (image || '/og/default.png'), type, noindex, jsonLd: { '@context': 'https://schema.org', '@graph': graph } };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function headToHtml(h) {
  return [
    `<title>${esc(h.fullTitle)}</title>`,
    `<meta name="description" content="${esc(h.desc)}" />`,
    h.noindex ? '<meta name="robots" content="noindex" />' : '<meta name="robots" content="index, follow" />',
    `<link rel="canonical" href="${esc(h.url)}" />`,
    `<meta property="og:type" content="${h.type}" />`,
    `<meta property="og:site_name" content="${SITE.name}" />`,
    `<meta property="og:title" content="${esc(h.fullTitle)}" />`,
    `<meta property="og:description" content="${esc(h.desc)}" />`,
    `<meta property="og:url" content="${esc(h.url)}" />`,
    `<meta property="og:image" content="${esc(h.img)}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    '<meta property="og:locale" content="en_IN" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(h.fullTitle)}" />`,
    `<meta name="twitter:description" content="${esc(h.desc)}" />`,
    `<meta name="twitter:image" content="${esc(h.img)}" />`,
    `<script type="application/ld+json">${JSON.stringify(h.jsonLd).replace(/</g, '\\u003c')}</script>`,
  ].filter(Boolean).join('\n    ');
}

function setMeta(attr, key, value) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute('content', value);
}

export function Seo(props) {
  const ctx = useContext(HeadContext);
  const h = buildHead(props);
  if (ctx && typeof window === 'undefined') Object.assign(ctx, h);

  useEffect(() => {
    document.title = h.fullTitle;
    setMeta('name', 'description', h.desc);
    setMeta('name', 'robots', h.noindex ? 'noindex' : 'index, follow');
    for (const [k, v] of [['og:title', h.fullTitle], ['og:description', h.desc], ['og:url', h.url], ['og:image', h.img], ['og:type', h.type]]) setMeta('property', k, v);
    setMeta('name', 'twitter:title', h.fullTitle);
    setMeta('name', 'twitter:description', h.desc);
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
    link.href = h.url;
    let ld = document.head.querySelector('script[type="application/ld+json"]');
    if (!ld) { ld = document.createElement('script'); ld.type = 'application/ld+json'; document.head.appendChild(ld); }
    ld.textContent = JSON.stringify(h.jsonLd);
  }, [h.fullTitle, h.desc, h.url]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
