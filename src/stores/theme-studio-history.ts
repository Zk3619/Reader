/**
 * Theme Studio 撤销 / 重做栈（最多 50 步）
 */

import { cloneThemePack, type ReaderThemePackV1 } from '@/lib/theme/schema/theme-pack-v1';

const MAX_HISTORY = 50;

export interface ThemeStudioHistoryState {
  past: ReaderThemePackV1[];
  future: ReaderThemePackV1[];
}

function serialize(pack: ReaderThemePackV1): string {
  return JSON.stringify(pack);
}

function packsEqual(a: ReaderThemePackV1, b: ReaderThemePackV1): boolean {
  return serialize(a) === serialize(b);
}

const history: ThemeStudioHistoryState = {
  past: [],
  future: [],
};

export const themeStudioHistory = {
  get state(): Readonly<ThemeStudioHistoryState> {
    return history;
  },

  get canUndo(): boolean {
    return history.past.length > 0;
  },

  get canRedo(): boolean {
    return history.future.length > 0;
  },

  clear(): void {
    history.past = [];
    history.future = [];
  },

  /** 记录变更前快照；连续相同快照自动去重 */
  pushBeforeChange(previousPack: ReaderThemePackV1): void {
    const last = history.past[history.past.length - 1];
    if (last && packsEqual(last, previousPack)) return;

    history.past.push(cloneThemePack(previousPack));
    if (history.past.length > MAX_HISTORY) {
      history.past.shift();
    }
    history.future = [];
  },

  undo(currentPack: ReaderThemePackV1): ReaderThemePackV1 | null {
    if (!themeStudioHistory.canUndo) return null;

    const previous = history.past.pop()!;
    history.future.push(cloneThemePack(currentPack));
    return cloneThemePack(previous);
  },

  redo(currentPack: ReaderThemePackV1): ReaderThemePackV1 | null {
    if (!themeStudioHistory.canRedo) return null;

    const next = history.future.pop()!;
    history.past.push(cloneThemePack(currentPack));
    return cloneThemePack(next);
  },

  /** 替换栈顶（用于 undo/redo 后同步） */
  replaceCurrent(pack: ReaderThemePackV1): void {
    const last = history.past[history.past.length - 1];
    if (last && packsEqual(last, pack)) return;
    if (history.past.length > 0) {
      history.past[history.past.length - 1] = cloneThemePack(pack);
    }
  },
};

export type ThemeStudioHistory = typeof themeStudioHistory;
