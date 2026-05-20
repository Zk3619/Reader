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

/** PageToolbar 标题下拉菜单 */
export const maxHTitleMenu = 'max-h-[min(24rem,calc(100dvh-11rem))]';

/** Sidebar inset 变体：四周留白 spacing(4) = 1rem */
export const minHInsetViewport = 'min-h-[calc(100dvh-1rem)]';

/**
 * 双侧 stable scrollbar gutter（与 App.css 中同名 class 一致）。
 * 用于 overflow 滚动区，避免滚动条显隐时内容横向抖动。
 */
export const scrollGutterStableBoth = 'scroll-gutter-stable-both';

/**
 * PageToolbar `below` 横滚视口（唯一滚动层，见 App.css）。
 * BookshelfGroupNav 只渲染 `pageToolbarBelowScrollTrack`，勿设 overflow。
 */
export const pageToolbarBelowScroll = 'page-toolbar-below-scroll';

/** 横滚内容轨，置于 `pageToolbarBelowScroll` 容器内 */
export const pageToolbarBelowScrollTrack = 'page-toolbar-below-scroll__track';
