/**
 * Reader Theme Pack Schema v1 — 商业级主题包可序列化结构
 */

import type {
  AppThemeDefinition,
  MediaViewerChromeTokens,
  SemanticColorTokens,
  TextViewerPalette,
  TextViewerThemeId,
  ThemeCssVarMap,
} from '@/lib/theme/types';
import type { TextViewerThemeAppearanceConfig } from '@/lib/media/text/reader-ui-config';
import { DEFAULT_APP_THEME } from '@/lib/theme/AppTheme';

export const THEME_PACK_SCHEMA_VERSION = 1 as const;

/** App 壳层可预览/可编辑组件 ID */
export type AppComponentId =
  | 'appShell'
  | 'pageContent'
  | 'sidebar'
  | 'sidebarHeader'
  | 'sidebarNav'
  | 'sidebarRecent'
  | 'sidebarFooter'
  | 'bookshelfCard'
  | 'bookshelfGroupCard'
  | 'settingsCard'
  | 'settingsTabPanel'
  | 'settingsRow'
  | 'recordCard'
  | 'surfaceCard'
  | 'button'
  | 'dialog'
  | 'drawer'
  | 'dropdown'
  | 'select'
  | 'combobox'
  | 'contextMenu'
  | 'toast'
  | 'pageToolbar';

/** 阅读器可预览/可编辑组件 ID */
export type ViewerComponentId =
  | 'readerChrome'
  | 'toolbarHeader'
  | 'footerChrome'
  | 'contentSlot'
  | 'pageTip'
  | 'brightnessCapsule'
  | 'imageStage'
  | 'videoControls';

export type ThemeComponentId = AppComponentId | ViewerComponentId;

/** 主题作用域（CSS / 特效挂载点） */
export type ThemeScopeId =
  | 'app'
  | 'viewer'
  | 'appShell'
  | 'readerContent'
  | 'readerChrome'
  | 'readerBackground';

export type AdvancedMountPoint =
  | 'appShellBackground'
  | 'readerContentBackground'
  | 'readerChromeOverlay';

export type ThemeAssetKind = 'image' | 'gif' | 'video' | 'font' | 'shader' | 'script';

export interface ThemeAssetEntry {
  path: string;
  mime: string;
  kind: ThemeAssetKind;
}

export type ThemeAssetManifest = Record<string, ThemeAssetEntry>;

export interface GradientStop {
  color: string;
  at: string;
}

export type ContainerBackgroundConfig =
  | { type: 'solid'; color: string; opacity?: number; blurPx?: number }
  | { type: 'gradient'; stops: GradientStop[]; angle?: number; opacity?: number; blurPx?: number }
  | {
      type: 'asset';
      assetId: string;
      fit?: 'cover' | 'contain' | 'fill';
      position?: string;
      opacity?: number;
      blurPx?: number;
    }
  | { type: 'none' };

export interface ComponentLayoutOverride {
  padding?: string;
  margin?: string;
  gap?: string;
  radius?: string;
  border?: string;
  shadow?: string;
}

export interface ComponentTypographyOverride {
  fontSize?: string;
  fontWeight?: string | number;
  lineHeight?: string | number;
  letterSpacing?: string;
  fontFamily?: string;
}

/** 组件底色透明度 / 模糊（作用于颜色 Tab 的 Token 底色，非装饰图图层） */
export interface ComponentSurfaceAppearance {
  opacity?: number;
  blurPx?: number;
}

export interface ComponentStyleOverride {
  colors?: Partial<SemanticColorTokens>;
  cssVars?: ThemeCssVarMap;
  className?: string;
  layout?: ComponentLayoutOverride;
  typography?: ComponentTypographyOverride;
  surfaceAppearance?: ComponentSurfaceAppearance;
  states?: Partial<
    Record<'hover' | 'active' | 'focus' | 'disabled', Omit<ComponentStyleOverride, 'states'>>
  >;
  background?: ContainerBackgroundConfig;
}

