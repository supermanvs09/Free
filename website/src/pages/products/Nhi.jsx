import { useGridPop } from '../../lib/nullmotion.jsx';
import { KeyLineage } from '../../components/viz/refs.jsx';
import { useRef } from 'react';
import { useInView, useReducedMotion } from '../../lib/motion.js';
import { Seo } from '../../lib/head.jsx';
import { PRODUCTS } from '../../data/products.js';
import { Icon, Reveal, SectionHead, cx } from '../../components/ui.jsx';
import { CtaBand, ResearchRow } from '../../components/blocks.jsx';
import { Hero, Stats, Faq, LINKS, ACC } from '../../components/ProductKit.jsx';
import { NhiMap } from '../../components/viz/nhimap.jsx';
import { NhiWorkbench } from '../../components/viz/workbench.jsx';
import { Logo } from '../../components/viz/kit.jsx';
import { STORIES } from '../../data/stories.js';

const p = PRODUCTS.nhi;
const A = ACC.adap;

const TRUST = `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::<adapid-account>:root" },
    "Action": "sts:AssumeRole",
    "Condition": { "StringEquals": { "sts:ExternalId": "<your-external-id>" } }
  }]
}`;

const GENOME = [
  ['lambda-kyc-sync', 'GetSecretValue from eu-west-1', '30 days', 'Needs review', 'warn', 'lambda'],
  ['ecs-notify-svc', 'New S3 bucket read, 2:14 am', 'Established', 'Malicious', 'crit', 'ecs'],
  ['glue-ledger-etl', 'Job ran 3x usual volume', 'Established', 'Legitimate', 'ok', 'glue'],
  ['sm-fraud-train', 'Called iam:PassRole', 'Learning', 'Needs review', 'warn', 'iam'],
  ['stepfn-payouts', 'Within baseline', 'Established', 'Healthy', 'ok', 'lambda'],
];
const SECRETS = [
  ['AKIA••••7Q2F', 'payments-api/config.yml', '2 days ago', 'Real secret', 'crit', 'github'],
  ['ghp_••••x91', 'infra/deploy.sh', 'Today', 'Real secret', 'crit', 'github'],
  ['AKIA••••EXAMPLE', 'docs/setup.md', '1 week ago', 'Known harmless', 'ok', 'github'],
  ['db_password', '3 places in one commit, CodeCommit', 'Yesterday', 'Repeated value', 'warn', 'aws'],
];
const TONE = { ok: 'c-ok', warn: 'c-warn', crit: 'c-crit' };

