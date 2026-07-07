import { cn } from '@/lib/utils';

/** 顶栏 / 底栏相对主内容区的布局方式 */
export type ViewerChromeLayout = 'fixed' | 'stacked' | 'floating';

export const defaultViewerChromeLayout: ViewerChromeLayout = 'stacked';

/** 阅读器 chrome 断点（与 Tailwind 配合） */
/** 360px 以下：极窄单行可挤压 */
export const VIEWER_CHROME_BREAKPOINT_COMPACT_PX = 360;
/** 480px 起：顶栏双行 / 四按钮移入顶栏 */
export const VIEWER_CHROME_BREAKPOINT_TOOLBAR_PRIMARY_PX = 480;
/** @deprecated 请用 VIEWER_CHROME_BREAKPOINT_TOOLBAR_PRIMARY_PX（双行起点） */
export const VIEWER_CHROME_BREAKPOINT_SPLIT_PX = VIEWER_CHROME_BREAKPOINT_TOOLBAR_PRIMARY_PX;
/** 与 Tailwind `sm` 一致：顶栏单行布局 */
export const VIEWER_CHROME_BREAKPOINT_SINGLE_ROW_PX = 640;
/** 桌面端窗口/壳层最小宽度（与 tauri.conf、window_state 一致） */
export const VIEWER_CHROME_DESKTOP_MIN_WIDTH_PX = 240;

/** 桌面阅读器壳层最小宽度 */
export const mediaViewerChromeDesktopMinWidthClass = 'min-w-[240px]';

export const VIEWER_CHROME_LAYOUT_LABELS: Record<ViewerChromeLayout, string> = {
  fixed: '固定',
  stacked: '层叠',
  floating: '悬浮',
};

export const VIEWER_CHROME_LAYOUT_HINTS: Record<ViewerChromeLayout, string> = {
  fixed: '顶栏与底栏占位，正文在两者之间滚动。',
  stacked: '顶底栏整条叠在内容上，随阅读器 chrome 滑入滑出。',
  floating: '按钮与信息以圆角胶囊独立浮在正文上方。',
};

/** 顶底栏可挤压间距：窄视口缩小 padding/gap */
export const mediaViewerChromeBarInsetClass =
  'gap-x-1 gap-y-0.5 px-2 py-1 sm:gap-x-2 sm:gap-y-0 sm:px-4 sm:py-0';

/** 层叠顶栏 surface 视觉（实色底；透明度/模糊由 overlay appearance 内联样式覆盖） */
export const mediaViewerChromeTopSurfaceClass =
  'border-b border-border/50 bg-background safe-area-inset-top';

/** 层叠顶栏内容区背景（与 surface 分离，供透明槽位露出正文） */
export const mediaViewerChromeTopFillClass = mediaViewerChromeTopSurfaceClass;

/** 层叠底栏 surface 视觉 */
export const mediaViewerChromeBottomSurfaceClass = cn(
  'border-t border-border/50 bg-background text-muted-foreground',
);

/** 层叠底栏内容区背景 */
export const mediaViewerChromeBottomFillClass = mediaViewerChromeBottomSurfaceClass;

/** 底栏内容根 */
export const mediaViewerChromeBottomContentClass = 'flex w-full min-w-0 max-w-full flex-col';

/** 底栏单行布局（间距可挤压） */
export const mediaViewerChromeBottomRowClass = cn(
  'flex min-w-0 max-w-full items-center justify-between',
  mediaViewerChromeBarInsetClass,
);

/** 固定顶栏主工具栏行 */
export const mediaViewerChromeToolbarRowClass = cn(
  'flex min-h-12 w-full min-w-0 max-w-full items-center sm:min-h-14',
  mediaViewerChromeBarInsetClass,
  'max-[359px]:flex-wrap min-[480px]:max-sm:flex-wrap',
);

/**
 * 层叠顶栏主工具栏行：&lt;360px 与 480–639px 双行；360–479px 与 ≥640px 单行。
 */
export const mediaViewerChromeToolbarRowStackedClass = mediaViewerChromeToolbarRowClass;

/** 移动端正文阅读器顶栏：始终单行 */
export const mediaViewerChromeToolbarRowMobileClass = cn(
  'flex h-14 w-full min-w-0 max-w-full items-center',
  mediaViewerChromeBarInsetClass,
);

/** 顶栏左侧：返回 + 书名（宽屏仅占内容宽，窄屏 flex-1 可挤压） */
export const mediaViewerChromeToolbarLeadRowClass = cn(
  'flex min-w-0 items-center gap-1 overflow-hidden sm:gap-2',
  'max-sm:flex-1 max-sm:basis-0',
  'sm:flex-none sm:max-w-[min(40%,24rem)]',
);

