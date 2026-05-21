import { cn } from '@/lib/utils';

/**
 * 视口相关 Tailwind 类（动态视口 dvh / dvw）。
 * Tailwind CSS v4 已将 v* 单位映射为 dv*，项目不再做 vh/vw 降级。
 */

/** 至少占满一屏（落地页、根布局） */
export const minHViewport = 'min-h-dvh';

/** 不超过一屏（Dialog / Sheet / Toast 容器） */
export const maxHViewport = 'max-h-dvh';

/** 固定为一屏 */
export const hViewport = 'h-dvh';

/** 对话框最大宽度（85% 视口） */
export const maxWDialog = 'max-w-[85dvw]';

/** 对话框最大高度（85% 视口） */
export const maxHDialog = 'max-h-[85dvh]';

/**
 * 对话框尺寸：按内容收缩，宽/高不超过视口 85%。
 * 覆盖 dialog.tsx 默认的 w-full；勿在内容区使用 flex-1，否则高度会顶满 max-h。
 */
export const dialogViewportLimits = `w-max max-w-[85dvw] h-fit ${maxHDialog}`;

/** 导航 mega menu、封面预览等（80% 视口） */
export const maxHViewport80 = 'max-h-[80dvh]';

/** 底部抽屉面板（75% 视口） */
export const hDrawerPanel = 'h-[75dvh]';

/** 侧栏：顶栏 h-14 (3.5rem) 以下剩余高度 */
export const hBelowAppHeader = 'h-[calc(100dvh-3.5rem)]';

/** 书籍信息页底部操作区 */
export const minHBookInfoActions = 'min-h-[calc(100dvh-320px)]';

/** PageToolbar 标题下拉菜单（静态兜底；Popper 可用时优先用 popperContentViewportPanel） */
export const maxHTitleMenu = 'max-h-[min(24rem,calc(100dvh-11rem))]';

/**
 * 双侧 stable scrollbar gutter（与 App.css 中同名 class 一致）。
 * 用于 overflow 滚动区，避免滚动条显隐时内容横向抖动。
 */
export const scrollGutterStableBoth = 'scroll-gutter-stable-both';

/** Popper 与视口边缘最小间距（2rem），传给 Kobalte `overflowPadding` */
export const popperOverflowPadding = 32;

/** 不超过锚点方向可用高度（`--kb-popper-content-available-height`），面板内纵向滚动 */
export const popperContentViewportScroll = cn(
  'max-h-[var(--kb-popper-content-available-height)]',
  'overflow-y-auto overflow-x-hidden overscroll-contain',
  scrollGutterStableBoth
);

/** 标题下拉等：外层限高，内层列表滚动 */
export const popperContentViewportPanel = cn(
  'max-h-[var(--kb-popper-content-available-height)]',
  'flex flex-col min-h-0 overflow-hidden'
);

/** Sidebar inset 变体：四周留白 spacing(4) = 1rem */
export const minHInsetViewport = 'min-h-[calc(100dvh-1rem)]';

/**
 * PageToolbar `below` 横滚视口（唯一滚动层，见 App.css）。
 * BookshelfGroupNav 只渲染 `pageToolbarBelowScrollTrack`，勿设 overflow。
 */
export const pageToolbarBelowScroll = 'page-toolbar-below-scroll';

/** 横滚内容轨，置于 `pageToolbarBelowScroll` 容器内 */
export const pageToolbarBelowScrollTrack = 'page-toolbar-below-scroll__track';

/** 主壳 `#main-content-container` > `main` 四周边距（与书架 Tab 页一致） */
export const mainShellInset = 'p-2';

/** 侧边栏 Tab 页根容器（flex 列、占满剩余高度） */
export const mainShellPageRoot = 'flex flex-col flex-1 min-h-0 w-full overflow-hidden';

/** 侧边栏 Tab 页主内容可滚动区（书架列表、书源列表、探索书籍区等） */
export const mainShellPageScroll =
  'flex-1 min-h-0 overflow-y-auto scroll-gutter-stable-both pt-2';
