import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import ProductMark from '../components/ProductMark.jsx';
import { CERTS, CUSTOMERS } from '../data/site.js';
import { SOLUTION_PAGES } from '../data/solutions.js';
import { PRODUCTS } from '../data/products.js';
import { POSTS, formatDate } from '../data/posts.js';
import CertSeal from '../components/CertSeal.jsx';
import AispmGlobe from '../home/AispmGlobe.jsx';
import { PRODUCT_MENU } from '../data/nav.js';
import FilmModal, { FILM, openFilm } from '../components/home/FilmModal.jsx';
import HeroRadar from '../home/HeroRadar.jsx';
import Intro from '../home/Intro.jsx';
import { startScrollStory } from '../home/scrollStory.js';
import { ClaudeBlock } from '../home/Agents.jsx';

/* Home (round 3). The order enterprise security leaders use, measured in
   docs/reference/home-ia.md: promise → proof → one signature platform
   statement → products → industries → proof → research → demo. Two moving
   pictures only: the ambient hero wave and the film's Claude scene in the
   Zenstra card. Everything else is still. Visual direction: Dribbble shot
   'Liberty' (Emura), shortlist option A. */

const Arrow = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
const Tick = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const Play = () => <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>;

const LOGOS = ['meity', 'canara-bank', 'karnataka-bank', 'dcb-bank', 'ncrtc', 'iit-kanpur', 'iit-mandi', 'iiit-hyderabad', 'bhaktivedanta', 'ccoe'];
const PROD = {
  zenstra: { secures: 'AI agents', line: 'Every AI agent, copilot and MCP server found, owned and scoped to its task, with each action checked before it runs.' },
  adapid: { secures: 'Human and machine identities', line: 'A live risk score for every login, key and service account, with the response decided the moment behaviour changes.' },
  icms: { secures: 'Personal data under the DPDP Act', line: 'Personal data found across your estate, every access checked for purpose and consent, and audit evidence on demand.' },
};

