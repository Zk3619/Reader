/**
 * Artplayer 顶底栏：进入显示；移出立即隐藏；播放中空闲后隐藏
 *
 * 注意：库 CSS 在 `.art-hover` 时也会把 `.art-bottom` 设为可见，
 * 需配合 video-viewer.css 仅认 `.art-control-show`，否则鼠标停在画面上永远不收栏。
 */

import type Artplayer from 'artplayer';

const DEFAULT_HIDE_MS = 3000;

export function attachArtplayerIdleChrome(
  art: Artplayer,
  hideDelayMs: number = DEFAULT_HIDE_MS,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inside = false;

  const clearTimer = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const setControls = (show: boolean) => {
    try {
      art.controls.show = show;
    } catch {
      /* */
    }
  };

  const hide = () => {
    try {
      if (art.setting?.show) return;
    } catch {
      /* */
    }
    setControls(false);
  };

  const showAndArm = () => {
    setControls(true);
    clearTimer();
    // 暂停时保持控件，便于点播放；播放中空闲后收起
    let playing = false;
    try {
      playing = !!art.playing;
    } catch {
      /* */
    }
    if (!playing) return;
    timer = setTimeout(() => hide(), hideDelayMs);
  };

  const onHover = (state: boolean) => {
    inside = state;
    if (state) {
      showAndArm();
      return;
    }
    clearTimer();
    hide();
  };

  const onMousemove = () => {
    if (!inside) inside = true;
    showAndArm();
  };

  const onPlay = () => showAndArm();
  const onPause = () => {
    clearTimer();
    setControls(true);
  };

  art.on('hover', onHover);
  art.on('mousemove', onMousemove);
  art.on('video:play', onPlay);
  art.on('video:pause', onPause);
  art.on('play', onPlay);
  art.on('pause', onPause);

  showAndArm();

  return () => {
    clearTimer();
    art.off('hover', onHover);
    art.off('mousemove', onMousemove);
    art.off('video:play', onPlay);
    art.off('video:pause', onPause);
    art.off('play', onPlay);
    art.off('pause', onPause);
  };
}
