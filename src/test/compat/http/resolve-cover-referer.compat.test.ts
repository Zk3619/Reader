import { describe, expect, it } from 'vitest';
import {
  buildProxiedImageRefererAttempts,
  filterProxiedImageRefererAttempts,
  resolveCoverRequestHeaders,
} from '@/lib/http/resolve-cover-referer';
import type { BookSource } from '@/types';

describe('resolveCoverRequestHeaders', () => {
  it('无章节页时剥掉书源跨域 Referer 后回退图床同源', () => {
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

  it('有章节页时保留跨站 Referer（勿换成 CDN 同源）', () => {
    const url = 'https://f40-1-4.g-mh.online/kk/a.webp';
    const headers = resolveCoverRequestHeaders(
      'https://manhuafree.com/chapter/1',
      null,
      url,
      { 'User-Agent': 'LegadoUA' },
    );
    expect(headers.Referer).toBe('https://manhuafree.com/chapter/1');
    expect(headers['User-Agent']).toBe('LegadoUA');
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

  it('跨站 Legado Referer 时优先 Legado 再图床同源', () => {
    const url = 'https://f40-1-4.g-mh.online/kk/a.webp';
    const attempts = buildProxiedImageRefererAttempts(url, {
      Referer: 'https://manhuafree.com/',
    });
    expect(attempts[0]).toBe('https://manhuafree.com/');
    expect(attempts[1]).toBe('https://f40-1-4.g-mh.online/');
    expect(attempts).toContain('none');
  });

  it('无 Legado Referer 时用章节页作为候选', () => {
    const url = 'https://f40-1-4.g-mh.online/kk/a.webp';
    const attempts = buildProxiedImageRefererAttempts(
      url,
      { 'User-Agent': 'LegadoUA' },
      { pageReferer: 'https://manhuafree.com/chapter/1' },
    );
    expect(attempts[0]).toBe('https://manhuafree.com/chapter/1');
    expect(attempts[1]).toBe('https://f40-1-4.g-mh.online/');
  });
});

describe('filterProxiedImageRefererAttempts', () => {
  it('有阅读页 Referer 时过滤 referer=none', () => {
    const attempts = filterProxiedImageRefererAttempts(
      ['https://manhuafree.com/', 'https://cdn.example/', 'none'],
      null,
      'https://manhuafree.com/chapter/1',
    );
    expect(attempts).not.toContain('none');
  });
});
