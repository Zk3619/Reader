/**
 * 备份 Web API（对齐 Legado BackupController.kt）
 */

import * as booksDb from '@/lib/database/books';
import * as sourcesDb from '@/lib/database/sources';
import * as rssDb from '@/lib/database/rss-sources';
import * as replaceDb from '@/lib/database/replace-rules';
import * as readRecordsDb from '@/lib/database/read-records';
import { exportDatabaseAsBlob } from '@/lib/database/export-import';
import { legadoErr, legadoOk, type LegadoReturnData } from '@/lib/web-api/return-data';
import { binaryApiResult, type WebApiDispatchResult } from '@/lib/web-api/response';

export interface BackupItemInfo {
  fileName: string;
  displayName: string;
  description: string;
  count: number;
  size: number;
}

export interface BackupOverview {
  fileName: string;
  totalSize: number;
  createTime: number;
  items: BackupItemInfo[];
}

async function buildBackupOverview(): Promise<BackupOverview> {
  const [books, sources, rssSources, rules, records] = await Promise.all([
    booksDb.getAllBooks(),
    sourcesDb.getAllSources(),
    rssDb.getAllRssSources(),
    replaceDb.getAllReplaceRules(),
    readRecordsDb.getAllReadRecords(),
  ]);

  const items: BackupItemInfo[] = [
    {
      fileName: 'bookshelf.json',
      displayName: '书架',
      description: '书架书籍列表',
      count: books.length,
      size: JSON.stringify(books).length,
    },
    {
      fileName: 'bookSource.json',
      displayName: '书源',
      description: '书源规则',
      count: sources.length,
      size: JSON.stringify(sources).length,
    },
    {
      fileName: 'rssSources.json',
      displayName: 'RSS',
      description: 'RSS 订阅源',
      count: rssSources.length,
      size: JSON.stringify(rssSources).length,
    },
    {
      fileName: 'replaceRule.json',
      displayName: '替换规则',
      description: '替换净化规则',
      count: rules.length,
      size: JSON.stringify(rules).length,
    },
    {
      fileName: 'readRecord.json',
      displayName: '阅读记录',
      description: '阅读记录',
      count: records.length,
      size: JSON.stringify(records).length,
    },
  ].filter((item) => item.count > 0 || item.size > 0);

  const totalSize = items.reduce((sum, item) => sum + item.size, 0);
  return {
    fileName: 'backup.zip',
    totalSize,
    createTime: Date.now(),
    items,
  };
}

export async function getBackupPreviewApi(): Promise<LegadoReturnData<BackupOverview>> {
  return legadoOk(await buildBackupOverview());
}

export async function backupApi(): Promise<WebApiDispatchResult> {
  try {
    const blob = await exportDatabaseAsBlob();
    const buffer = new Uint8Array(await blob.arrayBuffer());
    return binaryApiResult(buffer, 'application/zip', 'backup.zip');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { kind: 'json', payload: legadoErr(`备份失败: ${msg}`) };
  }
}

export async function backupPreviewOnlyErr(): Promise<LegadoReturnData<null>> {
  return legadoErr('备份预览不可用');
}

export { restoreBackupApi } from '@/lib/web-api/restore-backup';
