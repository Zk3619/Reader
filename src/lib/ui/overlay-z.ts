/**
 * 应用浮层 z-index 分层（自下而上）。
 * Portal 挂 body 时须高于主壳 fixed 区（含 backdrop-blur 的 #main-content-container）。
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

/** 阅读器内抽屉等 */
export const APP_READER_DRAWER_Z = 'z-100';

/** 阅读器全屏点击区域配置遮罩（九宫格） */
export const APP_READER_CLICK_REGIONAL_OVERLAY_Z = 'z-50';

/** 阅读器内须盖过点击区域遮罩与抽屉的 AppDialog */
export const APP_READER_OVERLAY_DIALOG_Z = 'z-[110]';

/** 内嵌 WebView 浮层 */
export const APP_INNER_WEB_LAYER_Z = 'z-[150]';

/** 内嵌 Web 打开时的主 WebView 模态（须高于 inner-web layer） */
export const APP_INNER_WEB_DIALOG_Z = 'z-[160]';

/** Toast */
export const APP_TOAST_Z = 'z-200';
