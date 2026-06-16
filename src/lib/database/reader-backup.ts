/**
 * Reader 本地数据备份与恢复（对齐 Legado Backup.kt / Restore.kt，不含 WebDav）
 */

import { save } from '@tauri-apps/plugin-dialog';
import { zipSync, strToU8 } from 'fflate';
import { writeFile } from '@tauri-apps/plugin-fs';
import { pickFile } from '@/lib/platform/fs/pick-file';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { readBytes } from '@/lib/platform/fs/read-write';
import { exportDatabase, exportDatabaseAndDownload } from '@/lib/database/export-import';
import { restoreBackupFromBytes } from '@/lib/web-api/restore-backup';
import * as booksDb from '@/lib/database/books';
import * as sourcesDb from '@/lib/database/sources';
import * as rssDb from '@/lib/database/rss-sources';
import * as replaceDb from '@/lib/database/replace-rules';
import * as readRecordsDb from '@/lib/database/read-records';
import { isTauri } from '@/lib/platform/detect';

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

function formatBackupFileName(includeTimestamp = true): string {
  if (!includeTimestamp) return 'reader-backup.zip';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  return `reader-backup-${stamp}.zip`;
}

export async function getBackupOverview(): Promise<BackupOverview> {
  const [books, sources, rssSources, rules, records, dbBuffer] = await Promise.all([
    booksDb.getAllBooks(),
    sourcesDb.getAllSources(),
    rssDb.getAllRssSources(),
    replaceDb.getAllReplaceRules(),
    readRecordsDb.getAllReadRecords(),
    exportDatabase(),
  ]);

  const items: BackupItemInfo[] = [
    {
      fileName: 'reader.db',
      displayName: '数据库',
      description: '完整 SQLite 数据库',
      count: 1,
      size: dbBuffer.byteLength,
    },
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
  ].filter((item) => item.count > 0 || item.fileName === 'reader.db');

  const totalSize = items.reduce((sum, item) => sum + item.size, 0);
  return {
    fileName: formatBackupFileName(),
    totalSize,
    createTime: Date.now(),
    items,
  };
}

export async function createReaderBackupZip(): Promise<{ blob: Blob; filename: string }> {
  const [books, sources, rssSources, rules, records, dbBuffer] = await Promise.all([
    booksDb.getAllBooks(),
    sourcesDb.getAllSources(),
    rssDb.getAllRssSources(),
    replaceDb.getAllReplaceRules(),
    readRecordsDb.getAllReadRecords(),
    exportDatabase(),
  ]);

  const entries: Record<string, Uint8Array> = {
    'reader.db': new Uint8Array(dbBuffer),
  };

  if (books.length > 0) {
    entries['bookshelf.json'] = strToU8(JSON.stringify(books, null, 2));
  }
  if (sources.length > 0) {
    entries['bookSource.json'] = strToU8(JSON.stringify(sources, null, 2));
  }
  if (rssSources.length > 0) {
    entries['rssSources.json'] = strToU8(JSON.stringify(rssSources, null, 2));
  }
  if (rules.length > 0) {
    entries['replaceRule.json'] = strToU8(JSON.stringify(rules, null, 2));
  }
  if (records.length > 0) {
    entries['readRecord.json'] = strToU8(JSON.stringify(records, null, 2));
  }

  const zipped = zipSync(entries, { level: 6 });
  const filename = formatBackupFileName();
  return {
    blob: new Blob([zipped], { type: 'application/zip' }),
    filename,
  };
}

async function saveBackupBlob(blob: Blob, filename: string): Promise<void> {
  if (isTauri()) {
    const filePath = await save({
      defaultPath: filename,
      filters: [{ name: 'ZIP 备份', extensions: ['zip'] }],
    });
    if (!filePath) throw new Error('用户取消保存');
    const buffer = await blob.arrayBuffer();
    await writeFile(filePath, new Uint8Array(buffer));
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportReaderBackup(): Promise<{ filename: string; size: number }> {
  const { blob, filename } = await createReaderBackupZip();
  await saveBackupBlob(blob, filename);
  return { filename, size: blob.size };
}

export async function restoreReaderBackupFromFile(): Promise<{
  summary: string[];
  reloadRecommended: boolean;
}> {
  try {
    const picked = await pickFile({
      filters: [
        { name: '备份文件', extensions: ['zip', 'db', 'sqlite', 'sqlite3'] },
        { name: 'ZIP 备份', extensions: ['zip'] },
        { name: 'SQLite 数据库', extensions: ['db', 'sqlite', 'sqlite3'] },
      ],
    });

    let bytes: Uint8Array;
    const fileName = picked.fileName;

    if (picked.bytes) {
      bytes = new Uint8Array(picked.bytes);
    } else if (picked.ref.kind === 'path' || picked.ref.kind === 'uri') {
      const raw = await readBytes(picked.ref);
      bytes = new Uint8Array(raw);
    } else {
      const raw = await readBytes(picked.ref);
      bytes = new Uint8Array(raw);
    }

    const summary = await restoreBackupFromBytes(fileName, bytes, true);
    const reloadRecommended = summary.some((s) => s.includes('全量恢复'));
    return { summary, reloadRecommended };
  } catch (error) {
    if (isUserCancelled(error)) {
      throw new Error('用户取消选择文件');
    }
    throw error;
  }
}

export async function restoreReaderBackupFromUserFile(file: File): Promise<{
  summary: string[];
  reloadRecommended: boolean;
}> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const summary = await restoreBackupFromBytes(file.name, bytes, true);
  const reloadRecommended = summary.some((s) => s.includes('全量恢复'));
  return { summary, reloadRecommended };
}

/** Web 环境：仅 .db 快捷导出（兼容旧流程） */
export async function exportDatabaseFileDownload(filename = 'reader.db'): Promise<void> {
  await exportDatabaseAndDownload(filename);
}
