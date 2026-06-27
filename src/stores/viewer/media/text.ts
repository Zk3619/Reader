/**
 * Text Viewer：章节正文加载、阅读配置与 text 专用 UI 状态
 */

import { MediaKind } from '@/lib/book-source/book-type';
import * as chaptersDb from '@/lib/database/chapters';
import * as booksDb from '@/lib/database/books';
import * as sourcesDb from '@/lib/database/sources';
import { updateReplaceRule } from '@/lib/database/replace-rules';
import { invalidateReplaceRulesCache } from '@/lib/book-source/content-processor';
import { isReplaceRuleEnabledForBook } from '@/lib/replace-rules/replace-rule-policy';
import {
  preloadChineseConverter,
  type ChineseConverterType,
} from '@/lib/replace-rules/chinese-converter';
import { isLocalBook, getLocalContent, readLocalBookContent, ensureLocalTxtCatalogFresh } from '@/lib/local-book';
import { normalizeCatalogChapterIndices } from '@/lib/chapter-cache/catalog-cache-index';
import {
  readCachedChapterRaw,
  writeCachedChapterRaw,
  fetchAndCacheChapterContent,
} from '@/lib/chapter-cache/storage';
import { applyChapterDisplayProcessingWithMeta } from '@/lib/chapter-cache/display-processing';
import type { Book, BookChapter, BookProgress, BookSource, ReplaceRule } from '@/types';
import { scheduleChapterBodyCachePrefetch } from '@/lib/chapter-cache/prefetch';
import {
  getPooledChapterContent,
  hasPooledNextChapter,
  hasPooledPrevChapter,
  resetChapterContentPool,
  setAdjacentChapterInPool,
  setCurrentChapterInPool,
  swapPoolToNextChapter,
  swapPoolToPrevChapter,
} from '@/lib/chapter-cache/chapter-content-pool';
import {
  fetchChapterListDeduped,
  isChapterListFetchInFlight,
} from '@/lib/book-source/chapters';
import {
  loadReaderUiConfig,
  peekReaderUiConfigSync,
  saveReaderUiConfig,
} from '@/lib/media/text/read-config-storage';
import {
  startReadingSession,
  tickReadingSession,
} from '@/lib/media/text/reading-session';
import { DEFAULT_CLICK_ACTIONS } from '@/lib/media/text/reader-click-actions';
import { DEFAULT_CLICK_REGION } from '@/lib/media/text/reader-click-region';
import {
  chapterPosForChapterSwitch,
  consumePagedChapterEntry,
  markPagedChapterEntry,
  type PagedChapterEntry,
} from '@/lib/media/text/reader-paged-chapter-entry';
import { state, setState } from '@/stores/viewer/media/state';
import {
  clampChapterIndex,
  loadChapterRaw,
  persistCatalogToDb,
} from '@/stores/viewer/media/chapter';
import {
  defaultTextViewerUiConfig,
  normalizeAutoPageProgressEdge,
  normalizeAutoPageStyle,
  normalizeAutoReadSpeed,
  normalizeBrightnessViewPosition,
  normalizeTtsSpeechRate,
  normalizeSimulationDragZonePercent,
  normalizeTextViewerLayoutEngine,
  type TextViewerUiConfig,
} from '@/lib/media/text/reader-ui-config';
import {
  isReaderNightTheme,
  normalizeReaderThemeId,
} from '@/lib/media/text/reader-theme-classes';
import { normalizeTextViewerPageAnim } from '@/lib/media/text/text-viewer-page-anim';
import { migrateReaderImageStyle } from '@/lib/js-engine/legado/legado-image-options';
import { mergePageTipsConfig } from '@/components/viewer/text-viewer/ReaderPageTipControls';
import { normalizeFontWeight, normalizeReaderFontPreset } from '@/lib/media/text/reader-font';
import { normalizeTextViewerChapterTitleStyle } from '@/lib/media/text/reader-chapter-title-style';
import { settingsState } from '@/stores/settings';
import { normalizeViewerChromeLayout } from '@/lib/viewer/viewer-chrome-layout';

const defaultConfig = defaultTextViewerUiConfig;

let configHydrated = false;
let configSaveTimer: number | null = null;

