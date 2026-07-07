/**
 * Reader 阅读器 UI 配置与 Legado readConfig.json / config.xml 互转
 */

import type { ReaderClickActionId, ReaderClickZone } from '@/lib/media/text/reader-click-actions';
import { READER_CLICK_ZONES } from '@/lib/media/text/reader-click-actions';
import {
  legadoPageAnimToTextViewer,
  textViewerPageAnimToLegado,
} from '@/lib/book/legado-page-anim';
import { parseLegadoSharedPrefsXml } from '@/lib/media/text/legado-prefs-xml';
import {
  mergeTextViewerUiConfig,
  type TextViewerUiConfigPatch,
} from '@/lib/media/text/merge-text-viewer-ui-config';
import type { ReaderPageTipType } from '@/lib/media/text/reader-page-tip';
import {
  defaultTextViewerUiConfig,
  TEXT_VIEWER_TEXT_MENU_ITEM_ORDER,
  type TextViewerDualPageMode,
  type TextViewerTextMenuItemId,
  type TextViewerUiConfig,
} from '@/lib/media/text/reader-ui-config';
import {
  normalizeReaderBgAlpha,
  normalizeReaderBgType,
  readerBgStrAfterRestore,
  readerBgStrForBackup,
} from '@/lib/media/text/reader-background';
import { normalizeReaderThemeId } from '@/lib/media/text/reader-theme-classes';

export const READER_LEGADO_CONFIG_BUNDLE_VERSION = 1;

export interface LegadoReadStyleConfig {
  name?: string;
  textSize?: number;
  textBold?: number;
  titleBold?: number;
  letterSpacing?: number;
  lineSpacingExtra?: number;
  paragraphSpacing?: number;
  titleMode?: number;
  titleSize?: number;
  titleTopSpacing?: number;
  titleBottomSpacing?: number;
  paragraphIndent?: string;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  pageAnim?: number;
  tipHeaderLeft?: number;
  tipHeaderMiddle?: number;
  tipHeaderRight?: number;
  tipFooterLeft?: number;
  tipFooterMiddle?: number;
  tipFooterRight?: number;
  headerMode?: number;
  footerMode?: number;
  headerFontSize?: number;
  footerFontSize?: number;
  headerPaddingLeft?: number;
  headerPaddingRight?: number;
  headerPaddingTop?: number;
  headerPaddingBottom?: number;
  footerPaddingLeft?: number;
  footerPaddingRight?: number;
  footerPaddingTop?: number;
  footerPaddingBottom?: number;
  showHeaderLine?: boolean;
  showFooterLine?: boolean;
  tipColor?: number;
  bgStr?: string;
  bgStrNight?: string;
  bgStrEInk?: string;
  bgAlpha?: number;
  bgType?: number;
  bgTypeNight?: number;
  bgTypeEInk?: number;
}

export type LegadoReaderPrefs = Record<string, string | number | boolean>;

export interface ReaderLegadoConfigBundle {
  version: typeof READER_LEGADO_CONFIG_BUNDLE_VERSION;
  readerUi: TextViewerUiConfig;
  legado?: {
    readStyleSelect?: number;
    readConfig?: LegadoReadStyleConfig[];
    shareReadConfig?: LegadoReadStyleConfig;
    prefs?: LegadoReaderPrefs;
  };
}

const LEGADO_CLICK_ZONE_PREF_KEYS: Record<ReaderClickZone, string> = {
  tl: 'clickActionTopLeft',
  tc: 'clickActionTopCenter',
  tr: 'clickActionTopRight',
  ml: 'clickActionMiddleLeft',
  mc: 'clickActionMiddleCenter',
  mr: 'clickActionMiddleRight',
  bl: 'clickActionBottomLeft',
  bc: 'clickActionBottomCenter',
  br: 'clickActionBottomRight',
};

