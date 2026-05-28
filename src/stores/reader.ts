/**
 * 阅读器状态管理
 * 对应 legado 项目的 ReadBook.kt 和 bookStore (web模块)
 * 
 * 功能：
 * 1. 管理当前阅读的书籍
 * 2. 管理章节列表和当前章节
 * 3. 管理阅读内容
 * 4. 管理阅读配置
 * 5. 管理阅读进度
 */

import { createStore } from 'solid-js/store';
import * as chaptersDb from '@/lib/database/chapters';
import * as booksDb from '@/lib/database/books';
import * as sourcesDb from '@/lib/database/sources';
import { isLocalBook, getLocalContent, readLocalBookContent } from '@/lib/local-book';
import {
  readCachedChapterRaw,
  fetchAndCacheChapterContent,
  deleteCachedChapter,
} from '@/lib/chapter-cache/storage';
import { applyChapterDisplayProcessing } from '@/lib/chapter-cache/display-processing';
import {
  prefetchChaptersOnRead,
} from '@/lib/chapter-cache/prefetch';
import {
  clearChapterContentPool,
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
  toNewBookChapter,
} from '@/lib/book-source/chapters';
import { updateBookChapterMeta } from '@/lib/bookshelf/save-book-to-shelf';
import type { Book, BookChapter, BookProgress } from '@/types';
import type { BookSource } from '@/types';

/**
 * 阅读配置
 */
export interface ReadConfig {
  /** 主题：0-6 */
  theme: number;
  /** 字体：0-系统默认 */
  font: number;
  /** 字体大小 */
  fontSize: number;
  /** 阅读宽度 */
  readWidth: number;
  /** 无限滚动 */
  infiniteLoading: boolean;
  /** 自定义字体名称 */
  customFontName: string;
  /** 跳转动画时长（毫秒） */
  jumpDuration: number;
  /** 间距设置 */
  spacing: {
    /** 段落间距 */
    paragraph: number;
    /** 行间距 */
    line: number;
    /** 字间距 */
    letter: number;
  };
  /** 阅读进度状态栏显示：follow=跟随操作栏显隐，always=始终显示，never=始终隐藏 */
  statusBarDisplayStyle: 'follow' | 'always' | 'never';
}

/**
 * 默认阅读配置
 */
const defaultConfig: ReadConfig = {
  theme: 0,
  font: 0,
  fontSize: 18,
  readWidth: 800,
  infiniteLoading: false,
  customFontName: '',
  jumpDuration: 1000,
  spacing: {
    paragraph: 1,
    line: 0.8,
    letter: 0,
  },
  statusBarDisplayStyle: 'follow',
};

/**
 * 阅读器状态接口
 */
export interface ReaderState {
  /** 当前阅读的书籍 */
  book: Book | null;
  /** 章节列表 */
  catalog: BookChapter[];
  /** 当前章节索引 */
  chapterIndex: number;
  /** 当前章节阅读位置（字符位置） */
  chapterPos: number;
  /** 当前章节内容 */
  content: string;
  /** 内容加载状态 */
  contentLoading: boolean;
  /** 正在从网络拉取正文 */
  contentFetching: boolean;
  /** 本会话内该书首次加载正文（读缓存/内存，显示骨架屏） */
  contentBootstrapping: boolean;
  /** 是否显示内容 */
  showContent: boolean;
  /** 阅读配置 */
  config: ReadConfig;
  /** 是否显示目录弹窗 */
  popCataVisible: boolean;
  /** 是否显示阅读设置 */
  readSettingsVisible: boolean;
  /** 是否迷你界面 */
  miniInterface: boolean;
  /** 未上架试读：不写阅读进度与章节目录到数据库 */
  guestReading: boolean;
}

/**
 * 创建阅读器状态
 */
const [state, setState] = createStore<ReaderState>({
  book: null,
  catalog: [],
  chapterIndex: 0,
  chapterPos: 0,
  content: '',
  contentLoading: false,
  contentFetching: false,
  contentBootstrapping: false,
  showContent: false,
  config: defaultConfig,
  popCataVisible: false,
  readSettingsVisible: false,
  miniInterface: false,
  guestReading: false,
});

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

