import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Forward, Inbox, Mail, MailOpen, PenSquare, Reply, Send } from 'lucide-react';
import { PageHeader } from '../../shell/PageHeader';
import { Panel } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { SearchInput } from '../../ui/Field';
import { EmptyState } from '../../ui/States';
import { personName, recordLabel, recordPath, useView } from '../../data/store';
import { ORG } from '../../data/world';
import { GROUP_ADDRESSES, isMine, markMailRead, usePersonal } from '../../data/personal';
import { AppLogo } from '../../components/Logo';
import { Avatar, Time } from '../../components/bits';
import { EmailModal } from '../../components/collab';
import { useOpenParam } from '../../components/listkit';
import { formatDateTime } from '../../lib/format';
import { cn } from '../../ui/cn';

const FOLDERS = [
  { key: 'inbox', label: 'Inbox', icon: Inbox },
  { key: 'jira', label: 'Jira', logo: 'jira' },
  { key: 'alerts', label: 'Alerts', icon: Mail },
  { key: 'sent', label: 'Sent', icon: Send },
  { key: 'all', label: 'All mail', icon: MailOpen },
];

function senderOf(m, view) {
  if (m.from === ORG.mailFrom) return { name: 'Corvane NHI Alerts', address: m.from, logo: null, system: true };
  if (String(m.from).startsWith('jira@')) return { name: 'Jira', address: m.from, logo: 'jira' };
  return { name: personName(m.from, view), address: view.personByRef.get(m.from)?.email || '', ref: m.from };
}
const addr = (r, view) => (r.includes('@') ? r : personName(r, view));

