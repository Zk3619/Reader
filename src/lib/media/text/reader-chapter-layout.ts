/**
 * 章节分页入口：Pretext 计算 / DOM 测量（设置页切换）
 */

import {
  canUsePretextChapterLayout,
  needsDomChapterLayout,
} from '@/lib/media/text/reader-content-complexity';
import { layoutChapterFromDom } from '@/lib/media/text/dom-chapter-layout';
import { layoutChapterFromPretext } from '@/lib/media/text/pretext-chapter-layout';
import { layoutDocumentFromChapter } from '@/lib/media/text/pretext-layout-document';
import { getPretextIntrinsicCache } from '@/lib/media/image/pretext-image-intrinsic';
import {
  getCachedChapterLayout,
  setCachedChapterLayout,
} from '@/lib/media/text/reader-chapter-layout-cache';
import type { ReaderChapterLayout } from '@/lib/media/text/reader-chapter-layout-types';
import {
  buildChapterLayoutCacheKey,
  buildChapterImageRevision,
  buildContentRevision,
  buildReaderLayoutSignature,
  buildViewportSignature,
  resolveLayoutPageWindowMetrics,
} from '@/lib/media/text/reader-layout-signature';
import {
  textViewerPagedContentInsets,
  textViewerUsesPretextLayout,
} from '@/lib/media/text/reader-ui-config';
import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import { pageDisplayHeight } from '@/lib/media/text/text-viewer-paginate';

export type { ReaderChapterLayout, ReaderTextPage } from '@/lib/media/text/reader-chapter-layout-types';
export { pageCountFromChapterLayout } from '@/lib/media/text/reader-chapter-layout-types';
export { clearChapterLayoutCache } from '@/lib/media/text/reader-chapter-layout-cache';
export { layoutReaderChapterStream } from '@/lib/media/text/reader-chapter-layout-stream';
export type { StreamLayoutOptions, LayoutProgressListener } from '@/lib/media/text/reader-chapter-layout-stream';
export { buildReaderLayoutSignature, buildChapterImageRevision } from '@/lib/media/text/reader-layout-signature';
export {
  needsDomChapterLayout,
  canUseCanvasChapterLayout,
  canUsePretextChapterLayout,
} from '@/lib/media/text/reader-content-complexity';

/** 章节排版是否可用于按页展示（含 DOM / Pretext 引擎校验） */
export function isChapterLayoutCompleteForContent(
  layout: ReaderChapterLayout | null | undefined,
  chapterIndex: number,
  content: string,
  options?: { dualPage?: boolean; layoutEngine?: TextViewerUiConfig['layoutEngine'] },
): boolean {
  if (!layout || layout.chapterIndex !== chapterIndex || layout.segments.length === 0) {
    return false;
  }
  if (options?.dualPage) {
    if (!layout.dualPage) return false;
    if (!layout.rightPageStarts?.length) return false;
  }
  if (layout.isLayoutComplete === false) return false;
  const raw = content?.trim() ?? '';
  const usePretext = options?.layoutEngine === 'pretext';
  if (raw && needsDomChapterLayout(raw)) {
    if (usePretext && canUsePretextChapterLayout(raw)) {
      if (layout.engine !== 'pretext' && layout.engine !== 'dom') return false;
    } else if (layout.engine !== 'dom' && layout.engine !== 'canvas+dom') {
      return false;
    }
  }
  return true;
}

export interface LayoutReaderChapterInput {
  chapterIndex: number;
  content: string;
  chapterTitle?: string;
  viewportWidth: number;
  viewportHeight: number;
  config: TextViewerUiConfig;
  contentRoot?: HTMLElement | null;
  bypassCache?: boolean;
  dualPage?: boolean;
  streamLayout?: boolean;
  onLayoutProgress?: (layout: ReaderChapterLayout) => void;
  padTop?: number;
  padBottom?: number;
  clipHeightPx?: number;
  horizontalInsetOnSlot?: boolean;
}

export function chapterLayoutsEqual(
  a: ReaderChapterLayout | null | undefined,
  b: ReaderChapterLayout | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (a.cacheKey !== b.cacheKey) return false;
  if (a.engine !== b.engine) return false;
  if (a.pageStarts.length !== b.pageStarts.length) return false;
  if (Math.abs(a.clipHeight - b.clipHeight) > 1) return false;
  if (Boolean(a.dualPage) !== Boolean(b.dualPage)) return false;
  if (a.segments.length !== b.segments.length) return false;
  if ((a.rightPageStarts?.length ?? 0) !== (b.rightPageStarts?.length ?? 0)) return false;
  return a.pageStarts.every((v, i) => Math.abs(v - (b.pageStarts[i] ?? -1)) < 0.5);
}

