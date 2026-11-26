import { useState } from 'react';
import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { CtaBand } from '../components/blocks.jsx';
import ProductMark from '../components/ProductMark.jsx';
import { CERTS, CUSTOMERS } from '../data/site.js';
import { SOLUTION_PAGES } from '../data/solutions.js';
import { PRODUCTS } from '../data/products.js';
import { RECOGNITION } from '../data/company.js';
import { POSTS, formatDate } from '../data/posts.js';
import { Gl } from '../components/viz/kit.jsx';
import { PRODUCT_MENU } from '../data/nav.js';
import FilmModal, { FILM, openFilm } from '../components/home/FilmModal.jsx';
import HeroWave from '../home/HeroWave.jsx';
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

const SECURE = [
  { g: 'user', h: 'People', p: 'A live risk score for every employee, contractor and customer login, from your identity provider to the payment.', stops: 'Deepfake help-desk calls, AI-written phishing, MFA fatigue', by: 'adapID AI', to: '/adapid-ai' },
  { g: 'key', h: 'Machine identities', p: 'Every service account, cloud role, key and Active Directory path, found, scored and watched for behaviour that drifts.', stops: 'Leaked keys, bot-scale credential stuffing, paths to Domain Admins', by: 'adapID AI', to: '/adapid-ai/nhi-security' },
  { g: 'bot', h: 'AI agents', p: 'Every agent, copilot and MCP server given an owner and a scope, with each action checked against its task before it runs.', stops: 'Prompt injection, tool poisoning, shadow AI, secrets pasted into AI', by: 'Zenstra AI', to: '/agentic-ai/agentic-identity' },
  { g: 'db', h: 'Personal data', p: 'PII found wherever it lives, every access checked against purpose and consent, and evidence ready for the DPDP Act.', stops: 'Misuse of legitimate access, unreported breaches', by: 'ICMS', to: '/dpdpa-compliance' },
];
const LOOP = [['Discover', 'Every identity, with an owner'], ['Assess', 'Posture scored and fixed'], ['Detect', 'Behaviour, not rules'], ['Decide', 'Inline, before it runs'], ['Prove', 'Every decision on record']];
const FIGURES = [
  { v: '< 80 ms', l: 'risk decision at every login, payee and payment', s: 'Deep Algorithms benchmark' },
  { v: 'p95 18 ms', l: 'to decide an AI agent’s tool call, inline', s: 'Zenstra AI' },
  { v: '< 5 min', l: 'to generate a DPDP audit package', s: 'Deep Algorithms benchmark' },
  { v: '4', l: 'independent certifications: ISO 27001, SOC 2 Type II, ISO 42001, ISO 27701', s: 'Audited annually' },
];
const LOGOS = ['meity', 'canara-bank', 'karnataka-bank', 'dcb-bank', 'ncrtc', 'iit-kanpur', 'iit-mandi', 'iiit-hyderabad', 'bhaktivedanta', 'ccoe'];
const PROD = {
  adapid: { secures: 'Human and machine identities', line: 'A live risk score for every login, key and service account, with the response decided the moment behaviour changes.' },
  icms: { secures: 'Personal data under the DPDP Act', line: 'Personal data found across your estate, every access checked for purpose and consent, and audit evidence on demand.' },
};

