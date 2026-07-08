/**
 * 阅读器 UI 配置合并与规范化（本地存储、Web API、Legado 导入共用入口）
 */

import type { ViewerChromeLayout } from '@/components/viewer/viewer-chrome';
import { DEFAULT_CLICK_ACTIONS } from '@/lib/media/text/reader-click-actions';
import { DEFAULT_CLICK_REGION } from '@/lib/media/text/reader-click-region';
import { normalizeTextViewerChapterTitleStyle } from '@/lib/media/text/reader-chapter-title-style';
import { normalizeFontWeight, normalizeReaderFontPreset } from '@/lib/media/text/reader-font';
import { normalizeTextViewerPageTipFooterMode } from '@/lib/media/text/reader-page-tip';
import {
  defaultTextViewerPageTipsConfig,
  defaultTextViewerUiConfig,
  normalizeAutoPageProgressEdge,
  normalizeAutoPageStyle,
  normalizeAutoReadSpeed,
  normalizeBrightnessViewPosition,
  normalizeClickImgWay,
  normalizeCustomPageKeys,
  normalizeKeepScreenOn,
  normalizeProgressBarBehavior,
  normalizeReadBrightness,
  normalizeScreenOrientation,
  normalizeSimulationDragZonePercent,
  normalizeTextMenuVisibleItems,
  normalizeTextViewerLayoutEngine,
  normalizeTextViewerTextSelectDismissScope,
  normalizeTtsSpeechRate,
  normalizeTtsTimerMinutes,
  type TextViewerUiConfig,
} from '@/lib/media/text/reader-ui-config';
import { normalizeReaderThemeId } from '@/lib/media/text/reader-theme-classes';
import {
  normalizeReaderBgAlpha,
  normalizeReaderBgType,
} from '@/lib/media/text/reader-background';
import { migrateReaderImageStyle } from '@/lib/js-engine/legado/legado-image-options';
import { normalizeTextViewerPageAnim } from '@/lib/media/text/text-viewer-page-anim';
import { normalizeViewerChromeLayout } from '@/lib/viewer/viewer-chrome-layout';

export type TextViewerUiConfigPatch = Partial<Omit<TextViewerUiConfig, 'contentInset' | 'spacing' | 'pageTips'>> & {
  middleLeft?: number;
  middleRight?: number;
  layoutEngine?: string;
  readBarStyleFollowPage?: boolean;
  spacing?: Partial<TextViewerUiConfig['spacing']>;
  contentInset?: Partial<TextViewerUiConfig['contentInset']> & {
    middleLeft?: number;
    middleRight?: number;
  };
  pageTips?: Partial<TextViewerUiConfig['pageTips']>;
};

export interface MergeTextViewerUiConfigOptions {
  /** 未配置 viewerChromeLayout 时的回退（通常为应用设置） */
  fallbackViewerChromeLayout?: ViewerChromeLayout;
}

/** 合并持久化边距；兼容旧版 middleLeft + middleRight */
export function mergeContentInset(
  prev: TextViewerUiConfig['contentInset'],
  saved: Partial<TextViewerUiConfig['contentInset']> & {
    middleLeft?: number;
    middleRight?: number;
  },
): TextViewerUiConfig['contentInset'] {
  let center = saved.center;
  if (center == null && (saved.middleLeft != null || saved.middleRight != null)) {
    center = (saved.middleLeft ?? 0) + (saved.middleRight ?? 0);
  }
  return {
    left: saved.left ?? prev.left,
    right: saved.right ?? prev.right,
    center: center ?? prev.center,
    top: saved.top ?? prev.top,
    bottom: saved.bottom ?? prev.bottom,
  };
}

