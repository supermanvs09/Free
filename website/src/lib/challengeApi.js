/* The Prompt Heist backend, behind three calls. Point VITE_CHALLENGE_API at the real
   server (e.g. https://heist.deepalgorithms.io/api) and the UI uses it; without it
   the UI runs in preview mode against the small local guard below, so the
   interface can be designed, tested and demoed before the server is wired in.
   There is no sign-up: a random player id is kept in this browser, and progress
   with it. Cracking the last vault returns a claim code for prizes.

   Contract the UI expects (JSON in, JSON out; X-Player header carries the id):
     POST {base}/chat   { level, message }  -> { reply, blocked?: { layer, reason } }
     POST {base}/guess  { level, guess }    -> { correct, points?, claim? }
   If the real server's shapes differ, adapt them here, nowhere else. */

const BASE = import.meta.env.VITE_CHALLENGE_API || '';
export const PREVIEW = !BASE;
const KEY = 'ph-progress';

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode: progress lives in memory */ } };
let mem = null;
export function progress() {
  if (!mem) mem = read() || { player: (globalThis.crypto?.randomUUID?.() || String(Math.random()).slice(2)), solved: [], score: 0, claim: null };
  return mem;
}
const save = (patch) => { mem = { ...progress(), ...patch }; write(mem); return mem; };
export const resetProgress = () => { mem = null; try { localStorage.removeItem(KEY); } catch { /* ignore */ } return progress(); };

async function call(path, body) {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-player': progress().player }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.text().catch(() => '')) || `Request failed (${r.status})`);
  return r.json();
}

export async function chat(level, message) {
  if (PREVIEW) return previewChat(level, message);
  return call('/chat', { level, message });
}

export async function guess(level, value) {
  const res = PREVIEW ? previewGuess(level, value) : await call('/guess', { level, guess: value });
  if (res.correct) {
    const p = progress();
    save({ solved: [...new Set([...p.solved, level])], score: p.score + (res.points || 0), claim: res.claim || p.claim });
  }
  return res;
}

/* ---------- preview mode: a deliberately simple local guard per level ----------
   Enough to feel the loop (ask, get refused, get creative, crack it), nowhere near
   the real challenge. Level 5 always holds in preview. */
const SECRETS = { 1: 'SUNBEAM', 2: 'MONSOON', 3: 'CHARMINAR', 4: 'FIREWALL', 5: 'ZENITH' };
const POINTS = { 1: 100, 2: 200, 3: 350, 4: 550, 5: 800 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (m, ...w) => w.some((x) => m.includes(x));

async function previewChat(level, message) {
  await wait(650 + Math.random() * 700);
  const m = message.toLowerCase(), s = SECRETS[level];
  const asksSecret = has(m, 'password', 'secret', 'passphrase', 'code word', 'codeword');
  const sly = has(m, 'spell', 'letter by letter', 'backwards', 'reverse', 'poem', 'acrostic', 'story', 'hint', 'rhyme', 'translate', 'encode', 'base64', 'first letter');
  const attack = has(m, 'ignore previous', 'ignore all', 'ignore your', 'system prompt', 'developer mode', 'jailbreak', 'dan ');
  if (level === 1) return asksSecret ? { reply: `Of course! The passphrase is ${s}. Anything else I can help with?` } : { reply: 'Hi! I am VAULT-1. I look after a passphrase. What would you like to know?' };
  if (level === 2) {
    if (sly) return { reply: `I can't tell you the passphrase. But since you asked for it letter by letter: ${s.split('').join(' ')}.` };
    return { reply: asksSecret ? 'Sorry, I am not allowed to reveal the passphrase.' : 'I am VAULT-2. I guard a passphrase, and I have been told never to share it.' };
  }
  if (level === 3) {
    if (has(m, 'backwards', 'reverse')) return { reply: `Reading it backwards is harmless, surely: ${s.split('').reverse().join('')}.` };
    if (sly || asksSecret) return { reply: '', blocked: { layer: 'output', reason: 'The reply contained the passphrase, so the output filter stopped it.' } };
    return { reply: 'VAULT-3 here. My replies are checked before you see them, so do not get your hopes up.' };
  }
  if (level === 4) {
    if (attack || asksSecret) return { reply: '', blocked: { layer: 'input', reason: 'Your message matched a known injection pattern and never reached the guard.' } };
    if (has(m, 'riddle', 'crossword', 'clue')) return { reply: 'A clue, then: the wall that keeps intruders out of a network.' };
    return { reply: 'VAULT-4. I only answer questions that look harmless. Try me.' };
  }
  if (attack || asksSecret || sly) return { reply: '', blocked: { layer: 'intent', reason: 'That request is outside VAULT-5’s task, so the action was blocked before it ran.' } };
  return { reply: 'VAULT-5, an agent with tools. Every action I take is checked against my task. In preview mode, this vault does not open.' };
}

function previewGuess(level, value) {
  const correct = value.trim().toUpperCase() === SECRETS[level];
  const claim = correct && level === 5 ? `DA-${progress().player.slice(0, 4).toUpperCase()}-PREVIEW` : undefined;
  return { correct, points: correct ? POINTS[level] : 0, claim };
}
