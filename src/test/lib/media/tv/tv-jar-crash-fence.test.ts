import { afterEach, describe, expect, it } from 'vitest';
import {
  applyTvJarFenceSnapshot,
  EMPTY_TV_JAR_FENCE,
  isTvJarQuarantined,
  parseTvJarFenceJson,
  tvJarUrlKey,
} from '@/lib/media/tv/config/tv-jar-crash-fence';

describe('tv jar crash fence', () => {
  afterEach(() => {
    applyTvJarFenceSnapshot(EMPTY_TV_JAR_FENCE);
  });

  it('strips ;md5; suffix like the Android fence', () => {
    expect(tvJarUrlKey('https://cdn.example/fan.txt;md5;deadbeef')).toBe(
      'https://cdn.example/fan.txt',
    );
  });

  it('treats the same JAR url with a different md5 as quarantined', () => {
    parseTvJarFenceJson(
      JSON.stringify({
        newlyAbsorbed: true,
        siteKey: '光影',
        api: 'csp_T4Guard',
        jar: 'https://cdn.example/fan.txt;md5;aaa',
        jarKey: 'k1',
        phase: 'loadDex',
        entries: [
          {
            jarKey: 'k1',
            jar: 'https://cdn.example/fan.txt;md5;aaa',
            siteKey: '光影',
            api: 'csp_T4Guard',
          },
        ],
      }),
    );
    expect(isTvJarQuarantined('https://cdn.example/fan.txt;md5;bbb')).toBe(true);
    expect(isTvJarQuarantined('https://cdn.example/other.jar')).toBe(false);
  });
});