const LEGADO_TIP_INT_TO_READER: Record<number, ReaderPageTipType> = {
  0: 'none',
  1: 'chapterTitle',
  2: 'time',
  3: 'battery',
  4: 'page',
  5: 'totalProgress',
  6: 'pageAndTotal',
  7: 'bookName',
  8: 'timeBattery',
  9: 'timeBatteryPercentage',
  10: 'batteryPercentage',
  11: 'totalProgress1',
  12: 'battery',
  13: 'timeBatteryIconOnly',
};

const READER_TIP_TO_LEGADO_INT: Partial<Record<ReaderPageTipType, number>> = {
  none: 0,
  chapterTitle: 1,
  time: 2,
  battery: 3,
  page: 4,
  totalProgress: 5,
  pageAndTotal: 6,
  bookName: 7,
  timeBattery: 8,
  timeBatteryPercentage: 9,
  batteryPercentage: 10,
  totalProgress1: 11,
  timeBatteryIconOnly: 13,
  chapterWordCount: 0,
  chapterProgress: 5,
  chapterProgressAndBook: 6,
};

function legadoTipToReader(value: number | undefined | null): ReaderPageTipType {
  if (value == null) return 'none';
  return LEGADO_TIP_INT_TO_READER[value] ?? 'none';
}

function readerTipToLegado(value: ReaderPageTipType): number {
  return READER_TIP_TO_LEGADO_INT[value] ?? 0;
}

function legadoClickActionToReader(value: number | undefined | null): ReaderClickActionId {
  switch (value) {
    case -1:
      return 'none';
    case 0:
      return 'menu';
    case 1:
      return 'nextPage';
    case 2:
      return 'prevPage';
    case 3:
      return 'nextChapter';
    case 4:
      return 'prevChapter';
    default:
      return 'none';
  }
}

function readerClickActionToLegado(value: ReaderClickActionId): number {
  switch (value) {
    case 'menu':
      return 0;
    case 'nextPage':
      return 1;
    case 'prevPage':
      return 2;
    case 'nextChapter':
      return 3;
    case 'prevChapter':
      return 4;
    case 'none':
    default:
      return -1;
  }
}

function legadoTitleModeToStyle(mode: number | undefined | null): TextViewerUiConfig['chapterTitleStyle'] {
  if (mode === 0) return 'left';
  if (mode === 2) return 'none';
  return 'center';
}

function readerTitleStyleToLegado(style: TextViewerUiConfig['chapterTitleStyle']): number {
  if (style === 'left' || style === 'right') return 0;
  if (style === 'none') return 2;
  return 1;
}

function countParagraphIndentChars(indent: string | undefined | null): number | undefined {
  if (!indent) return undefined;
  const fullWidth = (indent.match(/　/g) ?? []).length;
  if (fullWidth > 0) return fullWidth;
  const half = indent.trim().length;
  return half > 0 ? Math.ceil(half / 2) : undefined;
}

function legadoDualPageFromPrefs(raw: unknown): TextViewerDualPageMode | undefined {
  const value = raw == null ? '' : String(raw);
  if (value === '0') return 'off';
  if (value === '1') return 'always';
  if (value === '2' || value === '3' || value === '') return 'auto';
  return undefined;
}

function readerDualPageToLegado(mode: TextViewerDualPageMode): string {
  if (mode === 'off') return '0';
  if (mode === 'always') return '1';
  return '2';
}

function legadoLineSpacingToReaderRem(lineSpacingExtra: number, fontSize: number): number {
  if (!Number.isFinite(lineSpacingExtra) || !Number.isFinite(fontSize) || fontSize <= 0) {
    return defaultTextViewerUiConfig.spacing.line;
  }
  return Math.max(0, Math.round((lineSpacingExtra / fontSize) * 10) / 10);
}

function readerLineSpacingToLegado(lineRem: number, fontSize: number): number {
  return Math.max(0, Math.round(lineRem * fontSize));
}

function prefBool(prefs: LegadoReaderPrefs, key: string): boolean | undefined {
  const v = prefs[key];
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
}

function prefInt(prefs: LegadoReaderPrefs, key: string): number | undefined {
  const v = prefs[key];
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return undefined;
}

