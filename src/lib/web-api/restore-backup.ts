/**
 * 备份还原（SQLite / Legado ZIP）
 */

import { unzip } from 'fflate';
import { importDatabase } from '@/lib/database/export-import';
import * as booksDb from '@/lib/database/books';
import * as sourcesDb from '@/lib/database/sources';
import { parseBookSourceJson } from '@/lib/book-source/source-import';
import { parseRssSourceJson } from '@/lib/book-source/import-rss-source';
import { importRssSourcesFromList } from '@/lib/book-source/import-rss-batch';
import { importReplaceRulesFromJson } from '@/lib/book-source/import-replace-rule';
import {
  pickZipEntry,
  LEGADO_ZIP_BOOK_SOURCE_NAMES,
  LEGADO_ZIP_RSS_NAMES,
  LEGADO_ZIP_REPLACE_RULE_NAMES,
  LEGADO_ZIP_READ_CONFIG_NAMES,
  LEGADO_ZIP_SHARE_READ_CONFIG_NAMES,
  LEGADO_ZIP_READER_UI_CONFIG_NAMES,
  LEGADO_ZIP_READER_PREFS_NAMES,
  LEGADO_ZIP_CONFIG_XML_NAMES,
} from '@/lib/book-source/legado-zip';
import * as readRecordsDb from '@/lib/database/read-records';
import { saveReaderUiConfig } from '@/lib/media/text/read-config-storage';
import { importReaderUiConfigFromBackupEntries } from '@/lib/media/text/legado-read-config-sync';
import { importExtraBackupJsonEntries } from '@/lib/backup/backup-json-import';
import { getBackupPassword } from '@/lib/backup/backup-config-storage';
import { getSelectedBackupFileNames } from '@/lib/backup/backup-selector-config';
import { decryptBackupJsonIfNeeded } from '@/lib/backup/backup-aes';
import { restoreBookCacheFromZip } from '@/lib/backup/book-cache-backup';
import { restoreBackgroundFromZip } from '@/lib/backup/background-backup';
import {
  detectLegacyImportKind,
  importLegacyBackupFile,
  importOldBookSourcesToDb,
} from '@/lib/backup/import-old-data';
import { legadoErr, legadoOk, type LegadoReturnData } from '@/lib/web-api/return-data';
import {
  parseLegadoBookImportRow,
  mergeLegadoImportedBookFields,
} from '@/lib/book/legado-book-import';
import type { ReadRecord } from '@/types/read-record';

const SQLITE_SIG = 'SQLite format 3\0';

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isSqliteBuffer(bytes: Uint8Array): boolean {
  if (bytes.length < SQLITE_SIG.length) return false;
  for (let i = 0; i < SQLITE_SIG.length; i++) {
    if (bytes[i] !== SQLITE_SIG.charCodeAt(i)) return false;
  }
  return true;
}

function isZipBuffer(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function basename(path: string): string {
  const norm = path.replace(/\\/g, '/');
  return norm.split('/').pop()?.toLowerCase() ?? path.toLowerCase();
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return buf instanceof ArrayBuffer ? buf : new Uint8Array(bytes).buffer;
}

function normalizeZipPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

export interface RestoreBackupOptions {
  replace?: boolean;
  selectedFileNames?: Set<string>;
  backupPassword?: string;
}

function shouldRestoreItem(fileName: string, selected?: Set<string>): boolean {
  if (!selected) return true;
  if (selected.has(fileName)) return true;
  if (fileName === 'book_cache' && selected.has('book_cache')) return true;
  return false;
}

async function unzipBackup(bytes: Uint8Array): Promise<{
  text: Record<string, string>;
  binary: Record<string, Uint8Array>;
}> {
  const raw = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(bytes, (err, data) => (err ? reject(err) : resolve(data)));
  });
  const text: Record<string, string> = {};
  const binary: Record<string, Uint8Array> = {};
  for (const [path, data] of Object.entries(raw)) {
    const norm = normalizeZipPath(path);
    if (!norm) continue;
    const name = basename(norm);
    if (/\.(db|sqlite3?)$/.test(name)) {
      binary[name] = data;
    } else if (norm.startsWith('book_cache/') || norm.startsWith('bg/')) {
      binary[norm] = data;
    } else if (name.endsWith('.json') || name.endsWith('.txt') || name.endsWith('.xml')) {
      const decoded = new TextDecoder().decode(data);
      if (decoded.trim()) {
        text[name] = decoded;
        if (norm !== name) text[norm] = decoded;
      }
    }
  }
  return { text, binary };
}

