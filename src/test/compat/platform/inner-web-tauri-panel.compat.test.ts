import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn(async (_cmd?: string, _args?: Record<string, unknown>) => undefined);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => invoke(cmd, args),
}));

vi.mock('@/lib/platform/detect', () => ({
  isTauri: vi.fn(() => true),
}));

describe('inner-web-tauri panel session epoch', () => {
  beforeEach(async () => {
    invoke.mockClear();
    const mod = await import('@/lib/platform/inner-web-tauri');
    mod.bumpInnerWebPanelSessionEpoch();
    mod.bumpInnerWebPanelSessionEpoch();
  });

  it('close 后过期的 open 不再 invoke', async () => {
    const {
      bumpInnerWebPanelSessionEpoch,
      closeInnerWebTauriPanel,
      getInnerWebPanelSessionEpoch,
      openInnerWebTauriPanel,
    } = await import('@/lib/platform/inner-web-tauri');

    const epoch = getInnerWebPanelSessionEpoch();
    const rect = { x: 0, y: 0, width: 100, height: 100 };

    const openPromise = openInnerWebTauriPanel({
      url: 'https://example.com/page',
      cookies: '',
      rect,
    });
    bumpInnerWebPanelSessionEpoch();
    await closeInnerWebTauriPanel();
    await openPromise;

    expect(epoch).toBeLessThan(getInnerWebPanelSessionEpoch());
    expect(invoke).toHaveBeenCalledWith('close_inner_web_panel');
    expect(invoke).not.toHaveBeenCalledWith(
      'open_inner_web_panel',
      expect.objectContaining({ url: 'https://example.com/page' }),
    );
  });

  it('正常 open 仍会 invoke', async () => {
    const { openInnerWebTauriPanel } = await import('@/lib/platform/inner-web-tauri');
    await openInnerWebTauriPanel({
      url: 'https://example.com/ok',
      cookies: 'a=1',
      rect: { x: 1, y: 2, width: 200, height: 300 },
    });
    expect(invoke).toHaveBeenCalledWith(
      'open_inner_web_panel',
      expect.objectContaining({
        url: 'https://example.com/ok',
        cookies: 'a=1',
      }),
    );
  });
});
