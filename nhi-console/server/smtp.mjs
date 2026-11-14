/*
 * A small SMTP client (no dependencies) for sending alert email through
 * Gmail, Google Workspace or any SMTP server.
 *
 * Gmail: host smtp.gmail.com, port 465 (implicit TLS), the Gmail address as
 * the user and a 16-character app password (Google Account → Security →
 * 2-Step Verification → App passwords). Port 587 uses STARTTLS.
 */
import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';
import os from 'node:os';

const CRLF = '\r\n';

function b64(s) {
  return Buffer.from(String(s), 'utf8').toString('base64');
}

/* RFC 2047 encoded-word for headers that may hold non-ASCII text. */
function encodeHeader(value) {
  const s = String(value ?? '').replace(/[\r\n]+/g, ' ');
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
}

function wrap76(base64) {
  return base64.replace(/.{1,76}/g, (m) => `${m}${CRLF}`);
}

export function buildMessage({ from, fromName, to, subject, text, html, messageId }) {
  const boundary = `nhi_${crypto.randomBytes(12).toString('hex')}`;
  const domain = String(from).split('@')[1] || 'localhost';
  const id = messageId || `<${crypto.randomUUID()}@${domain}>`;
  const headers = [
    `From: ${fromName ? `"${encodeHeader(fromName).replace(/"/g, '')}" ` : ''}<${from}>`,
    `To: ${to.join(', ')}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: ${id}`,
    'MIME-Version: 1.0',
    'X-Mailer: NHI Console',
    'Auto-Submitted: auto-generated',
  ];
  const parts = [];
  if (text) parts.push(['text/plain', text]);
  if (html) parts.push(['text/html', html]);
  let body;
  if (parts.length === 1) {
    headers.push(`Content-Type: ${parts[0][0]}; charset=UTF-8`, 'Content-Transfer-Encoding: base64');
    body = wrap76(b64(parts[0][1]));
  } else {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = parts.map(([type, content]) => `--${boundary}${CRLF}Content-Type: ${type}; charset=UTF-8${CRLF}Content-Transfer-Encoding: base64${CRLF}${CRLF}${wrap76(b64(content))}`).join('') + `--${boundary}--${CRLF}`;
  }
  return { id, data: `${headers.join(CRLF)}${CRLF}${CRLF}${body}` };
}

/** Reads SMTP replies (multi-line aware) from a socket. */
function replies(socket) {
  let buffer = '';
  const queue = [];
  const waiting = [];
  let failed = null;
  const push = (r) => (waiting.length ? waiting.shift().resolve(r) : queue.push(r));
  const onData = (chunk) => {
    buffer += chunk.toString('utf8');
    let lines = [];
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, '');
      buffer = buffer.slice(idx + 1);
      lines.push(line);
      if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
        push({ code: Number(line.slice(0, 3)), text: lines.map((l) => l.slice(4)).join('\n') });
        lines = [];
      }
    }
    if (lines.length) buffer = `${lines.join('\n')}\n${buffer}`;
  };
  const onError = (error) => {
    failed = error;
    while (waiting.length) waiting.shift().reject(error);
  };
  socket.on('data', onData);
  socket.on('error', onError);
  socket.on('close', () => onError(new Error('The mail server closed the connection.')));
  return {
    next: () => (queue.length ? Promise.resolve(queue.shift()) : failed ? Promise.reject(failed) : new Promise((resolve, reject) => waiting.push({ resolve, reject }))),
    detach: () => {
      socket.off('data', onData);
      socket.off('error', onError);
    },
  };
}

function smtpError(reply, stage) {
  const e = new Error(`${stage}: ${reply.code} ${reply.text}`.trim());
  e.smtpCode = reply.code;
  e.stage = stage;
  return e;
}

/**
 * Sends one message. Options: host, port, secure (implicit TLS; default when
 * port is 465), user, pass, from, fromName, to[], subject, text, html,
 * timeout, rejectUnauthorized (default true).
 */
export async function sendSmtp(opts) {
  const port = Number(opts.port || 465);
  const secure = opts.secure ?? port === 465;
  const timeout = Number(opts.timeout || 15000);
  const tlsOpts = { servername: opts.host, rejectUnauthorized: opts.rejectUnauthorized !== false, minVersion: 'TLSv1.2' };
  let socket = await new Promise((resolve, reject) => {
    const s = secure ? tls.connect({ host: opts.host, port, ...tlsOpts }) : net.connect({ host: opts.host, port });
    s.setTimeout(timeout, () => s.destroy(new Error('The mail server did not answer in time.')));
    s.once(secure ? 'secureConnect' : 'connect', () => resolve(s));
    s.once('error', reject);
  });
  let r = replies(socket);
  const write = (line) => socket.write(`${line}${CRLF}`);
  const expect = async (codes, stage) => {
    const reply = await r.next();
    if (!codes.includes(reply.code)) throw smtpError(reply, stage);
    return reply;
  };
  const name = os.hostname().replace(/[^\w.-]/g, '') || 'nhi-console';
  try {
    await expect([220], 'Greeting');
    write(`EHLO ${name}`);
    let ehlo = await expect([250], 'EHLO');
    if (!secure && /STARTTLS/i.test(ehlo.text) && opts.starttls !== false) {
      write('STARTTLS');
      await expect([220], 'STARTTLS');
      r.detach();
      socket = await new Promise((resolve, reject) => {
        const t = tls.connect({ socket, ...tlsOpts }, () => resolve(t));
        t.once('error', reject);
      });
      socket.setTimeout(timeout, () => socket.destroy(new Error('The mail server did not answer in time.')));
      r = replies(socket);
      write(`EHLO ${name}`);
      ehlo = await expect([250], 'EHLO');
    }
    if (opts.user) {
      const methods = (/AUTH[ =]([^\n]*)/i.exec(ehlo.text)?.[1] || '').toUpperCase();
      if (methods.includes('PLAIN') || !methods.includes('LOGIN')) {
        write(`AUTH PLAIN ${b64(`\u0000${opts.user}\u0000${opts.pass}`)}`);
        await expect([235], 'Sign-in');
      } else {
        write('AUTH LOGIN');
        await expect([334], 'Sign-in');
        write(b64(opts.user));
        await expect([334], 'Sign-in');
        write(b64(opts.pass));
        await expect([235], 'Sign-in');
      }
    }
    write(`MAIL FROM:<${opts.from}>`);
    await expect([250], 'Sender');
    for (const rcpt of opts.to) {
      write(`RCPT TO:<${rcpt}>`);
      await expect([250, 251], `Recipient ${rcpt}`);
    }
    write('DATA');
    await expect([354], 'DATA');
    const msg = buildMessage(opts);
    /* Dot-stuffing: a line that starts with "." gets another one. */
    socket.write(`${msg.data.replace(/\r?\n/g, CRLF).replace(/^\./gm, '..')}${CRLF}.${CRLF}`);
    const accepted = await expect([250], 'Message');
    write('QUIT');
    socket.end();
    return { message_id: msg.id, response: accepted.text };
  } catch (error) {
    try {
      socket.destroy();
    } catch {
      /* already closed */
    }
    throw error;
  }
}
