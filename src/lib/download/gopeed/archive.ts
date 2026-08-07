/**
 * 归档解压 API（对齐 Gopeed Archive）
 * Tauri：优先 invoke；Web：zip 可走 fflate（其余格式明确报错）
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/platform/detect';

export interface ArchiveExtractOptions {
  /** 归档文件路径（绝对路径或 file URL） */
  archivePath: string;
  /** 解压目标目录 */
  destDir: string;
  /** 可选密码 */
  password?: string;
  /** 解压成功后是否删除归档 */
  deleteAfterExtract?: boolean;
}

export interface ArchiveExtractProgress {
  extractedFiles: number;
  totalFiles: number;
  /** 0–100 */
  percent: number;
}

export interface ArchiveExtractResult {
  destDir: string;
  extractedFiles: number;
  deletedArchive: boolean;
}

export type ArchiveExtractProgressCallback = (progress: ArchiveExtractProgress) => void;

export interface ArchiveExtractor {
  isArchiveFile(filename: string): boolean;
  extract(
    opts: ArchiveExtractOptions,
    onProgress?: ArchiveExtractProgressCallback,
  ): Promise<ArchiveExtractResult>;
}

const ARCHIVE_EXTS = [
  '.zip',
  '.tar',
  '.tgz',
  '.tar.gz',
  '.tar.bz2',
  '.tar.xz',
  '.gz',
  '.bz2',
  '.xz',
  '.7z',
  '.rar',
  '.cab',
  '.iso',
];

export function isArchiveFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  if (/\.(zip|7z|rar)\.\d{3}$/i.test(lower)) return true;
  if (/\.part\d+\.rar$/i.test(lower)) return true;
  return ARCHIVE_EXTS.some((ext) => lower.endsWith(ext));
}

/** Detect multi-volume archive family and return preferred primary volume path. */
export function resolveArchivePrimaryPath(filepath: string): {
  primary: string;
  siblings: string[];
  waiting: boolean;
} {
  const dir = filepath.replace(/[/\\][^/\\]+$/, '') || '.';
  const base = filepath.split(/[/\\]/).pop() || filepath;

  // foo.zip.001 / foo.7z.001
  const volDot = base.match(/^(.*)\.(zip|7z|rar)\.(\d{3})$/i);
  if (volDot) {
    const stem = volDot[1]!;
    const kind = volDot[2]!;
    const primaryName = `${stem}.${kind}.001`;
    const primary = `${dir}/${primaryName}`.replace(/\\/g, '/');
    return { primary: primary.replace(/\//g, filepath.includes('\\') ? '\\' : '/'), siblings: [], waiting: false };
  }

  // foo.part1.rar
  const partRar = base.match(/^(.*)\.part(\d+)\.rar$/i);
  if (partRar) {
    const stem = partRar[1]!;
    const primaryName = `${stem}.part1.rar`;
    const primary = `${dir}/${primaryName}`;
    return {
      primary: primary.replace(/\//g, filepath.includes('\\') ? '\\' : '/'),
      siblings: [],
      waiting: false,
    };
  }

  return { primary: filepath, siblings: [], waiting: false };
}

/**
 * List sibling volume paths that should exist before extract.
 * Uses naming patterns only (caller checks existence).
 */
export function listExpectedVolumePaths(filepath: string): string[] {
  const sep = filepath.includes('\\') ? '\\' : '/';
  const dir = filepath.replace(/[/\\][^/\\]+$/, '') || '.';
  const base = filepath.split(/[/\\]/).pop() || filepath;
  const out: string[] = [];

  const volDot = base.match(/^(.*)\.(zip|7z|rar)\.(\d{3})$/i);
  if (volDot) {
    const stem = volDot[1]!;
    const kind = volDot[2]!;
    const n = Number(volDot[3]);
    for (let i = 1; i <= Math.max(n, 1); i++) {
      out.push(`${dir}${sep}${stem}.${kind}.${String(i).padStart(3, '0')}`);
    }
    return out;
  }

  const partRar = base.match(/^(.*)\.part(\d+)\.rar$/i);
  if (partRar) {
    const stem = partRar[1]!;
    const n = Number(partRar[2]);
    for (let i = 1; i <= Math.max(n, 1); i++) {
      out.push(`${dir}${sep}${stem}.part${i}.rar`);
    }
    return out;
  }

  return [filepath];
}

async function extractViaInvoke(
  opts: ArchiveExtractOptions,
): Promise<ArchiveExtractResult> {
  const raw = await invoke<{
    destDir?: string;
    extractedFiles?: number;
    deletedArchive?: boolean;
  }>('download_engine_extract_archive', {
    archivePath: opts.archivePath,
    destDir: opts.destDir,
    password: opts.password ?? '',
    deleteAfterExtract: Boolean(opts.deleteAfterExtract),
  });
  return {
    destDir: String(raw?.destDir ?? opts.destDir),
    extractedFiles: Number(raw?.extractedFiles ?? 0) || 0,
    deletedArchive: Boolean(raw?.deletedArchive),
  };
}

/**
 * 默认解压器：Tauri 走 Rust 引擎；非 Tauri 仅对 .zip 给出明确未实现错误
 *（后续可接 fflate 内存解压路径）。
 */
export const defaultArchiveExtractor: ArchiveExtractor = {
  isArchiveFile,
  async extract(opts, onProgress) {
    if (!opts.archivePath) {
      throw new Error('archive extract: archivePath is required');
    }
    if (!opts.destDir) {
      throw new Error('archive extract: destDir is required');
    }
    if (!isArchiveFile(opts.archivePath)) {
      throw new Error(`archive extract: unsupported archive: ${opts.archivePath}`);
    }

    if (isTauri()) {
      try {
        onProgress?.({ extractedFiles: 0, totalFiles: 0, percent: 0 });
        const result = await extractViaInvoke(opts);
        onProgress?.({
          extractedFiles: result.extractedFiles,
          totalFiles: result.extractedFiles,
          percent: 100,
        });
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`download_engine_extract_archive failed: ${msg}`);
      }
    }

    throw new Error(
      'archive extract: native engine unavailable outside Tauri; zip-via-fflate path not wired for filesystem paths',
    );
  },
};

export async function extractArchive(
  opts: ArchiveExtractOptions,
  onProgress?: ArchiveExtractProgressCallback,
  extractor: ArchiveExtractor = defaultArchiveExtractor,
): Promise<ArchiveExtractResult> {
  return extractor.extract(opts, onProgress);
}
