import { useState } from 'react';
import { Seo } from '../lib/head.jsx';
import { CtaBand } from '../components/blocks.jsx';
import { BlurWords } from '../lib/nullmotion.jsx';
import FilmModal, { FILM, openFilm } from '../components/home/FilmModal.jsx';
import HeroWave from '../home/HeroWave.jsx';
import Overview from '../home/Overview.jsx';
import { TrustGap, IdentityGraph, PostureScore, SessionSignals, ResponseLadder } from '../home/Identity.jsx';
import { ClaudeBlock, AgentRadar, WorkflowGuard, CloudGateway } from '../home/Agents.jsx';
import { Link } from 'react-router';

/* Home, redesigned. One story after the hero: Continuous AI Security Posture
   Management, told in two halves. 01 · identity posture for people and
   machines (the argument of Cisco's Identity Intelligence film: attackers
   log in, and authentication is trusted blindly all the way to access).
   02 · AI agents, with Zenstra's three ways in (discovery on every device,
   workflow security, cloud security). Every picture is a live product scene
   with real app marks, played by anime.js; headings sharpen in with Null
   Motion's blur reveal (GSAP). The closing demo card is the site's own. */

const Arrow = ({ down }) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{down ? <path d="M12 5v14M6 13l6 6 6-6" /> : <path d="M5 12h14M13 6l6 6-6 6" />}</svg>;
const Tick = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const Play = () => <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>;

const IDENTITY_CARDS = [
  { k: 'Discover', h: 'See every identity that can log in.', p: 'People, service accounts, keys, tokens and AI agents, pulled from your identity providers, clouds and SaaS into one inventory, each with an owner.', V: IdentityGraph },
  { k: 'Assess', h: 'Fix the posture attackers look for.', p: 'Missing MFA, dormant admins, unused keys and shared passwords, ranked by what they can reach, and checked again after every fix.', V: PostureScore },
  { k: 'Detect', h: 'Catch the threat inside the session.', p: 'Each identity is compared with its own normal. Weak signals that mean nothing alone are joined into one detection, while the session is still open.', V: SessionSignals },
  { k: 'Respond', h: 'Respond in proportion, everywhere at once.', p: 'Your policy turns risk into action: step-up, hold the transaction or revoke every session, through the identity provider you already run.', V: ResponseLadder },
];
const LOOP = [['Discover', 'Every identity, owned'], ['Assess', 'Posture scored and fixed'], ['Detect', 'Behaviour, not rules'], ['Respond', 'Through your IdP'], ['Prove', 'Every decision recorded']];

