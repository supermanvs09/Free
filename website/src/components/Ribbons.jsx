import { useEffect } from 'react';

/* Soft brand-blue light ribbons that sit behind every page and drift as you scroll. */
export default function Ribbons() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const root = document.documentElement;
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => root.style.setProperty('--sy', String(window.scrollY))); };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => { window.removeEventListener('scroll', on); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div className="ribbons" aria-hidden="true">
      <svg viewBox="0 0 1440 3000" preserveAspectRatio="none">
        <defs>
          <linearGradient id="rb1" x1="0" x2="1"><stop offset="0" stopColor="#00aeef" stopOpacity="0" /><stop offset=".5" stopColor="#00aeef" stopOpacity=".28" /><stop offset="1" stopColor="#0068ac" stopOpacity="0" /></linearGradient>
          <linearGradient id="rb2" x1="1" x2="0"><stop offset="0" stopColor="#0068ac" stopOpacity="0" /><stop offset=".5" stopColor="#3b8fe0" stopOpacity=".22" /><stop offset="1" stopColor="#00aeef" stopOpacity="0" /></linearGradient>
          <filter id="rbblur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="26" /></filter>
        </defs>
        <g filter="url(#rbblur)">
          <path d="M-100 220 C 300 -40 600 520 980 300 S 1500 120 1600 380" stroke="url(#rb1)" strokeWidth="120" />
          <path d="M1600 760 C 1180 560 900 1180 520 940 S -60 820 -160 1100" stroke="url(#rb2)" strokeWidth="140" />
          <path d="M-100 1500 C 340 1260 640 1840 1000 1600 S 1480 1420 1600 1700" stroke="url(#rb1)" strokeWidth="130" />
          <path d="M1600 2200 C 1160 2000 880 2600 500 2380 S -40 2260 -160 2540" stroke="url(#rb2)" strokeWidth="140" />
        </g>
      </svg>
    </div>
  );
}