/** 页眉/页脚占据垂直空间时须用 DOM 实测分页，避免 Pretext 窗高与 tip-body 偏差导致裁切/重复 */
export function layoutPrefersDomForTipChrome(input: LayoutReaderChapterInput): boolean {
  if (!input.contentRoot) return false;
  const pads = textViewerPagedContentInsets(input.config);
  const padTop = input.padTop ?? pads.top;
  const padBottom = input.padBottom ?? pads.bottom;
  return padTop > 0 || padBottom > 0;
}

function isIncompleteChapterLayout(
  layout: ReaderChapterLayout,
  content: string,
): boolean {
  return content.trim().length > 0 && layout.segments.length === 0;
}

function emptyChapterLayout(
  chapterIndex: number,
  cacheKey: string,
  viewportWidth: number,
  viewportHeight: number,
  pads?: { top: number; bottom: number },
  clipHeightPx?: number,
): ReaderChapterLayout {
  const defaults = textViewerPagedContentInsets();
  const padTop = pads?.top ?? defaults.top;
  const padBottom = pads?.bottom ?? defaults.bottom;
  const clipHeight =
    clipHeightPx != null && clipHeightPx > 0
      ? Math.max(1, Math.floor(clipHeightPx))
      : Math.max(1, Math.floor(viewportHeight - padTop - padBottom));
  return {
    chapterIndex,
    engine: 'dom',
    pages: [{
      index: 0,
      startY: 0,
      endY: clipHeight,
      displayHeight: clipHeight,
      chapterPosition: 0,
    }],
    pageStarts: [0],
    clipHeight,
    viewportHeight: Math.max(1, viewportHeight),
    viewportWidth: Math.max(1, viewportWidth),
    contentExtent: clipHeight,
    padTop,
    padBottom,
    segments: [],
    cacheKey,
  };
}

function layoutFromDomPath(
  input: LayoutReaderChapterInput,
  cacheKey: string,
): ReaderChapterLayout {
  if (!input.contentRoot) {
    return emptyChapterLayout(
      input.chapterIndex,
      cacheKey,
      input.viewportWidth,
      input.viewportHeight,
      input.padTop != null || input.padBottom != null
        ? {
          top: input.padTop ?? textViewerPagedContentInsets().top,
          bottom: input.padBottom ?? textViewerPagedContentInsets().bottom,
        }
        : undefined,
      input.clipHeightPx,
    );
  }
  return layoutChapterFromDom({
    chapterIndex: input.chapterIndex,
    contentRoot: input.contentRoot,
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
    config: input.config,
    cacheKey,
    dualPage: input.dualPage,
    padTop: input.padTop,
    padBottom: input.padBottom,
    clipHeightPx: input.clipHeightPx,
  });
}

function pretextImageRevisionForInput(input: LayoutReaderChapterInput): string {
  if (!textViewerUsesPretextLayout(input.config)) return '';
  if (!canUsePretextChapterLayout(input.content)) return '';
  const doc = layoutDocumentFromChapter({
    raw: input.content,
    config: input.config,
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
    chapterTitle: input.chapterTitle,
    horizontalInsetOnSlot: input.horizontalInsetOnSlot,
    intrinsicByUrl: getPretextIntrinsicCache() as Map<string, { width: number; height: number }>,
    disableFloat: input.dualPage,
  });
  return buildChapterImageRevision(doc.imageIds, getPretextIntrinsicCache());
}

/** Viewport / prefetch 构建与 layoutReaderChapter 一致的 imageRevision */
export function buildPretextChapterImageRevision(
  input: Pick<
    LayoutReaderChapterInput,
    | 'content'
    | 'config'
    | 'viewportWidth'
    | 'viewportHeight'
    | 'chapterTitle'
    | 'horizontalInsetOnSlot'
    | 'dualPage'
  >,
): string {
  return pretextImageRevisionForInput({
    chapterIndex: 0,
    content: input.content,
    config: input.config,
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
    chapterTitle: input.chapterTitle,
    horizontalInsetOnSlot: input.horizontalInsetOnSlot,
    dualPage: input.dualPage,
  });
}

function layoutFromPretextPath(
  input: LayoutReaderChapterInput,
  cacheKey: string,
): ReaderChapterLayout | null {
  if (
    input.viewportWidth <= 0 ||
    input.viewportHeight <= 0 ||
    !input.content?.trim()
  ) {
    return null;
  }
  const intrinsicByUrl = getPretextIntrinsicCache() as Map<string, { width: number; height: number }>;
  return layoutChapterFromPretext({
    chapterIndex: input.chapterIndex,
    raw: input.content,
    chapterTitle: input.chapterTitle,
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
    config: input.config,
    cacheKey,
    padTop: input.padTop,
    padBottom: input.padBottom,
    clipHeightPx: input.clipHeightPx,
    dualPage: input.dualPage,
    horizontalInsetOnSlot: input.horizontalInsetOnSlot,
    intrinsicByUrl,
  });
}

