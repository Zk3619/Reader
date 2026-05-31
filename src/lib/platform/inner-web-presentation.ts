/**
 * Inner-Web 浮层展示配置：全屏 / 四向抽屉 / 居中卡片、顶栏、遮罩、动画等。
 */

import { appOverlayScrim, hDrawerPanel, hInnerWebDrawerPanel } from '@/lib/ui/viewport-classes';
export type InnerWebLayoutMode = 'fullscreen' | 'drawer' | 'center';

export type InnerWebDrawerSide = 'bottom' | 'top' | 'left' | 'right';

export type InnerWebAnimation =
  | 'none'
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'zoom';

export interface InnerWebDrawerOptions {
  /** 抽屉附着边（默认 bottom） */
  side?: InnerWebDrawerSide;
  /** bottom/top 为高度，left/right 为宽度 */
  size?: string;
  /** 显示拖动手柄条（对齐 AppDrawer showNativeDragHandle，默认 false） */
  showNativeDragHandle?: boolean;
  /** 拖拽关闭 / 滑至 snap 0（默认 true） */
  dragToDismiss?: boolean;
}

export interface InnerWebHeaderOptions {
  visible?: boolean;
  showBack?: boolean;
  showRefresh?: boolean;
  showConfirm?: boolean;
  showMoreMenu?: boolean;
  showWindowControls?: boolean;
  compact?: boolean;
  class?: string;
}

export interface InnerWebBackdropOptions {
  visible?: boolean;
  dismissOnClick?: boolean;
  class?: string;
  blur?: boolean;
}

export interface InnerWebPresentation {
  preset?: 'default' | 'paragraph-review';
  layout?: InnerWebLayoutMode | 'sheet';
  drawer?: InnerWebDrawerOptions;
  maxWidth?: string;
  header?: InnerWebHeaderOptions;
  backdrop?: InnerWebBackdropOptions;
  layerClass?: string;
  panelClass?: string;
  contentClass?: string;
  animation?: InnerWebAnimation;
  animationDurationMs?: number;
  allowRootInteraction?: boolean;
  bodyClass?: string;
}

export interface ResolvedInnerWebDrawer {
  side: InnerWebDrawerSide;
  size: string;
  showNativeDragHandle: boolean;
  dragToDismiss: boolean;
}

export interface ResolvedInnerWebPresentation {
  layout: InnerWebLayoutMode;
  drawer: ResolvedInnerWebDrawer;
  maxWidth: string;
  header: Required<Omit<InnerWebHeaderOptions, 'class'>> & { class?: string };
  backdrop: Required<Omit<InnerWebBackdropOptions, 'class'>> & { class?: string };
  layerClass?: string;
  panelClass?: string;
  contentClass?: string;
  animation: InnerWebAnimation;
  animationDurationMs: number;
  allowRootInteraction: boolean;
  bodyClass?: string;
}

const PRESET_PARAGRAPH_REVIEW: InnerWebPresentation = {
  preset: 'paragraph-review',
  layout: 'drawer',
  drawer: {
    side: 'bottom',
    size: '72dvh',
    showNativeDragHandle: false,
    dragToDismiss: true,
  },
  header: {
    showConfirm: false,
    showWindowControls: false,
    compact: true,
  },
  backdrop: {
    visible: true,
    dismissOnClick: true,
    blur: true,
  },
  panelClass:
    'rounded-t-2xl border-t border-border/60 bg-background shadow-2xl overflow-hidden',
};

const PRESET_DEFAULT: InnerWebPresentation = {
  preset: 'default',
  layout: 'fullscreen',
  animation: 'fade',
};

const PRESETS: Record<'default' | 'paragraph-review', InnerWebPresentation> = {
  default: PRESET_DEFAULT,
  'paragraph-review': PRESET_PARAGRAPH_REVIEW,
};

export const INNER_WEB_SESSION_BODY_CLASSES = [
  'reader-inner-web-session',
  'reader-inner-web-session--fullscreen',
  'reader-inner-web-session--drawer',
  'reader-inner-web-session--drawer-bottom',
  'reader-inner-web-session--drawer-top',
  'reader-inner-web-session--drawer-left',
  'reader-inner-web-session--drawer-right',
  'reader-inner-web-session--center',
  'reader-inner-web-session--allow-root',
] as const;