/** 悬浮顶栏左侧：胶囊带阴影/边框，勿裁切底部 */
export const mediaViewerChromeFloatingToolbarLeadRowClass = cn(
  mediaViewerChromeToolbarLeadRowClass,
  'overflow-visible',
);

export const mediaViewerChromeToolbarTitleInlineClass = cn(
  'block min-w-0 truncate text-sm font-medium text-foreground',
  'max-sm:flex-1 max-sm:basis-0',
);

/**
 * 桌面首行容器：&lt;360px 与 480–639px 独立成行；360–479px 与 ≥640px 为 contents。
 */
export const mediaViewerChromeToolbarOverlayFirstRowClass = cn(
  'flex w-full min-w-0 items-center gap-1 sm:gap-2',
  'max-[359px]:flex max-[359px]:basis-full',
  'min-[360px]:max-[479px]:contents',
  'min-[480px]:max-sm:flex min-[480px]:max-sm:basis-full',
  'sm:contents',
);

/** 首行右侧：主题 + 窗口控件（&lt;360px 与 480–639px 双行首行） */
export const mediaViewerChromeToolbarWindowChromeLeadClass =
  'ml-auto hidden shrink-0 items-center max-[359px]:flex min-[480px]:max-sm:flex sm:hidden';

/** 操作区末尾主题/窗口（360–479px 与 ≥640px 单行；双行时隐藏） */
export const mediaViewerChromeToolbarWindowChromeTrailClass =
  'hidden shrink-0 min-[360px]:max-[479px]:flex min-[480px]:max-sm:hidden sm:flex';

/** @deprecated 保留别名，请用 ActionsGroupClass */
export const mediaViewerChromeToolbarActionsStackedSecondaryClass =
  'hidden';

/** 顶栏操作组：&lt;360px 与 480–639px 占第二行；其余与书名同行 */
export const mediaViewerChromeToolbarActionsGroupClass = cn(
  'flex min-w-0 shrink-0 items-center justify-end gap-0.5 no-drag',
  'overflow-x-auto overscroll-x-contain touch-pan-x flex-nowrap',
  '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0',
  'max-[359px]:ml-0 max-[359px]:w-full max-[359px]:max-w-full max-[359px]:basis-full max-[359px]:flex-wrap',
  'min-[360px]:max-[479px]:ml-auto min-[360px]:max-[479px]:max-w-[min(100%,14rem)]',
  'min-[480px]:max-sm:ml-0 min-[480px]:max-sm:w-full min-[480px]:max-sm:max-w-full min-[480px]:max-sm:basis-full min-[480px]:max-sm:flex-wrap',
  'sm:ml-0 sm:shrink-0 sm:flex-none',
);

/** 移动端顶栏右侧业务按钮 */
export const mediaViewerChromeToolbarActionsMobileClass =
  'ml-auto flex min-w-0 max-w-[min(100%,14rem)] shrink-0 items-center justify-end gap-0.5 overflow-x-auto overscroll-x-contain touch-pan-x no-drag flex-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0';

/**
 * 层叠/悬浮顶栏主工具栏行（悬浮顶栏仍用；层叠请用 RowStacked）。
 */
export const mediaViewerChromeToolbarRowOverlayClass =
  'flex min-h-12 w-full min-w-0 max-w-full flex-wrap items-center sm:min-h-14 sm:flex-nowrap';

/** 顶栏标题与操作区之间的弹性占位（可收缩至 0） */
export const mediaViewerChromeToolbarSpacerClass = 'hidden min-w-0 flex-1 shrink sm:block';

/** 层叠/悬浮顶栏：窄屏时隐藏占位 */
export const mediaViewerChromeToolbarSpacerOverlayClass = mediaViewerChromeToolbarSpacerClass;

/**
 * 固定顶栏操作区：空间不足时横向滚动（隐藏滚动条）。
 * @deprecated 请用 ActionsGroupClass
 */
export const mediaViewerChromeToolbarActionsClass = mediaViewerChromeToolbarActionsGroupClass;

/**
 * 层叠顶栏操作区。
 * @deprecated 请用 ActionsGroupClass
 */
export const mediaViewerChromeToolbarActionsStackedClass = mediaViewerChromeToolbarActionsGroupClass;

/**
 * 层叠/悬浮顶栏操作区。
 * @deprecated 请用 ActionsGroupClass
 */
export const mediaViewerChromeToolbarActionsOverlayClass = mediaViewerChromeToolbarActionsGroupClass;

/** 桌面 ≥480px 顶栏内显示目录/朗读/界面/设置（移动端由 JS 包一层 hidden） */
export const mediaViewerChromeToolbarPrimaryActionsClass = 'hidden min-[480px]:contents';

