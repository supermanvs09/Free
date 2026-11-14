import { FaAws } from 'react-icons/fa';
import { VscAzure } from 'react-icons/vsc';
import { SiBitbucket, SiGithub, SiGmail, SiJenkins, SiJira, SiVault } from 'react-icons/si';
import { cn } from './cn';

/**
 * The application an identity, credential or finding belongs to, drawn with
 * its own brand mark. Marks are glyph-only and small: they identify the
 * source at a glance without competing with the name beside them.
 *
 * Colours are the brands' own; GitHub and Vault are monochrome brands and
 * follow the ink colour so they read in both themes.
 */
export const PROVIDERS = {
  aws: { label: 'AWS', name: 'Amazon Web Services', Icon: FaAws, color: '#FF9900', scale: 1.18 },
  azure: { label: 'Azure', name: 'Microsoft Azure', Icon: VscAzure, color: '#0078D4' },
  jenkins: { label: 'Jenkins', name: 'Jenkins', Icon: SiJenkins, color: '#D24939' },
  vault: { label: 'Vault', name: 'HashiCorp Vault', Icon: SiVault, color: 'var(--t-ink)' },
  github: { label: 'GitHub', name: 'GitHub', Icon: SiGithub, color: 'var(--t-ink)' },
  bitbucket: { label: 'Bitbucket', name: 'Bitbucket', Icon: SiBitbucket, color: '#2684FF' },
  gmail: { label: 'Gmail', name: 'Gmail', Icon: SiGmail, color: '#EA4335' },
  jira: { label: 'Jira', name: 'Jira', Icon: SiJira, color: '#2684FF' },
};

const TYPE_PROVIDER = {
  managed_identity: 'azure',
  service_principal: 'azure',
  app_registration: 'azure',
  aks_workload: 'azure',
  function_app: 'azure',
  client_secret: 'azure',
  federated_credential: 'azure',
  jenkins_job: 'jenkins',
  jenkins_agent: 'jenkins',
  jenkins_user: 'jenkins',
  jenkins_credential: 'jenkins',
  vault_approle: 'vault',
  vault_k8s_role: 'vault',
  vault_token: 'vault',
  vault_dynamic_role: 'vault',
  vault_secret_id: 'vault',
  vault_lease: 'vault',
  vault_k8s_jwt: 'vault',
};

/** Which application a record comes from, read from whatever it carries. */
export function providerOf(row) {
  if (!row) return null;
  if (typeof row === 'string') return PROVIDERS[row] ? row : providerFromArn(row);
  const direct = row.provider ?? row.identity_provider ?? row.platform;
  if (direct && PROVIDERS[String(direct).toLowerCase()]) return String(direct).toLowerCase();
  const type = row.identity_type ?? row.identityType ?? row.credential_type ?? row.type ?? row.nhi_identity_type;
  if (type && TYPE_PROVIDER[type]) return TYPE_PROVIDER[type];
  return providerFromArn(row.arn ?? row.identity_arn ?? row.principal_arn ?? row.identity_name ?? row.target_arn ?? '');
}

export function providerFromArn(arn) {
  const value = String(arn ?? '');
  if (value.startsWith('arn:aws')) return 'aws';
  if (value.startsWith('/subscriptions/') || value.includes('.azure.') || value.startsWith('azure://')) return 'azure';
  if (value.startsWith('jenkins://')) return 'jenkins';
  if (value.startsWith('vault://')) return 'vault';
  if (/^\d{12}$/.test(value)) return 'aws';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(value)) return 'azure';
  if (value.startsWith('ci.') || value.includes('jenkins')) return 'jenkins';
  if (value.startsWith('vault.')) return 'vault';
  return null;
}

export function providerLabel(key) {
  return PROVIDERS[key]?.label ?? '';
}

/**
 * <ProviderIcon provider="aws" /> or <ProviderIcon row={identity} />.
 * `tile` puts the mark on a soft square, for places where it stands alone.
 */
export function ProviderIcon({ provider, row, size = 16, tile = false, className, title, decorative = false }) {
  const key = provider ?? providerOf(row);
  const meta = PROVIDERS[key];
  if (!meta) return null;
  const { Icon } = meta;
  const glyph = (
    <Icon
      size={Math.round(size * (meta.scale ?? 1))}
      style={{ color: meta.color, flexShrink: 0 }}
      aria-hidden={decorative || tile ? true : undefined}
      role={decorative || tile ? undefined : 'img'}
      aria-label={decorative || tile ? undefined : title ?? meta.name}
      className={tile ? undefined : className}
    />
  );
  if (!tile) return <span className="inline-flex shrink-0 items-center" title={title ?? meta.name}>{glyph}</span>;
  return (
    <span
      role="img"
      aria-label={title ?? meta.name}
      title={title ?? meta.name}
      className={cn('grid shrink-0 place-items-center rounded-[8px] border border-line bg-surface', className)}
      style={{ width: size + 14, height: size + 14 }}
    >
      {glyph}
    </span>
  );
}

/** Mark and name together, for chips and filters. */
export function ProviderLabel({ provider, row, size = 14, className, children }) {
  const key = provider ?? providerOf(row);
  const meta = PROVIDERS[key];
  if (!meta) return children ?? null;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <ProviderIcon provider={key} size={size} decorative />
      <span className="truncate">{children ?? meta.label}</span>
    </span>
  );
}
