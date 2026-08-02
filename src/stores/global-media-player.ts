/**
 * 全局壳层媒体播放器状态（朗读 / 音频 / 视频共用）
 */

import { createStore } from 'solid-js/store';
import { settingsState } from '@/stores/settings';

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
  /**
   * 展开动画世代：展开时递增，驱动 UI 重挂载以重放入场动画
   */
  expandAnimEpoch: number;
  /**
   * 收起动画世代：收起时递增，驱动侧边条重挂载以重放入场动画
   */
  collapseAnimEpoch: number;
};

const [state, setState] = createStore<GlobalMediaPlayerState>({
  kind: null,
  shellActive: false,
  collapsed: false,
  meta: null,
  bookUrl: null,
  chromeHeightPx: 0,
  expandAnimEpoch: 0,
  collapseAnimEpoch: 0,
});

export const globalMediaPlayerState = state;

/**
 * 用户点全局窗「关闭」后为 true，禁止有曲目时自动再挂壳。
 * 下次显式 activate（起播/切歌补挂等）时清除。
 */
let shellUserDismissed = false;

let autoCollapseTimer: ReturnType<typeof setTimeout> | null = null;

function clearAutoCollapseTimer(): void {
  if (autoCollapseTimer != null) {
    clearTimeout(autoCollapseTimer);
    autoCollapseTimer = null;
  }
}

function autoExpandEnabled(): boolean {
  return settingsState.app.mediaPlayerAutoExpandOnTrackChange !== false;
}

function autoCollapseDelayMs(): number {
  const sec = settingsState.app.mediaPlayerAutoCollapseAfterExpandSec ?? 0;
  if (!Number.isFinite(sec) || sec <= 0) return 0;
  return Math.round(sec * 1000);
}

function bumpExpandAnim(): void {
  setState('expandAnimEpoch', (n) => n + 1);
}

function bumpCollapseAnim(): void {
  setState('collapseAnimEpoch', (n) => n + 1);
}

function setCollapsedWithAnim(collapsed: boolean): void {
  if (state.collapsed === collapsed) return;
  setState('collapsed', collapsed);
  if (collapsed) bumpCollapseAnim();
  else bumpExpandAnim();
}

/** 因切章/切歌自动展开后，按设置安排自动收起 */
function scheduleAutoCollapseAfterExpand(): void {
  clearAutoCollapseTimer();
  const delay = autoCollapseDelayMs();
  if (delay <= 0) return;
  autoCollapseTimer = setTimeout(() => {
    autoCollapseTimer = null;
    if (!state.shellActive || !state.kind) return;
    setCollapsedWithAnim(true);
  }, delay);
}

/**
 * 切章/切歌等内容变更：按设置决定是否从收起态自动展开并定时收起。
 * 仅更新 meta 时不会触发（请继续用 updateMeta）。
 */
function handleContentChangeExpand(): void {
  if (!autoExpandEnabled()) return;
  const wasCollapsed = state.collapsed;
  if (wasCollapsed) {
    setCollapsedWithAnim(false);
    scheduleAutoCollapseAfterExpand();
  }
}

export const globalMediaPlayerStore = {
  get state() {
    return state;
  },

  /** 用户已手动关掉全局窗（尚未再次 activate） */
  isShellDismissed(): boolean {
    return shellUserDismissed;
  },

  isReadAloudShellActive(): boolean {
    return state.shellActive && state.kind === 'read-aloud';
  },

  activateReadAloud(meta: GlobalMediaPlayerMeta, bookUrl: string): void {
    shellUserDismissed = false;
    clearAutoCollapseTimer();
    const contentChange = state.shellActive && state.kind === 'read-aloud';
    if (contentChange) {
      setState({ meta, bookUrl, shellActive: true, kind: 'read-aloud' });
      handleContentChangeExpand();
      return;
    }
    setState({
      kind: 'read-aloud',
      shellActive: true,
      collapsed: false,
      meta,
      bookUrl,
    });
    bumpExpandAnim();
  },

  activate(kind: GlobalMediaPlayerKind, meta: GlobalMediaPlayerMeta, bookUrl: string | null): void {
    shellUserDismissed = false;
    clearAutoCollapseTimer();
    const contentChange = state.shellActive && state.kind === kind;
    if (contentChange) {
      setState({ meta, bookUrl, shellActive: true, kind });
      handleContentChangeExpand();
      return;
    }
    setState({
      kind,
      shellActive: true,
      collapsed: false,
      meta,
      bookUrl,
    });
    bumpExpandAnim();
  },

  /**
   * 切章/切歌等：更新展示信息，并按设置自动展开 / 定时收起。
   * 用于已在 shell 中播放、但未再次走 activate 的路径（如有声书切章）。
   */
  notifyTrackOrChapterChange(metaPatch?: Partial<GlobalMediaPlayerMeta>): void {
    if (!state.shellActive || !state.kind) return;
    clearAutoCollapseTimer();
    if (metaPatch && state.meta) {
      setState('meta', (prev) => ({ ...prev!, ...metaPatch }));
    }
    handleContentChangeExpand();
  },

  updateMeta(patch: Partial<GlobalMediaPlayerMeta>): void {
    if (!state.meta) return;
    setState('meta', (prev) => ({ ...prev!, ...patch }));
  },

  setCollapsed(collapsed: boolean): void {
    clearAutoCollapseTimer();
    setCollapsedWithAnim(collapsed);
  },

  toggleCollapsed(): void {
    clearAutoCollapseTimer();
    setCollapsedWithAnim(!state.collapsed);
  },

  deactivate(): void {
    clearAutoCollapseTimer();
    setState({
      kind: null,
      shellActive: false,
      collapsed: false,
      meta: null,
      bookUrl: null,
      chromeHeightPx: 0,
    });
  },

  /**
   * 用户关闭全局窗：收起壳层并记住 dismissed，避免有曲目时被自动补挂。
   * 不清除 kind/meta（会话仍在）；起播/activate 时会清 dismissed。
   */
  dismissShell(): void {
    clearAutoCollapseTimer();
    shellUserDismissed = true;
    setState({
      shellActive: false,
      collapsed: false,
      chromeHeightPx: 0,
    });
  },

  setChromeHeight(px: number): void {
    const next = Math.max(0, Math.round(px));
    if (state.chromeHeightPx === next) return;
    setState('chromeHeightPx', next);
  },

  clearShell(): void {
    clearAutoCollapseTimer();
    setState('shellActive', false);
  },
};
