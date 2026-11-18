/**
 * format.ts — Utility formatters (human-readable sizes, dates)
 */

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  let n = bytes / 1024;
  const units = ['KB', 'MB', 'GB', 'TB'];
  for (const unit of units) {
    if (n < 1024) return `${n.toFixed(1)} ${unit}`;
    n /= 1024;
  }
  return `${n.toFixed(1)} PB`;
}

export function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function humanFileSize(size: number): string {
  return formatSize(size);
}
