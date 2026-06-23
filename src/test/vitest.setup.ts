import { vi } from 'vitest';

/**
 * Node 环境下 Pretext / Canvas 文本测量桩
 */
function installCanvasMeasureStub(): void {
  const measureText = (text: string) => ({
    width: Math.max(0, [...text].length * 8),
  });
  const ctx = {
    font: '16px sans-serif',
    measureText,
  };
  if (typeof globalThis.OffscreenCanvas === 'undefined') {
    globalThis.OffscreenCanvas = class OffscreenCanvas {
      width: number;
      height: number;
      constructor(w = 1, h = 1) {
        this.width = w;
        this.height = h;
      }
      getContext() {
        return ctx;
      }
    } as unknown as typeof OffscreenCanvas;
  }
}

installCanvasMeasureStub();

/**
 * Node 环境下规则引擎测试会间接加载书源/登录链路的 UI 依赖；
 * 用 stub 避免 solid-sonner 要求 window。
 */
vi.mock('@/components/shared/AppToasts', () => ({
  showAppToast: vi.fn(),
  DEFAULT_TOAST_DURATION: 3000,
  appToastHostStyle: {},
  createAppToastIcons: () => ({}),
  SonnerInteractionFix: () => null,
}));
