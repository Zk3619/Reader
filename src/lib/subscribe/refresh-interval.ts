/** 订阅自动刷新间隔（分钟）约束，无其它模块依赖。 */

export const SUBSCRIBE_REFRESH_INTERVAL_MIN_MINUTES = 5;
export const SUBSCRIBE_REFRESH_INTERVAL_MAX_MINUTES = 24 * 60;
export const SUBSCRIBE_REFRESH_INTERVAL_DEFAULT_MINUTES = 30;

export function clampSubscribeRefreshIntervalMinutes(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return SUBSCRIBE_REFRESH_INTERVAL_DEFAULT_MINUTES;
  return Math.max(
    SUBSCRIBE_REFRESH_INTERVAL_MIN_MINUTES,
    Math.min(SUBSCRIBE_REFRESH_INTERVAL_MAX_MINUTES, Math.round(n)),
  );
}

export function subscribeRefreshIntervalMs(minutes?: number): number {
  return (
    clampSubscribeRefreshIntervalMinutes(
      minutes ?? SUBSCRIBE_REFRESH_INTERVAL_DEFAULT_MINUTES,
    ) * 60_000
  );
}
