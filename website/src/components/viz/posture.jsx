import Stage3D, { Pop } from '../Stage3D.jsx';
import { Viz, Win, Chip, Gl, Logo, App, cx } from './kit.jsx';
import ProductMark from '../ProductMark.jsx';
import { Ring } from './home.jsx';

/* ---------------- Home hero: Continuous AI Security Posture Management ----------------
   One console, the way a security team reads it in the morning: how many
   identities exist (people, machine identities, AI agents), the posture score,
   and the findings ranked by severity, each closed by the product built for it.
   The scan finds a shadow agent; it lifts out of the frame. The closed finding
   becomes an evidence record. Illustrative data. */

const COUNTS = [
  { g: 'user', l: 'People', v: '3,412' },
  { g: 'key', l: 'Machines', v: '12,708' },
  { g: 'agent', l: 'AI agents', v: '64', hot: true },
];

/* severity, finding, where, product, the step at which it is closed */
const FINDINGS = [
  { sev: ['Critical', 'crit'], f: 'Shadow AI agent with CRM access', at: 'lead-enricher · Zapier', app: 'zapier', by: 'zenstra', fix: 'Owner assigned', closeAt: 5 },
  { sev: ['High', 'warn'], f: 'MCP server changed its tool definitions', at: 'kb-sync · v2.4', app: 'mcp', by: 'zenstra', fix: 'Pinned', closeAt: 4 },
  { sev: ['High', 'warn'], f: 'Admin key unused for 94 days', at: 'AKIA••7Q2F · AWS IAM', app: 'iam', by: 'adapid', fix: 'Revoked', closeAt: 4 },
  { sev: ['Medium', 'info'], f: 'Service account path to Domain Admins', at: 'svc-backup · corp.local', app: 'ad', by: 'adapid', fix: 'Path closed', closeAt: 5 },
];

export function PostureConsole({ k: fk, tilt = [6, -14], range } = {}) {
  return (
    <Stage3D tilt={tilt} range={range} className="relative">
      <Viz k={fk} steps={[500, 600, 600, 700, 900, 1100]} hold={4600} label="Illustration: the Deep Algorithms AI security posture console. It counts 3,412 people, 12,708 machine identities and 64 AI agents, ranks four findings by severity, discovers a shadow AI agent with CRM access, closes each finding and writes an evidence record mapped to DPDPA, RBI and ISO/IEC 42001.">
        {(k) => (
          <div className="relative" style={{ padding: '8% 3% 11% 6%' }}>
            <Win title="AI security posture · all environments" right={<Chip tone={k >= 5 ? 'ok' : 'info'}>{k >= 5 ? 'Scan complete' : 'Scanning'}</Chip>} glow="rgb(0 150 240 / .55)">
              {/* inventory + score */}
              <div className="grid items-stretch gap-[.7em]" style={{ gridTemplateColumns: '1.05fr 1fr 1fr 1fr' }}>
                <div className="vz-panel s1 flex items-center gap-[.7em]" style={{ padding: '.75em .85em' }}>
                  <Ring v={k >= 5 ? 86 : k >= 3 ? 71 : 58} color={k >= 5 ? '#3ccf8e' : k >= 3 ? '#f6b955' : '#ff6b5d'} />
                  <span className="min-w-0"><span className="block vz-t">Posture</span><span className="block vz-m">{k >= 5 ? '+28 this week' : 'Needs action'}</span></span>
                </div>
                {COUNTS.map((c) => (
                  <div key={c.l} className="vz-panel s1" style={{ padding: '.75em .85em' }}>
                    <span className="flex items-center gap-[.4em] vz-m"><span className="vz-ic" style={{ width: '1.5em', height: '1.5em', color: c.hot ? '#93a2ff' : '#7cc8f5' }}><Gl g={c.g} /></span><span className="truncate">{c.l}</span></span>
                    <span className="mt-[.3em] block text-[1.45em] font-semibold tracking-[-0.03em] num">{c.v}</span>
                  </div>
                ))}
              </div>

              {/* findings, ranked */}
              <div className="vz-rows mt-[.9em]">
                <div className="hd" style={{ gridTemplateColumns: '.72fr 2fr .95fr' }}><span>Severity</span><span>Finding</span><span>Status</span></div>
                {FINDINGS.map((x, i) => {
                  const closed = k >= x.closeAt;
                  return (
                    <div key={x.f} className={cx(i < 2 ? 's2' : 's3', i === 0 && k >= 3 && !closed && 'hot')} style={{ gridTemplateColumns: '.72fr 2fr .95fr' }}>
                      <span><Chip tone={x.sev[1]}>{x.sev[0]}</Chip></span>
                      <span className="flex min-w-0 items-center gap-[.6em]">
                        <App k={x.app} />
                        <span className="min-w-0"><span className="block truncate vz-t" style={{ fontWeight: 480 }}>{x.f}</span><span className="block truncate vz-m">{x.at}</span></span>
                      </span>
                      <span className="flex items-center gap-[.4em]"><ProductMark p={x.by} size="1.3em" />{closed ? <Chip tone="ok">{x.fix}</Chip> : <Chip tone="mute">Open</Chip>}</span>
                    </div>
                  );
                })}
              </div>
            </Win>

            {/* the scan finds a shadow agent: it lifts out of the frame, top right */}
            <Pop z={100} delay={500} className="absolute" style={{ right: '0%', top: '0%', width: '43%' }}>
              <div className="vz-pop s3" style={{ padding: '.9em 1em', '--glow': 'rgb(147 162 255 / .55)' }}>
                <div className="flex items-center gap-[.5em]">
                  <span className="vz-ic" style={{ color: '#93a2ff' }}><Gl g="agent" /></span>
                  <span className="min-w-0"><span className="block vz-t">Shadow agent discovered</span><span className="block truncate vz-m">Built by an employee · no review</span></span>
                </div>
                <div className="mt-[.7em] flex items-center gap-[.45em] vz-mono" style={{ color: '#b9c3ff' }}><Logo k="zapier" size="1.15em" />lead-enricher → <Logo k="salesforce" size="1.15em" />read:contacts</div>
                <div className="mt-[.6em] inline-flex items-center gap-[.35em] vz-m"><ProductMark p="zenstra" size="1.35em" />Zenstra AI · agent discovery</div>
              </div>
            </Pop>

            {/* the closed finding becomes evidence, bottom left */}
            <Pop z={70} delay={800} className="absolute" style={{ left: '0%', bottom: '0%', width: '48%' }}>
              <div className="vz-pop s5 flex items-center gap-[.7em]" style={{ padding: '.75em .9em', '--glow': 'rgb(60 207 142 / .4)' }}>
                <span className="vz-ic" style={{ color: '#3ccf8e' }}><Gl g="doc" /></span>
                <span className="min-w-0"><span className="block vz-t">Evidence record #48231</span><span className="block truncate vz-m">DPDPA · RBI · ISO 42001</span></span>
                <Chip tone="ok" className="ml-auto">Signed</Chip>
              </div>
            </Pop>
          </div>
        )}
      </Viz>
    </Stage3D>
  );
}
