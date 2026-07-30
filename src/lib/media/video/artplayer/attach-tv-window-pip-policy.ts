import type Artplayer from 'artplayer';
import {
  isTvPauseOnTrayHide,
  isTvRestoreWindowOnPipLeave,
} from '@/stores/tv-hub/tv-play-ui';
import {
  bringMainWindowToFrontIfHiddenOrMinimized,
  subscribeMainWindowTrayVisibility,
} from '@/utils/window-state';

function isArtplayerInPictureInPicture(art: Artplayer): boolean {
  try {
    return art.pip || document.pictureInPictureElement === art.video;
  } catch {
    return false;
  }
}

/**
 * 影视播放器窗口策略（受设置开关控制）：
 * - 隐藏到托盘时暂停，系统任务栏最小化不处理；
 * - 画中画期间隐藏到托盘仍继续播放；
 * - 从画中画返回标签页时，恢复被最小化或隐藏的主窗口。
 */
export function attachTvWindowPipPolicy(art: Artplayer): () => void {
  let autoPausedForTray = false;

  const unsubscribeTrayVisibility = subscribeMainWindowTrayVisibility((visibility) => {
    if (visibility === 'hidden') {
      if (!isTvPauseOnTrayHide()) return;
      if (isArtplayerInPictureInPicture(art) || !art.playing) return;
      autoPausedForTray = true;
      try {
        art.pause();
      } catch (error) {
        autoPausedForTray = false;
        console.warn('[tv-play] 托盘隐藏暂停失败', error);
      }
      return;
    }

    if (!autoPausedForTray) return;
    autoPausedForTray = false;
    if (!isTvPauseOnTrayHide()) return;
    try {
      void art.play();
    } catch (error) {
      console.warn('[tv-play] 托盘恢复续播失败', error);
    }
  });

  art.on('pip', (active) => {
    if (!active && isTvRestoreWindowOnPipLeave()) {
      void bringMainWindowToFrontIfHiddenOrMinimized();
    }
  });

  return unsubscribeTrayVisibility;
}
