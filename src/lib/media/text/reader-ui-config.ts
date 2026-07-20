/**
 * Text Viewer UI 配置类型与默认值（对齐 Legado ReadBookConfig）
 * 与书籍级 types/book.ReadConfig（reverseToc 等）不同，勿混用。
 */

import type { ViewerChromeLayout } from '@/components/media/viewer/viewer-chrome';
import { defaultViewerChromeLayout } from '@/components/media/viewer/viewer-chrome';
import { DEFAULT_CLICK_ACTIONS } from '@/lib/media/text/reader-click-actions';
import { DEFAULT_CLICK_REGION } from '@/lib/media/text/reader-click-region';
import type { ReadAloudEngine } from '@/lib/media/text/read-aloud';
import type { ReaderClickActions } from '@/lib/media/text/reader-click-actions';
import type { ReaderClickRegion } from '@/lib/media/text/reader-click-region';
import type { TextViewerChapterTitleStyle } from '@/lib/media/text/reader-chapter-title-style';
import type { ReaderPageTipType } from '@/lib/media/text/reader-page-tip';
import type { ReaderBgType } from '@/lib/media/text/reader-background';

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

export type TextViewerChineseConverterType = 0 | 1 | 2;

export const TEXT_VIEWER_CHINESE_CONVERTER_TYPE_OPTIONS: TextViewerChineseConverterType[] = [
  0, 1, 2,
];

export const TEXT_VIEWER_CHINESE_CONVERTER_TYPE_LABELS: Record<
  TextViewerChineseConverterType,
  string
> = {
  0: '不转换',
  1: '繁转简',
  2: '简转繁',
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
  return textViewerDualPageMeasureIntent(mode, viewportWidth, viewportHeight);
}

/**
 * 双栏排版/展示意图：宽屏即按单栏宽测量；视口高度未就绪时仍可按宽度判定，
 * 避免首帧高度=0 时测量根塌缩为 1px 或单页→双页布局闪烁。
 */
export function textViewerDualPageMeasureIntent(
  mode: TextViewerDualPageMode,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  if (mode === 'off') return false;
  if (mode === 'always') {
    if (viewportWidth >= 480) return true;
    // 视口宽度未就绪（如 spread 回退 320px）时沿用窗口宽度，避免首帧误判单栏
    if (typeof window !== 'undefined' && window.innerWidth >= 480) return true;
    return false;
  }
  if (viewportWidth < 480) return false;
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
  /** @deprecated 使用 pageTipTextFollowPage */
  tipFollowContentColor: boolean;
  /** 页眉/页脚文本是否跟随阅读主题 */
  pageTipTextFollowPage?: boolean;
  /** 页眉/页脚分割线是否跟随阅读主题 */
  pageTipDividerFollowPage?: boolean;
  /** 页眉/页脚背景是否跟随阅读主题 */
  pageTipBackgroundFollowPage?: boolean;
  /** 自定义文本色（pageTipTextFollowPage=false） */
  customTipColor: string;
  /** 自定义分割线色（pageTipDividerFollowPage=false） */
  customTipDividerColor?: string;
  /** 自定义背景色（pageTipBackgroundFollowPage=false） */
  customTipBackgroundColor?: string;
}

