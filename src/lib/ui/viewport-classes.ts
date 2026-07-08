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

/** 对话框最小宽度（不小于 18rem，且不超过视口 85%） */
export const minWDialog = 'min-w-[min(18rem,85dvw)]';

/**
 * 弹窗内虚拟长列表区固定宽/高（与 dialogViewportLimits 的 w-max 配合）。
 * 避免可视行内容变化导致弹窗宽度抖动；高度与目录弹窗历史尺寸一致。
 */
export const dialogVirtualListPanelWidth = 'w-[min(32rem,85dvw)] shrink-0';
export const dialogVirtualListPanelMaxHeight =
  'max-h-[min(60dvh,calc(85dvh-8rem))]';
export const dialogVirtualListPanelMinHeight = 'min-h-[200px]';
export const dialogVirtualListPanelHeight = cn(
  dialogVirtualListPanelMaxHeight,
  dialogVirtualListPanelMinHeight,
);
export const dialogVirtualListPanelSize = cn(
  dialogVirtualListPanelWidth,
  dialogVirtualListPanelHeight,
);

/** 对话框与视口上下各至少留白 1rem（与 85dvh 上限取较小值） */
export const dialogViewportMarginY = '1rem';

/** AppDialog Portal 内边距：弹窗相对视口留白，配合子级 max-h-full */
export const dialogPortalInset = 'p-4';

/**
 * AppDialog Portal 布局：始终垂直居中。
 * 勿用 sm: 切换顶对齐（640px 与壳层 480/768 断点不一致，会导致桌面窄窗顶距过小）。
 */
export const dialogPortalShell = cn(
  'flex items-center justify-center',
  dialogPortalInset,
);

/** 置于 Portal 内时的弹窗外壳：相对定位 + 占满留白内可用高宽 */
export const dialogContentInPortal = cn(
  'relative w-max min-h-0 max-h-full max-w-full',
);

/**
 * 弹窗内宽表单横排样式（须配合 useDialogFormWideLayout 条件挂载，勿用 min-[480px] 媒体查询）。
 */
export const dialogFormRowWide = 'flex-row items-center gap-6';
export const dialogFormCoverAsideWide = 'block w-64 shrink-0';

/** 对话框最大高度（85% 视口，且不低于上下各 1rem 边距） */
export const maxHDialog = 'max-h-[min(85dvh,calc(100dvh-2rem))]';

/** 对话框固定高度（与 maxHDialog 上限一致，避免内容增减导致弹窗高度抖动） */
export const hDialogMax = 'h-[min(85dvh,calc(100dvh-2rem))]';

/** 对话框最小高度（保证顶栏/底栏不局促，高内容仍由 h-fit 撑开） */
export const minHDialog = 'min-h-[min(10rem,35dvh)]';

/**
 * 对话框尺寸：按内容收缩（w-max / h-fit），宽/高限制在视口 85% 内。
 * 覆盖 dialog.tsx 默认的 w-full；勿在内容区使用 flex-1，否则高度会顶满 max-h。
 */
export const dialogViewportLimits = cn(
  'w-max h-fit',
  minWDialog,
  minHDialog,
  maxWDialog,
  maxHDialog,
);

/** 挂到 AppDialogContent：先铺宽度上限，业务 class 可再收窄 max-w */
export const dialogViewportMaxBounds = maxWDialog;

/** 挂到 AppDialogContent 末尾：最小宽高 + 高度上限，不被业务 class 覆盖 */
export const dialogViewportMinBounds = cn(minWDialog, minHDialog, maxHDialog);

/** 导航 mega menu、封面预览等（80% 视口） */
export const maxHViewport80 = 'max-h-[80dvh]';

/** 底部抽屉面板（75% 视口）；显式固定高度，覆盖 AppDrawer 默认 h-fit 自适应 */
export const hDrawerPanel = 'h-[75dvh]';

/** 顶/底 AppDrawer：高度随内容收缩，宽占满 */
export const drawerVerticalAdaptive = 'h-fit w-full';

/** 顶/底 AppDrawer 默认最大高度 */
export const maxHAppDrawerVertical = 'max-h-[80dvh]';

/** 顶/底 AppDrawer 默认最小高度 */
export const minHAppDrawerVertical = 'min-h-[min(10rem,35dvh)]';

/** 顶/底 AppDrawer 默认尺寸约束（min + max 高度） */
export const appDrawerVerticalViewportBounds = cn(
  minHAppDrawerVertical,
  maxHAppDrawerVertical,
);

/** 侧栏 AppDrawer：宽度随内容收缩，高占满 */
export const drawerHorizontalAdaptive = 'w-fit h-full';

/** 侧栏 AppDrawer 默认最大宽度（与原 ui/drawer max-w-sm 一致） */
export const maxWAppDrawerSide = 'max-w-sm';

/** 侧栏 AppDrawer 默认最小宽度 */
export const minWAppDrawerSide = 'min-w-[min(18rem,85dvw)]';

/** 侧栏 AppDrawer 默认尺寸约束（min + max 宽度） */
export const appDrawerSideViewportBounds = cn(minWAppDrawerSide, maxWAppDrawerSide);

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
 * 滚动视口内上下留白（加在 overflow-y-auto 元素上，内容滚入/滚出时不贴边）。
 * 桌面端 py-2；触摸端底边取 max(py-2, 安全区)。
 */
export const scrollEdgeInset = 'py-2 app-scroll-edge-inset';

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

