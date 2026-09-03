import { describe, expect, it } from 'vitest';
import {
  isTvBrowsableHomeSite,
  pickDefaultHomeSiteKey,
} from '@/lib/media/tv/config/tv-home-site';

describe('tv home site selection', () => {
  it('skips 点我切源 placeholder (searchable/changeable both 0)', () => {
    const sites = [
      {
        key: '点我切源',
        name: '<8.25更新> 修复动漫  看球',
        api: 'csp_DouDouGuard',
        searchable: 0,
        changeable: 0,
      },
      {
        key: 'MDrive',
        name: '我的云盘',
        api: 'csp_MyDriveGuard',
        searchable: 1,
        changeable: 0,
      },
    ];
    expect(isTvBrowsableHomeSite(sites[0]!)).toBe(false);
    expect(pickDefaultHomeSiteKey(sites)).toBe('MDrive');
  });

  it('skips DouDouGuard even when searchable is enabled', () => {
    const sites = [
      {
        key: 'switch',
        api: 'csp_DouDouGuard',
        searchable: 1,
        changeable: 1,
      },
      { key: 'real', api: 'csp_T4Guard', searchable: 1, changeable: 1 },
    ];
    expect(pickDefaultHomeSiteKey(sites)).toBe('real');
  });

  it('falls back to first site when all are non-browsable', () => {
    const sites = [
      { key: 'only', api: 'csp_DouDouGuard', searchable: 0, changeable: 0 },
    ];
    expect(pickDefaultHomeSiteKey(sites)).toBe('only');
  });
});
