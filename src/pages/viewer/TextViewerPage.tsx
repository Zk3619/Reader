/**
 * 文本阅读器（BookReader）
 * 参考 legado ReadBookActivity：全屏阅读、顶部栏、正文区、目录与设置
 */

import { createSignal, Show, Index, onMount, onCleanup, createEffect, on, type Accessor } from 'solid-js';
import { MediaViewerChromeLayoutProvider } from '@/components/viewer/MediaViewerChromeLayoutProvider';
import { useMediaViewerShell } from '@/components/viewer/media-viewer-shell-context';
import { textViewerStore } from '@/stores/viewer';
import { readerThemeClasses } from '@/lib/media/text/reader-theme-classes';
import { textViewerThemeScopeAttrs, textViewerChromeFollowPageSurfaceStyle, textViewerThemeStyle } from '@/lib/theme/TextViewerTheme';
import { Button } from '@/components/ui/button';
import {
  ViewerAppDrawer,
  ViewerAppDrawerBody,
  ViewerAppDrawerContent,
  ViewerAppDrawerHeader,
} from '@/components/viewer/viewer-app-overlay';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';
import {
  mediaViewerCatalogDrawerContentClass,
  mediaViewerCatalogDrawerSide,
} from '@/lib/viewer/media-viewer-catalog-drawer';
import { ReaderTextContentSlot } from '@/components/viewer/text-viewer/reader-text-content-slot';
import { ReaderScrollPageChrome } from '@/components/viewer/text-viewer/ReaderScrollPageChrome';
import type { ReaderPageTipContext } from '@/lib/media/text/reader-page-tip';
import { ReaderPagedViewport } from '@/components/viewer/text-viewer/ReaderPagedViewport';
import {
  ReaderScrollViewport,
  type ReaderScrollNavApi,
} from '@/components/viewer/text-viewer/ReaderScrollViewport';
import type { ReaderPagedNavApi } from '@/components/viewer/text-viewer/reader-paged-nav';
import {
  isTextViewerPagedAnim,
  normalizeTextViewerPageAnim,
} from '@/lib/media/text/text-viewer-page-anim';
import { resolveBookTextViewerPageAnim } from '@/lib/book/legado-page-anim';
import { ReaderSettings } from '@/components/viewer/text-viewer/ReaderSettings';
import { ReaderBehaviorSettingsDrawer } from '@/components/viewer/text-viewer/ReaderBehaviorSettingsDrawer';
import { ReaderBrightnessControl } from '@/components/viewer/text-viewer/ReaderBrightnessControl';
import { useBackHandler } from '@/lib/navigation/use-back-handler';
import {
  applyKeepScreenOn,
  applyScreenOrientation,
  captureNativeBrightnessBeforeRead,
  clearKeepScreenOn,
  restoreBrightnessOnExit,
  syncReadBrightness,
} from '@/lib/platform/display-reader';
import { subscribeViewportGeometryChange } from '@/lib/platform/viewport-geometry';
import { ReaderCatalog } from '@/components/viewer/text-viewer/ReaderCatalog';
import { ReaderCommentsDrawer } from '@/components/viewer/text-viewer/ReaderCommentsDrawer';
import { ReaderOfflineCacheDialog } from '@/components/viewer/text-viewer/ReaderOfflineCacheDialog';
import { DictDialog } from '@/components/dict/DictDialog';
import { ReaderSearchDrawer } from '@/components/viewer/text-viewer/ReaderSearchDrawer';
import { ReaderBookmarksDrawer } from '@/components/viewer/text-viewer/ReaderBookmarksDrawer';
import { ReaderChangeSourceDialog } from '@/components/viewer/text-viewer/ReaderChangeSourceDialog';
import { updateBookToc } from '@/lib/book-source/update-toc';
import { useChapterDisplayTitles } from '@/lib/replace-rules/use-chapter-display-titles';
import { ReaderClickRegionalOverlay } from '@/components/viewer/text-viewer/ReaderClickRegionalOverlay';
import { shouldShowClickActionHint } from '@/lib/media/text/reader-click-hint-storage';
import {
  findPagedClickContainer,
  resolveRegionalClickAction,
  canStartReaderTextLongPressForChrome,
  shouldDismissChromeOverRegionalClick,
  viewerChromeBarsCollapsible,
} from '@/lib/media/viewer-regional-click';
import { shouldSuppressPagedRegionalTap } from '@/lib/media/text/reader-paged-pointer-gesture';
import {
  dismissReaderTextSelectionOnClick,
  isReaderHandleSelectMode,
  isReaderTextSelectionSurfaceActive,
  isReaderTextSelectionUiNode,
  isSelectionHandleDragActive,
  shouldSuppressReaderRegionalTap,
} from '@/lib/media/text/reader-text-selection-gesture';
import { getSharedReaderTextSelectionGesture, resetSharedReaderTextSelectionGesture, setReaderTextSelectChromeGate } from '@/lib/media/text/reader-text-selection-shared';
import { isMediaViewerInteractiveClick } from '@/lib/media/is-media-viewer-interactive-click';
import { getHttpTTS } from '@/lib/database/http-tts';
import { stopReadAloud } from '@/lib/media/text/read-aloud';
import {
  bindReadAloudSessionContext,
  unbindReadAloudSessionContext,
  prevReadAloudParagraph,
  nextReadAloudParagraph,
  isReadAloudSessionActive,
  type ReadAloudSessionContext,
} from '@/lib/media/text/read-aloud-session';
import { ReaderReadAloudDrawer } from '@/components/viewer/text-viewer/ReaderReadAloudDrawer';
import { ReaderReadAloudFullscreen } from '@/components/viewer/text-viewer/ReaderReadAloudFullscreen';
import { enterReadAloudBackground, isReadAloudShellBackground } from '@/lib/media/text/read-aloud-background';
import { getReadAloudProgress } from '@/lib/media/text/read-aloud-progress';
import { syncReadAloudProgressToViewport } from '@/lib/media/text/read-aloud-viewport-sync';
import { ReaderReadAloudMiniBar } from '@/components/viewer/text-viewer/ReaderReadAloudMiniBar';
import { ReaderTextSelectionMenu } from '@/components/viewer/text-viewer/ReaderTextSelectionMenu';
import type { ReaderTextSelectionMenuActions } from '@/components/viewer/text-viewer/ReaderTextSelectionMenu';
import { ReaderTextSelectionHandles } from '@/components/viewer/text-viewer/ReaderTextSelectionHandles';
import { resolveReaderContentRootFromSelection } from '@/lib/media/text/reader-text-selection-shared';
import { type ReaderClickActionId } from '@/lib/media/text/reader-click-actions';
import {
  addReaderBookmark,
  selectionTextFromDocument,
} from '@/lib/media/text/reader-bookmark';
import type { Bookmark, BookSource, ReplaceRule } from '@/types';
import { cn } from '@/lib/utils';
import { isMobile } from '@/lib/platform/detect';
import {
  detectFileType,
  isLocalBook,
  readLocalBookContent,
  reparseLocalTxtBook,
} from '@/lib/local-book';
import { TxtTocRulePickDialog, type TxtTocRulePickResult } from '@/components/txt-toc-rules/TxtTocRulePickDialog';
import {
  ReplaceRuleEditDialog,
  type ReplaceRuleDraft,
} from '@/components/replace-rules/ReplaceRuleEditDialog';
import * as replaceDb from '@/lib/database/replace-rules';
import { getOfflineCacheBlockedReason } from '@/lib/chapter-cache/offline-cache-actions';
import { showAppToast } from '@/components/shared/AppToasts';
import { VIEWER_SHELL_OVERLAY_EVENTS } from '@/lib/ui/overlay-cleanup';
import {
  blurAfterDrawerTriggerRefocus,
  dismissOpenKobalteTooltips,
  resetReaderAloudTooltipTrigger,
  resetReaderCatalogTooltipTrigger,
  resetReaderMenuTooltipTrigger,
  SETTINGS_DRAWER_TOOLTIP_RESUME_MS,
} from '@/utils/accessibility';
import {
  MediaViewerShell,
  MediaViewerShellMain,
  MediaViewerHeader,
  MediaViewerFooter,
} from '@/components/viewer/MediaViewerShell';
import { MediaViewerChromeSlots } from '@/components/viewer/MediaViewerChromeSlots';
import { useMediaViewerMainStageClass, useViewerChromeLayout, normalizeViewerChromeLayout } from '@/lib/viewer/viewer-chrome-layout';
import { mergeViewerChromeThemedSurfaceStyle } from '@/lib/viewer/media-viewer-chrome-overlay-appearance';
import { settingsState } from '@/stores/settings';
import { TextViewerToolbarHeader } from '@/components/viewer/text-viewer/TextViewerToolbarHeader';
import { TextViewerChapterSourceBar } from '@/components/viewer/text-viewer/TextViewerChapterSourceBar';
import { TextViewerBottomChrome } from '@/components/viewer/text-viewer/TextViewerBottomChrome';
import { TextViewerChromePageTip } from '@/components/viewer/text-viewer/TextViewerChromePageTip';
import { ReaderAutoPageOverlay } from '@/components/viewer/text-viewer/ReaderAutoPageOverlay';
import { useTextViewerAutoPager } from '@/lib/media/text/use-text-viewer-auto-pager';
import { normalizeAutoReadSpeed } from '@/lib/media/text/text-viewer-auto-pager';
import {
  normalizeBrightnessViewPosition,
  textViewerDualPageActive,
  type TextViewerDualPageMode,
} from '@/lib/media/text/reader-ui-config';

