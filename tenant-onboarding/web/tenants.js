/* The Tenants tab: list every company, search and sort, edit the details that
   can change. Edits go to the tenants table only. */
(() => {
  'use strict';

  const { $, el, rules, parseRegions, api, sendJSON, toast, copy, clearField, setFieldError } = NHI;

  let tenants = [];
  let loaded = false;
  let query = '';
  let sort = { key: 'created', dir: 'desc' };
  let editing = null;   // the company as it was when the dialog opened
  let original = null;  // its editable values, as text
  let saving = false;
  let flashId = '';

  const dlg = $('edit');
  const body = $('tenants-body');
  const FIELDS = ['domain_name', 'collector_aws_account_id', 'collector_external_id', 'collector_event_bridge_arn', 'collector_regions'];
  const LABELS = {
    domain_name: 'Domain', collector_aws_account_id: 'AWS account ID', collector_external_id: 'External ID',
    collector_event_bridge_arn: 'Event bus ARN', collector_regions: 'Regions',
  };

  /* ---------- reading the list ---------- */

  // One request at a time: opening the tab and the first-screen count both ask.
  let pending = null;
  function load() {
    if (!pending) pending = fetchList().finally(() => { pending = null; });
    return pending;
  }

  async function fetchList() {
    $('tenants-banner').hidden = true;
    if (!loaded) renderLoading();
    $('refresh').disabled = true;
    const { ok, status, data } = await api('/api/tenants');
    $('refresh').disabled = false;
    if (!ok) {
      if (!loaded) body.replaceChildren();
      $('tenants-empty').hidden = true;
      showListError(data.error || 'The companies could not be loaded.');
      return;
    }
    tenants = data.tenants || [];
    loaded = true;
    render();
  }

  function showListError(message) {
    const b = $('tenants-banner');
    b.replaceChildren(el('span', {}, message + ' '), el('button', { type: 'button', class: 'btn link', onclick: load }, 'Try again'));
    b.hidden = false;
  }

  function renderLoading() {
    $('tenants-empty').hidden = true;
    $('table-wrap').hidden = false;
    body.replaceChildren(...[0, 1, 2].map(() => el('tr', { class: 'skeleton', 'aria-hidden': 'true' },
      ...[0, 1, 2, 3, 4, 5, 6].map(() => el('td', {}, el('span', { class: 'bar' }))))));
    $('tenants-count').textContent = 'Loading…';
  }

  /* ---------- showing it ---------- */

  const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
  const dateTimeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  function legacyFields(t) {
    const bad = [];
    if (t.domain_name && rules.domain(t.domain_name.toLowerCase())) bad.push(LABELS.domain_name);
    if (t.collector_aws_account_id && rules.account(t.collector_aws_account_id)) bad.push(LABELS.collector_aws_account_id);
    if (t.collector_external_id && rules.external(t.collector_external_id)) bad.push(LABELS.collector_external_id);
    if (t.collector_event_bridge_arn && rules.bus(t.collector_event_bridge_arn)) bad.push(LABELS.collector_event_bridge_arn);
    return bad;
  }

  function matches(t, q) {
    if (!q) return true;
    return [t.db_name, t.domain_name, t.tenant_id, t.collector_aws_account_id].some((v) => (v || '').toLowerCase().includes(q));
  }

  function ordered(list) {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort.key === 'name') return dir * a.db_name.localeCompare(b.db_name);
      const ta = a.created_at ? Date.parse(a.created_at) : null;
      const tb = b.created_at ? Date.parse(b.created_at) : null;
      if (ta === tb) return a.db_name.localeCompare(b.db_name);
      if (ta == null) return 1;   // companies with no date always go last
      if (tb == null) return -1;
      return dir * (ta - tb);
    });
  }

  const dash = (text) => el('span', { class: 'none' }, text || 'Not set');

  function busLabel(arn) {
    const m = /^arn:aws[a-z-]*:events:([a-z0-9-]+):\d{12}:event-bus\/(.+)$/.exec(arn || '');
    return m ? el('span', { title: arn }, m[2], el('span', { class: 'sub' }, ' ' + m[1])) : el('span', { title: arn, class: 'clip' }, arn);
  }

  function mask(v) {
    return v.length > 12 ? v.slice(0, 4) + '••••' + v.slice(-4) : '••••••';
  }

  function row(t) {
    const regions = t.collector_regions || [];
    const tr = el('tr', { 'data-id': t.tenant_id, class: t.tenant_id === flashId ? 'flash' : '' },
      el('td', { 'data-label': 'Company', class: 'company' },
        el('div', { class: 'name' }, t.db_name),
        el('div', { class: 'sub' }, t.domain_name || 'No domain'),
        el('div', { class: 'idline' },
          el('code', { title: t.tenant_id }, t.tenant_id.slice(0, 8)),
          el('button', { type: 'button', class: 'mini', 'aria-label': 'Copy tenant ID of ' + t.db_name, onclick: () => copy(t.tenant_id, 'Tenant ID') }, 'Copy ID'))),
      el('td', { 'data-label': 'AWS account' }, t.collector_aws_account_id ? el('span', { class: 'mono' }, t.collector_aws_account_id) : dash()),
      el('td', { 'data-label': 'External ID' }, t.collector_external_id
        ? el('span', { class: 'idline' }, el('code', {}, mask(t.collector_external_id)),
          el('button', { type: 'button', class: 'mini', 'aria-label': 'Copy External ID of ' + t.db_name, onclick: () => copy(t.collector_external_id, 'External ID') }, 'Copy'))
        : dash()),
      el('td', { 'data-label': 'Event bus' }, t.collector_event_bridge_arn ? busLabel(t.collector_event_bridge_arn) : dash()),
      el('td', { 'data-label': 'Regions' }, regions.length
        ? el('span', { class: 'chips' }, ...regions.slice(0, 3).map((r) => el('span', { class: 'chip' }, r)),
          regions.length > 3 ? el('span', { class: 'chip more', title: regions.slice(3).join(', ') }, '+' + (regions.length - 3)) : null)
        : dash()),
      el('td', { 'data-label': 'Created' }, t.created_at
        ? el('span', { title: dateTimeFmt.format(new Date(t.created_at)) }, dateFmt.format(new Date(t.created_at)))
        : dash('—')),
      el('td', { class: 'act' }, el('button', { type: 'button', class: 'btn ghost sm', 'aria-label': 'Edit ' + t.db_name, onclick: () => openEdit(t) }, 'Edit')));
    return tr;
  }

  function render() {
    const q = query.trim().toLowerCase();
    const shown = ordered(tenants.filter((t) => matches(t, q)));
    $('nav-count').textContent = String(tenants.length);
    $('nav-count').hidden = false;
    $('tenants-count').textContent = q
      ? shown.length + ' of ' + tenants.length + (tenants.length === 1 ? ' company' : ' companies')
      : tenants.length + (tenants.length === 1 ? ' company' : ' companies');
    for (const th of document.querySelectorAll('#tenants-table th')) {
      const b = th.querySelector('.sort');
      if (b) th.setAttribute('aria-sort', b.dataset.sort === sort.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    }

    const empty = $('tenants-empty');
    $('table-wrap').hidden = shown.length === 0;
    if (shown.length === 0) {
      empty.replaceChildren(...(tenants.length === 0
        ? [el('h2', {}, 'No companies yet'), el('p', {}, 'Onboard the first company to see it here.'), el('a', { class: 'btn primary', href: '#/onboard' }, 'Onboard company')]
        : [el('h2', {}, 'No company matches “' + query.trim() + '”'), el('p', {}, 'Check the spelling, or search by domain or tenant ID.'),
          el('button', { type: 'button', class: 'btn ghost', onclick: () => { $('search').value = ''; query = ''; render(); $('search').focus(); } }, 'Clear search')]));
      empty.hidden = false;
    } else {
      empty.hidden = true;
    }
    body.replaceChildren(...shown.map(row));
    if (flashId) {
      const f = body.querySelector('tr.flash');
      if (f) f.scrollIntoView({ block: 'nearest' });
      flashId = '';
    }
  }

  /* ---------- editing ---------- */

  function valuesOf(t) {
    return {
      domain_name: t.domain_name || '',
      collector_aws_account_id: t.collector_aws_account_id || '',
      collector_external_id: t.collector_external_id || '',
      collector_event_bridge_arn: t.collector_event_bridge_arn || '',
      collector_regions: (t.collector_regions || []).join(', '),
    };
  }

  const input = (f) => $('edit_' + f);

  function current() {
    const v = {};
    for (const f of FIELDS) v[f] = input(f).value.trim();
    v.domain_name = v.domain_name.toLowerCase();
    return v;
  }

  // Fields whose text differs from what was loaded. Regions compare as lists, so
  // reordering spaces or case is not a change.
  function changedFields() {
    const now = current();
    return FIELDS.filter((f) => (f === 'collector_regions'
      ? parseRegions(now[f]).join(',') !== parseRegions(original[f]).join(',')
      : now[f] !== original[f].trim()));
  }

  function updateState() {
    const changed = changedFields();
    const external = changed.includes('collector_external_id');
    $('edit_collector_external_id-warn').hidden = !external;
    if (!external) $('confirm-external').checked = false;
    const needsConfirm = external && !$('confirm-external').checked;
    $('edit-save').disabled = saving || changed.length === 0 || needsConfirm;
    $('edit-state').textContent = changed.length === 0
      ? 'No changes yet'
      : needsConfirm ? 'Tick “I understand” to save the External ID change'
        : changed.length + (changed.length === 1 ? ' change' : ' changes') + ' to save';
  }

  function openEdit(t) {
    editing = t;
    original = valuesOf(t);
    saving = false;
    $('edit-title').textContent = 'Edit ' + t.db_name;
    $('edit-sub').textContent = t.created_at ? 'Registered ' + dateFmt.format(new Date(t.created_at)) : t.domain_name || '';
    $('edit-id').textContent = t.tenant_id;
    $('edit-ws').textContent = t.db_name;
    $('edit-banner').hidden = true;
    for (const f of FIELDS) { input(f).value = original[f]; clearField('edit_' + f); }
    $('confirm-external').checked = false;
    $('edit-save').textContent = 'Save changes';
    const old = legacyFields(t);
    if (old.length) {
      $('edit-banner').textContent = old.join(' and ') + (old.length === 1 ? " doesn't" : " don't") +
        ' meet the current rules. Update ' + (old.length === 1 ? 'it' : 'them') + ' to save any change to this company.';
      $('edit-banner').className = 'banner info';
      $('edit-banner').hidden = false;
    }
    updateState();
    if (!dlg.open) dlg.showModal();
    input('domain_name').focus();
  }

  function closeEdit() {
    if (dlg.open) dlg.close();
    editing = null;
  }

  function tryClose() {
    if (saving) return;
    if (editing && changedFields().length && !window.confirm('Discard your changes?')) return;
    closeEdit();
  }

  function editError(message, extra) {
    const b = $('edit-banner');
    b.className = 'banner';
    b.replaceChildren(...[el('span', {}, message + ' '), extra].filter(Boolean));
    b.hidden = false;
    b.scrollIntoView({ block: 'nearest' });
  }

  function validate(changed) {
    const now = current();
    const bad = {};
    const check = {
      domain_name: rules.domain,
      collector_aws_account_id: rules.account,
      collector_external_id: rules.external,
      collector_event_bridge_arn: rules.bus,
      collector_regions: (v) => rules.regions(parseRegions(v)),
    };
    for (const f of FIELDS) {
      const v = now[f];
      const was = original[f].trim();
      if (!v) {
        if (was) bad[f] = 'Enter a value. A saved detail can’t be left empty.';
      } else if (check[f](v)) {
        bad[f] = changed.includes(f) || f === 'collector_regions' ? check[f](v) : 'This saved value is in an old format. Update it too, then save.';
      }
    }
    return bad;
  }

  async function save() {
    if (saving || !editing) return;
    const changed = changedFields();
    if (!changed.length) return;
    $('edit-banner').hidden = true;
    for (const f of FIELDS) clearField('edit_' + f);

    const bad = validate(changed);
    const keys = FIELDS.filter((f) => bad[f]);
    if (keys.length) {
      let first = null;
      for (const f of keys) { const i = setFieldError('edit_' + f, bad[f]); first = first || i; }
      editError('Check the highlighted fields.');
      first.focus();
      return;
    }

    const now = current();
    const wire = (src, f) => (f === 'collector_regions' ? parseRegions(src[f]) : src[f]);
    const payload = { expected: {}, changes: {} };
    for (const f of changed) { payload.expected[f] = wire(original, f); payload.changes[f] = wire(now, f); }

    saving = true;
    $('edit-save').disabled = true;
    $('edit-cancel').disabled = true;
    $('edit-x').disabled = true;
    $('edit-save').textContent = 'Saving…';
    const { ok, status, data } = await sendJSON('PATCH', '/api/tenants/' + encodeURIComponent(editing.tenant_id), payload);
    saving = false;
    $('edit-cancel').disabled = false;
    $('edit-x').disabled = false;
    $('edit-save').textContent = 'Save changes';

    if (ok) {
      const saved = data.tenant;
      const i = tenants.findIndex((t) => t.tenant_id === saved.tenant_id);
      if (i >= 0) tenants[i] = saved;
      flashId = saved.tenant_id;
      closeEdit();
      render();
      const again = body.querySelector('tr[data-id="' + saved.tenant_id + '"] .btn');
      if (again) again.focus({ preventScroll: true });   // the old button was replaced; keep keyboard users where they were
      toast(data.changed && data.changed.length ? 'Saved changes to ' + saved.db_name : 'Nothing needed saving for ' + saved.db_name);
      return;
    }
    updateState();
    if (status === 401) { editError(data.error); return; }
    if (data.code === 'stale' || data.code === 'not_found') {
      editError(data.error, el('button', { type: 'button', class: 'btn link', onclick: reloadEdit }, data.code === 'stale' ? 'Load the latest' : 'Refresh the list'));
      return;
    }
    let first = null;
    for (const f of FIELDS) if (data.fields && data.fields[f]) { const i = setFieldError('edit_' + f, data.fields[f]); first = first || i; }
    editError(status === 0 ? data.error + ' Nothing was saved unless you see a confirmation.' : data.error || 'Something went wrong. Try again.');
    if (first) first.focus();
  }

  async function reloadEdit() {
    const id = editing && editing.tenant_id;
    await load();
    const fresh = tenants.find((t) => t.tenant_id === id);
    if (fresh) { openEdit(fresh); toast('Loaded the latest details'); } else { closeEdit(); }
  }

  /* ---------- deleting ---------- */

  const del = $('del');
  let deleting = null;      // the company being deleted
  let deleteBusy = false;

  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  function delBanner(message, extra) {
    const b = $('del-banner');
    b.replaceChildren(...[el('span', {}, message + ' '), extra].filter(Boolean));
    b.hidden = false;
  }

  async function openDelete() {
    if (!editing || deleteBusy) return;
    deleting = editing;
    deleteBusy = false;
    $('del-sub').textContent = deleting.db_name;
    $('del-name').textContent = $('del-name2').textContent = deleting.db_name;
    $('del-banner').hidden = true;
    $('del-main').hidden = true;
    $('del-loading').hidden = false;
    $('del-confirm').value = '';
    clearField('del-confirm');
    $('del-go').disabled = true;
    $('del-state').textContent = '';
    del.showModal();

    const { ok, status, data } = await api('/api/tenants/' + encodeURIComponent(deleting.tenant_id) + '/delete-preview');
    $('del-loading').hidden = true;
    if (!ok) {
      delBanner(status === 404 ? 'This company no longer exists.' : data.error || 'Could not check what would be deleted. Nothing was deleted.',
        status === 404 ? el('button', { type: 'button', class: 'btn link', onclick: () => { closeDelete(true); closeEdit(); load(); } }, 'Refresh the list') : null);
      return;
    }
    const items = [el('li', {}, 'The company record')];
    items.push(el('li', {}, data.users
      ? plural(data.users, 'user', 'users') + ' (they can no longer sign in)'
      : 'No users'));
    items.push(el('li', {}, data.workspace_exists
      ? 'The company\u2019s workspace and everything in it' +
        (data.accounts ? ', including ' + plural(data.accounts, 'connected AWS account', 'connected AWS accounts') : '')
      : 'No workspace exists for this company, so there is nothing more to remove'));
    $('del-list').replaceChildren(...items);
    $('del-main').hidden = false;
    $('del-confirm').focus();
  }

  function closeDelete(force) {
    if (deleteBusy && !force) return;
    if (del.open) del.close();
    deleting = null;
  }

  function updateDeleteState() {
    const match = deleting && $('del-confirm').value.trim() === deleting.db_name;
    $('del-go').disabled = deleteBusy || !match;
    $('del-state').textContent = $('del-confirm').value && !match ? 'The name does not match yet' : '';
  }

  async function confirmDelete() {
    if (deleteBusy || !deleting || $('del-go').disabled) return;
    deleteBusy = true;
    $('del-banner').hidden = true;
    $('del-go').disabled = true;
    $('del-cancel').disabled = true;
    $('del-x').disabled = true;
    $('del-go').textContent = 'Deleting\u2026';
    const target = deleting;
    const { ok, status, data } = await sendJSON('DELETE', '/api/tenants/' + encodeURIComponent(target.tenant_id), { confirm: $('del-confirm').value.trim() });
    deleteBusy = false;
    $('del-cancel').disabled = false;
    $('del-x').disabled = false;
    $('del-go').textContent = 'Delete company';

    if (ok) {
      tenants = tenants.filter((x) => x.tenant_id !== target.tenant_id);
      closeDelete(true);
      closeEdit();
      render();
      toast('Deleted ' + target.db_name);
      return;
    }
    updateDeleteState();
    if (status === 404) {
      tenants = tenants.filter((x) => x.tenant_id !== target.tenant_id);
      delBanner('This company was already deleted.', el('button', { type: 'button', class: 'btn link', onclick: () => { closeDelete(true); closeEdit(); render(); } }, 'Close'));
      return;
    }
    if (data.fields && data.fields.confirm) { setFieldError('del-confirm', data.fields.confirm); }
    delBanner(status === 0 ? data.error + ' Check the Tenants list before trying again.' : data.error || 'Something went wrong and nothing was deleted.');
  }

  $('delete-open').addEventListener('click', openDelete);
  $('del-confirm').addEventListener('input', () => { clearField('del-confirm'); updateDeleteState(); });
  $('del-form').addEventListener('submit', (e) => { e.preventDefault(); confirmDelete(); });
  $('del-cancel').addEventListener('click', () => closeDelete());
  $('del-x').addEventListener('click', () => closeDelete());
  del.addEventListener('cancel', (e) => { e.preventDefault(); closeDelete(); });
  del.addEventListener('click', (e) => { if (e.target === del) closeDelete(); });

  /* ---------- wiring ---------- */

  $('search').addEventListener('input', (e) => { query = e.target.value; render(); });
  $('refresh').addEventListener('click', load);
  // "/" jumps to search, as in most consoles.
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || $('view-tenants').hidden || dlg.open) return;
    if (/^(input|textarea|select)$/i.test(document.activeElement.tagName)) return;
    e.preventDefault();
    $('search').focus();
  });
  for (const b of document.querySelectorAll('.sort')) {
    b.addEventListener('click', () => {
      const key = b.dataset.sort;
      sort = { key, dir: sort.key === key ? (sort.dir === 'asc' ? 'desc' : 'asc') : (key === 'name' ? 'asc' : 'desc') };
      render();
    });
  }
  for (const f of FIELDS) {
    input(f).addEventListener('input', () => {
      clearField('edit_' + f);
      // An old error message would be wrong the moment the person starts fixing things.
      if (!$('edit-banner').classList.contains('info')) $('edit-banner').hidden = true;
      updateState();
    });
  }
  $('confirm-external').addEventListener('change', updateState);
  $('edit-form').addEventListener('submit', (e) => { e.preventDefault(); save(); });
  $('edit-cancel').addEventListener('click', tryClose);
  $('edit-x').addEventListener('click', tryClose);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); tryClose(); });   // Escape
  dlg.addEventListener('click', (e) => { if (e.target === dlg) tryClose(); });   // the dimmed backdrop

  NHI.tenants = { load, loaded: () => loaded, focus: () => $('search').focus({ preventScroll: true }) };
})();
