/**
 * 视频全屏（对齐 Legado VideoPlayerActivity.toggleFullScreen）
 */

import { createSignal, onCleanup, type Accessor } from 'solid-js';

export interface UseVideoFullscreenResult {
  isFullscreen: Accessor<boolean>;
  toggleFullscreen: () => Promise<void>;
  enterFullscreen: () => Promise<void>;
  exitFullscreen: () => Promise<void>;
}

export function useVideoFullscreen(
  container: Accessor<HTMLElement | undefined>,
): UseVideoFullscreenResult {
  const [isFullscreen, setIsFullscreen] = createSignal(false);

  const sync = () => {
    const el = container();
    if (!el) {
      setIsFullscreen(false);
      return;
    }
    setIsFullscreen(document.fullscreenElement === el);
  };

  document.addEventListener('fullscreenchange', sync);
  onCleanup(() => document.removeEventListener('fullscreenchange', sync));

  const enterFullscreen = async () => {
    const el = container();
    if (!el) return;
    if (document.fullscreenElement === el) return;
    try {
      await el.requestFullscreen();
    } catch (e) {
      console.warn('[video] 进入全屏失败', e);
    }
    sync();
  };

  const exitFullscreen = async () => {
    if (!document.fullscreenElement) return;
    try {
      await document.exitFullscreen();
    } catch (e) {
      console.warn('[video] 退出全屏失败', e);
    }
    sync();
  };

  const toggleFullscreen = async () => {
    if (isFullscreen()) await exitFullscreen();
    else await enterFullscreen();
  };

  return {
    isFullscreen,
    toggleFullscreen,
    enterFullscreen,
    exitFullscreen,
  };
}
