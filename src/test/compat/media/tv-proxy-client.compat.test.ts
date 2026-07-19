import { describe, expect, it } from 'vitest';
import {
  appendProxyHeaders,
  wrapMediaThroughProxy,
} from '@/lib/media/tv/proxy/client';

describe('wrapMediaThroughProxy', () => {
  const base = 'http://127.0.0.1:9978/proxy';

  it('外链套 do=http 并附带 Referer', () => {
    const out = wrapMediaThroughProxy('https://cdn.example/a.m3u8', base, {
      Referer: 'https://site.example/',
      'User-Agent': 'ReaderTest/1',
    });
    expect(out).toContain('do=http');
    expect(out).toContain(encodeURIComponent('https://cdn.example/a.m3u8'));
    const u = new URL(out);
    expect(u.searchParams.get('Referer')).toBe('https://site.example/');
    expect(u.searchParams.get('User-Agent')).toBe('ReaderTest/1');
  });

  it('已是 proxy URL 时仍可补 headers', () => {
    const proxied = `${base}?do=http&url=${encodeURIComponent('https://cdn.example/b.mp4')}`;
    const out = appendProxyHeaders(proxied, { referer: 'https://ref.example' });
    expect(new URL(out).searchParams.get('Referer')).toBe('https://ref.example');
  });

  it('不覆盖已有 Referer', () => {
    const proxied = `${base}?do=http&url=x&Referer=keep`;
    const out = appendProxyHeaders(proxied, { Referer: 'new' });
    expect(new URL(out).searchParams.get('Referer')).toBe('keep');
  });

  it('腾讯链自动补 Referer', () => {
    const out = wrapMediaThroughProxy(
      'https://xx.rdt.tfogc.com:49156/mpvideo.qpic.cn/abc',
      base,
    );
    expect(new URL(out).searchParams.get('Referer')).toBe('https://v.qq.com/');
  });
});