function prefString(prefs: LegadoReaderPrefs, key: string): string | undefined {
  const v = prefs[key];
  return typeof v === 'string' ? v : v != null ? String(v) : undefined;
}

function hiddenMenuItemsFromLegadoPrefs(
  prefs: LegadoReaderPrefs,
): TextViewerTextMenuItemId[] | undefined {
  const hiddenStr = prefString(prefs, 'hiddenTextMenuItems');
  if (!hiddenStr?.trim()) return undefined;
  const hiddenIds = new Set(hiddenStr.split(',').map((s) => s.trim()).filter(Boolean));
  if (hiddenIds.size === 0) return undefined;
  const visible = TEXT_VIEWER_TEXT_MENU_ITEM_ORDER.filter((id) => !hiddenIds.has(id));
  return visible.length > 0 ? [...visible] : [];
}

export function legadoReadStyleToPatch(
  style: LegadoReadStyleConfig,
  styleIndex?: number,
): TextViewerUiConfigPatch {
  const patch: TextViewerUiConfigPatch = {};
  if (styleIndex != null) patch.theme = normalizeReaderThemeId(styleIndex);
  if (style.textSize != null) patch.fontSize = style.textSize;
  if (style.textBold != null) {
    patch.fontWeight = style.textBold >= 100 ? style.textBold : style.textBold === 1 ? 700 : 400;
  }
  if (style.titleBold != null && style.titleBold >= 100) {
    patch.chapterTitleFontWeight = style.titleBold;
  }
  if (style.letterSpacing != null) {
    patch.spacing = {
      paragraph: defaultTextViewerUiConfig.spacing.paragraph,
      line: defaultTextViewerUiConfig.spacing.line,
      letter: style.letterSpacing,
    };
  }
  const fontSize = style.textSize ?? defaultTextViewerUiConfig.fontSize;
  if (style.lineSpacingExtra != null) {
    patch.spacing = {
      paragraph: patch.spacing?.paragraph ?? defaultTextViewerUiConfig.spacing.paragraph,
      line: legadoLineSpacingToReaderRem(style.lineSpacingExtra, fontSize),
      letter: patch.spacing?.letter ?? defaultTextViewerUiConfig.spacing.letter,
    };
  }
  if (style.paragraphSpacing != null) {
    patch.spacing = {
      paragraph: Math.max(0, style.paragraphSpacing),
      line: patch.spacing?.line ?? defaultTextViewerUiConfig.spacing.line,
      letter: patch.spacing?.letter ?? defaultTextViewerUiConfig.spacing.letter,
    };
  }
  if (style.titleMode != null) patch.chapterTitleStyle = legadoTitleModeToStyle(style.titleMode);
  if (style.titleSize != null) patch.chapterTitleSize = style.titleSize;
  if (style.titleTopSpacing != null) patch.chapterTitleTopSpacing = style.titleTopSpacing;
  if (style.titleBottomSpacing != null) patch.chapterTitleBottomSpacing = style.titleBottomSpacing;
  const indentChars = countParagraphIndentChars(style.paragraphIndent);
  if (indentChars != null) patch.paragraphIndentChars = indentChars;
  if (
    style.paddingLeft != null
    || style.paddingRight != null
    || style.paddingTop != null
    || style.paddingBottom != null
  ) {
    patch.contentInset = {
      ...(style.paddingLeft != null ? { left: style.paddingLeft } : {}),
      ...(style.paddingRight != null ? { right: style.paddingRight } : {}),
      ...(style.paddingTop != null ? { top: style.paddingTop } : {}),
      ...(style.paddingBottom != null ? { bottom: style.paddingBottom } : {}),
    };
  }
  const pageAnim = legadoPageAnimToTextViewer(style.pageAnim);
  if (pageAnim) patch.pageAnim = pageAnim;

  patch.pageTips = {
    ...defaultTextViewerUiConfig.pageTips,
    headerMode: style.headerMode === 1 ? 'always' : style.headerMode === 2 ? 'never' : 'follow',
    footerMode: style.footerMode === 1 ? 'never' : 'follow',
    headerLeft: legadoTipToReader(style.tipHeaderLeft),
    headerMiddle: legadoTipToReader(style.tipHeaderMiddle),
    headerRight: legadoTipToReader(style.tipHeaderRight),
    footerLeft: legadoTipToReader(style.tipFooterLeft),
    footerMiddle: legadoTipToReader(style.tipFooterMiddle),
    footerRight: legadoTipToReader(style.tipFooterRight),
    headerFontSize: style.headerFontSize ?? defaultTextViewerUiConfig.pageTips.headerFontSize,
    footerFontSize: style.footerFontSize ?? defaultTextViewerUiConfig.pageTips.footerFontSize,
    headerInset: {
      left: style.headerPaddingLeft ?? 0,
      right: style.headerPaddingRight ?? 0,
      top: style.headerPaddingTop ?? 0,
      bottom: style.headerPaddingBottom ?? 0,
    },
    footerInset: {
      left: style.footerPaddingLeft ?? 0,
      right: style.footerPaddingRight ?? 0,
      top: style.footerPaddingTop ?? 0,
      bottom: style.footerPaddingBottom ?? 0,
    },
    showHeaderLine: style.showHeaderLine ?? defaultTextViewerUiConfig.pageTips.showHeaderLine,
    showFooterLine: style.showFooterLine ?? defaultTextViewerUiConfig.pageTips.showFooterLine,
    tipFollowContentColor: style.tipColor == null || style.tipColor === 0,
    customTipColor: '',
  };

  if (style.bgType != null) patch.bgType = normalizeReaderBgType(style.bgType);
  if (style.bgTypeNight != null) patch.bgTypeNight = normalizeReaderBgType(style.bgTypeNight);
  if (style.bgAlpha != null) patch.bgAlpha = normalizeReaderBgAlpha(style.bgAlpha);
  if (style.bgStr != null) {
    patch.bgStr = readerBgStrAfterRestore(style.bgStr, normalizeReaderBgType(style.bgType));
  }
  if (style.bgStrNight != null) {
    patch.bgStrNight = readerBgStrAfterRestore(
      style.bgStrNight,
      normalizeReaderBgType(style.bgTypeNight),
    );
  }

  return patch;
}

