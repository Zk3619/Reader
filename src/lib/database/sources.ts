/**
 * 书源数据访问对象
 * 对应 legado 项目的 BookSourceDao.kt
 */

import { getDatabase } from '@/lib/database/database-core';
import type { BookSource, NewBookSource } from '@/types';
import type {
  SearchRule,
  ExploreRule,
  BookInfoRule,
  TocRule,
  ContentRule,
  ReviewRule,
} from '@/types';

/**
 * 获取所有书源
 */
export async function getAllSources(): Promise<BookSource[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM book_sources ORDER BY customOrder ASC'
  );
  return rows.map(row => mapRowToSource(row));
}

/**
 * 获取启用的书源
 */
export async function getEnabledSources(): Promise<BookSource[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM book_sources WHERE enabled = 1 ORDER BY customOrder ASC'
  );
  return rows.map(row => mapRowToSource(row));
}

/**
 * 获取禁用的书源
 */
export async function getDisabledSources(): Promise<BookSource[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM book_sources WHERE enabled = 0 ORDER BY customOrder ASC'
  );
  return rows.map(row => mapRowToSource(row));
}

/**
 * 搜索书源
 */
export async function searchSources(keyword: string): Promise<BookSource[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM book_sources 
     WHERE bookSourceName LIKE '%' || ? || '%'
     OR bookSourceGroup LIKE '%' || ? || '%'
     OR bookSourceUrl LIKE '%' || ? || '%'
     OR bookSourceComment LIKE '%' || ? || '%'
     ORDER BY customOrder ASC`,
    [keyword, keyword, keyword, keyword]
  );
  return rows.map(row => mapRowToSource(row));
}

/**
 * 根据分组搜索书源
 */
export async function getSourcesByGroup(
  groupName: string
): Promise<BookSource[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM book_sources 
     WHERE bookSourceGroup = ?
     OR bookSourceGroup LIKE ? || ',%'
     OR bookSourceGroup LIKE '%,' || ?
     OR bookSourceGroup LIKE '%,' || ? || ',%'
     ORDER BY customOrder ASC`,
    [groupName, groupName, groupName, groupName]
  );
  return rows.map(row => mapRowToSource(row));
}

/**
 * 按站点根 URL 查找可用于「添加网址」的书源（对齐 legado BookSourceDao.getBookSourceAddBook）
 */
export async function getBookSourceForAddBook(baseUrl: string): Promise<BookSource | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM book_sources WHERE enabled = 1 AND bookSourceUrl = ?',
    [baseUrl]
  );
  return rows.length > 0 ? mapRowToSource(rows[0]) : null;
}

/**
 * 已启用且配置了 bookUrlPattern 的书源（对齐 legado hasBookUrlPattern）
 */
