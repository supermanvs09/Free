/* Promptbreak client. Every call the challenge UI makes goes through here,
   so wiring up the real backend means replacing the bodies of these
   functions and nothing else.

   Until then it runs in PRACTICE mode, entirely in the browser:
   - the "account" and progress live in localStorage;
   - guardians answer from canned lines, and only level 1 can be cracked,
     with a practice password, so players can feel the flow end to end;
   - the leaderboard returns the labelled sample rows.
   Nothing here is sent anywhere. */
import { LEVELS, SAMPLE_BOARD } from '../data/promptbreak.js';

export const MODE = 'practice'; // 'live' once the backend is connected

const KEY = 'pb-session-v1';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const write = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } return s; };

export function getSession() { return read(); }

export async function signIn({ handle, email }) {
  await wait(500);
  const prev = read();
  return write({ handle: handle.trim(), email: email.trim(), cracked: prev?.cracked || [], used: prev?.used || {}, joined: prev?.joined || Date.now() });
}

export function signOut() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

export function score(s) {
  return (s?.cracked || []).reduce((t, n) => t + (LEVELS.find((l) => l.n === n)?.pts || 0), 0);
}

/* the practice guardians: a few lines each, never the real thing */
const LINES = {
  1: ['Hi! I am the intern. I am guarding something, but I am not supposed to say what.', 'Ooh, I would love to help. What do you need?', 'I was told to keep a secret today. It is a bit exciting, honestly.'],
  2: ['I follow the rules. Rule one: no passwords.', 'That sounds like a request for the password. Denied, very politely.', 'I cannot help with that, but I can tell you a fact about rules.'],
  3: ['Let me check my reply before I send it… all clear, nothing to see.', 'I would answer that, but my reply checker said no.', 'Sure! The answer is ████████. Oh, that got blanked.'],
  4: ['The bouncer let your message in. I still do not feel like sharing.', 'Hmm, the bouncer flagged that one. Try again?', 'Welcome in. Now, what were you hoping to get?'],
  5: ['I do not discuss certain words. You know the ones.', 'Let us talk about anything else. Weather? Cricket?', 'That word makes me nervous. Next question.'],
  6: ['Nice try with the clever format. I only speak plain English, and plainly: no.', 'Spelling games? I see what you are doing.', 'Translations are blocked here. Even into Klingon.'],
  7: ['Zenstra policy reviewed that request: blocked, outside my task.', 'Every reply I send is checked first. This one would not pass.', 'Decision recorded. Your request did not match my declared task.'],
};
const PRACTICE_PASSWORD = { 1: 'SUNFLOWER' };

export async function send(level, text, history) {
  await wait(700 + Math.random() * 600);
  const t = text.toLowerCase();
  if (level === 1 && /(password|secret|word you|guard)/.test(t)) {
    return { role: 'bot', text: `Oh! Since you asked nicely: the password is ${PRACTICE_PASSWORD[1]}. Please do not tell my manager.` };
  }
  const pool = LINES[level] || LINES[1];
  const n = history.filter((m) => m.role === 'bot').length;
  return { role: 'bot', text: pool[n % pool.length] };
}

export async function submit(level, guess) {
  await wait(500);
  const s = read();
  const ok = PRACTICE_PASSWORD[level] && guess.trim().toUpperCase() === PRACTICE_PASSWORD[level];
  if (ok && s && !s.cracked.includes(level)) write({ ...s, cracked: [...s.cracked, level].sort((a, b) => a - b) });
  return { ok: !!ok };
}

export function countMessage(level) {
  const s = read(); if (!s) return 0;
  const used = { ...s.used, [level]: (s.used?.[level] || 0) + 1 };
  write({ ...s, used });
  return used[level];
}

export async function leaderboard() {
  await wait(300);
  return { sample: MODE !== 'live', rows: SAMPLE_BOARD.map(([handle, levels, points, time], i) => ({ rank: i + 1, handle, levels, points, time })) };
}
