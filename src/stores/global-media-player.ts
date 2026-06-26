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
  preview?: string;
};

export type GlobalMediaPlayerState = {
  kind: GlobalMediaPlayerKind | null;
  /** 后台模式：在主壳层显示播放器（退出阅读器后） */
  shellActive: boolean;
  collapsed: boolean;
  meta: GlobalMediaPlayerMeta | null;
  bookUrl: string | null;
};

const [state, setState] = createStore<GlobalMediaPlayerState>({
  kind: null,
  shellActive: false,
  collapsed: false,
  meta: null,
  bookUrl: null,
});

export const globalMediaPlayerState = state;

export const globalMediaPlayerStore = {
  get state() {
    return state;
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
    });
  },

  clearShell(): void {
    setState('shellActive', false);
  },
};