/** 桌面 ≥480px 隐藏底栏四按钮区（移动端始终显示） */
export const mediaViewerChromeBottomPrimarySectionClass = 'min-[480px]:hidden';

/** 悬浮顶/底栏轨道：窄屏居中排列自适应宽度的胶囊 */
export const mediaViewerChromeFloatingTrackClass =
  'pointer-events-none flex w-full min-w-0 max-w-full flex-col items-center gap-2 overflow-visible px-3 box-border';

/** 悬浮胶囊宽度：随内容收缩，不超过视口（扣除轨道内边距） */
export const mediaViewerChromeFloatingCapsuleWidthClass =
  'w-auto max-w-[min(calc(100%-1.5rem),24rem)]';

/** 悬浮顶栏统一胶囊高度（与 FloatingIconButtonClass 一致） */
export const mediaViewerChromeFloatingToolbarCapsuleHeightClass = 'h-9 min-h-9';

/** 悬浮顶栏主工具栏行：&lt;480px 双行（与层叠 360–479 单行不同）；480–639 双行；≥640 单行 */
export const mediaViewerChromeFloatingToolbarRowClass = cn(
  'flex w-full min-w-0 max-w-full items-center justify-center overflow-visible py-1',
  mediaViewerChromeBarInsetClass,
  'sm:px-2! md:px-4!',
  'max-[479px]:flex-wrap max-[479px]:justify-center max-[479px]:gap-y-2!',
  'min-[480px]:max-sm:flex-wrap min-[480px]:max-sm:justify-center min-[480px]:max-sm:gap-y-2!',
  'sm:flex-nowrap sm:justify-start sm:gap-1',
);

/** 悬浮首行：&lt;640px 独立成行并居中 */
export const mediaViewerChromeFloatingOverlayFirstRowClass = cn(
  'flex w-full min-w-0 items-center justify-center gap-1 overflow-visible',
  'max-[479px]:basis-full max-[479px]:flex',
  'min-[480px]:max-sm:basis-full min-[480px]:max-sm:flex',
  'sm:contents sm:justify-start',
);

/** 悬浮首行右侧窗口控件（&lt;640px 双行首行） */
export const mediaViewerChromeFloatingWindowChromeLeadClass =
  'ml-auto hidden shrink-0 items-center max-sm:flex sm:hidden';

/** 悬浮单行末尾窗口控件（仅 ≥640px；&lt;640 绝不显示，避免第三行重复） */
export const mediaViewerChromeFloatingWindowChromeTrailClass =
  'hidden shrink-0 sm:ml-auto sm:flex';

/**
 * 悬浮底栏：容器不拦截指针，子控件加 mediaViewerChromeHitTargetClass（层叠模式不改）。
 */
export const mediaViewerChromeBottomPassThroughClass = 'pointer-events-none';

/** 悬浮底栏内可点击控件 */
export const mediaViewerChromeHitTargetClass = 'pointer-events-auto';

/** 悬浮控件：圆角胶囊/圆形按钮 */
export const mediaViewerChromeFloatingControlClass =
  'border border-border/50 bg-background text-foreground shadow-sm';

export const mediaViewerChromeFloatingIconButtonClass = cn(
  mediaViewerChromeFloatingControlClass,
  mediaViewerChromeFloatingToolbarCapsuleHeightClass,
  mediaViewerChromeHitTargetClass,
  'size-9 shrink-0 rounded-full',
);

export const mediaViewerChromeFloatingPillClass = cn(
  mediaViewerChromeFloatingControlClass,
  mediaViewerChromeFloatingToolbarCapsuleHeightClass,
  'rounded-full px-3',
);

/** 悬浮顶栏第二行内按钮：无独立胶囊，仅尺寸对齐 */
export const mediaViewerChromeFloatingClusterIconButtonClass =
  'size-9 shrink-0 rounded-full no-drag';

/** 悬浮模式独立内容块：胶囊背景 + 可点击 */
export const mediaViewerChromeFloatingBlockClass = cn(
  mediaViewerChromeFloatingPillClass,
  mediaViewerChromeHitTargetClass,
);

/** 悬浮顶/底栏全宽附加行（书源条、进度条行、页眉页脚等；高度随内容） */
export const mediaViewerChromeFloatingWideSupplementClass = cn(
  mediaViewerChromeFloatingControlClass,
  mediaViewerChromeHitTargetClass,
  'rounded-full px-3 py-2',
);

/** 悬浮顶/底栏全宽附加行（书源条、进度条行、页眉页脚等） */
export const mediaViewerChromeFloatingWideBlockClass = cn(
  mediaViewerChromeFloatingWideSupplementClass,
  'mx-auto w-full',
  mediaViewerChromeFloatingCapsuleWidthClass,
);

