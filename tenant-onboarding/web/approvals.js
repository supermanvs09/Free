/* The Approvals tab and its notifications.

   A company's AWS account that passes every connection check in the console
   waits here for a super admin. Requests also arrive by e-mail; while any page
   of this app is open, the bell, the sidebar badge, the tab title, a toast and
   (when allowed) a desktop notification announce new ones. */
(() => {
  'use strict';

  const { $, el, api, sendJSON, toast, copy } = NHI;

  const POLL_MS = 20000;
  const SEEN_KEY = 'nhi.approvals.seen';     // the newest request this browser has announced
  const DESK_KEY = 'nhi.approvals.desktop';  // 'no' once the admin declined desktop alerts

  let filter = 'pending';
  let query = '';
  let list = [];
  let loaded = false;
  let visible = false;
  let pendingCount = 0;
  let deciding = null;       // { approval, approve }
  let busy = false;
  let timer = 0;
  let lastLoadedAt = 0;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* private mode */ } },
  };

  /* ---------- time ---------- */

  const dateTimeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  function ago(iso) {
    const t = Date.parse(iso);
    if (!t) return '';
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
    const h = Math.round(m / 60);
    if (h < 48) return h + (h === 1 ? ' hour ago' : ' hours ago');
    const d = Math.round(h / 24);
    return d + ' days ago';
  }
  const when = (iso) => el('time', { datetime: iso, title: dateTimeFmt.format(new Date(iso)) }, ago(iso));

  /* ---------- notifications: badge, bell, title, toast, desktop ---------- */

  function setBadges(n) {
    pendingCount = n;
    const badge = $('nav-approvals-count');
    badge.textContent = String(n);
    badge.hidden = n === 0;
    $('bell-dot').hidden = n === 0;
    $('bell-dot').textContent = n > 9 ? '9+' : String(n);
    $('bell').setAttribute('aria-label', n ? n + ' connection request' + (n === 1 ? '' : 's') + ' waiting' : 'Connection requests');
    $('seg-pending').textContent = n ? String(n) : '';
    const base = document.title.replace(/^\(\d+\) /, '');
    document.title = n ? '(' + n + ') ' + base : base;
  }

  function desktopState() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'on';
    if (Notification.permission === 'denied' || store.get(DESK_KEY) === 'no') return 'off';
    return 'ask';
  }

  function refreshDesktopPrompts() {
    const ask = desktopState() === 'ask';
    $('ap-desktop').hidden = !ask || !visible;
    $('bell-desktop').hidden = !ask;
  }

  async function enableDesktop() {
    try { await Notification.requestPermission(); } catch (_) { /* old browsers */ }
    if (Notification.permission !== 'granted') store.set(DESK_KEY, 'no');
    else toast('Desktop alerts are on for this browser');
    refreshDesktopPrompts();
  }

  function announce(newOnes, total) {
    const first = newOnes[0];
    const text = newOnes.length === 1 && first && first.account_id
      ? (first.domain || first.workspace) + ' asks to connect AWS account ' + first.account_id
      : newOnes.length + ' new connection requests are waiting';
    toast('New connection request: ' + text);
    if (desktopState() === 'on' && document.visibilityState !== 'visible') {
      try {
        const n = new Notification('Connection request waiting', { body: text + (total > 1 ? ' (' + total + ' waiting in all)' : ''), tag: 'nhi-approvals', icon: '/brand/mark.png' });
        n.onclick = () => { window.focus(); location.hash = '#/approvals'; n.close(); };
      } catch (_) { /* some browsers allow notifications only from a service worker */ }
    }
  }

  // The newest pending id this browser has already told the admin about. The
  // first poll in a fresh browser only remembers it: a toast for every old
  // request on first sign-in would be noise; the badge already shows them.
  async function poll() {
    const { ok, data } = await api('/api/approvals/pending');
    if (!ok || !data.ready) return;
    const latest = Number(data.latest_pending_id) || 0;
    const seen = Number(store.get(SEEN_KEY));
    const changed = data.pending !== pendingCount;
    setBadges(data.pending);
    if (store.get(SEEN_KEY) === null) {
      store.set(SEEN_KEY, String(latest));
    } else if (latest > seen) {
      store.set(SEEN_KEY, String(latest));
      // Fetch the new ones for the message; the list refreshes too if it is open.
      const res = await api('/api/approvals?status=pending');
      const fresh = res.ok ? (res.data.approvals || []).filter((a) => a.id > seen) : [];
      announce(fresh.length ? fresh : [{}, {}], data.pending);
      if (res.ok) renderBell(res.data.approvals || []);
      if (visible) load();
      return;
    }
    if (changed && visible) load();
    else if (changed) refreshBell();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(async () => { await poll(); schedule(); }, POLL_MS);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { poll(); schedule(); }
  });

  /* ---------- the bell's panel ---------- */

  async function refreshBell() {
    const { ok, data } = await api('/api/approvals?status=pending');
    if (ok) renderBell(data.approvals || []);
  }

  function renderBell(pending) {
    $('bell-sub').textContent = pending.length ? pending.length + ' waiting' : 'Nothing waiting';
    const items = pending.slice(0, 6).map((a) => el('li', {},
      el('a', { href: '#/approvals', onclick: () => { focusId = a.id; hideBell(); } },
        el('strong', {}, a.domain || a.workspace),
        el('span', { class: 'sub' }, 'AWS ' + a.account_id + ' · ' + ago(a.requested_at)))));
    if (!items.length) items.push(el('li', { class: 'none-row' }, 'No connection is waiting for approval.'));
    $('bell-list').replaceChildren(...items);
  }

  function hideBell() { try { $('bell-panel').hidePopover(); } catch (_) { /* not open */ } }
  $('bell-panel').addEventListener('toggle', (e) => { if (e.newState === 'open') refreshBell(); });
  $('bell-all').addEventListener('click', hideBell);
  $('bell-desktop').addEventListener('click', () => { hideBell(); enableDesktop(); });

  /* ---------- the list ---------- */

  let focusId = 0;
  let inflight = null;
  function load() {
    if (!inflight) inflight = fetchList().finally(() => { inflight = null; });
    return inflight;
  }

  async function fetchList() {
    $('ap-banner').hidden = true;
    if (!loaded) renderLoading();
    $('ap-refresh').disabled = true;
    const { ok, data } = await api('/api/approvals?status=' + encodeURIComponent(filter));
    $('ap-refresh').disabled = false;
    if (!ok) {
      if (!loaded) $('ap-list').replaceChildren();
      const b = $('ap-banner');
      b.replaceChildren(el('span', {}, (data.error || 'The requests could not be loaded.') + ' '),
        el('button', { type: 'button', class: 'btn link', onclick: load }, 'Try again'));
      b.hidden = false;
      return;
    }
    if (!data.ready) {
      list = [];
      loaded = true;
      renderEmpty('Approvals are not set up yet', 'The database has no connection_approvals table. Run the API server’s migration migrations/global/007_connection_approvals.sql, then refresh.');
      $('ap-list').replaceChildren();
      return;
    }
    list = data.approvals || [];
    loaded = true;
    lastLoadedAt = Date.now();
    setBadges(data.pending || 0);
    if (data.latest_pending_id) {
      const seen = Number(store.get(SEEN_KEY)) || 0;
      if (data.latest_pending_id > seen) store.set(SEEN_KEY, String(data.latest_pending_id)); // looking at the list counts as seen
    }
    render();
  }

  function renderLoading() {
    $('ap-empty').hidden = true;
    $('ap-list').replaceChildren(...[0, 1].map(() => el('div', { class: 'ap-card skeleton', 'aria-hidden': 'true' },
      el('span', { class: 'bar w40' }), el('span', { class: 'bar w70' }), el('span', { class: 'bar w55' }))));
  }

  function renderEmpty(title, text) {
    const e = $('ap-empty');
    e.replaceChildren(el('h2', {}, title), el('p', {}, text));
    e.hidden = false;
  }

  function matches(a, q) {
    if (!q) return true;
    return [a.domain, a.workspace, a.account_id, a.requested_by, a.tenant_id].some((v) => (v || '').toLowerCase().includes(q));
  }

  const STATE_ICON = { pass: '✓', warn: '!', fail: '✕', error: '✕', skipped: '–', running: '…' };

  function checkList(checks) {
    if (!Array.isArray(checks) || !checks.length) return null;
    return el('ul', { class: 'ap-checks', 'aria-label': 'Connection checks' }, ...checks.map((c) =>
      el('li', { class: 'st-' + (c.state || 'skipped') },
        el('span', { class: 'ck-icon', 'aria-hidden': 'true' }, STATE_ICON[c.state] || '•'),
        el('span', {}, el('strong', {}, c.label || c.key), c.message ? el('span', { class: 'sub' }, ' ' + c.message) : null),
        el('span', { class: 'sr' }, ' (' + (c.state || 'not run') + ')'))));
  }

  function regionsBlock(a) {
    const ev = a.events || {};
    const rs = Array.isArray(ev.regions) ? ev.regions : [];
    if (!rs.length) {
      return (a.regions || []).length
        ? el('span', { class: 'chips' }, ...(a.regions || []).filter((r) => r !== 'global').map((r) => el('span', { class: 'chip' }, r)))
        : el('span', { class: 'none' }, 'Not set');
    }
    return el('span', { class: 'chips' }, ...rs.map((r) => el('span', {
      class: 'chip ' + (r.seen ? 'seen' : 'missing'),
      title: r.seen ? (r.events || 0) + ' event(s) received' + (r.global ? ' — global services (IAM, STS) report here' : '') : 'No event received from this region',
    }, (r.seen ? '✓ ' : '○ ') + r.region + (r.global ? ' (global)' : ''))));
  }

  function emailLine(a) {
    switch (a.email_status) {
      case 'sent': return el('span', { class: 'mail ok' }, 'E-mail sent to approvers ', a.emailed_at ? when(a.emailed_at) : '');
      case 'failed': return el('span', { class: 'mail bad', title: a.email_error || '' }, 'E-mail to approvers failed' + (a.email_error ? ': ' + a.email_error : ''));
      case 'not_configured': return el('span', { class: 'mail warn', title: a.email_error || '' }, 'No e-mail sent: SMTP is not configured on the API server');
      default: return el('span', { class: 'mail' }, 'Sending e-mail to approvers…');
    }
  }

  const STATUS_LABEL = { pending: 'Waiting for approval', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn' };

  function card(a) {
    const pending = a.status === 'pending';
    const ev = a.events || {};
    const facts = [
      ['AWS account', el('span', { class: 'idline' }, el('span', { class: 'mono' }, a.account_id),
        el('button', { type: 'button', class: 'mini', 'aria-label': 'Copy AWS account ' + a.account_id, onclick: () => copy(a.account_id, 'Account ID') }, 'Copy'))],
      ['Role', a.role_arn ? el('span', { class: 'mono wrap' }, a.role_arn) : el('span', { class: 'none' }, 'Not recorded')],
      ['Regions', regionsBlock(a)],
      ['Events', ev.messages_scanned != null
        ? el('span', {}, (Array.isArray(ev.regions_seen) ? ev.regions_seen.length : 0) + ' of ' + (Array.isArray(ev.regions) ? ev.regions.length : 0) +
          ' regions delivered events · ' + ev.messages_scanned + ' message(s) read')
        : el('span', { class: 'none' }, 'No detail')],
      ['Requested', el('span', {}, 'by ', el('strong', {}, a.requested_by || 'unknown'), ' ', when(a.requested_at))],
      ['Workspace', el('span', { class: 'idline' }, el('code', {}, a.workspace), el('code', { title: a.tenant_id }, a.tenant_id.slice(0, 8)))],
    ];
    const head = el('div', { class: 'ap-head' },
      el('div', {},
        el('div', { class: 'name' }, a.domain || a.workspace, el('span', { class: 'pill st-' + a.status }, STATUS_LABEL[a.status] || a.status)),
        el('div', { class: 'sub' }, 'Wants to connect AWS account ' + a.account_id)),
      pending ? el('div', { class: 'actions' },
        el('button', { type: 'button', class: 'btn danger sm', onclick: () => openDecide(a, false) }, 'Reject…'),
        el('button', { type: 'button', class: 'btn primary sm', onclick: () => openDecide(a, true) }, 'Approve…')) : null);
    const decided = !pending ? el('p', { class: 'ap-decision st-' + a.status },
      el('strong', {}, STATUS_LABEL[a.status] || a.status), a.decided_by ? ' by ' + a.decided_by : '', a.decided_at ? ' ' : '',
      a.decided_at ? when(a.decided_at) : '', a.decision_note ? el('span', { class: 'note-text' }, '“' + a.decision_note + '”') : null) : null;
    return el('article', { class: 'ap-card' + (pending ? ' pending' : ''), 'data-id': String(a.id), tabindex: '-1', 'aria-label': (a.domain || a.workspace) + ', AWS account ' + a.account_id },
      head,
      el('dl', { class: 'ap-facts' }, ...facts.map(([k, v]) => el('div', {}, el('dt', {}, k), el('dd', {}, v)))),
      checkList(a.checks),
      el('div', { class: 'ap-foot' }, emailLine(a)),
      decided);
  }

  function render() {
    const q = query.trim().toLowerCase();
    const shown = list.filter((a) => matches(a, q));
    $('ap-updated').textContent = lastLoadedAt ? 'Updated ' + new Date(lastLoadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    $('ap-list').replaceChildren(...shown.map(card));
    if (shown.length) {
      $('ap-empty').hidden = true;
    } else if (q) {
      renderEmpty('No request matches “' + query.trim() + '”', 'Search by company domain, workspace, AWS account or the person who asked.');
    } else if (filter === 'pending') {
      renderEmpty('Nothing is waiting', 'When a company verifies a new AWS connection, it appears here and the approvers get an e-mail.');
    } else {
      renderEmpty('No decisions yet', 'Approved and rejected requests are listed here.');
    }
    if (focusId) {
      const node = $('ap-list').querySelector('[data-id="' + focusId + '"]');
      focusId = 0;
      if (node) { node.scrollIntoView({ block: 'center' }); node.classList.add('flash'); node.focus({ preventScroll: true }); }
    }
  }

  for (const b of document.querySelectorAll('.seg-btn')) {
    b.addEventListener('click', () => {
      filter = b.dataset.filter;
      for (const o of document.querySelectorAll('.seg-btn')) o.setAttribute('aria-selected', String(o === b));
      loaded = false;
      load();
    });
  }
  $('ap-search').addEventListener('input', (e) => { query = e.target.value; render(); });
  $('ap-refresh').addEventListener('click', () => load());
  $('ap-desktop-on').addEventListener('click', enableDesktop);
  $('ap-desktop-no').addEventListener('click', () => { store.set(DESK_KEY, 'no'); refreshDesktopPrompts(); });

  /* ---------- deciding ---------- */

  const dlg = $('decide');

  function openDecide(a, approve) {
    deciding = { approval: a, approve };
    const name = a.domain || a.workspace;
    $('decide-head').classList.toggle('danger', !approve);
    $('decide-title').textContent = approve ? 'Approve connection' : 'Reject connection';
    $('decide-sub').textContent = name + ' · AWS account ' + a.account_id;
    $('decide-lead').textContent = approve
      ? 'Approving connects this account for ' + name + ' straight away:'
      : 'Rejecting leaves this account disconnected:';
    const effects = approve
      ? ['The account shows as Connected on the company’s Integrations page.', 'Its first scan is queued; identities and activity start to appear within minutes.', 'Events already forwarded by the account are kept.']
      : ['The company sees “Rejected” and your reason on its Integrations page.', 'Nothing is scanned. The company can fix the setup and verify again, which sends a new request.'];
    $('decide-effects').replaceChildren(...effects.map((t) => el('li', {}, t)));
    $('decide-note-label').replaceChildren(approve ? 'Note ' : 'Reason ', approve ? el('span', { class: 'opt' }, 'optional') : el('span', { class: 'opt' }, 'required'));
    $('decide-note-hint').textContent = approve ? 'Kept with the decision for the record.' : 'The company sees this, so say what to change.';
    $('decide-note').value = '';
    $('decide-note').removeAttribute('aria-invalid');
    $('decide-note-error').hidden = true;
    $('decide-banner').hidden = true;
    $('decide-state').textContent = '';
    const go = $('decide-go');
    go.textContent = approve ? 'Approve and connect' : 'Reject request';
    go.className = approve ? 'btn primary' : 'btn danger solid';
    go.disabled = false;
    dlg.showModal();
    $('decide-note').focus();
  }

  function closeDecide() {
    if (busy) return;
    dlg.close();
    deciding = null;
  }
  $('decide-x').addEventListener('click', closeDecide);
  $('decide-cancel').addEventListener('click', closeDecide);
  dlg.addEventListener('cancel', (e) => { if (busy) e.preventDefault(); else deciding = null; });
  $('decide-note').addEventListener('input', () => { $('decide-note').removeAttribute('aria-invalid'); $('decide-note-error').hidden = true; });

  $('decide-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!deciding || busy) return;
    const { approval, approve } = deciding;
    const note = $('decide-note').value.trim();
    if (!approve && !note) {
      $('decide-note').setAttribute('aria-invalid', 'true');
      $('decide-note-error').textContent = 'Say why, so the company knows what to fix.';
      $('decide-note-error').hidden = false;
      $('decide-note').focus();
      return;
    }
    busy = true;
    const go = $('decide-go');
    go.disabled = true;
    $('decide-state').textContent = approve ? 'Connecting…' : 'Rejecting…';
    const { ok, status, data } = await sendJSON('POST', '/api/approvals/' + approval.id + (approve ? '/approve' : '/reject'), { note });
    busy = false;
    go.disabled = false;
    $('decide-state').textContent = '';
    if (ok) {
      dlg.close();
      deciding = null;
      toast(approve ? (approval.domain || approval.workspace) + ' is connected; its first scan is queued' : 'Request rejected; the company can see your reason');
      load();
      poll();
      return;
    }
    if (status === 422 && data.fields && data.fields.note) {
      $('decide-note').setAttribute('aria-invalid', 'true');
      $('decide-note-error').textContent = data.fields.note;
      $('decide-note-error').hidden = false;
      return;
    }
    const b = $('decide-banner');
    b.textContent = data.error || 'That did not work. Try again.';
    b.hidden = false;
    if (status === 409 || status === 404) { go.disabled = true; load(); poll(); }
  });

  /* ---------- the tab ---------- */

  function show(on) {
    visible = on;
    refreshDesktopPrompts();
    if (on) load();
  }

  // Ages ("5 minutes ago") stay true while the page is open.
  setInterval(() => { if (visible && loaded && !dlg.open) render(); }, 60000);

  window.NHI.approvals = { show, focus: () => $('t-approvals').focus?.(), poll };
  poll().then(schedule);
  refreshDesktopPrompts();
})();
