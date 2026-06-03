/**
 * Text Viewer：章节正文加载、阅读配置与 text 专用 UI 状态
 */

import { MediaKind } from '@/lib/book-source/book-type';
import * as chaptersDb from '@/lib/database/chapters';
import * as booksDb from '@/lib/database/books';
import * as sourcesDb from '@/lib/database/sources';
import { isLocalBook, getLocalContent, readLocalBookContent } from '@/lib/local-book';
import {
  readCachedChapterRaw,
  fetchAndCacheChapterContent,
} from '@/lib/chapter-cache/storage';
import { applyChapterDisplayProcessing } from '@/lib/chapter-cache/display-processing';
import {
  prefetchChaptersOnRead,
} from '@/lib/chapter-cache/prefetch';
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
  saveReaderUiConfig,
} from '@/lib/media/text/read-config-storage';
import {
  startReadingSession,
  tickReadingSession,
} from '@/lib/media/text/reading-session';
import { DEFAULT_CLICK_ACTIONS } from '@/lib/media/text/reader-click-actions';
import { DEFAULT_CLICK_REGION } from '@/lib/media/text/reader-click-region';
import type { Book, BookChapter, BookProgress, BookSource } from '@/types';
import { state, setState } from '@/stores/viewer/media/state';
import {
  clampChapterIndex,
  persistCatalogToDb,
} from '@/stores/viewer/media/chapter';
import {
  defaultTextViewerUiConfig,
  type TextViewerUiConfig,
} from '@/lib/media/text/reader-ui-config';
import { normalizeTextViewerPageAnim } from '@/lib/media/text/text-viewer-page-anim';
import { migrateReaderImageStyle } from '@/lib/js-engine/legado/legado-image-options';

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
  };
}

async function hydrateReaderConfig(): Promise<void> {
  if (configHydrated) return;
  configHydrated = true;
  const saved = await loadReaderUiConfig();
  if (saved) {
    setState('config', prev => ({
      ...prev,
      ...saved,
      spacing: { ...prev.spacing, ...saved.spacing },
      contentInset: mergeContentInset(
        prev.contentInset,
        saved.contentInset ?? (saved as { middleLeft?: number; middleRight?: number }),
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
      imageStyle: migrateReaderImageStyle(saved.imageStyle),
      pageAnim: normalizeTextViewerPageAnim(saved.pageAnim as string | undefined),
    }));
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
      const processed = await applyChapterDisplayProcessing(raw, book, source);
      setAdjacentChapterInPool(book.bookUrl, currentIndex, idx, processed);
    } catch (e) {
      console.warn('[reader] 预载相邻缓存章失败', idx, e);
    }
  }
}

function commitChapterContent(index: number, content: string, book: Book): void {
  markSessionContentReady(book.bookUrl);
  setCurrentChapterInPool(book.bookUrl, index, content);
  setState({
    chapterIndex: index,
    content,
    contentLoading: false,
    contentFetching: false,
    contentBootstrapping: false,
    showContent: true,
  });
}

function beginSessionContentLoad(bookUrl: string): void {
  setState({
    contentBootstrapping: isFirstSessionContentLoad(bookUrl),
    contentLoading: true,
    showContent: false,
  });
}

let chaptersUpdatedListenerInstalled = false;

