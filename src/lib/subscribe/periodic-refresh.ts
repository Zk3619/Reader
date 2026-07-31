/**
 * 订阅定期自动刷新（本地 RSS，interactiveCf: false）。
 * 由配置开关与间隔驱动；应用存活期间单例定时器。
 */

import { createSignal } from 'solid-js';
import { getSubscribeConfig } from '@/lib/persistence/domains/subscribe-config';
import { refreshAllSubscribeSources } from '@/lib/subscribe/service';
import {
  clampSubscribeRefreshIntervalMinutes,
  SUBSCRIBE_REFRESH_INTERVAL_DEFAULT_MINUTES,
} from '@/lib/subscribe/refresh-interval';

export {
  clampSubscribeRefreshIntervalMinutes,
  SUBSCRIBE_REFRESH_INTERVAL_DEFAULT_MINUTES,
  SUBSCRIBE_REFRESH_INTERVAL_MAX_MINUTES,
  SUBSCRIBE_REFRESH_INTERVAL_MIN_MINUTES,
} from '@/lib/subscribe/refresh-interval';

const [subscribeFeedDataRevision, setSubscribeFeedDataRevision] = createSignal(0);
export { subscribeFeedDataRevision };

function bumpSubscribeFeedDataRevision(): void {
  setSubscribeFeedDataRevision((value) => value + 1);
}

export function subscribeRefreshIntervalMs(minutes?: number): number {
  return (
    clampSubscribeRefreshIntervalMinutes(
      minutes ?? SUBSCRIBE_REFRESH_INTERVAL_DEFAULT_MINUTES,
    ) * 60_000
  );
}

let timerId: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;
let lastScheduledKey = '';

async function runPeriodicTick(): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    await refreshAllSubscribeSources();
    bumpSubscribeFeedDataRevision();
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
  }, minutes * 60_000);
}

/** 测试或卸载时重置 */
export function resetSubscribePeriodicRefreshForTests(): void {
  stopSubscribePeriodicRefresh();
  tickInFlight = false;
}