/** 区分轻点与滑动：移动超过阈值则不触发分区单击 */
const TAP_MOVE_THRESHOLD = 10;

export interface BookReaderProps {
  onClose: () => void;
  /** 点击顶栏书名时进入书籍信息页（不传则书名不可点） */
  onOpenBookInfo?: () => void;
  /** 书源：编辑 / 登录 / 设置源变量（顶栏章节书源栏） */
  onSourceEdit?: (source: BookSource) => void;
  onSourceLogin?: (source: BookSource) => void;
  onSourceVariables?: (source: BookSource) => void;
  /** 换源弹窗「书源管理」：以独立页打开书源管理 */
  onOpenSourcesManage?: () => void;
  /** 导航栈条目是否栈顶可见 */
  entryVisible?: Accessor<boolean>;
  /** 书源编辑全屏页是否打开（换源弹窗暂挂时不应被关闭） */
  sourceEditActive?: Accessor<boolean>;
}

/** 在 Shell 内挂载，供分区「菜单」动作与 Shell 顶栏显隐同步 */
function BookReaderChromeBridge(props: {
  onReady: (toggleBars: () => void) => void;
  onChromeBarsVisible?: (visible: boolean) => void;
}) {
  const shell = useMediaViewerShell();
  onMount(() => {
    props.onChromeBarsVisible?.(shell.headerVisible());
    props.onReady(() => shell.toggleBars());
  });
  createEffect(() => {
    props.onChromeBarsVisible?.(shell.headerVisible());
  });
  return null;
}

