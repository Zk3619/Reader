/**
 * IqiyiIE P4-ish surface — URL matching, dash vf/auth helpers, short-link tvid parse.
 */
import { describe, expect, it } from 'vitest';
import {
  IqiyiIE,
  iqiyiDashAuthKey,
  iqiyiDashVf,
} from '@/lib/download/ytdlp/extractors/iqiyi';

describe('IqiyiIE URL matching', () => {
  const re = IqiyiIE._VALID_URL;

  it('matches desktop play + qy.net short + sharePlay', () => {
    expect(re.test('https://www.iqiyi.com/v_1j5itvyt0co.html?a=image')).toBe(true);
    expect(re.test('https://qy.net/18JJNdT-09?vfrm=pcw_album_auto')).toBe(true);
    expect(
      re.test(
        'https://m.iqiyi.com/mp/sharePlay.html?tvid=8683144492426700&p1=2_22_222',
      ),
    ).toBe(true);
  });

  it('does not match unrelated hosts', () => {
    expect(re.test('https://www.iq.com/play/foo')).toBe(false);
    expect(re.test('https://example.com/v_1j5itvyt0co.html')).toBe(false);
  });
});

describe('iqiyi dash signing', () => {
  it('vf is stable hex md5', () => {
    const vf = iqiyiDashVf('/dash?tvid=1&bid=500');
    expect(vf).toMatch(/^[a-f0-9]{32}$/);
    expect(iqiyiDashVf('/dash?tvid=1&bid=500')).toBe(vf);
  });

  it('authKey matches empty-md5 + tm + tvid', () => {
    const key = iqiyiDashAuthKey(1787389032407, '5509776398963300');
    expect(key).toBe('1eedda8c2aa010431452f94357297576');
  });
});
