/**
 * Text Viewer UI 配置类型与默认值（对齐 Legado ReadBookConfig）
 * 与书籍级 types/book.ReadConfig（reverseToc 等）不同，勿混用。
 */

import type { ViewerChromeLayout } from '@/components/viewer/viewer-chrome';
import { defaultViewerChromeLayout } from '@/components/viewer/viewer-chrome';
import { DEFAULT_CLICK_ACTIONS } from '@/lib/media/text/reader-click-actions';
import { DEFAULT_CLICK_REGION } from '@/lib/media/text/reader-click-region';
import type { ReadAloudEngine } from '@/lib/media/text/read-aloud';
import type { ReaderClickActions } from '@/lib/media/text/reader-click-actions';
import type { ReaderClickRegion } from '@/lib/media/text/reader-click-region';

/** 与 Legado PageAnim 对齐：滚动 / 覆盖 / 滑动 / 仿真 / 无动画 */
export type TextViewerPageAnim =
  | 'scroll'
  | 'cover'
  | 'slide'
  | 'simulation'
  | 'none';
export type TextViewerDualPageMode = 'off' | 'auto' | 'always';
export type TextViewerImageStyle = 'DEFAULT' | 'FULL' | 'TEXT' | 'SINGLE';

/** Tailwind `xl` 断点（1280px）：双页「自动」模式的最小视口宽度 */
export const TEXT_VIEWER_DUAL_PAGE_XL_MIN_WIDTH_PX = 1280;

/**
 * 按页阅读：content-slot 四边 inset 默认值（与 {@link defaultTextViewerUiConfig} 一致）
 * @deprecated 请使用 config.contentInset
 */
export const TEXT_VIEWER_PAGED_CONTENT_INSET_TOP_PX = 32;
/** @deprecated 请使用 config.contentInset */
export const TEXT_VIEWER_PAGED_CONTENT_INSET_BOTTOM_PX = 32;

/** @deprecated 请使用 {@link TEXT_VIEWER_PAGED_CONTENT_INSET_TOP_PX} */
export const TEXT_VIEWER_PAGED_PAD_TOP_PX = TEXT_VIEWER_PAGED_CONTENT_INSET_TOP_PX;
/** @deprecated 请使用 {@link TEXT_VIEWER_PAGED_CONTENT_INSET_BOTTOM_PX} */
export const TEXT_VIEWER_PAGED_PAD_BOTTOM_PX = TEXT_VIEWER_PAGED_CONTENT_INSET_BOTTOM_PX;

/** @deprecated 请使用 {@link textViewerPagedContentInsets} */
export const TEXT_VIEWER_PAGED_VERTICAL_PAD_PX = 16;

export type TextViewerPagedContentInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

/** 按页 content-slot inset；未传 config 时用默认值 */
export function textViewerPagedContentInsets(
  config?: Pick<TextViewerUiConfig, 'contentInset'>,
): TextViewerPagedContentInsets {
  const inset = { ...defaultTextViewerUiConfig.contentInset, ...config?.contentInset };
  return {
    top: inset.top,
    bottom: inset.bottom,
    left: inset.left,
    right: inset.right,
  };
}

/** 排版内容区宽度（readWidth 上限）；按页且 inset 已在 slot 上时不重复扣左右 */
export function textViewerLayoutContentWidth(
  viewportWidth: number,
  config: Pick<TextViewerUiConfig, 'contentInset' | 'readWidth'>,
  options?: { horizontalInsetOnSlot?: boolean },
): number {
  const inset = config.contentInset;
  const inner = options?.horizontalInsetOnSlot
    ? viewportWidth
    : Math.max(1, viewportWidth - inset.left - inset.right);
  if (config.readWidth > 0) {
    return Math.max(1, Math.min(inner, config.readWidth));
  }
  return Math.max(1, inner);
}

/** @deprecated 请使用 {@link textViewerPagedContentInsets} */
export function textViewerPagedVerticalPads(
  config?: Pick<TextViewerUiConfig, 'contentInset'>,
): { top: number; bottom: number } {
  const pads = textViewerPagedContentInsets(config);
  return { top: pads.top, bottom: pads.bottom };
}

export const TEXT_VIEWER_DUAL_PAGE_MODE_LABELS: Record<TextViewerDualPageMode, string> = {
  off: '关闭',
  auto: '自动',
  always: '始终',
};

/** 滚动模式：以窗口宽度判断双页（ReaderContent columns-2） */
export function textViewerDualPageActive(
  mode: TextViewerDualPageMode,
  isWideScreen: boolean,
  viewportWidth: number = typeof window !== 'undefined' ? window.innerWidth : 0,
): boolean {
  if (mode === 'off') return false;
  if (mode === 'always') return isWideScreen;
  return isWideScreen && viewportWidth >= TEXT_VIEWER_DUAL_PAGE_XL_MIN_WIDTH_PX;
}

/** 按页模式：以阅读视口宽高判断（对齐 Legado viewWidth/viewHeight 双栏） */
export function textViewerDualPageActiveInViewport(
  mode: TextViewerDualPageMode,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  if (mode === 'off') return false;
  const isWideScreen = viewportWidth >= 480;
  if (!isWideScreen || viewportHeight <= 0) return false;
  if (mode === 'always') return true;
  const landscape = viewportWidth > viewportHeight;
  return (
    viewportWidth >= TEXT_VIEWER_DUAL_PAGE_XL_MIN_WIDTH_PX || landscape
  );
}

/**
 * 双栏 DOM 测量意图：宽屏即按单栏宽测量（不要求视口高度就绪）。
 * 与 {@link textViewerDualPageActiveInViewport} 解耦，避免首帧高度=0 时测量根塌缩为 1px。
 */