function Table({ cols, rows, caption }) {
  return (
    <div className="overflow-x-auto rounded-[20px] border border-line bg-bg-1" role="region" tabIndex={0} aria-label={caption}>
      <table className="w-full min-w-[640px] text-left text-[14.5px]">
        <caption className="sr-only">{caption}</caption>
        <thead><tr className="border-b border-line">{cols.map((c) => <th key={c} scope="col" className="px-5 py-4 text-[12px] font-semibold uppercase tracking-[.08em] text-ink-3">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r[0]} className="border-b border-line last:border-0">
            <td className="px-5 py-4 font-mono text-[13.5px] text-ink"><span className="flex items-center gap-3">{r[5] && <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-line bg-white text-[#12171f]"><Logo k={r[5]} size={18} /></span>}{r[0]}</span></td><td className="px-5 py-4 text-ink-2">{r[1]}</td><td className="px-5 py-4 text-ink-3">{r[2]}</td>
            <td className="px-5 py-4"><span className={cx('vz-chip', TONE[r[4]])} style={{ fontSize: 12.5 }}>{r[3]}</span></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/* A leaked key as an engineer would meet it: the file in the repository, the
   line with the key, and adapID's verdict beside it; the other findings of the
   same scan follow, sorted by risk. Values are illustrative. */
const CODE = [
  ['11', 'payments:'],
  ['12', '  region: ap-south-1'],
  ['13', '  bucket: payments-prod-settlements'],
  ['14', '  aws_access_key_id: AKIA••••••••7Q2F', true],
  ['15', '  aws_secret_access_key: ••••••••••••••••', true],
  ['16', '  timeout_ms: 3000'],
];
function LeakedKey() {
  const ref = useRef(null);
  const seen = useInView(ref, { threshold: 0.35, once: true });
  const reduce = useReducedMotion();
  const on = seen || reduce;
  return (
    <div ref={ref} className="grid gap-4">
      <div className="relative overflow-hidden rounded-[20px] border border-line bg-[#0d1117] text-[#c9d1d9] shadow-[0_30px_70px_-40px_rgba(0,0,0,.6)]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10 px-5 py-3.5 text-[13px]">
          <span className="text-white"><Logo k="github" size={18} /></span>
          <span className="font-mono text-[#e6edf3]">acme/payments-api</span><span className="text-[#7d8590]">/</span><span className="font-mono text-[#e6edf3]">config.yml</span>
          <span className="ml-auto font-mono text-[12px] text-[#7d8590]">commit 9f2c41e · 2 days ago</span>
        </div>
        <pre className="overflow-x-auto py-3 font-mono text-[13.5px] leading-[1.9]" aria-label="config.yml, lines 11 to 16; lines 14 and 15 hold an AWS access key and its secret">
          {CODE.map(([n, t, hot]) => (
            <span key={n} className={cx('block px-5 transition-colors duration-700', hot && on && 'bg-[#e5484d]/18')} style={{ transitionDelay: hot ? '500ms' : undefined }}>
              <span className="mr-5 inline-block w-6 select-none text-right text-[#8b949e]">{n}</span>{t}
            </span>
          ))}
        </pre>
        {/* the verdict, inline under the lines it is about */}
        <div className={cx('mx-4 mb-4 overflow-hidden rounded-[12px] border-l-[3px] border-[#e5484d] bg-white text-[#0e1116] transition-all duration-500', on ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0')} style={{ transitionDelay: '900ms' }}>
          <div className="flex flex-wrap items-start gap-x-6 gap-y-2 p-4">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[.08em] text-[#c4302b]"><span className="h-2 w-2 rounded-full bg-[#e5484d]" />adapID · Real secret, still active</span>
              <span className="mt-1.5 block text-[15px] font-semibold leading-snug">This key works, and reaches the bucket payments-prod-settlements.</span>
            </span>
            <span className="text-[13px] leading-relaxed text-[#5c6777]">Owner: payments team<br />Rotate it, then remove it from history</span>
          </div>
        </div>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-[16px] border border-line bg-bg-1" aria-label="Other findings from the same scan">
        {SECRETS.slice(1).map((r) => (
          <li key={r[0]} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 text-[14px]">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-line bg-white text-[#12171f]"><Logo k={r[5]} size={16} /></span>
            <span className="font-mono text-[13.5px] text-ink">{r[0]}</span>
            <span className="text-ink-3">{r[1]}</span>
            <span className={cx('vz-chip ml-auto', TONE[r[4]])} style={{ fontSize: 12.5 }}>{r[3]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Granted against used: each bar starts at what the identity is allowed, then
   shrinks to what CloudTrail shows it used; the rest is marked for removal. */
function GrantBars() {
  const ref = useRef(null);
  const seen = useInView(ref, { threshold: 0.4, once: true });
  const reduce = useReducedMotion();
  const done = seen || reduce;
  return (
    <div ref={ref} className="card p-6 md:p-9">
      {[['ecs-notify-svc', 214, 9, 'ecs'], ['lambda-kyc-sync', 88, 31, 'lambda'], ['glue-ledger-etl', 61, 44, 'glue']].map(([n, g, u, logo], i) => (
        <div key={n} className="border-b border-line py-5 first:pt-0 last:border-0 last:pb-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-3 font-mono text-[14px] text-ink"><span className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-line bg-white text-[#12171f]"><Logo k={logo} size={18} /></span>{n}</span>
            <span className="text-[14px] text-ink-3"><b className="text-ink num">{u}</b> used of <b className="text-ink num">{g}</b> granted · <b className="num" style={{ color: 'var(--color-crit)', opacity: done ? 1 : 0, transition: 'opacity .5s 1.2s' }}>{g - u} to remove</b></span>
          </div>
          <div className="relative mt-3 h-3 overflow-hidden rounded-full" style={{ background: 'repeating-linear-gradient(135deg, rgb(229 72 77 / .22) 0 6px, rgb(229 72 77 / .08) 6px 12px)' }}>
            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: done ? `${(u / g) * 100}%` : '100%', background: A, transition: `width 1.4s cubic-bezier(.65,0,.35,1) ${i * 150}ms` }} />
          </div>
        </div>
      ))}
      <p className="mt-6 text-[13.5px] text-ink-3">Illustrative identities. Unused permissions are listed for removal with the CloudTrail evidence behind each one.</p>
    </div>
  );
}

const FAQ = [
  { title: 'What access does adapID need?', body: 'One read-only IAM role per AWS account, assumed with an external ID. Nothing is installed on workloads and nothing is written to your accounts.' },
  { title: 'Which identities are covered?', body: 'IAM roles, users, service-linked roles and workload identities across accounts and regions, with their credentials and trust relationships.' },
  { title: 'How do you know what is used?', body: 'Granted permissions are compared with 90 days of CloudTrail activity, so unused access stands out for removal.' },
  { title: 'Where do you look for leaked secrets?', body: 'GitHub and AWS CodeCommit, with model-based triage so analysts see real exposures first, and full-history deep scans on demand.' },
];

export default function Nhi() {
  const genRef = useRef(null);
  useGridPop(genRef, 'tbody tr');
  return (
    <>
      <Seo title={p.seoTitle} description={p.description} path={p.path} crumbs={[{ name: 'adapID AI', path: '/adapid-ai' }, { name: 'NHI Security for AWS', path: p.path }]} />
      <Hero glance={[['Protects', 'IAM roles, keys and workload identities in AWS'], ['Stops', 'Unused permissions, open trust policies, leaked secrets'], ['Deploys', 'One read-only role per AWS account'], ['Shows', 'The least-privilege fix, checked against CloudTrail']]} acc="adap" crumbs={[{ name: 'adapID AI', path: '/adapid-ai' }, { name: 'NHI Security for AWS' }]} eyebrow="adapID AI · NHI Security for AWS"
        title={<>Every machine identity in your AWS accounts. <span style={{ color: 'var(--acc)' }}>Found, scored, watched.</span></>}
        lead="Machine identities far outnumber people, and most were created by a deploy, not by a decision. adapID finds each role, key and workload identity, shows what it can reach and what it actually uses, and catches the one that starts behaving differently."
        note="Agentless. One read-only role per account.">
        <NhiMap />
      </Hero>

      <section className="sec" aria-labelledby="on-h">
        <div className="wrap grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <Reveal>
            <p className="eyebrow" style={{ '--acc': A }}>Connect an account</p>
            <h2 id="on-h" className="t-h2 mt-6">From one read-only role to a full inventory, in minutes.</h2>
            <ol className="mt-10 space-y-7">
              {[['Create the role', 'Deploy one read-only IAM role with the trust policy on the right. No agents, no write access.'], ['Pass three checks', 'adapID verifies it can assume the role, read IAM and read CloudTrail before the first sync is queued.'], ['See every identity', 'Roles, users, keys and workload identities appear with owner, exposure and posture score, and every change since the last sync.']].map(([h, t], i) => (
                <li key={h} className="flex gap-5">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-on-acc" style={{ background: A }}>{i + 1}</span>
                  <span><span className="block text-[19px] font-semibold tracking-[-0.015em]">{h}</span><span className="mt-1 block text-[15.5px] leading-relaxed text-ink-2">{t}</span></span>
                </li>
              ))}
            </ol>
          </Reveal>
          <Reveal delay={120} className="self-center">
            <div className="tone-d overflow-hidden rounded-[20px] border border-line bg-[#080a0e]">
              <div className="flex items-center justify-between border-b border-line px-5 py-3"><span className="font-mono text-[13px] text-ink-2">adapid-readonly · trust policy</span><span className="vz-chip c-ok" style={{ fontSize: 12 }}>Read-only</span></div>
              <pre tabIndex={0} aria-label="config/notify.env, with the leaked key on line 14" className="overflow-x-auto p-5 font-mono text-[13px] leading-[1.75] text-[#bcd6f2]"><code>{TRUST}</code></pre>
            </div>
          </Reveal>
        </div>
      </section>

      {/* lineage: where one key came from and everything it reaches */}
      <section className="sec" aria-labelledby="lin-h">
        <div className="wrap">
          <div className="island tone-d px-4 py-14 md:px-10 md:py-20">
            <SectionHead id="lin-h" eyebrow="Lineage" title="Every key has a history. adapID reads all of it." lead="Who created it, where it is stored, what uses it and what it can reach, on one line. So you know what breaks before you rotate, and who to ask." />
            <Reveal up className="mx-auto mt-14 max-w-[1120px]"><KeyLineage /></Reveal>
  </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="wb-h">
        <div className="wrap grid items-center gap-12 lg:grid-cols-[.75fr_1.25fr] lg:gap-16">
          <SectionHead align="left" id="wb-h" acc={A} eyebrow="One view per identity" title="What it is, what it reaches, why it is risky, and the fix." lead="Every machine identity gets an owner, a risk level and a usage score. Open one to see its graph, the findings behind its risk and the remediation, applied with approval." />
          <Reveal delay={100}><NhiWorkbench /></Reveal>
        </div>
      </section>

      <section className="sec" aria-labelledby="gu-h">
        <div className="wrap">
          <SectionHead id="gu-h" acc={A} eyebrow="Posture and access" title="Granted is not the same as used." lead="Each identity is scored from 100 down by the checks it fails. The access graph shows who can assume what, and 90 days of CloudTrail show what is actually used." />
          <Reveal className="mx-auto mt-14 max-w-[900px]"><GrantBars /></Reveal>
        </div>
      </section>

      <section className="stage sec" aria-labelledby="gen-h">
        <div className="wrap grid gap-12 lg:grid-cols-[.75fr_1.25fr] lg:gap-16">
          <Reveal>
            <p className="eyebrow" style={{ '--acc': A }}>NHI Genome</p>
            <h2 id="gen-h" className="t-h2 mt-6">Every workload has a normal. We notice when it changes.</h2>
            <p className="t-lead mt-5">Each workload identity learns its normal calls, resources and schedule. Departures are graded, explained and sent for review.</p>
          </Reveal>
          <Reveal delay={100}><div ref={genRef}><Table caption="Workload identities and their departures from baseline" cols={['Identity', 'Departure from baseline', 'Baseline', 'Verdict']} rows={GENOME} /></div></Reveal>
        </div>
      </section>

      <section className="sec" aria-labelledby="sec-h">
        <div className="wrap grid gap-12 lg:grid-cols-[.75fr_1.25fr] lg:gap-16">
          <Reveal>
            <p className="eyebrow" style={{ '--acc': A }}>Exposed secrets</p>
            <h2 id="sec-h" className="t-h2 mt-6">Keys leaked into code, found and ranked by real risk.</h2>
            <p className="t-lead mt-5">Secrets found in GitHub and AWS CodeCommit are sorted by models, so analysts see real exposures before false alarms.</p>
            <p className="mt-6 flex items-center gap-2 text-[15px] text-ink-2"><Icon name="Code" size={18} className="text-adap" />Full-history deep scans on demand</p>
          </Reveal>
          <Reveal delay={100}><LeakedKey /></Reveal>
        </div>
      </section>

      <Stats acc="adap" items={p.stats} {...STORIES.nhi} />
      <Faq items={FAQ} />
      <ResearchRow slugs={p.research} />
      <CtaBand related={[LINKS.cirm, LINKS.zenstra, LINKS.ad]} accent="adap" title={p.cta.title} body={p.cta.body} />
    </>
  );
}