/** 合并持久化边距；兼容旧版 middleLeft + middleRight */
function mergeContentInset(
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

function applySavedReaderUiConfig(
  prev: TextViewerUiConfig,
  saved: Partial<TextViewerUiConfig> & {
    middleLeft?: number;
    middleRight?: number;
    layoutEngine?: string;
  },
): TextViewerUiConfig {
  return {
    ...prev,
    ...saved,
    spacing: { ...prev.spacing, ...saved.spacing },
    contentInset: mergeContentInset(
      prev.contentInset,
      saved.contentInset ?? saved,
    ),
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
    pageAnim: normalizeTextViewerPageAnim(saved.pageAnim as string | undefined),
    simulationDragZonePercent: normalizeSimulationDragZonePercent(
      saved.simulationDragZonePercent,
    ),
    viewerChromeLayout: normalizeViewerChromeLayout(
      saved.viewerChromeLayout ?? settingsState.app.viewerChromeLayout,
    ),
    theme: normalizeReaderThemeId(saved.theme),
    autoReadSpeed: normalizeAutoReadSpeed(saved.autoReadSpeed),
    autoPageStyle: normalizeAutoPageStyle(saved.autoPageStyle as string | undefined),
    autoPageProgressEdge: normalizeAutoPageProgressEdge(
      saved.autoPageProgressEdge as string | undefined,
    ),
    font: normalizeReaderFontPreset(saved.font),
    fontWeight: normalizeFontWeight(saved.fontWeight, defaultConfig.fontWeight),
    customFontPath: saved.customFontPath ?? prev.customFontPath,
    chapterTitleStyle: normalizeTextViewerChapterTitleStyle(saved.chapterTitleStyle),
    chapterTitleSize: saved.chapterTitleSize ?? prev.chapterTitleSize,
    chapterTitleTopSpacing: saved.chapterTitleTopSpacing ?? prev.chapterTitleTopSpacing,
    chapterTitleBottomSpacing:
      saved.chapterTitleBottomSpacing ?? prev.chapterTitleBottomSpacing,
    chapterTitleFontWeight: normalizeFontWeight(
      saved.chapterTitleFontWeight,
      prev.chapterTitleFontWeight,
    ),
    paragraphIndentChars:
      saved.paragraphIndentChars ?? prev.paragraphIndentChars ?? defaultConfig.paragraphIndentChars,
    layoutEngine: normalizeTextViewerLayoutEngine(saved.layoutEngine),
    ttsSpeechRate: normalizeTtsSpeechRate(
      saved.ttsSpeechRate ?? saved.speakSpeed ?? prev.ttsSpeechRate,
    ),
    speakSpeed: normalizeTtsSpeechRate(
      saved.speakSpeed ?? saved.ttsSpeechRate ?? prev.speakSpeed,
    ),
    ttsFollowSys: saved.ttsFollowSys ?? prev.ttsFollowSys ?? true,
    ttsTimer: saved.ttsTimer ?? prev.ttsTimer ?? 0,
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
      saved.readTopBarStyleFollowPage ??
      saved.readBarStyleFollowPage ??
      prev.readTopBarStyleFollowPage ??
      false,
    readBottomBarStyleFollowPage:
      saved.readBottomBarStyleFollowPage ??
      saved.readBarStyleFollowPage ??
      prev.readBottomBarStyleFollowPage ??
      false,
    brightnessViewPosition: normalizeBrightnessViewPosition(
      saved.brightnessViewPosition ?? prev.brightnessViewPosition,
    ),
    brightnessViewStyleFollowPage:
      saved.brightnessViewStyleFollowPage ?? prev.brightnessViewStyleFollowPage ?? true,
    readAloudBarStyleFollowPage:
      saved.readAloudBarStyleFollowPage ?? prev.readAloudBarStyleFollowPage ?? false,
    pageTips: migratePageTipsFromStatusBar(
      mergePageTipsConfig(saved.pageTips),
      saved.statusBarDisplayStyle,
    ),
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

/** 将已缓存/同步读到的阅读器配置灌入 store（可在 warm 之后多次调用） */
export function applyPersistedReaderUiConfig(): void {
  const saved = peekReaderUiConfigSync();
  if (!saved) return;
  setState('config', (prev) => applySavedReaderUiConfig(prev, saved));
}

/** 打开阅读器前同步灌入持久化配置 */
function bootstrapReaderConfigSync(): void {
  applyPersistedReaderUiConfig();
}

async function hydrateReaderConfig(): Promise<void> {
  if (configHydrated) return;
  configHydrated = true;
  const saved = await loadReaderUiConfig();
  if (saved) {
    setState('config', (prev) => applySavedReaderUiConfig(prev, saved));
  }
}

function schedulePersistReaderConfig(): void {
  if (configSaveTimer !== null) clearTimeout(configSaveTimer);
  configSaveTimer = window.setTimeout(() => {
    void saveReaderUiConfig(state.config);
    configSaveTimer = null;
  }, 300);
}

/**
 * 计算属性：当前阅读进度
 */
export const bookProgress = (): BookProgress | null => {
  if (!state.book || state.catalog.length === 0) {
    return null;
  }

  const chapter = state.catalog[state.chapterIndex];
  if (!chapter) {
    return null;
  }

  const progress = Math.min(1, Math.max(0, state.chapterPos));
  return {
    name: state.book.name,
    author: state.book.author,
    durChapterIndex: state.chapterIndex,
    durChapterPos: progress,
    durChapterTime: Date.now(),
    durChapterTitle: chapter.title,
  };
};

/** 对齐 Legado：渐进目录加载过程中是否已进入正文（避免 isIncremental 时重载正文） */
let hasEnteredContent = false;

export function resetTextViewerSession(): void {
  hasEnteredContent = false;
}

/** 本会话内已完成首次正文展示的书籍（再次打开同一书不再显示「首次加载」骨架屏） */
const sessionBooksContentReady = new Set<string>();

function isFirstSessionContentLoad(bookUrl: string): boolean {
  return !sessionBooksContentReady.has(bookUrl);
}

function markSessionContentReady(bookUrl: string): void {
  sessionBooksContentReady.add(bookUrl);
}

async function warmAdjacentChaptersFromCache(
  book: Book,
  catalog: BookChapter[],
  currentIndex: number,
  source: BookSource | null,
): Promise<void> {
  if (isLocalBook(book) || !source?.enabled) return;
  for (const offset of [-1, 1] as const) {
    const idx = currentIndex + offset;
    if (idx < 0 || idx >= catalog.length) continue;
    if (getPooledChapterContent(book.bookUrl, idx)) continue;
    const raw = await readCachedChapterRaw(book.bookUrl, idx);
    if (!raw?.trim()) continue;
    try {
      const processed = await applyDisplayProcessing(raw, book, source, catalog[idx]);
      setAdjacentChapterInPool(book.bookUrl, currentIndex, idx, processed.content);
    } catch (e) {
      console.warn('[reader] 预载相邻缓存章失败', idx, e);
    }
  }
}

function readerDisplayUiConfig() {
  return {
    adaptSpecialStyle: state.config.adaptSpecialStyle,
    chineseConverterType: state.config.chineseConverterType,
    removeDuplicateTitle: state.config.removeDuplicateTitle,
  };
}

async function applyDisplayProcessing(
  raw: string,
  book: Book,
  source: Awaited<ReturnType<typeof sourcesDb.getSource>> | null,
  chapter: BookChapter | undefined,
) {
  return applyChapterDisplayProcessingWithMeta(
    raw,
    book,
    source,
    chapter,
    readerDisplayUiConfig(),
  );
}

function isScrollReadingMode(): boolean {
  return normalizeTextViewerPageAnim(state.config.pageAnim) === 'scroll';
}

/** 按页模式：正文先写入 state，待 DOM 分页完成后再 reveal */
function shouldRevealChapterContentImmediately(): boolean {
  return isScrollReadingMode();
}

function commitChapterContent(
  index: number,
  content: string,
  book: Book,
  effectiveReplaceRules: ReplaceRule[] = [],
): void {
  markSessionContentReady(book.bookUrl);
  setCurrentChapterInPool(book.bookUrl, index, content);
  setState({
    chapterIndex: index,
    content,
    contentLoading: false,
    contentFetching: false,
    contentBootstrapping: false,
    showContent: shouldRevealChapterContentImmediately(),
    effectiveReplaceRules,
  });
  const catalog = state.catalog;
  if (catalog.length > 0) {
    scheduleChapterBodyCachePrefetch(book, catalog, index);
  }
}

async function reprocessDisplayedChapterImpl(index?: number): Promise<void> {
  if (!state.book) return;
  const idx = index ?? state.chapterIndex;
  const book = state.book;
  const chapter = state.catalog[idx];
  if (!chapter) return;

  resetChapterContentPool(book.bookUrl);

  if (isLocalBook(book)) {
    setState({ contentLoading: true });
    try {
      const cachedRaw = await readCachedChapterRaw(book.bookUrl, idx);
      let raw = cachedRaw?.trim() ?? '';
      if (!raw) {
        const fileContent = await readLocalBookContent(book.bookUrl);
        raw =
          (await getLocalContent(book, chapter, fileContent)) ?? state.content;
      }
      const result = await applyDisplayProcessing(raw, book, null, chapter);
      commitChapterContent(idx, result.content, book, result.effectiveReplaceRules);
    } finally {
      setState({ contentLoading: false });
    }
    return;
  }

  const source =
    book.origin && book.origin !== 'local'
      ? await sourcesDb.getSource(book.origin)
      : null;

  const raw = await readCachedChapterRaw(book.bookUrl, idx);
  if (raw?.trim()) {
    const result = await applyDisplayProcessing(raw, book, source, chapter);
    commitChapterContent(idx, result.content, book, result.effectiveReplaceRules);
    return;
  }

  if (state.content) {
    const result = await applyDisplayProcessing(
      state.content,
      book,
      source,
      chapter,
    );
    commitChapterContent(idx, result.content, book, result.effectiveReplaceRules);
  }
}

function notifyScrollChaptersRefresh(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reader-scroll-chapters-refresh'));
  }
}

function beginSessionContentLoad(bookUrl: string): void {
  setState({
    contentBootstrapping: isFirstSessionContentLoad(bookUrl),
    contentLoading: true,
    showContent: false,
  });
}

let chaptersUpdatedListenerInstalled = false;
let replaceRulesRefreshListenerInstalled = false;

function applyPartialCatalogUpdateImpl(
  chapters: BookChapter[],
  options: { isComplete?: boolean; preserveContent?: boolean } = {},
): void {
  if (!state.book || chapters.length === 0) return;
  const normalized = normalizeCatalogChapterIndices(chapters);
  const nextIndex = clampChapterIndex(state.chapterIndex, normalized.length);
  setState({
    catalog: normalized,
    chapterIndex: nextIndex,
    book: {
      ...state.book,
      totalChapterNum: chapters.length,
      latestChapterTitle:
        chapters[chapters.length - 1]?.title ?? state.book.latestChapterTitle,
    },
  });
  if (options.isComplete && state.book) {
    void persistCatalogToDbIfNeeded(state.book, chapters, state.guestReading);
  }
}

function ensureReplaceRulesRefreshListener(): void {
  if (replaceRulesRefreshListenerInstalled) return;
  replaceRulesRefreshListenerInstalled = true;
  window.addEventListener('replace-rules-refresh', () => {
    const book = state.book;
    if (!book || state.kind !== MediaKind.text) return;
    void reprocessDisplayedChapterImpl()
      .then(notifyScrollChaptersRefresh)
      .catch(console.error);
  });
}

function ensureChaptersUpdatedListener(): void {
  if (chaptersUpdatedListenerInstalled) return;
  chaptersUpdatedListenerInstalled = true;
  window.addEventListener('book-chapters-updated', (e: Event) => {
    const detail = (e as CustomEvent<import('@/lib/bookshelf/save-book-to-shelf').BookChaptersUpdatedDetail>).detail;
    if (!detail?.bookUrl || !detail.chapters?.length) return;
    if (state.book?.bookUrl !== detail.bookUrl) return;
    applyPartialCatalogUpdateImpl(detail.chapters, {
      isComplete: detail.isComplete,
      preserveContent: hasEnteredContent || !detail.isComplete,
    });
  });
}

async function persistCatalogToDbIfNeeded(
  book: Book,
  chapters: BookChapter[],
  guestReading: boolean,
): Promise<void> {
  if (guestReading || chapters.length === 0) return;
  const source = await sourcesDb.getSource(book.origin);
  const tocInFlight =
    source && book.tocUrl ? isChapterListFetchInFlight(source, book.tocUrl) : false;
  if (tocInFlight) return;
  await persistCatalogToDb(book, chapters, guestReading);
}

function attachTocProgressWhileReadingImpl(
  book: Book,
  source: BookSource,
  guestReading: boolean,
): void {
  if (!book.tocUrl) return;
  const rawIndex = book.durChapterIndex ?? 0;
  void fetchChapterListDeduped(source, book.tocUrl, {
    reverseToc: book.readConfig?.reverseToc === true,
    bookVariable: book.variable,
    onPartial: (partial) => {
      if (partial.chapters.length === 0) return;
      if (state.book?.bookUrl !== book.bookUrl) return;

      if (!hasEnteredContent && rawIndex < partial.chapters.length) {
        hasEnteredContent = true;
        const idx = clampChapterIndex(rawIndex, partial.chapters.length);
        setState({
          catalog: normalizeCatalogChapterIndices(partial.chapters),
          chapterIndex: idx,
        });
        void loadTextChapter(idx);
        return;
      }

      applyPartialCatalogUpdateImpl(partial.chapters, {
        isComplete: partial.isComplete,
        preserveContent: hasEnteredContent,
      });
      if (partial.isComplete) {
        void persistCatalogToDbIfNeeded(book, partial.chapters, guestReading);
      }
    },
  });
}

export function setTextBookInitialState(book: Book): void {
  bootstrapReaderConfigSync();
  resetChapterContentPool(book.bookUrl);
  setState({
    kind: MediaKind.text,
    book,
    contentFetching: false,
  });
  beginSessionContentLoad(book.bookUrl);
}

export async function openTextBook(
  book: Book,
  options?: { initialCatalog?: BookChapter[] },
): Promise<void> {
  await hydrateReaderConfig();
  ensureChaptersUpdatedListener();
  ensureReplaceRulesRefreshListener();
  hasEnteredContent = false;
  resetChapterContentPool(book.bookUrl);

  const guestReading =
    !isLocalBook(book) && !(await booksDb.hasBook(book.bookUrl));

  let activeBook = book;
  if (!guestReading && isLocalBook(book)) {
    activeBook = await ensureLocalTxtCatalogFresh(book);
  }

  if (!guestReading) {
    startReadingSession(activeBook);
  }

  if (state.book?.bookUrl !== activeBook.bookUrl || !state.contentLoading) {
    setState({
      kind: MediaKind.text,
      book: activeBook,
      guestReading,
      contentFetching: false,
    });
    beginSessionContentLoad(activeBook.bookUrl);
  } else {
    setState({ kind: MediaKind.text, guestReading });
  }

  try {
    const initialCatalog = options?.initialCatalog?.length
      ? options.initialCatalog
      : undefined;
    const rawIndex = activeBook.durChapterIndex ?? 0;
    const chapterPos = activeBook.durChapterPos ?? 0;
    const reverseToc = activeBook.readConfig?.reverseToc === true;

    let catalogToUse: BookChapter[] = [];
    if (initialCatalog) {
      catalogToUse = normalizeCatalogChapterIndices(initialCatalog);
    } else if (!guestReading) {
      catalogToUse = normalizeCatalogChapterIndices(
        await chaptersDb.getChapterList(activeBook.bookUrl),
      );
    }

    const source =
      !isLocalBook(activeBook) && activeBook.origin
        ? await sourcesDb.getSource(activeBook.origin)
        : null;

    if (catalogToUse.length === 0 && source && activeBook.tocUrl) {
      setState({
        catalog: [],
        chapterIndex: rawIndex,
        chapterPos,
        contentFetching: false,
      });
      beginSessionContentLoad(activeBook.bookUrl);

      const runTocFetch = async () => {
        try {
          const chapters = await fetchChapterListDeduped(source, activeBook.tocUrl, {
            reverseToc,
            bookVariable: activeBook.variable,
            onPartial: async (partial) => {
              if (partial.chapters.length === 0) return;
              if (state.book?.bookUrl !== activeBook.bookUrl) return;

              const idx = clampChapterIndex(rawIndex, partial.chapters.length);
              setState({
                catalog: normalizeCatalogChapterIndices(partial.chapters),
                chapterIndex: idx,
                chapterPos,
              });

              if (!hasEnteredContent && rawIndex < partial.chapters.length) {
                hasEnteredContent = true;
                await loadTextChapter(idx);
              } else if (hasEnteredContent) {
                applyPartialCatalogUpdateImpl(partial.chapters, {
                  isComplete: partial.isComplete,
                  preserveContent: true,
                });
              }

              if (partial.isComplete) {
                await persistCatalogToDbIfNeeded(activeBook, partial.chapters, guestReading);
              }
            },
          });

          if (state.book?.bookUrl !== activeBook.bookUrl) return;

          if (!hasEnteredContent && chapters.length > 0) {
            const idx = clampChapterIndex(rawIndex, chapters.length);
            setState({
              catalog: normalizeCatalogChapterIndices(chapters),
              chapterIndex: idx,
              chapterPos,
            });
            hasEnteredContent = true;
            await loadTextChapter(idx);
            await persistCatalogToDbIfNeeded(activeBook, chapters, guestReading);
            return;
          }

          if (!hasEnteredContent) {
            markSessionContentReady(activeBook.bookUrl);
            setState({
              content: '暂无章节',
              contentLoading: false,
              contentFetching: false,
              contentBootstrapping: false,
              showContent: true,
            });
            return;
          }

          if (chapters.length > 0) {
            await persistCatalogToDbIfNeeded(activeBook, chapters, guestReading);
          }
        } catch (e) {
          if (state.book?.bookUrl !== activeBook.bookUrl) return;
          const error = e instanceof Error ? e.message : '加载目录失败';
          console.error(error, e);
          markSessionContentReady(activeBook.bookUrl);
          setState({
            content: `加载失败：${error}`,
            contentLoading: false,
            contentFetching: false,
            contentBootstrapping: false,
            showContent: true,
          });
        }
      };

      void runTocFetch();
      return;
    }

    const chapterIndex = clampChapterIndex(rawIndex, catalogToUse.length);
    setState({
      catalog: catalogToUse,
      chapterIndex,
      chapterPos,
      contentFetching: false,
    });
    beginSessionContentLoad(activeBook.bookUrl);

    if (catalogToUse.length === 0) {
      markSessionContentReady(activeBook.bookUrl);
      setState({
        content: '暂无章节',
        contentLoading: false,
        contentFetching: false,
        contentBootstrapping: false,
        showContent: true,
      });
      return;
    }

    if (rawIndex < catalogToUse.length) {
      hasEnteredContent = true;
      await loadTextChapter(chapterIndex);
    } else {
      beginSessionContentLoad(activeBook.bookUrl);
    }

    if (source && activeBook.tocUrl && isChapterListFetchInFlight(source, activeBook.tocUrl)) {
      attachTocProgressWhileReadingImpl(activeBook, source, guestReading);
      return;
    }

    await persistCatalogToDbIfNeeded(activeBook, catalogToUse, guestReading);

    if (!hasEnteredContent) {
      await loadTextChapter(chapterIndex);
      hasEnteredContent = true;
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : '打开书籍失败';
    console.error(error, e);
    setState({
      contentLoading: false,
      contentFetching: false,
      contentBootstrapping: false,
    });
    throw e;
  }
}

function beginChapterLoadUi(index: number): void {
  const entry = consumePagedChapterEntry();
  setState({
    chapterIndex: index,
    chapterPos: chapterPosForChapterSwitch(
      entry,
      state.chapterPos,
      isScrollReadingMode(),
    ),
    contentLoading: true,
    showContent: false,
  });
}

export async function loadTextChapter(
  index: number,
  options?: { forceRefresh?: boolean },
): Promise<void> {
  if (!state.book) {
    throw new Error('未打开书籍');
  }

  if (index < 0 || index >= state.catalog.length) {
    throw new Error('章节索引超出范围');
  }

  const book = state.book;
  const catalog = state.catalog;
  const chapter = catalog[index];
  if (!chapter) {
    throw new Error('章节不存在');
  }

  const forceRefresh = options?.forceRefresh === true;
  if (index !== state.chapterIndex || forceRefresh) {
    beginChapterLoadUi(index);
  }

  if (!forceRefresh) {
    const pooled = getPooledChapterContent(book.bookUrl, index);
    if (pooled) {
      commitChapterContent(index, pooled, book);
      const source =
        !isLocalBook(book) && book.origin
          ? await sourcesDb.getSource(book.origin)
          : null;
      void warmAdjacentChaptersFromCache(book, catalog, index, source);
      await saveTextProgress();
      return;
    }
  }

  if (isLocalBook(book)) {
    setState({ contentLoading: true, chapterIndex: index });
    try {
      const chapter = catalog[index];
      const cachedRaw = await readCachedChapterRaw(book.bookUrl, index);
      let raw = cachedRaw?.trim() ?? '';
      if (!raw && chapter) {
        const fileContent = await readLocalBookContent(book.bookUrl);
        raw = (await getLocalContent(book, chapter, fileContent)) ?? '';
      }
      const result = await applyDisplayProcessing(raw, book, null, chapter);
      commitChapterContent(index, result.content, book, result.effectiveReplaceRules);
      await saveTextProgress();
    } catch (e) {
      console.error('加载本地章节失败:', e);
      setState({
        content: `加载失败: ${e instanceof Error ? e.message : '未知错误'}`,
        contentLoading: false,
        contentFetching: false,
        showContent: true,
      });
      throw e;
    }
    return;
  }

  if (!book.origin || book.origin === 'local') {
    commitChapterContent(index, '', book);
    await saveTextProgress();
    return;
  }

  const source = await sourcesDb.getSource(book.origin);
  if (!source?.enabled) {
    commitChapterContent(index, '书源不存在或已禁用', book);
    await saveTextProgress();
    return;
  }

  const nextChapterUrl = catalog[index + 1]?.url;

  if (!forceRefresh) {
    const cachedRaw = await readCachedChapterRaw(book.bookUrl, index);
    if (cachedRaw?.trim()) {
      try {
        const result = await applyDisplayProcessing(cachedRaw, book, source, chapter);
        commitChapterContent(index, result.content, book, result.effectiveReplaceRules);
        void warmAdjacentChaptersFromCache(book, catalog, index, source);
        await saveTextProgress();
        return;
      } catch (e) {
        console.warn('[reader] 处理缓存正文失败，改从网络拉取', e);
      }
    }
  }

  setState({
    contentLoading: true,
    contentFetching: true,
    contentBootstrapping: isFirstSessionContentLoad(book.bookUrl),
    chapterIndex: index,
    showContent: false,
    ...(forceRefresh ? { content: '' } : {}),
  });

  try {
    const raw = await fetchAndCacheChapterContent(
      source,
      book,
      chapter,
      nextChapterUrl,
      index,
    );
    const result = raw
      ? await applyDisplayProcessing(raw, book, source, chapter)
      : { content: '', effectiveReplaceRules: [], sameTitleRemoved: false };
    commitChapterContent(index, result.content, book, result.effectiveReplaceRules);
    void warmAdjacentChaptersFromCache(book, catalog, index, source);
    await saveTextProgress();
  } catch (e) {
    console.error('加载章节内容失败:', e);
    const { tryAutoChangeSourceOnLoadError } = await import(
      '@/lib/media/text/try-auto-change-source'
    );
    const changed = await tryAutoChangeSourceOnLoadError(index, e);
    if (changed) return;
    markSessionContentReady(book.bookUrl);
    setState({
      content: `加载失败: ${e instanceof Error ? e.message : '未知错误'}`,
      contentLoading: false,
      contentFetching: false,
      contentBootstrapping: false,
      showContent: true,
    });
    throw e;
  }
}

/**
 * 拉取已处理正文（不切换当前章 UI；用于滚动模式预载下一章）
 */
export async function fetchProcessedChapterContent(index: number): Promise<string> {
  if (!state.book) {
    throw new Error('未打开书籍');
  }
  if (index < 0 || index >= state.catalog.length) {
    throw new Error('章节索引超出范围');
  }

  const book = state.book;
  const catalog = state.catalog;
  const chapter = catalog[index];
  if (!chapter) {
    throw new Error('章节不存在');
  }

  const pooled = getPooledChapterContent(book.bookUrl, index);
  if (pooled) return pooled;

  const raw = await loadChapterRaw(book, chapter, catalog, index, false);
  const source =
    !isLocalBook(book) && book.origin
      ? await sourcesDb.getSource(book.origin)
      : null;
  const result = raw
    ? await applyDisplayProcessing(raw, book, source, chapter)
    : { content: '', effectiveReplaceRules: [], sameTitleRemoved: false };
  setAdjacentChapterInPool(book.bookUrl, state.chapterIndex, index, result.content);
  return result.content;
}

export async function saveTextProgress(): Promise<void> {
  const book = state.book;
  if (!book || state.guestReading) {
    return;
  }
  tickReadingSession();

  const bookUrl = book.bookUrl;
  const chapterIndex = state.chapterIndex;
  const chapterPos = Math.min(1, Math.max(0, state.chapterPos));
  const chapterTitle = state.catalog[chapterIndex]?.title;

  try {
    await booksDb.updateReadProgress(bookUrl, {
      chapterIndex,
      chapterPos,
      chapterTitle,
    });
    window.dispatchEvent(
      new CustomEvent('bookshelf-book-updated', {
        detail: { bookUrl },
      }),
    );
  } catch (e) {
    console.error('保存阅读进度失败:', e);
  }
}

/**
 * 文本 Viewer 专用 Actions（共享 open/close/save 与 viewerStore）
 */
export const textViewerTextApi = {
  /** 获取状态 */
  get state() {
    return state;
  },

  /** 获取阅读进度 */
  get bookProgress() {
    return bookProgress();
  },

  /** 获取当前主题 */
  get theme() {
    return state.config.theme;
  },

  /** 是否夜间模式 */
  get isNight() {
    return isReaderNightTheme(state.config.theme);
  },

  /** 设置书籍初始状态（用于立即显示 skeleton） */
  setBookInitialState(book: Book): void {
    setTextBookInitialState(book);
  },

  /**
   * 渐进目录更新（对齐 Legado ReadBook.onChapterListUpdated）
   * preserveContent=true 时只刷新目录，不重载正文
   */
  applyPartialCatalogUpdate(
    chapters: BookChapter[],
    options: { isComplete?: boolean; preserveContent?: boolean } = {},
  ): void {
    applyPartialCatalogUpdateImpl(chapters, options);
  },

  attachTocProgressWhileReading(
    book: Book,
    source: BookSource,
    guestReading: boolean,
  ): void {
    attachTocProgressWhileReadingImpl(book, source, guestReading);
  },

  /** 下一章 */
  async nextChapter(): Promise<void> {
    if (!state.book || state.chapterIndex >= state.catalog.length - 1) return;

    markPagedChapterEntry('first');

    if (hasPooledNextChapter()) {
      const entry = swapPoolToNextChapter();
      if (entry) {
        setState({
          chapterIndex: entry.index,
          chapterPos: 0,
          content: entry.content,
          contentLoading: false,
          contentFetching: false,
          contentBootstrapping: false,
          showContent: shouldRevealChapterContentImmediately(),
        });
        const source = state.book.origin
          ? await sourcesDb.getSource(state.book.origin)
          : null;
        void warmAdjacentChaptersFromCache(
          state.book,
          state.catalog,
          entry.index,
          source,
        );
        scheduleChapterBodyCachePrefetch(
          state.book,
          state.catalog,
          entry.index,
        );
        await saveTextProgress();
        return;
      }
    }

    await loadTextChapter(state.chapterIndex + 1);
  },

  /** 上一章 */
  async prevChapter(): Promise<void> {
    if (!state.book || state.chapterIndex <= 0) return;

    markPagedChapterEntry('last');

    if (hasPooledPrevChapter()) {
      const entry = swapPoolToPrevChapter();
      if (entry) {
        setState({
          chapterIndex: entry.index,
          chapterPos: isScrollReadingMode() ? 0 : 1,
          content: entry.content,
          contentLoading: false,
          contentFetching: false,
          contentBootstrapping: false,
          showContent: shouldRevealChapterContentImmediately(),
        });
        const source = state.book.origin
          ? await sourcesDb.getSource(state.book.origin)
          : null;
        void warmAdjacentChaptersFromCache(
          state.book,
          state.catalog,
          entry.index,
          source,
        );
        scheduleChapterBodyCachePrefetch(
          state.book,
          state.catalog,
          entry.index,
        );
        await saveTextProgress();
        return;
      }
    }

    await loadTextChapter(state.chapterIndex - 1);
  },

  /** 跳转到指定章节（目录等默认章首；书签等可传 restore + chapterPos） */
  async jumpToChapter(
    index: number,
    options?: { entry?: PagedChapterEntry; chapterPos?: number },
  ): Promise<void> {
    if (index >= 0 && index < state.catalog.length) {
      if (options?.chapterPos != null) {
        setState({
          chapterPos: Math.min(1, Math.max(0, options.chapterPos)),
        });
      }
      markPagedChapterEntry(options?.entry ?? 'first');
      await loadTextChapter(index);
    }
  },

  /**
   * 滚动阅读：仅更新章索引与章内进度，不触发正文重载
   */
  setScrollReadingPosition(chapterIndex: number, chapterPos: number): void {
    if (!state.book) return;
    const idx = clampChapterIndex(chapterIndex, state.catalog.length);
    const pos = Math.min(1, Math.max(0, chapterPos));
    if (state.chapterIndex === idx && state.chapterPos === pos) return;
    setState({ chapterIndex: idx, chapterPos: pos });
  },

  /**
   * 设置阅读配置
   */
  setConfig(config: Partial<TextViewerUiConfig>): void {
    setState('config', prev => ({ ...prev, ...config }));
    schedulePersistReaderConfig();
  },

  /** 重置阅读配置为默认值 */
  resetConfig(): void {
    setState({ config: { ...defaultConfig } });
    schedulePersistReaderConfig();
  },

  /** 当前书是否启用替换规则（Legado 阅读内开关） */
  isUseReplaceRule(): boolean {
    const book = state.book;
    if (!book) return true;
    return isReplaceRuleEnabledForBook(book);
  },

  /**
   * 切换当前书替换规则并刷新展示（不删缓存，仅重跑 display processing）
   */
  async setUseReplaceRule(enabled: boolean): Promise<void> {
    if (!state.book) return;
    const book = state.book;
    const readConfig = { ...book.readConfig, useReplaceRule: enabled };
    setState('book', { ...book, readConfig });
    if (!state.guestReading) {
      await booksDb.updateBook({ ...book, readConfig });
    }
    await reprocessDisplayedChapterImpl();
    notifyScrollChaptersRefresh();
  },

  isReSegment(): boolean {
    return state.book?.readConfig?.reSegment === true;
  },

  async setReSegment(enabled: boolean): Promise<void> {
    if (!state.book) return;
    const book = state.book;
    const readConfig = { ...book.readConfig, reSegment: enabled };
    setState('book', { ...book, readConfig });
    if (!state.guestReading) {
      await booksDb.updateBook({ ...book, readConfig });
    }
    await reprocessDisplayedChapterImpl();
    notifyScrollChaptersRefresh();
  },

  getChineseConverterType(): ChineseConverterType {
    return (state.config.chineseConverterType ?? 0) as ChineseConverterType;
  },

  async setChineseConverterType(type: ChineseConverterType): Promise<void> {
    this.setConfig({ chineseConverterType: type });
    if (type !== 0) await preloadChineseConverter(type);
    await reprocessDisplayedChapterImpl();
    notifyScrollChaptersRefresh();
  },

  isRemoveDuplicateTitle(): boolean {
    return state.config.removeDuplicateTitle !== false;
  },

  async setRemoveDuplicateTitle(enabled: boolean): Promise<void> {
    this.setConfig({ removeDuplicateTitle: enabled });
    await reprocessDisplayedChapterImpl();
    notifyScrollChaptersRefresh();
  },

  /** 禁用一条生效的替换规则并刷新当前章 */
  async disableEffectiveReplaceRule(ruleId: number): Promise<void> {
    const rule = state.effectiveReplaceRules.find((r) => r.id === ruleId);
    if (!rule) return;
    await updateReplaceRule({ ...rule, isEnabled: false });
    invalidateReplaceRulesCache();
    await reprocessDisplayedChapterImpl();
    notifyScrollChaptersRefresh();
  },

  /** 用当前缓存 raw 重新应用展示处理（替换规则开关等，不触发网络） */
  async reprocessDisplayedChapter(index?: number): Promise<void> {
    await reprocessDisplayedChapterImpl(index);
  },

  /**
   * 单章换源：写入当前章缓存并刷新展示（对齐 Legado replaceContent / saveContent）
   */
  async replaceChapterContent(raw: string, chapterIndex?: number): Promise<void> {
    if (!state.book) return;
    const idx = chapterIndex ?? state.chapterIndex;
    const chapter = state.catalog[idx];
    if (!chapter) return;

    await writeCachedChapterRaw(state.book, idx, raw);
    resetChapterContentPool(state.book.bookUrl);

    const source =
      state.book.origin && state.book.origin !== 'local'
        ? await sourcesDb.getSource(state.book.origin)
        : null;
    const result = await applyDisplayProcessing(raw, state.book, source, chapter);
    commitChapterContent(idx, result.content, state.book, result.effectiveReplaceRules);
    notifyScrollChaptersRefresh();
  },

  /**
   * 显示/隐藏目录弹窗
   */
  setPopCataVisible(visible: boolean): void {
    setState({ popCataVisible: visible });
  },

  /**
   * 显示/隐藏阅读设置
   */
  setReadSettingsVisible(visible: boolean): void {
    setState({ readSettingsVisible: visible });
  },

  /**
   * 显示/隐藏内容
   */
  setShowContent(visible: boolean): void {
    setState({ showContent: visible });
  },

  /** 按页模式：DOM 分页完成后由 ReaderPagedViewport 调用以展示正文 */
  revealPagedChapterContent(): void {
    if (shouldRevealChapterContentImmediately()) return;
    if (state.showContent) return;
    setState({ showContent: true });
  },

  /**
   * 设置迷你界面
   */
  setMiniInterface(mini: boolean): void {
    setState({ miniInterface: mini });
  },
};

bootstrapReaderConfigSync();

