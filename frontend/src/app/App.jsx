import { useEffect, useRef, useState } from 'react';
import { MemoryRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ThemeProvider } from './ThemeContext';
import { ToastProvider, useToast } from '../ui/Toast';
import { AppShell } from '../shell/AppShell';
import { RouteFallback } from '../shell/RouteFallback';
import { boot, onRemoteActivity, onWriteError, readSession, restoreSession, setPresence, useView, actions, personName, recordPath } from '../data/store';
import SignInPage from '../features/auth/SignInPage';
import OverviewPage from '../features/overview/OverviewPage';
import IdentitiesPage from '../features/identities/IdentitiesPage';
import IdentityPage from '../features/identities/IdentityPage';
import CredentialsPage from '../features/credentials/CredentialsPage';
import FindingsPage from '../features/findings/FindingsPage';
import DetectionsPage from '../features/detections/DetectionsPage';
import ExposurePage from '../features/exposure/ExposurePage';
import AttackPathsPage from '../features/access/AttackPathsPage';
import RemediationPage from '../features/remediation/RemediationPage';
import TicketsPage from '../features/tickets/TicketsPage';
import InboxPage from '../features/inbox/InboxPage';
import IntegrationsPage from '../features/integrations/IntegrationsPage';
import AutomationsPage from '../features/automations/AutomationsPage';
import TeamPage from '../features/admin/TeamPage';
import AuditLogPage from '../features/admin/AuditLogPage';
import NotFoundPage from '../features/NotFoundPage';

/*
 * A published page may only carry a plain "#name" in its address, so the
 * router runs in memory and mirrors the screen into the hash as
 * "#identities--aws-1k2j3" (path segments joined by "--"). Opening a link
 * with such a hash lands on that screen.
 */
function pathFromHash() {
  const raw = (window.location.hash || '').replace(/^#/, '');
  if (!raw || !/^[A-Za-z0-9-]+$/.test(raw)) return '/overview';
  return `/${raw.split('--').join('/')}`;
}
function hashFromPath(pathname) {
  const h = pathname.replace(/^\//, '').split('/').filter(Boolean).join('--');
  return /^[A-Za-z0-9-]*$/.test(h) ? h : '';
}

function HashSync() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = useRef(pathname);
  current.current = pathname;
  useEffect(() => {
    const h = hashFromPath(pathname);
    try {
      if (h && window.location.hash.replace(/^#/, '') !== h) window.history.replaceState(null, '', `#${h}`);
    } catch {
      /* the frame may refuse; the console still works */
    }
    setPresence({ path: pathname });
  }, [pathname]);
  useEffect(() => {
    const onHash = () => {
      const next = pathFromHash();
      if (next !== current.current) navigate(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [navigate]);
  return null;
}

/* Tells this person, as it happens, what teammates just did that concerns them. */
function LiveNotices() {
  const toast = useToast();
  const navigate = useNavigate();
  const me = useView((v) => v.me);
  useEffect(() => {
    const offWrite = onWriteError((error) => {
      toast.notify({
        variant: 'error',
        title: 'That change was not saved',
        description: error?.code === 'invalid_argument' ? 'Your access to this workspace is view-only. Ask the owner for edit access.' : 'The workspace could not be reached. Try again in a moment.',
      });
    });
    const off = onRemoteActivity((a) => {
      const forMe = (a.recipients || []).includes(me?.ref);
      const notable = forMe || a.verb === 'created' || a.verb === 'connected' || a.verb === 'approved' || a.verb === 'joined' || (a.verb === 'moved' && a.text?.includes('Done'));
      if (!notable) return;
      toast.notify({
        variant: 'info',
        title: `${personName(a.actor)} ${a.verb} ${a.verb === 'joined' ? 'the workspace' : ''}`.trim(),
        description: a.verb === 'joined' ? 'They can now see and update everything here.' : a.text,
        duration: 6500,
        action: a.target ? { label: 'Open', onSelect: () => navigate(recordPath(a.target)) } : null,
      });
    });
    return () => {
      off();
      offWrite?.();
    };
  }, [toast, me?.ref, navigate]);
  useEffect(() => {
    if (!me) return undefined;
    actions.touchMember();
    const t = window.setInterval(() => actions.touchMember(), 5 * 60_000);
    return () => window.clearInterval(t);
  }, [me]);
  return null;
}

function Gate() {
  const [booted, setBooted] = useState(false);
  const me = useView((v) => v.me);
  useEffect(() => {
    boot().then(() => {
      const session = readSession();
      if (session) restoreSession(session);
      setBooted(true);
    });
  }, []);
  if (!booted) return <RouteFallback />;
  if (!me) return <SignInPage />;
  return (
    <>
      <HashSync />
      <LiveNotices />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/identities" element={<IdentitiesPage />} />
          <Route path="/identities/:id" element={<IdentityPage />} />
          <Route path="/credentials" element={<CredentialsPage />} />
          <Route path="/findings" element={<FindingsPage />} />
          <Route path="/detections" element={<DetectionsPage />} />
          <Route path="/exposure" element={<ExposurePage />} />
          <Route path="/access-graph" element={<AttackPathsPage />} />
          <Route path="/access-graph/:id" element={<AttackPathsPage />} />
          <Route path="/remediation" element={<RemediationPage />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/integrations" element={<IntegrationsPage />} />
          <Route path="/automations" element={<AutomationsPage />} />
          <Route path="/settings/team" element={<TeamPage />} />
          <Route path="/audit-log" element={<AuditLogPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[pathFromHash()]}>
          <Gate />
        </MemoryRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