export function legadoPrefsToPatch(prefs: LegadoReaderPrefs): TextViewerUiConfigPatch {
  const patch: TextViewerUiConfigPatch = {};
  const readStyleSelect = prefInt(prefs, 'readStyleSelect');
  if (readStyleSelect != null) patch.theme = normalizeReaderThemeId(readStyleSelect);

  const clickActions = { ...defaultTextViewerUiConfig.clickActions };
  for (const zone of READER_CLICK_ZONES) {
    clickActions[zone] = legadoClickActionToReader(prefInt(prefs, LEGADO_CLICK_ZONE_PREF_KEYS[zone]));
  }
  patch.clickActions = clickActions;

  const dual = legadoDualPageFromPrefs(prefs.doubleHorizontalPage);
  if (dual) patch.dualPage = dual;

  const selectText = prefBool(prefs, 'selectText');
  if (selectText != null) patch.selectText = selectText;
  const expandTextMenu = prefBool(prefs, 'expandTextMenu');
  if (expandTextMenu != null) patch.expandTextMenu = expandTextMenu;

  const dismissScope = prefString(prefs, 'textSelectDismissScope');
  if (dismissScope === 'outsideHandle' || dismissScope === 'outsideHandleAndSelection') {
    patch.textSelectDismissScope = dismissScope;
  }

  const menuVisible = hiddenMenuItemsFromLegadoPrefs(prefs);
  if (menuVisible) patch.textMenuVisibleItems = menuVisible;

  const hiddenProcess = prefString(prefs, 'hiddenProcessTextItems');
  if (hiddenProcess != null) {
    patch.textMenuHiddenProcessTextItems = hiddenProcess.split(',').map((s) => s.trim()).filter(Boolean);
  }

  const assignBool = <K extends keyof TextViewerUiConfigPatch>(key: K, prefKey: string) => {
    const v = prefBool(prefs, prefKey);
    if (v != null) patch[key] = v as TextViewerUiConfigPatch[K];
  };
  assignBool('textFullJustify', 'textFullJustify');
  assignBool('textBottomJustify', 'textBottomJustify');
  assignBool('adaptSpecialStyle', 'adaptSpecialStyle');
  assignBool('useZhLayout', 'useZhLayout');
  assignBool('disableScrollClickAnimation', 'disableClickScroll');
  assignBool('showBrightnessView', 'showBrightnessView');
  assignBool('readAloudByPage', 'readAloudByPage');
  assignBool('ttsFollowSys', 'ttsFollowSys');
  assignBool('readAloudFloatingUi', 'readAloudFloatingUi');
  assignBool('streamReadAloudAudio', 'streamReadAloudAudio');
  assignBool('mouseWheelPage', 'mouseWheelPage');
  assignBool('volumeKeyTurnPage', 'volumeKeyPage');
  assignBool('volumeKeyTurnPageOnAloud', 'volumeKeyPageOnPlay');
  assignBool('paddingDisplayCutouts', 'paddingDisplayCutouts');
  assignBool('showReadTitleAddition', 'showReadTitleAddition');
  assignBool('autoChangeSource', 'autoChangeSource');
  assignBool('keyPageOnLongPress', 'keyPageOnLongPress');

  const readBarFollow = prefBool(prefs, 'readBarStyleFollowPage');
  if (readBarFollow != null) {
    patch.readTopBarStyleFollowPage = readBarFollow;
    patch.readBottomBarStyleFollowPage = readBarFollow;
  }

  const chinese = prefInt(prefs, 'chineseConverterType');
  if (chinese != null) patch.chineseConverterType = chinese as 0 | 1 | 2;
  const autoReadSpeed = prefInt(prefs, 'autoReadSpeed');
  if (autoReadSpeed != null) patch.autoReadSpeed = autoReadSpeed;
  const ttsSpeechRate = prefInt(prefs, 'ttsSpeechRate');
  if (ttsSpeechRate != null) patch.ttsSpeechRate = ttsSpeechRate;
  const ttsTimer = prefInt(prefs, 'ttsTimer');
  if (ttsTimer != null) patch.ttsTimer = ttsTimer;
  const contentSpeak = prefInt(prefs, 'contentReadAloudMod');
  if (contentSpeak != null) patch.contentSelectSpeakMod = contentSpeak === 1 ? 1 : 0;
  const clickImgWay = prefInt(prefs, 'clickImgWay');
  if (clickImgWay != null) patch.clickImgWay = clickImgWay as TextViewerUiConfig['clickImgWay'];
  const screenOrientation = prefInt(prefs, 'screenOrientation');
  if (screenOrientation != null) {
    patch.screenOrientation = screenOrientation as TextViewerUiConfig['screenOrientation'];
  }
  const keepLight = prefInt(prefs, 'keep_light');
  if (keepLight != null) patch.keepScreenOn = keepLight as TextViewerUiConfig['keepScreenOn'];
  const brightness = prefInt(prefs, 'brightness');
  if (brightness != null) patch.readBrightness = brightness;

  const progressBar = prefString(prefs, 'progressBarBehavior');
  if (progressBar === 'page' || progressBar === 'chapter') patch.progressBarBehavior = progressBar;

  const brightnessPos = prefBool(prefs, 'brightnessVwPos');
  if (brightnessPos != null) patch.brightnessViewPosition = brightnessPos ? 'right' : 'left';

  return patch;
}

