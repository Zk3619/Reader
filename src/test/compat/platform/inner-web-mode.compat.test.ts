import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/platform/detect', () => ({
  isTauri: vi.fn(() => true),
  isMobile: vi.fn(() => false),
}));

vi.mock('@/stores/settings', () => ({
  settingsState: { app: { innerWebRenderMode: 'auto' as const } },
}));

import { isMobile, isTauri } from '@/lib/platform/detect';
import {
  markInnerWebPanelSessionFallback,
  onInnerWebSessionEnded,
  resetInnerWebPanelRuntimeAvailability,
  resolveInnerWebUsesTauriPanel,
  setInnerWebForceTauriPanel,
  useInnerWebIframe,
} from '@/lib/platform/inner-web-mode';
import { settingsState } from '@/stores/settings';

describe('inner-web-mode', () => {
  beforeEach(() => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(isMobile).mockReturnValue(false);
    settingsState.app.innerWebRenderMode = 'auto';
    resetInnerWebPanelRuntimeAvailability();
    onInnerWebSessionEnded();
  });

  it('Tauri 桌面 https 在 auto 下使用 panel', () => {
    expect(resolveInnerWebUsesTauriPanel({ url: 'https://example.com' })).toBe(true);
    expect(useInnerWebIframe({ url: 'https://example.com' })).toBe(false);
  });

  it('iframe 偏好强制 iframe', () => {
    settingsState.app.innerWebRenderMode = 'iframe';
    expect(resolveInnerWebUsesTauriPanel({ url: 'https://example.com' })).toBe(false);
    expect(useInnerWebIframe({ url: 'https://example.com' })).toBe(true);
  });

  it('auto 回退后会话内改用 iframe 并记住 runtime 不可用', () => {
    markInnerWebPanelSessionFallback();
    expect(resolveInnerWebUsesTauriPanel({ url: 'https://example.com' })).toBe(false);
    onInnerWebSessionEnded();
    expect(resolveInnerWebUsesTauriPanel({ url: 'https://example.com' })).toBe(false);
  });

  it('onInnerWebSessionEnded 清除会话回退但保留 auto runtime 标记', () => {
    markInnerWebPanelSessionFallback();
    onInnerWebSessionEnded();
    resetInnerWebPanelRuntimeAvailability();
    expect(resolveInnerWebUsesTauriPanel({ url: 'https://example.com' })).toBe(true);
  });

  it('纯 Web 环境（非 Tauri）始终 iframe', () => {
    vi.mocked(isTauri).mockReturnValue(false);
    expect(resolveInnerWebUsesTauriPanel({ url: 'https://example.com' })).toBe(false);
    expect(useInnerWebIframe({ url: 'https://example.com' })).toBe(true);
  });

  it('forceTauriPanel 覆盖 iframe 偏好与 auto 回退', () => {
    settingsState.app.innerWebRenderMode = 'iframe';
    setInnerWebForceTauriPanel(true);
    expect(resolveInnerWebUsesTauriPanel({ url: 'https://music.163.com/' })).toBe(true);
    expect(useInnerWebIframe({ url: 'https://music.163.com/' })).toBe(false);
    markInnerWebPanelSessionFallback();
    expect(resolveInnerWebUsesTauriPanel({ url: 'https://music.163.com/' })).toBe(true);
  });
});