export const defaultTextViewerPageTipsConfig: TextViewerPageTipsConfig = {
  headerMode: 'follow',
  footerMode: 'follow',
  headerLeft: 'time',
  headerMiddle: 'none',
  headerRight: 'battery',
  footerLeft: 'chapterTitle',
  footerMiddle: 'chapterWordCount',
  footerRight: 'chapterProgressAndBook',
  headerFontSize: 12,
  footerFontSize: 12,
  headerInset: { top: 0, bottom: 0, left: 0, right: 0 },
  footerInset: { top: 0, bottom: 0, left: 0, right: 0 },
  showHeaderLine: false,
  showFooterLine: true,
  tipFollowContentColor: true,
  pageTipTextFollowPage: true,
  pageTipDividerFollowPage: true,
  pageTipBackgroundFollowPage: true,
  customTipColor: '',
  customTipDividerColor: '',
  customTipBackgroundColor: '',
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

  /** 填充刘海：内容延伸，移除顶栏 safe-area 顶部间距 */
  paddingDisplayCutouts?: boolean;
  /** 顶栏章节/书源附加区域 */
  showReadTitleAddition?: boolean;
  /** @deprecated 已拆分为 readTopBarStyleFollowPage / readBottomBarStyleFollowPage */
  readBarStyleFollowPage?: boolean;
  /** 顶栏配色跟随阅读主题 */
  readTopBarStyleFollowPage?: boolean;
  /** 底栏配色跟随阅读主题 */
  readBottomBarStyleFollowPage?: boolean;
  /** 顶栏/底栏显示亮度滑条 */
  showBrightnessView?: boolean;
  /** 亮度胶囊位置：左 / 右 / 顶栏下 / 底栏上 */
  brightnessViewPosition?: TextViewerBrightnessViewPosition;
  /** 亮度胶囊配色跟随阅读主题 */
  brightnessViewStyleFollowPage?: boolean;
  /** 浮动朗读播放器配色跟随阅读主题 */
  readAloudBarStyleFollowPage?: boolean;
  /** 底栏进度条：按页 / 按章 */
  progressBarBehavior?: 'page' | 'chapter';
  /** 鼠标滚轮翻页（滚动模式滚内容，按页模式翻页） */
  mouseWheelPage?: boolean;
  /** 朗读时音量键仍翻页（与 volumeKeyControlAloud 互斥） */
  volumeKeyTurnPageOnAloud?: boolean;
  /** 自定义翻页按键 KeyboardEvent.code */
  customPageKeys?: { prev: string[]; next: string[] };
  /** 按键长按连续翻页 */
  keyPageOnLongPress?: boolean;
  /** 禁用滚动模式九宫格点击（仅切换顶底栏） */
  disableScrollClickAnimation?: boolean;
  /** 允许长按选择文本 */
  selectText?: boolean;
  /** 点击取消选区范围：仅游标外 / 游标与选区外 */
  textSelectDismissScope?: TextViewerTextSelectDismissScope;
  /** 文本选择菜单默认展开 */
  expandTextMenu?: boolean;
  /** 文本选择菜单可见项 id */
  textMenuVisibleItems?: string[];
  /** 隐藏的第三方 PROCESS_TEXT 类菜单项 key（Legado hiddenProcessTextItems） */
  textMenuHiddenProcessTextItems?: string[];
  /** 点击图片方式：0 默认 / 1 预览 / 2 兼容 / 3 关闭 / 4 双击 */
  clickImgWay?: 0 | 1 | 2 | 3 | 4;
  /** 屏幕方向 0–5 */
  screenOrientation?: 0 | 1 | 2 | 3 | 4 | 5;
  /** 屏幕超时秒数；-1 常亮；0 系统默认 */
  keepScreenOn?: 0 | 60 | 300 | 600 | -1;
  /** 阅读亮度 0–100 */
  readBrightness?: number;
  /** 退出阅读器时恢复亮度 */
  brightnessAuto?: boolean;
  /** 章节加载失败时自动换源 */
  autoChangeSource?: boolean;
  /** 菜单隐藏时拦截返回键 */
  disableReturnKey?: boolean;

  /** Legado 阅读背景：白天类型 0 颜色 / 1 内置 / 2 自定义 */
  bgType?: ReaderBgType;
  bgTypeNight?: ReaderBgType;
  /** 颜色 hex 或图片文件名 */
  bgStr?: string;
  bgStrNight?: string;
  /** 背景图透明度 0–100 */
  bgAlpha?: number;

  /**
   * 商业级主题：各 surface 透明度/模糊覆盖（0–100 / 0–24px）
   * 未设则沿用主题预设；chrome 类未设时沿用应用全局 viewerChromeOverlay*
   */
  themeSurfaceAppearance?: TextViewerThemeAppearanceConfig;
}

/** 阅读主题 surface 外观配置（商业级主题包 / 用户覆盖） */
export interface TextViewerThemeAppearanceConfig {
  /** 正文区背景 */
  content?: Partial<TextViewerSurfaceAppearanceTokens>;
  /** 顶/底栏、悬浮胶囊等 chrome */
  chrome?: Partial<TextViewerSurfaceAppearanceTokens>;
  /** 页眉/页脚条 */
  pageTip?: Partial<TextViewerSurfaceAppearanceTokens>;
  /** 亮度胶囊 */
  brightness?: Partial<TextViewerSurfaceAppearanceTokens>;
}

/** surface 透明度与模糊 */
export interface TextViewerSurfaceAppearanceTokens {
  /** 不透明度 0–100 */
  opacity: number;
  /** 背景模糊 px 0–24 */
  blurPx: number;
}

/** 按页自动翻页：扫描线 / 横向进度条 / 扫描揭示下一页（对齐 Legado 非滚动 AutoPager） */
export type TextViewerAutoPageStyle = 'scanLine' | 'progressBar' | 'reveal';

export type TextViewerAutoPageProgressEdge = 'top' | 'bottom';

