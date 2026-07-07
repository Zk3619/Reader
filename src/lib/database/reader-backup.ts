/**
 * Reader 本地数据备份与恢复（对齐 Legado Backup.kt / Restore.kt，含 WebDAV 上传入口）
 */

import { save } from '@tauri-apps/plugin-dialog';
import { zipSync, strToU8 } from 'fflate';
import { writeFile } from '@tauri-apps/plugin-fs';
import { pickFile } from '@/lib/platform/fs/pick-file';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { readBytes } from '@/lib/platform/fs/read-write';
import { exportDatabase, exportDatabaseAndDownload } from '@/lib/database/export-import';
import { restoreBackupFromBytes } from '@/lib/web-api/restore-backup';
import { collectBackupJsonBundle } from '@/lib/backup/backup-json-export';
import { getBackupPassword } from '@/lib/backup/backup-config-storage';
import { getSelectedBackupFileNames } from '@/lib/backup/backup-selector-config';
import { collectBookCacheZipEntries } from '@/lib/backup/book-cache-backup';
import { collectBackgroundZipEntries } from '@/lib/backup/background-backup';
import { isTauri } from '@/lib/platform/detect';
import { loadReaderUiConfig } from '@/lib/media/text/read-config-storage';
import { exportLegadoReadConfigBundle } from '@/lib/media/text/legado-read-config-sync';
import { defaultTextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import { formatLegadoStyleBackupFileName } from '@/lib/backup/backup-filename';

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

export interface CreateReaderBackupOptions {
  /** Legado 风格 backup{date}-{device}.zip */
  legadoStyleName?: boolean;
  deviceName?: string;
  /** 覆盖选择性备份项；不传则读取用户保存的选择 */
  selectedFileNames?: Set<string>;
  backupPassword?: string;
}

function formatBackupFileName(options: CreateReaderBackupOptions = {}): string {
  if (options.legadoStyleName) {
    return formatLegadoStyleBackupFileName(options.deviceName);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  return `reader-backup-${stamp}.zip`;
}

async function resolveSelectedFileNames(options: CreateReaderBackupOptions): Promise<Set<string>> {
  return options.selectedFileNames ?? (await getSelectedBackupFileNames());
}

const EMPTY_BUNDLE = { entries: {} as Record<string, Uint8Array>, item: undefined as BackupItemInfo | undefined };

async function buildBackupEntries(options: CreateReaderBackupOptions = {}): Promise<{
  entries: Record<string, Uint8Array>;
  items: BackupItemInfo[];
}> {
  const selected = await resolveSelectedFileNames(options);
  const backupPassword = options.backupPassword ?? (await getBackupPassword());

  const [dbBuffer, readerUi, jsonBundle, bookCacheBundle, bgBundle] = await Promise.all([
    selected.has('reader.db') ? exportDatabase() : Promise.resolve(null),
    loadReaderUiConfig(),
    collectBackupJsonBundle({ selected, backupPassword }),
    selected.has('book_cache') ? collectBookCacheZipEntries() : Promise.resolve(EMPTY_BUNDLE),
    selected.has('bg') ? collectBackgroundZipEntries() : Promise.resolve(EMPTY_BUNDLE),
  ]);

  const legadoExport = exportLegadoReadConfigBundle(readerUi ?? defaultTextViewerUiConfig);
  const entries: Record<string, Uint8Array> = {};
  const items: BackupItemInfo[] = [];

  if (dbBuffer) {
    entries['reader.db'] = new Uint8Array(dbBuffer);
    items.push({
      fileName: 'reader.db',
      displayName: '数据库',
      description: '完整 SQLite 数据库',
      count: 1,
      size: dbBuffer.byteLength,
    });
  }

  for (const [name, text] of Object.entries(jsonBundle.entries)) {
    entries[name] = strToU8(text);
  }
  items.push(...jsonBundle.items);

  const configItems: Array<{ key: string; file: string; display: string; desc: string; text: string }> = [
    { key: 'readerUiConfig.json', file: 'readerUiConfig.json', display: '阅读器 UI', desc: '文本阅读器完整配置', text: legadoExport.readerUiConfigJson },
    { key: 'readConfig.json', file: 'readConfig.json', display: 'Legado 阅读样式', desc: 'Legado readConfig.json', text: legadoExport.readConfigJson },
    { key: 'shareReadConfig.json', file: 'shareReadConfig.json', display: 'Legado 共享样式', desc: 'Legado shareReadConfig.json', text: legadoExport.shareReadConfigJson },
    { key: 'readerPrefs.json', file: 'readerPrefs.json', display: 'Legado 阅读偏好', desc: 'Legado SharedPreferences 子集', text: legadoExport.readerPrefsJson },
  ];
  for (const cfg of configItems) {
    if (!selected.has(cfg.key)) continue;
    entries[cfg.file] = strToU8(cfg.text);
    items.push({
      fileName: cfg.file,
      displayName: cfg.display,
      description: cfg.desc,
      count: 1,
      size: cfg.text.length,
    });
  }

  Object.assign(entries, bookCacheBundle.entries);
  if (bookCacheBundle.item) items.push(bookCacheBundle.item);

  Object.assign(entries, bgBundle.entries);
  if (bgBundle.item) items.push(bgBundle.item);

  return { entries, items };
}

export async function getBackupOverview(options: CreateReaderBackupOptions = {}): Promise<BackupOverview> {
  const { items } = await buildBackupEntries(options);
  const totalSize = items.reduce((sum, item) => sum + item.size, 0);
  return {
    fileName: formatBackupFileName(options),
    totalSize,
    createTime: Date.now(),
    items,
  };
}

export async function createReaderBackupZip(
  options: CreateReaderBackupOptions = {},
): Promise<{ blob: Blob; filename: string }> {
  const { entries } = await buildBackupEntries(options);
  const filename = formatBackupFileName(options);
  const zipped = zipSync(entries, { level: 6 });
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

export async function exportDatabaseFileDownload(filename = 'reader.db'): Promise<void> {
  await exportDatabaseAndDownload(filename);
}
