import { siWindsurf, siPerplexity, siReplit, siOllama } from 'simple-icons';
import { Logo, logoTitle } from '../components/viz/kit.jsx';
import { cx } from '../lib/motion.js';

/* Real app marks on a tile. Uses the site's brand kit (simple-icons plus the
   marks it draws itself: Microsoft, Entra, Slack, Salesforce, AWS services)
   and adds a few AI tools the kit does not carry. */
const EXTRA = { windsurf: siWindsurf, perplexity: siPerplexity, replit: siReplit, ollama: siOllama };

export const appName = (k) => (EXTRA[k] ? EXTRA[k].title : logoTitle(k));

export function Mark({ k, size = '1.2em' }) {
  const s = EXTRA[k];
  if (s) return <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={s.title}><path d={s.path} fill={`#${s.hex}`} /></svg>;
  return <Logo k={k} size={size} />;
}

export default function AppIcon({ k, className, label, style, tone }) {
  return (
    <span className={cx('dx-app', tone && `t-${tone}`, className)} style={style} title={appName(k)}>
      <Mark k={k} />
      {label && <b>{label === true ? appName(k) : label}</b>}
    </span>
  );
}