export default function InboxPage() {
  const view = useView();
  const personal = usePersonal();
  const [openId, setOpen] = useOpenParam();
  const [folder, setFolder] = useState('inbox');
  const [q, setQ] = useState('');
  const [compose, setCompose] = useState(null);
  const read = new Set(personal.readMail || []);
  const joined = view.people.find((p) => p.isMe)?.joinedAt;
  const isUnread = (m) => !read.has(m.id) && m.from !== view.me?.ref && isMine(m, view.me) && (!joined || Date.parse(m.at) > Date.parse(joined) - 36 * 3600e3);

  const lists = useMemo(() => {
    const mine = view.mail.filter((m) => isMine(m, view.me));
    return {
      inbox: mine,
      jira: mine.filter((m) => m.kind === 'jira'),
      alerts: mine.filter((m) => m.from === ORG.mailFrom),
      sent: view.mail.filter((m) => m.from === view.me?.ref),
      all: view.mail,
    };
  }, [view.mail, view.me]);
  const list = lists[folder].filter((m) => !q || `${m.subject} ${m.body}`.toLowerCase().includes(q.toLowerCase()));
  const current = view.mail.find((m) => m.id === openId);

  useEffect(() => {
    if (current && isUnread(current)) markMailRead(current.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Inbox"
        lede={<>Mail from the console and from Jira, delivered through Google Workspace as {ORG.mailFrom}. Group mail to {GROUP_ADDRESSES.join(' and ')} lands here too.</>}
        actions={<Button variant="primary" icon={PenSquare} onClick={() => setCompose({})}>Compose</Button>}
      />
      <Panel flush className="grid min-h-[620px] overflow-hidden @min-[72rem]:grid-cols-[200px_380px_minmax(0,1fr)]">
        <nav aria-label="Folders" className="flex gap-1 overflow-x-auto border-b border-line bg-surface-2 p-2 @min-[72rem]:flex-col @min-[72rem]:border-r @min-[72rem]:border-b-0">
          {FOLDERS.map((f) => {
            const unread = lists[f.key].filter(isUnread).length;
            return (
              <button key={f.key} type="button" onClick={() => setFolder(f.key)} className={cn('flex shrink-0 items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px]', folder === f.key ? 'bg-surface font-semibold text-ink shadow-sm' : 'text-ink-2 hover:bg-surface')}>
                {f.logo ? <AppLogo name={f.logo} size={18} /> : <f.icon aria-hidden="true" className="size-4" />}
                <span className="flex-1">{f.label}</span>
                {unread > 0 && f.key !== 'all' && f.key !== 'sent' && <span className="rounded-full bg-brand px-1.5 text-[10.5px] leading-[17px] font-bold text-white">{unread}</span>}
              </button>
            );
          })}
        </nav>

        <div className="flex min-h-0 flex-col border-line @min-[72rem]:border-r">
          <div className="border-b border-line p-2.5"><SearchInput value={q} onChange={setQ} size="sm" placeholder="Search mail" /></div>
          {list.length === 0 ? (
            <EmptyState icon={Inbox} compact title="Nothing here" description={folder === 'sent' ? 'Mail you send from any record shows up here.' : 'You are all caught up.'} />
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
              {list.map((m) => {
                const s = senderOf(m, view);
                const unread = isUnread(m);
                return (
                  <li key={m.id}>
                    <button type="button" onClick={() => setOpen(m.id)} className={cn('flex w-full gap-2.5 px-3 py-3 text-left transition-colors', current?.id === m.id ? 'bg-info-soft' : 'hover:bg-surface-2')}>
                      {s.logo ? <AppLogo name={s.logo} size={30} /> : <Avatar refId={s.system ? 'system' : s.ref} size={30} />}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className={cn('min-w-0 flex-1 truncate text-[12.5px]', unread ? 'font-bold text-ink' : 'text-ink-2')}>{folder === 'sent' ? `To ${m.to.map((r) => addr(r, view)).join(', ')}` : s.name}</span>
                          <Time at={m.at} short className="shrink-0 text-[11px] text-ink-3" />
                        </span>
                        <span className={cn('mt-0.5 block truncate text-[12.5px]', unread ? 'font-semibold text-ink' : 'text-ink')}>{m.subject}</span>
                        <span className="mt-0.5 block truncate text-[12px] text-ink-3">{m.body.replace(/\n+/g, ' ')}</span>
                      </span>
                      {unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="min-w-0 border-t border-line @min-[72rem]:border-t-0">
          {!current ? (
            <EmptyState icon={Mail} title="Select a message" description="Pick one on the left to read it." />
          ) : (
            <Message m={current} onReply={(mode) => setCompose({ mode, m: current })} />
          )}
        </div>
      </Panel>
      <EmailModal
        key={compose ? `${compose.mode}-${compose.m?.id}` : 'none'}
        open={Boolean(compose)}
        onClose={() => setCompose(null)}
        link={compose?.m?.link || null}
        defaults={
          compose?.mode === 'reply'
            ? { to: compose.m.from && !String(compose.m.from).includes('@') ? [compose.m.from] : [], subject: `Re: ${compose.m.subject}`, body: `\n\n---\nOn ${formatDateTime(compose.m.at)}, ${senderOf(compose.m, view).name} wrote:\n${compose.m.body}` }
            : compose?.mode === 'forward'
              ? { subject: `Fwd: ${compose.m.subject}`, body: `\n\n--- Forwarded message ---\nFrom: ${senderOf(compose.m, view).name}\nSubject: ${compose.m.subject}\n\n${compose.m.body}` }
              : {}
        }
      />
    </div>
  );
}

function Message({ m, onReply }) {
  const view = useView();
  const s = senderOf(m, view);
  return (
    <article className="animate-fade flex h-full flex-col">
      <header className="border-b border-line p-5">
        <h2 className="text-[18px] font-bold tracking-[-0.015em] text-ink">{m.subject}</h2>
        <div className="mt-3 flex items-start gap-3">
          {s.logo ? <AppLogo name={s.logo} size={38} /> : <Avatar refId={s.system ? 'system' : s.ref} size={38} />}
          <div className="min-w-0 flex-1 text-[12.5px]">
            <p><span className="font-semibold text-ink">{s.name}</span> {s.address && <span className="text-ink-3">&lt;{s.address}&gt;</span>}</p>
            <p className="text-ink-3">To {m.to.map((r) => addr(r, view)).join(', ')}{m.cc?.length ? ` · Cc ${m.cc.map((r) => addr(r, view)).join(', ')}` : ''}</p>
          </div>
          <span className="shrink-0 text-[12px] text-ink-3">{formatDateTime(m.at)}</span>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-5">
        {m.kind === 'jira' && <div className="mb-4 h-1 w-16 rounded-full bg-[#0052CC]" aria-hidden="true" />}
        <p className="max-w-[68ch] text-[13.5px] leading-[1.7] whitespace-pre-wrap text-ink-2">{m.body}</p>
        {m.link && (
          <Link to={recordPath(m.link)} className="mt-5 inline-flex items-center gap-2 rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-[13px] font-medium text-ink hover:border-line-strong">
            {m.link.kind === 'ticket' ? <AppLogo name="jira" size={18} /> : null}
            Open {recordLabel(m.link, view).slice(0, 60)}
            <ArrowRight aria-hidden="true" className="size-4 text-ink-3" />
          </Link>
        )}
        {m.triggeredBy && m.triggeredBy !== 'system' && <p className="mt-6 text-[11.5px] text-ink-3">Sent because of an action by {personName(m.triggeredBy, view)}.</p>}
      </div>
      <footer className="flex flex-wrap gap-2 border-t border-line p-3">
        <Button size="sm" variant="secondary" icon={Reply} onClick={() => onReply('reply')}>Reply</Button>
        <Button size="sm" variant="secondary" icon={Forward} onClick={() => onReply('forward')}>Forward</Button>
        <Button size="sm" variant="ghost" icon={Mail} onClick={() => markMailRead(m.id, false)}>Mark unread</Button>
      </footer>
    </article>
  );
}
