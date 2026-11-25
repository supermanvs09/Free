import { useState } from 'react';
import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { CtaBand } from '../components/blocks.jsx';
import ProductMark from '../components/ProductMark.jsx';
import { CERTS, CUSTOMERS } from '../data/site.js';
import { PRODUCT_MENU } from '../data/nav.js';
import FilmModal, { FILM, openFilm } from '../components/home/FilmModal.jsx';
import HeroWave from '../home/HeroWave.jsx';
import Replay from '../home/Replay.jsx';
import { ClaudeBlock } from '../home/Agents.jsx';

/* Home (round 3). The order enterprise security leaders use, measured in
   docs/reference/home-ia.md: promise → proof → one signature platform
   picture → products → demo. Three moving pictures only: the ambient hero
   wave, the attack replay (the signature, a player you control) and the
   film's Claude scene in the Zenstra card. Everything else is still. */

const Arrow = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
const Tick = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const Play = () => <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>;

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

      {/* 3 · SIGNATURE: Continuous AI-SPM, shown as one AI-driven attack, replayed */}
      <section id="aispm" className="dx-band rpx scroll-mt-20" aria-labelledby="aispm-h">
        <div className="dx-wrap">
          <div className="rpx-head">
            <div>
              <p className="dx-k">Continuous AI Security Posture Management</p>
              <h2 id="aispm-h" className="dx-h2">Securing your identities and digital ecosystem from AI-driven threats.</h2>
            </div>
            <p className="dx-lead">One AI-driven attack, replayed: a cloned voice, a reset MFA and a hijacked AI agent. Every identity it touches is watched continuously, so every step is stopped before it lands.</p>
          </div>
          <Replay />
          <p className="rpx-note">A composite of documented AI-driven techniques: deepfake help-desk calls, MFA resets and prompt injection. Names and data are illustrative.</p>
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

      <CtaBand />
      <FilmModal />
    </div>
  );
}
