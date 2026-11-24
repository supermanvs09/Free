import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { PRODUCTS } from '../data/products.js';
import { ZCAPS } from '../data/zenstra.js';
import { SOLUTIONS } from '../data/site.js';
import { POSTS } from '../data/posts.js';
import { LEGAL } from '../data/legal.js';
import { Icon, cx } from './ui.jsx';

/* Two overlays, loaded only when asked for:
   - search: Ctrl/⌘ K, "/" or the header button. Every page, product and report.
   - terminal: the ` key. A small, clearly fictional shell for the curious. */

/* ---------- shared: lock the page, trap focus, give it back on close ---------- */
function useOverlay(onClose) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const back = document.activeElement;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    const esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); close.current(); } };
    window.addEventListener('keydown', esc);
    return () => { html.style.overflow = prev; window.removeEventListener('keydown', esc); back?.focus?.({ preventScroll: true }); };
  }, []);
}

/* ---------- search ---------- */
const INDEX = [
  ...Object.values(PRODUCTS).map((p) => ({ group: 'Products', title: p.name, sub: p.line === p.name ? p.description : `${p.line} · ${p.description}`, path: p.path })),
  ...Object.values(ZCAPS).map((c) => ({ group: 'Zenstra AI capabilities', title: c.name, sub: c.short, path: c.path })),
  ...SOLUTIONS.map((s) => ({ group: 'Solutions', title: s.name, sub: s.desc, path: `/solutions/${s.slug}` })),
  ...POSTS.map((p) => ({ group: 'Blogs', title: p.title, sub: `${p.category} · ${p.read} min read`, path: `/blogs/${p.slug}`, more: p.excerpt })),
  { group: 'Company', title: 'Why Deep Algorithms', sub: 'The company, the team and how the products work', path: '/why-deep-algorithms' },
  { group: 'Company', title: 'All products', sub: 'Filter by what you need to protect', path: '/products' },
  { group: 'Company', title: 'All blogs', sub: 'Reports, field notes and analysis', path: '/blogs' },
  ...[
    ['Leadership', 'The team and our advisors', '/why-deep-algorithms#leadership'],
    ['Recognition', 'Awards, programmes and certifications', '/why-deep-algorithms#recognition'],
    ['Careers', 'Work on hard security problems', '/why-deep-algorithms#careers'],
    ['Contact', 'Offices, phone and email', '/contact'],
  ].map(([title, sub, path]) => ({ group: 'Company', title, sub, path })),
  { group: 'Company', title: 'Book a demo', sub: '30 minutes with an engineer, on your environment', path: '/request-demo' },
  ...Object.entries(LEGAL).map(([k, l]) => ({ group: 'Legal', title: l.title, sub: '', path: `/${k}` })),
];
const SUGGESTED = ['/agentic-ai/agentic-identity', '/adapid-ai', '/adapid-ai/nhi-security', '/dpdpa-compliance', '/request-demo', `/blogs/${POSTS[0].slug}`];
const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ');

