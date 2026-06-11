import { describe, expect, it } from 'vitest';
import {
  buildProxiedImageRefererAttempts,
  filterProxiedImageRefererAttempts,
  normalizeImageUrl,
  resolveCoverRequestHeaders,
} from '@/lib/http/resolve-cover-referer';
import type { BookSource } from '@/types';

describe('normalizeImageUrl', () => {
  it('去掉 cdn.sshs.rip 图片路径末尾斜杠', () => {
    const raw =
      'https://cdn.sshs.rip/36/a4/36981556a8db192bb71b3d32aeafdda4.webp/';
    expect(normalizeImageUrl(raw)).toBe(
      'https://cdn.sshs.rip/36/a4/36981556a8db192bb71b3d32aeafdda4.webp',
    );
  });

  it('cdn.sshs.rip hash. 占位补全为 hash.webp', () => {
    const raw =
      'https://cdn.sshs.rip/f2/5c/f2eef9f213035104a1f695d2760b125c.';
    expect(normalizeImageUrl(raw)).toBe(
      'https://cdn.sshs.rip/f2/5c/f2eef9f213035104a1f695d2760b125c.webp',
    );
  });

  it('其它站点图片 URL 不受影响', () => {
    const raw = 'https://cdn.example/a.webp?x=1';
    expect(normalizeImageUrl(raw)).toBe(raw);
  });
});

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