async function importBooksFromLegadoJson(text: string): Promise<number> {
  const arr = JSON.parse(text) as unknown;
  if (!Array.isArray(arr)) return 0;
  let count = 0;
  for (const item of arr) {
    const imported = parseLegadoBookImportRow(item as Record<string, unknown>);
    if (!imported) continue;
    if (await booksDb.hasBook(imported.bookUrl)) continue;
    await booksDb.insertBook(imported);
    const created = await booksDb.getBook(imported.bookUrl);
    if (created && (imported.readConfig || imported.durChapterIndex != null)) {
      await booksDb.updateBook(mergeLegadoImportedBookFields(created, imported));
    }
    count += 1;
  }
  return count;
}

async function importReadRecordsFromJson(text: string): Promise<number> {
  const arr = JSON.parse(text) as unknown;
  if (!Array.isArray(arr)) return 0;
  let count = 0;
  for (const item of arr) {
    const row = item as Record<string, unknown>;
    const deviceId = String(row.deviceId ?? 'web').trim();
    const bookName = String(row.bookName ?? row.name ?? '').trim();
    if (!bookName) continue;
    const record: ReadRecord = {
      deviceId,
      bookName,
      bookAuthor: String(row.bookAuthor ?? row.author ?? ''),
      readTime: Number(row.readTime ?? 0),
      lastRead: Number(row.lastRead ?? Date.now()),
      durChapterTitle: String(row.durChapterTitle ?? ''),
      durChapterIndex: Number(row.durChapterIndex ?? 0),
    };
    await readRecordsDb.upsertReadRecord(record);
    count += 1;
  }
  return count;
}

