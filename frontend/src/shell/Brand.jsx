import { cn } from '../ui/cn';
import lockup from '../../public/brand/logo-lockup.png';
import lockupInverse from '../../public/brand/logo-lockup-inverse.png';
import mark from '../../public/brand/mark.png';

/**
 * Brand lockup. Two assets ship: the full wordmark (light-on-dark variant for
 * the navigation rail) and the standalone mark for tight spaces. Clear space
 * is enforced with padding rather than baked into the image.
 */
export function BrandLockup({ variant = 'auto', className, height = 26 }) {
  /* `auto` renders both supplied assets and lets CSS pick, so the wordmark
     always has contrast against whichever theme the chrome is in. Neither
     asset is recoloured. */
  if (variant === 'auto') {
    return (
      <span className={cn('inline-flex select-none', className)} style={{ height }}>
        <img
          src={lockup}
          alt="Deep Algorithms"
          style={{ height }}
          className="w-auto dark:hidden"
          draggable="false"
        />
        <img
          src={lockupInverse}
          alt=""
          aria-hidden="true"
          style={{ height }}
          className="hidden w-auto dark:block"
          draggable="false"
        />
      </span>
    );
  }

  const src = variant === 'inverse' ? lockupInverse : lockup;
  return (
    <img
      src={src}
      alt="Deep Algorithms"
      height={height}
      style={{ height }}
      className={cn('w-auto select-none', className)}
      draggable="false"
    />
  );
}

export function BrandMark({ className, size = 26 }) {
  return (
    <img
      src={mark}
      alt="Deep Algorithms"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn('select-none object-contain', className)}
      draggable="false"
    />
  );
}
