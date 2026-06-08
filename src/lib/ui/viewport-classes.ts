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

/**
 * 弹窗内虚拟长列表区固定宽/高（与 dialogViewportLimits 的 w-max 配合）。
 * 避免可视行内容变化导致弹窗宽度抖动；高度与目录弹窗历史尺寸一致。
 */
export const dialogVirtualListPanelWidth = 'w-[min(32rem,85dvw)] shrink-0';
export const dialogVirtualListPanelMaxHeight = 'max-h-[min(70dvh,520px)]';
export const dialogVirtualListPanelMinHeight = 'min-h-[200px]';
export const dialogVirtualListPanelHeight = cn(
  dialogVirtualListPanelMaxHeight,
  dialogVirtualListPanelMinHeight,
);
export const dialogVirtualListPanelSize = cn(
  dialogVirtualListPanelWidth,
  dialogVirtualListPanelHeight,
);

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

/** Inner-Web 底/顶抽屉默认高度（段评 preset 等为 72dvh） */
export const hInnerWebDrawerPanel = 'h-[72dvh]';

/**
 * 书源页右侧发现抽屉宽度：大屏约占 40% 视口宽；窄屏不超过 92dvw，且两侧共留约 8dvw 给列表透视。
 * 覆盖 ui/drawer 侧栏默认 max-w-sm。
 */
export const sourcesExploreDrawerWidth =
  'w-[min(92dvw,32rem)] max-w-none sm:w-[min(40dvw,32rem)]';

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

/**
 * 滚动区垂直留白：顶恒 mt-2；底仅触摸端（App.css `.app-scroll-bottom-inset`）。
 * 主壳 Tab 无底栏时的底留白亦仅在触摸端由 App.css 注入。
 */
export const scrollEdgeBottomInset = 'mt-2 app-scroll-bottom-inset';

/**
 * 贴底 chrome 内边距（底栏、抽屉、阅读器底栏）。
 * 触摸端由 App.css + `installMobileViewportInsets` 按手势条/三键导航分配底部安全距离。
 * @see App.css `.app-bottom-chrome-inset`
 */
export const appBottomChromePadding = 'app-bottom-chrome-inset';

/** 块级底外边距：仅触摸端，见 App.css `.app-bottom-edge-inset` */
export const appBottomEdgeInset = 'app-bottom-edge-inset';

/** 主壳 PageToolbar 顶距：安全区 + pt-4（见 App.css `.page-toolbar-shell-top`） */
export const pageToolbarShellTop = 'page-toolbar-shell-top';

/** Popper 与视口边缘最小间距（2rem），传给 Kobalte `overflowPadding` */
export const popperOverflowPadding = 32;

/** Tauri 窗口拖拽拦截（遮罩/模态层，见 App.css `.app-block-drag`） */
export const appBlockDrag = 'app-block-drag';

/** 浮层遮罩 scrim（半透明 + Tauri 拖拽拦截，供 inner-web / 居中卡片等） */
export const appOverlayScrim = cn(appBlockDrag, 'bg-background/40');

/** 不超过锚点方向可用高度（`--kb-popper-content-available-height`），面板内纵向滚动 */
export const popperContentViewportScroll = cn(
  'max-h-[var(--kb-popper-content-available-height)]',
  'overflow-y-auto overflow-x-hidden overscroll-contain',
  scrollGutterStableBoth,
  scrollEdgeBottomInset,
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
export const mainShellInset = 'p-1';

/** 侧边栏 Tab 页根容器（flex 列、占满剩余高度） */
export const mainShellPageRoot = 'flex flex-col flex-1 min-h-0 w-full overflow-hidden';

/** 侧边栏 Tab 页主内容可滚动区（书架列表、书源列表、探索书籍区等） */
export const mainShellPageScroll = cn(
  'main-shell-page-scroll flex-1 min-h-0 overflow-y-auto scroll-gutter-stable-both py-1',
);

/** 独立全屏页主内容可滚动区（触摸端底留白，桌面无额外底距） */
export const standalonePageScroll = cn(
  'flex-1 min-h-0 overflow-y-auto scroll-gutter-stable-both',
  scrollEdgeBottomInset,
);

/** 弹窗内可滚动主体（无底栏/DialogFooter 时）；含 px-6 pt-4，底边用 scrollEdgeBottomInset 替代 pb */
export const appDialogScrollBodyNoFooter = cn(
  'min-h-0 overflow-y-auto overscroll-contain contain-layout scroll-gutter-stable-both px-6 pt-4 pb-2',
  scrollEdgeBottomInset,
);

/** 多区块设置类弹窗正文：固定最大高度，避免 h-fit 随单选切换重算导致整体塌缩 */
export const appDialogSettingsScrollBody = cn(
  'flex-1 min-h-0 max-h-[min(65dvh,32rem)] space-y-4 overflow-y-auto overscroll-contain px-6 py-4',
  scrollEdgeBottomInset,
);

/** 书架/探索等宽设置弹窗外壳：稳定宽高，内部正文用 appDialogSettingsScrollBody */
export const appDialogSettingsShell = 'w-[min(42rem,85dvw)] min-h-[min(75dvh,36rem)]';

/**
 * 主壳 Tab 页入场动画。移动端省略位移，减少 Popper 首次测量错误。
 */
export function mainShellTabEnterClass(reduceMotion: boolean, mobileDevice: boolean): string {
  if (reduceMotion) return '';
  if (mobileDevice) return 'animate-in fade-in duration-200';
  return 'animate-in fade-in slide-in-from-bottom-4 duration-500';
}

/** 主壳顶/底栏 fixed 偏移（含移动端安全区） */
export const insetTopAppBar = 'inset-top-app-bar';
export const insetBottomAppBar = 'inset-bottom-app-bar';

/** 侧栏 AppDrawer：顶栏安全区 + 底部 pb-2（不依赖 env safe-area-inset-bottom） */
export const appDrawerSideSafeArea = cn('safe-area-inset-top', appBottomChromePadding);

/** 底栏抽屉：底部 pb-2 */
export const appDrawerBottomSafeArea = appBottomChromePadding;

/** 顶栏抽屉：状态栏 */
export const appDrawerTopSafeArea = 'safe-area-inset-top';

/**
 * 抽屉内纵向滚动：双侧 stable 沟槽防抖动；横向用较小 px-2，为沟槽留出净宽（分类 grid 见 SourceExploreDrawerContent）。
 */
export const appDrawerScrollBody = cn(
  'min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-2 pt-1',
  scrollGutterStableBoth,
  scrollEdgeBottomInset,
);
