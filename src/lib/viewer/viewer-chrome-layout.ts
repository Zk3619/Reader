import { createMemo } from 'solid-js';
import { useMediaViewerChromeLayoutOverride } from '@/components/viewer/MediaViewerChromeLayoutProvider';
import { isMobile } from '@/lib/platform/detect';
import { cn } from '@/lib/utils';
import type { ViewerChromeLayout } from '@/components/viewer/viewer-chrome';
import {
  defaultViewerChromeLayout,
  mediaViewerChromeFloatingIconButtonClass,
  mediaViewerChromeFloatingPillClass,
  mediaViewerChromeHitTargetClass,
  mediaViewerContentScrollClass,
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

/** 阅读器 / MediaViewer 顶底栏布局（应用设置；可被 MediaViewerChromeLayoutProvider 覆盖） */
export function useViewerChromeLayout() {
  const override = useMediaViewerChromeLayoutOverride();
  return createMemo(() => {
    const fromViewer = override();
    if (fromViewer != null) {
      return normalizeViewerChromeLayout(fromViewer);
    }
    return normalizeViewerChromeLayout(settingsState.app.viewerChromeLayout);
  });
}

/** image/video/audio/file 正文滚动 gutter：移动端无滚动条与双侧预留 */
function mediaContentScrollGutterClass() {
  return isMobile() ? mediaViewerContentScrollClass : 'scroll-gutter-stable-both';
}

/** 四 media-viewer 正文滚动区：固定模式占 flex-1，层叠/悬浮为 absolute inset-0 */
export function useMediaContentScrollClass(extra?: string) {
  const layout = useViewerChromeLayout();
  return createMemo(() =>
    cn(
      layout() === 'fixed'
        ? 'min-h-0 flex-1 overflow-y-auto'
        : 'media-viewer-main-scroll absolute inset-0 overflow-y-auto',
      mediaContentScrollGutterClass(),
      extra,
    ),
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
  /** 悬浮顶栏：左右各一组胶囊，避免逐按钮铺满整行形成背景条 */
  const clusterClass = createMemo(() =>
    isFloating()
      ? cn(mediaViewerChromeFloatingPillClass, mediaViewerChromeHitTargetClass)
      : '',
  );
  const inlineIconClass = createMemo(() =>
    isFloating() ? 'size-10 shrink-0' : '',
  );
  return { layout, isFloating, iconButtonClass, pillClass, clusterClass, inlineIconClass };
}

/** 移动端 media 正文区：隐藏滚动条且不预留 scrollbar-gutter */
export function mediaViewerMobileContentOverflowClass(): string {
  return isMobile()
    ? cn(mediaViewerContentScrollClass, 'overflow-x-hidden overflow-y-auto')
    : '';
}
