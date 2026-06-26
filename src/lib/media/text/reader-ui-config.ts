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
import type { TextViewerChapterTitleStyle } from '@/lib/media/text/reader-chapter-title-style';
import type { ReaderPageTipType } from '@/lib/media/text/reader-page-tip';

/** 与 Legado PageAnim 对齐：滚动 / 覆盖 / 滑动 / 仿真 / 无动画 */
export type TextViewerPageAnim =
  | 'scroll'
  | 'cover'
  | 'slide'
  | 'simulation'
  | 'none';
export type TextViewerDualPageMode = 'off' | 'auto' | 'always';
export type TextViewerImageStyle = 'DEFAULT' | 'FULL' | 'TEXT' | 'SINGLE';
/** 按页排版引擎：Pretext 计算 / DOM 测量 */
export type TextViewerLayoutEngine = 'pretext' | 'dom';

export const TEXT_VIEWER_LAYOUT_ENGINE_LABELS: Record<TextViewerLayoutEngine, string> = {
  pretext: 'Pretext（实验）',
  dom: 'DOM 测量（推荐）',
};

/** Tailwind `xl` 断点（1280px）：双页「自动」模式的最小视口宽度 */
export const TEXT_VIEWER_DUAL_PAGE_XL_MIN_WIDTH_PX = 1280;

/**
 * 按页阅读：content-slot 默认上下 inset（与 {@link defaultTextViewerUiConfig} 一致）
 */
export const TEXT_VIEWER_PAGED_CONTENT_INSET_TOP_PX = 32;
export const TEXT_VIEWER_PAGED_CONTENT_INSET_BOTTOM_PX = 32;

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
export type TextViewerPageTipHeaderMode = 'follow' | 'always' | 'never';
export type TextViewerPageTipFooterMode = 'follow' | 'always' | 'never';

export interface TextViewerPageTipInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** 页眉/页脚信息条（对齐 Legado ReadTipConfig / ReadBookConfig） */
export interface TextViewerPageTipsConfig {
  headerMode: TextViewerPageTipHeaderMode;
  footerMode: TextViewerPageTipFooterMode;
  headerLeft: ReaderPageTipType;
  headerMiddle: ReaderPageTipType;
  headerRight: ReaderPageTipType;
  footerLeft: ReaderPageTipType;
  footerMiddle: ReaderPageTipType;
  footerRight: ReaderPageTipType;
  headerFontSize: number;
  footerFontSize: number;
  headerInset: TextViewerPageTipInsets;
  footerInset: TextViewerPageTipInsets;
  showHeaderLine: boolean;
  showFooterLine: boolean;
  tipFollowContentColor: boolean;
  customTipColor: string;
}

