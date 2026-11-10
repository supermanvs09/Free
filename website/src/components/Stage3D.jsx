import { useRef, useState } from 'react';
import { cx, useInView, useIsoLayoutEffect, useTilt } from '../lib/motion.js';

/* A product picture set in perspective. Its frame tilts back; the pieces that
   matter (a decision, a score, the node under attack) are wrapped in <Pop>
   and lift out of the frame towards the viewer, often past its edge.
   Used only for the pictures that carry a page's main point. */
export default function Stage3D({ children, className, tilt = [6, -14], range = [4, 6], style }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useTilt(ref, { base: tilt, range });
  const inView = useInView(ref, { threshold: 0.15, once: true });
  useIsoLayoutEffect(() => { document.documentElement.classList.add('io'); }, []);
  if (inView && !seen) setSeen(true);
  return (
    <div ref={ref} className={cx('stage3d', seen && 'in', className)} style={{ '--rx': `${tilt[0]}deg`, '--ry': `${tilt[1]}deg`, ...style }}>
      <div className="tilt">{children}</div>
    </div>
  );
}

export function Pop({ z = 70, delay = 400, className, style, children, glow }) {
  return <div className={cx('pop', className)} style={{ '--z': `${z}px`, '--d': `${delay}ms`, ...(glow ? { '--glow': glow } : null), ...style }}>{children}</div>;
}
