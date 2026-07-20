import { Show, splitProps, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import { useMediaViewerShellOptional } from '@/components/media/viewer/media-viewer-shell-context';
import { MediaViewerFloatingTopChrome } from '@/components/media/viewer/MediaViewerFloatingTopChrome';
import { useViewerChromeLayout, useMediaViewerToolbarChromeClasses } from '@/lib/viewer/viewer-chrome-layout';
import {
  mediaViewerChromeTopFillClass,
  type ViewerChromeLayout,
} from '@/components/media/viewer/viewer-chrome';
import {
  mergeViewerChromeSurfaceStyles,
  resolveViewerChromeOverlayAppearanceStyle,
  viewerChromeFloatingScopeStyle,
} from '@/lib/viewer/media-viewer-chrome-overlay-appearance';
import { mediaViewerChromeBarHoverHandlers } from '@/lib/media/media-viewer-chrome-bar-hover';
import { ThemedComponentBackground } from '@/components/theme/ThemedComponentBackground';
import { componentDataAttr } from '@/lib/theme/preview/component-registry';

export interface MediaViewerHeaderProps {
  children: JSX.Element;
  /** 主工具栏下方的附加行（如文本阅读器章节/书源栏） */
  subHeader?: JSX.Element;
  /** 顶栏最下方附加行（如跟随顶栏的页眉） */
  bottomSlot?: JSX.Element;
  /** 顶栏附属内容最下方（如嵌入的亮度胶囊，透明透出正文） */
  trailingSlot?: JSX.Element;
  /** 覆盖应用设置中的布局（一般无需指定） */
  layout?: ViewerChromeLayout;
  visible?: boolean;
  class?: string;
  /** 顶栏 surface 附加 class（如主题跟随） */
  surfaceClass?: string;
  /** 顶栏 surface 内联样式（主题跟随时使用，覆盖默认背景） */
  surfaceStyle?: JSX.CSSProperties;
}

export function MediaViewerHeader(props: MediaViewerHeaderProps) {
  const [local] = splitProps(props, [
    'children',
    'subHeader',
    'bottomSlot',
    'trailingSlot',
    'layout',
    'visible',
    'class',
    'surfaceClass',
    'surfaceStyle',
  ]);
  const shell = useMediaViewerShellOptional();
  const chromeLayout = useViewerChromeLayout();
  const toolbarChrome = useMediaViewerToolbarChromeClasses();
  const layout = () => local.layout ?? chromeLayout();
  const visible = () => {
    if (layout() === 'fixed') return true;
    if (local.visible !== undefined) return local.visible;
    if (shell) return shell.headerVisible();
    return true;
  };

  const chromeBarHover = () => mediaViewerChromeBarHoverHandlers(shell, layout());

  const themedSurface = () => local.surfaceStyle != null;

  const followPageClass = () => (themedSurface() ? 'reader-chrome-follow-page' : undefined);

  const stackedSurfaceClass = () =>
    cn('reader-chrome-overlay-panel__surface flex min-w-0 max-w-full flex-col', local.surfaceClass, followPageClass());

  const stackedChromeFillClass = () =>
    cn(
      'flex min-w-0 max-w-full flex-col',
      !themedSurface() && mediaViewerChromeTopFillClass,
      !themedSurface() && 'text-foreground',
      themedSurface() && 'border-b',
      followPageClass(),
    );

  const fixedHeaderClass = () =>
    cn(
      'reader-top-bar flex shrink-0 flex-col safe-area-inset-top',
      !visible() && 'reader-bar-hidden',
      local.class,
    );

  const fixedChromeFillClass = () =>
    cn(
      'flex flex-col border-b',
      !themedSurface() && 'bg-background text-foreground',
      themedSurface() && 'reader-chrome-follow-page border-b',
    );

  const stackedFillStyle = (): JSX.CSSProperties | undefined => {
    if (themedSurface()) return local.surfaceStyle;
    if (layout() === 'stacked') {
      return mergeViewerChromeSurfaceStyles(resolveViewerChromeOverlayAppearanceStyle(), local.surfaceStyle);
    }
    return local.surfaceStyle;
  };

  const toolbarRow = () => (
    <div class={toolbarChrome().toolbarRowClass}>
      {local.children}
    </div>
  );

  const chromeBody = () => (
    <>
      {toolbarRow()}
      <Show when={local.subHeader}>{local.subHeader}</Show>
      <Show when={local.bottomSlot}>{local.bottomSlot}</Show>
    </>
  );

  const trailingSlot = () => <Show when={local.trailingSlot}>{local.trailingSlot}</Show>;

  return (
    <>
      <Show when={layout() === 'floating'}>
        <MediaViewerFloatingTopChrome
          visible={visible()}
          class={local.class}
          onPointerEnter={chromeBarHover().onPointerEnter}
          onPointerLeave={chromeBarHover().onPointerLeave}
        >
          <div
            class={cn(
              'pointer-events-none flex w-full min-w-0 max-w-full flex-col items-center gap-2 overflow-visible',
              followPageClass(),
            )}
            style={
              themedSurface() ? viewerChromeFloatingScopeStyle(local.surfaceStyle) : undefined
            }
          >
            {chromeBody()}
            {trailingSlot()}
          </div>
        </MediaViewerFloatingTopChrome>
      </Show>
      <Show when={layout() === 'stacked'}>
        <header
          class={cn(
            'reader-chrome-overlay-panel reader-chrome-overlay-panel--top',
            'absolute inset-x-0 top-0 z-10 max-w-full min-w-0',
            !visible() && 'reader-chrome-overlay-panel--hidden',
            local.class,
          )}
          data-media-viewer-interactive-zone
          data-tauri-drag-region
          onClick={(e) => e.stopPropagation()}
          onPointerEnter={chromeBarHover().onPointerEnter}
          onPointerLeave={chromeBarHover().onPointerLeave}
        >
          <div class={cn(stackedSurfaceClass(), 'relative overflow-hidden')} {...componentDataAttr('toolbarHeader')}>
            <ThemedComponentBackground componentId="toolbarHeader" />
            <div class={cn(stackedChromeFillClass(), 'relative z-1')} style={stackedFillStyle()}>
              {chromeBody()}
            </div>
            {trailingSlot()}
          </div>
        </header>
      </Show>
      <Show when={layout() === 'fixed'}>
        <header
          class={fixedHeaderClass()}
          data-tauri-drag-region
          onClick={(e) => e.stopPropagation()}
        >
          <div class={cn(fixedChromeFillClass(), 'relative overflow-hidden')} {...componentDataAttr('toolbarHeader')}>
            <ThemedComponentBackground componentId="toolbarHeader" />
            <div class="relative z-1" style={local.surfaceStyle}>
              {chromeBody()}
            </div>
          </div>
          {trailingSlot()}
        </header>
      </Show>
    </>
  );
}
