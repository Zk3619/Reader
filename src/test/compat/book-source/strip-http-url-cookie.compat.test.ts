import { describe, expect, it } from 'vitest';
import { resolveUrl, stripMisplacedCookieFromHttpUrl } from '@/lib/book-source/utils';
import { normalizeBookSourceServerUrl } from '@/lib/book-source/source-http';

describe('stripMisplacedCookieFromHttpUrl', () => {
  it('去掉 host 后误粘的 deviceId 并保留路径', () => {
    expect(
      stripMisplacedCookieFromHttpUrl(
        'https://v1.gyks.cf;deviceId=862770e338544ffb/health',
      ),
    ).toBe('https://v1.gyks.cf/health');
  });

  it('保留正常路径', () => {
    expect(stripMisplacedCookieFromHttpUrl('https://v1.gyks.cf/health')).toBe(
      'https://v1.gyks.cf/health',
    );
  });

  it('resolveUrl 使用干净的 base', () => {
    expect(
      resolveUrl(
        'https://v1.gyks.cf;deviceId=862770e338544ffb',
        '/health',
      ),
    ).toBe('https://v1.gyks.cf/health');
  });

  it('normalizeBookSourceServerUrl 同步净化 server 字段', () => {
    expect(
      normalizeBookSourceServerUrl('https://v1.gyks.cf;deviceId=abc'),
    ).toBe('https://v1.gyks.cf');
  });

  it('绝对 URL 打开内嵌页前应去掉 Cookie 后缀', () => {
    expect(
      resolveUrl('https://v1.gyks.cf', 'https://v1.gyks.cf;deviceId=abc/control'),
    ).toBe('https://v1.gyks.cf/control');
  });
});
