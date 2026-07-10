/**
 * 全局壳层媒体播放器状态（朗读 / 音频 / 视频共用）
 */

import { createStore } from 'solid-js/store';

export type GlobalMediaPlayerKind = 'read-aloud' | 'audio' | 'video';

export type GlobalMediaPlayerMeta = {
  title: string;
  subtitle?: string;
  /** 用于 BookCoverFromBook */
  coverBookUrl?: string;
  /** music 模式封面 URL */
  coverUrl?: string;
  preview?: string;
};

export type GlobalMediaPlayerState = {
  kind: GlobalMediaPlayerKind | null;
  /** 后台模式：在主壳层显示播放器（退出阅读器后） */
  shellActive: boolean;
  collapsed: boolean;
  meta: GlobalMediaPlayerMeta | null;
  bookUrl: string | null;
  /** 固定布局时实测 chrome 高度（px） */
  chromeHeightPx: number;
};

const [state, setState] = createStore<GlobalMediaPlayerState>({
  kind: null,
  shellActive: false,
  collapsed: false,
  meta: null,
  bookUrl: null,
  chromeHeightPx: 0,
});

export const globalMediaPlayerState = state;

export const globalMediaPlayerStore = {
  get state() {
    return state;
  },

  isReadAloudShellActive(): boolean {
    return state.shellActive && state.kind === 'read-aloud';
  },

  activateReadAloud(meta: GlobalMediaPlayerMeta, bookUrl: string): void {
    setState({
      kind: 'read-aloud',
      shellActive: true,
      collapsed: false,
      meta,
      bookUrl,
    });
  },

  activate(kind: GlobalMediaPlayerKind, meta: GlobalMediaPlayerMeta, bookUrl: string | null): void {
    setState({
      kind,
      shellActive: true,
      collapsed: false,
      meta,
      bookUrl,
    });
  },

  updateMeta(patch: Partial<GlobalMediaPlayerMeta>): void {
    if (!state.meta) return;
    setState('meta', (prev) => ({ ...prev!, ...patch }));
  },

  setCollapsed(collapsed: boolean): void {
    setState('collapsed', collapsed);
  },

  toggleCollapsed(): void {
    setState('collapsed', (v) => !v);
  },

  deactivate(): void {
    setState({
      kind: null,
      shellActive: false,
      collapsed: false,
      meta: null,
      bookUrl: null,
      chromeHeightPx: 0,
    });
  },

  setChromeHeight(px: number): void {
    const next = Math.max(0, Math.round(px));
    if (state.chromeHeightPx === next) return;
    setState('chromeHeightPx', next);
  },

  clearShell(): void {
    setState('shellActive', false);
  },
};
