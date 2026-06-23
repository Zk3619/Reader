/**
 * @deprecated 使用 layoutChapterFromPretext / layoutReaderChapter（layoutEngine: pretext）
 */

import type { ReaderChapterLayout } from '@/lib/media/text/reader-chapter-layout-types';
import { layoutChapterFromPretext } from '@/lib/media/text/pretext-chapter-layout';
import type { CanvasTextLayoutParams } from '@/lib/media/text/canvas-text-chapter-layout-types';

export type { CanvasTextLayoutParams } from '@/lib/media/text/canvas-text-chapter-layout-types';

export function layoutPlainTextChapterCanvas(
  params: CanvasTextLayoutParams,
): ReaderChapterLayout {
  const layout = layoutChapterFromPretext({
    chapterIndex: params.chapterIndex,
    raw: params.raw,
    chapterTitle: params.chapterTitle,
    viewportWidth: params.viewportWidth,
    viewportHeight: params.viewportHeight,
    config: params.config,
    cacheKey: params.cacheKey,
    padTop: params.padTop,
    padBottom: params.padBottom,
    clipHeightPx: params.clipHeightPx,
    horizontalInsetOnSlot: params.horizontalInsetOnSlot,
  });
  if (!layout) {
    return {
      chapterIndex: params.chapterIndex,
      engine: 'pretext',
      pages: [],
      pageStarts: [0],
      clipHeight: 1,
      viewportHeight: params.viewportHeight,
      viewportWidth: params.viewportWidth,
      contentExtent: 0,
      padTop: 0,
      padBottom: 0,
      segments: [],
      cacheKey: params.cacheKey,
    };
  }
  return layout;
}