export default function Home() {
  const [paused, setPaused] = useState(false);
  const menu = Object.fromEntries(PRODUCT_MENU.map((l) => [l.key, l]));
  const names = Object.fromEntries(CUSTOMERS);
  return (
    <div className="dx">
      <Seo path="/" description="Deep Algorithms discovers every human, machine and AI agent identity in your enterprise and protects each one from AI-driven threats with Continuous AI Security Posture Management. ISO 27001, SOC 2 Type II, ISO 42001." />

      {/* 1 · HERO: a flowing wave of light strands, signals travelling through it */}
      <section className="dx-hero" aria-labelledby="hero-h">
        <HeroWave paused={paused} />
        <button type="button" className="dx-pause" onClick={() => setPaused((v) => !v)} aria-label={paused ? 'Play background animation' : 'Pause background animation'}>
          {paused ? <Play /> : <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /></svg>}
        </button>
        <div className="dx-wrap">
          <div className="dx-hero-copy">
            <h1 id="hero-h" className="rise" style={{ '--d': '40ms' }}>Discover every human, machine and AI agent identity.</h1>
            <div className="dx-hero-cta rise" style={{ '--d': '160ms' }}>
              <Link to="/request-demo" className="dx-btn solid">Book a demo</Link>
              <button type="button" className="dx-btn ghost" onClick={() => openFilm(0)}><Play />Watch video ({FILM.length.padStart(5, '0')})</button>
            </div>
          </div>
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

      {/* 3 · CONTINUOUS AI-SPM: what we secure, the threats we stop, the loop */}
      <section id="aispm" className="dx-band ink scroll-mt-20" aria-labelledby="aispm-h">
        <div className="dx-wrap">
          <div className="dx-head-s">
            <div>
              <p className="dx-k">Continuous AI Security Posture Management</p>
              <h2 id="aispm-h" className="dx-h2">Securing your identities and digital ecosystem from AI-driven threats.</h2>
            </div>
            <p className="dx-lead">Attackers now use AI to clone voices, write phishing that passes and try stolen passwords at bot scale. Deep Algorithms watches every identity that can act in your business, people, machines and AI agents, and decides before an unsafe action runs.</p>
          </div>
          <div className="ai-grid">
            {SECURE.map((x) => (
              <article key={x.h} className="ai-cell">
                <span className="ai-ic"><Gl g={x.g} /></span>
                <h3>{x.h}</h3>
                <p>{x.p}</p>
                <p className="ai-stop"><span>Stops</span>{x.stops}</p>
                <Link to={x.to} className="ai-by">{x.by} <Arrow /></Link>
              </article>
            ))}
          </div>
          <ol className="ai-loop" aria-label="How it runs, continuously">
            {LOOP.map(([n, t], i) => <li key={n}><i>{String(i + 1).padStart(2, '0')}</i><b>{n}</b><span>{t}</span></li>)}
          </ol>
        </div>
      </section>

      {/* 4 · PRODUCTS: three doors, one posture */}
      <section id="products" className="dx-band paper scroll-mt-20" aria-labelledby="products-h">
        <div className="dx-wrap">
          <div className="dx-head-s">
            <div>
              <p className="dx-k">Products</p>
              <h2 id="products-h" className="dx-h2">Three products. One posture.</h2>
            </div>
            <p className="dx-lead">They share one inventory, one policy engine and one decision record. Start where your risk is highest and add the others when you are ready.</p>
          </div>

          <article className="px-feature">
            <div className="px-feature-t">
              <div className="px-id"><ProductMark p="zenstra" size={40} /><span><b>Zenstra AI</b><small>AI agents</small></span></div>
              <h3 className="dx-h3">Let AI agents act. Check every action first.</h3>
              <p className="dx-p">A developer pastes a production .env into Claude to debug a deploy. Zenstra reads the prompt on the device, finds the keys and the password, and blocks it before it is sent.</p>
              <ul className="px-ticks">
                <li><Tick />Discovery on every device: Copilot, ChatGPT, Claude Code and Cursor</li>
                <li><Tick />Workflow security: every hop checked against its task</li>
                <li><Tick />Cloud security: a gateway in your VPC, p95 18 ms</li>
              </ul>
              <Link to={menu.zenstra.path} className="dx-link">Explore Zenstra AI <Arrow /></Link>
            </div>
            <ClaudeBlock />
          </article>

          <div className="px-two">
            {['adapid', 'icms'].map((k) => {
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

      {/* 6 · PROOF: measured, certified, recognised */}
      <section className="dx-band paper" aria-labelledby="num-h">
        <div className="dx-wrap">
          <div className="dx-head-s">
            <div>
              <p className="dx-k">Proof</p>
              <h2 id="num-h" className="dx-h2">Measured, certified and recognised.</h2>
            </div>
            <p className="dx-lead">Decisions fast enough to sit in the path of a login, a payment or an agent’s tool call, audited every year, and built in Hyderabad.</p>
          </div>
          <ul className="nm-stats">
            {FIGURES.map((f) => <li key={f.v}><b>{f.v}</b><span>{f.l}</span><small>{f.s}</small></li>)}
          </ul>
          <div className="nm-row">
            {RECOGNITION.slice(0, 3).map((r) => (
              <figure key={r.title} className="nm-award">
                <img src={`/img/events/${r.img}.webp`} alt={`${r.title}, ${r.where}`} loading="lazy" decoding="async" />
                <figcaption><b>{r.title}</b><span>{r.where} · {r.year}</span></figcaption>
              </figure>
            ))}
            <div className="nm-side">
              <div className="nm-patent">
                <p className="dx-k">Patent granted · October 2026</p>
                <p className="nm-pt">“Intelligent Centralized Middleware System and Method for Multi-Domain Fraud Detection, Investigation, and Resolution.”</p>
                <p className="nm-pn">Patent No. 602726</p>
              </div>
              <ul className="nm-certs">{CERTS.map((c) => <li key={c.code}><b>{c.name}</b><span>{c.desc}</span></li>)}</ul>
            </div>
          </div>
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

      <CtaBand />
      <FilmModal />
    </div>
  );
}