export interface LegadoReadConfigImportInput {
  readerUiJson?: string;
  readConfigJson?: string;
  shareReadConfigJson?: string;
  configXml?: string;
  prefs?: LegadoReaderPrefs;
}

export function parseLegadoReadConfigJson(text: string): LegadoReadStyleConfig[] | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed as LegadoReadStyleConfig[];
  } catch {
    return null;
  }
}

export function parseLegadoShareReadConfigJson(text: string): LegadoReadStyleConfig | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as LegadoReadStyleConfig;
  } catch {
    return null;
  }
}

export function textViewerUiConfigFromLegadoImport(
  input: LegadoReadConfigImportInput,
  base: TextViewerUiConfig = defaultTextViewerUiConfig,
): TextViewerUiConfig {
  const patches: TextViewerUiConfigPatch[] = [];

  if (input.prefs) patches.push(legadoPrefsToPatch(input.prefs));
  if (input.configXml) patches.push(legadoPrefsToPatch(parseLegadoSharedPrefsXml(input.configXml)));

  const readConfigs = input.readConfigJson ? parseLegadoReadConfigJson(input.readConfigJson) : null;
  const prefs = {
    ...(input.configXml ? parseLegadoSharedPrefsXml(input.configXml) : {}),
    ...(input.prefs ?? {}),
  };
  const styleIndex = prefInt(prefs, 'readStyleSelect') ?? 0;
  if (readConfigs && readConfigs.length > 0) {
    const style = readConfigs[Math.min(styleIndex, readConfigs.length - 1)];
    if (style) patches.push(legadoReadStyleToPatch(style, styleIndex));
  } else if (input.shareReadConfigJson) {
    const share = parseLegadoShareReadConfigJson(input.shareReadConfigJson);
    if (share) patches.push(legadoReadStyleToPatch(share, styleIndex));
  }

  if (input.readerUiJson) {
    try {
      const parsed = JSON.parse(input.readerUiJson) as TextViewerUiConfigPatch;
      if (parsed && typeof parsed === 'object') patches.push(parsed);
    } catch {
      /* ignore */
    }
  }

  let merged = base;
  for (const patch of patches) {
    merged = mergeTextViewerUiConfig(merged, patch);
  }
  return merged;
}

