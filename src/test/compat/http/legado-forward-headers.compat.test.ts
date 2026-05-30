import { describe, expect, it } from 'vitest';
import {
  decodeLegadoForwardHeaders,
  encodeLegadoForwardHeaders,
} from '@/lib/http/legado-forward-headers';

describe('legado-forward-headers', () => {
  it('编解码保留 webp 文件名中的下划线与页码', () => {
    const src = {
      Referer: 'https://manhuafree.com/',
      'User-Agent': 'LegadoUA',
      Cookie: 'sid=abc',
    };
    const enc = encodeLegadoForwardHeaders(src);
    expect(enc).toBeTruthy();
    const dec = decodeLegadoForwardHeaders(enc);
    expect(dec.Referer).toBe('https://manhuafree.com/');
    expect(dec.Cookie).toBe('sid=abc');
  });
});
