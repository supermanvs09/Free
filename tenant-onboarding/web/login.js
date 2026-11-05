(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const form = $('login-form');
  const errorBox = $('login-error');
  const button = $('signin');
  let busy = false;

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  // Already signed in (another tab): nothing to do here but go on.
  fetch('/api/session').then((r) => r.json()).then((s) => {
    if (s.signed_in) location.reload();
  }).catch(() => { /* the form still works; the server answers when it is submitted */ });

  $('show').addEventListener('click', (e) => {
    const input = $('password');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    e.currentTarget.textContent = showing ? 'Show' : 'Hide';
    e.currentTarget.setAttribute('aria-pressed', String(!showing));
  });

  // A warning before they mistype, not after.
  $('password').addEventListener('keyup', (e) => {
    if (e.getModifierState) $('caps').hidden = !e.getModifierState('CapsLock');
  });
  $('password').addEventListener('blur', () => { $('caps').hidden = true; });

  for (const id of ['username', 'password']) $(id).addEventListener('input', () => { errorBox.hidden = true; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    errorBox.hidden = true;
    const username = $('username').value.trim();
    const password = $('password').value;
    if (!username || !password) {
      showError('Enter your username and password.');
      (username ? $('password') : $('username')).focus();
      return;
    }

    busy = true;
    button.disabled = true;
    button.textContent = 'Signing in…';
    let status = 0;
    let data = {};
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      status = r.status;
      try { data = await r.json(); } catch (_) { /* a proxy's error page */ }
    } catch (_) { /* offline */ }

    if (status === 200) {
      location.reload();   // the same address now serves the app (replace() would only follow the #fragment)
      return;
    }
    busy = false;
    button.disabled = false;
    button.textContent = 'Sign in';
    if (status === 0) showError('The service could not be reached. Check your connection and try again.');
    else showError(data.error || 'Something went wrong. Try again.');
    $('password').value = '';
    if (status === 401 || status === 0) $('password').focus();
  });
})();
