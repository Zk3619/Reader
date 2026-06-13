/** Solid 1.9+ Resource 辅助（error/loading 在 accessor 上，不在 actions 里） */

export function resourceError(resource: { error?: unknown; state?: string }): unknown {
  return resource.state === 'errored' ? resource.error : undefined;
}

export function resourceLoading(resource: { loading?: boolean }): boolean {
  return Boolean(resource.loading);
}

export function formatResourceError(err: unknown, fallback = '加载失败'): string {
  if (err instanceof Error) return err.message;
  if (err != null && err !== '') return String(err);
  return fallback;
}
