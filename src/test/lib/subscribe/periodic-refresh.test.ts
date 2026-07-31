import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/persistence/domains/subscribe-config', () => ({
  getSubscribeConfig: vi.fn(async () => ({
    version: 1,
    autoRefreshOnOpen: false,
    periodicRefreshEnabled: false,
    autoRefreshIntervalMinutes: 30,
    foloDiscoverEnabled: true,
    foloCloudAccountEnabled: false,
  })),
  registerSubscribePeriodicRefreshSync: vi.fn(),
}));

vi.mock('@/lib/subscribe/service', () => ({
  refreshAllSubscribeSources: vi.fn(async () => ({
    refreshed: 0,
    entries: 0,
    failures: [],
  })),
}));

import { getSubscribeConfig } from '@/lib/persistence/domains/subscribe-config';
import { refreshAllSubscribeSources } from '@/lib/subscribe/service';
import {
  clampSubscribeRefreshIntervalMinutes,
  resetSubscribePeriodicRefreshForTests,
  stopSubscribePeriodicRefresh,
  subscribeRefreshIntervalMs,
  syncSubscribePeriodicRefresh,
} from '@/lib/subscribe/periodic-refresh';

describe('subscribe refresh interval', () => {
  afterEach(() => {
    resetSubscribePeriodicRefreshForTests();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('clamps minutes to 5..1440', () => {
    expect(clampSubscribeRefreshIntervalMinutes(1)).toBe(5);
    expect(clampSubscribeRefreshIntervalMinutes(30)).toBe(30);
    expect(clampSubscribeRefreshIntervalMinutes(9999)).toBe(1440);
    expect(clampSubscribeRefreshIntervalMinutes('abc')).toBe(30);
    expect(subscribeRefreshIntervalMs(15)).toBe(15 * 60_000);
  });

  it('does not schedule timer when periodic refresh is disabled', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    vi.mocked(getSubscribeConfig).mockResolvedValueOnce({
      version: 1,
      autoRefreshOnOpen: false,
      periodicRefreshEnabled: false,
      autoRefreshIntervalMinutes: 30,
      foloDiscoverEnabled: true,
      foloCloudAccountEnabled: false,
    });
    await syncSubscribePeriodicRefresh();
    expect(spy).not.toHaveBeenCalled();
    expect(refreshAllSubscribeSources).not.toHaveBeenCalled();
    stopSubscribePeriodicRefresh();
  });

  it('schedules interval when enabled', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    vi.mocked(getSubscribeConfig).mockResolvedValue({
      version: 1,
      autoRefreshOnOpen: false,
      periodicRefreshEnabled: true,
      autoRefreshIntervalMinutes: 5,
      foloDiscoverEnabled: true,
      foloCloudAccountEnabled: false,
    });
    await syncSubscribePeriodicRefresh();
    expect(spy).toHaveBeenCalledWith(expect.any(Function), 5 * 60_000);
    const tick = spy.mock.calls[0]?.[0] as () => void;
    tick();
    await vi.waitFor(() => {
      expect(refreshAllSubscribeSources).toHaveBeenCalledTimes(1);
    });
  });
});
