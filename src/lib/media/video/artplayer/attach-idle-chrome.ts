/**
 * Artplayer 顶底栏：进入显示；移出隐藏；播放中空闲后隐藏。
 *
 * - 悬停在顶底栏 / 设置弹层 / 聚合弹层 / 工具钮上时：钉住可见，不启动隐藏计时。
 * - 库 CSS 在 `.art-hover` 时也会把 `.art-bottom` 设为可见，
 *   需配合 video-viewer.css 仅认 `.art-control-show`。
 */

import type Artplayer from 'artplayer';

const DEFAULT_HIDE_MS = 3000;

/** 指针落在这些区域内时保持顶底栏，不定时收起 */
const CHROME_PIN_SELECTOR = [
  '.art-bottom',
  '.art-settings',
  '.reader-tv-play-overlay',
  '.reader-tv-play-player-panel',
  '.reader-tv-play-player-panel-mask',
  '.apd-config-panel',
  '.apd-style-panel',
  '.apd-emitter',
  '.reader-art-ctx-panel',
  '.art-contextmenus',
  '.art-info',
  '.reader-art-bar-popup',
].join(', ');

export type ArtplayerIdleChromeHandle = {
  detach: () => void;
  /** 外部弹层（如聚合线路面板）打开时钉住 */
  pin: () => void;
  unpin: () => void;
  /** 重新显示并按规则武装计时 */
  bump: () => void;
};

let activeHandle: ArtplayerIdleChromeHandle | null = null;

export function getArtplayerIdleChrome(): ArtplayerIdleChromeHandle | null {
  return activeHandle;
}

function isChromeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(CHROME_PIN_SELECTOR));
}

export function attachArtplayerIdleChrome(
  art: Artplayer,
  hideDelayMs: number = DEFAULT_HIDE_MS,
): ArtplayerIdleChromeHandle {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inside = false;
  let pinCount = 0;

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

  const isPlaying = () => {
    try {
      return !!art.playing;
    } catch {
      return false;
    }
  };

  const shouldKeepVisible = () => {
    if (pinCount > 0) return true;
    try {
      if (art.setting?.show) return true;
    } catch {
      /* */
    }
    try {
      const root =
        (art.template as { $player?: HTMLElement } | undefined)?.$player?.closest(
          '.reader-artplayer-play-slot, .reader-artplayer-stage',
        ) ?? document;
      if (root.querySelector?.('.reader-tv-play-player-panel')) return true;
      if (root.querySelector?.('.reader-tv-play-overlay-menu:not([hidden])')) {
        return true;
      }
    } catch {
      /* */
    }
    return false;
  };

  const hide = () => {
    if (shouldKeepVisible()) return;
    setControls(false);
  };

  const showAndArm = () => {
    setControls(true);
    clearTimer();
    if (!isPlaying()) return;
    // 悬停在 chrome / 弹层上：只保持显示，不启动隐藏计时
    if (shouldKeepVisible()) return;
    timer = setTimeout(() => hide(), hideDelayMs);
  };

  const pin = () => {
    pinCount += 1;
    setControls(true);
    clearTimer();
  };

  const unpin = () => {
    pinCount = Math.max(0, pinCount - 1);
    if (pinCount > 0 || shouldKeepVisible()) {
      setControls(true);
      clearTimer();
      return;
    }
    if (inside) {
      showAndArm();
      return;
    }
    clearTimer();
    hide();
  };

  const onHover = (state: boolean) => {
    inside = state;
    if (state) {
      showAndArm();
      return;
    }
    // 指针离开播放器：若仍在外部弹层上则保持
    if (shouldKeepVisible()) {
      clearTimer();
      setControls(true);
      return;
    }
    clearTimer();
    hide();
  };

  const onMousemove = (event?: Event) => {
    inside = true;
    if (event && isChromeTarget(event.target)) {
      setControls(true);
      clearTimer();
      return;
    }
    if (shouldKeepVisible()) {
      setControls(true);
      clearTimer();
      return;
    }
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

  const handle: ArtplayerIdleChromeHandle = {
    detach: () => {
      clearTimer();
      art.off('hover', onHover);
      art.off('mousemove', onMousemove);
      art.off('video:play', onPlay);
      art.off('video:pause', onPause);
      art.off('play', onPlay);
      art.off('pause', onPause);
      if (activeHandle === handle) activeHandle = null;
    },
    pin,
    unpin,
    bump: showAndArm,
  };

  activeHandle = handle;
  return handle;
}
