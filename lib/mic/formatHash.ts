export function shortHash(hash?: string | null, size = 10): string {
  if (!hash) return '—';
  if (hash.length <= size * 2) return hash;
  return `${hash.slice(0, size)}…${hash.slice(-size)}`;
}
