import { Fit } from './Dash.jsx';
import { Reveal, SectionHead } from './ui.jsx';

/* Zenstra's architecture: the people who own agents and the business that
   runs them on the left and top; the agents in the middle; every tool and
   API they reach on the right. Zenstra's controls sit on the paths between,
   glowing: identity and approval on the way in, the gateway, the credential
   vault and scoped token exchange on the way out. Drawn at 1200 x 720 and
   scaled as one picture. */

const G = {
  people: 'M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c0-3.3 2.9-5.5 6.5-5.5S15 16.7 15 20M16 4.5a3.3 3.3 0 0 1 0 6.3M18 14.8c2.2.6 4 2.4 4 5.2',
  owner: 'M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 21c0-3.6 3.1-6 7-6 1.3 0 2.5.3 3.5.8M16 18l2 2 4-4',
  idp: 'M4 6h16v12H4zM8 10h3M8 14h6M16 10h.01',
  agent: 'M12 3v3M7 8h10a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3zM9.5 13h.01M14.5 13h.01M2 13v2M22 13v2',
  finger: 'M12 11v3M8.5 7.5A5 5 0 0 1 17 11v2M7 11v2a8 8 0 0 0 1.2 4.2M15.8 15.5A12 12 0 0 1 15 19M12 3a8 8 0 0 1 8 8v1M4 13v-2a8 8 0 0 1 3-6.2',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v7a7 7 0 0 1-7 7 6 6 0 0 1-5-2.7L3 14.5a1.5 1.5 0 0 1 2.4-1.8L8 15',
  vault: 'M4 5h16v14H4zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 9V7M12 17v-2M4 19v2M20 19v2',
  swap: 'M4 8h13l-3-3M20 16H7l3 3',
  server: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01',
};
const Ic = ({ n, s = 22 }) => <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={G[n]} /></svg>;

const Box = ({ x, y, w, h = 76, round, stack, children, className = '' }) => (
  <div className={`za-box ${round ? 'round' : ''} ${stack ? 'stack' : ''} ${className}`} style={{ left: x, top: y, width: w, height: h }}>{children}</div>
);
const Ctl = ({ x, y, w, n, t }) => (
  <div className="za-ctl" style={{ left: x, top: y, width: w }}><span className="za-ctl-i"><Ic n={n} s={18} /></span>{t}</div>
);

export function ZenArchitectureDiagram() {
  return (
    <Fit w={1200} className="za-fit">
      <div className="za">
        <svg className="za-lines" viewBox="0 0 1200 740" aria-hidden="true">
          {/* people and owners into the organisation */}
          <path d="M330 92 H380 a12 12 0 0 1 12 12 V214 a12 12 0 0 1 -12 12 H330" />
          <path d="M392 160 H486" /><path d="M478 154 l8 6 -8 6" />
          {/* identity provider into the organisation */}
          <path d="M930 160 H806" /><path d="M814 154 l-8 6 8 6" />
          {/* organisation down to the agents */}
          <path d="M650 240 V340 a14 14 0 0 1 -14 14 H520 a14 14 0 0 0 -14 14 V454" />
          {/* people down to approval */}
          <path d="M180 260 V330" />
          {/* identity provider down to own APIs */}
          <path d="M1040 210 V410" />
          {/* control path: approval and identity into the agents */}
          <path className="hot" d="M180 388 V470 a14 14 0 0 0 14 14 H360" />
          <path className="hot" d="M236 634 V510 a14 14 0 0 1 14 -14 H360" />
          {/* agents out, through the gateway, to the tools */}
          <path d="M700 490 H790 a12 12 0 0 0 12 -12 V456 a12 12 0 0 1 12 -12 H880" /><path d="M872 438 l8 6 -8 6" />
          <path d="M790 490 a12 12 0 0 1 12 12 V544 a12 12 0 0 0 12 12 H880" /><path d="M872 550 l8 6 -8 6" />
          <path className="hot" d="M690 490 V634" />
          <path className="hot" d="M850 556 V634" />
          <path className="hot" d="M860 306 V444" />
          <circle className="dot" cx="360" cy="490" r="7" /><circle className="dot" cx="690" cy="490" r="6" /><circle className="dot" cx="860" cy="444" r="6" /><circle className="dot" cx="850" cy="556" r="6" />
        </svg>
        <div className="za-glow" style={{ left: 120, top: 300, width: 360, height: 360 }} />
        <div className="za-glow" style={{ left: 560, top: 440, width: 420, height: 300 }} />
        <div className="za-glow" style={{ left: 700, top: 200, width: 380, height: 220 }} />

        <Box x={60} y={54} w={270} round><Ic n="people" />Employees</Box>
        <Box x={60} y={188} w={270} round><Ic n="owner" />Agent owners</Box>
        <Box x={490} y={96} w={316} h={144} stack><span className="za-c">Your business<br />units and teams</span></Box>
        <Box x={930} y={110} w={220} h={100}><span className="za-c">Identity provider<em>Entra ID · Okta</em></span></Box>
        <Box x={360} y={454} w={340} h={72} round className="hub"><img src="/brand/products/zenstra.webp" alt="" width="26" height="26" />AI agents</Box>
        <Box x={880} y={410} w={290} h={68}><Ic n="server" s={20} />Your MCP servers, APIs</Box>
        <Box x={880} y={522} w={290} h={68}><Ic n="server" s={20} />Third-party MCP, APIs</Box>

        <Ctl x={60} y={330} w={260} n="hand" t="Human approval" />
        <Ctl x={110} y={634} w={250} n="finger" t="Agent identity" />
        <Ctl x={560} y={634} w={250} n="agent" t="Zenstra gateway" />
        <Ctl x={850} y={634} w={240} n="vault" t="Credential vault" />
        <Ctl x={720} y={250} w={290} n="swap" t="Scoped token exchange" />
      </div>
    </Fit>
  );
}

export default function ZenArchitecture() {
  return (
    <section className="sec" aria-labelledby="arch-h">
      <div className="wrap">
        <SectionHead id="arch-h" acc="var(--color-zen)" eyebrow="Architecture" title="Zenstra sits on every path an agent takes." lead="Identity and human approval on the way in. The gateway, the credential vault and scoped tokens on the way out, to every tool and API." />
        <Reveal className="mt-14"><ZenArchitectureDiagram /></Reveal>
      </div>
    </section>
  );
}
