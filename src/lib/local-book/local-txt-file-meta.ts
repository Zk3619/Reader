/**
 * 本地 TXT 文件签名（对齐 Legado isLocalModified：文件变更后重分章）
 */

import { getFileSystem } from '@/lib/platform/filesystem';
import type { Book } from '@/types';

export type TxtOffsetUnit = 'byte' | 'char';

export interface LocalTxtFileMeta {
  txtByteSize?: number;
  /** 文件 mtime（毫秒），Tauri/原生路径可用 */
  txtFileMtime?: number;
  /** 章节 start/end 单位：byte 为字节偏移（流式 UTF-8），char 为字符串索引 */
  txtOffsetUnit?: TxtOffsetUnit;
}

function parseVariableObject(variable: string | undefined): Record<string, unknown> {
  const raw = variable?.trim();
  if (!raw?.startsWith('{')) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function readLocalTxtFileMeta(variable: string | undefined): LocalTxtFileMeta {
  const obj = parseVariableObject(variable);
  const size = obj.txtByteSize;
  const mtime = obj.txtFileMtime;
  const unit = obj.txtOffsetUnit;
  return {
    txtByteSize: typeof size === 'number' && Number.isFinite(size) ? size : undefined,
    txtFileMtime: typeof mtime === 'number' && Number.isFinite(mtime) ? mtime : undefined,
    txtOffsetUnit: unit === 'byte' || unit === 'char' ? unit : undefined,
  };
}

export function mergeLocalTxtFileMeta(
  variable: string | undefined,
  patch: LocalTxtFileMeta,
): string {
  const obj = parseVariableObject(variable);
  if (patch.txtByteSize != null) obj.txtByteSize = patch.txtByteSize;
  if (patch.txtFileMtime != null) obj.txtFileMtime = patch.txtFileMtime;
  if (patch.txtOffsetUnit != null) obj.txtOffsetUnit = patch.txtOffsetUnit;
  return JSON.stringify(obj);
}

/** 读取当前文件大小与 mtime，用于写入书籍 variable */
export async function captureLocalTxtFileMeta(bookUrl: string): Promise<LocalTxtFileMeta> {
  const fs = await getFileSystem();
  const [txtByteSize, txtFileMtime] = await Promise.all([
    fs.getFileSize(bookUrl),
    fs.getFileMtime(bookUrl),
  ]);
  return {
    txtByteSize,
    txtFileMtime: txtFileMtime ?? undefined,
  };
}

export async function getLocalTxtFileByteSize(bookUrl: string): Promise<number> {
  const fs = await getFileSystem();
  return fs.getFileSize(bookUrl);
}

/**
 * 文件是否相对缓存签名已修改（对齐 Legado isLocalModified）
 * 优先比较 mtime；无 mtime 时回退字节大小；均无缓存时与 latestChapterTime 比较
 */
export async function isLocalTxtFileModified(book: Book): Promise<boolean> {
  const stored = readLocalTxtFileMeta(book.variable);
  try {
    const current = await captureLocalTxtFileMeta(book.bookUrl);

    if (stored.txtFileMtime == null && stored.txtByteSize == null) {
      if (current.txtFileMtime != null && book.latestChapterTime > 0) {
        return current.txtFileMtime > book.latestChapterTime;
      }
      return false;
    }

    if (current.txtFileMtime != null && stored.txtFileMtime != null) {
      return current.txtFileMtime > stored.txtFileMtime;
    }

    if (stored.txtByteSize != null && current.txtByteSize != null && stored.txtByteSize > 0) {
      return current.txtByteSize !== stored.txtByteSize;
    }

    return false;
  } catch {
    return false;
  }
}

export function txtOffsetsAreBytes(book: Book): boolean {
  return readLocalTxtFileMeta(book.variable).txtOffsetUnit === 'byte';
}
