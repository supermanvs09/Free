import { Tag } from './Tag';

const CONN = {
  connected: ['low', 'Connected'],
  failing: ['critical', 'Check failing'],
  saved: ['medium', 'Not verified'],
  not_configured: ['neutral', 'Not connected'],
};

export function ConnectionStatus({ status, size }) {
  const [tone, label] = CONN[status] || CONN.not_configured;
  return (
    <Tag tone={tone} dot size={size}>
      {label}
    </Tag>
  );
}

export function SeverityTag({ severity, size = 'sm' }) {
  return (
    <Tag tone={severity} size={size} className="capitalize">
      {severity}
    </Tag>
  );
}
