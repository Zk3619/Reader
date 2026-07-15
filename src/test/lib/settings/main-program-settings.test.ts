import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUTO_CHECK_UPDATES,
  DEFAULT_APP_FONT_FAMILY,
  DEFAULT_APP_FONT_SIZE,
  DEFAULT_NETWORK_REQUEST_TIMEOUT_SECONDS,
  DEFAULT_NETWORK_RETRY_COUNT,
  DEFAULT_STARTUP_PAGE,
  desktopIntegrationUnavailableReason,
  getRuntimeNetworkDefaults,
  normalizeMainProgramSettings,
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
    });
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
      }),
    ).toEqual({
      startupPage: 'last-used',
      networkRequestTimeoutSeconds: 300,
      networkRetryCount: 0,
      autoCheckUpdates: false,
      appFontSize: 24,
      appFontFamily: 'Microsoft YaHei',
    });
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
