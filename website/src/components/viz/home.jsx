import Stage3D, { Pop } from '../Stage3D.jsx';
import { Viz, Win, Chip, Logo, App, Spark, cx } from './kit.jsx';
import ProductMark from '../ProductMark.jsx';

/* ---------------- Home hero: live identity activity, in 3D ----------------
   Three identities act within a minute; each is decided by the product built
   for it. The decisions that matter lift out of the frame. Illustrative data. */
const ACT = [
  { app: 'okta', g: 'user', who: 'Priya Nair', sub: 'Treasury · Okta', act: 'Sign-in from a new device', where: 'Lagos · 02:14', d: ['Step-up', 'warn'], by: 'adapid', at: 4 },
  { app: 'iam', g: 'key', who: 'AKIA••7Q2F', sub: 'deploy-bot · AWS IAM', act: 's3:ListBuckets from an unknown IP', where: '185.220.x.x', d: ['Revoked', 'crit'], by: 'adapid', at: 5 },
  { app: 'copilotstudio', g: 'agent', who: 'invoice-agent', sub: 'Copilot Studio', act: 'Salesforce export to an outside address', where: 'outside its task', d: ['Blocked', 'crit'], by: 'zenstra', at: 4 },
];

export function HeroActivity({ k: fk, tilt = [7, -16], range, pad = '9% 6% 12% 12%' } = {}) {
  return (
    <Stage3D tilt={tilt} range={range} className="relative">
      <Viz k={fk} steps={[500, 700, 700, 900, 900, 1000]} hold={4200} label="Illustration: three identities act within a minute. A sign-in from a new device is sent for step-up, a cloud key used from an unknown address is revoked and an AI agent export is blocked before it runs.">
        {(k) => (
          <div className="relative" style={{ padding: pad }}>
            <Win title="Live identity activity" right={<Chip tone="info">3 decisions · last 60 s</Chip>} glow="rgb(0 150 240 / .55)">
              <div className="vz-rows">
                <div className="hd" style={{ gridTemplateColumns: '1.25fr 1.6fr .85fr' }}><span>Identity</span><span>Action</span><span>Decision</span></div>
                {ACT.map((a, i) => (
                  <div key={a.who} className={cx(`s${i + 1}`, k >= a.at && a.d[1] === 'crit' && 'hot')} style={{ gridTemplateColumns: '1.25fr 1.6fr .85fr' }}>
                    <span className="flex min-w-0 items-center gap-[.6em]">
                      <App k={a.app} />
                      <span className="min-w-0"><span className={cx('block truncate vz-t', a.g === 'key' && 'mono')}>{a.who}</span><span className="block truncate vz-m">{a.sub}</span></span>
                    </span>
                    <span className="min-w-0"><span className="block truncate vz-t" style={{ fontWeight: 450 }}>{a.act}</span><span className="block truncate vz-m">{a.where}</span></span>
                    <span className="flex items-center gap-[.4em]"><ProductMark p={a.by} size="1.35em" />{k >= a.at ? <Chip tone={a.d[1]}>{a.d[0]}</Chip> : <Chip tone="mute">Scoring…</Chip>}</span>
                  </div>
                ))}
              </div>
              <div className="mt-[1em] grid grid-cols-3 gap-[.8em] s3">
                {[['Allowed today', '1,284', '#27b8f2', [4, 6, 5, 7, 6, 8, 9, 8, 10, 11]], ['Held for a person', '6', '#f6b955', [1, 0, 1, 2, 1, 1, 0, 1, 2, 1]], ['Blocked', '23', '#ff6b5d', [1, 2, 1, 3, 2, 2, 4, 3, 2, 3]]].map(([l, v, c, d]) => (
                  <div key={l} className="vz-panel" style={{ padding: '.8em .9em' }}>
                    <span className="vz-m block">{l}</span>
                    <span className="mt-[.2em] block text-[1.5em] font-semibold tracking-[-0.03em] num">{v}</span>
                    <span className="mt-[.4em] block h-[1.6em]"><Spark data={d} color={c} /></span>
                  </div>
                ))}
              </div>
            </Win>

            {/* the agent decision leaves the frame on the left */}
            <Pop z={110} delay={500} className="absolute" style={{ left: '0%', top: '66%', width: '40%' }} glow="rgb(255 107 93 / .5)">
              <div className={cx('vz-pop s4')} style={{ padding: '1em 1.1em', '--glow': 'rgb(255 107 93 / .55)' }}>
                <div className="flex items-center gap-[.5em]"><App k="copilotstudio" /><span className="vz-t">invoice-agent</span><span className="ml-auto inline-flex items-center gap-[.35em] vz-m"><ProductMark p="zenstra" size="1.4em" />Zenstra AI</span></div>
                <div className="mt-[.8em] flex items-center gap-[.45em] vz-mono" style={{ color: 'var(--vz-red)' }}><Logo k="salesforce" size="1.2em" />salesforce.export → ext-mail.io</div>
                <div className="mt-[.8em] flex items-center justify-between rounded-[.6em] px-[.8em] py-[.55em]" style={{ background: 'rgb(255 107 93 / .14)', border: '1px solid rgb(255 107 93 / .35)' }}>
                  <span className="font-semibold" style={{ color: 'var(--vz-red)' }}>Blocked before it ran</span><span className="vz-mono" style={{ color: 'var(--vz-red)' }}>4 ms</span>
                </div>
              </div>
            </Pop>

            {/* the risk score rises out of the top right */}
            <Pop z={80} delay={700} className="absolute" style={{ right: '0%', top: '0%', width: '29%' }}>
              <div className="vz-pop s4" style={{ padding: '.9em 1em', '--glow': 'rgb(246 185 85 / .45)' }}>
                <div className="flex items-center gap-[.6em]">
                  <Ring v={k >= 4 ? 94 : 22} color={k >= 4 ? '#f6b955' : '#27b8f2'} />
                  <span className="min-w-0"><span className="block vz-t truncate">Priya Nair</span><span className="block vz-m">Risk {k >= 4 ? 'high' : 'normal'}</span></span>
                </div>
                <ul className="mt-[.7em] space-y-[.3em] vz-m">
                  <li>· New device, first seen</li>
                  <li>· Lagos, 2 h after Mumbai</li>
                </ul>
                <div className="mt-[.6em] inline-flex items-center gap-[.35em] vz-m"><ProductMark p="adapid" size="1.4em" />adapID AI</div>
              </div>
            </Pop>

            {/* the revoked key slides out at the bottom */}
            <Pop z={60} delay={900} className="absolute" style={{ right: '0%', bottom: '1%', width: '44%' }}>
              <div className="vz-pop s5 flex items-center gap-[.7em]" style={{ padding: '.75em .9em', '--glow': 'rgb(255 107 93 / .4)' }}>
                <App k="iam" />
                <span className="min-w-0"><span className="block vz-t">Key revoked</span><span className="block truncate vz-mono">AKIA••7Q2F · deploy-bot</span></span>
                <Chip tone="crit" className="ml-auto">0 s</Chip>
              </div>
            </Pop>
          </div>
        )}
      </Viz>
    </Stage3D>
  );
}

export function Ring({ v, color = '#27b8f2', size = '3.4em', label = true, k: fk }) {
  const r = 15.9, c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90"><circle cx="18" cy="18" r={r} fill="none" stroke="rgb(255 255 255 / .1)" strokeWidth="3" /><circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(.16,1,.3,1), stroke .4s' }} /></svg>
      {label && <span className="relative text-[1.05em] font-bold num" style={{ color }}>{v}</span>}
    </span>
  );
}
