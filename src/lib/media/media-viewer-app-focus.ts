import { isMobile, isTauri } from '@/lib/platform/detect';
import { isMediaViewerDesktopPointerChrome } from '@/lib/media/media-viewer-chrome-input';

function readDocumentFocused(): boolean {
  if (typeof document === 'undefined') return true;
  return !document.hidden && document.hasFocus();
}

/** 桌面端：应用窗口在前台时才允许顶底栏自动隐藏 */
export function canMediaViewerChromeAutoHide(): boolean {
  if (!isMediaViewerDesktopPointerChrome()) return true;
  return readDocumentFocused();
}

export type MediaViewerAppFocusSubscription = {
  canAutoHide: () => boolean;
  dispose: () => void;
};

/**
 * 订阅应用前台/后台（桌面 Web / Tauri）。
 * - 失焦：清除自动隐藏计时，且不再调度新的隐藏
 * - 回前台：可选回调（由 viewer 在 entryVisible 时显示顶底栏）
 */
export function subscribeMediaViewerAppFocus(handlers?: {
  onForeground?: () => void;
  onBackground?: () => void;
}): MediaViewerAppFocusSubscription {
  let focused = readDocumentFocused();

  const applyFocused = (next: boolean) => {
    if (focused === next) return;
    focused = next;
    if (next) handlers?.onForeground?.();
    else handlers?.onBackground?.();
  };

  const onWindowFocus = () => applyFocused(true);
  const onWindowBlur = () => applyFocused(false);
  const onVisibilityChange = () => applyFocused(readDocumentFocused());

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('blur', onWindowBlur);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  let disposeTauri: (() => void) | undefined;
  if (isTauri() && !isMobile()) {
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().onFocusChanged(({ payload }) => {
        applyFocused(payload);
      }))
      .then((unlisten) => {
        disposeTauri = unlisten;
      })
      .catch(() => {
        /* WebView 无 Tauri 窗口 API 时沿用 focus/blur */
      });
  }

  return {
    canAutoHide: canMediaViewerChromeAutoHide,
    dispose: () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onWindowFocus);
        window.removeEventListener('blur', onWindowBlur);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      disposeTauri?.();
      disposeTauri = undefined;
    },
  };
}