function clampChapterIndex(index: number, catalogLength: number): number {
  if (catalogLength <= 0) return 0;
  return Math.min(Math.max(0, index), catalogLength - 1);
}

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
  const dbCount = await chaptersDb.getChapterCount(book.bookUrl);
  if (dbCount >= chapters.length) return;
  await chaptersDb.deleteChaptersByBook(book.bookUrl);
  await chaptersDb.insertChapters(chapters.map((ch) => toNewBookChapter(ch, book.bookUrl)));
  await updateBookChapterMeta(book.bookUrl, chapters);
}

/**
 * 阅读器Store Actions
 */
export const readerStore = {
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

  /**
   * 设置书籍初始状态（用于立即显示 skeleton）
   */
  setBookInitialState(book: Book): void {
    resetChapterContentPool(book.bookUrl);
    setState({
      book,
      contentFetching: false,
    });
    beginSessionContentLoad(book.bookUrl);
  },

  /**
   * 打开书籍
   * @param initialCatalog 详情页等已预加载的目录，避免重复请求书源
   */
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
    if (!book.tocUrl) return;
    const rawIndex = book.durChapterIndex ?? 0;
    void fetchChapterListDeduped(source, book.tocUrl, {
      reverseToc: book.readConfig?.reverseToc === true,
      onPartial: (partial) => {
        if (partial.chapters.length === 0) return;
        if (state.book?.bookUrl !== book.bookUrl) return;

        if (!hasEnteredContent && rawIndex < partial.chapters.length) {
          hasEnteredContent = true;
          const idx = clampChapterIndex(rawIndex, partial.chapters.length);
          setState({ catalog: partial.chapters, chapterIndex: idx });
          void this.loadChapter(idx);
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
  },

  async openBook(
    book: Book,
    options?: { initialCatalog?: BookChapter[] },
  ): Promise<void> {
    ensureChaptersUpdatedListener();
    hasEnteredContent = false;
    resetChapterContentPool(book.bookUrl);

    const guestReading =
      !isLocalBook(book) && !(await booksDb.hasBook(book.bookUrl));

    if (state.book?.bookUrl !== book.bookUrl || !state.contentLoading) {
      setState({
        book,
        guestReading,
        contentFetching: false,
      });
      beginSessionContentLoad(book.bookUrl);
    } else {
      setState({ guestReading });
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

      // 无目录：对齐 Legado loadChapterListProgressive（Flow 边拉边进正文）
      if (catalogToUse.length === 0 && source && book.tocUrl) {
        await fetchChapterListDeduped(source, book.tocUrl, {
          reverseToc,
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
              await this.loadChapter(idx);
            } else if (hasEnteredContent) {
              this.applyPartialCatalogUpdate(partial.chapters, {
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
          await this.loadChapter(idx);
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

      // 已覆盖阅读进度：立刻进正文（Legado: durChapterIndex < chapters.size）
      if (rawIndex < catalogToUse.length) {
        hasEnteredContent = true;
        await this.loadChapter(chapterIndex);
      } else {
        beginSessionContentLoad(book.bookUrl);
      }

      if (source && book.tocUrl && isChapterListFetchInFlight(source, book.tocUrl)) {
        this.attachTocProgressWhileReading(book, source, guestReading);
        return;
      }

      await persistCatalogToDbIfNeeded(book, catalogToUse, guestReading);

      if (!hasEnteredContent) {
        await this.loadChapter(chapterIndex);
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
  },

  /**
   * 加载章节列表
   */
  async loadCatalog(bookUrl: string): Promise<BookChapter[]> {
    // 如果是当前书籍且已有缓存，直接返回
    if (state.book?.bookUrl === bookUrl && state.catalog.length > 0) {
      return state.catalog;
    }

    try {
      const catalog = await chaptersDb.getChapterList(bookUrl);

      // 如果是当前书籍，更新状态
      if (state.book?.bookUrl === bookUrl) {
        setState({ catalog });
      }

      return catalog;
    } catch (e) {
      console.error('加载章节列表失败:', e);
      throw e;
    }
  },

  /**
   * 刷新当前章节（对齐 legado ReadBookViewModel.refreshContentDur：删缓存后重新拉取）
   */
  async refreshChapter(index?: number): Promise<void> {
    if (!state.book) {
      throw new Error('未打开书籍');
    }
    const idx = index ?? state.chapterIndex;
    if (!isLocalBook(state.book) && state.book.origin && state.book.origin !== 'local') {
      await deleteCachedChapter(state.book.bookUrl, idx);
    }
    await this.loadChapter(idx, { forceRefresh: true });
  },

  /**
   * 加载章节内容
   */
  async loadChapter(
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

    // 内存池命中（相邻章预载）：即时切换，对齐 Legado moveToNext/PrevChapter
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
        await this.saveProgress();
        return;
      }
    }

    // 本地书：直接读文件，不显示骨架屏
    if (isLocalBook(book)) {
      setState({ contentLoading: true, chapterIndex: index });
      try {
        const fileContent = await readLocalBookContent(book.bookUrl);
        const content =
          (await getLocalContent(book, chapter, fileContent)) ?? '内容加载失败';
        commitChapterContent(index, content, book);
        await this.saveProgress();
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
      commitChapterContent(index, '内容加载失败', book);
      await this.saveProgress();
      return;
    }

    const source = await sourcesDb.getSource(book.origin);
    if (!source?.enabled) {
      commitChapterContent(index, '书源不存在或已禁用', book);
      await this.saveProgress();
      return;
    }

    const nextChapterUrl = catalog[index + 1]?.url;

    // 磁盘缓存：读库即可，不显示骨架屏、不隐藏当前正文
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
          await this.saveProgress();
          return;
        } catch (e) {
          console.warn('[reader] 处理缓存正文失败，改从网络拉取', e);
        }
      }
    }

    // 网络拉取：显示骨架屏（含本会话首次打开）
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
      const content = raw
        ? await applyChapterDisplayProcessing(raw, book, source)
        : '内容加载失败';

      commitChapterContent(index, content, book);
      void warmAdjacentChaptersFromCache(book, catalog, index, source);
      void prefetchChaptersOnRead(book, catalog, index);
      await this.saveProgress();
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
  },

  /**
   * 下一章
   */
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
        await this.saveProgress();
        return;
      }
    }

    await this.loadChapter(state.chapterIndex + 1);
  },

  /**
   * 上一章
   */
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
        await this.saveProgress();
        return;
      }
    }

    await this.loadChapter(state.chapterIndex - 1);
  },

  /**
   * 跳转到指定章节
   */
  async jumpToChapter(index: number): Promise<void> {
    if (index >= 0 && index < state.catalog.length) {
      await this.loadChapter(index);
    }
  },

  /**
   * 设置章节阅读位置
   */
  setChapterPos(pos: number): void {
    setState({ chapterPos: pos });
  },

  /**
   * 保存阅读进度
   */
  async saveProgress(): Promise<void> {
    const book = state.book;
    if (!book || state.guestReading) {
      return;
    }

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
  },

  /**
   * 设置阅读配置
   */
  setConfig(config: Partial<ReadConfig>): void {
    setState('config', prev => ({ ...prev, ...config }));
  },

  /**
   * 重置阅读配置为默认值
   */
  resetConfig(): void {
    setState({ config: defaultConfig });
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

  /**
   * 关闭书籍
   */
  async closeBook(): Promise<void> {
    if (!state.guestReading) {
      await this.saveProgress();
    }

    hasEnteredContent = false;
    clearChapterContentPool();

    setState({
      book: null,
      catalog: [],
      chapterIndex: 0,
      chapterPos: 0,
      content: '',
      contentLoading: false,
      contentFetching: false,
      contentBootstrapping: false,
      showContent: false,
      popCataVisible: false,
      guestReading: false,
    });
  },

  isGuestReading(): boolean {
    return state.guestReading;
  },
};
