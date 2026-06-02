import { describe, expect, it } from 'vitest';
import { parseHeaders, sanitizeHttpHeaders } from '@/lib/book-source/utils';

/** 第一版主 banzhu 书源常见 Legado 单引号伪 JSON header */
const BANZHU_HEADER =
  "{'User-Agent':'Mozilla/5.0 (Linux; Android 14; V2304A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/123.0.6312.118 Mobile Safari/537.36',\n\"Referer\":\"https://banzhu66666.net/\",\n\"Cookie\":\"1\"}";

describe('parseHeaders', () => {
  it('parses Legado single-quoted pseudo-JSON without quoted keys', () => {
    const h = parseHeaders(BANZHU_HEADER);
    expect(Object.keys(h)).toEqual(
      expect.arrayContaining(['User-Agent', 'Referer', 'Cookie']),
    );
    expect(h['User-Agent']).toContain('Chrome/123');
    expect(h.Referer).toBe('https://banzhu66666.net/');
    expect(h.Cookie).toBe('1');
    for (const key of Object.keys(h)) {
      expect(key).not.toMatch(/['"]/);
    }
  });

  it('sanitizeHttpHeaders drops invalid fetch header names', () => {
    const safe = sanitizeHttpHeaders({
      "'User-Agent'": 'bad-key',
      'User-Agent': 'ok',
      '': 'empty',
      'X-{{page}}': 'tpl',
    });
    expect(safe).toEqual({ 'User-Agent': 'ok' });
  });
});
