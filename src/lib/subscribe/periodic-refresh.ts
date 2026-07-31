/**
 * 订阅定期自动刷新（本地 RSS，interactiveCf: false）。
 * 由配置开关与间隔驱动；应用存活期间单例定时器。
 *
 * - 对 service 使用动态 import，避免 refresh ↔ service 静态环
 * - 通过 registerSubscribePeriodicRefreshSync 挂到 config，避免 config → refresh 导入边
 */

import {
  getSubscribeConfig,
  registerSubscribePeriodicRefreshSync,
} from '@/lib/persistence/domains/subscribe-config';
import {
  clampSubscribeRefreshIntervalMinutes,
  subscribeRefreshIntervalMs,
} from '@/lib/subscribe/refresh-interval';

export {
  clampSubscribeRefreshIntervalMinutes,
  SUBSCRIBE_REFRESH_INTERVAL_DEFAULT_MINUTES,
  SUBSCRIBE_REFRESH_INTERVAL_MAX_MINUTES,
  SUBSCRIBE_REFRESH_INTERVAL_MIN_MINUTES,
  subscribeRefreshIntervalMs,
} from '@/lib/subscribe/refresh-interval';

let timerId: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;
let lastScheduledKey = '';
let hookRegistered = false;

async function runPeriodicTick(): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    const { refreshAllSubscribeSources } = await import('@/lib/subscribe/service');
    await refreshAllSubscribeSources();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[subscribe] periodic refresh failed', error);
    }
  } finally {
    tickInFlight = false;
  }
}

export function stopSubscribePeriodicRefresh(): void {
  if (timerId != null) {
    clearInterval(timerId);
    timerId = null;
  }
  lastScheduledKey = '';
}

/**
 * 按当前配置同步定时器。关闭开关时停止。
 */
export async function syncSubscribePeriodicRefresh(): Promise<void> {
  ensureSubscribePeriodicRefreshHook();
  const config = await getSubscribeConfig();
  if (!config.periodicRefreshEnabled) {
    stopSubscribePeriodicRefresh();
    return;
  }
  const minutes = clampSubscribeRefreshIntervalMinutes(config.autoRefreshIntervalMinutes);
  const key = `on:${minutes}`;
  if (key === lastScheduledKey && timerId != null) return;

  stopSubscribePeriodicRefresh();
  lastScheduledKey = key;
  timerId = setInterval(() => {
    void runPeriodicTick();
  }, subscribeRefreshIntervalMs(minutes));
}

/** 注册配置变更钩子（幂等）；persist hydrate / 设置页保存时会回调 */
export function ensureSubscribePeriodicRefreshHook(): void {
  if (hookRegistered) return;
  hookRegistered = true;
  registerSubscribePeriodicRefreshSync(() => {
    void syncSubscribePeriodicRefresh();
  });
}

/** 测试或卸载时重置 */
export function resetSubscribePeriodicRefreshForTests(): void {
  stopSubscribePeriodicRefresh();
  tickInFlight = false;
}
