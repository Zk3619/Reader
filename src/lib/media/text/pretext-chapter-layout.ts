/**
 * Pretext 章节完整布局：Parse → Compute → pageStarts
 *
 * chapterPosition / page.text 由 Pretext 行映射提供；字级 startX/endX 由可见页 lazy DOM 补全。
 */

import type { ReaderChapterLayout } from '@/lib/media/text/reader-chapter-layout-types';
import {
  layoutDocumentFromChapter,
  type LayoutDocumentParams,
} from '@/lib/media/text/pretext-layout-document';
import { computeSegmentsFromLayoutDocument } from '@/lib/media/text/pretext-chapter-segments';
import {
  pageChapterPositionFromLineMetas,
  pageLineMetasForRange,
  pageTextFromLineMetas,
} from '@/lib/media/text/pretext-line-map';
import { textViewerPagedContentInsets } from '@/lib/media/text/reader-ui-config';
import { pageDisplayHeight } from '@/lib/media/text/text-viewer-paginate';
import { computePageStartsForLayout } from '@/lib/media/text/text-viewer-paginate-dual';
import { trimPageStartsToSegmentVisualBounds } from '@/lib/media/text/text-viewer-paginate';

export interface PretextChapterLayoutParams extends LayoutDocumentParams {
  chapterIndex: number;
  cacheKey: string;
  padTop?: number;
  padBottom?: number;
  clipHeightPx?: number;
  dualPage?: boolean;
}

export function layoutChapterFromPretext(
  params: PretextChapterLayoutParams,
): ReaderChapterLayout | null {
  const doc = layoutDocumentFromChapter({
    ...params,
    disableFloat: params.dualPage,
  });
  if (doc.unsupported) return null;

  const defaultPads = textViewerPagedContentInsets(params.config);
  const padTop = params.padTop ?? defaultPads.top;
  const padBottom = params.padBottom ?? defaultPads.bottom;
  const clipHeight =
    params.clipHeightPx != null && params.clipHeightPx > 0
      ? Math.max(1, Math.floor(params.clipHeightPx))
      : Math.max(1, Math.floor(params.viewportHeight - padTop - padBottom));

  const { segments: rawSegments, contentExtent, lineMetas } = computeSegmentsFromLayoutDocument(
    doc,
    params.config,
  );

  const extent = Math.max(
    contentExtent,
    rawSegments.reduce((m, s) => Math.max(m, s.bottom), 0),
  );

  const layoutResult = computePageStartsForLayout(
    rawSegments,
    clipHeight,
    extent,
    {
      dualPage: params.dualPage,
      fontSize: params.config.fontSize,
      lineSpacing: params.config.spacing.line,
      paragraphSpacing: params.config.spacing.paragraph,
    },
  );

  const segments = layoutResult.segments ?? rawSegments;
  let pageStarts = layoutResult.pageStarts;
  if (pageStarts.length > 1) {
    pageStarts = trimPageStartsToSegmentVisualBounds(
      pageStarts,
      segments,
      clipHeight,
      extent,
    );
  }
  const resolvedExtent =
    params.dualPage && layoutResult.leftColumnExtent != null
      ? Math.max(
          layoutResult.leftColumnExtent,
          layoutResult.rightColumnExtent ?? 0,
          extent,
        )
      : extent;

  const pages = pageStarts.map((startY, index) => {
    const endY = pageStarts[index + 1] ?? resolvedExtent;
    const pageLines = pageLineMetasForRange(lineMetas, startY, endY);
    return {
      index,
      startY,
      endY,
      displayHeight: pageDisplayHeight(
        index,
        pageStarts,
        clipHeight,
        resolvedExtent,
        segments,
      ),
      chapterPosition: pageChapterPositionFromLineMetas(pageLines),
      text: pageTextFromLineMetas(pageLines),
      leftLineSize: layoutResult.leftLineSizes?.[index],
    };
  });

  return {
    chapterIndex: params.chapterIndex,
    engine: 'pretext',
    pages,
    pageStarts,
    clipHeight,
    viewportHeight: Math.max(1, params.viewportHeight),
    viewportWidth: Math.max(1, params.viewportWidth),
    contentExtent: resolvedExtent,
    padTop,
    padBottom,
    segments,
    dualPage: params.dualPage,
    rightPageStarts: layoutResult.rightPageStarts,
    leftColumnExtent: layoutResult.leftColumnExtent,
    rightColumnExtent: layoutResult.rightColumnExtent,
    cacheKey: params.cacheKey,
  };
}