/** 将旧版「阅读进度状态栏」显示策略迁移到页脚信息条 */
function migratePageTipsFromStatusBar(
  tips: TextViewerUiConfig['pageTips'],
  statusBarStyle: TextViewerUiConfig['statusBarDisplayStyle'] | undefined,
): TextViewerUiConfig['pageTips'] {
  if (!statusBarStyle || statusBarStyle === 'follow') {
    if (tips.footerMode !== 'never') return tips;
    return {
      ...tips,
      footerMode: 'follow',
      footerLeft: tips.footerLeft === 'none' ? 'chapterTitle' : tips.footerLeft,
      footerMiddle: tips.footerMiddle === 'none' ? 'chapterWordCount' : tips.footerMiddle,
      footerRight:
        tips.footerRight === 'none' || tips.footerRight === 'pageAndTotal'
          ? 'chapterProgressAndBook'
          : tips.footerRight,
    };
  }
  if (statusBarStyle === 'always') {
    if (tips.footerMode === 'always') return tips;
    return {
      ...tips,
      footerMode: 'always',
      footerLeft: tips.footerLeft === 'none' ? 'chapterTitle' : tips.footerLeft,
      footerMiddle: tips.footerMiddle === 'none' ? 'chapterWordCount' : tips.footerMiddle,
      footerRight:
        tips.footerRight === 'none' || tips.footerRight === 'pageAndTotal'
          ? 'chapterProgressAndBook'
          : tips.footerRight,
    };
  }
  return tips;
}

function normalizeChineseConverterType(
  value: number | undefined | null,
): TextViewerUiConfig['chineseConverterType'] {
  if (value === 1 || value === 2) return value;
  return 0;
}

function normalizeDualPageMode(value: unknown): TextViewerUiConfig['dualPage'] {
  if (value === 'off' || value === 'auto' || value === 'always') return value;
  return defaultTextViewerUiConfig.dualPage;
}

function mergePageTipsConfig(
  saved?: Partial<TextViewerUiConfig['pageTips']> | null,
): TextViewerUiConfig['pageTips'] {
  const base = { ...defaultTextViewerPageTipsConfig };
  if (!saved) return base;
  const textFollow =
    saved.pageTipTextFollowPage ??
    saved.tipFollowContentColor ??
    base.pageTipTextFollowPage ??
    base.tipFollowContentColor;
  return {
    ...base,
    ...saved,
    headerMode: saved.headerMode ?? base.headerMode,
    footerMode: normalizeTextViewerPageTipFooterMode(saved.footerMode ?? base.footerMode),
    headerInset: { ...base.headerInset, ...saved.headerInset },
    footerInset: { ...base.footerInset, ...saved.footerInset },
    pageTipTextFollowPage: textFollow,
    pageTipDividerFollowPage: saved.pageTipDividerFollowPage ?? base.pageTipDividerFollowPage,
    pageTipBackgroundFollowPage:
      saved.pageTipBackgroundFollowPage ?? base.pageTipBackgroundFollowPage,
    tipFollowContentColor: textFollow,
  };
}

