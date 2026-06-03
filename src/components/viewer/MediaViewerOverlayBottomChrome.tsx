import { splitProps, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import { useMediaViewerShellOptional } from '@/components/viewer/media-viewer-shell-context';
import { mediaViewerChromeBottomSurfaceClass } from '@/components/viewer/viewer-chrome';

export interface MediaViewerOverlayBottomChromeProps {
  children: JSX.Element;
  /** 覆盖 Shell 顶栏联动（如全屏视频强制隐藏） */
  visible?: boolean;
  class?: string;
}

/**
 * 四 viewer 共用的 overlay 底栏壳（reader-chrome-overlay-panel + surface）。
 * 显隐动画只作用在本壳层；子内容应常驻 DOM，勿用 Show 随顶栏卸载。
 */
export function MediaViewerOverlayBottomChrome(props: MediaViewerOverlayBottomChromeProps) {
  const [local] = splitProps(props, ['children', 'visible', 'class']);
  const shell = useMediaViewerShellOptional();
  const panelVisible = () => {
    if (local.visible !== undefined) return local.visible;
    if (shell) return shell.headerVisible();
    return true;
  };

  return (
    <div
      class={cn(
        'reader-chrome-overlay-panel reader-chrome-overlay-panel--bottom',
        'pointer-events-auto w-full app-bottom-chrome-inset',
        !panelVisible() && 'reader-chrome-overlay-panel--hidden',
        local.class,
      )}
    >
      <div
        class={cn(
          'reader-chrome-overlay-panel__surface flex w-full flex-col',
          mediaViewerChromeBottomSurfaceClass,
        )}
      >
        {local.children}
      </div>
    </div>
  );
}
