import { cx } from './ui.jsx';

/* Certification seals, drawn the way the Zenstra AI site draws them (the same
   company's artwork): a round seal with a rule for the ISO standards, a
   rounded square for the SOC 2 Type II audit report. Colours come from CSS
   (.seal) so they read on light, dark and the deep-blue bands. */

export const SEAL_KIND = { 'ISO 27001': 'Certified', 'SOC 2': 'Audit report', 'ISO 42001': 'Certified', 'ISO 27701': 'Certified' };

export default function CertSeal({ code, size = 56, className, title }) {
  const soc = code.startsWith('SOC');
  const num = code.replace(/^ISO\s*/, '');
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={cx('seal shrink-0', className)} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {soc ? (
        <>
          <rect className="o" x="3" y="3" width="58" height="58" rx="17" />
          <rect className="d" x="7.5" y="7.5" width="49" height="49" rx="13" />
          <rect className="i" x="12" y="12" width="40" height="40" rx="10" />
          <text className="t" x="32" y="31" textAnchor="middle">SOC 2</text>
          <text className="s" x="32" y="41" textAnchor="middle">TYPE II</text>
        </>
      ) : (
        <>
          <circle className="o" cx="32" cy="32" r="30" />
          <circle className="d" cx="32" cy="32" r="25.5" />
          <circle className="i" cx="32" cy="32" r="21" />
          <text className="t" x="32" y="29.5" textAnchor="middle">ISO</text>
          <line className="ln" x1="19" y1="34" x2="45" y2="34" />
          <text className="s" x="32" y="42.5" textAnchor="middle">{num}</text>
        </>
      )}
    </svg>
  );
}
