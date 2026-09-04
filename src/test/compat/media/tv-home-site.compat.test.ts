import { afterEach, describe, expect, it } from 'vitest';
import {
  isTvBrowsableHomeSite,
  pickDefaultHomeSiteKey,
} from '@/lib/media/tv/config/tv-home-site';
import {
  applyTvJarFenceSnapshot,
  EMPTY_TV_JAR_FENCE,
} from '@/lib/media/tv/config/tv-jar-crash-fence';

describe('tv home site selection', () => {
  afterEach(() => {
    applyTvJarFenceSnapshot(EMPTY_TV_JAR_FENCE);
  });

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
      {
        key: '光影',
        name: '光影',
        api: 'csp_T4Guard',
        searchable: 1,
        changeable: 1,
      },
    ];
    expect(isTvBrowsableHomeSite(sites[0]!)).toBe(false);
    expect(isTvBrowsableHomeSite(sites[1]!)).toBe(false);
    expect(pickDefaultHomeSiteKey(sites)).toBe('光影');
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

  it('skips sites that share a quarantined Guard JAR', () => {
    applyTvJarFenceSnapshot({
      ...EMPTY_TV_JAR_FENCE,
      entries: [
        {
          jarKey: 'k1',
          jar: 'https://cdn.example/jar/fan.txt;md5;abc',
          siteKey: '光影',
          api: 'csp_T4Guard',
        },
      ],
    });
    const sites = [
      {
        key: '光影',
        api: 'csp_T4Guard',
        jar: 'https://cdn.example/jar/fan.txt;md5;fff',
        searchable: 1,
        changeable: 1,
      },
      {
        key: 'js',
        api: 'csp_AppYsV2',
        jar: 'https://cdn.example/other.jar',
        searchable: 1,
        changeable: 1,
      },
    ];
    expect(isTvBrowsableHomeSite(sites[0]!)).toBe(false);
    expect(pickDefaultHomeSiteKey(sites)).toBe('js');
  });
});
