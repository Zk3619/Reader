/**
 * RSS源数据访问对象
 * 对应 legado 项目的 RssSourceDao.kt
 */

import { getDatabase } from '@/lib/database/database-core';
import type { RssSource, NewRssSource } from '@/types';

/**
 * 获取所有RSS源
 */
export async function getAllRssSources(): Promise<RssSource[]> {
  const db = await getDatabase();
  const rows = await db.select<Array<Record<string, unknown>>>(
    'SELECT * FROM rssSources ORDER BY customOrder ASC'
  );
  return rows.map(row => mapRowToRssSource(row));
}

/**
 * 获取启用的RSS源
 */
export async function getEnabledRssSources(): Promise<RssSource[]> {
  const db = await getDatabase();
  const rows = await db.select<Array<Record<string, unknown>>>(
    'SELECT * FROM rssSources WHERE enabled = 1 ORDER BY customOrder ASC'
  );
  return rows.map(row => mapRowToRssSource(row));
}

/**
 * 根据URL获取RSS源
 */
export async function getRssSource(sourceUrl: string): Promise<RssSource | null> {
  const db = await getDatabase();
  const rows = await db.select<Array<Record<string, unknown>>>(
    'SELECT * FROM rssSources WHERE sourceUrl = ?',
    [sourceUrl]
  );
  return rows.length > 0 ? mapRowToRssSource(rows[0]) : null;
}

/**
 * 插入RSS源（如果存在则替换）
 */
export async function insertRssSource(source: NewRssSource): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO rssSources (
      sourceUrl, sourceName, sourceIcon, sourceGroup, sourceComment,
      enabled, variableComment, jsLib, enabledCookieJar, concurrentRate,
      header, loginUrl, loginUi, loginCheckJs, coverDecodeJs, sortUrl,
      singleUrl, articleStyle, ruleArticles, ruleNextPage, ruleTitle,
      rulePubDate, ruleDescription, ruleImage, ruleLink, ruleContent,
      contentWhitelist, contentBlacklist, shouldOverrideUrlLoading,
      style, enableJs, loadWithBaseUrl, injectJs, lastUpdateTime, customOrder
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      source.sourceUrl,
      source.sourceName,
      source.sourceIcon ?? '',
      source.sourceGroup ?? null,
      source.sourceComment ?? null,
      source.enabled !== false ? 1 : 0,
      source.variableComment ?? null,
      source.jsLib ?? null,
      source.enabledCookieJar ? 1 : 0,
      source.concurrentRate ?? null,
      source.header ?? null,
      source.loginUrl ?? null,
      source.loginUi ?? null,
      source.loginCheckJs ?? null,
      source.coverDecodeJs ?? null,
      source.sortUrl ?? null,
      source.singleUrl ? 1 : 0,
      source.articleStyle ?? 0,
      source.ruleArticles ?? null,
      source.ruleNextPage ?? null,
      source.ruleTitle ?? null,
      source.rulePubDate ?? null,
      source.ruleDescription ?? null,
      source.ruleImage ?? null,
      source.ruleLink ?? null,
      source.ruleContent ?? null,
      source.contentWhitelist ?? null,
      source.contentBlacklist ?? null,
      source.shouldOverrideUrlLoading ?? null,
      source.style ?? null,
      source.enableJs !== false ? 1 : 0,
      source.loadWithBaseUrl !== false ? 1 : 0,
      source.injectJs ?? null,
      source.lastUpdateTime ?? 0,
      source.customOrder ?? 0,
    ]
  );
}

/**
 * 更新RSS源
 */
