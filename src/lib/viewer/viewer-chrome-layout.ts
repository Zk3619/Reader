import { createMemo } from 'solid-js';
import { cn } from '@/lib/utils';
import type { ViewerChromeLayout } from '@/components/viewer/viewer-chrome';
import {
  defaultViewerChromeLayout,
  mediaViewerChromeFloatingIconButtonClass,
  mediaViewerChromeFloatingPillClass,
} from '@/components/viewer/viewer-chrome';
import { settingsState } from '@/stores/settings';

export function normalizeViewerChromeLayout(
  value: string | undefined | null,
): ViewerChromeLayout {
  if (value === 'fixed' || value === 'stacked' || value === 'floating') {
    return value;
  }
  if (value === 'overlay') return 'stacked';
  return defaultViewerChromeLayout;
}

/** 阅读器 / MediaViewer 顶底栏布局（来自应用设置） */
export function useViewerChromeLayout() {
  return createMemo(() =>
    normalizeViewerChromeLayout(settingsState.app.viewerChromeLayout),
  );
}

/** 正文滚动区 class：固定模式占 flex-1，层叠/悬浮为 absolute inset-0 */
export function useMediaViewerMainScrollClass(extra?: string) {
  const layout = useViewerChromeLayout();
  return createMemo(() =>
    cn(
      layout() === 'fixed'
        ? 'min-h-0 flex-1 overflow-y-auto scroll-gutter-stable-both'
        : 'media-viewer-main-scroll absolute inset-0 overflow-y-auto scroll-gutter-stable-both',
      extra,
    ),
  );
}

/** 正文舞台区 class：固定模式 flex-1，层叠/悬浮为 absolute inset-0 */
export function useMediaViewerMainStageClass(extra?: string) {
  const layout = useViewerChromeLayout();
  return createMemo(() =>
    cn(
      layout() === 'fixed'
        ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
        : 'media-viewer-main-stage absolute inset-0 min-h-0 overflow-hidden',
      extra,
    ),
  );
}

/** 悬浮布局下顶栏/底栏控件的圆角胶囊样式 */
export function useMediaViewerChromeFloating() {
  const layout = useViewerChromeLayout();
  const isFloating = createMemo(() => layout() === 'floating');
  const iconButtonClass = createMemo(() =>
    isFloating() ? mediaViewerChromeFloatingIconButtonClass : '',
  );
  const pillClass = createMemo(() =>
    isFloating() ? mediaViewerChromeFloatingPillClass : '',
  );
  return { layout, isFloating, iconButtonClass, pillClass };
}