function emptyLegadoStylePreset(name: string): LegadoReadStyleConfig {
  return { name };
}

export function exportLegadoReadConfigBundle(config: TextViewerUiConfig): {
  readerUiConfigJson: string;
  readConfigJson: string;
  shareReadConfigJson: string;
  readerPrefsJson: string;
  bundleJson: string;
} {
  const styleIndex = normalizeReaderThemeId(config.theme);
  const activeStyle = readerUiToLegadoStyle(config);
  const presets: LegadoReadStyleConfig[] = Array.from({ length: 6 }, (_, i) => {
    if (i === styleIndex) return { ...activeStyle, name: activeStyle.name ?? `预设${i}` };
    return emptyLegadoStylePreset(i === 0 ? '微信读书' : `预设${i}`);
  });

  const prefs = readerUiToLegadoPrefs(config, styleIndex);
  const bundle: ReaderLegadoConfigBundle = {
    version: READER_LEGADO_CONFIG_BUNDLE_VERSION,
    readerUi: config,
    legado: { readStyleSelect: styleIndex, readConfig: presets, shareReadConfig: activeStyle, prefs },
  };

  return {
    readerUiConfigJson: JSON.stringify(config, null, 2),
    readConfigJson: JSON.stringify(presets, null, 2),
    shareReadConfigJson: JSON.stringify(activeStyle, null, 2),
    readerPrefsJson: JSON.stringify(prefs, null, 2),
    bundleJson: JSON.stringify(bundle, null, 2),
  };
}

