/**
 * 书源状态管理
 * 对应 legado 项目的 sourceStore (web模块)
 * 
 * 功能：
 * 1. 管理书源列表
 * 2. 管理当前编辑的书源
 * 3. 管理RSS源列表
 * 4. 提供书源的增删改查操作
 */

import { createStore } from 'solid-js/store';
import * as sourcesDb from '@/lib/database/sources';
import * as rssSourcesDb from '@/lib/database/rss-sources';
import {
  purgeBookSourceSession,
} from '@/lib/book-source/purge-source-session';
import type { BookSource, RssSource } from '@/types';

/**
 * 书源状态接口
 */
export interface SourcesState {
  /** 书源列表 */
  bookSources: BookSource[];
  /** RSS源列表 */
  rssSources: RssSource[];
  /** 当前编辑的书源 */
  currentSource: BookSource | RssSource | null;
  /** 当前标签页：editTab | editDebug */
  currentTab: string;
  /** 是否正在调试 */
  isDebuging: boolean;
  /** 加载状态 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
}

/**
 * 创建书源状态
 */
const [state, setState] = createStore<SourcesState>({
  bookSources: [],
  rssSources: [],
  currentSource: null,
  currentTab: 'editTab',
  isDebuging: false,
  loading: false,
  error: null,
});

/**
 * 书源Store Actions
 */
export const sourcesStore = {
  /** 获取状态 */
  get state() {
    return state;
  },

  /**
   * 加载书源列表
   */
  async loadBookSources(): Promise<BookSource[]> {
    // 如果已有缓存，直接返回
    if (state.bookSources.length > 0 && !state.loading) {
      return state.bookSources;
    }

    setState({ loading: true, error: null });

    try {
      const sources = await sourcesDb.getAllSources();
      setState({ bookSources: sources, loading: false });
      return sources;
    } catch (e) {
      const error = e instanceof Error ? e.message : '加载书源失败';
      setState({ error, loading: false });
      throw e;
    }
  },

  /**
   * 加载RSS源列表
   */
  async loadRssSources(): Promise<RssSource[]> {
    // 如果已有缓存，直接返回
    if (state.rssSources.length > 0 && !state.loading) {
      return state.rssSources;
    }

    setState({ loading: true, error: null });

    try {
      const sources = await rssSourcesDb.getAllRssSources();
      setState({ rssSources: sources, loading: false });
      return sources;
    } catch (e) {
      const error = e instanceof Error ? e.message : '加载RSS源失败';
      setState({ error, loading: false });
      throw e;
    }
  },

  /**
   * 刷新书源列表（强制从数据库重新加载）
   */
  async refreshBookSources(): Promise<void> {
    setState({ loading: true, error: null });

    try {
      const sources = await sourcesDb.getAllSources();
      setState({ bookSources: sources, loading: false });
    } catch (e) {
      const error = e instanceof Error ? e.message : '刷新书源失败';
      setState({ error, loading: false });
      throw e;
    }
  },

  /**
   * 刷新RSS源列表
   */
  async refreshRssSources(): Promise<void> {
    setState({ loading: true, error: null });

    try {
      const sources = await rssSourcesDb.getAllRssSources();
      setState({ rssSources: sources, loading: false });
    } catch (e) {
      const error = e instanceof Error ? e.message : '刷新RSS源失败';
      setState({ error, loading: false });
      throw e;
    }
  },

  /**
   * 添加书源
   */
  async addBookSource(source: BookSource): Promise<void> {
    try {
      await sourcesDb.insertSource(source);
      setState('bookSources', sources => [...sources, source]);
    } catch (e) {
      const error = e instanceof Error ? e.message : '添加书源失败';
      setState({ error });
      throw e;
    }
  },

  /**
   * 添加RSS源
   */
  async addRssSource(source: RssSource): Promise<void> {
    try {
      await rssSourcesDb.insertRssSource(source);
      setState('rssSources', sources => [...sources, source]);
    } catch (e) {
      const error = e instanceof Error ? e.message : '添加RSS源失败';
      setState({ error });
      throw e;
    }
  },

  /**
   * 更新书源
   */
  async updateBookSource(sourceUrl: string, updates: Partial<BookSource>): Promise<void> {
    try {
      const existingSource = state.bookSources.find(s => s.sourceUrl === sourceUrl);
      if (!existingSource) {
        throw new Error(`书源不存在: ${sourceUrl}`);
      }
      const updatedSource = { ...existingSource, ...updates };
      await sourcesDb.updateSource(updatedSource);

      setState('bookSources', sources =>
        sources.map(s =>
          s.sourceUrl === sourceUrl ? updatedSource : s
        )
      );
    } catch (e) {
      const error = e instanceof Error ? e.message : '更新书源失败';
      setState({ error });
      throw e;
    }
  },

  /**
   * 更新RSS源
   */
  async updateRssSource(sourceUrl: string, updates: Partial<RssSource>): Promise<void> {
    try {
      const existingSource = state.rssSources.find(s => s.sourceUrl === sourceUrl);
      if (!existingSource) {
        throw new Error(`RSS源不存在: ${sourceUrl}`);
      }
      const updatedSource = { ...existingSource, ...updates };
      await rssSourcesDb.updateRssSource(updatedSource);

      setState('rssSources', sources =>
        sources.map(s =>
          s.sourceUrl === sourceUrl ? updatedSource : s
        )
      );
    } catch (e) {
      const error = e instanceof Error ? e.message : '更新RSS源失败';
      setState({ error });
      throw e;
    }
  },

  /**
   * 删除书源
   */
  async deleteBookSource(sourceUrl: string): Promise<void> {
    try {
      const source = await sourcesDb.getSource(sourceUrl);
      if (source) {
        await purgeBookSourceSession(source);
      }
      await sourcesDb.deleteSource(sourceUrl);
      setState('bookSources', sources =>
        sources.filter(s => s.sourceUrl !== sourceUrl)
      );
    } catch (e) {
      const error = e instanceof Error ? e.message : '删除书源失败';
      setState({ error });
      throw e;
    }
  },

  /**
   * 删除RSS源
   */
  async deleteRssSource(sourceUrl: string): Promise<void> {
    try {
      await rssSourcesDb.deleteRssSource(sourceUrl);
      setState('rssSources', sources =>
        sources.filter(s => s.sourceUrl !== sourceUrl)
      );
    } catch (e) {
      const error = e instanceof Error ? e.message : '删除RSS源失败';
      setState({ error });
      throw e;
    }
  },

  /**
   * 启用/禁用书源
   */
  async enableBookSource(sourceUrl: string, enabled: boolean): Promise<void> {
    await this.updateBookSource(sourceUrl, { enabled });
  },

  /**
   * 启用/禁用RSS源
   */
  async enableRssSource(sourceUrl: string, enabled: boolean): Promise<void> {
    await this.updateRssSource(sourceUrl, { enabled });
  },

  /**
   * 设置当前编辑的书源
   */
  setCurrentSource(source: BookSource | RssSource | null): void {
    setState({ currentSource: source });
  },

  /**
   * 设置当前标签页
   */
  setCurrentTab(tab: string): void {
    setState({ currentTab: tab });
  },

  /**
   * 开始调试
   */
  startDebug(): void {
    setState({
      currentTab: 'editDebug',
      isDebuging: true,
    });
  },

  /**
   * 停止调试
   */
  stopDebug(): void {
    setState({
      isDebuging: false,
    });
  },

  /**
   * 清除错误信息
   */
  clearError(): void {
    setState({ error: null });
  },

  /**
   * 根据sourceUrl获取书源
   */
  getBookSource(sourceUrl: string): BookSource | undefined {
    return state.bookSources.find(s => s.sourceUrl === sourceUrl);
  },

  /**
   * 根据sourceUrl获取RSS源
   */
  getRssSource(sourceUrl: string): RssSource | undefined {
    return state.rssSources.find(s => s.sourceUrl === sourceUrl);
  },

  /**
   * 获取启用的书源列表
   */
  getEnabledBookSources(): BookSource[] {
    return state.bookSources.filter(s => s.enabled);
  },

  /**
   * 获取启用的RSS源列表
   */
  getEnabledRssSources(): RssSource[] {
    return state.rssSources.filter(s => s.enabled);
  },
};