let lastDynamicBodyClass: string | undefined;

function mergeHeader(
  base: InnerWebHeaderOptions | undefined,
  over: InnerWebHeaderOptions | undefined,
): InnerWebHeaderOptions {
  return { ...base, ...over };
}

function mergeBackdrop(
  base: InnerWebBackdropOptions | undefined,
  over: InnerWebBackdropOptions | undefined,
): InnerWebBackdropOptions {
  return { ...base, ...over };
}

function mergeDrawer(
  base: InnerWebDrawerOptions | undefined,
  over: InnerWebDrawerOptions | undefined,
): InnerWebDrawerOptions {
  return { ...base, ...over };
}

function mergePresentation(
  base: InnerWebPresentation,
  over?: InnerWebPresentation,
): InnerWebPresentation {
  if (!over) return { ...base };
  return {
    ...base,
    ...over,
    header: mergeHeader(base.header, over.header),
    backdrop: mergeBackdrop(base.backdrop, over.backdrop),
    drawer: mergeDrawer(base.drawer, over.drawer),
  };
}

function normalizeLayout(raw: InnerWebPresentation): InnerWebLayoutMode {
  const layout = raw.layout ?? 'fullscreen';
  if (layout === 'sheet') return 'drawer';
  return layout;
}

function defaultDrawerSize(side: InnerWebDrawerSide, merged: InnerWebPresentation): string {
  if (merged.drawer?.size) return merged.drawer.size;
  if (side === 'left' || side === 'right') return 'min(380px, 88dvw)';
  return '72dvh';
}

function defaultAnimation(
  layout: InnerWebLayoutMode,
  side: InnerWebDrawerSide,
  explicit?: InnerWebAnimation,
): InnerWebAnimation {
  if (explicit) return explicit;
  if (layout === 'fullscreen') return 'fade';
  if (layout === 'center') return 'zoom';
  if (layout === 'drawer') {
    switch (side) {
      case 'top':
        return 'slide-down';
      case 'left':
        return 'slide-right';
      case 'right':
        return 'slide-left';
      default:
        return 'slide-up';
    }
  }
  return 'fade';
}

/** 合并 preset + 调用方 overrides + payload 默认值 */
export function resolveInnerWebPresentation(
  presentation: InnerWebPresentation | undefined,
  payload: { showConfirm?: boolean },
): ResolvedInnerWebPresentation {
  const presetKey = presentation?.preset ?? 'default';
  const preset = PRESETS[presetKey] ?? PRESETS.default;
  const merged = mergePresentation(preset, presentation);

  const layout = normalizeLayout(merged);
  const drawerMerged = merged.drawer ?? {};
  const side: InnerWebDrawerSide = drawerMerged.side ?? 'bottom';

  const headerMerged = merged.header ?? {};
  const header: ResolvedInnerWebPresentation['header'] = {
    visible: headerMerged.visible ?? true,
    showBack: headerMerged.showBack ?? true,
    showRefresh: headerMerged.showRefresh ?? true,
    showConfirm:
      headerMerged.showConfirm !== undefined
        ? headerMerged.showConfirm
        : Boolean(payload.showConfirm),
    showMoreMenu: headerMerged.showMoreMenu ?? true,
    showWindowControls: headerMerged.showWindowControls ?? true,
    compact: headerMerged.compact ?? false,
    class: headerMerged.class,
  };

  const backdropMerged = merged.backdrop ?? {};
  const backdrop: ResolvedInnerWebPresentation['backdrop'] = {
    visible: backdropMerged.visible ?? layout !== 'fullscreen',
    dismissOnClick:
      backdropMerged.dismissOnClick ?? (layout === 'drawer' || layout === 'center'),
    class: backdropMerged.class ?? appOverlayScrim,
    blur: backdropMerged.blur ?? false,
  };

  const drawer: ResolvedInnerWebDrawer = {
    side,
    size: defaultDrawerSize(side, merged),
    showNativeDragHandle: drawerMerged.showNativeDragHandle ?? false,
    dragToDismiss: drawerMerged.dragToDismiss ?? true,
  };

  const animation = defaultAnimation(layout, side, merged.animation);

  return {
    layout,
    drawer,
    maxWidth: merged.maxWidth ?? 'min(640px, 92vw)',
    header,
    backdrop,
    layerClass: merged.layerClass,
    panelClass: merged.panelClass,
    contentClass: merged.contentClass,
    animation: layout === 'drawer' ? 'none' : animation,
    animationDurationMs: merged.animationDurationMs ?? 320,
    allowRootInteraction: merged.allowRootInteraction ?? false,
    bodyClass: merged.bodyClass,
  };
}

