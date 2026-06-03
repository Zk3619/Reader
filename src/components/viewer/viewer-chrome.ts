import { cn } from '@/lib/utils';

/** 顶栏 / 底栏相对主内容区的布局方式 */
export type ViewerChromeLayout = 'fixed' | 'stacked' | 'floating';

/** @deprecated 使用 ViewerChromeLayout；overlay 已更名为 stacked（层叠） */
export type ViewerChromePlacement = ViewerChromeLayout;

export const defaultViewerChromeLayout: ViewerChromeLayout = 'stacked';

export const VIEWER_CHROME_LAYOUT_LABELS: Record<ViewerChromeLayout, string> = {
  fixed: '固定',
  stacked: '层叠',
  floating: '悬浮',
};

export const VIEWER_CHROME_LAYOUT_HINTS: Record<ViewerChromeLayout, string> = {
  fixed: '顶栏与底栏占位，正文在两者之间滚动。',
  stacked: '顶底栏整条叠在内容上，随阅读器 chrome 滑入滑出。',
  floating: '按钮与信息以圆角胶囊独立浮在正文上方，半透明模糊背景。',
};

/** 层叠顶栏 surface 视觉 */
export const mediaViewerChromeTopSurfaceClass =
  'border-b border-border/50 bg-background/95 backdrop-blur safe-area-inset-top';

/** 层叠底栏 surface 视觉 */
export const mediaViewerChromeBottomSurfaceClass =
  'border-t border-border/50 bg-background/95 text-muted-foreground backdrop-blur';

/** 层叠底栏内容根 */
export const mediaViewerChromeBottomContentClass = 'flex w-full flex-col';

/** 底栏单行布局 */
export const mediaViewerChromeBottomRowClass =
  'flex items-center justify-between gap-2 px-4 py-2';

/** 悬浮控件：圆角胶囊/圆形按钮 */
export const mediaViewerChromeFloatingControlClass =
  'border border-border/50 bg-background/80 text-foreground shadow-sm backdrop-blur-md';

export const mediaViewerChromeFloatingIconButtonClass = cn(
  mediaViewerChromeFloatingControlClass,
  'size-10 shrink-0 rounded-full',
);

export const mediaViewerChromeFloatingPillClass = cn(
  mediaViewerChromeFloatingControlClass,
  'rounded-full px-3 py-1.5',
);

/** 主内容区铺满壳层 */
export const mediaViewerMainStageClass = 'media-viewer-main-stage absolute inset-0 min-h-0';

export const mediaViewerMainScrollClass =
  'media-viewer-main-scroll absolute inset-0 overflow-y-auto';