export function BookReader(props: BookReaderProps) {
  let toggleChromeBars: () => void = () => undefined;
  const chromeLayout = useViewerChromeLayout();
  const [chromeBarsVisible, setChromeBarsVisible] = createSignal(true);
  const brightnessViewPosition = () =>
    normalizeBrightnessViewPosition(textViewerStore.state.config.brightnessViewPosition);
  const brightnessChromeVisible = () => chromeBarsVisible();
  /** 视口尺寸变化时重判双页（按页模式依赖视口宽高） */
  const [dualPageLayoutProbe, setDualPageLayoutProbe] = createSignal(0);

  const [catalogOpen, setCatalogOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  /** 设置抽屉（另外的菜单）：仅窄屏底栏的「设置」打开 */
  const [readerMenuDrawerOpen, setReaderMenuDrawerOpen] = createSignal(false);
  /** 设置抽屉开/关期间暂停顶栏「设置」Tooltip（遮罩消失后 hover 会误触发） */
  const [settingsTooltipSuspended, setSettingsTooltipSuspended] = createSignal(false);
  /** 目录抽屉开/关期间暂停顶栏「目录」Tooltip */
  const [catalogTooltipSuspended, setCatalogTooltipSuspended] = createSignal(false);
  /** 朗读抽屉/全屏开/关期间暂停「朗读」Tooltip */
  const [readAloudTooltipSuspended, setReadAloudTooltipSuspended] = createSignal(false);
  const [offlineCacheDialogOpen, setOfflineCacheDialogOpen] = createSignal(false);
  const [dictOpen, setDictOpen] = createSignal(false);
  const [dictWord, setDictWord] = createSignal('');
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [searchInitialKeyword, setSearchInitialKeyword] = createSignal('');
  const [selectionReplaceOpen, setSelectionReplaceOpen] = createSignal(false);
  const [selectionReplaceDraft, setSelectionReplaceDraft] = createSignal<ReplaceRuleDraft | null>(
    null,
  );
  const [bookmarksOpen, setBookmarksOpen] = createSignal(false);
  const [contentEnterKey, setContentEnterKey] = createSignal(0);
  const [changeSourceOpen, setChangeSourceOpen] = createSignal(false);
  let restoreChangeSourceAfterEdit = false;

  createEffect(
    on(
      () => props.sourceEditActive?.(),
      (active, wasActive) => {
        if (!active && wasActive && restoreChangeSourceAfterEdit) {
          restoreChangeSourceAfterEdit = false;
          setChangeSourceOpen(true);
        }
      },
    ),
  );
  const [txtTocRuleOpen, setTxtTocRuleOpen] = createSignal(false);
  const [txtTocSample, setTxtTocSample] = createSignal('');
  const [txtTocReparsing, setTxtTocReparsing] = createSignal(false);
  const [clickRegionalOpen, setClickRegionalOpen] = createSignal(false);
  const [clickRegionalMarkHint, setClickRegionalMarkHint] = createSignal(false);
  const [readAloudActive, setReadAloudActive] = createSignal(false);
  const [readAloudDrawerOpen, setReadAloudDrawerOpen] = createSignal(false);
  const [readAloudFullscreenOpen, setReadAloudFullscreenOpen] = createSignal(false);
  const [clickActionPickerOpen, setClickActionPickerOpen] = createSignal(false);
  /** 设置抽屉：blockOutsideDismiss 保留给嵌套 Dialog（当前无） */
  const readerMenuDrawerBlockOutsideDismiss = () => false;

  let readerMenuDrawerWasOpen = false;
  const openReaderMenuDrawer = () => {
    setSettingsTooltipSuspended(true);
    resetReaderMenuTooltipTrigger();
    dismissOpenKobalteTooltips();
    setReaderMenuDrawerOpen(true);
  };
  createEffect(() => {
    const open = readerMenuDrawerOpen();
    if (open) {
      readerMenuDrawerWasOpen = true;
      setSettingsTooltipSuspended(true);
      dismissOpenKobalteTooltips();
      return;
    }
    if (!readerMenuDrawerWasOpen) return;
    readerMenuDrawerWasOpen = false;
    blurAfterDrawerTriggerRefocus();
    const timer = window.setTimeout(
      () => setSettingsTooltipSuspended(false),
      SETTINGS_DRAWER_TOOLTIP_RESUME_MS,
    );
    onCleanup(() => window.clearTimeout(timer));
  });

  let catalogDrawerWasOpen = false;
  const openCatalog = () => {
    setCatalogTooltipSuspended(true);
    resetReaderCatalogTooltipTrigger();
    dismissOpenKobalteTooltips();
    setCatalogOpen(true);
  };
  createEffect(() => {
    const open = catalogOpen();
    if (open) {
      catalogDrawerWasOpen = true;
      setCatalogTooltipSuspended(true);
      dismissOpenKobalteTooltips();
      return;
    }
    if (!catalogDrawerWasOpen) return;
    catalogDrawerWasOpen = false;
    blurAfterDrawerTriggerRefocus();
    const timer = window.setTimeout(
      () => setCatalogTooltipSuspended(false),
      SETTINGS_DRAWER_TOOLTIP_RESUME_MS,
    );
    onCleanup(() => window.clearTimeout(timer));
  });

  let readAloudOverlayWasOpen = false;
  const openReadAloudFullscreen = () => {
    setReadAloudTooltipSuspended(true);
    resetReaderAloudTooltipTrigger();
    dismissOpenKobalteTooltips();
    setReadAloudDrawerOpen(false);
    setReadAloudFullscreenOpen(true);
  };
  createEffect(() => {
    const open = readAloudDrawerOpen() || readAloudFullscreenOpen();
    if (open) {
      readAloudOverlayWasOpen = true;
      setReadAloudTooltipSuspended(true);
      dismissOpenKobalteTooltips();
      return;
    }
    if (!readAloudOverlayWasOpen) return;
    readAloudOverlayWasOpen = false;
    blurAfterDrawerTriggerRefocus();
    const timer = window.setTimeout(
      () => setReadAloudTooltipSuspended(false),
      SETTINGS_DRAWER_TOOLTIP_RESUME_MS,
    );
    onCleanup(() => window.clearTimeout(timer));
  });


  const [commentsOpen, setCommentsOpen] = createSignal(false);
  const [commentsSegment, setCommentsSegment] = createSignal<{ chapterIndex: number; segmentIndex: number } | null>(null);
  /** 宽屏下段评面板正在播放关闭动画，动画结束后再置为 false 并关闭 */
  const [panelClosing, setPanelClosing] = createSignal(false);
  /** 宽屏下段评面板刚打开，用于进入动画（从右侧滑入） */
  const [panelEntering, setPanelEntering] = createSignal(false);
  const [isWideScreen, setIsWideScreen] = createSignal(window.innerWidth >= 480);

  const canChangeSource = () => {
    const b = book();
    return !!b && !textViewerStore.isGuestReading() && !isLocalBook(b);
  };

  const openChangeSource = () => {
    const b = book();
    if (!b || textViewerStore.isGuestReading() || isLocalBook(b)) {
      showAppToast({
        title: '无法换源',
        description: textViewerStore.isGuestReading()
          ? '试读请先加入书架'
          : '本地书不支持换源',
      });
      return;
    }
    setChangeSourceOpen(true);
  };

  const closeReaderShellOverlays = () => {
    setCatalogOpen(false);
    setSettingsOpen(false);
    setReaderMenuDrawerOpen(false);
    setReadAloudDrawerOpen(false);
    setReadAloudFullscreenOpen(false);
    setOfflineCacheDialogOpen(false);
    setDictOpen(false);
    setSearchOpen(false);
    setBookmarksOpen(false);
    if (!props.sourceEditActive?.()) {
      setChangeSourceOpen(false);
    }
    setTxtTocRuleOpen(false);
    setClickRegionalOpen(false);
    setClickActionPickerOpen(false);
    setCommentsOpen(false);
    setPanelClosing(false);
    setPanelEntering(false);
  };

  onMount(() => {
    const onShellClose = () => closeReaderShellOverlays();
    window.addEventListener(VIEWER_SHELL_OVERLAY_EVENTS.CLOSE_ALL, onShellClose);
    onCleanup(() => {
      window.removeEventListener(VIEWER_SHELL_OVERLAY_EVENTS.CLOSE_ALL, onShellClose);
    });
  });

  createEffect(() => {
    if (props.entryVisible?.() !== false) return;
    closeReaderShellOverlays();
  });

  let tapStartTime = 0;
  let tapStartX = 0;
  let tapStartY = 0;
  let tapMoved = false;

  const textSelectGesture = getSharedReaderTextSelectionGesture();
  const syncTextSelectChromeGate = () => {
    setReaderTextSelectChromeGate(() =>
      canStartReaderTextLongPressForChrome(chromeBarsVisible(), chromeLayout()),
    );
  };
  syncTextSelectChromeGate();
  createEffect(syncTextSelectChromeGate);

  /** 按页：视口外（overlay 等）点击取消选区；长按选文仍由 ReaderPagedViewport bridge 处理 */
  let detachPagedSelectionDismiss: (() => void) | undefined;
  createEffect(() => {
    detachPagedSelectionDismiss?.();
    detachPagedSelectionDismiss = undefined;
    if (!isPagedMode()) return;
    const el = scrollContainerEl();
    if (!el) return;

    const capture = true;
    const pagedViewport = () => el.querySelector('.reader-paged-viewport');

    const onPointerDownCapture = (e: PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary) return;
      if (!isReaderHandleSelectMode(textViewerStore.state.config)) return;
      if (isSelectionHandleDragActive()) return;
      if (isReaderTextSelectionUiNode(e.target)) return;
      if (isMediaViewerInteractiveClick(e.target)) return;
      const vp = pagedViewport();
      if (vp?.contains(e.target as Node)) return;
      if (!isReaderTextSelectionSurfaceActive()) return;
      textSelectGesture.onPointerDown(e, el, e.target);
    };

    const onPointerUpCapture = (e: PointerEvent) => {
      const vp = pagedViewport();
      if (vp?.contains(e.target as Node)) return;
      const suppress = textSelectGesture.onPointerUp(e);
      if (suppress) {
        e.preventDefault();
      }
    };

    el.addEventListener('pointerdown', onPointerDownCapture, capture);
    el.addEventListener('pointerup', onPointerUpCapture, capture);
    detachPagedSelectionDismiss = () => {
      el.removeEventListener('pointerdown', onPointerDownCapture, capture);
      el.removeEventListener('pointerup', onPointerUpCapture, capture);
    };
  });

  onCleanup(() => {
    detachPagedSelectionDismiss?.();
    resetSharedReaderTextSelectionGesture();
  });

  const book = () => textViewerStore.state.book;
  const catalogSize = () => textViewerStore.state.catalog.length;

  const isLocalTxtBook = () => {
    const b = book();
    if (!b || !isLocalBook(b)) return false;
    if (detectFileType(b.originName) === 'txt') return true;
    const urlName = b.bookUrl.replace(/^.*[/\\]/, '');
    return detectFileType(urlName) === 'txt';
  };

  const openTxtTocRulePicker = async () => {
    const b = book();
    if (!b) return;
    try {
      const buf = await readLocalBookContent(b.bookUrl);
      const sampleBytes = buf.byteLength > 512_000 ? buf.slice(0, 512_000) : buf;
      setTxtTocSample(new TextDecoder('utf-8', { fatal: false }).decode(sampleBytes));
      setTxtTocRuleOpen(true);
    } catch (e) {
      showAppToast({
        title: '无法读取书籍',
        description: e instanceof Error ? e.message : '读取文件失败',
        variant: 'destructive',
      });
    }
  };

  const handleTxtTocRuleConfirm = async (pick: TxtTocRulePickResult) => {
    const b = book();
    if (!b || txtTocReparsing()) return;
    setTxtTocReparsing(true);
    try {
      const result = await reparseLocalTxtBook(b.bookUrl, pick.tocRuleStorage, {
        splitLongChapter: pick.splitLongChapter,
      });
      await textViewerStore.openBook(result.book);
      await textViewerStore.loadChapter(result.book.durChapterIndex, { forceRefresh: true });
      showAppToast({
        title: '目录已更新',
        description: `共 ${result.chapterCount} 章`,
      });
    } catch (e) {
      showAppToast({
        title: '重新分章失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setTxtTocReparsing(false);
    }
  };
  const openOfflineCacheDialog = () => {
    const blocked = getOfflineCacheBlockedReason(
      book(),
      textViewerStore.isGuestReading(),
    );
    if (blocked) {
      showAppToast({
        title: '无法离线缓存',
        description: blocked,
        variant: 'default',
      });
      return;
    }
    setOfflineCacheDialogOpen(true);
  };
  const catalog = () => textViewerStore.state.catalog;
  const chapterIndex = () => textViewerStore.state.chapterIndex;
  const currentChapter = () => catalog()[chapterIndex()];
  const { resolveTitle } = useChapterDisplayTitles(
    catalog,
    book,
    () => book()?.origin,
    () => textViewerStore.isUseReplaceRule(),
    () => ({
      chineseConverterType: textViewerStore.state.config.chineseConverterType ?? 0,
    }),
  );
  const displayChapterTitle = (index?: number) => {
    const idx = index ?? chapterIndex();
    return resolveTitle(idx, catalog()[idx]);
  };
  const showContent = () => textViewerStore.state.showContent;
  const content = () => textViewerStore.state.content;
  const chapterPos = () => textViewerStore.state.chapterPos;

  /** 底栏：本章字数展示（优先章节 wordCount，否则按正文长度） */
  const chapterWordCountText = () => {
    const ch = currentChapter();
    if (ch?.wordCount) return ch.wordCount;
    const len = content().length;
    if (len >= 10000) return `${(len / 10000).toFixed(1)}万`;
    return len > 0 ? String(len) : '—';
  };
  /** 本章阅读进度 0–100 */
  const chapterProgressPercent = () => {
    if (isPagedMode() && pagedNav) {
      const ctx = pagedNav.getPageTipContext?.();
      if (ctx && ctx.pageCount > 0) {
        return Math.round(((ctx.pageIndex + 1) / ctx.pageCount) * 100);
      }
    }
    return Math.round(Math.max(0, Math.min(100, chapterPos() * 100)));
  };
  const readerTheme = () => textViewerStore.state.config.theme ?? 0;

  const readerChromeSurfaceStyle = (position: 'top' | 'bottom') => {
    const cfg = textViewerStore.state.config;
    const follow =
      position === 'top'
        ? cfg.readTopBarStyleFollowPage === true
        : cfg.readBottomBarStyleFollowPage === true;
    const layout = normalizeViewerChromeLayout(
      cfg.viewerChromeLayout ?? settingsState.app.viewerChromeLayout,
    );
    if (follow) {
      return textViewerChromeFollowPageSurfaceStyle(
        readerTheme(),
        { themeSurfaceAppearance: cfg.themeSurfaceAppearance },
        'chrome',
      );
    }
    const base = {
      color: 'hsl(var(--foreground))',
    } as const;
    return mergeViewerChromeThemedSurfaceStyle(base, layout);
  };

  let scrollContainer: HTMLDivElement | null = null;
  const [scrollContainerEl, setScrollContainerEl] = createSignal<HTMLDivElement | null>(null);
  const getScrollContainer = () => scrollContainerEl() ?? scrollContainer;
  const bindScrollContainerRef = (el: HTMLDivElement) => {
    scrollContainer = el;
    setScrollContainerEl(el);
  };
  let lastChapterIndex = -1;

  // 换书时重置章节切换动画追踪
  createEffect(() => {
    book();
    lastChapterIndex = -1;
  });

  const handlePrev = () => void textViewerStore.prevChapter();
  const handleNext = () => void textViewerStore.nextChapter();

  const canUseBookmarks = () => {
    const b = book();
    return !!b && !textViewerStore.isGuestReading();
  };

  const canUpdateToc = () => {
    const b = book();
    return !!b && !textViewerStore.isGuestReading() && !isLocalBook(b) && b.canUpdate !== false;
  };

  const handleUpdateToc = async () => {
    const b = book();
    if (!b || !canUpdateToc()) {
      showAppToast({
        title: '无法更新目录',
        description: '仅在线书架书籍可更新目录',
        variant: 'destructive',
      });
      return;
    }
    showAppToast({ title: '正在更新目录', description: b.name, persistent: true });
    try {
      const nextUrl = await updateBookToc(b.bookUrl);
      await textViewerStore.loadCatalog(nextUrl);
      showAppToast({ title: '目录已更新', variant: 'success' });
    } catch (e) {
      showAppToast({
        title: '更新目录失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  };

  const handleAddBookmark = async (selectedOverride?: string) => {
    const b = book();
    const ch = currentChapter();
    if (!b || !ch) return;
    try {
      const selected = selectedOverride ?? selectionTextFromDocument();
      let pos = chapterPos();
      let pageText: string | undefined;
      if (isPagedMode() && pagedNav) {
        const snapshot = pagedNav.getBookmarkSnapshot();
        pos = snapshot.chapterPos;
        pageText = snapshot.pageText;
      }
      await addReaderBookmark({
        book: b,
        chapterIndex: chapterIndex(),
        chapterPos: pos,
        chapterTitle: ch.title,
        chapterHtml: content(),
        selectedText: selected || undefined,
        pageText: pageText || undefined,
      });
      showAppToast({ title: '已添加书签' });
    } catch (e) {
      showAppToast({
        title: '添加书签失败',
        description: e instanceof Error ? e.message : '未知错误',
        variant: 'destructive',
      });
    }
  };

  const buildSelectionReplaceScope = () => {
    const scopes: string[] = [];
    const b = book();
    if (b?.name) scopes.push(b.name);
    if (b?.origin) scopes.push(b.origin);
    return scopes.join(';');
  };

  const openSelectionReplaceRule = (text: string) => {
    const pattern = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');
    if (!pattern) return;
    setSelectionReplaceDraft({
      name: '选区替换',
      pattern,
      replacement: '',
      scope: buildSelectionReplaceScope(),
      scopeContent: true,
      scopeTitle: false,
      isEnabled: true,
      isRegex: false,
      timeoutMillisecond: 3000,
      order: 0,
    });
    setSelectionReplaceOpen(true);
  };

  const saveSelectionReplaceRule = async (rule: ReplaceRuleDraft) => {
    if ('id' in rule && rule.id) {
      await replaceDb.updateReplaceRule(rule as ReplaceRule);
    } else {
      await replaceDb.insertReplaceRule({ ...(rule as Omit<ReplaceRule, 'id'>), id: 0 });
    }
    window.dispatchEvent(new CustomEvent('replace-rules-refresh'));
    showAppToast({ title: '替换规则已保存' });
    setSelectionReplaceOpen(false);
    setSelectionReplaceDraft(null);
  };

  const textSelectionMenuActions = (): ReaderTextSelectionMenuActions => ({
    onReplace: openSelectionReplaceRule,
    onBookmark: (text) => handleAddBookmark(text),
    onDict: (text) => {
      setDictWord(text.trim());
      setDictOpen(true);
    },
    onSearchContent: (text) => {
      setSearchInitialKeyword(text.trim());
      setSearchOpen(true);
    },
  });

  const handleJumpBookmark = async (bm: Bookmark) => {
    await textViewerStore.jumpToChapter(bm.chapterIndex, {
      entry: 'restore',
      chapterPos: bm.chapterPos,
    });
    requestAnimationFrame(() => {
      if (isPagedMode() && pagedNav) {
        pagedNav.setPageProgress(bm.chapterPos);
        return;
      }
      scrollNav?.scrollToChapterProgress(bm.chapterIndex, bm.chapterPos);
    });
  };

  const syncReadAloudActive = (active: boolean) => {
    setReadAloudActive(active);
  };

  const handleReadAloud = () => {
    openReadAloudDrawer();
  };

  const openReadAloudDrawer = () => {
    setReadAloudTooltipSuspended(true);
    resetReaderAloudTooltipTrigger();
    dismissOpenKobalteTooltips();
    setReadAloudDrawerOpen(true);
  };

  let lastAloudFollowParagraph = -1;

  let pagedNav: ReaderPagedNavApi | undefined;
  let scrollNav: ReaderScrollNavApi | undefined;

  const waitForChapterContent = async (maxMs = 15_000): Promise<void> => {
    const start = Date.now();
    while (
      (textViewerStore.state.contentLoading || !textViewerStore.state.content?.trim()) &&
      Date.now() - start < maxMs
    ) {
      await new Promise((r) => setTimeout(r, 80));
    }
  };

  const readAloudSessionContext: ReadAloudSessionContext = {
    getChapterContent: () => textViewerStore.state.content,
    getChapterIndex: () => textViewerStore.state.chapterIndex,
    getReadingAnchor: () => {
      if (isPagedMode() && pagedNav) {
        const snap = pagedNav.getBookmarkSnapshot();
        return {
          chapterIndex: textViewerStore.state.chapterIndex,
          chapterPos: snap.chapterPos,
          pageIndex: snap.pageIndex,
          pageText: snap.pageText,
        };
      }
      return {
        chapterIndex: textViewerStore.state.chapterIndex,
        chapterPos: textViewerStore.state.chapterPos,
      };
    },
    onRequestPrevChapter: async () => {
      await textViewerStore.prevChapter();
      await waitForChapterContent();
    },
    onRequestNextChapter: async () => {
      await textViewerStore.nextChapter();
      await waitForChapterContent();
    },
    onChapterFinished: async () => {
      if (
        textViewerStore.state.chapterIndex >=
        textViewerStore.state.catalog.length - 1
      ) {
        showAppToast({ title: '朗读结束' });
        return false;
      }
      await textViewerStore.nextChapter();
      await waitForChapterContent();
      if (!textViewerStore.state.content?.trim()) {
        showAppToast({
          title: '下一章加载失败',
          variant: 'destructive',
        });
        return false;
      }
      return true;
    },
    getConfig: () => textViewerStore.state.config,
    resolveHttpTts: (id) =>
      id != null ? getHttpTTS(id) : Promise.resolve(null),
    onAutoPagerStop: () => autoPager.stop(),
    onError: (msg) => {
      setReadAloudActive(false);
      showAppToast({
        title: '朗读失败',
        description: msg,
        variant: 'destructive',
      });
    },
    onStateChange: (snapshot) => {
      setReadAloudActive(
        snapshot.state === 'playing' || snapshot.state === 'paused',
      );
    },
    onProgress: (progress) => {
      if (progress.chapterIndex !== textViewerStore.state.chapterIndex) return;
      textViewerStore.setChapterPos(progress.chapterPos);
      const paragraphChanged = progress.paragraphIndex !== lastAloudFollowParagraph;
      if (!paragraphChanged) return;
      lastAloudFollowParagraph = progress.paragraphIndex;
      if (isPagedMode() && pagedNav) {
        pagedNav.setPageProgress(progress.chapterPos);
      } else {
        scrollNav?.scrollToProgressInCurrentChapter(progress.chapterPos);
      }
    },
    getChapterCount: () => textViewerStore.state.catalog.length,
    onNotify: (message) => {
      showAppToast({ title: message, variant: 'info' });
    },
    getMediaMetadata: () => {
      const book = textViewerStore.state.book;
      const catalog = textViewerStore.state.catalog;
      const idx = textViewerStore.state.chapterIndex;
      return {
        bookName: book?.name ?? '',
        chapterTitle: catalog[idx]?.title ?? '',
      };
    },
  };

  const normalizedPageAnim = () =>
    resolveBookTextViewerPageAnim(
      textViewerStore.state.book,
      normalizeTextViewerPageAnim(textViewerStore.state.config.pageAnim),
    );
  const isPagedMode = () => isTextViewerPagedAnim(normalizedPageAnim());

  const autoPagePaused = () =>
    catalogOpen() ||
    settingsOpen() ||
    readAloudDrawerOpen() ||
    readAloudFullscreenOpen() ||
    readerMenuDrawerOpen() ||
    searchOpen() ||
    bookmarksOpen() ||
    dictOpen() ||
    changeSourceOpen() ||
    offlineCacheDialogOpen() ||
    clickRegionalOpen() ||
    commentsOpen() ||
    (chromeLayout() !== 'fixed' && chromeBarsVisible());

  const canGoNextPage = () => {
    if (isPagedMode() && pagedNav) return pagedNav.canGoNextPage();
    const catalog = textViewerStore.state.catalog;
    return (
      catalog.length > 0 &&
      textViewerStore.state.chapterIndex < catalog.length - 1
    );
  };

  const isDualPageLayoutActive = () => {
    const mode = (textViewerStore.state.config.dualPage ?? 'auto') as TextViewerDualPageMode;
    if (mode === 'off') return false;
    if (isPagedMode()) {
      return pagedNav?.isDualPageLayoutActive?.() ?? false;
    }
    return textViewerDualPageActive(mode, isWideScreen());
  };

  const dualPageActive = () => isDualPageLayoutActive();

  const handleAutoPageToggle = (enabled: boolean) => {
    autoPager.setEnabled(enabled);
    if (enabled) {
      setReadAloudActive(false);
      showAppToast({ title: '已开启自动翻页' });
    }
  };

  const goNextPage = () => {
    if (isPagedMode() && pagedNav) {
      pagedNav.goNextPage();
      return;
    }
    if (scrollNav) {
      scrollNav.scrollByViewportPage(1);
      return;
    }
    void handleNext();
  };

  const goPrevPage = () => {
    if (isPagedMode() && pagedNav) {
      pagedNav.goPrevPage();
      return;
    }
    if (scrollNav) {
      scrollNav.scrollByViewportPage(-1);
      return;
    }
    void handlePrev();
  };

  const autoPager = useTextViewerAutoPager({
    isScrollMode: () => !isPagedMode(),
    getScrollContainer,
    goNextPage,
    canGoNextPage,
    drivePagedReveal: (progress) => pagedNav?.driveAutoPagerReveal?.(progress) ?? false,
    isPaused: autoPagePaused,
  });

  const handleAutoReadSpeedChange = (speed: number) => {
    textViewerStore.setConfig({ autoReadSpeed: normalizeAutoReadSpeed(speed) });
  };

  createEffect(() => {
    const el = scrollContainerEl();
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setDualPageLayoutProbe((p) => p + 1);
    });
    ro.observe(el);
    onCleanup(() => ro.disconnect());
  });

  createEffect(
    on(normalizedPageAnim, (_anim, prevAnim) => {
      if (prevAnim === undefined) return;
      if (autoPager.active()) autoPager.stop();
    }),
  );

  const runClickAction = (action: ReaderClickActionId) => {
    switch (action) {
      case 'menu':
        toggleChromeBars();
        break;
      case 'nextPage':
        goNextPage();
        break;
      case 'prevPage':
        goPrevPage();
        break;
      case 'nextChapter':
        void handleNext();
        break;
      case 'prevChapter':
        void handlePrev();
        break;
      default:
        break;
    }
  };

  const contentTransitionClass = () => {
    if (isPagedMode()) return '';
    const anim = normalizedPageAnim();
    if (anim === 'cover') return 'reader-chapter-enter-cover';
    if (anim === 'slide' || anim === 'simulation') return 'reader-chapter-enter-slide';
    if (anim === 'none') return '';
    return '';
  };

  const [chapterJumpConfirmed, setChapterJumpConfirmed] = createSignal(false);

  /** 操作栏进度条：拖动时更新本章进度或跳转章节 */
  const handleChapterProgressChange = (values: number[]) => {
    const behavior = textViewerStore.state.config.progressBarBehavior ?? 'page';
    if (behavior === 'chapter') {
      const idx = Math.round(Math.max(0, values[0] ?? 0));
      const jump = () => {
        void textViewerStore.jumpToChapter(idx);
      };
      if (!chapterJumpConfirmed()) {
        showAppToast({
          title: '章节跳转确认',
          description: '再次拖动将直接跳转章节',
          variant: 'info',
        });
        setChapterJumpConfirmed(true);
        return;
      }
      jump();
      return;
    }
    const p = Math.max(0, Math.min(1, values[0] ?? 0));
    textViewerStore.setChapterPos(p);
    if (isPagedMode() && pagedNav) {
      pagedNav.setPageProgress(p);
      return;
    }
    scrollNav?.scrollToProgressInCurrentChapter(p);
  };

  const openComments = (chapterIndex: number, segmentIndex: number) => {
    const seg = commentsSegment();
    const open = commentsOpen();
    const wide = isWideScreen();
    const isSameSegment = seg && seg.chapterIndex === chapterIndex && seg.segmentIndex === segmentIndex;
    if (isSameSegment && open) {
      if (wide) setPanelClosing(true);
      else setCommentsOpen(false);
    } else {
      setCommentsSegment({ chapterIndex, segmentIndex });
      setPanelClosing(false);
      if (wide && !open) setPanelEntering(true);
      setCommentsOpen(true);
    }
  };

  const handleCloseComments = () => {
    if (isWideScreen()) setPanelClosing(true);
    else setCommentsOpen(false);
  };

  const handleCommentsPanelTransitionEnd = (e: TransitionEvent) => {
    if (e.target !== e.currentTarget || !panelClosing()) return;
    setCommentsOpen(false);
    setPanelClosing(false);
  };

  /** 段评数量：无数据源时恒为 0，不渲染正文内数字气泡；接入后在此返回真实计数 */
  const getSegmentCommentCount = (_chapterIndex: number, _segmentIndex: number) => 0;

  createEffect(() => {
    if (!panelEntering()) return;
    let id: number;
    id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => setPanelEntering(false));
    });
    return () => cancelAnimationFrame(id);
  });

  onMount(() => {
    const syncLayout = () => {
      const w = window.innerWidth;
      setIsWideScreen(w >= 480);
      setDualPageLayoutProbe((p) => p + 1);
    };
    syncLayout();
    return subscribeViewportGeometryChange(syncLayout);
  });

  const dismissClickRegional = () => {
    setClickRegionalOpen(false);
    setClickRegionalMarkHint(false);
  };

  const openClickRegionalConfig = (fromFirstHint = false) => {
    setClickRegionalMarkHint(fromFirstHint);
    setClickRegionalOpen(true);
  };

  onMount(() => {
    bindReadAloudSessionContext(readAloudSessionContext);
    onCleanup(() => {
      if (isReadAloudShellBackground()) return;
      unbindReadAloudSessionContext();
    });
  });

  const followReadAloudProgressToViewport = () => {
    const progress = getReadAloudProgress();
    if (!progress || !isReadAloudSessionActive()) return;
    if (progress.chapterIndex !== textViewerStore.state.chapterIndex) return;
    textViewerStore.setChapterPos(progress.chapterPos);
    lastAloudFollowParagraph = progress.paragraphIndex;
    syncReadAloudProgressToViewport({
      isPaged: isPagedMode(),
      setPagedProgress: (ratio) => pagedNav?.setPageProgress(ratio),
      scrollToProgress: (ratio) => scrollNav?.scrollToProgressInCurrentChapter(ratio),
    });
  };

  createEffect(() => {
    if (props.entryVisible?.() === false) return;
    if (!isReadAloudSessionActive()) return;
    if (!textViewerStore.state.showContent) return;
    if (isPagedMode() && !pagedNav) return;
    if (!isPagedMode() && !scrollNav) return;
    dualPageLayoutProbe();
    followReadAloudProgressToViewport();
  });

  onMount(() => {
    void captureNativeBrightnessBeforeRead();
    const cfg = textViewerStore.state.config;
    void syncReadBrightness(
      cfg.readBrightness ?? 100,
      cfg.brightnessAuto !== false,
    );
    void applyScreenOrientation(cfg.screenOrientation ?? 0);
    void applyKeepScreenOn(cfg.keepScreenOn ?? 0);
  });

  createEffect(() => {
    const cfg = textViewerStore.state.config;
    void syncReadBrightness(cfg.readBrightness ?? 100, cfg.brightnessAuto !== false);
    void applyScreenOrientation(cfg.screenOrientation ?? 0);
    void applyKeepScreenOn(cfg.keepScreenOn ?? 0);
  });

  useBackHandler(() => {
    if (!textViewerStore.state.config.disableReturnKey) return undefined;
    if (chromeBarsVisible()) return undefined;
    return () => true;
  });

  onMount(() => {
    const handleWheel = (e: WheelEvent) => {
      if (textViewerStore.state.config.mouseWheelPage === false) return;
      const root = getScrollContainer();
      if (!root) return;
      const target = e.target as Node | null;
      if (!root.contains(target ?? null)) return;
      e.preventDefault();
      if (isPagedMode()) {
        if (e.deltaY > 0) goNextPage();
        else if (e.deltaY < 0) goPrevPage();
      } else if (scrollNav) {
        scrollNav.scrollByViewportPage(e.deltaY > 0 ? 1 : -1);
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    onCleanup(() => window.removeEventListener('wheel', handleWheel));
  });

  onMount(() => {
    void shouldShowClickActionHint().then((show) => {
      if (show && isPagedMode()) openClickRegionalConfig(true);
    });
  });

  onMount(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (clickRegionalOpen()) {
          if (clickActionPickerOpen()) return;
          dismissClickRegional();
          return;
        }
        setCatalogOpen(false);
        setSettingsOpen(false);
        if (commentsOpen()) setPanelClosing(true);
        else if (!catalogOpen() && !settingsOpen()) toggleChromeBars();
      }

      const aloudActive =
        isReadAloudSessionActive() &&
        (textViewerStore.state.config.volumeKeyControlAloud ?? true) &&
        !textViewerStore.state.config.volumeKeyTurnPageOnAloud;

      const customKeys = textViewerStore.state.config.customPageKeys;
      const matchCustomPrev = customKeys?.prev?.includes(e.code);
      const matchCustomNext = customKeys?.next?.includes(e.code);
      if (matchCustomPrev) {
        e.preventDefault();
        if (!textViewerStore.state.config.keyPageOnLongPress && e.repeat) return;
        goPrevPage();
        return;
      }
      if (matchCustomNext) {
        e.preventDefault();
        if (!textViewerStore.state.config.keyPageOnLongPress && e.repeat) return;
        goNextPage();
        return;
      }

      if (aloudActive) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.code === 'AudioVolumeUp') {
          e.preventDefault();
          void prevReadAloudParagraph();
          return;
        }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.code === 'AudioVolumeDown') {
          e.preventDefault();
          void nextReadAloudParagraph();
          return;
        }
      }

      if (e.key === 'ArrowLeft') goPrevPage();
      if (e.key === 'ArrowRight') goNextPage();
      if (textViewerStore.state.config.volumeKeyTurnPage && !aloudActive) {
        if (e.key === 'ArrowUp' || e.code === 'AudioVolumeUp') {
          e.preventDefault();
          handlePrev();
        }
        if (e.key === 'ArrowDown' || e.code === 'AudioVolumeDown') {
          e.preventDefault();
          handleNext();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    onCleanup(() => window.removeEventListener('keydown', handleKey));
  });

  // 非滚动翻页动画：章节切换时重播进入动画
  createEffect(() => {
    const index = chapterIndex();
    if (!showContent()) return;
    if (lastChapterIndex !== -1 && lastChapterIndex !== index) {
      const anim = normalizedPageAnim();
      if (!isTextViewerPagedAnim(anim) && anim !== 'scroll') {
        setContentEnterKey((k) => k + 1);
      }
    }
    lastChapterIndex = index;
  });

  onCleanup(() => {
    if (isReadAloudShellBackground()) return;
    void restoreBrightnessOnExit(textViewerStore.state.config.brightnessAuto !== false);
    void clearKeepScreenOn();
    stopReadAloud();
    setReadAloudActive(false);
    closeReaderShellOverlays();
  });

  const handleSelectMode = () => isReaderHandleSelectMode(textViewerStore.state.config);

  const onContentPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || !e.isPrimary) return;
    if (isMediaViewerInteractiveClick(e.target)) return;
    if (isReaderTextSelectionUiNode(e.target)) return;
    if (handleSelectMode() && !isSelectionHandleDragActive()) {
      e.preventDefault();
    }
    const container = getScrollContainer();
    if (container) textSelectGesture.onPointerDown(e, container, e.target);
    tapStartTime = Date.now();
    tapStartX = e.clientX;
    tapStartY = e.clientY;
    tapMoved = false;
  };

  const onContentPointerMove = (e: PointerEvent) => {
    if (handleSelectMode() && !isSelectionHandleDragActive()) {
      e.preventDefault();
    }
    const container = getScrollContainer();
    if (container) textSelectGesture.onPointerMove(e, container);
    if (
      tapStartTime &&
      (Math.abs(e.clientX - tapStartX) > TAP_MOVE_THRESHOLD ||
        Math.abs(e.clientY - tapStartY) > TAP_MOVE_THRESHOLD)
    ) {
      tapMoved = true;
    }
  };

  const onContentPointerUp = (e: PointerEvent) => {
    const suppress = textSelectGesture.onPointerUp(e);
    if (suppress) {
      e.preventDefault();
    }
  };

  const runRegionalClick = (e: MouseEvent) => {
    const t = findPagedClickContainer(e, scrollContainer);
    const action = resolveRegionalClickAction(
      e,
      t,
      textViewerStore.state.config.clickRegion,
      textViewerStore.state.config.clickActions,
    );
    if (action) runClickAction(action);
    tapStartTime = 0;
  };

  const contentPrimaryAction = (e: MouseEvent) => {
    if (shouldSuppressPagedRegionalTap()) {
      tapStartTime = 0;
      return;
    }
    if (dismissReaderTextSelectionOnClick()) {
      tapStartTime = 0;
      return;
    }
    if (shouldSuppressReaderRegionalTap() || textSelectGesture.shouldSuppressRegionalTap()) {
      tapStartTime = 0;
      return;
    }
    if (tapMoved) {
      tapStartTime = 0;
      return;
    }
    if (autoPager.active()) {
      toggleChromeBars();
      tapStartTime = 0;
      return;
    }
    if (
      shouldDismissChromeOverRegionalClick(
        chromeBarsVisible(),
        viewerChromeBarsCollapsible(chromeLayout()),
      )
    ) {
      toggleChromeBars();
      tapStartTime = 0;
      return;
    }
    if (!isPagedMode()) {
      if (textViewerStore.state.config.disableScrollClickAnimation) {
        toggleChromeBars();
        tapStartTime = 0;
        return;
      }
      runRegionalClick(e);
      return;
    }
    runRegionalClick(e);
  };

  const autoPageOverlayVisible = () => {
    if (!autoPager.active() || !isPagedMode()) return false;
    const style = textViewerStore.state.config.autoPageStyle ?? 'scanLine';
    return style === 'scanLine' || style === 'progressBar';
  };

  const stageContentClass = useMediaViewerMainStageClass('reader-text-stage');
  const readerThemeShell = () => readerThemeClasses(textViewerStore.state.config.theme);
  const mainContentStyle = () =>
    textViewerThemeStyle(textViewerStore.state.config.theme ?? 0, {
      themeSurfaceAppearance: textViewerStore.state.config.themeSurfaceAppearance,
    });

  const mainContentClass = () =>
    cn(stageContentClass(), readerThemeShell().bg, readerThemeShell().text);

  const scrollPageTipContext = (): ReaderPageTipContext => {
    const cat = catalog();
    const ch = chapterIndex();
    const total = cat.length;
    const progress = total > 0 ? Math.min(1, Math.max(0, (ch + chapterPos()) / total)) : 0;
    return {
      bookName: book()?.name,
      chapterTitle: displayChapterTitle(),
      pageIndex: 0,
      pageCount: 1,
      bookProgressPercent: progress,
      bookProgressLabel: total > 0 ? `${ch + 1}/${total}` : undefined,
      chapterWordCountText: chapterWordCountText(),
      chapterProgressPercent: chapterProgressPercent(),
    };
  };

  const pageTipContext = (): ReaderPageTipContext => {
    const base = (() => {
      if (isPagedMode()) {
        const ctx = pagedNav?.getPageTipContext?.();
        if (ctx) return ctx;
      }
      return scrollPageTipContext();
    })();
    return {
      ...base,
      chapterWordCountText: chapterWordCountText(),
      chapterProgressPercent: chapterProgressPercent(),
    };
  };

  const readerContentShared = {
    onOpenComments: openComments,
    getSegmentCommentCount,
    applyReadWidth: () => false as const,
  };

  const renderTextBody = () => (
    <Show
      when={isPagedMode()}
      fallback={
        <Index each={[contentEnterKey()]}>
          {() => (
            <ReaderScrollPageChrome
              tips={textViewerStore.state.config.pageTips}
              context={scrollPageTipContext()}
              chromeBarsVisible={chromeBarsVisible()}
              themeId={textViewerStore.state.config.theme}
              scrollRef={bindScrollContainerRef}
            >
              <ReaderTextContentSlot mode="scroll" tipChromeOuter>
                <ReaderScrollViewport
                  class={cn('min-h-full', contentTransitionClass())}
                  insetManagedBySlot
                  getScrollContainer={getScrollContainer}
                  onRegisterNav={(api) => {
                    scrollNav = api;
                  }}
                  resolveChapterTitle={displayChapterTitle}
                  {...readerContentShared}
                  dualPage={dualPageActive()}
                />
              </ReaderTextContentSlot>
            </ReaderScrollPageChrome>
          )}
        </Index>
      }
    >
      <ReaderPagedViewport
        pageAnim={normalizedPageAnim}
        class="h-full min-h-full"
        suppressPointerTurn={() => autoPager.active()}
        chromeBarsVisible={chromeBarsVisible}
        {...readerContentShared}
        resolveChapterTitle={displayChapterTitle}
        onRequestPrevChapter={() => handlePrev()}
        onRequestNextChapter={() => handleNext()}
        onRegisterNav={(api) => {
          pagedNav = api;
        }}
      />
    </Show>
  );

  return (
    <>
      <MediaViewerChromeLayoutProvider
        layout={() => textViewerStore.state.config.viewerChromeLayout}
      >
        <MediaViewerShell
          themeTarget="viewer.text"
          entryVisible={props.entryVisible}
          tapToToggleBars={false}
          chromePointerInput
          contentPrimaryAction={contentPrimaryAction}
          class={cn(handleSelectMode() && 'reader-text-handle-select')}
        >
          <BookReaderChromeBridge
            onReady={(toggle) => {
              toggleChromeBars = toggle;
            }}
            onChromeBarsVisible={setChromeBarsVisible}
          />
          <MediaViewerShellMain
            class={cn(
              textViewerStore.state.config.paddingDisplayCutouts && 'reader-padding-cutouts-host',
            )}
          >
            <MediaViewerChromeSlots
              sideOverlay={
                <Show
                  when={
                    brightnessViewPosition() === 'left' || brightnessViewPosition() === 'right'
                  }
                >
                  <ReaderBrightnessControl chromeVisible={brightnessChromeVisible()} />
                </Show>
              }
              header={
                <MediaViewerHeader
                  surfaceStyle={readerChromeSurfaceStyle('top')}
                  subHeader={
                    <Show when={textViewerStore.state.config.showReadTitleAddition !== false}>
                      <TextViewerChapterSourceBar
                        book={book()}
                        chapter={currentChapter()}
                        chapterTitle={displayChapterTitle()}
                        onSourceEdit={props.onSourceEdit}
                        onSourceLogin={props.onSourceLogin}
                        onSourceVariables={props.onSourceVariables}
                      />
                    </Show>
                  }
                  bottomSlot={
                    <TextViewerChromePageTip
                      position="header"
                      tips={textViewerStore.state.config.pageTips}
                      context={pageTipContext()}
                      chromeBarsVisible={chromeBarsVisible()}
                      themeId={textViewerStore.state.config.theme}
                    />
                  }
                  trailingSlot={
                    <Show when={brightnessViewPosition() === 'top'}>
                      <ReaderBrightnessControl
                        chromeVisible={brightnessChromeVisible()}
                        embeddedChrome="top"
                      />
                    </Show>
                  }
                >
                  <TextViewerToolbarHeader
                    bookName={book()?.name ?? ''}
                    onClose={props.onClose}
                    onOpenBookInfo={props.onOpenBookInfo}
                    readAloudActive={readAloudActive()}
                    onOpenCatalog={openCatalog}
                    onReadAloud={handleReadAloud}
                    readAloudTooltipSuspended={readAloudTooltipSuspended()}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onOpenReaderMenu={openReaderMenuDrawer}
                    settingsTooltipSuspended={settingsTooltipSuspended()}
                    catalogTooltipSuspended={catalogTooltipSuspended()}
                    onChangeSource={openChangeSource}
                    canChangeSource={canChangeSource()}
                    onRefreshChapter={() => {
                      void textViewerStore.refreshChapter().catch(() => undefined);
                    }}
                    onOpenOfflineCache={openOfflineCacheDialog}
                    moreMenu={{
                      canBookmark: canUseBookmarks(),
                      onOpenBookmarks: () => setBookmarksOpen(true),
                      onAddBookmark: () => void handleAddBookmark(),
                      canUpdateToc: canUpdateToc,
                      onUpdateToc: () => void handleUpdateToc(),
                      shellActive: props.entryVisible?.() ?? true,
                    }}
                  />
                </MediaViewerHeader>
              }
              footer={
                <MediaViewerFooter
                  surfaceStyle={readerChromeSurfaceStyle('bottom')}
                  leadingSlot={
                    <Show when={brightnessViewPosition() === 'bottom'}>
                      <ReaderBrightnessControl
                        chromeVisible={brightnessChromeVisible()}
                        embeddedChrome="bottom"
                      />
                    </Show>
                  }
                >
                  <TextViewerChromePageTip
                    position="footer"
                    tips={textViewerStore.state.config.pageTips}
                    context={pageTipContext()}
                    chromeBarsVisible={chromeBarsVisible()}
                    themeId={textViewerStore.state.config.theme}
                  />
                  <TextViewerBottomChrome
                    chapterPos={chapterPos()}
                    chapterIndex={chapterIndex()}
                    catalogLength={catalog().length}
                    onChapterProgressChange={handleChapterProgressChange}
                    onPrevChapter={handlePrev}
                    onNextChapter={handleNext}
                    onOpenCatalog={openCatalog}
                    onReadAloud={handleReadAloud}
                    readAloudActive={readAloudActive()}
                    readAloudTooltipSuspended={readAloudTooltipSuspended()}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onOpenReaderMenu={openReaderMenuDrawer}
                    autoPageActive={() => autoPager.active()}
                    autoReadSpeed={() => autoPager.speed()}
                    onAutoReadSpeedChange={handleAutoReadSpeedChange}
                  />
                </MediaViewerFooter>
              }
            >
              <Show
                when={isWideScreen() && (commentsOpen() || panelClosing())}
                fallback={
                  <div
                    ref={bindScrollContainerRef}
                    class={mainContentClass()}
                    style={mainContentStyle()}
                    {...textViewerThemeScopeAttrs(textViewerStore.state.config.theme ?? 0)}
                    onPointerDown={isPagedMode() ? undefined : onContentPointerDown}
                    onPointerMove={isPagedMode() ? undefined : onContentPointerMove}
                    onPointerUp={isPagedMode() ? undefined : onContentPointerUp}
                    onPointerCancel={isPagedMode() ? undefined : onContentPointerUp}
                  >
                    <ReaderAutoPageOverlay
                      visible={autoPageOverlayVisible()}
                      style={textViewerStore.state.config.autoPageStyle ?? 'scanLine'}
                      progressEdge={textViewerStore.state.config.autoPageProgressEdge ?? 'bottom'}
                      progress={autoPager.screenProgress()}
                    />
                    {renderTextBody()}
                  </div>
                }
              >
                <div class="flex min-h-0 flex-1">
                  <div class="relative min-w-0 flex-1 overflow-hidden">
                    <div
                      ref={bindScrollContainerRef}
                      class={mainContentClass()}
                      style={mainContentStyle()}
                      {...textViewerThemeScopeAttrs(textViewerStore.state.config.theme ?? 0)}
                      onPointerDown={isPagedMode() ? undefined : onContentPointerDown}
                    onPointerMove={isPagedMode() ? undefined : onContentPointerMove}
                    onPointerUp={isPagedMode() ? undefined : onContentPointerUp}
                    onPointerCancel={isPagedMode() ? undefined : onContentPointerUp}
                    >
                      <ReaderAutoPageOverlay
                        visible={autoPageOverlayVisible()}
                        style={textViewerStore.state.config.autoPageStyle ?? 'scanLine'}
                        progressEdge={textViewerStore.state.config.autoPageProgressEdge ?? 'bottom'}
                        progress={autoPager.screenProgress()}
                      />
                      {renderTextBody()}
                    </div>
                  </div>
                  <div
                    class={cn(
                      'reader-comments-panel flex shrink-0 flex-col overflow-hidden border-l border-border/50 bg-background transition-[width] duration-300 ease-out',
                      (panelEntering() || panelClosing()) ? 'w-0 border-l-0' : 'w-80'
                    )}
                    onTransitionEnd={handleCommentsPanelTransitionEnd}
                  >
                    <div class="flex h-full min-w-80 flex-col">
                      <ReaderCommentsDrawer
                        segment={commentsSegment()}
                        onClose={handleCloseComments}
                        embedded
                      />
                    </div>
                  </div>
                </div>
              </Show>
            </MediaViewerChromeSlots>
          </MediaViewerShellMain>
        </MediaViewerShell>
      </MediaViewerChromeLayoutProvider>

      {/* 窄屏段评 Drawer */}
      <Show when={!isWideScreen()}>
        <ReaderCommentsDrawer
          segment={commentsSegment()}
          open={commentsOpen()}
          onOpenChange={setCommentsOpen}
          onClose={() => setCommentsOpen(false)}
        />
      </Show>

      {/* 目录 Drawer：桌面/Web 左侧滑出，移动端底部滑出 */}
      <Show when={book()}>
        <ViewerAppDrawer
          open={catalogOpen()}
          onOpenChange={setCatalogOpen}
          side={mediaViewerCatalogDrawerSide()}
          snapPoints={[0, 1]}
          defaultSnapPoint={1}
        >
          <ViewerAppDrawerContent
            class={mediaViewerCatalogDrawerContentClass()}
            showNativeDragHandle={false}
          >
            <ViewerAppDrawerHeader
              title="目录"
              actions={
                <Show when={isLocalTxtBook()}>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-8 shrink-0 px-2 text-xs"
                    disabled={txtTocReparsing()}
                    onClick={() => void openTxtTocRulePicker()}
                  >
                    目录规则
                  </Button>
                </Show>
              }
            />
            <ViewerAppDrawerBody>
              <Show when={catalogOpen()}>
                <ReaderCatalog
                  open
                  drawerBottom={mediaViewerCatalogDrawerSide() === 'bottom'}
                  onSelectChapter={(index: number) => {
                    textViewerStore.jumpToChapter(index);
                    setCatalogOpen(false);
                  }}
                  onClose={() => setCatalogOpen(false)}
                />
              </Show>
            </ViewerAppDrawerBody>
          </ViewerAppDrawerContent>
        </ViewerAppDrawer>
      </Show>

      <ReaderReadAloudDrawer
        open={readAloudDrawerOpen()}
        onOpenChange={setReadAloudDrawerOpen}
        sessionContext={readAloudSessionContext}
        onSessionStateChange={syncReadAloudActive}
        onOpenCatalog={() => {
          setReadAloudDrawerOpen(false);
          openCatalog();
        }}
        onOpenSettings={() => {
          setReadAloudDrawerOpen(false);
          setSettingsOpen(true);
        }}
        onOpenFullscreen={openReadAloudFullscreen}
        onEnterBackground={() => {
          const book = textViewerStore.state.book;
          const catalog = textViewerStore.state.catalog;
          const chapterIdx = textViewerStore.state.chapterIndex;
          const chapterTitle = catalog[chapterIdx]?.title ?? '';
          const subtitle = [book?.author, chapterTitle].filter(Boolean).join(' · ');
          enterReadAloudBackground(
            readAloudSessionContext,
            props.onClose,
            {
              title: book?.name ?? '朗读中',
              subtitle: subtitle || undefined,
              coverBookUrl: book?.bookUrl,
            },
            book?.bookUrl ?? '',
          );
        }}
      />

      <ReaderReadAloudFullscreen
        open={readAloudFullscreenOpen()}
        onClose={() => setReadAloudFullscreenOpen(false)}
        onOpenCatalog={() => {
          setReadAloudFullscreenOpen(false);
          openCatalog();
        }}
        onEnterBackground={() => {
          const book = textViewerStore.state.book;
          const catalog = textViewerStore.state.catalog;
          const chapterIdx = textViewerStore.state.chapterIndex;
          const chapterTitle = catalog[chapterIdx]?.title ?? '';
          const subtitle = [book?.author, chapterTitle].filter(Boolean).join(' · ');
          enterReadAloudBackground(
            readAloudSessionContext,
            props.onClose,
            {
              title: book?.name ?? '朗读中',
              subtitle: subtitle || undefined,
              coverBookUrl: book?.bookUrl,
            },
            book?.bookUrl ?? '',
          );
        }}
        sessionContext={readAloudSessionContext}
      />

      <ReaderReadAloudMiniBar
        drawerOpen={readAloudDrawerOpen() || readAloudFullscreenOpen()}
        onOpenDrawer={openReadAloudDrawer}
      />

      <ReaderTextSelectionMenu
        sessionContext={readAloudSessionContext}
        contentRootRef={() => getScrollContainer()}
        actions={textSelectionMenuActions()}
      />
      <ReaderTextSelectionHandles
        contentRootRef={() => resolveReaderContentRootFromSelection(getScrollContainer())}
      />

      {/* 阅读界面 Drawer（仅关闭/全开两档，保证可滚动区高度固定、滚动正常） */}
      <ViewerAppDrawer open={settingsOpen()} onOpenChange={setSettingsOpen} snapPoints={[0, 1]} defaultSnapPoint={1}>
        <ViewerAppDrawerContent
          class={cn('flex flex-col', hDrawerPanel, `max-h-[75dvh]`)}
          showNativeDragHandle={false}
        >
          <ViewerAppDrawerHeader title="界面" />
          <ViewerAppDrawerBody class="mb-4 min-w-0 flex-1 gap-1 overflow-y-auto overscroll-contain contain-layout scroll-gutter-stable-both px-2 pb-2">
            <ReaderSettings
              onClose={() => setSettingsOpen(false)}
              showReadWidth={() => isWideScreen() || !isMobile()}
              onOpenClickRegionalConfig={() => openClickRegionalConfig(false)}
            />
          </ViewerAppDrawerBody>
        </ViewerAppDrawerContent>
      </ViewerAppDrawer>

      <ReaderBehaviorSettingsDrawer
        open={readerMenuDrawerOpen()}
        onOpenChange={setReaderMenuDrawerOpen}
        blockOutsideDismiss={readerMenuDrawerBlockOutsideDismiss()}
        autoPageActive={autoPager.active()}
        onAutoPageToggle={handleAutoPageToggle}
      />

      <ReaderOfflineCacheDialog
        open={offlineCacheDialogOpen()}
        onOpenChange={setOfflineCacheDialogOpen}
        book={book() ?? null}
        chapterIndex={textViewerStore.state.chapterIndex}
        catalogSize={catalogSize()}
      />

      <DictDialog open={dictOpen()} onOpenChange={setDictOpen} word={dictWord()} />

      <ReaderSearchDrawer
        open={searchOpen()}
        onOpenChange={setSearchOpen}
        initialKeyword={searchInitialKeyword()}
        onJumpToChapter={(index) => void textViewerStore.jumpToChapter(index)}
      />

      <ReplaceRuleEditDialog
        open={selectionReplaceOpen()}
        onOpenChange={setSelectionReplaceOpen}
        rule={selectionReplaceDraft()}
        onSave={saveSelectionReplaceRule}
        overlayLayer="viewer-stacked"
      />

      <ReaderBookmarksDrawer
        open={bookmarksOpen()}
        onOpenChange={setBookmarksOpen}
        book={book() ?? null}
        onJump={(bm) => void handleJumpBookmark(bm)}
      />

      <ReaderChangeSourceDialog
        open={changeSourceOpen()}
        onOpenChange={setChangeSourceOpen}
        sourceEditActive={props.sourceEditActive}
        book={book() ?? null}
        chapterIndex={chapterIndex()}
        chapterTitle={displayChapterTitle()}
        onOpenSourcesManage={props.onOpenSourcesManage}
        onSourceEdit={(source) => {
          if (changeSourceOpen()) {
            restoreChangeSourceAfterEdit = true;
          }
          props.onSourceEdit?.(source);
        }}
        onBookChanged={async (nextBook) => {
          await textViewerStore.openBook(nextBook);
        }}
        onChapterReplaced={() => {
          void textViewerStore.reprocessDisplayedChapter();
        }}
      />

      <TxtTocRulePickDialog
        open={txtTocRuleOpen()}
        onOpenChange={setTxtTocRuleOpen}
        currentTocUrl={book()?.tocUrl}
        sampleText={txtTocSample()}
        splitLongChapter={book()?.readConfig?.splitLongChapter !== false}
        onConfirm={handleTxtTocRuleConfirm}
      />

      <ReaderClickRegionalOverlay
        open={clickRegionalOpen()}
        markHintSeenOnClose={clickRegionalMarkHint()}
        onClose={dismissClickRegional}
        onPickerOpenChange={setClickActionPickerOpen}
      />

      <style>{`
        @keyframes reader-cover-in {
          from { opacity: 0.35; }
          to { opacity: 1; }
        }
        @keyframes reader-slide-in {
          from { opacity: 0.6; transform: translateX(12px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .reader-chapter-enter-cover {
          animation: reader-cover-in 0.28s ease-out;
        }
        .reader-chapter-enter-slide {
          animation: reader-slide-in 0.32s ease-out;
        }

        .reader-paged-page {
          transform-origin: center center;
          will-change: transform, opacity;
        }

        @keyframes reader-paged-cover-out-next {
          from { transform: translateX(0); }
          to { transform: translateX(-100%); }
        }
        @keyframes reader-paged-cover-out-prev {
          from { transform: translateX(0); }
          to { transform: translateX(100%); }
        }
        @keyframes reader-paged-cover-in-next {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes reader-paged-cover-in-prev {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        .reader-paged-turn-cover-out-next {
          animation: reader-paged-cover-out-next 0.32s ease-out forwards;
        }
        .reader-paged-turn-cover-out-prev {
          animation: reader-paged-cover-out-prev 0.32s ease-out forwards;
        }
        .reader-paged-turn-cover-in-next {
          animation: reader-paged-cover-in-next 0.32s ease-out forwards;
        }
        .reader-paged-turn-cover-in-prev {
          animation: reader-paged-cover-in-prev 0.32s ease-out forwards;
        }
        .reader-paged-turn-linked-out-next {
          animation: reader-paged-cover-out-next 0.32s ease-out forwards;
        }
        .reader-paged-turn-linked-out-prev {
          animation: reader-paged-cover-out-prev 0.32s ease-out forwards;
        }

        @keyframes reader-paged-slide-out-next {
          from { transform: translateX(0); }
          to { transform: translateX(-100%); }
        }
        @keyframes reader-paged-slide-out-prev {
          from { transform: translateX(0); }
          to { transform: translateX(100%); }
        }
        @keyframes reader-paged-slide-in-next {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes reader-paged-slide-in-prev {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        .reader-paged-turn-slide-out-next {
          animation: reader-paged-slide-out-next 0.32s ease-out forwards;
        }
        .reader-paged-turn-slide-out-prev {
          animation: reader-paged-slide-out-prev 0.32s ease-out forwards;
        }
        .reader-paged-turn-slide-in-next {
          animation: reader-paged-slide-in-next 0.32s ease-out forwards;
        }
        .reader-paged-turn-slide-in-prev {
          animation: reader-paged-slide-in-prev 0.32s ease-out forwards;
        }

        @keyframes reader-paged-sim-out-next {
          from { transform: perspective(1200px) rotateY(0deg); opacity: 1; }
          to { transform: perspective(1200px) rotateY(-85deg); opacity: 0.2; }
        }
        @keyframes reader-paged-sim-out-prev {
          from { transform: perspective(1200px) rotateY(0deg); opacity: 1; }
          to { transform: perspective(1200px) rotateY(85deg); opacity: 0.2; }
        }
        @keyframes reader-paged-sim-in-next {
          from { transform: perspective(1200px) rotateY(85deg); opacity: 0.2; }
          to { transform: perspective(1200px) rotateY(0deg); opacity: 1; }
        }
        @keyframes reader-paged-sim-in-prev {
          from { transform: perspective(1200px) rotateY(-85deg); opacity: 0.2; }
          to { transform: perspective(1200px) rotateY(0deg); opacity: 1; }
        }
        .reader-paged-turn-sim-out-next {
          animation: reader-paged-sim-out-next 0.32s ease-out forwards;
          transform-origin: left center;
        }
        .reader-paged-turn-sim-out-prev {
          animation: reader-paged-sim-out-prev 0.32s ease-out forwards;
          transform-origin: right center;
        }
        .reader-paged-turn-sim-in-next {
          animation: reader-paged-sim-in-next 0.32s ease-out forwards;
          transform-origin: right center;
        }
        .reader-paged-turn-sim-in-prev {
          animation: reader-paged-sim-in-prev 0.32s ease-out forwards;
          transform-origin: left center;
        }
      `}</style>
    </>
  );
}
