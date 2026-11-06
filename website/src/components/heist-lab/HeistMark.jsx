import { useId } from 'react';

/* The Prompt Heist mark: a vault lock whose shackle has sprung and whose body
   is cracked through, with a prompt caret where the keyhole would be. One
   drawing, used at every size: the banner's focal object, the launcher and the
   chat header. Lit from the upper right, like the banner. */
export default function HeistMark({ size = 40, detail = true, className, title }) {
  const id = useId().replace(/:/g, '');
  // small sizes sit on dark badges: a light steel body with a navy caret reads better
  const body = detail ? `url(#${id}b)` : '#d3dfec';
  const caret = detail ? '#dbe8f5' : '#0a1626';
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true };
  return (
    <svg viewBox="0 0 120 140" width={size} height={(size * 140) / 120} className={className} {...a11y}>
      <defs>
        <linearGradient id={`${id}b`} x1="0.85" y1="0" x2="0.2" y2="1">
          <stop offset="0" stopColor="#2b5482" />
          <stop offset="0.55" stopColor="#173253" />
          <stop offset="1" stopColor="#0d1e33" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9e4f0" />
          <stop offset="1" stopColor="#6d84a0" />
        </linearGradient>
      </defs>
      {/* the shackle, sprung open: pivoted up and off its right seat */}
      <g transform="rotate(-14 31 64)">
        <path d="M31 66V42a29 29 0 0 1 58 0v12" fill="none" stroke={detail ? `url(#${id}s)` : '#8fa6bf'} strokeWidth={detail ? 10 : 12} strokeLinecap="round" />
        {detail && <path d="M37 64V43a23 23 0 0 1 30-21.9" fill="none" stroke="#fff" strokeOpacity=".28" strokeWidth="1.6" strokeLinecap="round" />}
      </g>
      {/* the body, in two halves along the crack */}
      <path d="M26 62h46l-6 17 9 12-12 15 7 11-9 21H26a12 12 0 0 1-12-12V74a12 12 0 0 1 12-12z" fill={body} />
      <path d="M76 62h18a12 12 0 0 1 12 12v50a12 12 0 0 1-12 12H71l9-21-7-11 12-15-9-12z" fill={body} transform="translate(3 -1.5) rotate(2 94 100)" />
      {detail && <path d="M26 62.8h44M80 62.8h14a11 11 0 0 1 11 11" fill="none" stroke="#9cc9f2" strokeOpacity=".55" strokeWidth="1.4" transform="translate(0 0)" />}
      {/* the crack: the one warm light in the drawing */}
      <path d="M73 61l-6 18 9 12-12 15 7 11-9 21" fill="none" stroke={detail ? '#f2b13c' : '#c47f0a'} strokeWidth={detail ? 2.4 : 5} strokeLinejoin="round" strokeLinecap="round" />
      {/* the prompt caret in place of a keyhole */}
      <path d="M33 92l9 7-9 7" fill="none" stroke={caret} strokeWidth={detail ? 4 : 6} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M46 108h11" stroke={caret} strokeWidth={detail ? 4 : 6} strokeLinecap="round" />
    </svg>
  );
}
