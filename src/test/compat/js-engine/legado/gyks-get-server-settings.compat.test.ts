import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { runLoginScript } from '@/lib/js-engine/legado/login-script-runner';
import { getSourceArgsKey } from '@/lib/js-engine/legado/source-script-shared';
import { resolveBookSourceServerUrl } from '@/lib/book-source/source-http';
import type { BookSource } from '@/types';

vi.mock('@/lib/platform/open-url', () => ({
  openLegadoBrowserInApp: vi.fn(),
  openSourceSettingsInApp: vi.fn(),
}));

const SERVER_HTML =
  '<html><body><span id="serverValue">http://101.35.133.34:8888</span></body></html>';

const LOGIN_SCRIPT = `
function getServerSettings() {
  var html = java.startBrowserAwait('data:text/html,test', '光遇服务器设置', false).body();
  var m = html.match(/id=["']serverValue["'][^>]*>([^<]*)/i);
  var host = m ? m[1].trim() : 'https://v1.gyks.cf';
  var vs = {};
  try { vs = JSON.parse(source.getVariable() || '{}'); } catch (e) {}
  vs['线路'] = host;
  source.setVariable(JSON.stringify(vs));
}
`;

describe('login-script getServerSettings', () => {
  const ls = new Map<string, string>();

  beforeEach(() => {
    ls.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => ls.get(k) ?? null,
      setItem: (k: string, v: string) => ls.set(k, v),
      removeItem: (k: string) => ls.delete(k),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('startBrowserAwait().body() 解析 serverValue 后持久化线路', async () => {
    const { openLegadoBrowserInApp } = await import('@/lib/platform/open-url');
    vi.mocked(openLegadoBrowserInApp).mockResolvedValue({
      confirmed: true,
      cookies: '',
      url: 'data:text/html,test',
      body: SERVER_HTML,
    });

    const source = {
      sourceUrl: 'https://v1.gyks.cf',
      bookSourceUrl: 'https://v1.gyks.cf',
      sourceName: '光遇测试',
      loginUrl: LOGIN_SCRIPT,
    } as BookSource;

    const argsKey = getSourceArgsKey(source);
    ls.set(argsKey, JSON.stringify({ 线路: 'https://v1.gyks.cf' }));

    await runLoginScript(source, {
      formValues: {},
      action: 'getServerSettings()',
    });

    expect(openLegadoBrowserInApp).toHaveBeenCalled();
    const saved = JSON.parse(ls.get(argsKey) ?? '{}') as Record<string, string>;
    expect(saved['线路']).toBe('http://101.35.133.34:8888');
    expect(resolveBookSourceServerUrl(source)).toBe('http://101.35.133.34:8888');
    expect(saved['server']).toBe('http://101.35.133.34:8888');
  });

  it('header 遗留 server=v1 时登录切线仍覆盖为 IP', async () => {
    const { openLegadoBrowserInApp } = await import('@/lib/platform/open-url');
    vi.mocked(openLegadoBrowserInApp).mockResolvedValue({
      confirmed: true,
      cookies: '',
      url: 'data:text/html,test',
      body: SERVER_HTML,
    });

    const source = {
      sourceUrl: 'https://v1.gyks.cf',
      bookSourceUrl: '光遇聚合',
      sourceName: '光遇测试',
      loginUrl: LOGIN_SCRIPT,
      header: '{"server":"https://v1.gyks.cf","deviceId":"715526ded4651ef6"}',
    } as BookSource;

    const argsKey = getSourceArgsKey(source);
    ls.set(
      argsKey,
      JSON.stringify({ server: 'https://v1.gyks.cf', deviceId: '715526ded4651ef6' }),
    );

    await runLoginScript(source, {
      formValues: {},
      action: 'getServerSettings()',
    });

    const saved = JSON.parse(ls.get(argsKey) ?? '{}') as Record<string, string>;
    expect(saved['线路']).toBe('http://101.35.133.34:8888');
    expect(saved['server']).toBe('http://101.35.133.34:8888');
    expect(resolveBookSourceServerUrl(source)).toBe('http://101.35.133.34:8888');
  });
});
