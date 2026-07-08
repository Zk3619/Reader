/** 主题系统共享类型 */

/** 应用壳层明暗模式 */
export type AppThemeMode = 'light' | 'dark' | 'auto' | 'schedule';

/** HSL 分量（不含 hsl() 包装，与 shadcn / Tailwind 变量一致） */
export type HslComponents = `${number} ${number}% ${number}%`;

/** 语义色板：商业级主题系统最小完备集 */
export interface SemanticColorTokens {
  background: HslComponents;
  foreground: HslComponents;
  muted: HslComponents;
  mutedForeground: HslComponents;
  popover: HslComponents;
  popoverForeground: HslComponents;
  border: HslComponents;
  input: HslComponents;
  card: HslComponents;
  cardForeground: HslComponents;
  primary: HslComponents;
  primaryForeground: HslComponents;
  secondary: HslComponents;
  secondaryForeground: HslComponents;
  accent: HslComponents;
  accentForeground: HslComponents;
  destructive: HslComponents;
  destructiveForeground: HslComponents;
  info: HslComponents;
  infoForeground: HslComponents;
  success: HslComponents;
  successForeground: HslComponents;
  warning: HslComponents;
  warningForeground: HslComponents;
  error: HslComponents;
  errorForeground: HslComponents;
  ring: HslComponents;
  sidebar: HslComponents;
  sidebarForeground: HslComponents;
  sidebarAccent: HslComponents;
  sidebarAccentForeground: HslComponents;
  sidebarBorder: HslComponents;
  sidebarRing: HslComponents;
}

/** 布局 / 动效 / 圆角等非色 token */
export interface LayoutTokens {
  radius: string;
  appBarHeight: string;
  readerTopBarHeight: string;
  readerBottomBarHeight: string;
  readerFooterMaxHeight: string;
  readerScrollbarSize: string;
  readerBarDuration: string;
  readerBarEasingEnter: string;
  readerBarEasingExit: string;
  readerBrightnessChromeGap: string;
  mobileSafeTop: string;
  mobileSafeBottomGesture: string;
  mobileSafeBottomButtons: string;
  searchLoopDuration: string;
  searchLoopMinWidth: string;
}

/** 完整应用主题定义（可序列化、可自定义） */
export interface AppThemeDefinition {
  id: string;
  name: string;
  light: SemanticColorTokens;
  dark: SemanticColorTokens;
  layout?: Partial<LayoutTokens>;
}

/** CSS 变量键值对（值可为任意 CSS 合法字符串） */
export type ThemeCssVarMap = Record<string, string>;

/** 自定义主题：在预设上局部覆盖 */
export type ThemeTokenOverrides = Partial<SemanticColorTokens & LayoutTokens>;

/** 十六进制阅读主题（文本 / 部分 viewer 内容区） */
export interface HexContentPalette {
  name: string;
  bg: string;
  text: string;
  accent: string;
  border: string;
  /** 正文链接色 */
  link?: string;
  /** 引用 / 块引用背景 */
  quoteBg?: string;
  /** 行内代码背景 */
  codeBg?: string;
  /** 选区高亮 */
  selection?: string;
}

/** 阅读器亮度胶囊配色 */
export interface BrightnessChromeTokens {
  capsuleBg: string;
  foreground: string;
  buttonHoverBg: string;
  sliderTrack: string;
  sliderFill: string;
  sliderThumb: string;
  capsuleGlow: string;
}

/** 文本阅读器完整色板（含派生 chrome） */
export interface TextViewerPalette extends HexContentPalette {
  brightnessChrome: BrightnessChromeTokens;
}

export type TextViewerThemeId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Media viewer 共享 chrome 外观 token */
export interface MediaViewerChromeTokens {
  overlayOpacityDefault: number;
  overlayBlurDefaultPx: number;
  floatingShift: string;
  sliderLaneClass: string;
}

/** 各 viewer 内容区 stage 默认 class / 变量 */
export interface ViewerStageTheme {
  stageClass: string;
  cssVars?: ThemeCssVarMap;
}