export default function Home() {
  const root = useRef(null);
  useEffect(() => { let stop = () => {}; let gone = false; startScrollStory(root.current).then((f) => { if (gone) f(); else stop = f; }); return () => { gone = true; stop(); }; }, []);
  const menu = Object.fromEntries(PRODUCT_MENU.map((l) => [l.key, l]));
  const names = Object.fromEntries(CUSTOMERS);
  return (
    <div ref={root} className="dx">
      <Intro />
      <Seo path="/" description="Deep Algorithms discovers every human, machine and AI agent identity in your enterprise and protects each one from AI-driven threats with Continuous AI Security Posture Management. ISO 27001, SOC 2 Type II, ISO 42001." />

      {/* 1 · HERO: the promise, then a horizon scan that discovers every kind of identity */}
      <section className="dx-hero rd-hero" aria-labelledby="hero-h">
        <div className="dx-wrap">
          <h1 id="hero-h" className="rise" style={{ '--d': '40ms' }}>Discover every human, machine and AI&nbsp;agent identity.</h1>
          <div className="dx-hero-cta rise" style={{ '--d': '160ms' }}>
            <Link to="/request-demo" className="dx-btn solid">Book a demo</Link>
            <button type="button" className="dx-btn ghost" onClick={() => openFilm(0)}><Play />Watch video ({FILM.length.padStart(5, '0')})</button>
          </div>
          <HeroRadar />
        </div>
      </section>

      {/* 2 · PROOF, in the first scroll */}
      <section className="dx-proof" aria-labelledby="proof-h">
        <div className="dx-wrap">
          <h2 id="proof-h" className="dx-proof-h">Trusted by banks, government and enterprises across India</h2>
          <ul className="dx-logos">
            {LOGOS.map((k) => <li key={k}><img src={`/img/logos/${k}-white.webp`} alt={names[k]} loading="lazy" decoding="async" /></li>)}
          </ul>
          <ul className="dx-certs" aria-label="Certifications">
            {CERTS.map((c) => <li key={c.code}>{c.name}</li>)}
          </ul>
        </div>
      </section>

      {/* 3 · CONTINUOUS AI-SPM: the name, the promise, and the picture that proves it */}
      <section id="aispm" className="dx-band ink ai-band scroll-mt-20" aria-labelledby="aispm-h">
        <div className="dx-wrap">
          <div className="ai-title">
            <h2 id="aispm-h" className="ai-big">Continuous AI Security Posture Management</h2>
            <p className="ai-sub">Securing your Identities and Digital Ecosystem from AI-driven threats.</p>
          </div>
          <AispmGlobe />
        </div>
      </section>

      {/* 4 · PRODUCTS: a white panel that grows to the full width as it arrives */}
      <section id="products" className="dx-band paper light grow-panel scroll-mt-20" aria-labelledby="products-h">
        <div className="dx-wrap">
          <div className="dx-head-s">
            <div>
              <p className="dx-k">Products</p>
              <h2 id="products-h" className="dx-h2">Built for every identity in your enterprise.</h2>
            </div>
            <p className="dx-lead">Security for people, machine identities, AI agents and personal data. Deploy the product your risk needs first, and add the others as you grow.</p>
          </div>
          <div className="pr-visual">
            <img src="/img/home/products-shield.webp" alt="Illustration: a blue shield at the centre of an enterprise's systems, connected to code, dashboards, credentials, cloud, workloads and documents." width="2720" height="1536" loading="lazy" decoding="async" />
          </div>
          <div className="pr-grid">
            {['zenstra', 'adapid', 'icms'].map((k) => {
              const L = menu[k];
              return (
                <article key={k} className="px-card">
                  <div className="px-id"><ProductMark p={k} size={40} /><span><b>{L.name}</b><small>{PROD[k].secures}</small></span></div>
                  <p className="dx-p">{PROD[k].line}</p>
                  <ul className="px-items">{L.items.slice(0, 4).map((m) => <li key={m.name}><Link to={m.path}>{m.name}<Arrow /></Link></li>)}</ul>
                  <Link to={L.path} className="dx-link">{`Explore ${L.name}`} <Arrow /></Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4b · ZENSTRA AI IN ACTION: the film's Claude scene, on its own */}
      <section className="dx-band ink" aria-labelledby="zen-h">
        <div className="dx-wrap">
          <div className="dx-head-s">
            <div>
              <p className="dx-k">Zenstra AI in action</p>
              <h2 id="zen-h" className="dx-h2">Secrets stopped before they leave the laptop.</h2>
            </div>
            <p className="dx-lead">A developer pastes a production .env into Claude to debug a deploy. Zenstra reads the prompt on the device, finds the keys and the password, and blocks it before it is sent.</p>
          </div>
          <article className="px-feature">
            <div className="px-feature-t">
              <div className="px-id"><ProductMark p="zenstra" size={40} /><span><b>Zenstra AI</b><small>AI agents</small></span></div>
              <h3 className="dx-h3">Let AI agents act. Check every action first.</h3>
              <ul className="px-ticks">
                <li><Tick />Discovery on every device: Copilot, ChatGPT, Claude Code and Cursor</li>
                <li><Tick />Workflow security: every hop checked against its task</li>
                <li><Tick />Cloud security: a gateway in your VPC, p95 18 ms</li>
              </ul>
              <Link to={menu.zenstra.path} className="dx-link">Explore Zenstra AI <Arrow /></Link>
            </div>
            <ClaudeBlock />
          </article>
        </div>
      </section>

      {/* 5 · INDUSTRIES */}
      <section className="dx-band ink" aria-labelledby="ind-h">
        <div className="dx-wrap">
          <div className="dx-head-s">
            <div>
              <p className="dx-k">Industries</p>
              <h2 id="ind-h" className="dx-h2">Built for India’s regulated industries.</h2>
            </div>
            <p className="dx-lead">Banks, hospitals, government departments and digital platforms run on the same identities attackers now target with AI. Each gets the products and the evidence its regulator expects.</p>
          </div>
          <div className="in-grid">
            {Object.entries(SOLUTION_PAGES).map(([slug, x]) => (
              <Link key={slug} to={`/solutions/${slug}`} className="in-card">
                <img src={`/img/photos/${slug}.webp`} alt="" width="1200" height="800" loading="lazy" decoding="async" />
                <span className="in-body">
                  <span className="in-name">{x.name}</span>
                  <span className="in-h">{x.title}</span>
                  <span className="in-tags">{(x.products || []).slice(0, 3).map((p) => <i key={p}>{PRODUCTS[p]?.name}</i>)}</span>
                  <span className="in-go">See how <Arrow /></span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 6 · CERTIFICATIONS */}
      <section className="dx-band paper light sheet-up" aria-labelledby="num-h">
        <div className="dx-wrap">
          <div className="dx-head-s">
            <div>
              <p className="dx-k">Certifications</p>
              <h2 id="num-h" className="dx-h2">Certified and independently audited.</h2>
            </div>
            <p className="dx-lead">Audited every year against the standards enterprises and regulators expect.</p>
          </div>
          <ul className="ce-grid">
            {CERTS.map((c) => <li key={c.code}><CertSeal code={c.code} size={72} /><b>{c.name}</b><span>{c.desc}</span></li>)}
          </ul>
        </div>
      </section>

      {/* 7 · RESEARCH */}
      <section className="dx-band ink" aria-labelledby="res-h">
        <div className="dx-wrap">
          <div className="rs-head">
            <div>
              <p className="dx-k">Research</p>
              <h2 id="res-h" className="dx-h2">How identities get attacked, and how to stop it.</h2>
            </div>
            <Link to="/blogs" className="dx-link">All research <Arrow /></Link>
          </div>
          <div className="rs-grid">
            {POSTS.slice(0, 3).map((p) => (
              <Link key={p.slug} to={`/blogs/${p.slug}`} className="rs-card">
                <span className="rs-cat">{p.category}</span>
                <span className="rs-t">{p.title}</span>
                <span className="rs-x">{p.excerpt}</span>
                <span className="rs-m">{formatDate(p)} · {p.read} min read</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 8 · THE CLOSE: one ask, over a horizon of light */}
      <section className="dx-band ink hz-cta" aria-labelledby="close-h">
        <div className="dx-wrap">
          <h2 id="close-h" className="dx-h2">Find your riskiest identity before attackers do.</h2>
          <p className="dx-lead">A 30-minute session with a Deep Algorithms engineer, on your own environment, with your own questions.</p>
          <Link to="/request-demo" className="dx-btn solid">Book a demo</Link>
        </div>
        <div aria-hidden="true" className="cta-glow" />
      </section>
      <FilmModal />
    </div>
  );
}
