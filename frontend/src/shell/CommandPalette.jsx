import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Search } from 'lucide-react';
import { useScrollLock } from '../lib/hooks';
import { ALL_NAV_ITEMS } from './navigation';
import { useView } from '../data/store';
import { IDENTITY_TYPES, PROVIDERS } from '../data/world';
import { IdentityLogo, AppLogo } from '../components/Logo';
import { SeverityGlyph } from '../components/bits';
import { cn } from '../ui/cn';

/** Jump anywhere: screens, identities, Jira issues, findings and detections. */
export function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const view = useView();
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  useScrollLock(open);

  useEffect(() => {
    if (open) {
      setTerm('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const q = term.trim().toLowerCase();
    const out = [];
    const nav = ALL_NAV_ITEMS.filter((i) => !q || i.label.toLowerCase().includes(q)).slice(0, q ? 4 : 8);
    nav.forEach((i) => out.push({ group: 'Go to', key: i.to, label: i.label, hint: i.group, icon: <i.icon aria-hidden="true" className="size-4 text-ink-3" />, to: i.to }));
    if (q.length >= 2) {
      view.identities
        .filter((i) => `${i.name} ${i.locator} ${PROVIDERS[i.provider].short} ${IDENTITY_TYPES[i.type].label}`.toLowerCase().includes(q))
        .slice(0, 6)
        .forEach((i) => out.push({ group: 'Identities', key: i.id, label: i.name, hint: `${IDENTITY_TYPES[i.type].label} · ${view.connById.get(i.connectionId)?.name}`, icon: <IdentityLogo type={i.type} size={22} />, to: `/identities/${i.id}` }));
      view.tickets
        .filter((t) => `${t.key} ${t.summary}`.toLowerCase().includes(q))
        .slice(0, 4)
        .forEach((t) => out.push({ group: 'Jira issues', key: t.key, label: `${t.key} ${t.summary}`, hint: t.status, icon: <AppLogo name="jira" size={22} />, to: `/tickets?open=${t.key}` }));
      view.detections
        .filter((d) => `${d.id} ${d.title}`.toLowerCase().includes(q))
        .slice(0, 3)
        .forEach((d) => out.push({ group: 'Detections', key: d.id, label: d.title, hint: d.id, icon: <SeverityGlyph severity={d.severity} className="text-critical" />, to: `/detections?open=${d.id}` }));
      view.findings
        .filter((f) => `${f.id} ${f.title} ${view.idById.get(f.identityId)?.name}`.toLowerCase().includes(q))
        .slice(0, 4)
        .forEach((f) => out.push({ group: 'Findings', key: f.id, label: `${f.title}`, hint: view.idById.get(f.identityId)?.name, icon: <SeverityGlyph severity={f.severity} className="text-high" />, to: `/findings?open=${f.id}` }));
    }
    return out;
  }, [term, view]);

  useEffect(() => setActive(0), [term]);
  if (!open) return null;

  const go = (r) => {
    onClose();
    navigate(r.to);
  };

  let lastGroup = null;
  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-start justify-center p-3 pt-[12vh]">
      <button type="button" aria-label="Close search" onClick={onClose} className="animate-fade absolute inset-0 bg-[var(--t-overlay)] backdrop-blur-[2px]" />
      <div role="dialog" aria-label="Search" className="animate-pop relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-[16px] border border-line bg-surface shadow-lg">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search aria-hidden="true" className="size-4.5 text-ink-3" />
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              if (e.key === 'Enter' && results[active]) go(results[active]);
            }}
            placeholder="Search identities, ARNs, Jira keys, findings…"
            className="h-13 min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-ink-3"
            aria-label="Search"
          />
          <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-3">Esc</kbd>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-8 text-center text-[13px] text-ink-3">Nothing matches “{term}”.</li>}
          {results.map((r, k) => {
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            return (
              <li key={`${r.group}-${r.key}`}>
                {header && <p className="px-2.5 pt-2 pb-1 text-[10.5px] font-semibold tracking-[0.12em] text-ink-3 uppercase">{header}</p>}
                <button type="button" onMouseEnter={() => setActive(k)} onClick={() => go(r)} className={cn('flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left', k === active && 'bg-surface-3')}>
                  <span className="grid size-6 shrink-0 place-items-center">{r.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{r.label}</span>
                    {r.hint && <span className="block truncate text-[11.5px] text-ink-3">{r.hint}</span>}
                  </span>
                  {k === active && <CornerDownLeft aria-hidden="true" className="size-4 text-ink-3" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
