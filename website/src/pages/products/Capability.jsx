import { Link } from 'react-router';
import { Seo } from '../../lib/head.jsx';
import { ZCAPS } from '../../data/zenstra.js';
import { Icon, Reveal, SectionHead, cx } from '../../components/ui.jsx';
import { CtaBand, ResearchRow } from '../../components/blocks.jsx';
import Stage3D from '../../components/Stage3D.jsx';
import { Hero, Steps, Points, ACC } from '../../components/ProductKit.jsx';
import { ZenApproval, ZenInventory, ZenGrant, ZenMcp, ZenDetect, ZenRecord } from '../../components/viz/zenstra.jsx';

const VIS = { discovery: ZenInventory, identity: ZenGrant, enforce: ZenApproval, mcp: ZenMcp, detect: ZenDetect, record: ZenRecord };
const ICON = { discovery: 'MagnifyingGlass', identity: 'Fingerprint', enforce: 'ShieldCheck', mcp: 'PlugsConnected', detect: 'Pulse', record: 'ClipboardText' };
const STAGE = { discovery: 'Discover', identity: 'Scope', enforce: 'Enforce', mcp: 'Trust', detect: 'Detect', record: 'Prove' };
const A = ACC.zen;

function Rail({ current }) {
  return (
    <nav aria-label="Zenstra capabilities" className="no-scrollbar -mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
      <ol className="flex min-w-max gap-2 md:grid md:min-w-0 md:grid-cols-6">
        {Object.values(ZCAPS).map((c, i) => {
          const on = c.kind === current;
          return (
            <li key={c.path}>
              <Link to={c.path} aria-current={on ? 'page' : undefined} className={cx('card card-hover flex h-full w-[170px] flex-col p-4 md:w-auto', on && '!border-zen/50')} style={on ? { background: 'rgb(147 162 255 / .1)' } : undefined}>
                <span className="flex items-center justify-between text-[12px] font-semibold uppercase tracking-[.08em]" style={{ color: on ? A : 'var(--color-ink-3)' }}>{STAGE[c.kind]}<span className="num">{String(i + 1).padStart(2, '0')}</span></span>
                <span className="mt-3 flex items-center gap-2 text-[15px] font-semibold"><Icon name={ICON[c.kind]} size={17} style={{ color: A }} />{c.name}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default function Capability({ id }) {
  const c = ZCAPS[id];
  const V = VIS[c.kind];
  return (
    <>
      <Seo title={c.seoTitle.replace(/ \| Zenstra AI$/, '')} description={c.description} path={c.path} crumbs={[{ name: 'Zenstra AI', path: c.parent }, { name: c.name, path: c.path }]} />
      <Hero acc="zen" crumbs={[{ name: 'Zenstra AI', path: c.parent }, { name: c.name }]} eyebrow={`Zenstra AI · ${c.name}`}
        title={<>{c.hero.lead} <span style={{ color: 'var(--acc)' }}>{c.hero.accent}.</span></>} lead={c.hero.sub}>
        <Stage3D tilt={[6, -14]}><V /></Stage3D>
      </Hero>

      <section className="sec-tight" aria-label="All Zenstra capabilities"><div className="wrap"><Rail current={c.kind} /></div></section>

      <section className="sec" aria-labelledby="how-h">
        <div className="wrap">
          <SectionHead id="how-h" acc={A} eyebrow="How it works" title="Three steps. No agent rewritten." />
          <div className="mt-12"><Steps acc="zen" items={c.steps.map(([h, p]) => ({ h, p }))} /></div>
        </div>
      </section>

      <section className="sec" aria-labelledby="gain-h">
        <div className="wrap">
          <SectionHead align="left" id="gain-h" acc={A} eyebrow="What changes" title="What you stop worrying about." />
          <div className="mt-12"><Points acc="zen" items={c.gains.map(([h, p], i) => ({ h, p, icon: ['CheckCircle', 'Eye', 'Users'][i] }))} /></div>
          <Reveal className="mt-12 flex flex-wrap items-center justify-between gap-6 rounded-[22px] border border-line p-6 md:p-8" style={{ background: 'linear-gradient(90deg, rgb(147 162 255 / .1), transparent)' }}>
            <p className="max-w-[640px] text-[17px] text-ink-2"><span className="font-semibold text-ink">{c.name}</span> is one of six Zenstra AI capabilities. They share one inventory, one policy and one decision record.</p>
            <Link to={c.parent} className="link" style={{ '--acc': A }}>See Zenstra AI<Icon name="ArrowRight" size={14} weight="bold" /></Link>
          </Reveal>
        </div>
      </section>

      <ResearchRow slugs={c.research} />
      <CtaBand accent="zen" title="Run it against your own agents." body={`A 30-minute session on Zenstra ${c.name}, with your platforms and your questions.`} />
    </>
  );
}
