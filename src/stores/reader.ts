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
import { getContent as getBookSourceContent } from '@/lib/book-source';
import { getChapterList as fetchChapterList, toNewBookChapter } from '@/lib/book-source/chapters';
import type { Book, BookChapter, BookProgress } from '@/types';

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
  showContent: false,
  config: defaultConfig,
  popCataVisible: false,
  readSettingsVisible: false,
  miniInterface: false,
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
    setState({
      book,
      contentLoading: true,
      showContent: false,
    });
  },

  /**
   * 打开书籍
   */
  async openBook(book: Book): Promise<void> {
    // 如果状态已经设置（通过 setBookInitialState），则跳过重复设置
    // 否则设置初始状态，立即显示 skeleton 加载状态
    if (state.book?.bookUrl !== book.bookUrl || !state.contentLoading) {
      setState({
        book,
        contentLoading: true,
        showContent: false,
      });
    }

    try {
      // 加载章节列表
      const catalog = await chaptersDb.getChapterList(book.bookUrl);
      setState({ catalog });

      // 恢复阅读进度，并限制在有效范围内
      const rawIndex = book.durChapterIndex ?? 0;
      const chapterIndex =
        catalog.length > 0
          ? Math.min(Math.max(0, rawIndex), catalog.length - 1)
          : 0;
      const chapterPos = book.durChapterPos ?? 0;

      setState({
        chapterIndex,
        chapterPos,
        // 确保在加载章节内容时保持 loading 状态
        contentLoading: true,
        showContent: false,
      });

      // 无章节时尝试从书源补拉目录（解决移动端等首次拉取失败后暂无章节/目录为空）
      let catalogToUse = catalog;
      if (catalog.length === 0 && book.tocUrl && book.origin) {
        try {
          const source = await sourcesDb.getSource(book.origin);
          if (source) {
            const chapters = await fetchChapterList(source, book.tocUrl);
            if (chapters.length > 0) {
              const newChapters = chapters.map((ch) => toNewBookChapter(ch, book.bookUrl));
              await chaptersDb.insertChapters(newChapters);
              catalogToUse = await chaptersDb.getChapterList(book.bookUrl);
              setState({ catalog: catalogToUse });
            }
          }
        } catch (e) {
          console.warn('[reader] 补拉章节列表失败:', e);
        }
      }

      if (catalogToUse.length === 0) {
        setState({
          content: '暂无章节',
          contentLoading: false,
          showContent: true,
        });
        return;
      }

      // 加载当前章节内容（若已补拉则从第一章开始）
      const indexToLoad = catalogToUse === catalog ? chapterIndex : 0;
      await this.loadChapter(indexToLoad);
    } catch (e) {
      const error = e instanceof Error ? e.message : '打开书籍失败';
      console.error(error, e);
      setState({ contentLoading: false });
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
   * 加载章节内容
   */
  async loadChapter(index: number): Promise<void> {
    if (!state.book) {
      throw new Error('未打开书籍');
    }

    if (index < 0 || index >= state.catalog.length) {
      throw new Error('章节索引超出范围');
    }

    setState({
      contentLoading: true,
      chapterIndex: index,
      showContent: false,
    });

    try {
      const chapter = state.catalog[index];
      if (!chapter) {
        throw new Error('章节不存在');
      }

      let content: string | null = null;

      // 根据书籍类型加载内容
      if (isLocalBook(state.book)) {
        const fileContent = await readLocalBookContent(state.book.bookUrl);
        content = await getLocalContent(state.book, chapter, fileContent);
      } else {
        // 在线书籍：从书源加载
        if (state.book.origin && state.book.origin !== 'local') {
          try {
            // 根据origin获取书源
            const source = await sourcesDb.getSource(state.book.origin);
            if (source && source.enabled) {
              // 获取下一章节URL（用于内容处理）
              const nextChapter = state.catalog[index + 1];
              const nextChapterUrl = nextChapter?.url;

              content = await getBookSourceContent(
                source,
                chapter,
                nextChapterUrl,
                state.book
              );
            } else {
              content = '书源不存在或已禁用';
            }
          } catch (e) {
            console.error('加载书源内容失败:', e);
            content = `加载失败: ${e instanceof Error ? e.message : '未知错误'}`;
          }
        }
      }

      if (content === null) {
        content = '内容加载失败';
      }

      setState({
        content,
        contentLoading: false,
        showContent: true,
      });

      // 保存阅读进度
      await this.saveProgress();
    } catch (e) {
      console.error('加载章节内容失败:', e);
      setState({
        content: `加载失败: ${e instanceof Error ? e.message : '未知错误'}`,
        contentLoading: false,
        showContent: true,
      });
      throw e;
    }
  },

  /**
   * 下一章
   */
  async nextChapter(): Promise<void> {
    if (state.chapterIndex < state.catalog.length - 1) {
      await this.loadChapter(state.chapterIndex + 1);
    }
  },

  /**
   * 上一章
   */
  async prevChapter(): Promise<void> {
    if (state.chapterIndex > 0) {
      await this.loadChapter(state.chapterIndex - 1);
    }
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
    if (!state.book) {
      return;
    }

    try {
      const chapter = state.catalog[state.chapterIndex];
      const chapterTitle = chapter?.title;
      const progress = Math.min(1, Math.max(0, state.chapterPos));
      await booksDb.updateReadProgress(state.book.bookUrl, {
        chapterIndex: state.chapterIndex,
        chapterPos: progress,
        chapterTitle,
      });
      // 触发书架刷新事件，让书架页面重新加载并排序
      window.dispatchEvent(new CustomEvent('bookshelf-refresh'));
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
  closeBook(): void {
    // 保存进度（saveProgress 内部会触发 bookshelf-refresh 事件）
    this.saveProgress().catch(console.error);

    // 重置状态
    setState({
      book: null,
      catalog: [],
      chapterIndex: 0,
      chapterPos: 0,
      content: '',
      contentLoading: false,
      showContent: false,
      popCataVisible: false,
    });
  },
};
