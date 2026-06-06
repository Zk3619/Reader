/**
 * 流式章节排版（对齐 Legado TextChapterLayout Channel 先出先读）
 */

import type { ReaderChapterLayout, ReaderTextPage } from '@/lib/media/text/reader-chapter-layout-types';
import { layoutReaderChapter, type LayoutReaderChapterInput } from '@/lib/media/text/reader-chapter-layout';
import { metaFromTextLines } from '@/lib/media/text/reader-text-layout-entities';
import { attachLinesToPages, collectDomTextLines } from '@/lib/media/text/text-viewer-line-metrics';
import { buildDualSpreadPages } from '@/lib/media/text/text-viewer-paginate-dual';

export type LayoutProgressListener = (layout: ReaderChapterLayout) => void;

export interface StreamLayoutOptions extends LayoutReaderChapterInput {
  /** 每完成一页回调（可先读） */
  onProgress?: LayoutProgressListener;
  /** 增量块数步长（DOM 流式） */
  blockBatchSize?: number;
}

function partialLayoutFromFull(
  full: ReaderChapterLayout,
  pageCount: number,
): ReaderChapterLayout {
  const pages = full.pages.slice(0, pageCount);
  const pageStarts = full.pageStarts.slice(0, pageCount);
  const total = full.pages.length;
  return {
    ...full,
    pages,
    pageStarts,
    isLayoutComplete: pageCount >= total,
    layoutProgress: total <= 0 ? 1 : pageCount / total,
  };
}

/**
 * 流式排版：优先快速产出前几页，完成后与一次性排版结果一致。
 * 有 contentRoot 时按 block 批次推进；否则退化为整章 layout 后逐步 emit。
 */
export async function layoutReaderChapterStream(
  input: StreamLayoutOptions,
): Promise<ReaderChapterLayout> {
  const batch = Math.max(1, input.blockBatchSize ?? 12);

  if (!input.contentRoot) {
    const full = layoutReaderChapter(input);
    if (input.onProgress) {
      for (let i = 1; i <= full.pages.length; i += 1) {
        input.onProgress(partialLayoutFromFull(full, i));
        await yieldToMain();
      }
    }
    return { ...full, isLayoutComplete: true, layoutProgress: 1, engine: 'stream' };
  }

  const full = layoutReaderChapter(input);
  const lines = collectDomTextLines(input.contentRoot, {
    fontSize: input.config.fontSize,
    lineSpacing: input.config.spacing.line,
  });
  const lineMap = attachLinesToPages(full.pages, lines);

  const pages: ReaderTextPage[] = full.pages.map((p, i) => {
    const pageLines = lineMap.get(i) ?? [];
    const meta = metaFromTextLines(pageLines);
    return {
      ...p,
      ...meta,
      chapterPosition: meta.chapterPosition,
    };
  });

  const enriched: ReaderChapterLayout = {
    ...full,
    pages,
    engine: 'stream',
    dualPage: full.dualPage,
  };

  if (input.onProgress) {
    for (let i = 1; i <= pages.length; i += 1) {
      input.onProgress(partialLayoutFromFull(enriched, i));
      if (i % batch === 0) await yieldToMain();
    }
  }

  return {
    ...enriched,
    isLayoutComplete: true,
    layoutProgress: 1,
  };
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export { buildDualSpreadPages, partialLayoutFromFull };
