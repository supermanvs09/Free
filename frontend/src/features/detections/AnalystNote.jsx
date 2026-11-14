import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { actions, personName } from '../../data/store';
import { IDENTITY_TYPES, PROVIDERS } from '../../data/world';
import { Button } from '../../ui/Button';
import { Time } from '../../components/bits';

/*
 * A short triage note: what probably happened and what to do first. Written
 * by the assistant where the page can reach it, saved on the detection so the
 * whole team reads the same note.
 */
export function AnalystNote({ detection: d, identity: i }) {
  const [sample, setSample] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    Promise.resolve(window.claude?.use?.('sample'))
      .catch(() => null)
      .then((s) => live && setSample(s || null));
    return () => {
      live = false;
    };
  }, []);

  const write = async () => {
    if (!sample) return;
    setBusy(true);
    setError(null);
    setDraft('');
    const prompt = `You are a cloud security analyst triaging a non-human identity detection. Write a triage note of at most 90 words in three short labelled lines: "Likely cause:", "Blast radius:", "Do first:". Plain text, no markdown, no preamble.

Detection: ${d.title}
Severity: ${d.severity}; MITRE: ${d.tactic}
Observed: ${d.observed}
Baseline: ${d.baseline}
Identity: ${i?.name} (${IDENTITY_TYPES[i?.type]?.label}, ${PROVIDERS[i?.provider]?.name}, ${i?.environment})
Permissions: ${i?.permissions.scopes.join(', ')}; uses ${i?.permissions.used} of ${i?.permissions.granted}
Reaches: ${i?.resources.join(', ')}
Owner: ${personName(i?.owner)}`;
    try {
      const res = await sample(prompt, { onText: ({ text }) => setDraft(text), modelTier: 'quick', cache: false });
      const text = (res?.text || '').trim();
      if (text) await actions.updateDetection(d.id, { aiNote: { text, at: new Date().toISOString(), by: 'assistant' } });
      setDraft('');
    } catch (e) {
      setError(e?.code === 'rate_limited' ? 'The assistant is busy. Try again in a minute.' : e?.code === 'not_granted' ? null : 'The assistant could not write a note just now.');
      if (e?.code === 'not_granted') setSample(null);
    } finally {
      setBusy(false);
    }
  };

  const note = draft || d.aiNote?.text;
  if (!note && !sample) return null;

  return (
    <section className="rounded-[12px] border border-brand/25 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--t-accent)_8%,transparent),transparent_60%)] p-3.5">
      <div className="flex items-center gap-2">
        <Sparkles aria-hidden="true" className="size-4 text-brand" />
        <p className="text-[12.5px] font-semibold text-ink">Triage note</p>
        {d.aiNote && !draft && <span className="text-[11.5px] text-ink-3">· <Time at={d.aiNote.at} /></span>}
        {sample && (
          <Button size="sm" variant="ghost" className="ml-auto" loading={busy} onClick={write}>
            {d.aiNote ? 'Rewrite' : 'Write triage note'}
          </Button>
        )}
      </div>
      {note ? <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2">{note}</p> : <p className="mt-1.5 text-[12.5px] text-ink-3">Summarise the likely cause, the blast radius and the first step, from this identity's baseline and access.</p>}
      {error && <p className="mt-2 text-[12px] text-critical">{error}</p>}
    </section>
  );
}
