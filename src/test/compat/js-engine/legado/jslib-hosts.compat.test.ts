import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  isPlausibleBookSourceServerUrl,
  parseHostsFromJsLib,
} from '@/lib/js-engine/legado/jslib-hosts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GUANGYU_FIXTURE = join(__dirname, '../../../../../examples/光遇聚合.txt');

describe('parseHostsFromJsLib', () => {
  it('光遇聚合仅解析 hosts 数组，不含 HTML CDN', () => {
    const raw = JSON.parse(readFileSync(GUANGYU_FIXTURE, 'utf8')) as { jsLib: string }[];
    const hosts = parseHostsFromJsLib(raw[0]!.jsLib);
    expect(hosts).toEqual([
      'https://v1.gyks.cf',
      'https://v2.gyks.cf',
      'https://v3.gyks.cf',
      'https://v4.gyks.cf',
      'https://v5.gyks.cf',
      'https://v6.gyks.cf',
      'https://v7.gyks.cf',
      'http://101.35.133.34:8888',
    ]);
    expect(hosts.some((h) => h.includes('font-awesome'))).toBe(false);
    expect(hosts.some((h) => h.includes('legado.gyks.cf'))).toBe(false);
    expect(hosts.some((h) => h.includes('sy.gyks.cf'))).toBe(false);
  });

  it('支持 var host 数组', () => {
    const jsLib = `var host = [
      'https://v1.gyks.cf',
      'https://v2.gyks.cf',
    ];`;
    expect(parseHostsFromJsLib(jsLib)).toEqual([
      'https://v1.gyks.cf',
      'https://v2.gyks.cf',
    ]);
  });

  it('过滤静态资源与非 API 域名', () => {
    expect(
      isPlausibleBookSourceServerUrl(
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
      ),
    ).toBe(false);
    expect(isPlausibleBookSourceServerUrl('http://www.w3.org/2000/svg')).toBe(false);
    expect(isPlausibleBookSourceServerUrl('https://legado.gyks.cf')).toBe(false);
    expect(isPlausibleBookSourceServerUrl('https://v6.gyks.cf')).toBe(true);
  });
});
