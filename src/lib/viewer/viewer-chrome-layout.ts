import { createMemo } from 'solid-js';
import { useMediaViewerChromeLayoutOverride } from '@/components/media/viewer/MediaViewerChromeLayoutProvider';
import { isMobile } from '@/lib/platform/detect';
import { cn } from '@/lib/utils';
import type { ViewerChromeLayout } from '@/components/media/viewer/viewer-chrome';
import {
  defaultViewerChromeLayout,
  mediaViewerChromeFloatingActionsClusterClass,
  mediaViewerChromeFloatingClusterIconButtonClass,
  mediaViewerChromeFloatingIconButtonClass,
  mediaViewerChromeFloatingOverlayFirstRowClass,
  mediaViewerChromeFloatingPillClass,
  mediaViewerChromeFloatingTitleCapsuleClass,
  mediaViewerChromeFloatingWindowChromeCapsuleClass,
  mediaViewerChromeFloatingWindowChromeLeadClass,
  mediaViewerChromeFloatingWindowChromeTrailClass,
  mediaViewerChromeFloatingWideBlockClass,
  mediaViewerChromeHitTargetClass,
  mediaViewerChromeToolbarActionsGroupClass,
  mediaViewerChromeToolbarActionsMobileClass,
  mediaViewerChromeToolbarOverlayFirstRowClass,
  mediaViewerChromeToolbarRowClass,
  mediaViewerChromeToolbarRowMobileClass,
  mediaViewerChromeToolbarRowStackedClass,
  mediaViewerChromeFloatingToolbarRowClass,
  mediaViewerChromeFloatingToolbarLeadRowClass,
  mediaViewerChromeToolbarLeadRowClass,
  mediaViewerChromeToolbarSpacerClass,
  mediaViewerChromeToolbarWindowChromeLeadClass,
  mediaViewerChromeToolbarWindowChromeTrailClass,
  mediaViewerChromeToolbarSpacerOverlayClass,
  mediaViewerContentScrollClass,
} from '@/components/media/viewer/viewer-chrome';
import {
  resolveViewerChromeOverlayAppearanceStyle,
  viewerChromeOverlayAppearanceApplies,
} from '@/lib/viewer/media-viewer-chrome-overlay-appearance';
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
  const titleCapsuleClass = createMemo(() =>
    isFloating() ? mediaViewerChromeFloatingTitleCapsuleClass : '',
  );
  const windowChromeCapsuleClass = createMemo(() =>
    isFloating() ? mediaViewerChromeFloatingWindowChromeCapsuleClass : '',
  );
  const actionsClusterClass = createMemo(() =>
    isFloating() ? mediaViewerChromeFloatingActionsClusterClass : '',
  );
  const wideBlockClass = createMemo(() =>
    isFloating() ? mediaViewerChromeFloatingWideBlockClass : '',
  );
  const clusterIconButtonClass = createMemo(() =>
    isFloating() ? mediaViewerChromeFloatingClusterIconButtonClass : '',
  );
  const inlineIconClass = createMemo(() =>
    isFloating() ? 'size-9 shrink-0' : '',
  );
  const floatingHitTargetClass = createMemo(() =>
    isFloating() ? mediaViewerChromeHitTargetClass : '',
  );
  const overlaySurfaceStyle = createMemo(() => {
    if (!viewerChromeOverlayAppearanceApplies(layout())) {
      return {};
    }
    return resolveViewerChromeOverlayAppearanceStyle();
  });
  return {
    layout,
    isFloating,
    iconButtonClass,
    pillClass,
    titleCapsuleClass,
    windowChromeCapsuleClass,
    actionsClusterClass,
    clusterIconButtonClass,
    wideBlockClass,
    floatingHitTargetClass,
    inlineIconClass,
    overlaySurfaceStyle,
  };
}

/** 顶栏工具栏在 fixed / stacked / floating 下的 class 分流（断点由 CSS 控制） */
export function useMediaViewerToolbarChromeClasses() {
  const layout = useViewerChromeLayout();
  const mobile = isMobile();
  return createMemo(() => {
    const mode = layout();
    const floating = mode === 'floating';
    return {
      mobile,
      showSpacer: mode === 'fixed' || mode === 'stacked',
      toolbarRowClass: mobile
        ? mediaViewerChromeToolbarRowMobileClass
        : floating
          ? mediaViewerChromeFloatingToolbarRowClass
          : mode === 'stacked'
            ? mediaViewerChromeToolbarRowStackedClass
            : mediaViewerChromeToolbarRowClass,
      overlayFirstRowClass: floating
        ? mediaViewerChromeFloatingOverlayFirstRowClass
        : mediaViewerChromeToolbarOverlayFirstRowClass,
      actionsGroupClass: mobile
        ? mediaViewerChromeToolbarActionsMobileClass
        : floating
          ? mediaViewerChromeFloatingActionsClusterClass
          : mediaViewerChromeToolbarActionsGroupClass,
      windowChromeLeadClass: floating
        ? mediaViewerChromeFloatingWindowChromeLeadClass
        : mediaViewerChromeToolbarWindowChromeLeadClass,
      windowChromeTrailClass: floating
        ? mediaViewerChromeFloatingWindowChromeTrailClass
        : mediaViewerChromeToolbarWindowChromeTrailClass,
      leadRowClass: floating
        ? mediaViewerChromeFloatingToolbarLeadRowClass
        : mediaViewerChromeToolbarLeadRowClass,
      spacerClass:
        mode === 'fixed' || mode === 'stacked'
          ? mediaViewerChromeToolbarSpacerClass
          : mediaViewerChromeToolbarSpacerOverlayClass,
    };
  });
}

/** 移动端 media 正文区：隐藏滚动条且不预留 scrollbar-gutter */
export function mediaViewerMobileContentOverflowClass(): string {
  return isMobile()
    ? cn(mediaViewerContentScrollClass, 'overflow-x-hidden overflow-y-auto')
    : '';
}
