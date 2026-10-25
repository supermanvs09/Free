import ProductTour, { PRODUCTS, CapabilityPanel, TablePanel } from './ProductTour.jsx';
import IdentityDetail from './IdentityDetail.jsx';
import { Frame, WinTitle } from './kit.jsx';

/* Resolves a visual spec from data/products.js to a product UI illustration. */
export default function ProductVisual({ v, className }) {
  if (v.type === 'tour') return <ProductTour only={v.product} className={className} />;
  if (v.type === 'detail') return <IdentityDetail variant={v.variant} className={className} />;
  const p = v.product && PRODUCTS.find((x) => x.key === v.product);
  const title = v.title || p?.caps[v.cap];
  return (
    <Frame className={className} role="img" aria-label={`Illustration: ${title} view with sample data.`}>
      <WinTitle>{title}</WinTitle>
      {v.type === 'table' ? <TablePanel spec={v.spec} /> : <CapabilityPanel product={p} cap={v.cap} />}
    </Frame>
  );
}
