/**
 * 书架状态管理
 * 对应 legado 项目的 bookStore (web模块)
 * 
 * 功能：
 * 1. 管理书架书籍列表
 * 2. 管理当前选中的分组
 * 3. 管理搜索状态
 * 4. 提供书籍的增删改查操作
 */

import { createStore } from 'solid-js/store';
import * as booksDb from '@/lib/database/books';
import type { Book } from '@/types';
import { getMediaShelfStorage, setMediaShelfStorage } from '@/lib/media-shelf/compat-keys';
import {
  loadBookshelfPageShowGroupList,
  saveBookshelfPageShowGroupList,
} from '@/lib/search/search-prefs';

/**
 * 书架状态接口
 */
export interface BookshelfState {
  /** 书架书籍列表 */
  books: Book[];
  /** 加载状态 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 当前选中的分组ID，-1表示全部 */
  currentGroup: number;
  /** 当前分组显示名称（用于导航栏等） */
  currentGroupName: string;
  /** 常规分组样式下是否显示分组页（true=分组列表，false=该分组的书籍列表） */
  showGroupList: boolean;
  /** 搜索关键词 */
  searchQuery: string;
  /** 是否显示分组选择器 */
  showGroupSelector: boolean;
}

/**
 * 存储键名
 */
const STORAGE_KEY_CURRENT_GROUP = 'bookshelf_currentGroup';
const STORAGE_KEY_CURRENT_GROUP_NAME = 'bookshelf_currentGroupName';
/**
 * 从存储恢复状态
 */
async function restoreStateFromStorage(): Promise<Partial<BookshelfState>> {
  try {
    const [currentGroup, currentGroupName, showGroupList] = await Promise.all([
      getMediaShelfStorage<number>(STORAGE_KEY_CURRENT_GROUP),
      getMediaShelfStorage<string>(STORAGE_KEY_CURRENT_GROUP_NAME),
      loadBookshelfPageShowGroupList(),
    ]);

    return {
      currentGroup: currentGroup ?? -1,
      currentGroupName: currentGroupName ?? '全部',
      showGroupList,
    };
  } catch (error) {
    console.warn('从存储恢复书架状态失败:', error);
    return {
      currentGroup: -1,
      currentGroupName: '全部',
      showGroupList: true,
    };
  }
}

/**
 * 创建书架状态（初始值，稍后从存储恢复）
 */
const [state, setState] = createStore<BookshelfState>({
  books: [],
  loading: false,
  error: null,
  currentGroup: -1,
  currentGroupName: '全部',
  showGroupList: true,
  searchQuery: '',
  showGroupSelector: false,
});

/**
 * 状态恢复完成标志和 Promise
 */
let stateRestored = false;
const stateRestoredPromise = (async () => {
  try {
    const restoredState = await restoreStateFromStorage();
    setState({
      currentGroup: restoredState.currentGroup ?? -1,
      currentGroupName: restoredState.currentGroupName ?? '全部',
      showGroupList: restoredState.showGroupList ?? true,
    });
    stateRestored = true;
  } catch (error) {
    console.warn('恢复书架状态失败:', error);
    stateRestored = true; // 即使失败也标记为完成，避免无限等待
  }
})();

// 立即开始恢复状态
stateRestoredPromise.catch(() => {
  // 错误已在上面处理
});

/**
 * 计算属性：过滤后的书籍
 */
export const filteredBooks = (): Book[] => {
  let books = state.books;

  // 按分组过滤
  if (state.currentGroup >= 0) {
    books = books.filter(b => {
      // 使用位运算检查分组
      return b.group !== undefined && (b.group & state.currentGroup) !== 0;
    });
  }

  // 按搜索关键词过滤
  if (state.searchQuery) {
    const query = state.searchQuery.toLowerCase();
    books = books.filter(b =>
      b.name.toLowerCase().includes(query) ||
      b.author?.toLowerCase().includes(query) ||
      b.intro?.toLowerCase().includes(query)
    );
  }

  // 按最后阅读时间排序
  return books.sort((a, b) => {
    const timeA = a.durChapterTime || 0;
    const timeB = b.durChapterTime || 0;
    return timeB - timeA;
  });
};

/**
 * 书架Store Actions
 */