export interface TypographyTokens {
  fontFamily?: string;
  fontFamilyMono?: string;
  scale?: number;
  lineHeight?: number;
}

export type ReducedMotionPolicy = 'respect' | 'always-reduce' | 'ignore';

export interface MotionTokens {
  durationFast?: string;
  durationNormal?: string;
  durationSlow?: string;
  easingDefault?: string;
  reducedMotionPolicy?: ReducedMotionPolicy;
}

export interface AppThemeSection {
  mode: 'light' | 'dark' | 'dual';
  tokens: AppThemeDefinition;
  components?: Partial<Record<AppComponentId, ComponentStyleOverride>>;
  typography?: TypographyTokens;
  motion?: MotionTokens;
}

export interface ReaderTypographyTokens {
  fontFamily?: string;
  fontSize?: string;
  lineHeight?: number;
  paragraphSpacing?: number;
}

export interface TextViewerThemeSection {
  paletteId?: TextViewerThemeId | 'custom';
  customPalette?: TextViewerPalette;
  surfaceAppearance?: TextViewerThemeAppearanceConfig;
  typography?: ReaderTypographyTokens;
  contentBackground?: ContainerBackgroundConfig;
  chromeBackground?: ContainerBackgroundConfig;
}

export interface ImageViewerThemeSection {
  stageBackground?: ContainerBackgroundConfig;
  letterboxColor?: string;
}

export interface AudioViewerThemeSection {
  stageBackground?: ContainerBackgroundConfig;
  accentColor?: string;
}

export interface VideoViewerThemeSection {
  stageBackground?: ContainerBackgroundConfig;
  controlsAccent?: string;
}

export interface FileViewerThemeSection {
  stageBackground?: ContainerBackgroundConfig;
}

export interface ViewerThemeSection {
  shared?: Partial<MediaViewerChromeTokens>;
  text?: TextViewerThemeSection;
  image?: ImageViewerThemeSection;
  audio?: AudioViewerThemeSection;
  video?: VideoViewerThemeSection;
  file?: FileViewerThemeSection;
  components?: Partial<Record<ViewerComponentId, ComponentStyleOverride>>;
}

export interface CustomCssBlock {
  scope: ThemeScopeId;
  /** 绑定到具体预览组件；未设置时作用于 data-theme-scope 根节点 */
  componentId?: ThemeComponentId;
  css: string;
  /** true = 原样注入（支持 @keyframes / 多规则选择器） */
  raw?: boolean;
}

export interface CustomHtmlBlock {
  mountPoint: AdvancedMountPoint;
  html: string;
}

export interface MouseTrailEffect {
  type: 'mouseTrail';
  id?: string;
  enabled: boolean;
  color: string;
  length: number;
  size: number;
  fadeMs: number;
  blendMode?: string;
  scope: ThemeScopeId;
}

export interface MouseGlowEffect {
  type: 'mouseGlow';
  id?: string;
  enabled: boolean;
  radius: number;
  color: string;
  intensity: number;
  scope: ThemeScopeId;
}

export interface BackgroundParallaxEffect {
  type: 'backgroundParallax';
  id?: string;
  enabled: boolean;
  maxShiftPx: number;
  scope: ThemeScopeId;
}

export interface BackgroundRippleEffect {
  type: 'backgroundRipple';
  id?: string;
  enabled: boolean;
  color: string;
  durationMs: number;
  scope: ThemeScopeId;
}

export interface NoiseOverlayEffect {
  type: 'noiseOverlay';
  id?: string;
  enabled: boolean;
  opacity: number;
  scope: ThemeScopeId;
}

/** 点击粒子爆发（mouse-animations Particles） */
export interface ClickParticlesEffect {
  type: 'clickParticles';
  id?: string;
  enabled: boolean;
  count?: number;
  colors?: string[];
  size?: number;
  spread?: number;
  scope: ThemeScopeId;
}

/** 点击涟漪（mouse-animations Ripple） */
export interface ClickRippleEffect {
  type: 'clickRipple';
  id?: string;
  enabled: boolean;
  color?: string;
  durationMs?: number;
  maxSize?: number;
  scope: ThemeScopeId;
}

