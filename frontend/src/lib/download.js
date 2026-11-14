/*
 * Hand the person a file. Inside a published page the platform's download
 * service asks them where to save it; anywhere else a plain link does.
 */
function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCsv(rows) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  return [keys.join(','), ...rows.map((r) => keys.map((k) => escapeCell(r[k])).join(','))].join('\r\n') + '\r\n';
}

export async function downloadText(filename, text, type = 'text/plain') {
  try {
    const downloads = await window.claude?.use?.('downloads');
    if (downloads) {
      await downloads.save({ filename, data: text });
      return true;
    }
  } catch {
    /* declined or unavailable: fall through to a link */
  }
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}

export function downloadCsv(filename, rows) {
  return downloadText(filename, `﻿${toCsv(rows)}`, 'text/csv;charset=utf-8');
}