export async function restoreBackupFromBytes(
  fileName: string,
  bytes: Uint8Array,
  replaceOrOptions: boolean | RestoreBackupOptions = true,
): Promise<string[]> {
  const options: RestoreBackupOptions =
    typeof replaceOrOptions === 'boolean' ? { replace: replaceOrOptions } : replaceOrOptions;
  const selected = options.selectedFileNames ?? (await getSelectedBackupFileNames());
  const backupPassword = options.backupPassword ?? (await getBackupPassword());

  const summary: string[] = [];
  const lower = fileName.toLowerCase();

  const legacyKind = detectLegacyImportKind(fileName);
  if (legacyKind && !isZipBuffer(bytes) && !isSqliteBuffer(bytes)) {
    const text = new TextDecoder().decode(bytes);
    const n = await importLegacyBackupFile(legacyKind, text);
    if (n > 0) summary.push(`旧版 ${legacyKind} ${n} 条`);
    if (summary.length === 0) throw new Error('旧版数据导入失败或为空');
    return summary;
  }

  if (isSqliteBuffer(bytes) || /\.(db|sqlite3?)$/.test(lower)) {
    if (!shouldRestoreItem('reader.db', selected)) {
      throw new Error('选择性恢复未包含数据库项');
    }
    await importDatabase(toArrayBuffer(bytes), options.replace !== false);
    summary.push('已全量恢复 SQLite 数据库');
    return summary;
  }

  if (isZipBuffer(bytes) || lower.endsWith('.zip')) {
    const { text, binary } = await unzipBackup(bytes);

    if (text['servers.json']) {
      text['servers.json'] = decryptBackupJsonIfNeeded(text['servers.json'], backupPassword);
    }

    const dbEntry = Object.entries(binary).find(([name]) =>
      shouldRestoreItem('reader.db', selected)
      && (/^(reader|legado|backup)\.(db|sqlite3?)$/.test(basename(name)) || name.endsWith('.db')),
    );
    if (dbEntry && shouldRestoreItem('reader.db', selected)) {
      await importDatabase(toArrayBuffer(dbEntry[1]), options.replace !== false);
      summary.push(`已全量恢复数据库：${basename(dbEntry[0])}`);
      return summary;
    }

    const bookJson =
      shouldRestoreItem('bookSource.json', selected)
        ? pickZipEntry(text, [...LEGADO_ZIP_BOOK_SOURCE_NAMES, 'booksource.json'])
        : null;
    const rssJson = shouldRestoreItem('rssSources.json', selected)
      ? pickZipEntry(text, LEGADO_ZIP_RSS_NAMES)
      : null;
    const replaceJson = shouldRestoreItem('replaceRule.json', selected)
      ? pickZipEntry(text, LEGADO_ZIP_REPLACE_RULE_NAMES)
      : null;
    const shelfJson = shouldRestoreItem('bookshelf.json', selected)
      ? pickZipEntry(text, ['bookshelf.json', 'books.json'])
      : null;
    const recordJson = shouldRestoreItem('readRecord.json', selected)
      ? pickZipEntry(text, ['readrecord.json', 'read_record.json'])
      : null;

    if (bookJson) {
      let sources = parseBookSourceJson(bookJson);
      if (sources.length === 0) {
        const n = await importOldBookSourcesToDb(bookJson);
        if (n > 0) summary.push(`书源（旧版） ${n} 条`);
      } else {
        let n = 0;
        for (const source of sources) {
          if (!source.sourceUrl?.trim() || !source.sourceName?.trim()) continue;
          await sourcesDb.insertSource(source);
          n += 1;
        }
        if (n > 0) summary.push(`书源 ${n} 条`);
      }
    }
    if (rssJson) {
      const rss = parseRssSourceJson(rssJson);
      const n = await importRssSourcesFromList(rss);
      if (n > 0) summary.push(`RSS 源 ${n} 条`);
    }
    if (replaceJson) {
      const n = await importReplaceRulesFromJson(replaceJson);
      if (n > 0) summary.push(`替换规则 ${n} 条`);
    }
    if (shelfJson) {
      const n = await importBooksFromLegadoJson(shelfJson);
      if (n > 0) summary.push(`书架书籍 ${n} 本`);
    }
    if (recordJson) {
      const n = await importReadRecordsFromJson(recordJson);
      if (n > 0) summary.push(`阅读记录 ${n} 条`);
    }

    summary.push(...(await importExtraBackupJsonEntries(text, selected)));

    const readConfigJson = shouldRestoreItem('readConfig.json', selected)
      ? pickZipEntry(text, LEGADO_ZIP_READ_CONFIG_NAMES)
      : null;
    const shareReadConfigJson = shouldRestoreItem('shareReadConfig.json', selected)
      ? pickZipEntry(text, LEGADO_ZIP_SHARE_READ_CONFIG_NAMES)
      : null;
    const readerUiJson = shouldRestoreItem('readerUiConfig.json', selected)
      ? pickZipEntry(text, LEGADO_ZIP_READER_UI_CONFIG_NAMES)
      : null;
    const readerPrefsJson = shouldRestoreItem('readerPrefs.json', selected)
      ? pickZipEntry(text, LEGADO_ZIP_READER_PREFS_NAMES)
      : null;
    const configXml = shouldRestoreItem('config.xml', selected)
      ? pickZipEntry(text, LEGADO_ZIP_CONFIG_XML_NAMES)
      : null;
    if (readConfigJson || shareReadConfigJson || readerUiJson || readerPrefsJson || configXml) {
      const importedUi = importReaderUiConfigFromBackupEntries({
        ...text,
        ...(readConfigJson ? { 'readConfig.json': readConfigJson } : {}),
        ...(shareReadConfigJson ? { 'shareReadConfig.json': shareReadConfigJson } : {}),
        ...(readerUiJson ? { 'readerUiConfig.json': readerUiJson } : {}),
        ...(readerPrefsJson ? { 'readerPrefs.json': readerPrefsJson } : {}),
        ...(configXml ? { 'config.xml': configXml } : {}),
      });
      if (importedUi) {
        await saveReaderUiConfig(importedUi);
        summary.push('阅读器 UI 配置');
      }
    }

    if (shouldRestoreItem('book_cache', selected)) {
      const cacheCount = await restoreBookCacheFromZip(binary, text);
      if (cacheCount > 0) summary.push(`章节缓存 ${cacheCount} 个文件`);
    }

    if (shouldRestoreItem('bg', selected)) {
      const bgCount = await restoreBackgroundFromZip(binary);
      if (bgCount > 0) summary.push(`背景图片 ${bgCount} 张`);
    }

    for (const [name, content] of Object.entries(text)) {
      const legacyKind = detectLegacyImportKind(name);
      if (!legacyKind) continue;
      const n = await importLegacyBackupFile(legacyKind, content);
      if (n > 0) summary.push(`旧版 ${legacyKind} ${n} 条`);
    }

    if (summary.length === 0) {
      throw new Error('ZIP 中未找到可识别的数据库或 JSON 备份项');
    }
    return summary;
  }

  throw new Error('不支持的备份格式，请上传 .db / .sqlite / .zip 文件');
}

export async function restoreBackupApi(
  postData: string | null,
): Promise<LegadoReturnData<{ summary: string[]; reloadRecommended: boolean }>> {
  if (!postData?.trim()) return legadoErr('备份文件不能为空');

  let payload: { fileName?: string; fileDataBase64?: string; replace?: boolean };
  try {
    payload = JSON.parse(postData) as typeof payload;
  } catch {
    return legadoErr('格式不对');
  }

  const fileName = payload.fileName?.trim();
  const fileDataBase64 = payload.fileDataBase64?.trim();
  if (!fileName || !fileDataBase64) return legadoErr('fileName 与 fileDataBase64 不能为空');

  try {
    const bytes = decodeBase64ToUint8Array(fileDataBase64);
    const replace = payload.replace !== false;
    const summary = await restoreBackupFromBytes(fileName, bytes, replace);
    const fullReplace = summary.some((s) => s.includes('全量恢复'));
    return legadoOk({ summary, reloadRecommended: fullReplace });
  } catch (e) {
    return legadoErr(e instanceof Error ? e.message : String(e));
  }
}
