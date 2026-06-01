import { describe, expect, it } from 'vitest';
import {
  buildBrowserImageRefererAttempts,
  buildProxiedImageRefererAttempts,
  resolveCoverRequestHeaders,
} from '@/lib/http/resolve-cover-referer';
import type { BookSource } from '@/types';

describe('resolveCoverRequestHeaders', () => {
  it('剥掉聚合站跨域 Referer 后回退图床同源', () => {
    const url =
      'https://f40-1-4.g-mh.online/kk/moshirenhuangfanyouqinggeweinturuzuo-ir660596/1/MjFjOGExM2RfMV8x_1.webp';
    const source = {
      sourceName: 'test',
      sourceUrl: 'test',
      header: 'Referer: https://v1.gyks.cf/\nCookie: qttoken=1',
    } as BookSource;
    const headers = resolveCoverRequestHeaders(null, source, url, {
      'User-Agent': 'LegadoUA',
    });
    expect(headers['User-Agent']).toBe('LegadoUA');
    expect(headers.Referer).toBe('https://f40-1-4.g-mh.online/');
  });

  it('保留 Legado 指定的跨站 Referer', () => {
    const url = 'https://f40-1-4.g-mh.online/kk/a.webp';
    const headers = resolveCoverRequestHeaders(null, null, url, {
      Referer: 'https://manhuafree.com/',
      'User-Agent': 'LegadoUA',
    });
    expect(headers.Referer).toBe('https://manhuafree.com/');
  });
});

describe('buildProxiedImageRefererAttempts', () => {
  it('无 Legado Referer 时含图床同源', () => {
    const url = 'https://f40-1-4.g-mh.online/kk/a.webp';
    const attempts = buildProxiedImageRefererAttempts(url, { 'User-Agent': 'UA' });
    expect(attempts[0]).toBe('https://f40-1-4.g-mh.online/');
    expect(attempts).toContain('none');
  });

  it('跨站 Legado Referer 时先试图床同源', () => {
    const url = 'https://f40-1-4.g-mh.online/kk/a.webp';
    const attempts = buildProxiedImageRefererAttempts(url, {
      Referer: 'https://manhuafree.com/',
    });
    expect(attempts[0]).toBe('https://f40-1-4.g-mh.online/');
    expect(attempts[1]).toBe('https://manhuafree.com/');
  });
});

describe('buildBrowserImageRefererAttempts', () => {
  it('跨站 Legado Referer 时浏览器先走 Legado', () => {
    const url = 'https://f40-1-4.g-mh.online/kk/a.webp';
    const attempts = buildBrowserImageRefererAttempts(url, {
      Referer: 'https://manhuafree.com/',
    });
    expect(attempts[0]).toBe('https://manhuafree.com/');
    expect(attempts[1]).toBe('https://f40-1-4.g-mh.online/');
  });
});
