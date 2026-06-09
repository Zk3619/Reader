/**
 * 书架缓存导出统一执行入口
 */

import { exportBook } from '@/lib/export/export-book';
import {
  exportMangaImages,
  isExportCancelledError as isImageExportCancelledError,
} from '@/lib/export/export-images';
import {
  exportChapterAudio,
  isExportCancelledError as isAudioExportCancelledError,
} from '@/lib/export/export-audio';
import {
  createExportProgressReporter,
  finishExportProgressToast,
  type ExportProgressCallback,
} from '@/lib/export/export-progress';
import { SaveTextFileCancelledError } from '@/lib/export/save-text-file';
import { SaveBinaryFileCancelledError } from '@/lib/export/save-binary-file';
import { DEFAULT_CACHE_EXPORT_OPTIONS, type CacheExportOptions } from '@/lib/export/cache-export-types';
import type { Book } from '@/types';

export type CacheExportProgressState = {
  phase: string;
  current: number;
  total: number;
};

export function isCacheExportCancelledError(e: unknown): boolean {
  return (
    e instanceof SaveTextFileCancelledError ||
    e instanceof SaveBinaryFileCancelledError ||
    isImageExportCancelledError(e) ||
    isAudioExportCancelledError(e)
  );
}

export async function runCacheExport(
  book: Book,
  options: CacheExportOptions,
  onDialogProgress?: (state: CacheExportProgressState) => void,
): Promise<{ exported: number; kindLabel: string }> {
  const merged = { ...DEFAULT_CACHE_EXPORT_OPTIONS, ...options };
  const onProgress: ExportProgressCallback = createExportProgressReporter(
    book.name,
    onDialogProgress,
  );

  try {
    if (merged.kind === 'text') {
      const { exported } = await exportBook(book, {
        startIndex: merged.startIndex,
        endIndex: merged.endIndex,
        fetchMissing: false,
        onlyCached: merged.onlyCached,
        format: merged.textFormat,
        layout: merged.textLayout,
        onProgress,
      });
      finishExportProgressToast(
        true,
        `已导出文本：${book.name}`,
        `${exported} 章 · ${merged.textFormat.toUpperCase()}`,
      );
      return { exported, kindLabel: '文本' };
    }

    if (merged.kind === 'image') {
      const { exported } = await exportMangaImages(book, {
        startIndex: merged.startIndex,
        endIndex: merged.endIndex,
        onlyCached: merged.onlyCached,
        format: merged.imageDelivery,
        groupByChapter: merged.imageGroupByChapter,
        targetFormat: merged.imageTargetFormat,
        onProgress,
      });
      finishExportProgressToast(
        true,
        `已导出图片：${book.name}`,
        `共 ${exported} 张`,
      );
      return { exported, kindLabel: '图片' };
    }

    const { exported } = await exportChapterAudio(book, {
      startIndex: merged.startIndex,
      endIndex: merged.endIndex,
      onlyCached: merged.onlyCached,
      format: merged.audioDelivery,
      targetFormat: merged.audioTargetFormat,
      mergeSingle: merged.audioMergeSingle,
      onProgress,
    });
    finishExportProgressToast(
      true,
      `已导出音频：${book.name}`,
      merged.audioMergeSingle ? '已合并为单文件' : `共 ${exported} 个文件`,
    );
    return { exported, kindLabel: '音频' };
  } catch (e) {
    if (!isCacheExportCancelledError(e)) {
      finishExportProgressToast(false, '导出失败', e instanceof Error ? e.message : String(e));
      throw e;
    }
    finishExportProgressToast(false, '');
    throw e;
  }
}
