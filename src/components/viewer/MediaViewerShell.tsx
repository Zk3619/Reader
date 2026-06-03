import { createEffect, createSignal, onCleanup, onMount, splitProps, type Accessor, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import { subscribeMediaViewerAppFocus } from '@/lib/media/media-viewer-app-focus';
import { createMediaViewerChromeAutoHide } from '@/lib/media/media-viewer-chrome-auto-hide';
import {
  createMediaViewerChromeInputHandlers,
  type MediaViewerChromeInputHandlers,
} from '@/lib/media/media-viewer-chrome-input';
import {
  MediaViewerShellContextProvider,
  type MediaViewerShellContextValue,
} from '@/components/viewer/media-viewer-shell-context';

export type { ViewerChromePlacement } from '@/components/viewer/viewer-chrome';

export interface MediaViewerShellProps {
  children: JSX.Element;
  class?: string;
  /** 顶栏显隐；不传则 Shell 内部管理（点击主区可切换）*/
  headerVisible?: boolean;
  /** 底栏显隐；不传则与顶栏一致 */
  footerVisible?: boolean;
  onHeaderVisibleChange?: (visible: boolean) => void;
  /** 点击 MediaViewerShellMain 切换 overlay 顶底栏；文本阅读器请设为 false */
  tapToToggleBars?: boolean;
  /**
   * 启用壳层指针显隐（移出显示 / 移入后单击隐藏）与内容区双击，且不占用主区单击切换。
   * 文本阅读器传入外部 `chromeInputHandlers` 并保留分区单击。
   */
  chromePointerInput?: boolean;
  /** 外部 chrome 指针逻辑（由页面创建并 dispose） */
  chromeInputHandlers?: MediaViewerChromeInputHandlers;
  /** 导航栈条目是否为栈顶（从其它页回到 viewer 时由 App 传入） */
  entryVisible?: Accessor<boolean>;
}

function MediaViewerShellRoot(props: MediaViewerShellProps) {
  const [local] = splitProps(props, [
    'children',
    'class',
    'headerVisible',
    'footerVisible',
    'onHeaderVisibleChange',
    'tapToToggleBars',
    'chromePointerInput',
    'chromeInputHandlers',
    'entryVisible',
  ]);

  const [internalHeaderVisible, setInternalHeaderVisible] = createSignal(true);

  const isHeaderControlled = () => local.headerVisible !== undefined;

  const headerVisible = () =>
    isHeaderControlled() ? (local.headerVisible as boolean) : internalHeaderVisible();

  const footerVisible = () => {
    if (local.footerVisible !== undefined) return local.footerVisible;
    return headerVisible();
  };

  const setHeaderVisibleRaw = (visible: boolean) => {
    if (local.onHeaderVisibleChange) {
      local.onHeaderVisibleChange(visible);
      return;
    }
    if (!isHeaderControlled()) {
      setInternalHeaderVisible(visible);
    }
  };

  const tapToToggleBars = () => local.tapToToggleBars !== false;
  const chromePointerInput = () => local.chromePointerInput === true;
  const chromeInputEnabled = () => tapToToggleBars() || chromePointerInput();

  const useInternalAutoHide = () => chromeInputEnabled() && !local.chromeInputHandlers;

  const tryShowChromeOnForeground = () => {
    if (!useInternalAutoHide() || isHeaderControlled()) return;
    const entryVisible = local.entryVisible;
    if (entryVisible !== undefined && !entryVisible()) return;
    setHeaderVisibleRaw(true);
  };

  const appFocus = useInternalAutoHide()
    ? subscribeMediaViewerAppFocus({
      onForeground: tryShowChromeOnForeground,
      onBackground: () => chromeAutoHide.clearHideTimer(),
    })
    : null;

  const chromeAutoHide = createMediaViewerChromeAutoHide({
    enabled: useInternalAutoHide,
    isControlled: isHeaderControlled,
    setHeaderVisible: setHeaderVisibleRaw,
    canAutoHide: () => appFocus?.canAutoHide() ?? true,
  });

  const setHeaderVisible = (visible: boolean) => {
    setHeaderVisibleRaw(visible);
    if (!visible && !isHeaderControlled() && chromeInputEnabled() && !local.chromeInputHandlers) {
      chromeAutoHide.clearHideTimer();
    }
  };

  const internalChromeInput = !local.chromeInputHandlers && chromeInputEnabled()
    ? createMediaViewerChromeInputHandlers({
      headerVisible,
      setHeaderVisible,
      toggleBars: () => setHeaderVisible(!headerVisible()),
      enabled: () => true,
    })
    : null;

  const activeChromeInput = () => local.chromeInputHandlers ?? internalChromeInput;

  onMount(() => {
    if (local.chromeInputHandlers || isHeaderControlled() || !chromeInputEnabled()) return;
    const entryVisible = local.entryVisible;
    if (entryVisible !== undefined && !entryVisible()) return;
    chromeAutoHide.revealSession();
  });

  createEffect(() => {
    if (local.chromeInputHandlers) return;
    const entryVisible = local.entryVisible?.();
    if (entryVisible === undefined) return;
    if (entryVisible) {
      chromeAutoHide.revealSession();
    } else {
      chromeAutoHide.clearHideTimer();
    }
  });

  onCleanup(() => {
    appFocus?.dispose();
    internalChromeInput?.dispose();
    if (!local.chromeInputHandlers) {
      chromeAutoHide.dispose();
    }
  });

  const shellValue = (): MediaViewerShellContextValue => {
    const input = activeChromeInput();
    return {
      headerVisible,
      footerVisible,
      setHeaderVisible,
      toggleBars: () => setHeaderVisible(!headerVisible()),
      tapToToggleBars: tapToToggleBars(),
      onContentPrimaryClick: input?.onContentPrimaryClick,
      onContentDblClick: input?.onContentDblClick,
    };
  };

  return (
    <MediaViewerShellContextProvider value={shellValue()}>
      <div
        ref={(el) => activeChromeInput()?.bindShellElement(el)}
        class={cn(
          'fixed inset-0 flex flex-col overflow-hidden bg-background text-foreground',
          local.class,
        )}
        onPointerLeave={(e) => activeChromeInput()?.onShellPointerLeave(e)}
        onPointerEnter={(e) => activeChromeInput()?.onShellPointerEnter(e)}
      >
        {local.children}
      </div>
    </MediaViewerShellContextProvider>
  );
}

export const MediaViewerShell = MediaViewerShellRoot;

export { MediaViewerShellMain } from '@/components/viewer/MediaViewerShellMain';
export { MediaViewerHeader } from '@/components/viewer/MediaViewerHeader';
export { MediaViewerFooter } from '@/components/viewer/MediaViewerFooter';