export function textViewerDualPageMeasureIntent(
  mode: TextViewerDualPageMode,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  if (mode === 'off') return false;
  if (viewportWidth < 480) return false;
  if (mode === 'always') return true;
  if (viewportHeight <= 0) {
    return viewportWidth >= TEXT_VIEWER_DUAL_PAGE_XL_MIN_WIDTH_PX;
  }
  const landscape = viewportWidth > viewportHeight;
  return viewportWidth >= TEXT_VIEWER_DUAL_PAGE_XL_MIN_WIDTH_PX || landscape;
}

/** 按页拖拽翻页：提交阈值（视口宽度百分比）可调范围 */
export const TEXT_VIEWER_PAGED_DRAG_COMMIT_PERCENT_MIN = 10;
export const TEXT_VIEWER_PAGED_DRAG_COMMIT_PERCENT_MAX = 50;
export const TEXT_VIEWER_PAGED_DRAG_COMMIT_PERCENT_DEFAULT = 25;

/** 仿真翻页：左右拖拽分区边界（视口宽度百分比） */
export type TextViewerSimulationDragZonePercent = 25 | 50 | 75;

export const TEXT_VIEWER_SIMULATION_DRAG_ZONE_OPTIONS: TextViewerSimulationDragZonePercent[] =
  [25, 50, 75];

export const TEXT_VIEWER_SIMULATION_DRAG_ZONE_DEFAULT: TextViewerSimulationDragZonePercent = 50;

export function normalizeSimulationDragZonePercent(
  raw: unknown,
): TextViewerSimulationDragZonePercent {
  if (raw === 25 || raw === 50 || raw === 75) return raw;
  return TEXT_VIEWER_SIMULATION_DRAG_ZONE_DEFAULT;
}

/** 仿真拖拽分区边界 x：起点 ≤ boundary 为 prev 区，> boundary 为 next 区 */
export function simulationDragZoneBoundaryPx(
  viewportWidth: number,
  zonePercent: number,
): number {
  if (viewportWidth <= 0) return 0;
  const p = Math.max(25, Math.min(75, zonePercent));
  return viewportWidth * (p / 100);
}

/** 按页拖拽翻页：|offset| ≥ 视口宽度 × 该比例才提交翻页 */
export function textViewerPagedDragCommitThresholdPx(
  viewportWidth: number,
  config?: Pick<TextViewerUiConfig, 'pagedDragCommitPercent'>,
): number {
  if (viewportWidth <= 0) return 0;
  const raw = config?.pagedDragCommitPercent ?? TEXT_VIEWER_PAGED_DRAG_COMMIT_PERCENT_DEFAULT;
  const percent = Math.max(
    TEXT_VIEWER_PAGED_DRAG_COMMIT_PERCENT_MIN,
    Math.min(TEXT_VIEWER_PAGED_DRAG_COMMIT_PERCENT_MAX, raw),
  );
  return viewportWidth * (percent / 100);
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
    /** 按页 / 滚动：content-slot 顶部间距 */
    top: number;
    /** 按页 / 滚动：content-slot 底部间距 */
    bottom: number;
  };
  statusBarDisplayStyle: 'follow' | 'always' | 'never';
  pageAnim: TextViewerPageAnim;
  /** 按页拖拽翻页提交阈值（视口宽度百分比，10–50） */
  pagedDragCommitPercent: number;
  /** 仿真翻页：左右拖拽分区宽度（视口宽度 25% / 50% / 75%） */
  simulationDragZonePercent: TextViewerSimulationDragZonePercent;
  dualPage: TextViewerDualPageMode;
  /** 两端对齐（Legado textFullJustify） */
  textFullJustify: boolean;
  /** 末行底对齐（Legado textBottomJustify，按页微调行距） */
  textBottomJustify: boolean;
  /** 中文排版优化（Legado useZhLayout，预留） */
  useZhLayout: boolean;
  /** 覆盖/滑动翻页优先 bitmap 快照（Legado PageView screenshot） */
  pagedTurnUseBitmap: boolean;
  volumeKeyTurnPage: boolean;
  clickActions: ReaderClickActions;
  clickRegion: ReaderClickRegion;
  aloudEngine: ReadAloudEngine;
  httpTtsId: number | null;
  speakSpeed: number;
  imageStyle: TextViewerImageStyle;
  /** 顶栏与底栏布局（仅文本阅读器；未配置时沿用应用设置） */
  viewerChromeLayout: ViewerChromeLayout;
  /** 替换净化前保护 <usehtml> 块（Legado adaptSpecialStyle，默认开启） */
  adaptSpecialStyle?: boolean;
  /** 简繁转换：0 关 / 1 繁转简 / 2 简转繁（Legado chineseConverterType） */
  chineseConverterType?: 0 | 1 | 2;
  /** 去除正文开头重复章节标题（Legado removeSameTitle，默认开启） */
  removeDuplicateTitle?: boolean;
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
  contentInset: { left: 16, right: 16, center: 32, top: 32, bottom: 32 },
  statusBarDisplayStyle: 'follow',
  pageAnim: 'scroll',
  pagedDragCommitPercent: TEXT_VIEWER_PAGED_DRAG_COMMIT_PERCENT_DEFAULT,
  simulationDragZonePercent: TEXT_VIEWER_SIMULATION_DRAG_ZONE_DEFAULT,
  dualPage: 'auto',
  textFullJustify: true,
  textBottomJustify: true,
  useZhLayout: false,
  pagedTurnUseBitmap: true,
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
  viewerChromeLayout: defaultViewerChromeLayout,
  adaptSpecialStyle: true,
  chineseConverterType: 0,
  removeDuplicateTitle: true,
};