export function readerUiToLegadoStyle(config: TextViewerUiConfig): LegadoReadStyleConfig {
  const tips = config.pageTips;
  return {
    name: 'Reader',
    textSize: config.fontSize,
    textBold: config.fontWeight,
    titleBold: config.chapterTitleFontWeight,
    letterSpacing: config.spacing.letter,
    lineSpacingExtra: readerLineSpacingToLegado(config.spacing.line, config.fontSize),
    paragraphSpacing: Math.round(config.spacing.paragraph),
    titleMode: readerTitleStyleToLegado(config.chapterTitleStyle),
    titleSize: config.chapterTitleSize,
    titleTopSpacing: config.chapterTitleTopSpacing,
    titleBottomSpacing: config.chapterTitleBottomSpacing,
    paragraphIndent: '　'.repeat(Math.max(0, config.paragraphIndentChars ?? 0)),
    paddingLeft: config.contentInset.left,
    paddingRight: config.contentInset.right,
    paddingTop: config.contentInset.top,
    paddingBottom: config.contentInset.bottom,
    pageAnim: textViewerPageAnimToLegado(config.pageAnim),
    tipHeaderLeft: readerTipToLegado(tips.headerLeft),
    tipHeaderMiddle: readerTipToLegado(tips.headerMiddle),
    tipHeaderRight: readerTipToLegado(tips.headerRight),
    tipFooterLeft: readerTipToLegado(tips.footerLeft),
    tipFooterMiddle: readerTipToLegado(tips.footerMiddle),
    tipFooterRight: readerTipToLegado(tips.footerRight),
    headerMode: tips.headerMode === 'always' ? 1 : tips.headerMode === 'never' ? 2 : 0,
    footerMode: tips.footerMode === 'never' ? 1 : 0,
    headerFontSize: tips.headerFontSize,
    footerFontSize: tips.footerFontSize,
    headerPaddingLeft: tips.headerInset.left,
    headerPaddingRight: tips.headerInset.right,
    headerPaddingTop: tips.headerInset.top,
    headerPaddingBottom: tips.headerInset.bottom,
    footerPaddingLeft: tips.footerInset.left,
    footerPaddingRight: tips.footerInset.right,
    footerPaddingTop: tips.footerInset.top,
    footerPaddingBottom: tips.footerInset.bottom,
    showHeaderLine: tips.showHeaderLine,
    showFooterLine: tips.showFooterLine,
    tipColor: tips.tipFollowContentColor ? 0 : -1,
    bgType: config.bgType ?? 0,
    bgTypeNight: config.bgTypeNight ?? 0,
    bgAlpha: normalizeReaderBgAlpha(config.bgAlpha),
    bgStr: readerBgStrForBackup(config.bgStr ?? '#EEEEEE', normalizeReaderBgType(config.bgType)),
    bgStrNight: readerBgStrForBackup(
      config.bgStrNight ?? '#000000',
      normalizeReaderBgType(config.bgTypeNight),
    ),
  };
}

