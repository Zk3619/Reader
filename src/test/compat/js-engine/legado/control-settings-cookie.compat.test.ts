import { describe, expect, it } from 'vitest';
import {
  filterControlSettingsCookieHeader,
  normalizeControlSettingsCookieHeader,
  parseControlSettingsCookieMap,
} from '@/lib/js-engine/legado/normalize-legado-ajax-body';

describe('control settings cookie header', () => {
  it('去掉 User-Agent，避免 applyCookieSettings 按 ;  拆错', () => {
    const raw =
      'info=on; disabled_sources=1; qttoken=abc12345678901234567890123456789012; User-Agent=Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36';
    const filtered = filterControlSettingsCookieHeader(raw);
    expect(filtered).toMatch(/info=on/);
    expect(filtered).toMatch(/disabled_sources=1/);
    expect(filtered).not.toMatch(/User-Agent/i);
    expect(filtered).not.toMatch(/AppleWebKit/);
  });

  it('parseControlSettingsCookieMap 可解析 ;  分隔的设置项', () => {
    const normalized = normalizeControlSettingsCookieHeader(
      'info=off; tab=漫画; proxy=云端',
    );
    const map = parseControlSettingsCookieMap(normalized);
    expect(map.get('info')).toBe('off');
    expect(map.get('tab')).toBe('漫画');
    expect(map.get('proxy')).toBe('云端');
  });
});