export const defaultTextViewerPageTipsConfig: TextViewerPageTipsConfig = {
  headerMode: 'follow',
  footerMode: 'never',
  headerLeft: 'time',
  headerMiddle: 'none',
  headerRight: 'battery',
  footerLeft: 'chapterTitle',
  footerMiddle: 'none',
  footerRight: 'pageAndTotal',
  headerFontSize: 12,
  footerFontSize: 12,
  headerInset: { top: 0, bottom: 0, left: 0, right: 0 },
  footerInset: { top: 0, bottom: 0, left: 0, right: 0 },
  showHeaderLine: false,
  showFooterLine: true,
  tipFollowContentColor: true,
  customTipColor: '',
};

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
  /** 正文字重 100–900 */
  fontWeight: number;
  readWidth: number;
  infiniteLoading: boolean;
  customFontName: string;
  /** 本地字体文件路径（font=3） */
  customFontPath: string;
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
  /** 按页排版：Pretext 无 DOM 行测量；DOM 为经典 measure-host 方案 */
  layoutEngine: TextViewerLayoutEngine;
  /** 章节标题渲染：不渲染 / 左侧 / 中心 / 右侧 */
  chapterTitleStyle: TextViewerChapterTitleStyle;
  /** 章节标题字号增量（rem，0 表示与正文相同） */
  chapterTitleSize: number;
  /** 章节标题上间距（rem） */
  chapterTitleTopSpacing: number;
  /** 章节标题下间距（rem） */
  chapterTitleBottomSpacing: number;
  /** 章节标题字重 100–900 */
  chapterTitleFontWeight: number;
  /** 段首缩进全角字符数（0 表示不缩进） */
  paragraphIndentChars: number;
  /** 页眉与页脚信息条 */
  pageTips: TextViewerPageTipsConfig;
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
  /** @deprecated 迁移至 ttsSpeechRate；保留读取兼容 */
  speakSpeed: number;
  /** Legado ttsSpeechRate：0–45，显示 (value+5)/10 */
  ttsSpeechRate: number;
  ttsFollowSys: boolean;
  /** 默认定时关闭分钟数（0=不定时） */
  ttsTimer: number;
  readAloudByPage: boolean;
  /** true：段键切章；false：段键切段 */
  mediaButtonPerNext: boolean;
  systemTtsVoiceURI: string;
  systemTtsLang: string;
  /** 浮动朗读控制条（Legado readAloudFloatingUi） */
  readAloudFloatingUi: boolean;
  /** 选区朗读：0 仅选中 / 1 从选中连续读 */
  contentSelectSpeakMod: 0 | 1;
  /** 朗读活跃时音量键控制段/章而非翻页 */
  volumeKeyControlAloud: boolean;
  /** HttpTTS 边下边播（Legado streamReadAloudAudio） */
  streamReadAloudAudio: boolean;
  /** 页面重新可见时自动恢复朗读（Legado 音频焦点简化版） */
  readAloudResumeOnFocus: boolean;
  imageStyle: TextViewerImageStyle;
  /** 顶栏与底栏布局（仅文本阅读器；未配置时沿用应用设置） */
  viewerChromeLayout: ViewerChromeLayout;
  /** 替换净化前保护 <usehtml> 块（Legado adaptSpecialStyle，默认开启） */
  adaptSpecialStyle?: boolean;
  /** 简繁转换：0 关 / 1 繁转简 / 2 简转繁（Legado chineseConverterType） */
  chineseConverterType?: 0 | 1 | 2;
  /** 去除正文开头重复章节标题（Legado removeSameTitle，默认开启） */
  removeDuplicateTitle?: boolean;
  /** 自动翻页速度：滚完一屏高度所需秒数（Legado autoReadSpeed，默认 10） */
  autoReadSpeed?: number;
  /** 自动翻页按页时的视觉/翻页行为 */
  autoPageStyle?: TextViewerAutoPageStyle;
  /** 进度条模式：进度条贴在内容区顶部或底部 */
  autoPageProgressEdge?: TextViewerAutoPageProgressEdge;
}

/** 按页自动翻页：扫描线 / 横向进度条 / 扫描揭示下一页（对齐 Legado 非滚动 AutoPager） */
export type TextViewerAutoPageStyle = 'scanLine' | 'progressBar' | 'reveal';

export type TextViewerAutoPageProgressEdge = 'top' | 'bottom';

export const TEXT_VIEWER_AUTO_PAGE_STYLE_LABELS: Record<TextViewerAutoPageStyle, string> = {
  scanLine: '扫描线',
  progressBar: '进度条',
  reveal: '揭示下一页',
};

export const TEXT_VIEWER_AUTO_PAGE_PROGRESS_EDGE_LABELS: Record<
  TextViewerAutoPageProgressEdge,
  string
> = {
  top: '顶部',
  bottom: '底部',
};

export function normalizeAutoPageStyle(
  value: string | undefined | null,
): TextViewerAutoPageStyle {
  if (value === 'progressBar' || value === 'reveal') return value;
  return 'scanLine';
}

export function normalizeAutoPageProgressEdge(
  value: string | undefined | null,
): TextViewerAutoPageProgressEdge {
  return value === 'top' ? 'top' : 'bottom';
}

export const TEXT_VIEWER_AUTO_READ_SPEED_MIN = 1;
export const TEXT_VIEWER_AUTO_READ_SPEED_MAX = 120;
export const TEXT_VIEWER_AUTO_READ_SPEED_DEFAULT = 10;

export function normalizeTextViewerLayoutEngine(
  value: string | undefined | null,
): TextViewerLayoutEngine {
  return value === 'pretext' ? 'pretext' : 'dom';
}

export function textViewerUsesPretextLayout(
  config: Pick<TextViewerUiConfig, 'layoutEngine'>,
): boolean {
  return config.layoutEngine === 'pretext';
}

export const TTS_SPEECH_RATE_MIN = 0;
export const TTS_SPEECH_RATE_MAX = 45;
export const TTS_TIMER_MAX_MINUTES = 180;

