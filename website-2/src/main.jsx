import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App.jsx';
import { bootTranslate } from './lib/translate.js';
import { bootMagnet, bootSmooth } from './lib/smooth.js';
import './styles.css';
import './components/viz/viz.css';
import '@fontsource-variable/geist-mono';
import './home/home.css';
import './components/promptbreak/promptbreak.css'; // scoped under .pb and .pb-pop
import './theme-light.css'; // website 2: the light theme, last so it wins // scoped under .dx; global so prerendered pages paint styled

const root = document.getElementById('root');
const app = <StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>;
if (root.firstElementChild) hydrateRoot(root, app);
else createRoot(root).render(app);

// a chosen language is applied once React owns the page, never before hydration
setTimeout(bootTranslate, 600);
// smooth scrolling starts after first paint, so it never delays the page
setTimeout(() => { bootSmooth(); bootMagnet(); }, 300);

/* For whoever opens the developer tools: a hello and a small puzzle. */
console.log('%cDeep Algorithms', 'font: 600 22px Inter, system-ui, sans-serif; color: #5b8ff5; letter-spacing: -0.02em; padding: 4px 0;');
console.log('%cYou opened the console. We like curious people.\nA small puzzle, just for fun:', 'font: 14px system-ui, sans-serif; color: #9aa0a9; line-height: 1.6;');
console.log('%cUHJlc3MgdGhlIGAga2V5IG9uIGFueSBwYWdlIG9mIHRoaXMgc2l0ZSwgdGhlbiB0eXBlOiBkZWNyeXB0', 'font: 13px ui-monospace, monospace; color: #6be3a4; background: #0c0d10; padding: 8px 10px; border-radius: 6px;');
console.log('%cHint: it is base64.', 'font: 12px system-ui, sans-serif; color: #7d838d;');
