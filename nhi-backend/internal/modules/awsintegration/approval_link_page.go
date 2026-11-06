package awsintegration

// approvalPageHTML is the page an approval e-mail links to. "__NONCE__" is
// replaced per response (the page's Content-Security-Policy allows only scripts
// and styles carrying it). The token is read from the URL fragment, then taken
// out of the address bar; everything shown is set with textContent, never
// innerHTML.
const approvalPageHTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Review connection request</title>
<style nonce="__NONCE__">
:root{color-scheme:light dark;--bg:#f6f8fb;--card:#fff;--ink:#0f172a;--ink2:#475569;--line:#dbe3ee;--brand:#1668b0;--ok:#146c43;--onok:#fff;--bad:#b42318;--warn:#b45309}
@media (prefers-color-scheme:dark){:root{--bg:#0b1220;--card:#111a2b;--ink:#e6edf7;--ink2:#9fb0c8;--line:#26334a;--brand:#5aa7ee;--ok:#4cc38a;--onok:#04210f;--bad:#ff8a80;--warn:#f0b35a}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:640px;margin:0 auto;padding:32px 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:24px}
h1{font-size:20px;line-height:1.3;margin:0 0 4px}
.sub{color:var(--ink2);margin:0 0 20px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:8px 16px;margin:0 0 8px}
dt{color:var(--ink2)}
dd{margin:0;overflow-wrap:anywhere}
code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace}
label{display:block;font-weight:600;margin:20px 0 6px}
textarea{width:100%;min-height:84px;padding:10px;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit;font:inherit}
.row{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px}
button{font:inherit;font-weight:600;padding:10px 18px;border-radius:8px;border:1px solid transparent;cursor:pointer}
button:focus-visible,textarea:focus-visible{outline:3px solid var(--brand);outline-offset:2px}
.approve{background:var(--ok);color:var(--onok)}
.reject{background:transparent;color:var(--bad);border-color:var(--bad)}
button[disabled]{opacity:.6;cursor:default}
.msg{padding:12px 14px;border-radius:8px;border:1px solid var(--line);margin:0 0 16px}
.msg.ok{border-color:var(--ok)}.msg.bad{border-color:var(--bad)}.msg.warn{border-color:var(--warn)}
.msg strong{display:block}
.err{color:var(--bad);margin:6px 0 0;min-height:1.4em}
.hint{color:var(--ink2);font-size:13px;margin:16px 0 0}
@media (max-width:480px){dl{grid-template-columns:1fr;gap:0}dt{margin-top:8px}}
</style>
</head>
<body>
<main>
<div class="card" id="card" role="region" aria-label="Connection request" aria-live="polite"><p class="sub">Loading the request…</p></div>
<noscript><p class="msg warn">This page needs JavaScript. Decide the request in the tenant-onboarding tool instead.</p></noscript>
</main>
<script nonce="__NONCE__">
(function () {
  'use strict';
  var card = document.getElementById('card');
  var token = '';
  var base = location.pathname.replace(/\/$/, '');
  function tokenInAddress() { return new URLSearchParams(location.hash.replace(/^#/, '')).get('t') || ''; }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function show() {
    while (card.firstChild) card.removeChild(card.firstChild);
    for (var i = 0; i < arguments.length; i++) card.appendChild(arguments[i]);
  }
  function notice(kind, title, body) {
    var box = el('div', 'msg ' + kind);
    box.appendChild(el('strong', '', title));
    if (body) box.appendChild(el('span', '', body));
    return box;
  }
  function when(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString();
  }
  function post(path, body) {
    return fetch(base + path, {
      method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) { j.httpStatus = res.status; return j; });
    });
  }
  function problem(j) {
    var title = { LINK_INVALID: 'This link is not valid', LINK_EXPIRED: 'This link has expired', LINK_USED: 'This link was already used',
      ALREADY_DECIDED: 'Already decided', RATE_LIMITED: 'Too many attempts' }[j.error] || 'Something went wrong';
    var body = j.message || 'Try again, or use the tenant-onboarding tool.';
    if (j.error === 'ALREADY_DECIDED' && j.data) body = 'This request was already ' + j.data.status + (j.data.by ? ' by ' + j.data.by : '') + '. Nothing was changed.';
    return notice(j.error === 'ALREADY_DECIDED' ? 'warn' : 'bad', title, body);
  }
  function fact(list, name, value, mono) {
    list.appendChild(el('dt', '', name));
    var dd = el('dd');
    dd.appendChild(mono ? el('code', '', value) : document.createTextNode(value));
    list.appendChild(dd);
  }

  function render(d) {
    var r = d.request;
    var title = el('h1', '', 'Review connection request');
    var sub = el('p', 'sub', 'A company asked to connect an AWS account. This link is for ' + d.email + '.');
    var facts = el('dl');
    fact(facts, 'Company', r.domain || r.workspace);
    fact(facts, 'AWS account', r.account_id, true);
    fact(facts, 'Role', r.role_arn || 'Not recorded', !!r.role_arn);
    fact(facts, 'Regions', r.regions.length ? r.regions.join(', ') : 'Not set');
    fact(facts, 'Requested', 'by ' + (r.requested_by || 'unknown') + ' on ' + when(r.requested_at));
    var what = el('p', 'hint', 'Its role can be assumed and can read the account. Approving lets adapID start checking for its events; the account connects, and its first scan starts, when the first event arrives.');

    var noteLabel = el('label', '', 'Note');
    noteLabel.setAttribute('for', 'note');
    var note = el('textarea');
    note.id = 'note';
    note.maxLength = 1000;
    note.setAttribute('aria-describedby', 'noteHelp');
    var noteHelp = el('p', 'hint', 'Optional when approving. Required when rejecting: the company sees it, so say what to change.');
    noteHelp.id = 'noteHelp';
    var err = el('p', 'err');
    err.setAttribute('role', 'alert');
    var approve = el('button', 'approve', 'Approve');
    var reject = el('button', 'reject', 'Reject');
    approve.type = reject.type = 'button';

    function decide(decision) {
      var text = note.value.trim();
      if (decision === 'reject' && !text) {
        err.textContent = 'Say why you are rejecting it, so the company knows what to fix.';
        note.focus();
        return;
      }
      err.textContent = '';
      approve.disabled = reject.disabled = true;
      post('/decide', { token: token, decision: decision, note: text }).then(function (j) {
        if (j.success) {
          show(notice('ok', decision === 'approve' ? 'Approved' : 'Rejected',
            decision === 'approve' ? 'The company’s events check starts now. The account connects when its first event arrives.'
              : 'The company can see your reason and can fix the setup and ask again.'));
          return;
        }
        if (j.error === 'NOTE_REQUIRED' || j.error === 'NOTE_TOO_LONG') {
          err.textContent = j.message; approve.disabled = reject.disabled = false; note.focus();
          return;
        }
        show(problem(j));
      }).catch(function () {
        approve.disabled = reject.disabled = false;
        err.textContent = 'Could not reach the server. Try again.';
      });
    }
    approve.addEventListener('click', function () { decide('approve'); });
    reject.addEventListener('click', function () { decide('reject'); });

    var row = el('div', 'row');
    row.appendChild(approve);
    row.appendChild(reject);
    var expires = el('p', 'hint', 'This link works once and expires ' + when(d.expires_at) + '. Do not forward it.');
    show(title, sub, facts, what, noteLabel, note, noteHelp, err, row, expires);
    approve.focus({ preventScroll: true });
  }

  function load() {
  if (!token) { show(problem({ error: 'LINK_INVALID', message: 'Open the link from the e-mail again.' })); return; }
  post('/lookup', { token: token }).then(function (j) {
    if (!j.success) { show(problem(j)); return; }
    var d = j.data;
    if (d.state === 'open') { render(d); return; }
    if (d.state === 'decided') {
      show(el('h1', '', 'Connection request'),
        notice('warn', 'Already ' + d.decision.status,
          'This request was ' + d.decision.status + (d.decision.by ? ' by ' + d.decision.by : '') + (d.decision.at ? ' on ' + when(d.decision.at) : '') + '. Nothing was changed.'));
      return;
    }
    show(problem({ error: d.state === 'expired' ? 'LINK_EXPIRED' : 'LINK_USED',
      message: d.state === 'expired' ? 'This link has expired. Decide the request in the tenant-onboarding tool.' : 'This link was already used.' }));
  }).catch(function () {
    show(notice('bad', 'Could not load the request', 'Check your connection and open the link again.'));
  });
  }

  // The token is a secret: take it out of the address bar and the history.
  function begin() {
    token = tokenInAddress();
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    load();
  }
  // Another link opened in this same tab only changes the fragment.
  window.addEventListener('hashchange', function () { if (tokenInAddress()) begin(); });
  begin();
})();
</script>
</body>
</html>
`