export const TEXT_VIEWER_AUTO_PAGE_STYLE_LABELS: Record<TextViewerAutoPageStyle, string> = {
  scanLine: '扫描线',
  progressBar: '进度条',
  reveal: '揭示下一页',
};

export const TEXT_VIEWER_AUTO_PAGE_STYLES = [
  'scanLine',
  'progressBar',
  'reveal',
] as const satisfies readonly TextViewerAutoPageStyle[];

export const TEXT_VIEWER_AUTO_PAGE_PROGRESS_EDGE_LABELS: Record<
  TextViewerAutoPageProgressEdge,
  string
> = {
  top: '顶部',
  bottom: '底部',
};

export const TEXT_VIEWER_AUTO_PAGE_PROGRESS_EDGES = [
  'top',
  'bottom',
] as const satisfies readonly TextViewerAutoPageProgressEdge[];

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

export type TextViewerProgressBarBehavior = 'page' | 'chapter';

export type TextViewerScreenOrientation = 0 | 1 | 2 | 3 | 4 | 5;

export type TextViewerKeepScreenOn = 0 | 60 | 300 | 600 | -1;

export type TextViewerClickImgWay = 0 | 1 | 2 | 3 | 4;

export const TEXT_VIEWER_SCREEN_ORIENTATION_LABELS: Record<TextViewerScreenOrientation, string> = {
  0: '跟随系统',
  1: '竖屏',
  2: '横屏',
  3: '传感器',
  4: '反向竖屏',
  5: '反向横屏',
};

export const TEXT_VIEWER_KEEP_SCREEN_ON_LABELS: Record<string, string> = {
  '0': '系统默认',
  '60': '1 分钟',
  '300': '5 分钟',
  '600': '10 分钟',
  '-1': '常亮',
};

export const TEXT_VIEWER_PROGRESS_BAR_BEHAVIOR_LABELS: Record<TextViewerProgressBarBehavior, string> = {
  page: '按页',
  chapter: '按章',
};

export const TEXT_VIEWER_PROGRESS_BAR_BEHAVIORS = [
  'page',
  'chapter',
] as const satisfies readonly TextViewerProgressBarBehavior[];

export type TextViewerBrightnessViewPosition = 'left' | 'right' | 'top' | 'bottom';

export const TEXT_VIEWER_BRIGHTNESS_VIEW_POSITION_LABELS: Record<
  TextViewerBrightnessViewPosition,
  string
> = {
  left: '左侧',
  right: '右侧',
  top: '顶部',
  bottom: '底部',
};

export function normalizeBrightnessViewPosition(
  value: unknown,
): TextViewerBrightnessViewPosition {
  if (value === 'left' || value === 'right' || value === 'top' || value === 'bottom') {
    return value;
  }
  return 'left';
}

export const TEXT_VIEWER_BRIGHTNESS_VIEW_POSITIONS = [
  'left',
  'right',
  'top',
  'bottom',
] as const satisfies readonly TextViewerBrightnessViewPosition[];

export const TEXT_VIEWER_CLICK_IMG_WAY_LABELS: Record<TextViewerClickImgWay, string> = {
  0: '默认（链接）',
  1: '预览',
  2: '兼容旧版',
  3: '关闭',
  4: '双击',
};

/** 点击取消选区：仅在游标外 / 游标与选区外 */
export type TextViewerTextSelectDismissScope =
  | 'outsideHandle'
  | 'outsideHandleAndSelection';

export const TEXT_VIEWER_TEXT_SELECT_DISMISS_SCOPE_LABELS: Record<
  TextViewerTextSelectDismissScope,
  string
> = {
  outsideHandle: '非游标区域',
  outsideHandleAndSelection: '非游标及选区区域',
};

export const TEXT_VIEWER_TEXT_SELECT_DISMISS_SCOPES = [
  'outsideHandle',
  'outsideHandleAndSelection',
] as const satisfies readonly TextViewerTextSelectDismissScope[];

export function normalizeTextViewerTextSelectDismissScope(
  value: string | undefined | null,
): TextViewerTextSelectDismissScope {
  if (value === 'outsideHandle') return 'outsideHandle';
  return 'outsideHandleAndSelection';
}

/** Legado TextMenuConfig.ALL_MENU_ITEMS 顺序；折叠时前 5 项主栏，其余进「更多」 */
export const TEXT_VIEWER_TEXT_MENU_ITEM_ORDER = [
  'replace',
  'copy',
  'bookmark',
  'speakSelection',
  'dict',
  'searchContent',
  'browser',
  'share',
] as const;

/** speakFromHere 由 contentSelectSpeakMod=1 时在 speakSelection 后插入 */
export const TEXT_VIEWER_TEXT_MENU_EXTRA_ITEM_IDS = ['speakFromHere'] as const;

