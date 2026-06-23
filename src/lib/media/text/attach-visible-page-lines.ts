/**
 * 可见页 lazy DOM 行采集（Pretext 字级 hit-test / justify 兜底）
 */

import type { ReaderChapterLayout } from '@/lib/media/text/reader-chapter-layout-types';
import { metaFromTextLines } from '@/lib/media/text/reader-text-layout-entities';
import { attachLinesToPages, collectDomTextLines } from '@/lib/media/text/text-viewer-line-metrics';

export interface AttachVisiblePageDomLinesOptions {
  fontSize?: number;
  lineSpacing?: number;
  /** 保留 Pretext 已算出的 chapterPosition / text，仅补 lines */
  preservePretextMeta?: boolean;
}

export function attachVisiblePageDomLines(
  layout: ReaderChapterLayout,
  contentRoot: HTMLElement,
  pageIndex: number,
  options?: AttachVisiblePageDomLinesOptions,
): ReaderChapterLayout {
  const allLines = collectDomTextLines(contentRoot, {
    fontSize: options?.fontSize,
    lineSpacing: options?.lineSpacing,
  });
  if (allLines.length === 0) return layout;

  const pageCount = layout.pageStarts.length;
  const visibleIndices = [pageIndex - 1, pageIndex, pageIndex + 1].filter(
    (i) => i >= 0 && i < pageCount,
  );
  if (visibleIndices.length === 0) return layout;

  const lineMap = attachLinesToPages(
    layout.pageStarts.map((startY, index) => ({
      startY,
      endY: layout.pageStarts[index + 1] ?? layout.contentExtent,
      index,
    })),
    allLines,
  );

  const preserveMeta = options?.preservePretextMeta ?? layout.engine === 'pretext';
  const pages = layout.pages.map((page, index) => {
    if (!visibleIndices.includes(index)) return page;
    const pageLines = lineMap.get(index) ?? [];
    if (pageLines.length === 0) return page;
    const meta = metaFromTextLines(pageLines);
    if (preserveMeta) {
      return {
        ...page,
        lines: meta.lines,
        leftLineSize: meta.leftLineSize ?? page.leftLineSize,
      };
    }
    return {
      ...page,
      chapterPosition: meta.chapterPosition,
      text: meta.text,
      lines: meta.lines,
      leftLineSize: meta.leftLineSize ?? page.leftLineSize,
    };
  });

  return { ...layout, pages };
}