export default function Home() {
  const [paused, setPaused] = useState(false);
  return (
    <div className="dx">
      <Seo path="/" description="Deep Algorithms discovers every human, machine and AI agent identity in your enterprise and protects each one from AI-driven threats with Continuous AI Security Posture Management. ISO 27001, SOC 2 Type II, ISO 42001." />

      {/* HERO: a flowing wave of light strands, signals travelling through it */}
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

      {/* CONTINUOUS AI-SPM: the umbrella, in one picture */}
      <section id="aispm" className="dx-band ink tight-top scroll-mt-20" aria-labelledby="aispm-h">
        <div className="dx-wrap">
          <div className="dx-head-c">
            <p className="dx-k">Continuous AI Security Posture Management</p>
            <BlurWords as="h2" id="aispm-h" className="dx-h2" text="Securing your identities and digital ecosystem from AI-driven threats." />
            <p className="dx-lead">One engine watches every person, machine and AI agent that can act in your business, scores its posture continuously and decides before an unsafe action runs.</p>
          </div>
          <div style={{ marginTop: 'clamp(48px, 6vw, 80px)' }}><Overview /></div>
          <nav className="dx-pillars" aria-label="The two halves of Continuous AI-SPM">
            <a className="dx-pillar" href="#identity">
              <span className="n">01</span>
              <span><b>Identity security posture</b><span>People and machine identities, from login to access</span></span>
              <span className="ar"><Arrow down /></span>
              <span className="bar" style={{ background: 'linear-gradient(90deg, transparent, var(--sig), transparent)' }} />
            </a>
            <a className="dx-pillar" href="#agents">
              <span className="n">02</span>
              <span><b>AI agent security · Zenstra AI</b><span>Agents on devices, in workflows and in your cloud</span></span>
              <span className="ar"><Arrow down /></span>
              <span className="bar" style={{ background: 'linear-gradient(90deg, transparent, var(--agent), transparent)' }} />
            </a>
          </nav>
        </div>
      </section>

      {/* 01 · IDENTITY POSTURE */}
      <section id="identity" className="dx-band paper scroll-mt-20" aria-labelledby="identity-h">
        <div className="dx-wrap">
          <div className="dx-head-s">
            <div>
              <p className="dx-k"><i>01</i>Continuous identity security posture</p>
              <BlurWords as="h2" id="identity-h" className="dx-h2" text="Attackers don’t hack in anymore. They log in." />
            </div>
            <p className="dx-lead">Stolen credentials, phishing and MFA fatigue all end the same way: a valid login. Most stacks then trust it blindly, from authentication all the way to access. Deep Algorithms keeps asking whether each identity should still have the access it holds.</p>
          </div>
          <div style={{ marginTop: 'clamp(40px, 5vw, 64px)' }}><TrustGap /></div>
          <div className="dx-bento">
            {IDENTITY_CARDS.map(({ k, h, p, V }, i) => (
              <article key={k} className="dx-card">
                <V />
                <div className="dx-card-b">
                  <p className="dx-k"><i>{String(i + 1).padStart(2, '0')}</i>{k}</p>
                  <h3 className="dx-h3">{h}</h3>
                  <p className="dx-p">{p}</p>
                </div>
              </article>
            ))}
          </div>
          <ol className="dx-loop" aria-label="The continuous loop" style={{ margin: '20px 0 0', padding: 0 }}>
            {LOOP.map(([b, s], i) => <li key={b} style={{ '--i': i }}><i>{String(i + 1).padStart(2, '0')}</i><b>{b}</b><span>{s}</span></li>)}
          </ol>
          <p style={{ marginTop: 32 }}><Link to="/adapid-ai" className="dx-link">Explore adapID AI <Arrow /></Link></p>
        </div>
      </section>

      {/* 02 · AI AGENTS (ZENSTRA) */}
      <section id="agents" className="dx-band ink zen scroll-mt-20" aria-labelledby="agents-h">
        <div className="dx-wrap">
          <div className="dx-head-s">
            <div>
              <p className="dx-k"><i>02</i>AI agent security · Zenstra AI</p>
              <BlurWords as="h2" id="agents-h" className="dx-h2" text="Every AI agent is a new identity with real access." />
            </div>
            <p className="dx-lead">Agents read your documents, hold your credentials and act in your core systems. Zenstra checks every agent action before it runs, on every device, across your workflows and inside your cloud, and records why.</p>
          </div>

          <div className="zx-feature">
            <div className="zx-feature-t">
              <div style={{ display: 'grid', gap: 14 }}>
                <p className="dx-k" style={{ color: 'var(--agent-2)' }}>Zenstra AI Discovery · on every device</p>
                <h3 className="dx-h3">Secrets stopped before they leave the laptop.</h3>
                <p className="dx-p">A developer pastes a production .env into Claude to debug a deploy. Zenstra reads the prompt on the device, finds the keys and the password, and blocks it before it is sent.</p>
              </div>
              <ul>
                <li><Tick />Sees the prompt, the tool call and the device together</li>
                <li><Tick />Covers Copilot, ChatGPT, Claude Code and Cursor on staff devices</li>
                <li><Tick />Contains one agent in seconds, with the reason on record</li>
              </ul>
            </div>
            <ClaudeBlock />
          </div>

          <div className="zx-three">
            {[
              { k: 'Discover', h: 'Find every agent, including the shadow ones.', p: 'Agent platforms and staff devices scanned for agents and MCP servers. Each one gets an owner and a purpose.', V: AgentRadar },
              { k: 'Workflow Security', h: 'Every hop checked against its task.', p: 'Each step of an agent workflow is checked before the next one runs. Steps outside the task are stopped.', V: WorkflowGuard },
              { k: 'Cloud Security', h: 'A gateway inside your cloud.', p: 'In front of every MCP server, model and API your agents call. Payloads never leave your environment.', V: CloudGateway },
            ].map(({ k, h, p, V }) => (
              <article key={k} className="dx-card">
                <V />
                <div className="dx-card-b">
                  <p className="dx-k">{k}</p>
                  <h3 className="dx-h3">{h}</h3>
                  <p className="dx-p">{p}</p>
                </div>
              </article>
            ))}
          </div>

          <ul className="zx-facts" style={{ padding: 0 }}>
            <li><b>Inline</b><span>Decided before the action runs</span></li>
            <li><b>p95 18 ms</b><span>Decision latency, inline</span></li>
            <li><b>Fails closed</b><span>No decision, no action</span></li>
            <li><b>On the record</b><span>Every decision, with its reason</span></li>
          </ul>
          <p style={{ marginTop: 32 }}><Link to="/agentic-ai/agentic-identity" className="dx-link">Explore Zenstra AI <Arrow /></Link></p>
        </div>
      </section>

      <CtaBand />
      <FilmModal />
    </div>
  );
}
