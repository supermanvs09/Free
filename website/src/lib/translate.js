/* The language menu. English is the source; any other choice is translated in
   the browser by Google's page translator, which reads the `googtrans` cookie.
   Nothing loads from Google until a visitor picks a language, and the choice
   is kept for the next page and the next visit. */

export const LANGS = [
  ['en', 'English', 'English'],
  ['es', 'Español', 'Spanish'],
  ['fr', 'Français', 'French'],
  ['de', 'Deutsch', 'German'],
  ['pt', 'Português', 'Portuguese'],
  ['ja', '日本語', 'Japanese'],
  ['zh-CN', '简体中文', 'Chinese (Simplified)'],
];

export function getLang() {
  if (typeof document === 'undefined') return 'en';
  const m = /(?:^|;\s*)googtrans=\/en\/([a-zA-Z-]+)/.exec(document.cookie);
  return m && LANGS.some(([c]) => c === m[1]) ? m[1] : 'en';
}

function writeCookie(value, maxAge) {
  const base = `googtrans=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;
  document.cookie = base;
  // the translator may also have set it on the parent domain
  const host = location.hostname;
  if (host.includes('.') && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) document.cookie = `${base}; domain=.${host.split('.').slice(-2).join('.')}`;
}

export function setLang(code) {
  if (code === getLang()) return;
  if (code === 'en') writeCookie('', 0);
  else writeCookie(`/en/${code}`, 60 * 60 * 24 * 365);
  location.reload();
}

/* React and the translator both edit the same text nodes. When the translator
   has replaced a node React later removes, the browser would throw; these two
   guards make that a no-op, as React's own maintainers suggest. Installed only
   while a translation is on. */
function guardDom() {
  const remove = Node.prototype.removeChild;
  Node.prototype.removeChild = function guardedRemove(child) {
    if (child.parentNode !== this) return child;
    return remove.call(this, child);
  };
  const insert = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function guardedInsert(node, ref) {
    if (ref && ref.parentNode !== this) return node;
    return insert.call(this, node, ref);
  };
}

export function bootTranslate() {
  const lang = getLang();
  if (lang === 'en' || window.__gtBooted) return;
  window.__gtBooted = true;
  guardDom();
  document.documentElement.classList.add('is-translated');
  const host = document.createElement('div');
  host.id = 'gt-host';
  host.hidden = true;
  document.body.appendChild(host);
  window.__gtInit = () => {
    // eslint-disable-next-line no-new
    new window.google.translate.TranslateElement({ pageLanguage: 'en', includedLanguages: LANGS.map(([c]) => c).join(','), autoDisplay: false }, 'gt-host');
  };
  const s = document.createElement('script');
  s.src = 'https://translate.google.com/translate_a/element.js?cb=__gtInit';
  s.async = true;
  document.head.appendChild(s);
}
