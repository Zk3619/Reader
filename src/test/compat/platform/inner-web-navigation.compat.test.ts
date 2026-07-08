import { describe, expect, it, vi } from 'vitest';

const openInnerWeb = vi.fn((_opts?: unknown) => true);
const loadPersistedInnerWebSession = vi.fn(
  () => null as { url: string; title: string } | null,
);

vi.mock('@/lib/platform/inner-web', () => ({
  openInnerWeb: (opts: unknown) => openInnerWeb(opts),
  loadPersistedInnerWebSession: () => loadPersistedInnerWebSession(),
}));

vi.mock('@/lib/platform/open-url', () => ({
  openExternalUrl: vi.fn(async () => true),
}));

const handleReaderImportDeepLink = vi.fn(async (_uri?: string) => undefined);

vi.mock('@/lib/platform/legado-import-uri', () => ({
  handleReaderImportDeepLink: (uri: string) => handleReaderImportDeepLink(uri),
  isReaderImportDeepLink: (uri: string) => /^(legado|yuedu):/i.test(uri.trim()),
}));

vi.mock('@/components/shared/AppToasts', () => ({
  showAppToast: vi.fn(),
}));

vi.mock('@/lib/http/inner-web-proxy-session', () => ({
  shouldUseInnerWebDocumentProxy: vi.fn(() => false),
}));

describe('buildInnerWebNavigationBridgeScript', () => {
  it('使用 window 标记且包含 shell.open 拦截', async () => {
    const { buildInnerWebNavigationBridgeScript } = await import(
      '@/lib/platform/inner-web-navigation'
    );
    const script = buildInnerWebNavigationBridgeScript();
    expect(script).toContain('__READER_INNER_WEB_NAV__');
    expect(script).not.toContain('document.documentElement.dataset');
    expect(script).toContain('isImportScheme');
    expect(script).toContain('shellOpen');
  });
});

describe('inner_web_panel_bootstrap import links', () => {
  it('yuedu/legado 深链走 location.href 由 on_navigation 拦截（data: 页 invoke 不可用）', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
    const script = readFileSync(join(root, 'src-tauri/scripts/inner_web_panel_bootstrap.js'), 'utf8');
    const importNav = script.slice(script.indexOf('if (!isImportScheme(h)) return;'));
    expect(importNav).toContain('location.href = h');
    expect(importNav).not.toContain('inner_web_panel_open_link');
  });
});

describe('navigateInnerWebLink', () => {
  it('http 链接在当前 InnerWeb 会话内导航', async () => {
    const { navigateInnerWebLink } = await import('@/lib/platform/inner-web-navigation');
    const ok = await navigateInnerWebLink('https://example.com/next', '_blank');
    expect(ok).toBe(true);
    expect(openInnerWeb).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/next',
        useProxyDocument: false,
      }),
    );
  });

  it('legado:// 链接触发应用内导入', async () => {
    openInnerWeb.mockClear();
    handleReaderImportDeepLink.mockClear();
    const { navigateInnerWebLink } = await import('@/lib/platform/inner-web-navigation');
    const uri = 'legado://import/rssSource?src=https%3A%2F%2Fskybook.legado1.top%2Fstaic%2Fskybook.json';
    const ok = await navigateInnerWebLink(uri);
    expect(ok).toBe(true);
    expect(handleReaderImportDeepLink).toHaveBeenCalledWith(uri);
    expect(openInnerWeb).not.toHaveBeenCalled();
  });

  it('相同 http URL 不重复导航', async () => {
    openInnerWeb.mockClear();
    loadPersistedInnerWebSession.mockReturnValue({
      url: 'https://ged520.yeoi.me/',
      title: '网页',
    });
    const { navigateInnerWebLink } = await import('@/lib/platform/inner-web-navigation');
    const ok = await navigateInnerWebLink('https://ged520.yeoi.me/');
    expect(ok).toBe(true);
    expect(openInnerWeb).not.toHaveBeenCalled();
  });
});