export async function getEnabledSourcesWithBookUrlPattern(): Promise<BookSource[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM book_sources
     WHERE enabled = 1
       AND bookUrlPattern IS NOT NULL
       AND trim(bookUrlPattern) <> ''
       AND trim(bookUrlPattern) <> 'NONE'
     ORDER BY customOrder ASC`
  );
  return rows.map((row) => mapRowToSource(row));
}

/**
 * 根据URL获取书源
 */
export async function getSource(sourceUrl: string): Promise<BookSource | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM book_sources WHERE bookSourceUrl = ?',
    [sourceUrl]
  );
  return rows.length > 0 ? mapRowToSource(rows[0]) : null;
}

/**
 * 检查书源是否存在
 */
export async function hasSource(sourceUrl: string): Promise<boolean> {
  const db = await getDatabase();
  const rows = await db.select<{ count: number }>(
    'SELECT COUNT(*) as count FROM book_sources WHERE bookSourceUrl = ?',
    [sourceUrl]
  );
  return (rows[0]?.count ?? 0) > 0;
}

/**
 * 插入书源（如果存在则替换）
 */
export async function insertSource(source: NewBookSource): Promise<void> {
  const db = await getDatabase();
  
  await db.execute(
    `INSERT OR REPLACE INTO book_sources (
      bookSourceUrl, bookSourceName, bookSourceGroup, bookSourceType,
      bookUrlPattern, customOrder, enabled, enabledExplore,
      jsLib, enabledCookieJar, concurrentRate, header,
      loginUrl, loginUi, loginCheckJs, coverDecodeJs,
      bookSourceComment, variableComment, lastUpdateTime,
      respondTime, weight, exploreUrl, exploreScreen,
      ruleExplore, searchUrl, ruleSearch, ruleBookInfo,
      ruleToc, ruleContent, ruleReview,
      eventListener, customButton, nextPageLazyLoad
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      source.sourceUrl,
      source.sourceName,
      source.sourceGroup ?? null,
      source.sourceType ?? 0,
      source.bookUrlPattern ?? null,
      source.customOrder ?? 0,
      source.enabled !== false ? 1 : 0,
      source.enableExplore !== false ? 1 : 0,
      source.jsLib ?? null,
      source.enabledCookieJar === false ? 0 : 1,
      source.concurrentRate ?? null,
      source.header ?? null,
      source.loginUrl ?? null,
      source.loginUi ?? null,
      source.loginCheckJs ?? null,
      source.coverDecodeJs ?? null,
      source.sourceComment ?? null,
      source.variableComment ?? null,
      source.lastUpdateTime ?? 0,
      source.respondTime ?? 180000,
      source.weight ?? 0,
      source.exploreUrl ?? null,
      source.exploreScreen ?? null,
      source.ruleExplore ? JSON.stringify(source.ruleExplore) : null,
      source.searchUrl ?? null,
      source.ruleSearch ? JSON.stringify(source.ruleSearch) : null,
      source.ruleBookInfo ? JSON.stringify(source.ruleBookInfo) : null,
      source.ruleToc ? JSON.stringify(source.ruleToc) : null,
      source.ruleContent ? JSON.stringify(source.ruleContent) : null,
      source.ruleReview ? JSON.stringify(source.ruleReview) : null,
      Boolean((source as BookSource).eventListener) ? 1 : 0,
      Boolean((source as BookSource).customButton) ? 1 : 0,
      Boolean((source as BookSource).nextPageLazyLoad) ? 1 : 0,
    ]
  );
}

/**
 * 更新书源
 */
export async function updateSource(source: BookSource): Promise<void> {
  const db = await getDatabase();
  
  await db.execute(
    `UPDATE book_sources SET
      bookSourceName = ?, bookSourceGroup = ?, bookSourceType = ?,
      bookUrlPattern = ?, customOrder = ?, enabled = ?, enabledExplore = ?,
      jsLib = ?, enabledCookieJar = ?, concurrentRate = ?, header = ?,
      loginUrl = ?, loginUi = ?, loginCheckJs = ?, coverDecodeJs = ?,
      bookSourceComment = ?, variableComment = ?, lastUpdateTime = ?,
      respondTime = ?, weight = ?, exploreUrl = ?, exploreScreen = ?,
      ruleExplore = ?, searchUrl = ?, ruleSearch = ?, ruleBookInfo = ?,
      ruleToc = ?, ruleContent = ?, ruleReview = ?,
      eventListener = ?, customButton = ?, nextPageLazyLoad = ?
    WHERE bookSourceUrl = ?`,
    [
      source.sourceName,
      source.sourceGroup ?? null,
      source.sourceType,
      source.bookUrlPattern ?? null,
      source.customOrder,
      source.enabled ? 1 : 0,
      source.enableExplore ? 1 : 0,
      source.jsLib ?? null,
      source.enabledCookieJar === false ? 0 : 1,
      source.concurrentRate ?? null,
      source.header ?? null,
      source.loginUrl ?? null,
      source.loginUi ?? null,
      source.loginCheckJs ?? null,
      source.coverDecodeJs ?? null,
      source.sourceComment ?? null,
      source.variableComment ?? null,
      source.lastUpdateTime,
      source.respondTime,
      source.weight,
      source.exploreUrl ?? null,
      source.exploreScreen ?? null,
      source.ruleExplore ? JSON.stringify(source.ruleExplore) : null,
      source.searchUrl ?? null,
      source.ruleSearch ? JSON.stringify(source.ruleSearch) : null,
      source.ruleBookInfo ? JSON.stringify(source.ruleBookInfo) : null,
      source.ruleToc ? JSON.stringify(source.ruleToc) : null,
      source.ruleContent ? JSON.stringify(source.ruleContent) : null,
      source.ruleReview ? JSON.stringify(source.ruleReview) : null,
      source.eventListener ? 1 : 0,
      source.customButton ? 1 : 0,
      source.nextPageLazyLoad ? 1 : 0,
      source.sourceUrl,
    ]
  );
}

