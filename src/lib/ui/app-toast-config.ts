import { isMobile } from '@/lib/platform/detect';
import { SHELL_COMPACT_MAX_WIDTH } from '@/lib/shell/layout';
import type { ToastSwipeDirection } from '@kobalte/core/toast';

/** solid-sonner Toaster `swipeDirections` 项（库内未导出） */
export type SonnerSwipeDirection = 'top' | 'right' | 'bottom' | 'left';

/** Toast 风格：默认（Reader 定制 Sonner）、Sonner 原生、Kobalte Toast */
export type AppToastStyle = 'default' | 'sonner' | 'toast';

export type AppToastPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'top-center'
  | 'bottom-center';

export const DEFAULT_APP_TOAST_STYLE: AppToastStyle = 'default';
export const DEFAULT_APP_TOAST_POSITION: AppToastPosition = 'bottom-right';

export const APP_TOAST_STYLE_LABELS: Record<AppToastStyle, string> = {
  default: '默认',
  sonner: 'Sonner',
  toast: 'Toast',
};

export const APP_TOAST_STYLE_DESCRIPTIONS: Record<AppToastStyle, string> = {
  default: '当前 Reader 定制样式：图标、进度条与展开滚动等增强。',
  sonner: 'solid-sonner 标准样式，更贴近 shadcn/ui 默认外观。',
  toast: 'Kobalte Toast 组件样式，卡片式通知。',
};

export const APP_TOAST_POSITION_LABELS: Record<AppToastPosition, string> = {
  'top-left': '左上',
  'top-right': '右上',
  'top-center': '顶部中心',
  'bottom-left': '左下',
  'bottom-right': '右下',
  'bottom-center': '底部中心',
};

export const APP_TOAST_POSITION_OPTIONS: AppToastPosition[] = [
  'top-center',
  'bottom-center',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];

export const APP_TOAST_MOBILE_POSITION_OPTIONS: AppToastPosition[] = [
  'top-center',
  'bottom-center',
];

export const KOBALTE_TOAST_REGION_ID = 'reader-app-toast';

export function isCompactMobileViewport(): boolean {
  return (
    isMobile() &&
    typeof window !== 'undefined' &&
    window.innerWidth < SHELL_COMPACT_MAX_WIDTH
  );
}

export function normalizeAppToastStyle(style: AppToastStyle | undefined): AppToastStyle {
  if (style === 'sonner' || style === 'toast') return style;
  return DEFAULT_APP_TOAST_STYLE;
}

export function normalizeAppToastPosition(
  position: AppToastPosition | undefined,
  compactMobile = isCompactMobileViewport(),
): AppToastPosition {
  const value = position ?? DEFAULT_APP_TOAST_POSITION;
  if (compactMobile && !APP_TOAST_MOBILE_POSITION_OPTIONS.includes(value)) {
    return value.startsWith('top') ? 'top-center' : 'bottom-center';
  }
  return value;
}

export function appToastPositionOptions(compactMobile = isCompactMobileViewport()): AppToastPosition[] {
  return compactMobile ? APP_TOAST_MOBILE_POSITION_OPTIONS : APP_TOAST_POSITION_OPTIONS;
}

export function appToastSwipeDirections(position: AppToastPosition): SonnerSwipeDirection[] {
  switch (position) {
    case 'top-left':
      return ['top', 'left'];
    case 'top-right':
      return ['top', 'right'];
    case 'top-center':
      return ['top'];
    case 'bottom-left':
      return ['bottom', 'left'];
    case 'bottom-right':
      return ['bottom', 'right'];
    case 'bottom-center':
      return ['bottom'];
    default:
      return ['bottom', 'right'];
  }
}

export function kobalteToastSwipeDirection(position: AppToastPosition): ToastSwipeDirection {
  switch (position) {
    case 'top-left':
    case 'bottom-left':
      return 'left';
    case 'top-right':
    case 'bottom-right':
      return 'right';
    case 'top-center':
      return 'up';
    case 'bottom-center':
      return 'down';
    default:
      return 'right';
  }
}

export function toastListPositionClass(position: AppToastPosition): string {
  const base =
    'fixed z-100 flex max-h-screen w-full max-w-[420px] flex-col gap-3 p-4 pointer-events-none [&>*]:pointer-events-auto';
  switch (position) {
    case 'top-left':
      return `${base} top-0 left-0 items-start`;
    case 'top-right':
      return `${base} top-0 right-0 items-end`;
    case 'top-center':
      return `${base} top-0 left-1/2 -translate-x-1/2 items-center`;
    case 'bottom-left':
      return `${base} bottom-0 left-0 flex-col-reverse items-start`;
    case 'bottom-right':
      return `${base} bottom-0 right-0 flex-col-reverse items-end`;
    case 'bottom-center':
      return `${base} bottom-0 left-1/2 -translate-x-1/2 flex-col-reverse items-center`;
    default:
      return `${base} bottom-0 right-0 flex-col-reverse items-end`;
  }
}