export async function updateRssSource(source: RssSource): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE rssSources SET
      sourceName = ?, sourceIcon = ?, sourceGroup = ?, sourceComment = ?,
      enabled = ?, variableComment = ?, jsLib = ?, enabledCookieJar = ?,
      concurrentRate = ?, header = ?, loginUrl = ?, loginUi = ?,
      loginCheckJs = ?, coverDecodeJs = ?, sortUrl = ?, singleUrl = ?,
      articleStyle = ?, ruleArticles = ?, ruleNextPage = ?, ruleTitle = ?,
      rulePubDate = ?, ruleDescription = ?, ruleImage = ?, ruleLink = ?,
      ruleContent = ?, contentWhitelist = ?, contentBlacklist = ?,
      shouldOverrideUrlLoading = ?, style = ?, enableJs = ?,
      loadWithBaseUrl = ?, injectJs = ?, lastUpdateTime = ?, customOrder = ?
    WHERE sourceUrl = ?`,
    [
      source.sourceName,
      source.sourceIcon,
      source.sourceGroup ?? null,
      source.sourceComment ?? null,
      source.enabled ? 1 : 0,
      source.variableComment ?? null,
      source.jsLib ?? null,
      source.enabledCookieJar ? 1 : 0,
      source.concurrentRate ?? null,
      source.header ?? null,
      source.loginUrl ?? null,
      source.loginUi ?? null,
      source.loginCheckJs ?? null,
      source.coverDecodeJs ?? null,
      source.sortUrl ?? null,
      source.singleUrl ? 1 : 0,
      source.articleStyle,
      source.ruleArticles ?? null,
      source.ruleNextPage ?? null,
      source.ruleTitle ?? null,
      source.rulePubDate ?? null,
      source.ruleDescription ?? null,
      source.ruleImage ?? null,
      source.ruleLink ?? null,
      source.ruleContent ?? null,
      source.contentWhitelist ?? null,
      source.contentBlacklist ?? null,
      source.shouldOverrideUrlLoading ?? null,
      source.style ?? null,
      source.enableJs ? 1 : 0,
      source.loadWithBaseUrl ? 1 : 0,
      source.injectJs ?? null,
      source.lastUpdateTime,
      source.customOrder,
      source.sourceUrl,
    ]
  );
}

/**
 * 删除RSS源
 */
export async function deleteRssSource(sourceUrl: string): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM rssSources WHERE sourceUrl = ?', [sourceUrl]);
}

/**
 * 启用/禁用RSS源
 */
export async function enableRssSource(
  sourceUrl: string,
  enabled: boolean
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    'UPDATE rssSources SET enabled = ? WHERE sourceUrl = ?',
    [enabled ? 1 : 0, sourceUrl]
  );
}

/**
 * 将数据库行映射为RssSource对象
 */
function mapRowToRssSource(row: Record<string, unknown>): RssSource {
  return {
    sourceUrl: String(row.sourceUrl ?? ''),
    sourceName: String(row.sourceName ?? ''),
    sourceIcon: String(row.sourceIcon ?? ''),
    sourceGroup: row.sourceGroup ? String(row.sourceGroup) : undefined,
    sourceComment: row.sourceComment ? String(row.sourceComment) : undefined,
    enabled: Boolean(row.enabled ?? 1),
    variableComment: row.variableComment
      ? String(row.variableComment)
      : undefined,
    loginCheckJs: row.loginCheckJs ? String(row.loginCheckJs) : undefined,
    coverDecodeJs: row.coverDecodeJs ? String(row.coverDecodeJs) : undefined,
    sortUrl: row.sortUrl ? String(row.sortUrl) : undefined,
    singleUrl: Boolean(row.singleUrl ?? 0),
    articleStyle: Number(row.articleStyle ?? 0),
    ruleArticles: row.ruleArticles ? String(row.ruleArticles) : undefined,
    ruleNextPage: row.ruleNextPage ? String(row.ruleNextPage) : undefined,
    ruleTitle: row.ruleTitle ? String(row.ruleTitle) : undefined,
    rulePubDate: row.rulePubDate ? String(row.rulePubDate) : undefined,
    ruleDescription: row.ruleDescription
      ? String(row.ruleDescription)
      : undefined,
    ruleImage: row.ruleImage ? String(row.ruleImage) : undefined,
    ruleLink: row.ruleLink ? String(row.ruleLink) : undefined,
    ruleContent: row.ruleContent ? String(row.ruleContent) : undefined,
    contentWhitelist: row.contentWhitelist
      ? String(row.contentWhitelist)
      : undefined,
    contentBlacklist: row.contentBlacklist
      ? String(row.contentBlacklist)
      : undefined,
    shouldOverrideUrlLoading: row.shouldOverrideUrlLoading
      ? String(row.shouldOverrideUrlLoading)
      : undefined,
    style: row.style ? String(row.style) : undefined,
    enableJs: Boolean(row.enableJs ?? 1),
    loadWithBaseUrl: Boolean(row.loadWithBaseUrl ?? 1),
    injectJs: row.injectJs ? String(row.injectJs) : undefined,
    lastUpdateTime: Number(row.lastUpdateTime ?? 0),
    customOrder: Number(row.customOrder ?? 0),
    jsLib: row.jsLib ? String(row.jsLib) : undefined,
    enabledCookieJar: Boolean(row.enabledCookieJar ?? 0),
    concurrentRate: row.concurrentRate ? String(row.concurrentRate) : undefined,
    header: row.header ? String(row.header) : undefined,
    loginUrl: row.loginUrl ? String(row.loginUrl) : undefined,
    loginUi: row.loginUi ? String(row.loginUi) : undefined,
  };
}