export const bookshelfStore = {
  /** 获取状态 */
  get state() {
    return state;
  },

  /** 获取过滤后的书籍 */
  get filteredBooks() {
    return filteredBooks();
  },

  /**
   * 加载书架书籍
   * 优先返回内存缓存，如果缓存为空则从数据库加载
   */
  async loadBooks(): Promise<Book[]> {
    // 如果已有缓存，直接返回
    if (state.books.length > 0 && !state.loading) {
      return state.books;
    }

    setState({ loading: true, error: null });

    try {
      const books = await booksDb.getAllBooks();
      setState({ books, loading: false });
      return books;
    } catch (e) {
      const error = e instanceof Error ? e.message : '加载书架失败';
      setState({ error, loading: false });
      throw e;
    }
  },

  /**
   * 刷新书架（强制从数据库重新加载）
   */
  async refreshBooks(): Promise<void> {
    setState({ loading: true, error: null });

    try {
      const books = await booksDb.getAllBooks();
      setState({ books, loading: false });
    } catch (e) {
      const error = e instanceof Error ? e.message : '刷新书架失败';
      setState({ error, loading: false });
      throw e;
    }
  },

  /**
   * 添加书籍到书架（含同名同作者迁移）
   */
  async addBook(book: Book): Promise<void> {
    try {
      const { saveBookToShelf } = await import('@/lib/bookshelf/save-book-to-shelf');
      const saved = await saveBookToShelf(
        {
          bookUrl: book.bookUrl,
          tocUrl: book.tocUrl,
          name: book.name,
          author: book.author,
          kind: book.kind,
          intro: book.intro,
          coverUrl: book.coverUrl,
          charset: book.charset,
          origin: book.origin,
          originName: book.originName,
          type: book.type,
        },
        { fetchChapters: false }
      );
      if (!saved) {
        throw new Error('添加书籍失败');
      }
      setState('books', (books) => {
        const without = books.filter(
          (b) => b.bookUrl !== book.bookUrl && !(b.name === saved.name && b.author === saved.author)
        );
        return [...without, saved];
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : '添加书籍失败';
      setState({ error });
      throw e;
    }
  },

  /**
   * 从书架删除书籍
   */
  async removeBook(bookUrl: string): Promise<void> {
    try {
      await booksDb.deleteBook(bookUrl);
      setState('books', books => books.filter(b => b.bookUrl !== bookUrl));
    } catch (e) {
      const error = e instanceof Error ? e.message : '删除书籍失败';
      setState({ error });
      throw e;
    }
  },

  /**
   * 更新书籍信息
   */
  async updateBook(bookUrl: string, updates: Partial<Book>): Promise<void> {
    try {
      const book = state.books.find(b => b.bookUrl === bookUrl);
      if (!book) {
        throw new Error('书籍不存在');
      }

      const updatedBook = { ...book, ...updates };
      await booksDb.updateBook(updatedBook);

      setState('books', books =>
        books.map(b => b.bookUrl === bookUrl ? updatedBook : b)
      );
    } catch (e) {
      const error = e instanceof Error ? e.message : '更新书籍失败';
      setState({ error });
      throw e;
    }
  },

  /**
   * 更新阅读进度
   */
  async updateReadProgress(
    bookUrl: string,
    update: booksDb.ReadProgressUpdate
  ): Promise<void> {
    try {
      await booksDb.updateReadProgress(bookUrl, update);
      const chapterPos = Math.min(1, Math.max(0, update.chapterPos));

      setState('books', books =>
        books.map(b => {
          if (b.bookUrl === bookUrl) {
            return {
              ...b,
              durChapterIndex: update.chapterIndex,
              durChapterPos: chapterPos,
              durChapterTime: Date.now(),
              durChapterTitle: update.chapterTitle ?? b.durChapterTitle,
            };
          }
          return b;
        })
      );
    } catch (e) {
      const error = e instanceof Error ? e.message : '更新阅读进度失败';
      setState({ error });
      throw e;
    }
  },

  /**
   * 设置当前分组
   */
  setCurrentGroup(groupId: number): void {
    setState({ currentGroup: groupId });
    // 异步保存到存储（不阻塞 UI）
    setMediaShelfStorage(STORAGE_KEY_CURRENT_GROUP, groupId).catch((error) => {
      console.warn('保存当前分组到存储失败:', error);
    });
  },

  /**
   * 设置当前分组显示名称
   */
  setCurrentGroupName(name: string): void {
    setState({ currentGroupName: name });
    // 异步保存到存储（不阻塞 UI）
    setMediaShelfStorage(STORAGE_KEY_CURRENT_GROUP_NAME, name).catch((error) => {
      console.warn('保存当前分组名称到存储失败:', error);
    });
  },

  /**
   * 常规模式下：是否显示分组页（分组列表）。false 表示显示该分组的书籍列表。
   */
  setShowGroupList(show: boolean): void {
    setState({ showGroupList: show });
    saveBookshelfPageShowGroupList(show).catch((error) => {
      console.warn('保存显示分组页状态到存储失败:', error);
    });
  },

  /**
   * 设置搜索关键词
   */
  setSearchQuery(query: string): void {
    setState({ searchQuery: query });
  },

  /**
   * 显示/隐藏分组选择器
   */
  setShowGroupSelector(show: boolean): void {
    setState({ showGroupSelector: show });
  },

  /**
   * 清除错误信息
   */
  clearError(): void {
    setState({ error: null });
  },

  /**
   * 根据bookUrl获取书籍
   */
  getBook(bookUrl: string): Book | undefined {
    return state.books.find(b => b.bookUrl === bookUrl);
  },

  /**
   * 检查书籍是否在书架中
   */
  hasBook(bookUrl: string): boolean {
    return state.books.some(b => b.bookUrl === bookUrl);
  },

  /**
   * 等待状态恢复完成
   */
  async waitForStateRestore(): Promise<void> {
    await stateRestoredPromise;
  },

  /**
   * 检查状态是否已恢复
   */
  get isStateRestored() {
    return stateRestored;
  },
};
