/* The official product marks (from the product teams' own artwork):
   Zenstra AI's star, adapID AI's shield and lock
   and the ICMS Compliance Suite shield. Each reads on dark and light. */
const LINE = {
  zen: 'zenstra', zenstra: 'zenstra',
  adap: 'adapid', adapid: 'adapid', cirm: 'adapid', nhi: 'adapid', fraud: 'adapid', ad: 'adapid',
  icms: 'icms',
  'Zenstra AI': 'zenstra', 'adapID AI': 'adapid', 'ICMS Compliance Suite': 'icms',
};
const NAME = { zenstra: 'Zenstra AI', adapid: 'adapID AI', icms: 'ICMS Compliance Suite' };

const FIRST = { Zenstra: 'zenstra', adapID: 'adapid', ICMS: 'icms' };
export const lineOf = (p) => LINE[p] || FIRST[String(p).split(' ')[0]] || p;

/* `p` is a product key, line key or product name; `alt` names it when the mark stands alone. */
export default function ProductMark({ p, size = 28, alt, className, style, loading = 'lazy' }) {
  const k = lineOf(p);
  if (!NAME[k]) return null;
  const px = typeof size === 'number' ? size : undefined; // em sizes inside product pictures
  return <img src={`/brand/products/${k}.webp`} alt={alt ? NAME[k] : ''} width={px} height={px} loading={loading} decoding="async" className={className} style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0, ...style }} draggable="false" />;
}