/**
 * 删除书源
 */
export async function deleteSource(sourceUrl: string): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM book_sources WHERE bookSourceUrl = ?', [
    sourceUrl,
  ]);
}

/**
 * 启用/禁用书源
 */
export async function enableSource(
  sourceUrl: string,
  enabled: boolean
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    'UPDATE book_sources SET enabled = ? WHERE bookSourceUrl = ?',
    [enabled ? 1 : 0, sourceUrl]
  );
}

/**
 * 启用/禁用发现功能
 */
export async function enableExplore(
  sourceUrl: string,
  enabled: boolean
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    'UPDATE book_sources SET enabledExplore = ? WHERE bookSourceUrl = ?',
    [enabled ? 1 : 0, sourceUrl]
  );
}

/**
 * 更新书源排序
 */
export async function updateSourceOrder(
  sourceUrl: string,
  customOrder: number
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    'UPDATE book_sources SET customOrder = ? WHERE bookSourceUrl = ?',
    [customOrder, sourceUrl]
  );
}

/**
 * 更新书源分组
 */
export async function updateSourceGroup(
  sourceUrl: string,
  groupName: string | null
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    'UPDATE book_sources SET bookSourceGroup = ? WHERE bookSourceUrl = ?',
    [groupName, sourceUrl]
  );
}

/**
 * 获取所有书源分组
 */
export async function getAllSourceGroups(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.select<{ groupName: string }>(
    'SELECT DISTINCT bookSourceGroup as groupName FROM book_sources WHERE bookSourceGroup IS NOT NULL AND bookSourceGroup != ""'
  );
  return rows.map(row => row.groupName).filter(Boolean);
}

/**
 * 新增分组：将当前未分组的书源全部归入该分组（对齐 legado BookSourceViewModel.addGroup）
 */
export async function addSourceGroup(groupName: string): Promise<void> {
  if (!groupName.trim()) return;
  const all = await getAllSources();
  const ungrouped = all.filter(s => !s.sourceGroup || !String(s.sourceGroup).trim());
  for (const s of ungrouped) {
    await updateSourceGroup(s.sourceUrl, groupName.trim());
  }
}

/**
 * 删除分组：将该分组下所有书源的分组置空（对齐 legado BookSourceViewModel.delGroup）
 */
export async function deleteSourceGroup(groupName: string): Promise<void> {
  const sources = await getSourcesByGroup(groupName);
  for (const s of sources) {
    await updateSourceGroup(s.sourceUrl, null);
  }
}

/**
 * 重排书源 customOrder（对齐 Legado SourceHelp.adjustSortNumber）
 */
export async function adjustBookSourceSortNumbers(): Promise<void> {
  const all = await getAllSources();
  if (all.length === 0) return;
  const orders = all.map((s) => s.customOrder);
  const maxOrder = Math.max(...orders);
  const minOrder = Math.min(...orders);
  const hasDuplicate = new Set(orders).size !== orders.length;
  if (maxOrder <= 99999 && minOrder >= -99999 && !hasDuplicate) return;
  for (let i = 0; i < all.length; i++) {
    await updateSourceOrder(all[i].sourceUrl, i);
  }
}

