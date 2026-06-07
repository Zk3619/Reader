import type { ReaderChapterLayout } from '@/lib/media/text/reader-chapter-layout-types';
import {
  paginateReaderContent,
  pageDisplayHeight,
  type PaginateReaderContentResult,
} from '@/lib/media/text/text-viewer-paginate';
import { segmentsForColumn } from '@/lib/media/text/text-viewer-paginate-dual';
import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import { textViewerPagedContentInsets } from '@/lib/media/text/reader-ui-config';
import { metaFromTextLines } from '@/lib/media/text/reader-text-layout-entities';
import { attachLinesToPages, collectDomTextLines } from '@/lib/media/text/text-viewer-line-metrics';

export interface DomChapterLayoutParams {
  chapterIndex: number;
  contentRoot: HTMLElement;
  viewportWidth: number;
  viewportHeight: number;
  config: TextViewerUiConfig;
  cacheKey: string;
  dualPage?: boolean;
  padTop?: number;
  padBottom?: number;
  clipHeightPx?: number;
}

export function chapterLayoutFromPaginateResult(
  chapterIndex: number,
  cacheKey: string,
  viewportWidth: number,
  result: PaginateReaderContentResult,
  options?: { dualPage?: boolean; contentRoot?: HTMLElement; config?: TextViewerUiConfig },
): ReaderChapterLayout {
  const lines = options?.contentRoot
    ? collectDomTextLines(options.contentRoot, {
      fontSize: options.config?.fontSize,
      lineSpacing: options.config?.spacing.line,
    })
    : [];
  const lineMap = lines.length > 0 ? attachLinesToPages(
    result.pageStarts.map((startY, index) => ({
      startY,
      endY: result.pageStarts[index + 1] ?? result.contentExtent,
      index,
    })),
    lines,
  ) : null;

  const dualPage = options?.dualPage;
  const displaySegments =
    dualPage ? segmentsForColumn(result.segments, 0) : result.segments;

  const pages = result.pageStarts.map((startY, index) => {
    const pageLines = lineMap?.get(index) ?? [];
    const meta = metaFromTextLines(pageLines);
    return {
      index,
      startY,
      endY: result.pageStarts[index + 1] ?? result.contentExtent,
      displayHeight: pageDisplayHeight(
        index,
        result.pageStarts,
        result.clipHeight,
        result.contentExtent,
        displaySegments,
      ),
      chapterPosition: meta.chapterPosition,
      text: meta.text,
      lines: meta.lines,
      leftLineSize: result.leftLineSizes?.[index] ?? meta.leftLineSize,
    };
  });

  return {
    chapterIndex,
    engine: 'dom',
    pages,
    pageStarts: result.pageStarts,
    clipHeight: result.clipHeight,
    viewportHeight: result.viewportHeight,
    viewportWidth: Math.max(1, viewportWidth),
    contentExtent: result.contentExtent,
    padTop: result.padTop,
    padBottom: result.padBottom,
    segments: result.segments,
    dualPage: options?.dualPage,
    rightPageStarts: result.rightPageStarts,
    leftColumnExtent: result.leftColumnExtent,
    rightColumnExtent: result.rightColumnExtent,
    cacheKey,
  };
}

export function layoutChapterFromDom(params: DomChapterLayoutParams): ReaderChapterLayout {
  const defaultInsets = textViewerPagedContentInsets(params.config);
  const padTop = params.padTop ?? defaultInsets.top;
  const padBottom = params.padBottom ?? defaultInsets.bottom;
  const result = paginateReaderContent(params.contentRoot, params.viewportHeight, {
    padTop,
    padBottom,
    clipHeightPx: params.clipHeightPx,
    fontSize: params.config.fontSize,
    lineSpacing: params.config.spacing.line,
    dualPage: params.dualPage,
  });
  return chapterLayoutFromPaginateResult(
    params.chapterIndex,
    params.cacheKey,
    params.viewportWidth,
    result,
    {
      dualPage: params.dualPage,
      contentRoot: params.contentRoot,
      config: params.config,
    },
  );
}
