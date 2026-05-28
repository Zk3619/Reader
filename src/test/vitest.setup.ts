import { vi } from 'vitest';

/**
 * Node 环境下规则引擎测试会间接加载书源/登录链路的 UI 依赖；
 * 用 stub 避免 solid-sonner 要求 window。
 */
vi.mock('@/components/shared/AppToasts', () => ({
  showAppToast: vi.fn(),
  showScriptToast: vi.fn(),
  DEFAULT_TOAST_DURATION: 3000,
  appToastHostStyle: {},
  createAppToastIcons: () => ({}),
  SonnerInteractionFix: () => null,
}));
