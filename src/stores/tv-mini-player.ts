/**
 * 影视全局迷你播放窗状态（主壳浮层，非 GlobalMediaPlayer 条）
 */

import { createStore } from 'solid-js/store';
import {
  destroyTvPlayerSession,
  hasTvPlayerSession,
  setTvPlayerMiniChrome,
} from '@/lib/media/tv/play/tv-player-runtime';
import { isTvMiniPlayerEnabled } from '@/stores/tv-hub/tv-play-ui';
import { openTvPlay } from '@/stores/tv-hub/section';

export type TvMiniPlayerState = {
  /** 是否显示主壳迷你浮层 */
  active: boolean;
};

const [state, setState] = createStore<TvMiniPlayerState>({
  active: false,
});

export const tvMiniPlayerState = state;

let globalOpenTvShell: (() => void) | null = null;

/**
 * 用户点小窗「关闭」后为 true，禁止切页/重建时再次 enterMini。
 * 回到全屏播放页或主动开播时清除。
 */
let userDismissed = false;

/** App 注册：切到影视壳页 */
export function registerTvMiniOpenShell(fn: (() => void) | null): void {
  globalOpenTvShell = fn;
}

export const tvMiniPlayerStore = {
  get state() {
    return state;
  },

  isActive(): boolean {
    return state.active;
  },

  /** 用户已手动关闭小窗（尚未重新进入全屏播放） */
  isDismissed(): boolean {
    return userDismissed;
  },

  /** 允许再次自动进小窗（进入全屏播放 / 新开播） */
  clearDismissed(): void {
    userDismissed = false;
  },

  /**
   * 离开全屏播放页且有存活会话时进入迷你窗。
   * 无会话 / 设置关闭 / 用户已关掉小窗时不进入。
   */
  enterMini(): void {
    if (userDismissed) return;
    if (!isTvMiniPlayerEnabled()) return;
    if (!hasTvPlayerSession() && !state.active) return;
    setTvPlayerMiniChrome(true);
    setState('active', true);
  },

  /** 回到全屏播放页前关闭迷你态（舞台由 PlayPane attach） */
  exitMiniToFull(): void {
    // 仅从迷你态回到全屏时清除「已关闭」；空调用勿清，否则关窗后切页会再次误挂
    if (state.active) {
      userDismissed = false;
    }
    if (!state.active) {
      setTvPlayerMiniChrome(false);
      return;
    }
    setState('active', false);
    setTvPlayerMiniChrome(false);
  },

  /** 关闭迷你窗并销毁播放会话；之后切页不再自动挂上 */
  closeMini(): void {
    userDismissed = true;
    setState('active', false);
    setTvPlayerMiniChrome(false);
    destroyTvPlayerSession();
  },

  /** 从迷你窗返回播放页 */
  backToPlayPage(): void {
    userDismissed = false;
    setState('active', false);
    setTvPlayerMiniChrome(false);
    globalOpenTvShell?.();
    openTvPlay();
  },
};
