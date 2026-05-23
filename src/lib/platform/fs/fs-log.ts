import type { FsLayer } from '@/lib/platform/fs/capabilities';

export function logFsBridge(
  operation: string,
  detail: {
    platform?: string;
    attempted?: FsLayer[];
    winner?: FsLayer;
    message?: string;
    count?: number;
  },
): void {
  const parts = [operation];
  if (detail.platform) parts.push(`platform=${detail.platform}`);
  if (detail.attempted?.length) parts.push(`attempted=[${detail.attempted.join(',')}]`);
  if (detail.winner) parts.push(`winner=${detail.winner}`);
  if (detail.message) parts.push(detail.message);
  console.log(`[fs-bridge] ${parts.join(' ')}`);
}