export const TEXT_VIEWER_TEXT_MENU_ITEM_IDS = [
  ...TEXT_VIEWER_TEXT_MENU_ITEM_ORDER,
  ...TEXT_VIEWER_TEXT_MENU_EXTRA_ITEM_IDS,
] as const;

export type TextViewerTextMenuItemId = (typeof TEXT_VIEWER_TEXT_MENU_ITEM_IDS)[number];

export const TEXT_VIEWER_TEXT_MENU_ITEM_LABELS: Record<TextViewerTextMenuItemId, string> = {
  replace: '替换',
  copy: '复制',
  bookmark: '书签',
  speakSelection: '朗读',
  speakFromHere: '从此处朗读',
  dict: '字典',
  searchContent: '全文搜索',
  browser: '浏览器',
  share: '分享',
};

export const TEXT_VIEWER_TEXT_MENU_COLLAPSED_PRIMARY_COUNT = 5;

export const DEFAULT_TEXT_VIEWER_TEXT_MENU_VISIBLE_ITEMS: TextViewerTextMenuItemId[] = [
  ...TEXT_VIEWER_TEXT_MENU_ITEM_ORDER,
];

export function normalizeProgressBarBehavior(
  value: string | undefined | null,
): TextViewerProgressBarBehavior {
  return value === 'chapter' ? 'chapter' : 'page';
}

export function normalizeClickImgWay(value: number | undefined | null): TextViewerClickImgWay {
  if (value === 1 || value === 2 || value === 3 || value === 4) return value;
  return 0;
}

export function normalizeScreenOrientation(
  value: number | undefined | null,
): TextViewerScreenOrientation {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) return value;
  return 0;
}

export function normalizeKeepScreenOn(value: number | undefined | null): TextViewerKeepScreenOn {
  if (value === 60 || value === 300 || value === 600 || value === -1) return value;
  return 0;
}

export function normalizeReadBrightness(value: number | undefined | null): number {
  if (value == null || !Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function normalizeCustomPageKeys(
  raw: Partial<{ prev: string[]; next: string[] }> | undefined | null,
): { prev: string[]; next: string[] } {
  return {
    prev: Array.isArray(raw?.prev) ? raw.prev.filter((k) => typeof k === 'string') : [],
    next: Array.isArray(raw?.next) ? raw.next.filter((k) => typeof k === 'string') : [],
  };
}

export const DEFAULT_TEXT_VIEWER_CUSTOM_PAGE_KEYS = {
  prev: [] as string[],
  next: [] as string[],
};

export function normalizeTextMenuVisibleItems(
  raw: string[] | undefined | null,
): TextViewerTextMenuItemId[] {
  const allowed = new Set<string>(TEXT_VIEWER_TEXT_MENU_ITEM_IDS);
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...DEFAULT_TEXT_VIEWER_TEXT_MENU_VISIBLE_ITEMS];
  }
  const filtered = raw.filter((id): id is TextViewerTextMenuItemId => allowed.has(id));
  return filtered.length > 0 ? filtered : [...DEFAULT_TEXT_VIEWER_TEXT_MENU_VISIBLE_ITEMS];
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
  paddingDisplayCutouts: false,
  showReadTitleAddition: true,
  readTopBarStyleFollowPage: false,
  readBottomBarStyleFollowPage: false,
  showBrightnessView: true,
  brightnessViewPosition: 'left',
  brightnessViewStyleFollowPage: true,
  readAloudBarStyleFollowPage: false,
  progressBarBehavior: 'page',
  mouseWheelPage: true,
  volumeKeyTurnPageOnAloud: false,
  customPageKeys: { ...DEFAULT_TEXT_VIEWER_CUSTOM_PAGE_KEYS },
  keyPageOnLongPress: false,
  disableScrollClickAnimation: false,
  selectText: true,
  textSelectDismissScope: 'outsideHandleAndSelection',
  expandTextMenu: false,
  textMenuVisibleItems: [...DEFAULT_TEXT_VIEWER_TEXT_MENU_VISIBLE_ITEMS],
  textMenuHiddenProcessTextItems: [],
  clickImgWay: 0,
  screenOrientation: 0,
  keepScreenOn: 0,
  readBrightness: 100,
  brightnessAuto: true,
  autoChangeSource: true,
  disableReturnKey: false,
  bgType: 0,
  bgTypeNight: 0,
  /** 空字符串表示跟随当前阅读主题 palette，勿用 Legado 默认粉色 */
  bgStr: '',
  bgStrNight: '#000000',
  bgAlpha: 100,
};