function applyPartialCatalogUpdateImpl(
  chapters: BookChapter[],
  options: { isComplete?: boolean; preserveContent?: boolean } = {},
): void {
  if (!state.book || chapters.length === 0) return;
  const nextIndex = clampChapterIndex(state.chapterIndex, chapters.length);
  setState({
    catalog: chapters,
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
        setState({ catalog: partial.chapters, chapterIndex: idx });
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
  hasEnteredContent = false;
  resetChapterContentPool(book.bookUrl);

  const guestReading =
    !isLocalBook(book) && !(await booksDb.hasBook(book.bookUrl));

  if (!guestReading) {
    startReadingSession(book);
  }

  if (state.book?.bookUrl !== book.bookUrl || !state.contentLoading) {
    setState({
      kind: MediaKind.text,
      book,
      guestReading,
      contentFetching: false,
    });
    beginSessionContentLoad(book.bookUrl);
  } else {
    setState({ kind: MediaKind.text, guestReading });
  }

  try {
    const initialCatalog = options?.initialCatalog?.length
      ? options.initialCatalog
      : undefined;
    const rawIndex = book.durChapterIndex ?? 0;
    const chapterPos = book.durChapterPos ?? 0;
    const reverseToc = book.readConfig?.reverseToc === true;

    let catalogToUse: BookChapter[] = [];
    if (initialCatalog) {
      catalogToUse = initialCatalog;
    } else if (!guestReading) {
      catalogToUse = await chaptersDb.getChapterList(book.bookUrl);
    }

    const source =
      !isLocalBook(book) && book.origin
        ? await sourcesDb.getSource(book.origin)
        : null;

    if (catalogToUse.length === 0 && source && book.tocUrl) {
      await fetchChapterListDeduped(source, book.tocUrl, {
        reverseToc,
        bookVariable: book.variable,
        onPartial: async (partial) => {
          if (partial.chapters.length === 0) return;
          if (state.book?.bookUrl !== book.bookUrl) return;

          const idx = clampChapterIndex(rawIndex, partial.chapters.length);
          setState({
            catalog: partial.chapters,
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
            await persistCatalogToDbIfNeeded(book, partial.chapters, guestReading);
          }
        },
      });

      if (!hasEnteredContent && state.catalog.length > 0) {
        const idx = clampChapterIndex(rawIndex, state.catalog.length);
        hasEnteredContent = true;
        await loadTextChapter(idx);
      } else if (!hasEnteredContent) {
        markSessionContentReady(book.bookUrl);
        setState({
          content: '暂无章节',
          contentLoading: false,
          contentFetching: false,
          contentBootstrapping: false,
          showContent: true,
        });
      }
      return;
    }

    const chapterIndex = clampChapterIndex(rawIndex, catalogToUse.length);
    setState({
      catalog: catalogToUse,
      chapterIndex,
      chapterPos,
      contentFetching: false,
    });
    beginSessionContentLoad(book.bookUrl);

    if (catalogToUse.length === 0) {
      markSessionContentReady(book.bookUrl);
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
      beginSessionContentLoad(book.bookUrl);
    }

    if (source && book.tocUrl && isChapterListFetchInFlight(source, book.tocUrl)) {
      attachTocProgressWhileReadingImpl(book, source, guestReading);
      return;
    }

    await persistCatalogToDbIfNeeded(book, catalogToUse, guestReading);

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

  if (!forceRefresh) {
    const pooled = getPooledChapterContent(book.bookUrl, index);
    if (pooled) {
      commitChapterContent(index, pooled, book);
      const source =
        !isLocalBook(book) && book.origin
          ? await sourcesDb.getSource(book.origin)
          : null;
      void warmAdjacentChaptersFromCache(book, catalog, index, source);
      if (!isLocalBook(book)) {
        void prefetchChaptersOnRead(book, catalog, index);
      }
      await saveTextProgress();
      return;
    }
  }

  if (isLocalBook(book)) {
    setState({ contentLoading: true, chapterIndex: index });
    try {
      const fileContent = await readLocalBookContent(book.bookUrl);
      const content = (await getLocalContent(book, chapter, fileContent)) ?? '';
      commitChapterContent(index, content, book);
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
        const content = await applyChapterDisplayProcessing(
          cachedRaw,
          book,
          source,
        );
        commitChapterContent(index, content, book);
        void warmAdjacentChaptersFromCache(book, catalog, index, source);
        void prefetchChaptersOnRead(book, catalog, index);
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
    );
    const content = raw ? await applyChapterDisplayProcessing(raw, book, source) : '';

    commitChapterContent(index, content, book);
    void warmAdjacentChaptersFromCache(book, catalog, index, source);
    void prefetchChaptersOnRead(book, catalog, index);
    await saveTextProgress();
  } catch (e) {
    console.error('加载章节内容失败:', e);
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
    return state.config.theme === 6;
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
          showContent: true,
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
        void prefetchChaptersOnRead(state.book, state.catalog, entry.index);
        await saveTextProgress();
        return;
      }
    }

    await loadTextChapter(state.chapterIndex + 1);
  },

  /** 上一章 */
  async prevChapter(): Promise<void> {
    if (!state.book || state.chapterIndex <= 0) return;

    if (hasPooledPrevChapter()) {
      const entry = swapPoolToPrevChapter();
      if (entry) {
        setState({
          chapterIndex: entry.index,
          chapterPos: 0,
          content: entry.content,
          contentLoading: false,
          contentFetching: false,
          contentBootstrapping: false,
          showContent: true,
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
        void prefetchChaptersOnRead(state.book, state.catalog, entry.index);
        await saveTextProgress();
        return;
      }
    }

    await loadTextChapter(state.chapterIndex - 1);
  },

  /** 跳转到指定章节 */
  async jumpToChapter(index: number): Promise<void> {
    if (index >= 0 && index < state.catalog.length) {
      await loadTextChapter(index);
    }
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
    return book.readConfig?.useReplaceRule !== false;
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
    await this.reprocessDisplayedChapter();
  },

  /** 用当前缓存 raw 重新应用展示处理（替换规则开关等，不触发网络） */
  async reprocessDisplayedChapter(index?: number): Promise<void> {
    if (!state.book) return;
    const idx = index ?? state.chapterIndex;
    const book = state.book;
    const chapter = state.catalog[idx];
    if (!chapter) return;

    if (isLocalBook(book)) {
      setState({ contentLoading: true });
      try {
        const fileContent = await readLocalBookContent(book.bookUrl);
        const raw =
          (await getLocalContent(book, chapter, fileContent)) ?? state.content;
        const content = await applyChapterDisplayProcessing(raw, book, null);
        commitChapterContent(idx, content, book);
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
      const content = await applyChapterDisplayProcessing(raw, book, source);
      commitChapterContent(idx, content, book);
      return;
    }

    if (state.content) {
      const content = await applyChapterDisplayProcessing(
        state.content,
        book,
        source,
      );
      commitChapterContent(idx, content, book);
    }
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

  /**
   * 设置迷你界面
   */
  setMiniInterface(mini: boolean): void {
    setState({ miniInterface: mini });
  },
};

