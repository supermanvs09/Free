import { LOGOS } from '../brand/logos';
import { CREDENTIAL_TYPES, IDENTITY_TYPES, PROVIDERS } from '../data/world';
import { cn } from '../ui/cn';

/**
 * An application's own logo on a white tile, the way integration catalogues
 * show third-party marks: the tile keeps dark marks (GitHub) legible on the
 * dark theme and gives every logo the same footprint.
 */
export function AppLogo({ name, size = 28, tile = true, className, title }) {
  const logo = LOGOS[name] || LOGOS.aws;
  const inner = Math.round(size * (tile ? 0.66 : 1));
  const img = (
    <img
      src={logo.src}
      alt={tile ? '' : title || name}
      draggable="false"
      style={{ width: logo.ratio > 1.4 ? inner : inner * Math.min(1, logo.ratio), height: logo.ratio > 1.4 ? inner / logo.ratio : inner, objectFit: 'contain' }}
      className="select-none"
    />
  );
  if (!tile) return <span className={cn('inline-grid shrink-0 place-items-center', className)} title={title}>{img}</span>;
  return (
    <span
      title={title}
      className={cn('inline-grid shrink-0 place-items-center border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(11,27,46,0.08)] dark:border-white/10', className)}
      style={{ width: size, height: size, borderRadius: Math.max(6, Math.round(size * 0.26)) }}
      role={title ? 'img' : undefined}
      aria-label={title}
    >
      {img}
    </span>
  );
}

export function ProviderLogo({ provider, size = 24, className }) {
  const p = PROVIDERS[provider];
  return <AppLogo name={p?.logo} size={size} title={p?.name} className={className} />;
}

/** The service icon for an identity type (IAM, Lambda, Actions…). */
export function IdentityLogo({ type, size = 28, className }) {
  const t = IDENTITY_TYPES[type];
  return <AppLogo name={t?.logo} size={size} title={t?.label} className={className} />;
}

export function CredentialLogo({ type, size = 26, className }) {
  const t = CREDENTIAL_TYPES[type];
  return <AppLogo name={t?.logo} size={size} title={t?.label} className={className} />;
}

/** Logo + short name, for table cells and chips. */
export function ProviderChip({ provider, size = 18, className, label }) {
  const p = PROVIDERS[provider];
  if (!p) return null;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-2', className)}>
      <AppLogo name={p.logo} size={size} />
      <span className="truncate">{label ?? p.short}</span>
    </span>
  );
}
