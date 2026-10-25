import { cx } from './kit.jsx';

/* Product card images: crops of the illustrative console (sample data), rendered
   once to WebP by src/dev/thumbs.jsx. */
const ALT = {
  zenstra: 'Zenstra AI agent inventory showing agents ranked by risk (illustrative sample data)',
  adapid: 'adapID AI identity risk scores for four people (illustrative sample data)',
  nhi: 'NHI Security for AWS listing IAM roles and keys by risk (illustrative sample data)',
  fraud: 'adapID fraud decisions on payments and logins (illustrative sample data)',
  ad: 'Active Directory attack path from a user account to Domain Admins (illustrative sample data)',
  botshield: 'BotShield AI traffic by intent with a bot spike (illustrative sample data)',
  ddos: 'DDoS mitigation chart showing a flood absorbed at the edge (illustrative sample data)',
  icms: 'ICMS audit evidence with DPDPA, RBI and SEBI readiness (illustrative sample data)',
};

export default function Thumb({ k, className, eager }) {
  return <img src={`/img/products/${k}.webp`} alt={ALT[k] || ''} width="480" height="300" loading={eager ? 'eager' : 'lazy'} decoding="async" className={cx('block h-auto w-full', className)} />;
}