export function layoutReaderChapter(input: LayoutReaderChapterInput): ReaderChapterLayout {
  const layoutSignature = buildReaderLayoutSignature(input.config, {
    dualPage: input.dualPage,
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
  });
  const contentRevision = buildContentRevision(input.content);
  const defaultPads = textViewerPagedContentInsets(input.config);
  const pageWindow = resolveLayoutPageWindowMetrics(input.viewportHeight, {
    padTop: input.padTop,
    padBottom: input.padBottom,
    clipHeightPx: input.clipHeightPx,
    defaultPads,
  });
  const viewportSignature = buildViewportSignature(
    input.viewportWidth,
    input.viewportHeight,
    pageWindow,
  );
  const imageRevision = pretextImageRevisionForInput(input);
  const cacheKey = buildChapterLayoutCacheKey({
    chapterIndex: input.chapterIndex,
    contentRevision,
    layoutSignature,
    viewportSignature,
    chapterTitle: input.chapterTitle,
    imageRevision,
  });

  if (!input.bypassCache) {
    const cached = getCachedChapterLayout(cacheKey);
    if (cached && !isIncompleteChapterLayout(cached, input.content)) {
      return { ...cached, dualPage: input.dualPage };
    }
  }

  const usePretext = textViewerUsesPretextLayout(input.config);
  const preferDomForTipChrome = layoutPrefersDomForTipChrome(input);
  let layout: ReaderChapterLayout;

  if (preferDomForTipChrome) {
    layout = layoutFromDomPath(input, cacheKey);
  } else if (usePretext && canUsePretextChapterLayout(input.content)) {
    const pretextLayout = layoutFromPretextPath(input, cacheKey);
    if (pretextLayout) {
      layout = pretextLayout;
    } else if (input.contentRoot) {
      layout = layoutFromDomPath(input, cacheKey);
    } else {
      layout = emptyChapterLayout(
        input.chapterIndex,
        cacheKey,
        input.viewportWidth,
        input.viewportHeight,
        input.padTop != null || input.padBottom != null
          ? {
            top: input.padTop ?? textViewerPagedContentInsets().top,
            bottom: input.padBottom ?? textViewerPagedContentInsets().bottom,
          }
          : undefined,
        input.clipHeightPx,
      );
    }
  } else if (usePretext && !canUsePretextChapterLayout(input.content)) {
    layout = layoutFromDomPath(input, cacheKey);
  } else {
    layout = layoutFromDomPath(input, cacheKey);
  }

  const provisional =
    !input.contentRoot &&
    usePretext &&
    input.content.trim().length > 0 &&
    layout.segments.length === 0;
  const resolved = { ...layout, dualPage: input.dualPage };
  if (!provisional && !isIncompleteChapterLayout(resolved, input.content)) {
    setCachedChapterLayout(cacheKey, resolved);
  }
  return resolved;
}

/** 用校正后的 pageStarts 重建 pages（live DOM 复核后就地更新版式） */
export function chapterLayoutWithPageStarts(
  layout: ReaderChapterLayout,
  pageStarts: number[],
): ReaderChapterLayout {
  const same =
    pageStarts.length === layout.pageStarts.length &&
    pageStarts.every((v, i) => Math.abs(v - (layout.pageStarts[i] ?? -1)) < 0.5);
  if (same) return layout;

  const pages = pageStarts.map((startY, index) => {
    const prev = layout.pages[index];
    const endY = pageStarts[index + 1] ?? layout.contentExtent;
    return {
      index,
      startY,
      endY,
      displayHeight: pageDisplayHeight(
        index,
        pageStarts,
        layout.clipHeight,
        layout.contentExtent,
        layout.segments,
      ),
      chapterPosition: prev?.chapterPosition ?? 0,
      text: prev?.text,
      leftLineSize: prev?.leftLineSize,
    };
  });

  return { ...layout, pageStarts, pages };
}

/** 由已缓存/计算好的章节版式取当前页显示高度 */
export function displayHeightForLayoutPage(
  layout: ReaderChapterLayout,
  pageIndex: number,
): number {
  const page = layout.pages[pageIndex];
  if (page) return page.displayHeight;
  return pageDisplayHeight(
    pageIndex,
    layout.pageStarts,
    layout.clipHeight,
    layout.contentExtent,
    layout.segments,
  );
}