export function readerUiToLegadoPrefs(
  config: TextViewerUiConfig,
  readStyleSelect: number,
): LegadoReaderPrefs {
  const prefs: LegadoReaderPrefs = {
    readStyleSelect,
    selectText: config.selectText !== false,
    expandTextMenu: config.expandTextMenu === true,
    textSelectDismissScope: config.textSelectDismissScope ?? 'outsideHandleAndSelection',
    doubleHorizontalPage: readerDualPageToLegado(config.dualPage),
    chineseConverterType: config.chineseConverterType ?? 0,
    textFullJustify: config.textFullJustify !== false,
    textBottomJustify: config.textBottomJustify !== false,
    adaptSpecialStyle: config.adaptSpecialStyle !== false,
    autoReadSpeed: config.autoReadSpeed ?? 10,
    disableClickScroll: config.disableScrollClickAnimation === true,
    showBrightnessView: config.showBrightnessView !== false,
    readAloudByPage: config.readAloudByPage === true,
    ttsSpeechRate: config.ttsSpeechRate,
    ttsFollowSys: config.ttsFollowSys !== false,
    ttsTimer: config.ttsTimer ?? 0,
    readAloudFloatingUi: config.readAloudFloatingUi === true,
    contentReadAloudMod: config.contentSelectSpeakMod ?? 0,
    streamReadAloudAudio: config.streamReadAloudAudio === true,
    volumeKeyPage: config.volumeKeyTurnPage !== false,
    volumeKeyPageOnPlay: config.volumeKeyTurnPageOnAloud === true,
    mouseWheelPage: config.mouseWheelPage !== false,
    progressBarBehavior: config.progressBarBehavior ?? 'page',
    clickImgWay: config.clickImgWay ?? 0,
    screenOrientation: config.screenOrientation ?? 0,
    keep_light: config.keepScreenOn ?? 0,
    brightness: config.readBrightness ?? 100,
    paddingDisplayCutouts: config.paddingDisplayCutouts === true,
    showReadTitleAddition: config.showReadTitleAddition !== false,
    readBarStyleFollowPage: config.readTopBarStyleFollowPage === true,
    autoChangeSource: config.autoChangeSource !== false,
    useZhLayout: config.useZhLayout === true,
    keyPageOnLongPress: config.keyPageOnLongPress === true,
    brightnessVwPos: config.brightnessViewPosition === 'right',
  };

  for (const zone of READER_CLICK_ZONES) {
    prefs[LEGADO_CLICK_ZONE_PREF_KEYS[zone]] = readerClickActionToLegado(config.clickActions[zone]);
  }

  const hiddenMenu = TEXT_VIEWER_TEXT_MENU_ITEM_ORDER.filter(
    (id) => !config.textMenuVisibleItems?.includes(id),
  );
  if (hiddenMenu.length > 0) prefs.hiddenTextMenuItems = hiddenMenu.join(',');

  const hiddenProcess = config.textMenuHiddenProcessTextItems ?? [];
  if (hiddenProcess.length > 0) prefs.hiddenProcessTextItems = hiddenProcess.join(',');

  return prefs;
}

export function parseReaderLegadoConfigPayload(
  raw: unknown,
  base: TextViewerUiConfig = defaultTextViewerUiConfig,
): TextViewerUiConfig {
  if (!raw || typeof raw !== 'object') return mergeTextViewerUiConfig(base, null);

  if (Array.isArray(raw)) {
    return textViewerUiConfigFromLegadoImport({ readConfigJson: JSON.stringify(raw) }, base);
  }

  const record = raw as Record<string, unknown>;
  if (record.version === READER_LEGADO_CONFIG_BUNDLE_VERSION && record.readerUi) {
    return mergeTextViewerUiConfig(base, record.readerUi as TextViewerUiConfigPatch);
  }
  if (record.readerUi && typeof record.readerUi === 'object') {
    return mergeTextViewerUiConfig(base, record.readerUi as TextViewerUiConfigPatch);
  }

  return mergeTextViewerUiConfig(base, record as TextViewerUiConfigPatch);
}

export function buildReaderLegadoConfigBundle(config: TextViewerUiConfig): ReaderLegadoConfigBundle {
  return JSON.parse(exportLegadoReadConfigBundle(config).bundleJson) as ReaderLegadoConfigBundle;
}

export function importReaderUiConfigFromBackupEntries(
  textEntries: Record<string, string>,
  base?: TextViewerUiConfig,
): TextViewerUiConfig | null {
  const lower = new Map(Object.entries(textEntries).map(([k, v]) => [k.toLowerCase(), v]));
  const readerUiJson = lower.get('readeruiconfig.json');
  const readConfigJson = lower.get('readconfig.json');
  const shareReadConfigJson = lower.get('sharereadconfig.json');
  const readerPrefsJson = lower.get('readerprefs.json');
  const configXml = lower.get('config.xml');

  if (!readerUiJson && !readConfigJson && !shareReadConfigJson && !readerPrefsJson && !configXml) {
    return null;
  }

  let prefs: LegadoReaderPrefs | undefined;
  if (readerPrefsJson) {
    try {
      prefs = JSON.parse(readerPrefsJson) as LegadoReaderPrefs;
    } catch {
      prefs = undefined;
    }
  }

  return textViewerUiConfigFromLegadoImport(
    { readerUiJson, readConfigJson, shareReadConfigJson, configXml, prefs },
    base ?? defaultTextViewerUiConfig,
  );
}
