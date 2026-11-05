(() => {
  'use strict';

  const { $, el, rules, parseRegions, api, sendJSON, clearField, setFieldError } = NHI;
  const form = $('form');
  const banner = $('banner');
  const result = $('result');
  const submit = $('submit');
  const stepper = $('stepper');
  let step = 1;

  let workspace = '';   // the name the server will give this company
  let domain = '';      // and its domain

  /* ---------- helpers ---------- */

  const FIELDS = [
    'company_name', 'collector_aws_account_id', 'collector_external_id', 'collector_event_bridge_arn',
    'collector_regions', 'customer_aws_account_id', 'user_full_name', 'user_username', 'user_password',
    'user_role', 'user_department', 'user_team',
  ];

  function clearErrors() {
    banner.hidden = true;
    for (const f of FIELDS) clearField(f);
  }

  // Shows field messages; returns the first field that has one.
  function showFieldErrors(fields) {
    let first = null;
    for (const f of FIELDS) {
      const msg = fields && fields[f];
      if (!msg) continue;
      const input = setFieldError(f, msg);
      first = first || input;
    }
    return first;
  }

  function showBanner(msg) {
    banner.textContent = msg;
    banner.hidden = false;
  }

  /* ---------- workspace preview ---------- */

  let previewTimer = 0;
  let previewSeq = 0;
  function refreshPreview() {
    clearTimeout(previewTimer);
    const company = $('company_name').value.trim();
    previewTimer = setTimeout(async () => {
      const seq = ++previewSeq;
      let name = '';
      let dom = '';
      if (company) {
        try {
          const r = await fetch('/api/workspace?company=' + encodeURIComponent(company));
          if (r.ok) { const d = await r.json(); name = d.workspace || ''; dom = d.domain || ''; }
        } catch (_) { /* the preview is a convenience; submitting still works */ }
      }
      if (seq !== previewSeq) return;
      workspace = name;
      domain = dom;
      $('preview').hidden = !name;
      $('preview-name').textContent = name;
      $('user-suffix').textContent = '@' + (name || 'workspace');
      updateLogin();
      renderSummary();
    }, 250);
  }

  function updateLogin() {
    const u = $('user_username').value.trim().toLowerCase().split('@')[0] || 'name';
    $('login-preview').textContent = u + '@' + (workspace || 'workspace');
  }

  /* ---------- summary (the panel beside the form) ---------- */

  function setSummary(id, text, empty) {
    const dd = $(id);
    dd.textContent = text || empty;
    dd.classList.toggle('empty-val', !text);
  }

  function renderSummary() {
    const v = (id) => $(id).value.trim();
    const regions = parseRegions(v('collector_regions'));
    setSummary('sum-company', v('company_name').replace(/\s+/g, ' '), 'Not entered yet');
    setSummary('sum-ws', workspace, 'Created from the name');
    setSummary('sum-domain', domain, 'Created from the name');
    setSummary('sum-aws', v('collector_aws_account_id') + (v('collector_external_id') ? ' \u00b7 External ID entered' : ''), 'Not entered yet');
    setSummary('sum-regions', regions.join(', '), 'Not entered yet');
    const who = v('user_username').toLowerCase().split('@')[0];
    setSummary('sum-user', who ? who + '@' + (workspace || 'workspace') + ' \u00b7 ' + $('user_role').selectedOptions[0].textContent : '', 'None (optional)');
  }

  /* ---------- password ---------- */

  function generatePassword() {
    // No look-alike characters (0 O 1 l I); starts with a letter.
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
    const all = letters + '23456789';
    const pick = (set, bytes, i) => set[bytes[i] % set.length];
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    let out = pick(letters, bytes, 0);
    for (let i = 1; i < 18; i++) out += pick(all, bytes, i);
    return out;
  }

  /* ---------- sign-in file ---------- */

  function csvCell(value, isSecret) {
    let s = String(value == null ? '' : value);
    // A cell that starts like a formula would run in a spreadsheet. A password
    // must stay exactly as typed, so only the other cells are defused.
    if (!isSecret && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function buildFile(company, res, password, dept, team) {
    const header = ['Company', 'Workspace', 'Username', 'Password', 'Full name', 'Role', 'Department', 'Team', 'Tenant ID', 'Created at'];
    const row = [company, res.tenant.db_name, res.user.username, password, res.user.full_name, res.user.role,
      dept, team, res.tenant.tenant_id, res.user.created_at];
    const body = [header.map((h) => csvCell(h, true)), row.map((v, i) => csvCell(v, i === 3))]
      .map((r) => r.join(',')).join('\r\n') + '\r\n';
    return { name: res.tenant.db_name + '-' + res.user.username.split('@')[0] + '-signin.csv', text: '\uFEFF' + body };
  }

  function download(file) {
    const url = URL.createObjectURL(new Blob([file.text], { type: 'text/csv;charset=utf-8' }));
    const a = el('a', { href: url, download: file.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  /* ---------- steps ---------- */

  const STEP1 = ['company_name', 'collector_aws_account_id', 'collector_external_id', 'collector_event_bridge_arn',
    'collector_regions', 'customer_aws_account_id'];

  function goTo(n, focusFirst = true) {
    step = n;
    $('step-1').hidden = n !== 1;
    $('step-2').hidden = n !== 2;
    $('dot-1').className = n === 2 ? 'done' : '';
    $('dot-1').removeAttribute('aria-current');
    $('dot-2').removeAttribute('aria-current');
    $('dot-' + n).setAttribute('aria-current', 'step');
    if (focusFirst) {
      const first = n === 1 ? $('company_name') : $('user_full_name');
      first.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    }
  }

  // The same rules the server applies; the server stays the judge.
  function checkStep1() {
    const v = (id) => $(id).value.trim();
    const bad = {};
    if (v('company_name').length < 2) bad.company_name = 'Enter the company name.';
    if (!v('collector_aws_account_id')) bad.collector_aws_account_id = 'Enter the collector AWS account ID.';
    else bad.collector_aws_account_id = rules.account(v('collector_aws_account_id'));
    if (!v('collector_external_id')) bad.collector_external_id = 'Enter the collector external ID.';
    else bad.collector_external_id = rules.external(v('collector_external_id'));
    if (!v('collector_event_bridge_arn')) bad.collector_event_bridge_arn = 'Enter the collector event bus ARN.';
    else bad.collector_event_bridge_arn = rules.bus(v('collector_event_bridge_arn'));
    bad.collector_regions = rules.regions(parseRegions(v('collector_regions')));
    if (v('customer_aws_account_id')) {
      bad.customer_aws_account_id = rules.account(v('customer_aws_account_id')) && 'Must be exactly 12 digits, or leave it empty.';
    }
    for (const k of Object.keys(bad)) if (!bad[k]) delete bad[k];
    return bad;
  }

  function checkStep2() {
    const bad = {};
    if ($('user_full_name').value.trim().length < 2) bad.user_full_name = "Enter the user's full name.";
    if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test($('user_username').value.trim().toLowerCase().split('@')[0])) bad.user_username = 'Use 2-32 characters: lowercase letters, digits, dot, dash or underscore.';
    const pw = $('user_password').value;
    if (pw.length < 10) bad.user_password = 'Use at least 10 characters.';
    else if (pw.length > 72) bad.user_password = 'Use at most 72 characters.';
    return bad;
  }

  function next() {
    clearErrors();
    const bad = checkStep1();
    const first = showFieldErrors(bad);
    if (first) { first.focus(); return; }
    goTo(2);
  }

  /* ---------- result ---------- */

  const LABELS = {
    collector_aws_account_id: 'AWS account ID',
    collector_external_id: 'External ID',
    collector_event_bridge_arn: 'Event bus ARN',
    collector_regions: 'Regions',
  };

  function row(dl, label, value) {
    dl.append(el('dt', {}, label), el('dd', {}, value));
  }

  function showResult(company, res, file) {
    result.replaceChildren();
    const created = res.outcome === 'created';
    result.className = 'result' + (created ? ' ok' : '');
    result.append(
      el('h2', {}, created ? company + ' is onboarded' : company + ' is already registered'),
      el('p', {}, created
        ? 'The company is ready.'
        : 'Nothing new was added for the company. The saved details were kept.'),
    );

    const dl = el('dl');
    row(dl, 'Tenant ID', res.tenant.tenant_id);
    row(dl, 'Workspace', res.tenant.db_name);
    row(dl, 'Domain', res.tenant.domain_name);
    if (res.account_id) row(dl, 'Customer account', res.account_id);
    if (res.user) row(dl, 'Username', res.user.username);
    result.append(dl);

    if (res.incomplete) {
      result.append(el('div', { class: 'note warn' },
        'This company’s setup is incomplete. Contact engineering before anyone signs in.'));
    }
    if (res.account_note) result.append(el('div', { class: 'note' }, res.account_note));
    if (res.differences && res.differences.length) {
      const ul = el('ul');
      for (const d of res.differences) {
        ul.append(el('li', {}, (LABELS[d.field] || d.field) + ': saved “' + (d.registered || 'empty') +
          '”, you entered “' + (d.submitted || 'empty') + '”'));
      }
      result.append(el('div', { class: 'note' }, 'These entries differ from what is saved and were not applied:', ul));
    }

    const actions = el('div', { class: 'actions' });
    if (file) {
      actions.append(el('button', { type: 'button', class: 'btn ghost', onclick: () => download(file) }, 'Download sign-in details again'));
    }
    actions.append(el('a', { class: 'btn ghost', href: '#/tenants' }, 'View in tenants'));
    actions.append(el('button', { type: 'button', class: 'btn ghost', onclick: reset }, 'Onboard another company'));
    result.append(actions);
    if (file) {
      result.append(el('p', { class: 'hint' }, 'The file holds the password in plain text. Share it securely and delete it afterwards.'));
    }
    form.hidden = true;
    stepper.hidden = true;
    result.hidden = false;
    result.focus();
    result.scrollIntoView({ block: 'nearest' });
  }

  function reset() {
    form.reset();
    workspace = '';
    domain = '';
    renderSummary();
    result.hidden = true;
    result.replaceChildren();
    form.hidden = false;
    stepper.hidden = false;
    clearErrors();
    goTo(1, false);
    refreshPreview();
    $('company_name').focus();
    window.scrollTo({ top: 0 });
  }

  /* ---------- events ---------- */

  // A message goes away as soon as its field is edited.
  for (const f of FIELDS) {
    $(f).addEventListener('input', () => { clearField(f); renderSummary(); });
  }

  $('company_name').addEventListener('input', refreshPreview);
  $('user_role').addEventListener('change', renderSummary);
  $('user_username').addEventListener('input', updateLogin);

  $('make-password').addEventListener('click', () => {
    const input = $('user_password');
    input.value = generatePassword();
    input.type = 'text';
    $('show-password').textContent = 'Hide';
    $('show-password').setAttribute('aria-pressed', 'true');
  });

  $('show-password').addEventListener('click', (e) => {
    const input = $('user_password');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    e.currentTarget.textContent = showing ? 'Show' : 'Hide';
    e.currentTarget.setAttribute('aria-pressed', String(!showing));
  });

  $('next').addEventListener('click', next);
  $('back').addEventListener('click', () => { clearErrors(); goTo(1); });
  $('skip').addEventListener('click', () => send(false));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (step === 1) next(); else send(true);
  });

  async function send(withUser) {
    clearErrors();
    result.hidden = true;
    if (withUser) {
      const first = showFieldErrors(checkStep2());
      if (first) { first.focus(); return; }
    }

    const body = {
      company_name: $('company_name').value,
      collector_aws_account_id: $('collector_aws_account_id').value,
      collector_external_id: $('collector_external_id').value,
      collector_event_bridge_arn: $('collector_event_bridge_arn').value,
      collector_regions: $('collector_regions').value.split(/[\s,]+/).filter(Boolean),
      customer_aws_account_id: $('customer_aws_account_id').value,
    };
    const password = $('user_password').value;
    if (withUser) {
      body.admin_user = {
        username: $('user_username').value,
        full_name: $('user_full_name').value,
        password,
        role: $('user_role').value,
        department: $('user_department').value,
        team: $('user_team').value,
      };
    }

    submit.disabled = true;
    $('skip').disabled = true;
    submit.textContent = 'Setting up\u2026';
    const { ok, status, data } = await sendJSON('POST', '/api/onboard', body);
    submit.disabled = false;
    $('skip').disabled = false;
    submit.textContent = 'Onboard company';

    if (ok) {
      const company = body.company_name.trim().replace(/\s+/g, ' ');
      let file = null;
      if (data.user) {
        file = buildFile(company, data, password, body.admin_user.department.trim(), body.admin_user.team.trim());
        download(file);
      }
      showResult(company, data, file);
      return;
    }
    if (status === 401) {
      showBanner(data.error || 'Your session has ended. Sign in again.');
      return;
    }
    showBanner(status === 0
      ? data.error + ' Nothing was saved unless you see a confirmation.'
      : data.error || 'Something went wrong. Try again.');
    const first = showFieldErrors(data.fields);
    if (first) {
      goTo(STEP1.includes(first.id) ? 1 : 2, false);
      first.focus();
    } else {
      banner.scrollIntoView({ block: 'nearest' });
    }
  }
  renderSummary();
  NHI.onboard = { focus: () => (form.hidden ? result : $('company_name')).focus({ preventScroll: true }) };
})();