/**
 * 重命名分组（对齐 legado BookSourceViewModel.upGroup）
 */
export async function renameSourceGroup(oldName: string, newName: string | null): Promise<void> {
  const trimmed = newName?.trim();
  const sources = await getSourcesByGroup(oldName);
  for (const s of sources) {
    await updateSourceGroup(s.sourceUrl, trimmed || null);
  }
}

/** 从 row 中取字符串字段，兼容列名任意大小写（SQLite/驱动可能返回不同大小写） */
function pickString(row: Record<string, unknown>, key: string): string | undefined {
  if (row[key] != null && row[key] !== '') return String(row[key]);
  const lower = key.toLowerCase();
  if (row[lower] != null && row[lower] !== '') return String(row[lower]);
  for (const [k, v] of Object.entries(row)) {
    if (k.toLowerCase() === lower && v != null && v !== '') return String(v);
  }
  return undefined;
}

/**
 * 将数据库行映射为BookSource对象
 */
function mapRowToSource(row: Record<string, unknown>): BookSource {
  const bookSourceUrl = String(row.bookSourceUrl ?? '');
  return {
    sourceUrl: bookSourceUrl,
    bookSourceUrl,
    sourceName: String(row.bookSourceName ?? ''),
    sourceGroup: row.bookSourceGroup ? String(row.bookSourceGroup) : undefined,
    sourceType: Number(row.bookSourceType ?? 0),
    bookUrlPattern: row.bookUrlPattern
      ? String(row.bookUrlPattern)
      : undefined,
    customOrder: Number(row.customOrder ?? 0),
    enabled: Boolean(row.enabled ?? 1),
    enableExplore: Boolean(row.enabledExplore ?? 1),
    loginCheckJs: row.loginCheckJs ? String(row.loginCheckJs) : undefined,
    coverDecodeJs: row.coverDecodeJs ? String(row.coverDecodeJs) : undefined,
    sourceComment: row.bookSourceComment
      ? String(row.bookSourceComment)
      : undefined,
    variableComment: row.variableComment
      ? String(row.variableComment)
      : undefined,
    lastUpdateTime: Number(row.lastUpdateTime ?? 0),
    respondTime: Number(row.respondTime ?? 180000),
    weight: Number(row.weight ?? 0),
    exploreUrl: row.exploreUrl ? String(row.exploreUrl) : undefined,
    exploreScreen: row.exploreScreen ? String(row.exploreScreen) : undefined,
    ruleExplore: row.ruleExplore
      ? (JSON.parse(String(row.ruleExplore)) as ExploreRule)
      : undefined,
    searchUrl: row.searchUrl ? String(row.searchUrl) : undefined,
    ruleSearch: row.ruleSearch
      ? (JSON.parse(String(row.ruleSearch)) as SearchRule)
      : undefined,
    ruleBookInfo: row.ruleBookInfo
      ? (JSON.parse(String(row.ruleBookInfo)) as BookInfoRule)
      : undefined,
    ruleToc: row.ruleToc ? (JSON.parse(String(row.ruleToc)) as TocRule) : undefined,
    ruleContent: row.ruleContent
      ? (JSON.parse(String(row.ruleContent)) as ContentRule)
      : undefined,
    ruleReview: row.ruleReview
      ? (JSON.parse(String(row.ruleReview)) as ReviewRule)
      : undefined,
    header: row.header ? String(row.header) : undefined,
    loginUrl: pickString(row, 'loginUrl'),
    loginUi: pickString(row, 'loginUi'),
    concurrentRate: row.concurrentRate ? String(row.concurrentRate) : undefined,
    jsLib: row.jsLib ? String(row.jsLib) : undefined,
    enabledCookieJar: Boolean(row.enabledCookieJar ?? 0),
    eventListener: Boolean(row.eventListener ?? 0),
    customButton: Boolean(row.customButton ?? 0),
    nextPageLazyLoad: Boolean(row.nextPageLazyLoad ?? 0),
  };
}
