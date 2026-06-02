import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/platform/detect', () => ({
  isTauri: vi.fn(() => true),
  isMobile: vi.fn(() => false),
}));

vi.mock('@/lib/platform/inner-web-mode', () => ({
  resolveInnerWebUsesTauriPanel: vi.fn(() => true),
}));

import { shouldUseInnerWebDocumentProxy } from '@/lib/http/inner-web-proxy-session';

describe('shouldUseInnerWebDocumentProxy', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Tauri panel 默认不走代理', () => {
    expect(shouldUseInnerWebDocumentProxy('https://example.com', 'a=1')).toBe(false);
  });
});
