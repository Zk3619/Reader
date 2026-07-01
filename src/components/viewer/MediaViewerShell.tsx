import { createEffect, createSignal, onCleanup, onMount, splitProps, type Accessor, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import { subscribeMediaViewerAppFocus } from '@/lib/media/media-viewer-app-focus';
import {
  createMediaViewerChromeAutoHide,
  type MediaViewerChromeAutoHide,
} from '@/lib/media/media-viewer-chrome-auto-hide';
import {
  isMediaViewerChromeAutoHideSuspended,
  registerMediaViewerChromeAutoHideSession,
} from '@/lib/media/media-viewer-chrome-auto-hide-registry';
import {
  createMediaViewerChromeInputHandlers,
  type MediaViewerChromeInputHandlers,
} from '@/lib/media/media-viewer-chrome-input';
import { isReaderTextSelectionSurfaceActive } from '@/lib/media/text/reader-text-selection-gesture';
import {
  isReadAloudBackgroundExitInProgress,
  clearReadAloudBackgroundExitFlag,
} from '@/lib/media/text/read-aloud-background';
import { registerMediaViewerChromeBackSession } from '@/lib/media/media-viewer-chrome-back';
import {
  MediaViewerShellContextProvider,
  type MediaViewerShellContextValue,
} from '@/components/viewer/media-viewer-shell-context';
import { useViewerChromeLayout } from '@/lib/viewer/viewer-chrome-layout';
import { isMobile } from '@/lib/platform/detect';
import { mediaViewerChromeDesktopMinWidthClass } from '@/components/viewer/viewer-chrome';

export type { ViewerChromeLayout } from '@/components/viewer/viewer-chrome';

export interface MediaViewerShellProps {
  children: JSX.Element;
  class?: string;
  style?: JSX.CSSProperties;
  /** 顶栏显隐；不传则 Shell 内部管理（点击主区可切换）*/
  headerVisible?: boolean;
  onHeaderVisibleChange?: (visible: boolean) => void;
  /** 点击 MediaViewerShellMain 切换 overlay 顶底栏；文本阅读器请设为 false */
  tapToToggleBars?: boolean;
  /**
   * 启用壳层指针显隐（移出显示 / 移入后单击隐藏）与内容区双击。
   * 与 `tapToToggleBars={false}` 联用时需配合 `contentPrimaryAction`（文本分区点击）。
   */
  chromePointerInput?: boolean;
  /** 主区单击动作（文本分区）；未设且 tapToToggleBars 为 true 时等同 toggleBars */
  contentPrimaryAction?: (event: MouseEvent) => void;
  /** 外部 chrome 指针逻辑（一般无需；文本请用内置 chrome + contentPrimaryAction） */
  chromeInputHandlers?: MediaViewerChromeInputHandlers;
  /** 导航栈条目是否为栈顶（从其它页回到 viewer 时由 App 传入） */
  entryVisible?: Accessor<boolean>;
  /**
   * 使用外部 chromeInputHandlers 时仍启用进入/失焦时的自动隐藏与会话 reveal
   * （文本阅读器：受控顶栏 + 分区单击）
   */
  autoHideSession?: boolean;
  /** 自动隐藏实例就绪（供页面在手动隐藏顶栏时 clearHideTimer） */
  onChromeAutoHideReady?: (autoHide: MediaViewerChromeAutoHide) => void;
}

function MediaViewerShellRoot(props: MediaViewerShellProps) {
  const [local] = splitProps(props, [
    'children',
    'class',
    'style',
    'headerVisible',
    'onHeaderVisibleChange',
    'tapToToggleBars',
    'chromePointerInput',
    'contentPrimaryAction',
    'chromeInputHandlers',
    'entryVisible',
    'autoHideSession',
    'onChromeAutoHideReady',
  ]);

  const [internalHeaderVisible, setInternalHeaderVisible] = createSignal(true);
  const chromeLayout = useViewerChromeLayout();
  const chromeBarsCollapsible = () => chromeLayout() !== 'fixed';

  const isHeaderControlled = () => local.headerVisible !== undefined;

  const headerVisible = () => {
    if (!chromeBarsCollapsible()) return true;
    return isHeaderControlled()
      ? (local.headerVisible as boolean)
      : internalHeaderVisible();
  };

  const footerVisible = headerVisible;

  const setHeaderVisibleRaw = (visible: boolean) => {
    if (!chromeBarsCollapsible()) return;
    if (isReadAloudBackgroundExitInProgress()) return;
    if (local.entryVisible !== undefined && !local.entryVisible()) return;
    if (local.onHeaderVisibleChange) {
      local.onHeaderVisibleChange(visible);
      return;
    }
    if (!isHeaderControlled()) {
      setInternalHeaderVisible(visible);
    }
  };

  const wantsTapToggle = () => local.tapToToggleBars !== false;
  const wantsPointerChrome = () => local.chromePointerInput === true;
  const wantsContentAction = () => local.contentPrimaryAction != null;
  /** 需要主区单击/双击处理器（固定模式下仍保留分区单击等，但不隐藏顶底栏） */
  const needsChromeInputHandlers = () =>
    wantsTapToggle() || wantsPointerChrome() || wantsContentAction();
  const tapToToggleBars = () => wantsTapToggle() && chromeBarsCollapsible();

  const useSessionAutoHide = () =>
    local.autoHideSession === true && chromeBarsCollapsible();
  const useInternalAutoHide = () =>
    chromeBarsCollapsible() &&
    (wantsTapToggle() || wantsPointerChrome()) &&
    !local.chromeInputHandlers;
  const useAutoHide = () => useInternalAutoHide() || useSessionAutoHide();

  const tryShowChromeOnForeground = () => {
    if (!useAutoHide()) return;
    if (isHeaderControlled() && !useSessionAutoHide()) return;
    const entryVisible = local.entryVisible;
    if (entryVisible !== undefined && !entryVisible()) return;
    if (isReaderTextSelectionSurfaceActive()) return;
    setHeaderVisible(true);
    activeChromeInput()?.resetDismissGestureState();
  };

  let chromeAutoHide: MediaViewerChromeAutoHide;
  let revealChromeSession: () => void;
  let internalChromeInput: MediaViewerChromeInputHandlers | null = null;

  const activeChromeInput = () => local.chromeInputHandlers ?? internalChromeInput;

  const shouldScheduleAutoHide = () => {
    if (!useAutoHide() || !headerVisible()) return false;
    if (activeChromeInput()?.shouldSuppressAutoHide()) return false;
    return true;
  };

  const setHeaderVisible = (visible: boolean) => {
    setHeaderVisibleRaw(visible);
    if (!visible) {
      activeChromeInput()?.resetDismissGestureState();
      if (useAutoHide()) {
        chromeAutoHide.clearHideTimer();
      }
      return;
    }
    if (!useAutoHide()) return;
    if (activeChromeInput()?.shouldSuppressAutoHide()) {
      chromeAutoHide.clearHideTimer();
      return;
    }
    chromeAutoHide.scheduleHide();
  };

  const onChromeBarPointerEnter = () => {
    if (!useAutoHide() || !chromeBarsCollapsible()) return;
    chromeAutoHide.clearHideTimer();
  };

  const onChromeBarPointerLeave = () => {
    if (!shouldScheduleAutoHide()) return;
    chromeAutoHide.scheduleHide();
  };

  internalChromeInput =
    !local.chromeInputHandlers && needsChromeInputHandlers()
      ? createMediaViewerChromeInputHandlers({
        headerVisible,
        setHeaderVisible,
        toggleBars: () => setHeaderVisible(!headerVisible()),
        enabled: () =>
          (local.entryVisible?.() ?? true) && !isReadAloudBackgroundExitInProgress(),
        barsCollapsible: chromeBarsCollapsible,
      })
      : null;

  const registryToken = Symbol('media-viewer-chrome-auto-hide');
  const chromeBackToken = Symbol('media-viewer-chrome-back');

  const syncChromeBackRegistry = () => {
    if (!chromeBarsCollapsible()) {
      registerMediaViewerChromeBackSession(null, chromeBackToken);
      return;
    }
    const entryVisible = local.entryVisible?.() ?? true;
    if (!entryVisible) {
      registerMediaViewerChromeBackSession(null, chromeBackToken);
      return;
    }
    registerMediaViewerChromeBackSession(
      {
        isChromeVisible: headerVisible,
        chromeBarsCollapsible,
        revealChrome: () => {
          setHeaderVisible(true);
          activeChromeInput()?.resetDismissGestureState();
          if (useAutoHide()) chromeAutoHide.scheduleHide();
        },
      },
      chromeBackToken,
    );
  };

  const syncChromeAutoHideRegistry = () => {
    if (!useAutoHide()) {
      registerMediaViewerChromeAutoHideSession(null, registryToken);
      return;
    }
    const visible = local.entryVisible?.() ?? true;
    if (visible) {
      registerMediaViewerChromeAutoHideSession(
        {
          autoHide: chromeAutoHide,
          showChrome: () => setHeaderVisible(true),
        },
        registryToken,
      );
    } else {
      registerMediaViewerChromeAutoHideSession(null, registryToken);
    }
  };

  chromeAutoHide = createMediaViewerChromeAutoHide({
    enabled: useAutoHide,
    isControlled: () => isHeaderControlled() && !useSessionAutoHide(),
    setHeaderVisible,
    canAutoHide: () =>
      (appFocus?.canAutoHide() ?? true) && !isMediaViewerChromeAutoHideSuspended(),
  });

  revealChromeSession = () => {
    chromeAutoHide.revealSession();
    activeChromeInput()?.resetDismissGestureState();
  };

  let appFocus: ReturnType<typeof subscribeMediaViewerAppFocus> | null = null;
  appFocus = useAutoHide()
    ? subscribeMediaViewerAppFocus({
      onForeground: tryShowChromeOnForeground,
      onBackground: () => chromeAutoHide.clearHideTimer(),
    })
    : null;

  onMount(() => {
    local.onChromeAutoHideReady?.(chromeAutoHide);
    if (!useAutoHide()) return;
    const entryVisible = local.entryVisible;
    if (entryVisible !== undefined && !entryVisible()) return;
    revealChromeSession();
    syncChromeAutoHideRegistry();
    syncChromeBackRegistry();
  });

  createEffect(() => {
    if (!useAutoHide()) return;
    const entryVisible = local.entryVisible?.();
    if (entryVisible === undefined) return;
    if (entryVisible) {
      if (!isMediaViewerChromeAutoHideSuspended()) {
        revealChromeSession();
      }
      syncChromeAutoHideRegistry();
    } else {
      chromeAutoHide.clearHideTimer();
      registerMediaViewerChromeAutoHideSession(null, registryToken);
    }
  });

  createEffect(() => {
    syncChromeBackRegistry();
  });

  onCleanup(() => {
    clearReadAloudBackgroundExitFlag();
    registerMediaViewerChromeAutoHideSession(null, registryToken);
    registerMediaViewerChromeBackSession(null, chromeBackToken);
    appFocus?.dispose();
    internalChromeInput?.dispose();
    chromeAutoHide.dispose();
  });

  const shellValue = (): MediaViewerShellContextValue => {
    const input = activeChromeInput();
    return {
      headerVisible,
      footerVisible,
      chromeBarsCollapsible,
      setHeaderVisible,
      toggleBars: () => {
        if (!chromeBarsCollapsible()) return;
        setHeaderVisible(!headerVisible());
      },
      tapToToggleBars: tapToToggleBars(),
      contentPrimaryAction: local.contentPrimaryAction,
      onContentPrimaryClick: input?.onContentPrimaryClick,
      onContentDblClick: input?.onContentDblClick,
      onChromeBarPointerEnter: useAutoHide() ? onChromeBarPointerEnter : undefined,
      onChromeBarPointerLeave: useAutoHide() ? onChromeBarPointerLeave : undefined,
    };
  };

  return (
    <MediaViewerShellContextProvider value={shellValue()}>
      <div
        ref={(el) => activeChromeInput()?.bindShellElement(el)}
        class={cn(
          'fixed inset-0 flex flex-col overflow-hidden bg-background text-foreground',
          !isMobile() && mediaViewerChromeDesktopMinWidthClass,
          local.class,
        )}
        style={local.style}
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
export { MediaViewerChromeSlots } from '@/components/viewer/MediaViewerChromeSlots';
export { MediaViewerHeader } from '@/components/viewer/MediaViewerHeader';
export { MediaViewerFooter } from '@/components/viewer/MediaViewerFooter';
export { MediaViewerOverlayBottomChrome } from '@/components/viewer/MediaViewerOverlayBottomChrome';
export { MediaViewerBottomChromeContent } from '@/components/viewer/MediaViewerBottomChromeContent';