export function normalizeTtsSpeechRate(value: number | undefined | null): number {
  if (value == null || !Number.isFinite(value)) {
    return defaultTextViewerUiConfig.ttsSpeechRate;
  }
  return Math.min(
    TTS_SPEECH_RATE_MAX,
    Math.max(TTS_SPEECH_RATE_MIN, Math.round(value)),
  );
}

/** Legado 显示值：(rate + 5) / 10 */
export function ttsSpeechRateDisplay(rate: number): string {
  return String(ttsSpeechRateToDisplayValue(rate));
}

export const TTS_SPEECH_RATE_DISPLAY_MIN = (TTS_SPEECH_RATE_MIN + 5) / 10;
export const TTS_SPEECH_RATE_DISPLAY_MAX = (TTS_SPEECH_RATE_MAX + 5) / 10;

export function ttsSpeechRateToDisplayValue(rate: number): number {
  return (normalizeTtsSpeechRate(rate) + 5) / 10;
}

export function ttsSpeechRateFromDisplayValue(display: number): number {
  if (!Number.isFinite(display)) {
    return defaultTextViewerUiConfig.ttsSpeechRate;
  }
  return normalizeTtsSpeechRate(Math.round(display * 10 - 5));
}

export function normalizeTtsTimerMinutes(value: number | undefined | null): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.min(TTS_TIMER_MAX_MINUTES, Math.max(0, Math.round(value)));
}

/** 系统 Web Speech rate */
export function ttsSpeechRateToSystemRate(rate: number): number {
  return (normalizeTtsSpeechRate(rate) + 5) / 10;
}

export function normalizeAutoReadSpeed(value: number | undefined | null): number {
  if (value == null || !Number.isFinite(value)) {
    return TEXT_VIEWER_AUTO_READ_SPEED_DEFAULT;
  }
  return Math.min(
    TEXT_VIEWER_AUTO_READ_SPEED_MAX,
    Math.max(TEXT_VIEWER_AUTO_READ_SPEED_MIN, Math.round(value)),
  );
}

export const defaultTextViewerUiConfig: TextViewerUiConfig = {
  theme: 0,
  font: 0,
  fontSize: 18,
  fontWeight: 400,
  readWidth: 800,
  infiniteLoading: false,
  customFontName: '',
  customFontPath: '',
  jumpDuration: 1000,
  spacing: { paragraph: 1, line: 0.8, letter: 0 },
  contentInset: { left: 16, right: 16, center: 32, top: 32, bottom: 32 },
  statusBarDisplayStyle: 'follow',
  pageAnim: 'scroll',
  pagedDragCommitPercent: TEXT_VIEWER_PAGED_DRAG_COMMIT_PERCENT_DEFAULT,
  simulationDragZonePercent: TEXT_VIEWER_SIMULATION_DRAG_ZONE_DEFAULT,
  dualPage: 'auto',
  layoutEngine: 'dom',
  chapterTitleStyle: 'center',
  chapterTitleSize: 0,
  chapterTitleTopSpacing: 0,
  chapterTitleBottomSpacing: 0,
  chapterTitleFontWeight: 600,
  paragraphIndentChars: 2,
  pageTips: { ...defaultTextViewerPageTipsConfig },
  textFullJustify: true,
  textBottomJustify: true,
  useZhLayout: false,
  pagedTurnUseBitmap: false,
  volumeKeyTurnPage: true,
  clickActions: { ...DEFAULT_CLICK_ACTIONS },
  clickRegion: {
    xSplits: [...DEFAULT_CLICK_REGION.xSplits] as [number, number],
    ySplits: [...DEFAULT_CLICK_REGION.ySplits] as [number, number],
  },
  aloudEngine: 'system',
  httpTtsId: null,
  speakSpeed: 5,
  ttsSpeechRate: 5,
  ttsFollowSys: true,
  ttsTimer: 0,
  readAloudByPage: false,
  mediaButtonPerNext: false,
  systemTtsVoiceURI: '',
  systemTtsLang: 'zh-CN',
  readAloudFloatingUi: false,
  contentSelectSpeakMod: 0,
  volumeKeyControlAloud: true,
  streamReadAloudAudio: false,
  readAloudResumeOnFocus: false,
  imageStyle: 'DEFAULT',
  viewerChromeLayout: defaultViewerChromeLayout,
  adaptSpecialStyle: true,
  chineseConverterType: 0,
  removeDuplicateTitle: true,
  autoReadSpeed: TEXT_VIEWER_AUTO_READ_SPEED_DEFAULT,
  autoPageStyle: 'scanLine',
  autoPageProgressEdge: 'bottom',
};
