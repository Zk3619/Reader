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
} from '@/lib/book-source/legado-zip';
import * as readRecordsDb from '@/lib/database/read-records';
import { legadoErr, legadoOk, type LegadoReturnData } from '@/lib/web-api/return-data';
import type { NewBook } from '@/types';
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
    const name = basename(path);
    if (!name) continue;
    if (/\.(db|sqlite3?)$/.test(name)) {
      binary[name] = data;
    } else if (name.endsWith('.json') || name.endsWith('.txt')) {
      const decoded = new TextDecoder().decode(data);
      if (decoded.trim()) text[name] = decoded;
    }
  }
  return { text, binary };
}

async function importBooksFromLegadoJson(text: string): Promise<number> {
  const arr = JSON.parse(text) as unknown;
  if (!Array.isArray(arr)) return 0;
  let count = 0;
  for (const item of arr) {
    const row = item as Record<string, unknown>;
    const bookUrl = String(row.bookUrl ?? '').trim();
    const name = String(row.name ?? '').trim();
    if (!bookUrl || !name) continue;
    if (await booksDb.hasBook(bookUrl)) continue;
    const book: NewBook = {
      bookUrl,
      tocUrl: String(row.tocUrl ?? bookUrl),
      origin: String(row.origin ?? bookUrl),
      originName: String(row.originName ?? ''),
      name,
      author: String(row.author ?? ''),
      kind: row.kind != null ? String(row.kind) : undefined,
      intro: row.intro != null ? String(row.intro) : undefined,
      coverUrl: row.coverUrl != null ? String(row.coverUrl) : undefined,
      charset: row.charset != null ? String(row.charset) : undefined,
      type: typeof row.type === 'number' ? row.type : Number(row.type) || 0,
      variable: row.variable != null ? String(row.variable) : undefined,
    };
    await booksDb.insertBook(book);
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
  _replace = true,
): Promise<string[]> {
  const summary: string[] = [];
  const lower = fileName.toLowerCase();

  if (isSqliteBuffer(bytes) || /\.(db|sqlite3?)$/.test(lower)) {
    await importDatabase(toArrayBuffer(bytes), true);
    summary.push('已全量恢复 SQLite 数据库');
    return summary;
  }

  if (isZipBuffer(bytes) || lower.endsWith('.zip')) {
    const { text, binary } = await unzipBackup(bytes);

    const dbEntry = Object.entries(binary).find(([name]) =>
      /^(reader|legado|backup)\.(db|sqlite3?)$/.test(name) || name.endsWith('.db'),
    );
    if (dbEntry) {
      await importDatabase(toArrayBuffer(dbEntry[1]), true);
      summary.push(`已全量恢复数据库：${dbEntry[0]}`);
      return summary;
    }

    const bookJson = pickZipEntry(text, [
      ...LEGADO_ZIP_BOOK_SOURCE_NAMES,
      'booksource.json',
    ]);
    const rssJson = pickZipEntry(text, LEGADO_ZIP_RSS_NAMES);
    const replaceJson = pickZipEntry(text, LEGADO_ZIP_REPLACE_RULE_NAMES);
    const shelfJson = pickZipEntry(text, ['bookshelf.json', 'books.json']);
    const recordJson = pickZipEntry(text, ['readrecord.json', 'read_record.json']);

    if (bookJson) {
      const sources = parseBookSourceJson(bookJson);
      let n = 0;
      for (const source of sources) {
        if (!source.sourceUrl?.trim() || !source.sourceName?.trim()) continue;
        await sourcesDb.insertSource(source);
        n += 1;
      }
      if (n > 0) summary.push(`书源 ${n} 条`);
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