export function isHorizontalDrawerSide(side: InnerWebDrawerSide): boolean {
  return side === 'left' || side === 'right';
}

export function animationClassName(animation: InnerWebAnimation): string {
  if (animation === 'none') return '';
  return `reader-inner-web-animate-${animation}`;
}

export function applyInnerWebSessionBodyClasses(
  resolved: ResolvedInnerWebPresentation,
): void {
  if (typeof document === 'undefined') return;
  const body = document.body;
  body.classList.add('reader-inner-web-session');
  body.classList.add(`reader-inner-web-session--${resolved.layout}`);
  if (resolved.layout === 'drawer') {
    body.classList.add('reader-inner-web-session--drawer');
    body.classList.add(`reader-inner-web-session--drawer-${resolved.drawer.side}`);
  }
  if (resolved.allowRootInteraction) {
    body.classList.add('reader-inner-web-session--allow-root');
  }
  if (resolved.bodyClass?.trim()) {
    lastDynamicBodyClass = resolved.bodyClass.trim();
    body.classList.add(lastDynamicBodyClass);
  }
}

export function clearInnerWebSessionBodyClasses(): void {
  if (typeof document === 'undefined') return;
  const body = document.body;
  for (const c of INNER_WEB_SESSION_BODY_CLASSES) {
    body.classList.remove(c);
  }
  if (lastDynamicBodyClass) {
    body.classList.remove(lastDynamicBodyClass);
    lastDynamicBodyClass = undefined;
  }
}

/** 侧栏 drawer 宽度等仍用 inline style；底/顶抽屉高度用静态 Tailwind class（与阅读设置 hDrawerPanel 同模式） */
export function innerWebDrawerHeightClass(drawer: ResolvedInnerWebDrawer): string {
  if (isHorizontalDrawerSide(drawer.side)) return 'h-full';
  const size = drawer.size.trim();
  if (size === '72dvh' || size === '72vh') return hInnerWebDrawerPanel;
  if (size === '75dvh') return hDrawerPanel;
  if (size === '60vh' || size === '60dvh') return 'h-[60dvh]';
  if (size === '50vh' || size === '50dvh') return 'h-[50dvh]';
  return hInnerWebDrawerPanel;
}

/** drawer 面板尺寸 inline style（供侧栏 AppDrawerContent） */
export function innerWebDrawerPanelStyle(
  drawer: ResolvedInnerWebDrawer,
): Record<string, string> | undefined {
  if (isHorizontalDrawerSide(drawer.side)) {
    return {
      width: drawer.size,
      maxWidth: '92vw',
      height: '100%',
      minHeight: '240px',
    };
  }
  return undefined;
}

/** 内置 preset 名称（统一 API 入口） */
export const INNER_WEB_PRESETS = {
  default: 'default',
  paragraphReview: 'paragraph-review',
} as const;

export type InnerWebPresetName =
  (typeof INNER_WEB_PRESETS)[keyof typeof INNER_WEB_PRESETS];

/** 构造 presentation（preset + 可选覆盖） */
export function createInnerWebPresentation(
  preset: InnerWebPresetName = INNER_WEB_PRESETS.default,
  overrides?: Omit<InnerWebPresentation, 'preset'>,
): InnerWebPresentation {
  return { preset, ...overrides };
}
