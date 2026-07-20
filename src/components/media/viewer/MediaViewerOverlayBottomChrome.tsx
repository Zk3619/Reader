import { Show, splitProps, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import { useMediaViewerShellOptional } from '@/components/media/viewer/media-viewer-shell-context';
import { mediaViewerChromeBottomFillClass } from '@/components/media/viewer/viewer-chrome';
import { useViewerChromeLayout } from '@/lib/viewer/viewer-chrome-layout';
import {
  mergeViewerChromeSurfaceStyles,
  resolveViewerChromeOverlayAppearanceStyle,
} from '@/lib/viewer/media-viewer-chrome-overlay-appearance';
import { mediaViewerChromeBarHoverHandlers } from '@/lib/media/media-viewer-chrome-bar-hover';
import { appBottomChromePadding } from '@/lib/ui/viewport-classes';

export interface MediaViewerOverlayBottomChromeProps {
  children: JSX.Element;
  /** 底栏内容区上方透明槽（如嵌入亮度胶囊） */
  headSlot?: JSX.Element;
  /** 覆盖 Shell 顶栏联动（如全屏视频强制隐藏） */
  visible?: boolean;
  class?: string;
  surfaceClass?: string;
  surfaceStyle?: JSX.CSSProperties;
}

/**
 * 四 viewer 共用的 overlay 底栏壳（reader-chrome-overlay-panel + surface）。
 * 显隐动画只作用在本壳层；子内容应常驻 DOM，勿用 Show 随顶栏卸载。
 */
export function MediaViewerOverlayBottomChrome(props: MediaViewerOverlayBottomChromeProps) {
  const [local] = splitProps(props, [
    'children',
    'headSlot',
    'visible',
    'class',
    'surfaceClass',
    'surfaceStyle',
  ]);
  const shell = useMediaViewerShellOptional();
  const chromeLayout = useViewerChromeLayout();
  const chromeBarHover = () => mediaViewerChromeBarHoverHandlers(shell, chromeLayout());
  const panelVisible = () => {
    if (local.visible !== undefined) return local.visible;
    if (shell) return shell.headerVisible();
    return true;
  };
  const themedSurface = () => local.surfaceStyle != null;
  const followPageClass = () => (themedSurface() ? 'reader-chrome-follow-page' : undefined);
  const fillStyle = (): JSX.CSSProperties | undefined => {
    if (themedSurface()) return local.surfaceStyle;
    return mergeViewerChromeSurfaceStyles(
      resolveViewerChromeOverlayAppearanceStyle(),
      local.surfaceStyle,
    );
  };

  return (
    <div
      class={cn(
        'reader-chrome-overlay-panel reader-chrome-overlay-panel--bottom',
        'pointer-events-auto w-full max-w-full min-w-0',
        !panelVisible() && 'reader-chrome-overlay-panel--hidden',
        local.class,
      )}
      onPointerEnter={chromeBarHover().onPointerEnter}
      onPointerLeave={chromeBarHover().onPointerLeave}
    >
      <div
        class={cn(
          'reader-chrome-overlay-panel__surface flex w-full min-w-0 max-w-full flex-col',
          local.surfaceClass,
          followPageClass(),
        )}
      >
        <Show when={local.headSlot}>{local.headSlot}</Show>
        <div
          class={cn(
            'flex min-w-0 max-w-full flex-col',
            !themedSurface() && mediaViewerChromeBottomFillClass,
            themedSurface() && 'border-t',
            followPageClass(),
            appBottomChromePadding,
          )}
          style={fillStyle()}
        >
          {local.children}
        </div>
      </div>
    </div>
  );
}