/** 自定义指针（mouse-animations Image / CustomCursor） */
export interface CustomCursorEffect {
  type: 'customCursor';
  id?: string;
  enabled: boolean;
  mode: 'image' | 'ring';
  /** 资产 ID 或 URL / inline SVG */
  src?: string;
  assetId?: string;
  hoverAssetId?: string;
  activeAssetId?: string;
  width?: number;
  height?: number;
  offsetX?: number;
  offsetY?: number;
  smoothness?: number;
  hideDefault?: boolean;
  /** ring 模式 */
  innerSize?: number;
  outerSize?: number;
  innerColor?: string;
  outerColor?: string;
  scope: ThemeScopeId;
}

export type ThemeEffectConfig =
  | MouseTrailEffect
  | MouseGlowEffect
  | BackgroundParallaxEffect
  | BackgroundRippleEffect
  | NoiseOverlayEffect
  | ClickParticlesEffect
  | ClickRippleEffect
  | CustomCursorEffect;

/** tsParticles 背景层预设（Schema 字段名 threeJs 保留兼容） */
export type TsParticlesPreset =
  | 'particles'
  | 'stars'
  | 'snow'
  | 'firefly'
  | 'links'
  | 'bubbles'
  | 'aurora';

export interface ThreeJsEffectConfig {
  preset: TsParticlesPreset;
  enabled: boolean;
  scope?: ThemeScopeId;
  params?: Record<string, number>;
  assetRefs?: string[];
  /** 覆盖 tsparticles options JSON */
  optionsJson?: string;
}

export interface AdvancedThemeSection {
  customCss?: CustomCssBlock[];
  customHtml?: CustomHtmlBlock[];
  effects?: ThemeEffectConfig[];
  threeJs?: ThreeJsEffectConfig;
}

export interface ReaderThemePackV1 {
  schemaVersion: typeof THEME_PACK_SCHEMA_VERSION;
  id: string;
  name: string;
  author?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  scopes: {
    app: boolean;
    viewer: boolean;
  };
  app?: AppThemeSection;
  viewer?: ViewerThemeSection;
  advanced?: AdvancedThemeSection;
  assets?: ThemeAssetManifest;
}

export type ThemePresetKind = 'builtin' | 'user' | 'imported';

export interface ThemePresetRecord {
  id: string;
  name: string;
  kind: ThemePresetKind;
  scopesApp: boolean;
  scopesViewer: boolean;
  manifest: ReaderThemePackV1;
  thumbnailPath?: string | null;
  createdAt: number;
  updatedAt: number;
}

export type ThemeApplyScope = 'app' | 'viewer' | 'all';

export type EditableTokenPath = string;

/** 生成新主题包 ID */
export function createThemePackId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `theme-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** 默认空主题包（基于内置 App 主题） */
export function createDefaultThemePack(overrides?: Partial<Pick<ReaderThemePackV1, 'name' | 'scopes'>>): ReaderThemePackV1 {
  const now = new Date().toISOString();
  const id = createThemePackId();
  return {
    schemaVersion: THEME_PACK_SCHEMA_VERSION,
    id,
    name: overrides?.name ?? '未命名主题',
    createdAt: now,
    updatedAt: now,
    scopes: overrides?.scopes ?? { app: true, viewer: true },
    app: {
      mode: 'dual',
      tokens: { ...DEFAULT_APP_THEME, id: 'custom', name: overrides?.name ?? '未命名主题' },
    },
    viewer: {
      text: {
        paletteId: 0,
      },
    },
  };
}

export function cloneThemePack(pack: ReaderThemePackV1): ReaderThemePackV1 {
  return JSON.parse(JSON.stringify(pack)) as ReaderThemePackV1;
}

export function touchThemePack(pack: ReaderThemePackV1): ReaderThemePackV1 {
  return { ...pack, updatedAt: new Date().toISOString() };
}
