/**
 * Text Viewer UI 配置类型与默认值（对齐 Legado ReadBookConfig）
 * 与书籍级 types/book.ReadConfig（reverseToc 等）不同，勿混用。
 */

import { DEFAULT_CLICK_ACTIONS } from '@/lib/media/text/reader-click-actions';
import { DEFAULT_CLICK_REGION } from '@/lib/media/text/reader-click-region';
import type { ReadAloudEngine } from '@/lib/media/text/read-aloud';
import type { ReaderClickActions } from '@/lib/media/text/reader-click-actions';
import type { ReaderClickRegion } from '@/lib/media/text/reader-click-region';

/** 与 Legado PageAnim 对齐：滚动 / 覆盖 / 关联覆盖 / 滑动 / 仿真 / 无动画 */
export type TextViewerPageAnim =
  | 'scroll'
  | 'cover'
  | 'linkedCover'
  | 'slide'
  | 'simulation'
  | 'none';
export type TextViewerDualPageMode = 'off' | 'auto' | 'always';
export type TextViewerImageStyle = 'DEFAULT' | 'FULL' | 'TEXT' | 'SINGLE';

/** Tailwind `xl` 断点（1280px）：双页「自动」模式的最小视口宽度 */
export const TEXT_VIEWER_DUAL_PAGE_XL_MIN_WIDTH_PX = 1280;

export const TEXT_VIEWER_DUAL_PAGE_MODE_LABELS: Record<TextViewerDualPageMode, string> = {
  off: '关闭',
  auto: '自动',
  always: '始终',
};

/** 是否启用双页分栏（宽屏 + 模式） */
export function textViewerDualPageActive(
  mode: TextViewerDualPageMode,
  isWideScreen: boolean,
  viewportWidth: number = typeof window !== 'undefined' ? window.innerWidth : 0,
): boolean {
  if (mode === 'off') return false;
  if (mode === 'always') return isWideScreen;
  return isWideScreen && viewportWidth >= TEXT_VIEWER_DUAL_PAGE_XL_MIN_WIDTH_PX;
}

export interface TextViewerUiConfig {
  theme: number;
  font: number;
  fontSize: number;
  readWidth: number;
  infiniteLoading: boolean;
  customFontName: string;
  jumpDuration: number;
  spacing: {
    paragraph: number;
    line: number;
    letter: number;
  };
  contentInset: {
    left: number;
    right: number;
    center: number;
  };
  statusBarDisplayStyle: 'follow' | 'always' | 'never';
  pageAnim: TextViewerPageAnim;
  dualPage: TextViewerDualPageMode;
  volumeKeyTurnPage: boolean;
  clickActions: ReaderClickActions;
  clickRegion: ReaderClickRegion;
  aloudEngine: ReadAloudEngine;
  httpTtsId: number | null;
  speakSpeed: number;
  imageStyle: TextViewerImageStyle;
}

export const defaultTextViewerUiConfig: TextViewerUiConfig = {
  theme: 0,
  font: 0,
  fontSize: 18,
  readWidth: 800,
  infiniteLoading: false,
  customFontName: '',
  jumpDuration: 1000,
  spacing: { paragraph: 1, line: 0.8, letter: 0 },
  contentInset: { left: 16, right: 16, center: 32 },
  statusBarDisplayStyle: 'follow',
  pageAnim: 'scroll',
  dualPage: 'auto',
  volumeKeyTurnPage: true,
  clickActions: { ...DEFAULT_CLICK_ACTIONS },
  clickRegion: {
    xSplits: [...DEFAULT_CLICK_REGION.xSplits] as [number, number],
    ySplits: [...DEFAULT_CLICK_REGION.ySplits] as [number, number],
  },
  aloudEngine: 'system',
  httpTtsId: null,
  speakSpeed: 5,
  imageStyle: 'DEFAULT',
};
