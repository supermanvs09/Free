import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AtSign, Mail, Send } from 'lucide-react';
import { actions, personName, recordLabel, useView } from '../data/store';
import { ORG } from '../data/world';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { Modal } from '../ui/Overlay';
import { useToast } from '../ui/Toast';
import { cn } from '../ui/cn';
import { AppLogo } from './Logo';
import { Avatar, JiraPriority, JiraStatus, PersonName, PersonPicker, Time } from './bits';

/** Discussion on any record, live for everyone who has it open. */
export function CommentThread({ target, placeholder = 'Add a comment. Type @ to mention a teammate.' }) {
  const key = `${target.kind}:${target.id}`;
  const comments = useView((v) => v.commentsByTarget.get(key)) || [];
  const people = useView((v) => v.people);
  const me = useView((v) => v.me);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const mentionQuery = /@([\w\s]{0,20})$/.exec(body)?.[1];
  const suggestions = mentionQuery !== undefined ? people.filter((p) => p.name.toLowerCase().startsWith(mentionQuery.toLowerCase().trimStart())).slice(0, 5) : [];

  const submit = async (event) => {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    await actions.addComment(target, body.trim());
    setBody('');
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      {comments.length === 0 && <p className="text-[12.5px] text-ink-3">No comments yet. Notes here are visible to everyone on the team.</p>}
      <ol className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="animate-fade flex gap-2.5">
            <Avatar refId={c.author} size={26} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                <PersonName refId={c.author} className="font-semibold text-ink" />
                <Time at={c.at} className="text-[11.5px] text-ink-3" />
              </p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink-2">{renderMentions(c.body, people)}</p>
            </div>
          </li>
        ))}
      </ol>
      <form onSubmit={submit} className="relative flex items-start gap-2.5">
        <Avatar refId={me?.ref} size={26} />
        <div className="min-w-0 flex-1">
          <Textarea
            id={`comment-${key}`}
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
            }}
          />
          {suggestions.length > 0 && (
            <ul className="animate-pop absolute z-20 mt-1 w-64 rounded-[10px] border border-line bg-surface p-1 shadow-lg">
              {suggestions.map((p) => (
                <li key={p.ref}>
                  <button type="button" onClick={() => setBody(body.replace(/@([\w\s]{0,20})$/, `@${p.name} `))} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-surface-2">
                    <Avatar person={p} size={18} /> {p.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-[11px] text-ink-3"><AtSign aria-hidden="true" className="size-3" />Mentions email the person</span>
            <Button type="submit" size="sm" variant="primary" icon={Send} loading={busy} disabled={!body.trim()}>
              Comment
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function renderMentions(text, people) {
  const names = people.map((p) => p.name).sort((a, b) => b.length - a.length);
  if (!names.length) return text;
  const re = new RegExp(`@(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  const parts = text.split(re);
  return parts.map((part, k) => (k % 2 === 1 ? <span key={k} className="rounded bg-info-soft px-1 font-medium text-brand">@{part}</span> : part));
}

/** The Jira issue a record is tracked in, or a button to raise one. */
export function TicketLink({ ticketKey, compact = false }) {
  const t = useView((v) => (ticketKey ? v.ticketByKey.get(ticketKey) : null));
  if (!ticketKey) return null;
  return (
    <Link to={`/tickets?open=${ticketKey}`} className={cn('inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[12px] hover:border-line-strong', compact && 'border-0 bg-transparent px-0')} title={t?.summary}>
      <AppLogo name="jira" size={16} />
      <span className="font-semibold text-ink">{ticketKey}</span>
      {t && !compact && <JiraStatus status={t.status} />}
    </Link>
  );
}

/** Raise a Jira issue linked to a record. */
export function CreateTicketModal({ open, onClose, link, defaults = {} }) {
  const view = useView();
  const toast = useToast();
  const [summary, setSummary] = useState(defaults.summary || '');
  const [description, setDescription] = useState(defaults.description || '');
  const [priority, setPriority] = useState(defaults.priority || 'High');
  const [type, setType] = useState(defaults.type || 'Task');
  const [assignee, setAssignee] = useState(defaults.assignee ?? null);
  const [busy, setBusy] = useState(false);
  const jira = view.connections.find((c) => c.provider === 'jira');

  const submit = async (e) => {
    e?.preventDefault();
    if (!summary.trim()) return;
    setBusy(true);
    const key = await actions.createTicket({ summary: summary.trim(), description, priority, type, assignee, links: link ? [link] : [] });
    setBusy(false);
    onClose();
    toast.notify({ variant: 'success', title: `${key} created in Jira`, description: assignee ? `${personName(assignee)} has been emailed.` : 'It is in the Security Engineering backlog.' });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Jira issue"
      description={jira ? `${ORG.jiraProject.name} (${ORG.jiraProject.key}) on ${jira.name}` : 'Connect Jira to raise issues.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!summary.trim()}>Create issue</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3.5">
        <div className="flex items-center gap-2 rounded-[10px] border border-line bg-surface-2 px-3 py-2">
          <AppLogo name="jira" size={22} />
          <span className="min-w-0 text-[12.5px] text-ink-2">
            Linked to <span className="font-medium text-ink">{link ? recordLabel(link, view) : 'nothing yet'}</span>
          </span>
        </div>
        <Field label="Summary" htmlFor="tk-summary" required>
          <Input id="tk-summary" value={summary} onChange={(e) => setSummary(e.target.value)} autoFocus />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Issue type" htmlFor="tk-type">
            <Select id="tk-type" value={type} onChange={(e) => setType(e.target.value)}>
              <option>Task</option>
              <option>Incident</option>
              <option>Bug</option>
            </Select>
          </Field>
          <Field label="Priority" htmlFor="tk-priority">
            <Select id="tk-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {['Highest', 'High', 'Medium', 'Low'].map((p) => <option key={p}>{p}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Assignee" hint="They get the Jira email straight away.">
          <PersonPicker value={assignee} onChange={setAssignee} />
        </Field>
        <Field label="Description" htmlFor="tk-desc">
          <Textarea id="tk-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

/** Email teammates (or any address) about a record. */
export function EmailModal({ open, onClose, link, defaults = {} }) {
  const view = useView();
  const toast = useToast();
  const [to, setTo] = useState(defaults.to || []);
  const [extra, setExtra] = useState('');
  const [subject, setSubject] = useState(defaults.subject || '');
  const [body, setBody] = useState(defaults.body || '');
  const [busy, setBusy] = useState(false);
  const recipients = useMemo(() => [...to, ...extra.split(/[,\s]+/).filter((x) => /.+@.+\..+/.test(x))], [to, extra]);

  const submit = async (e) => {
    e?.preventDefault();
    if (!recipients.length || !subject.trim()) return;
    setBusy(true);
    await actions.sendMail({ to: recipients, subject: subject.trim(), body, link });
    setBusy(false);
    onClose();
    toast.notify({ variant: 'success', title: 'Email sent', description: `To ${recipients.map((r) => (r.includes('@') ? r : personName(r, view))).join(', ')}` });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send email"
      icon={Mail}
      description={`Sent from ${ORG.mailFrom}. Replies go to you.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Send} onClick={submit} loading={busy} disabled={!recipients.length || !subject.trim()}>Send</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3.5">
        <Field label="To">
          <div className="flex flex-wrap gap-1.5">
            {to.map((r) => (
              <button key={r} type="button" onClick={() => setTo(to.filter((x) => x !== r))} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 py-0.5 pr-2 pl-0.5 text-[12px] text-ink hover:border-critical/40" title="Remove">
                <Avatar refId={r} size={18} /> {personName(r, view)} ×
              </button>
            ))}
            <PersonPicker value={null} onChange={(r) => r && !to.includes(r) && setTo([...to, r])} allowNone={false} size="sm" className="w-44" label="Add recipient" />
          </div>
        </Field>
        <Field label="Other addresses" htmlFor="em-extra" hint="Comma separated, e.g. secops@corvane.io">
          <Input id="em-extra" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="name@company.com" />
        </Field>
        <Field label="Subject" htmlFor="em-subject" required>
          <Input id="em-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Message" htmlFor="em-body">
          <Textarea id="em-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

/** Small read-only Jira card used where a record is tracked. */
export function TicketCard({ ticketKey }) {
  const t = useView((v) => v.ticketByKey.get(ticketKey));
  if (!t) return null;
  return (
    <Link to={`/tickets?open=${t.key}`} className="block rounded-[10px] border border-line bg-surface p-3 transition-colors hover:border-line-strong">
      <div className="flex items-center gap-2">
        <AppLogo name="jira" size={18} />
        <span className="text-[12px] font-semibold text-ink-2">{t.key}</span>
        <JiraStatus status={t.status} />
        <span className="ml-auto"><JiraPriority priority={t.priority} /></span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[13px] font-medium text-ink">{t.summary}</p>
      <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-ink-3">
        <Avatar refId={t.assignee} size={16} /> <PersonName refId={t.assignee} /> · updated <Time at={t.updatedAt} />
      </p>
    </Link>
  );
}
