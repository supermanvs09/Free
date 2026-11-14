import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ContextBar } from './ContextBar';
import { CommandPalette } from './CommandPalette';
import { ScreenErrorBoundary } from './ScreenErrorBoundary';
import { cn } from '../ui/cn';

const COLLAPSE_KEY = 'dna.sidebar.collapsed';

/**
 * Console shell: a fixed full-width top bar, a sidebar beneath it, and a
 * content column that owns its own breadcrumb, title and toolbars.
 */
export function AppShell() {
  const { pathname, hash } = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  /* Every screen opens at its top. The page scrolls the window, and a
     client-side route change keeps the window's offset - so a screen opened
     from the foot of another (Dashboard -> "All activity", a Genome row ->
     its record) used to open half-way down, or at the very bottom. The
     browser's own restoration is switched off for the same reason: it
     restores the previous screen's offset onto the next. Changes of the query
     string alone (a filter, a tab) do not move the page. */
  useLayoutEffect(() => {
    try {
      if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    } catch {
      /* not supported - harmless */
    }
  }, []);
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  /* A link to a section of a screen (/posture#weakest-identities) opens the
     screen at that section. Screens load their data first, so the section is
     looked for over the next few seconds and brought into view once drawn,
     with a brief highlight so the eye finds it. */
  useEffect(() => {
    const id = decodeURIComponent(hash.replace(/^#/, ''));
    if (!id) return undefined;
    let tries = 0;
    let timer = 0;
    const seek = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('section-flash');
        timer = window.setTimeout(() => el.classList.remove('section-flash'), 1600);
        return;
      }
      if (tries++ < 40) timer = window.setTimeout(seek, 100);
    };
    seek();
    return () => window.clearTimeout(timer);
  }, [pathname, hash]);
  const [commandOpen, setCommandOpen] = useState(false);

  const toggleCollapse = useCallback(() => {
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* per-viewer convenience only - safe to lose */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="min-h-dvh bg-canvas">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[90] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:text-ink focus:shadow-lg"
        >
          Skip to content
        </a>

        <TopBar onOpenNav={() => setMobileOpen(true)} onOpenCommand={() => setCommandOpen(true)} />

        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />

        <div
          className={cn(
            'flex min-h-dvh flex-col pt-16 transition-[padding] duration-250 ease-[var(--ease-out-quint)]',
            collapsed ? 'lg:pl-[84px]' : 'lg:pl-[236px]',
          )}
        >
          <ContextBar />
          <main id="main" className="flex-1 px-3 pt-4 pb-14 sm:px-5 lg:px-6">
            {/* A query container. The metric rows below key their column count
                off this width, not the viewport's - see `docs/UX-DECISIONS.md`
                §10. */}
            <div className="content-scale @container mx-auto w-full max-w-[1760px]">
              <ScreenErrorBoundary key={pathname}>
                <Outlet />
              </ScreenErrorBoundary>
            </div>
          </main>
        </div>

        <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  );
}