/** 将部分/脏数据合并为完整且规范化的 {@link TextViewerUiConfig} */
export function mergeTextViewerUiConfig(
  prev: TextViewerUiConfig = defaultTextViewerUiConfig,
  saved: TextViewerUiConfigPatch | null | undefined,
  options: MergeTextViewerUiConfigOptions = {},
): TextViewerUiConfig {
  if (!saved || typeof saved !== 'object') return { ...prev };

  return {
    ...prev,
    ...saved,
    spacing: { ...prev.spacing, ...saved.spacing },
    contentInset: mergeContentInset(prev.contentInset, saved.contentInset ?? saved),
    clickActions: {
      ...DEFAULT_CLICK_ACTIONS,
      ...saved.clickActions,
    },
    clickRegion: saved.clickRegion
      ? {
          xSplits: [
            saved.clickRegion.xSplits?.[0] ?? DEFAULT_CLICK_REGION.xSplits[0],
            saved.clickRegion.xSplits?.[1] ?? DEFAULT_CLICK_REGION.xSplits[1],
          ] as [number, number],
          ySplits: [
            saved.clickRegion.ySplits?.[0] ?? DEFAULT_CLICK_REGION.ySplits[0],
            saved.clickRegion.ySplits?.[1] ?? DEFAULT_CLICK_REGION.ySplits[1],
          ] as [number, number],
        }
      : prev.clickRegion,
    imageStyle: migrateReaderImageStyle(saved.imageStyle ?? prev.imageStyle),
    pageAnim: normalizeTextViewerPageAnim(saved.pageAnim as string | undefined ?? prev.pageAnim),
    simulationDragZonePercent: normalizeSimulationDragZonePercent(
      saved.simulationDragZonePercent ?? prev.simulationDragZonePercent,
    ),
    dualPage: normalizeDualPageMode(saved.dualPage ?? prev.dualPage),
    layoutEngine: normalizeTextViewerLayoutEngine(
      saved.layoutEngine ?? prev.layoutEngine,
    ),
    viewerChromeLayout: normalizeViewerChromeLayout(
      saved.viewerChromeLayout
        ?? options.fallbackViewerChromeLayout
        ?? prev.viewerChromeLayout,
    ),
    theme: normalizeReaderThemeId(saved.theme ?? prev.theme),
    autoReadSpeed: normalizeAutoReadSpeed(saved.autoReadSpeed ?? prev.autoReadSpeed),
    autoPageStyle: normalizeAutoPageStyle(saved.autoPageStyle as string | undefined ?? prev.autoPageStyle),
    autoPageProgressEdge: normalizeAutoPageProgressEdge(
      saved.autoPageProgressEdge as string | undefined ?? prev.autoPageProgressEdge,
    ),
    font: normalizeReaderFontPreset(saved.font ?? prev.font),
    fontWeight: normalizeFontWeight(saved.fontWeight, prev.fontWeight),
    customFontPath: saved.customFontPath ?? prev.customFontPath,
    chapterTitleStyle: normalizeTextViewerChapterTitleStyle(
      saved.chapterTitleStyle ?? prev.chapterTitleStyle,
    ),
    chapterTitleSize: saved.chapterTitleSize ?? prev.chapterTitleSize,
    chapterTitleTopSpacing: saved.chapterTitleTopSpacing ?? prev.chapterTitleTopSpacing,
    chapterTitleBottomSpacing:
      saved.chapterTitleBottomSpacing ?? prev.chapterTitleBottomSpacing,
    chapterTitleFontWeight: normalizeFontWeight(
      saved.chapterTitleFontWeight,
      prev.chapterTitleFontWeight,
    ),
    paragraphIndentChars:
      saved.paragraphIndentChars ?? prev.paragraphIndentChars ?? defaultTextViewerUiConfig.paragraphIndentChars,
    textSelectDismissScope: normalizeTextViewerTextSelectDismissScope(
      saved.textSelectDismissScope ?? prev.textSelectDismissScope,
    ),
    ttsSpeechRate: normalizeTtsSpeechRate(
      saved.ttsSpeechRate ?? saved.speakSpeed ?? prev.ttsSpeechRate,
    ),
    speakSpeed: normalizeTtsSpeechRate(
      saved.speakSpeed ?? saved.ttsSpeechRate ?? prev.speakSpeed,
    ),
    ttsFollowSys: saved.ttsFollowSys ?? prev.ttsFollowSys ?? true,
    ttsTimer: normalizeTtsTimerMinutes(saved.ttsTimer ?? prev.ttsTimer),
    readAloudByPage: saved.readAloudByPage ?? prev.readAloudByPage ?? false,
    mediaButtonPerNext: saved.mediaButtonPerNext ?? prev.mediaButtonPerNext ?? false,
    systemTtsVoiceURI: saved.systemTtsVoiceURI ?? prev.systemTtsVoiceURI ?? '',
    systemTtsLang: saved.systemTtsLang ?? prev.systemTtsLang ?? 'zh-CN',
    readAloudFloatingUi: saved.readAloudFloatingUi ?? prev.readAloudFloatingUi ?? false,
    contentSelectSpeakMod:
      saved.contentSelectSpeakMod === 1 ? 1 : (prev.contentSelectSpeakMod ?? 0),
    volumeKeyControlAloud: saved.volumeKeyControlAloud ?? prev.volumeKeyControlAloud ?? true,
    streamReadAloudAudio: saved.streamReadAloudAudio ?? prev.streamReadAloudAudio ?? false,
    readAloudResumeOnFocus:
      saved.readAloudResumeOnFocus ?? prev.readAloudResumeOnFocus ?? false,
    readTopBarStyleFollowPage:
      saved.readTopBarStyleFollowPage
      ?? saved.readBarStyleFollowPage
      ?? prev.readTopBarStyleFollowPage
      ?? false,
    readBottomBarStyleFollowPage:
      saved.readBottomBarStyleFollowPage
      ?? saved.readBarStyleFollowPage
      ?? prev.readBottomBarStyleFollowPage
      ?? false,
    brightnessViewPosition: normalizeBrightnessViewPosition(
      saved.brightnessViewPosition ?? prev.brightnessViewPosition,
    ),
    brightnessViewStyleFollowPage:
      saved.brightnessViewStyleFollowPage ?? prev.brightnessViewStyleFollowPage ?? true,
    readAloudBarStyleFollowPage:
      saved.readAloudBarStyleFollowPage ?? prev.readAloudBarStyleFollowPage ?? false,
    progressBarBehavior: normalizeProgressBarBehavior(
      saved.progressBarBehavior ?? prev.progressBarBehavior,
    ),
    clickImgWay: normalizeClickImgWay(saved.clickImgWay ?? prev.clickImgWay),
    screenOrientation: normalizeScreenOrientation(saved.screenOrientation ?? prev.screenOrientation),
    keepScreenOn: normalizeKeepScreenOn(saved.keepScreenOn ?? prev.keepScreenOn),
    readBrightness: normalizeReadBrightness(saved.readBrightness ?? prev.readBrightness),
    customPageKeys: normalizeCustomPageKeys(saved.customPageKeys ?? prev.customPageKeys),
    textMenuVisibleItems: normalizeTextMenuVisibleItems(
      saved.textMenuVisibleItems ?? prev.textMenuVisibleItems,
    ),
    textMenuHiddenProcessTextItems: Array.isArray(saved.textMenuHiddenProcessTextItems)
      ? saved.textMenuHiddenProcessTextItems.filter((k) => typeof k === 'string')
      : prev.textMenuHiddenProcessTextItems ?? [],
    chineseConverterType: normalizeChineseConverterType(
      saved.chineseConverterType ?? prev.chineseConverterType,
    ),
    selectText: saved.selectText ?? prev.selectText ?? true,
    expandTextMenu: saved.expandTextMenu ?? prev.expandTextMenu ?? false,
    adaptSpecialStyle: saved.adaptSpecialStyle ?? prev.adaptSpecialStyle ?? true,
    removeDuplicateTitle: saved.removeDuplicateTitle ?? prev.removeDuplicateTitle ?? true,
    textFullJustify: saved.textFullJustify ?? prev.textFullJustify ?? true,
    textBottomJustify: saved.textBottomJustify ?? prev.textBottomJustify ?? true,
    useZhLayout: saved.useZhLayout ?? prev.useZhLayout ?? false,
    paddingDisplayCutouts: saved.paddingDisplayCutouts ?? prev.paddingDisplayCutouts ?? false,
    showReadTitleAddition: saved.showReadTitleAddition ?? prev.showReadTitleAddition ?? true,
    showBrightnessView: saved.showBrightnessView ?? prev.showBrightnessView ?? true,
    mouseWheelPage: saved.mouseWheelPage ?? prev.mouseWheelPage ?? true,
    volumeKeyTurnPage: saved.volumeKeyTurnPage ?? prev.volumeKeyTurnPage ?? true,
    volumeKeyTurnPageOnAloud:
      saved.volumeKeyTurnPageOnAloud ?? prev.volumeKeyTurnPageOnAloud ?? false,
    disableScrollClickAnimation:
      saved.disableScrollClickAnimation ?? prev.disableScrollClickAnimation ?? false,
    keyPageOnLongPress: saved.keyPageOnLongPress ?? prev.keyPageOnLongPress ?? false,
    brightnessAuto: saved.brightnessAuto ?? prev.brightnessAuto ?? true,
    autoChangeSource: saved.autoChangeSource ?? prev.autoChangeSource ?? true,
    disableReturnKey: saved.disableReturnKey ?? prev.disableReturnKey ?? false,
    pageTips: migratePageTipsFromStatusBar(
      mergePageTipsConfig(saved.pageTips),
      saved.statusBarDisplayStyle,
    ),
    bgType: normalizeReaderBgType(saved.bgType ?? prev.bgType),
    bgTypeNight: normalizeReaderBgType(saved.bgTypeNight ?? prev.bgTypeNight),
    bgStr: saved.bgStr ?? prev.bgStr,
    bgStrNight: saved.bgStrNight ?? prev.bgStrNight,
    bgAlpha: normalizeReaderBgAlpha(saved.bgAlpha ?? prev.bgAlpha),
  };
}
