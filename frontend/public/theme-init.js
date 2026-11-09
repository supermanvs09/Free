// Applied before first paint so the shell never flashes the wrong theme.
// A file rather than an inline script, so the CSP needs no 'unsafe-inline'.
try {
  var stored = localStorage.getItem('dna.theme');
  var system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = stored === 'light' || stored === 'dark' ? stored : system;
} catch (e) {
  document.documentElement.dataset.theme = 'light';
}
