import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import {
  Activity,
  FolderGit2,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PlugZap,
  ScrollText,
  ShieldAlert,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './auth';
import { BrandLockup } from './shell/Brand';
import { IconButton } from './ui/Button';
import { cn } from './ui/cn';
import { Skeleton } from './ui/Skeleton';
import { LoginPage } from './pages/Login';

const Overview = lazy(() => import('./pages/Overview'));
const Findings = lazy(() => import('./pages/Findings'));
const Repositories = lazy(() => import('./pages/Repositories'));
const Jenkins = lazy(() => import('./pages/Jenkins'));
const Connections = lazy(() => import('./pages/Connections'));
const ActivityPage = lazy(() => import('./pages/Activity'));
const UsersPage = lazy(() => import('./pages/Users'));
const Audit = lazy(() => import('./pages/Audit'));
const Account = lazy(() => import('./pages/Account'));

const NAV = [
  { group: 'Monitor', items: [
    { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/findings', label: 'Secrets in code', icon: ShieldAlert },
    { to: '/repositories', label: 'Repositories', icon: FolderGit2 },
    { to: '/jenkins', label: 'Jenkins credentials', icon: KeyRound },
    { to: '/activity', label: 'Webhook activity', icon: Activity },
  ] },
  { group: 'Set up', items: [{ to: '/connections', label: 'Connections', icon: PlugZap }] },
  { group: 'Administration', admin: true, items: [
    { to: '/users', label: 'People', icon: Users },
    { to: '/audit', label: 'Audit log', icon: ScrollText },
  ] },
];

const ROLE_LABEL = { admin: 'Admin', analyst: 'Analyst', viewer: 'Viewer' };

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('dna.theme', theme);
    } catch {
      /* not stored */
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

function Sidebar({ onNavigate }) {
  const { isAdmin } = useAuth();
  return (
    <nav aria-label="Main" className="flex flex-col gap-5 px-3 py-4">
      {NAV.filter((g) => !g.admin || isAdmin).map((g) => (
        <div key={g.group}>
          <p className="px-3 pb-1.5 text-[10.5px] font-semibold tracking-[0.13em] text-ink-3 uppercase">{g.group}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex h-9 items-center gap-2.5 rounded-[var(--radius-control)] px-3 text-[13.5px] font-medium transition-colors',
                      isActive ? 'bg-info-soft text-brand' : 'text-ink-2 hover:bg-surface-3 hover:text-ink',
                    )
                  }
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Shell({ children }) {
  const { user, role, signOut } = useAuth();
  const [theme, toggleTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-surface px-3 sm:px-5">
        <IconButton icon={open ? X : Menu} label={open ? 'Close menu' : 'Open menu'} className="lg:hidden" onClick={() => setOpen((o) => !o)} />
        <BrandLockup height={24} />
        <span className="hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
        <span className="hidden text-[13px] font-semibold text-ink-2 sm:block">Code &amp; CI/CD · on-premises</span>
        <div className="ml-auto flex items-center gap-1.5">
          <IconButton icon={theme === 'dark' ? Sun : Moon} label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={toggleTheme} />
          <NavLink to="/account" className="flex min-w-0 items-center gap-2 rounded-[var(--radius-control)] px-2 py-1 hover:bg-surface-3" title="Your account">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-info-soft text-[12px] font-bold text-brand uppercase">
              {(user?.name || user?.email || '?').slice(0, 1)}
            </span>
            <span className="hidden min-w-0 text-left leading-tight md:block">
              <span className="block max-w-[180px] truncate text-[12.5px] font-semibold text-ink">{user?.name || user?.email}</span>
              <span className="block text-[11px] text-ink-3">{ROLE_LABEL[role]}</span>
            </span>
          </NavLink>
          <IconButton icon={LogOut} label="Sign out" onClick={signOut} />
        </div>
      </header>
      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-[232px] shrink-0 overflow-y-auto border-r border-line bg-surface lg:block">
          <Sidebar />
        </aside>
        {open && (
          <div className="fixed inset-0 top-14 z-30 lg:hidden">
            <button type="button" aria-label="Close menu" className="absolute inset-0 bg-[var(--t-overlay)]" onClick={() => setOpen(false)} />
            <aside className="animate-slide-left relative h-full w-[260px] overflow-y-auto border-r border-line bg-surface">
              <Sidebar onNavigate={() => setOpen(false)} />
            </aside>
          </div>
        )}
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <div className="mx-auto max-w-[1360px]">
            <Suspense fallback={<Skeleton className="h-40 w-full" />}>{children}</Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}

function Routed() {
  const { user, isAdmin } = useAuth();
  if (!user) return <LoginPage />;
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/findings" element={<Findings />} />
        <Route path="/repositories" element={<Repositories />} />
        <Route path="/jenkins" element={<Jenkins />} />
        <Route path="/connections" element={<Connections />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/account" element={<Account />} />
        {isAdmin && <Route path="/users" element={<UsersPage />} />}
        {isAdmin && <Route path="/audit" element={<Audit />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Routed />
    </AuthProvider>
  );
}
