/* Small helpers shared by the two pages. No framework, no network except /api. */
window.NHI = (() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // el('div', {class: 'x'}, 'text', childNode) builds DOM without innerHTML, so
  // nothing a server sends can ever become markup.
  function el(tag, props, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids) if (kid != null && kid !== false) node.append(kid);
    return node;
  }

  /* ---------- the rules (the server applies the same ones) ---------- */

  const rules = {
    domain: (v) => (v.length > 255 || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(v)
      ? 'Use a lowercase domain with a dot, such as acme-corp.nhi.local.' : ''),
    account: (v) => (/^[0-9]{12}$/.test(v) ? '' : 'Must be exactly 12 digits.'),
    external: (v) => (/^[A-Za-z0-9+=,.@:/_-]{16,255}$/.test(v) ? '' : 'Use 16-255 characters: letters, digits and + = , . @ : / _ -'),
    bus: (v) => (v.length <= 320 && /^arn:aws[a-z-]*:events:[a-z0-9-]+:[0-9]{12}:event-bus\/[.\-_A-Za-z0-9]+$/.test(v)
      ? '' : 'Must look like arn:aws:events:ap-south-1:123456789012:event-bus/default'),
    regions: (list) => {
      if (!list.length) return 'Enter at least one region, for example ap-south-1.';
      const bad = list.find((r) => !/^[a-z]{2}(-[a-z0-9]+)+-[0-9]$/.test(r));
      return bad ? '“' + bad + '” is not a region such as ap-south-1.' : '';
    },
  };

  // "ap-south-1, US-east-1  ap-south-1" -> ["ap-south-1", "us-east-1"]
  function parseRegions(text) {
    const out = [];
    for (const r of String(text).toLowerCase().split(/[\s,]+/)) if (r && !out.includes(r)) out.push(r);
    return out;
  }

  /* ---------- network ---------- */

  // Resolves to {ok, status, data}. Never throws: a dead network is an answer too.
  async function api(path, options) {
    try {
      const r = await fetch(path, options);
      let data = {};
      try { data = await r.json(); } catch (_) { /* a proxy's error page */ }
      // The session ended (signed out elsewhere, idle too long): tell the whole page once.
      if (r.status === 401 && data.code === 'session') window.dispatchEvent(new Event('nhi-session-ended'));
      return { ok: r.ok, status: r.status, data };
    } catch (_) {
      return { ok: false, status: 0, data: { error: 'The service could not be reached. Check your connection and try again.' } };
    }
  }

  function sendJSON(method, path, body) {
    return api(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  /* ---------- feedback ---------- */

  let toastTimer = 0;
  function toast(message) {
    const t = $('toast');
    t.textContent = message;
    // A popover sits in the top layer, so the message stays visible above an open dialog.
    try { if (!t.matches(':popover-open')) t.showPopover(); } catch (_) { t.hidden = false; }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { try { t.hidePopover(); } catch (_) { t.hidden = true; } }, 4500);
  }

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      // Plain http (an internal host) has no clipboard API: fall back.
      const ta = el('textarea', { 'aria-hidden': 'true', style: 'position:fixed;opacity:0' });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) { /* ignore */ }
      ta.remove();
      if (!ok) { toast('Copy failed. Select the text and copy it by hand.'); return; }
    }
    toast((label || 'Copied') + ' copied');
  }

  /* ---------- field messages ---------- */

  // prefix is '' for the onboarding form and 'edit_' for the edit dialog.
  function clearField(id) {
    const input = $(id);
    if (input) input.removeAttribute('aria-invalid');
    const p = $(id + '-error');
    if (p) p.hidden = true;
  }

  function setFieldError(id, message) {
    const input = $(id);
    const p = $(id + '-error');
    if (!input || !p) return null;
    input.setAttribute('aria-invalid', 'true');
    p.textContent = message;
    p.hidden = false;
    return input;
  }

  return { $, el, rules, parseRegions, api, sendJSON, toast, copy, clearField, setFieldError };
})();
