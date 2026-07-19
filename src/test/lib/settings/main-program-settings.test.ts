import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUTO_CHECK_UPDATES,
  DEFAULT_APP_FONT_FAMILY,
  DEFAULT_APP_FONT_PATH,
  DEFAULT_APP_FONT_SIZE,
  DEFAULT_NETWORK_REQUEST_TIMEOUT_SECONDS,
  DEFAULT_NETWORK_RETRY_COUNT,
  DEFAULT_STARTUP_PAGE,
  STARTUP_PAGE_LAST_USED,
  desktopIntegrationUnavailableReason,
  getRuntimeNetworkDefaults,
  listStartupPageOptions,
  normalizeMainProgramSettings,
  normalizeStartupPage,
  parseStartupPageTarget,
  setRuntimeNetworkDefaults,
} from '@/lib/settings/main-program-settings';

describe('main-program-settings', () => {
  it('provides stable defaults for newly persisted settings', () => {
    expect(normalizeMainProgramSettings({})).toEqual({
      startupPage: DEFAULT_STARTUP_PAGE,
      networkRequestTimeoutSeconds: DEFAULT_NETWORK_REQUEST_TIMEOUT_SECONDS,
      networkRetryCount: DEFAULT_NETWORK_RETRY_COUNT,
      autoCheckUpdates: DEFAULT_AUTO_CHECK_UPDATES,
      appFontSize: DEFAULT_APP_FONT_SIZE,
      appFontFamily: DEFAULT_APP_FONT_FAMILY,
      appFontPath: DEFAULT_APP_FONT_PATH,
    });
    expect(DEFAULT_STARTUP_PAGE).toBe(STARTUP_PAGE_LAST_USED);
  });

  it('normalizes stored values into supported ranges', () => {
    expect(
      normalizeMainProgramSettings({
        startupPage: 'last-used',
        networkRequestTimeoutSeconds: 999,
        networkRetryCount: -2,
        autoCheckUpdates: false,
        appFontSize: 100,
        appFontFamily: '  Microsoft YaHei  ',
        appFontPath: '  C:\\Fonts\\a.ttf  ',
      }),
    ).toEqual({
      startupPage: 'last-used',
      networkRequestTimeoutSeconds: 300,
      networkRetryCount: 0,
      autoCheckUpdates: false,
      appFontSize: 24,
      appFontFamily: 'Microsoft YaHei',
      appFontPath: 'C:\\Fonts\\a.ttf',
    });
  });

  it('migrates legacy bookshelf startup page and lists module sidebar options', () => {
    expect(normalizeStartupPage('bookshelf')).toBe('reader:shelf');
    const options = listStartupPageOptions();
    expect(options[0]).toEqual({ value: 'last-used', label: '上次页面' });
    expect(options.some((o) => o.value === 'reader:shelf')).toBe(true);
    expect(options.some((o) => o.value === 'music:search')).toBe(true);
    expect(options.some((o) => o.value === 'tv:home')).toBe(true);
    expect(options.some((o) => o.value === 'subscribe:home')).toBe(true);
    expect(parseStartupPageTarget('music:songlist')).toEqual({
      shellPage: 'music',
      navId: 'songlist',
    });
    expect(parseStartupPageTarget('last-used')).toBeNull();
  });

  it('describes unsupported desktop integrations by runtime', () => {
    expect(desktopIntegrationUnavailableReason('tauri-desktop')).toBeNull();
    expect(desktopIntegrationUnavailableReason('web')).toContain('浏览器');
    expect(desktopIntegrationUnavailableReason('android')).toContain('Android');
  });

  it('updates the defaults consumed by the shared HTTP module', () => {
    setRuntimeNetworkDefaults({ timeoutSeconds: 45, retryCount: 3 });
    expect(getRuntimeNetworkDefaults()).toEqual({ timeoutSeconds: 45, retryCount: 3 });
    setRuntimeNetworkDefaults({
      timeoutSeconds: DEFAULT_NETWORK_REQUEST_TIMEOUT_SECONDS,
      retryCount: DEFAULT_NETWORK_RETRY_COUNT,
    });
  });
});