/** 标题下拉等：外层限高，内层列表滚动 */
export const popperContentViewportPanel = cn(
  'max-h-[var(--kb-popper-content-available-height)]',
  'flex flex-col min-h-0 overflow-hidden'
);

/** Popper 菜单/Select 外层：限高裁切，滚动交给内层 PopperScrollViewport */
export const popperMenuPanelShell = cn(popperContentViewportPanel, 'overflow-hidden p-0');

/** Popper 内层：固定上下留白的外框（不滚动，裁切内层） */
export const popperMenuScrollFrame = cn(
  'flex min-h-0 w-full flex-1 flex-col overflow-hidden max-h-[var(--kb-popper-content-available-height)]',
  scrollEdgeInset,
);

/** Popper 内层滚动轨（置于 popperMenuScrollFrame 内） */
export const popperMenuScrollTrack = cn(
  'min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain',
  scrollGutterStableBoth,
);

/**（`--kb-popper-content-available-height`），面板内纵向滚动 */
export const popperContentViewportScroll = cn(
  'max-h-[var(--kb-popper-content-available-height)]',
  'overflow-y-auto overflow-x-hidden overscroll-contain',
  scrollGutterStableBoth,
  scrollEdgeInset,
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
  'main-shell-page-scroll flex-1 min-h-0 overflow-y-auto scroll-gutter-stable-both',
  scrollEdgeInset,
);

/** 设置内嵌规则管理页（TXT/替换/字典）：占满父级高度，列表区内滚、底栏固定于组件底部 */
export const settingsRuleManagePageRoot =
  'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/50 bg-card';

/** 规则管理页列表滚动区 */
export const settingsRuleManagePageListScroll = cn(
  'min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background/40',
  scrollEdgeInset,
);

/** 独立全屏页主内容可滚动区（触摸端底留白，桌面无额外底距） */
export const standalonePageScroll = cn(
  'flex-1 min-h-0 overflow-y-auto scroll-gutter-stable-both',
  scrollEdgeInset,
);

/** 弹窗内滚动外框：固定上下留白 + 水平 px-6，不滚动 */
export const dialogScrollFrame = cn(
  'flex min-h-0 w-full flex-col overflow-hidden px-6',
  scrollEdgeInset,
);

/** 外框占满 Header / Footer 之间的剩余高度 */
export const dialogScrollFrameFlex = cn(dialogScrollFrame, 'flex-1');

/** 弹窗内滚动轨（置于 dialogScrollFrame 内） */
export const dialogScrollTrack = cn(
  'min-h-0 flex-1 overflow-y-auto overscroll-contain contain-layout',
  scrollGutterStableBoth,
);

/** 弹窗内嵌套小列表外框（分组筛选等） */
export const dialogNestedScrollFrame = cn(
  'flex max-h-[min(16rem,50vh)] min-h-0 w-full flex-col overflow-hidden rounded-md border border-border/50 bg-muted/20 px-1',
  scrollEdgeInset,
);

export const dialogNestedScrollTrack = cn(
  'min-h-0 flex-1 overflow-y-auto overscroll-contain',
  scrollGutterStableBoth,
);

/** 弹窗正文 track 修饰：垂直间距 */
export const appDialogScrollBodySpaceY2 = 'space-y-2';
export const appDialogScrollBodySpaceY3 = 'space-y-3';
export const appDialogScrollBodySpaceY4 = 'space-y-4';
export const appDialogScrollBodyMaxH60 = 'max-h-[60dvh]';
export const appDialogScrollBodyMaxH70 = 'max-h-[min(70vh,36rem)]';

export const appDialogScrollBodyMaxH70SpaceY4 = cn(
  appDialogScrollBodySpaceY4,
  appDialogScrollBodyMaxH70,
);

/** 弹窗内虚拟长列表 track（与 dialogVirtualListPanelHeight 配合，外层用 DialogScrollViewport） */
export const dialogVirtualListScroll = 'min-h-0 flex-1 space-y-2';

/** 多区块设置类弹窗：外框 flex-1，track 限高 */
export const appDialogSettingsScrollTrack = cn(
  dialogScrollTrack,
  'space-y-4',
);

/** Popper 内嵌套可滚动列表（下拉选项分组等） */
export const popperNestedListScroll = cn(
  'overflow-y-auto overflow-x-hidden overscroll-contain',
  scrollGutterStableBoth,
  scrollEdgeInset,
);

/** 书架/探索等宽设置弹窗外壳：稳定宽度，高度由视口与滚动区约束 */
export const appDialogSettingsShell = 'w-[min(42rem,85dvw)]';

/** 主壳 Tab 入场动画时长（与 overlay 淡入一致） */
export const SHELL_TAB_ENTER_DURATION_MS = 200;

/** 独立页（非阅读器叠层）淡入淡出时长 */
export const OVERLAY_STACK_FADE_DURATION_MS = 200;

/**
 * 主壳 Tab 页入场：纯 fade，桌面与移动端统一时长。
 */
export function mainShellTabEnterClass(reduceMotion: boolean): string {
  if (reduceMotion) return '';
  return 'animate-in fade-in duration-200';
}

/**
 * 独立页叠层壳层（explore / book-search / book-info / remote-book）：
 * 纯 opacity 过渡，无 scale/slide。阅读器全屏叠层勿用。
 */
export function overlayStackFadeShellClass(reduceMotion: boolean, viewerOverlay: boolean): string {
  if (reduceMotion || viewerOverlay) return '';
  return 'app-overlay-fade-shell';
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
  'min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-2',
  scrollGutterStableBoth,
  scrollEdgeInset,
);