/** 悬浮顶栏：书名独立胶囊 */
export const mediaViewerChromeFloatingTitleCapsuleClass = cn(
  mediaViewerChromeFloatingPillClass,
  mediaViewerChromeHitTargetClass,
  'flex min-w-0 items-center overflow-hidden px-3',
  'max-sm:flex-1 max-sm:basis-0',
  'sm:max-w-[min(calc(100vw-16rem),14rem)] md:max-w-[min(40%,24rem)]',
);

/** 悬浮顶栏：主题 + 窗口控件独立胶囊（首行） */
export const mediaViewerChromeFloatingWindowChromeCapsuleClass = cn(
  mediaViewerChromeFloatingBlockClass,
  'flex shrink-0 items-center gap-0.5 px-1 sm:gap-1 sm:px-2',
);

/** @deprecated 旧版返回+书名合并胶囊，请用 FloatingTitleCapsuleClass */
export const mediaViewerChromeFloatingTitleClusterClass = mediaViewerChromeFloatingTitleCapsuleClass;

/** 悬浮顶栏第二行：单一大胶囊包裹全部操作按钮，居中 */
export const mediaViewerChromeFloatingActionsClusterClass = cn(
  mediaViewerChromeFloatingBlockClass,
  'flex min-w-0 items-center justify-center overflow-visible px-2 py-0.5 no-drag',
  'max-[479px]:mx-auto max-[479px]:w-auto max-[479px]:max-w-full max-[479px]:basis-full',
  'min-[480px]:max-sm:mx-auto min-[480px]:max-sm:w-auto min-[480px]:max-sm:max-w-full min-[480px]:max-sm:basis-full',
  'sm:ml-0 sm:min-w-0 sm:max-w-[min(calc(100vw-14rem),24rem)] sm:shrink sm:flex-none sm:justify-start',
);

/** 悬浮顶栏第二行胶囊内：按钮横向滚动（与外层分离，避免 overflow-x 裁切阴影） */
export const mediaViewerChromeFloatingActionsClusterScrollClass = cn(
  'flex max-w-full items-center gap-0.5 overflow-x-auto overscroll-x-contain touch-pan-x flex-nowrap',
  '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0',
);

/**
 * 层叠/固定顶栏书名：仅占内容宽度，避免挤压操作区。
 */
export const mediaViewerChromeToolbarTitleClass =
  'min-w-0 w-auto max-w-[min(9rem,34vw)] shrink truncate sm:max-w-[min(12rem,28vw)]';

/** 层叠/固定顶栏左侧（关闭 + 书名）— 保留兼容 */
export const mediaViewerChromeToolbarLeadClass = mediaViewerChromeToolbarLeadRowClass;

/** 悬浮底栏行：居中排列各自独立的胶囊 */
export const mediaViewerChromeFloatingBottomRowClass =
  'flex w-full flex-wrap items-center justify-center gap-1 px-2 sm:gap-2 sm:px-3';

/** 悬浮底栏通用胶囊（可点击） */
export const mediaViewerChromeFloatingBottomPillClass = cn(
  mediaViewerChromeFloatingPillClass,
  mediaViewerChromeHitTargetClass,
);

/** 悬浮底栏进度/自动翻页滑条胶囊 */
export const mediaViewerChromeFloatingSliderPillClass = cn(
  mediaViewerChromeFloatingBottomPillClass,
  'flex min-w-0 flex-1 shrink basis-0 items-center gap-2 overflow-visible px-3 py-2',
  'max-w-[min(calc(100%-8rem),20rem)]',
);

/** 底栏滑条容器：为 size-5 滑块留出上下溢出空间，避免裁切圆环 */
export const mediaViewerChromeSliderLaneClass =
  'viewer-chrome-slider-lane min-w-0 flex-1 overflow-visible px-1';

/** 悬浮底栏状态信息胶囊 */
export const mediaViewerChromeFloatingStatusPillClass = cn(
  mediaViewerChromeFloatingBottomPillClass,
  'flex min-w-0 max-w-[min(calc(100%-1.5rem),18rem)] items-center gap-2 px-3 py-1.5 text-xs',
);

/** 主内容区铺满壳层 */
export const mediaViewerMainStageClass = 'media-viewer-main-stage absolute inset-0 min-h-0';

export const mediaViewerMainScrollClass =
  'media-viewer-main-scroll absolute inset-0 overflow-y-auto';

/** 四 media-viewer 移动端正文滚动：无滚动条、无双侧 gutter 预留 */
export const mediaViewerContentScrollClass = 'media-viewer-content-scroll';