function search(q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return SUGGESTED.map((p) => ({ ...INDEX.find((i) => i.path === p), group: 'Suggested' }));
  return INDEX.map((it) => {
    const t = norm(it.title), all = `${t} ${norm(it.sub)} ${norm(it.more || '')} ${norm(it.group)}`;
    if (!words.every((w) => all.includes(w))) return null;
    const score = (t.startsWith(words[0]) ? 4 : 0) + words.filter((w) => t.includes(w)).length * 2 + (it.group === 'Products' ? 1 : 0);
    return { ...it, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 12);
}

function Search({ onClose }) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const input = useRef(null);
  const list = useRef(null);
  const go = useNavigate();
  const hits = useMemo(() => search(q), [q]);
  useOverlay(onClose);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { setAt(0); }, [q]);
  useEffect(() => { list.current?.querySelector(`[data-i="${at}"]`)?.scrollIntoView({ block: 'nearest' }); }, [at]);
  const open = (h) => { if (!h) return; onClose(); go(h.path); };
  const key = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt((i) => Math.min(hits.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); open(hits[at]); }
    else if (e.key === 'Tab') e.preventDefault();
  };
  let last = '';
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/55 px-4 pt-[10vh] fadein" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Search the site" className="tone-l w-full max-w-[640px] overflow-hidden rounded-[18px] border border-line-2 bg-bg-1 text-ink shadow-[0_40px_120px_-30px_rgba(0,0,0,.7)]">
        <div className="flex items-center gap-3 border-b border-line px-5">
          <Icon name="MagnifyingGlass" size={19} className="shrink-0 text-ink-3" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder="Search products, solutions and blogs"
            className="h-[60px] w-full bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-3" role="combobox" aria-expanded="true" aria-controls="cmd-list" aria-autocomplete="list"
            aria-activedescendant={hits[at] ? `cmd-${at}` : undefined} autoComplete="off" spellCheck="false" />
          <kbd className="hidden shrink-0 rounded-md border border-line-2 px-1.5 py-0.5 font-sans text-[12px] text-ink-3 sm:block">Esc</kbd>
        </div>
        <ul ref={list} id="cmd-list" role="listbox" aria-label="Results" className="max-h-[min(60vh,460px)] overflow-y-auto p-2">
          {hits.length === 0 && <li className="px-4 py-10 text-center text-[15px] text-ink-3">Nothing matches “{q}”. Try a product name, an attack or a regulation.</li>}
          {hits.map((h, i) => {
            const head = h.group !== last ? (last = h.group) : null;
            return (
              <li key={h.path + i} role="presentation">
                {head && <p className="px-3 pb-1.5 pt-3 text-[11.5px] font-semibold uppercase tracking-[.1em] text-ink-3">{head}</p>}
                <div id={`cmd-${i}`} data-i={i} role="option" aria-selected={i === at} onMouseMove={() => setAt(i)} onClick={() => open(h)}
                  className={cx('flex cursor-pointer items-center gap-3 rounded-[11px] px-3 py-2.5', i === at && 'bg-bg-2')}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{h.title}</span>
                    {h.sub && <span className="block truncate text-[13px] text-ink-3">{h.sub}</span>}
                  </span>
                  <Icon name="ArrowRight" size={15} className={cx('shrink-0 text-ink-3 transition-opacity', i === at ? 'opacity-100' : 'opacity-0')} />
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-4 border-t border-line px-5 py-2.5 text-[12.5px] text-ink-3">
          <span><kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> to move</span><span><kbd className="font-sans">↵</kbd> to open</span>
          <span className="ml-auto hidden sm:inline">Ctrl K or ⌘ K, anywhere</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- terminal ---------- */
const DIRS = {
  zenstra: '/agentic-ai/agentic-identity', adapid: '/adapid-ai', icms: '/dpdpa-compliance',
  nhi: '/adapid-ai/nhi-security', fraud: '/adapid-ai/fraud-prevention', ad: '/ad-security',
  blogs: '/blogs', research: '/blogs', company: '/why-deep-algorithms', platform: '/why-deep-algorithms', products: '/products', demo: '/request-demo', contact: '/contact', home: '/',
};
const HELP = [
  ['help', 'this list'], ['ls', 'what is here'], ['open <name>', 'go to a page, e.g. open zenstra'], ['whoami', 'who the site thinks you are'],
  ['cat mission', 'why we exist'], ['date', 'the time at headquarters'], ['history', 'what you typed'],
  ['clear', 'clear the screen'], ['exit', 'close the terminal'],
];
const hydTime = () => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date());

function run(raw, { go, history }) {
  const line = raw.trim();
  const [cmd = '', ...args] = line.split(/\s+/);
  const arg = args.join(' ');
  switch (cmd.toLowerCase()) {
    case '': return [];
    case 'help': case '?': return [...HELP.map(([c, d]) => ({ k: 'out', t: `  ${c.padEnd(14)}${d}` })), { k: 'dim', t: '  There may be one or two others.' }];
    case 'ls': case 'dir': return [{ k: 'out', t: Object.keys(DIRS).map((d) => `${d}/`).join('  ') }];
    case 'open': case 'cd': case 'go': {
      const d = arg.toLowerCase().replace(/[/~.]/g, '');
      if (!d) return [{ k: 'out', t: 'open what? Try: open zenstra' }];
      if (!DIRS[d]) return [{ k: 'err', t: `no such page: ${arg}. Try ls.` }];
      go(DIRS[d]); return [{ k: 'ok', t: `opening ${d}…` }];
    }
    case 'whoami': return [{ k: 'out', t: 'guest · not signed in · nothing about you is stored' }, { k: 'out', t: 'risk score 12/100 · normal. Carry on.' }];
    case 'cat':
      if (/^(mission|readme)/i.test(arg)) return [{ k: 'out', t: 'Identity security for the AI era.' }, { k: 'out', t: 'People, machine identities and AI agents hold the keys now. We learn how each one behaves, and stop the one that is misused before it becomes a breach.' }];
      return [{ k: 'err', t: arg ? `cat: ${arg}: no such file` : 'cat what? Try: cat mission' }];
    case 'date': case 'time': return [{ k: 'out', t: `Hyderabad · ${hydTime()} IST` }];
    case 'history': return history.map((h, i) => ({ k: 'out', t: `  ${String(i + 1).padStart(3)}  ${h}` }));
    case 'echo': return [{ k: 'out', t: arg }];
    case 'pwd': return [{ k: 'out', t: `/home/guest${location.pathname === '/' ? '' : location.pathname}` }];
    case 'sudo': case 'su': return [{ k: 'err', t: 'Permission denied. Checked against your task: not part of it.' }, { k: 'dim', t: 'Blocked · 4 ms' }];
    case 'rm': return [{ k: 'err', t: 'Blocked before it ran.' }, { k: 'dim', t: 'Deleting things is not part of your task either.' }];
    case 'nmap': case 'hack': case 'exploit': case 'scan':
      return [{ k: 'out', t: 'We only scan what we are allowed to, with the owner’s permission.' }, { k: 'dim', t: 'See how it works properly: open adapid' }];
    case 'decrypt': return [{ k: 'ok', t: 'Access granted. Well, to this message.' }, { k: 'out', t: 'You read the console, decoded the note and found the terminal. Curiosity like that is exactly what security needs. Thank you for looking under the hood.' }];
    case 'coffee': case 'chai': return [{ k: 'out', t: 'Brewing… Hyderabad runs on filter coffee and Irani chai. Both are allowed by policy.' }];
    case 'ping': return [{ k: 'out', t: 'pong · 4 ms' }];
    case 'exit': case 'quit': case 'q': return null;
    default: return [{ k: 'err', t: `command not found: ${cmd}. Type help.` }];
  }
}
const NAMES = ['help', 'ls', 'open', 'whoami', 'cat', 'date', 'history', 'clear', 'exit', 'echo', 'pwd', ...Object.keys(DIRS).map((d) => `open ${d}`), 'cat mission'];
const TONE = { in: 'text-[#f2f3f5]', out: 'text-[#c9cdd3]', dim: 'text-[#7d838d]', err: 'text-[#ff8a7e]', ok: 'text-[#6be3a4]' };

function Terminal({ onClose }) {
  const go = useNavigate();
  const [lines, setLines] = useState(() => [
    { k: 'dim', t: `Last login: ${hydTime()} on ttys001` },
    { k: 'out', t: 'Deep Algorithms terminal. You found it.' },
    { k: 'dim', t: 'This is a toy shell on our website. Type help to begin, exit to leave.' },
  ]);
  const [v, setV] = useState('');
  const [hist, setHist] = useState([]);
  const [hi, setHi] = useState(-1);
  const input = useRef(null);
  const end = useRef(null);
  useOverlay(onClose);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [lines]);
  const submit = (e) => {
    e.preventDefault();
    const nextHist = v.trim() ? [...hist, v.trim()] : hist;
    const prompt = { k: 'in', t: `guest@deepalgorithms:~$ ${v}` };
    if (/^\s*clear\s*$/i.test(v)) { setLines([]); setHist(nextHist); setV(''); setHi(-1); return; }
    const out = run(v, { go: (p) => { setTimeout(() => { onClose(); go(p); }, 350); }, history: nextHist });
    if (out === null) { onClose(); return; }
    setLines((l) => [...l, prompt, ...out].slice(-200));
    setHist(nextHist); setV(''); setHi(-1);
  };
  const key = (e) => {
    if (e.key === 'ArrowUp' && hist.length) { e.preventDefault(); const i = hi < 0 ? hist.length - 1 : Math.max(0, hi - 1); setHi(i); setV(hist[i]); }
    else if (e.key === 'ArrowDown' && hi >= 0) { e.preventDefault(); const i = hi + 1; if (i >= hist.length) { setHi(-1); setV(''); } else { setHi(i); setV(hist[i]); } }
    else if (e.key === 'Tab') {
      // complete to the longest shared prefix; list the choices when it is ambiguous
      e.preventDefault();
      const m = v ? NAMES.filter((n) => n.startsWith(v.toLowerCase())) : [];
      if (m.length === 1) setV(`${m[0]} `);
      else if (m.length > 1) {
        let pre = m[0];
        for (const n of m) while (!n.startsWith(pre)) pre = pre.slice(0, -1);
        if (pre.length > v.length) setV(pre); else setLines((l) => [...l, { k: 'dim', t: m.join('  ') }]);
      }
    }
    else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); setLines([]); }
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/55 px-4 pt-[12vh] fadein" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Deep Algorithms terminal" className="w-full max-w-[720px] overflow-hidden rounded-[14px] border border-white/15 bg-[#0c0d10] shadow-[0_40px_120px_-30px_rgba(0,0,0,.85)]">
        <div className="flex h-10 items-center gap-2 border-b border-white/10 bg-white/[.03] px-4">
          <button type="button" onClick={onClose} aria-label="Close the terminal" className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span aria-hidden="true" className="h-3 w-3 rounded-full bg-[#febc2e]" /><span aria-hidden="true" className="h-3 w-3 rounded-full bg-[#28c840]" />
          <span className="mx-auto flex items-center gap-2 pr-12 text-[12.5px] text-[#9aa0a9]"><Icon name="TerminalWindow" size={14} />guest@deepalgorithms · Deep Algorithms terminal</span>
        </div>
        <div className="mono h-[min(56vh,420px)] overflow-y-auto px-5 py-4 text-[13.5px] leading-[1.65]" onMouseUp={() => { if (!getSelection()?.toString()) input.current?.focus(); }} aria-live="polite">
          {lines.map((l, i) => <p key={i} className={cx('whitespace-pre-wrap break-words', TONE[l.k])}>{l.t}</p>)}
          <form onSubmit={submit} className="flex items-center gap-2">
            <label htmlFor="term-in" className="shrink-0 text-[#6be3a4]">guest@deepalgorithms:~$</label>
            <input id="term-in" ref={input} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={key} autoComplete="off" autoCapitalize="off" spellCheck="false"
              className="mono min-w-0 flex-1 bg-transparent text-[#f2f3f5] caret-[#6be3a4] outline-none" aria-label="Command" />
          </form>
          <div ref={end} />
        </div>
      </div>
    </div>
  );
}

export default function Command({ mode, onClose }) {
  return mode === 'terminal' ? <Terminal onClose={onClose} /> : <Search onClose={onClose} />;
}
