import { isMobile } from '@/lib/platform/detect';
import { SHELL_COMPACT_MAX_WIDTH } from '@/lib/shell/layout';

/** solid-sonner Toaster `swipeDirections` 项（库内未导出） */
export type SonnerSwipeDirection = 'top' | 'right' | 'bottom' | 'left';

export type AppToastPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'top-center'
  | 'bottom-center';

export const DEFAULT_APP_TOAST_POSITION: AppToastPosition = 'bottom-right';

/** 同屏最多显示的通知条数（solid-sonner `visibleToasts`） */
export const DEFAULT_APP_TOAST_VISIBLE_LIMIT = 3;
export const MIN_APP_TOAST_VISIBLE_LIMIT = 1;
export const MAX_APP_TOAST_VISIBLE_LIMIT = 6;

/** solid-sonner `expand`：开启后多条通知以缩放样式叠放，悬停可展开 */
export const DEFAULT_APP_TOAST_EXPAND = true;

/**
 * Sonner `expand` 与 UI「堆叠缩放」开关语义相反：
 * - 堆叠缩放开 → `expand={false}`（默认叠放，悬停展开）
 * - 堆叠缩放关 → `expand={true}`（始终展开为独立卡片）
 */
export function resolveSonnerToasterExpand(stackScalingEnabled?: boolean): boolean {
  return !normalizeAppToastExpand(stackScalingEnabled);
}

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

/**
 * 移动端 Sonner `mobileOffset`：避开刘海/手势条，并给屏幕圆角留出水平余量，
 * 避免顶/底全宽通知的两角被物理圆角裁切。
 */
export const APP_TOAST_MOBILE_OFFSET = {
  top: 'max(1rem, calc(var(--safe-area-top-effective, env(safe-area-inset-top, 0px)) + 0.5rem))',
  bottom:
    'max(1rem, calc(var(--safe-area-bottom-effective, env(safe-area-inset-bottom, 0px)) + 0.5rem))',
  left: 'max(1.5rem, calc(env(safe-area-inset-left, 0px) + 0.75rem))',
  right: 'max(1.5rem, calc(env(safe-area-inset-right, 0px) + 0.75rem))',
} as const;

export function isCompactMobileViewport(): boolean {
  return (
    isMobile() &&
    typeof window !== 'undefined' &&
    window.innerWidth < SHELL_COMPACT_MAX_WIDTH
  );
}

export function normalizeAppToastVisibleLimit(limit: number | undefined): number {
  const value = limit ?? DEFAULT_APP_TOAST_VISIBLE_LIMIT;
  if (!Number.isFinite(value)) return DEFAULT_APP_TOAST_VISIBLE_LIMIT;
  return Math.min(MAX_APP_TOAST_VISIBLE_LIMIT, Math.max(MIN_APP_TOAST_VISIBLE_LIMIT, Math.round(value)));
}

export function normalizeAppToastExpand(expand: boolean | undefined): boolean {
  return expand ?? DEFAULT_APP_TOAST_EXPAND;
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

export function appToastSwipeDirections(
  position: AppToastPosition,
  mobile = isMobile(),
): SonnerSwipeDirection[] {
  let directions: SonnerSwipeDirection[];
  switch (position) {
    case 'top-left':
      directions = ['top', 'left'];
      break;
    case 'top-right':
      directions = ['top', 'right'];
      break;
    case 'top-center':
      directions = ['top'];
      break;
    case 'bottom-left':
      directions = ['bottom', 'left'];
      break;
    case 'bottom-right':
      directions = ['bottom', 'right'];
      break;
    case 'bottom-center':
      directions = ['bottom'];
      break;
    default:
      directions = ['bottom', 'right'];
  }
  // 移动端底/顶中心原先只允许纵向滑，和系统手势冲突且不好划；补左右滑关闭
  if (mobile) {
    return [...new Set<SonnerSwipeDirection>([...directions, 'left', 'right'])];
  }
  return directions;
}
