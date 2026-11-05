/* One page, two sections (#/onboard, #/tenants), a sidebar, and the account menu. */
(() => {
  'use strict';

  const { $ } = NHI;
  const VIEWS = {
    onboard: { title: 'Onboard a company', focus: () => NHI.onboard.focus() },
    tenants: { title: 'Tenants', focus: () => NHI.tenants.focus() },
  };

  /* ---------- sections ---------- */

  function route() {
    const name = location.hash.replace(/^#\//, '') === 'tenants' ? 'tenants' : 'onboard';
    for (const v of Object.keys(VIEWS)) {
      $('view-' + v).hidden = v !== name;
      const link = $('nav-' + v);
      if (v === name) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    }
    document.title = VIEWS[name].title + ' · Super Admin';
    $('crumb-page').textContent = name === 'tenants' ? 'Tenants' : 'Onboard company';
    setNav(false);
    if (name === 'tenants') NHI.tenants.load();   // always fresh: another operator may have changed something
    window.scrollTo({ top: 0 });
  }

  /* ---------- sidebar on small screens ---------- */

  const sidebar = $('sidebar');
  function setNav(open) {
    sidebar.dataset.open = String(open);
    $('scrim').hidden = !open;
    $('nav-toggle').setAttribute('aria-expanded', String(open));
    $('nav-toggle').setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  }
  $('nav-toggle').addEventListener('click', () => setNav(sidebar.dataset.open !== 'true'));
  $('scrim').addEventListener('click', () => setNav(false));
  window.matchMedia('(min-width: 1024px)').addEventListener('change', (e) => { if (e.matches) setNav(false); });

  /* ---------- account ---------- */

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.dataset.open === 'true') { setNav(false); $('nav-toggle').focus(); }
  });

  $('signout').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    await NHI.sendJSON('POST', '/api/logout', {});
    location.reload();   // the same address now shows the sign-in page
  });

  function initials(name) {
    const parts = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
  }

  /* ---------- session ---------- */

  window.addEventListener('nhi-session-ended', () => { $('session-banner').hidden = false; });
  NHI.api('/api/session').then(({ data }) => {
    if (!data.signed_in) { window.dispatchEvent(new Event('nhi-session-ended')); return; }
    $('who-name').textContent = data.user;
    $('avatar').textContent = initials(data.user);
    $('signout').title = 'Sign out ' + data.user;
  });

  window.addEventListener('hashchange', route);
  route();
  // The count beside "Tenants" is useful from the first screen, not only after a visit.
  if (!NHI.tenants.loaded()) NHI.tenants.load();
})();
