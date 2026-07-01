/**
 * 应用浮层 z-index 分层（自下而上）。
 * Portal 挂 body 时须高于主壳 fixed 区（含 backdrop-blur 的 #main-content-container）。
 *
 * 阅读器导航叠层（APP_OVERLAY_VIEWER_Z）之上的 Dialog / Drawer / Popper 等
 * 使用 MEDIA_VIEWER_OVERLAY_LAYER_Z，并通过 ViewerApp* 封装 portalToBody 挂 document.body
 *（与 BookInfoDrawer 相同，见 components/viewer/viewer-app-overlay.tsx）。
 * Tooltip 须高于阅读器壳层：阅读器内为 AppTooltipContent 设置 layer="viewer"。
 */

/** 主壳侧栏 */
export const APP_SHELL_SIDEBAR_Z = 'z-40';

/** 顶/底栏、壳层内联弹层 */
export const APP_SHELL_CHROME_Z = 'z-50';

/** Corvu 抽屉（书源发现侧栏等） */
export const APP_DRAWER_Z = 'z-[85]';

/** 抽屉内 Select / Dropdown Portal（须高于 APP_DRAWER_Z） */
export const APP_DRAWER_POPPER_Z = 'z-[95]';

/** AppDialog / 全局 Kobalte 模态 */
export const APP_DIALOG_Z = 'z-[100]';

/** 模态 / 主 WebView 内 Popper（Select / Combobox） */
export const APP_DIALOG_POPPER_Z = 'z-[110]';

/** 导航栈上的阅读器叠层（须高于壳层内 fixed 页如 book-search 自带的 z-50） */
export const APP_OVERLAY_VIEWER_Z = 'z-[110]';

/** 书籍详情抽屉（App 根级，高于阅读器壳层、低于阅读器内 Dialog 档位） */
export const APP_BOOK_INFO_DRAWER_OVERLAY_Z = 'z-[115]';
export const APP_BOOK_INFO_DRAWER_Z = 'z-[120]';

/** 书籍详情抽屉内打开的 Dialog（须高于 APP_BOOK_INFO_DRAWER_Z） */
export const APP_BOOK_INFO_DIALOG_OVERLAY_Z = 'z-[125]';
export const APP_BOOK_INFO_DIALOG_Z = 'z-[126]';

/** 阅读器全屏点击区域配置遮罩（九宫格，叠在阅读器壳层内部） */
export const APP_READER_CLICK_REGIONAL_OVERLAY_Z = 'z-50';

/** 内嵌 WebView 浮层 */
export const APP_INNER_WEB_LAYER_Z = 'z-[150]';

/** 书源 / 订阅源编辑全屏页（高于阅读器内 Dialog，须 pointer-events-auto） */
export const APP_SOURCE_EDIT_LAYER_Z = 'z-[140]';

/** 书源编辑页内 Dialog / Select Portal */
export const APP_SOURCE_EDIT_DIALOG_OVERLAY_Z = 'z-[145]';
export const APP_SOURCE_EDIT_DIALOG_Z = 'z-[146]';

/** 内嵌 Web 打开时的主 WebView 模态（须高于 inner-web layer） */
export const APP_INNER_WEB_DIALOG_Z = 'z-[160]';

/** Toast（全局 Portal，高于各档 Popper / Dialog） */
export const APP_TOAST_Z = 'z-200';

/** 模态 / 抽屉遮罩：随亮暗主题变化的半透明背景（勿用纯黑 rgb） */
export const APP_OVERLAY_BACKDROP_CLASS = 'bg-background/80';

/** 同一子树内 Portal 浮层共用的 z-index 档位 */
export type OverlayLayerZ = {
  drawer: string;
  drawerOverlay: string;
  drawerPopper: string;
  dialog: string;
  dialogOverlay: string;
  dialogPopper: string;
  popper: string;
  toast: string;
};

/** 主壳 / 书架 / 搜索等非阅读器导航叠层 */
export const APP_OVERLAY_LAYER_Z: OverlayLayerZ = {
  drawer: 'z-[86]',
  drawerOverlay: APP_DRAWER_Z,
  drawerPopper: APP_DRAWER_POPPER_Z,
  dialog: 'z-[101]',
  dialogOverlay: APP_DIALOG_Z,
  dialogPopper: APP_DIALOG_POPPER_Z,
  popper: APP_DIALOG_POPPER_Z,
  toast: APP_TOAST_Z,
};

/**
 * 阅读器导航叠层（image/text/audio/video/file viewer）内打开的浮层。
 * 遮罩与内容须分层：内容 z 高于遮罩，否则只见 backdrop。
 */
export const MEDIA_VIEWER_OVERLAY_LAYER_Z: OverlayLayerZ = {
  drawer: 'z-[121]',
  drawerOverlay: 'z-[120]',
  drawerPopper: 'z-[125]',
  dialog: 'z-[131]',
  dialogOverlay: 'z-[130]',
  dialogPopper: 'z-[135]',
  popper: 'z-[135]',
  toast: APP_TOAST_Z,
};
