/**
 * 章节分页入口：缓存 + 纯文本 Canvas / 复杂 HTML DOM 混合排版
 */

import { canUseCanvasChapterLayout } from '@/lib/media/text/reader-content-complexity';
import { layoutPlainTextChapterCanvas } from '@/lib/media/text/canvas-text-chapter-layout';
import { layoutChapterFromDom } from '@/lib/media/text/dom-chapter-layout';
import {
  getCachedChapterLayout,
  setCachedChapterLayout,
} from '@/lib/media/text/reader-chapter-layout-cache';
import type { ReaderChapterLayout } from '@/lib/media/text/reader-chapter-layout-types';
import {
  buildChapterLayoutCacheKey,
  buildContentRevision,
  buildReaderLayoutSignature,
  buildViewportSignature,
} from '@/lib/media/text/reader-layout-signature';
import { textViewerPagedContentInsets } from '@/lib/media/text/reader-ui-config';
import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import { pageDisplayHeight } from '@/lib/media/text/text-viewer-paginate';

export type { ReaderChapterLayout, ReaderTextPage } from '@/lib/media/text/reader-chapter-layout-types';
export { pageCountFromChapterLayout } from '@/lib/media/text/reader-chapter-layout-types';
export { clearChapterLayoutCache } from '@/lib/media/text/reader-chapter-layout-cache';
export { layoutReaderChapterStream } from '@/lib/media/text/reader-chapter-layout-stream';
export type { StreamLayoutOptions, LayoutProgressListener } from '@/lib/media/text/reader-chapter-layout-stream';
export { buildReaderLayoutSignature } from '@/lib/media/text/reader-layout-signature';
export {
  needsDomChapterLayout,
  canUseCanvasChapterLayout,
} from '@/lib/media/text/reader-content-complexity';
import { needsDomChapterLayout } from '@/lib/media/text/reader-content-complexity';

/** 章节排版是否可用于按页展示（含 DOM 引擎校验） */
export function isChapterLayoutCompleteForContent(
  layout: ReaderChapterLayout | null | undefined,
  chapterIndex: number,
  content: string,
  options?: { dualPage?: boolean },
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
  if (raw && needsDomChapterLayout(raw)) {
    if (layout.engine !== 'dom' && layout.engine !== 'canvas+dom') return false;
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
  /**  idle 时用于 DOM 测量的根节点（含 [data-reader-content]） */
  contentRoot?: HTMLElement | null;
  /** 跳过缓存（强制重测） */
  bypassCache?: boolean;
  /** Canvas 分页后用 DOM 精修（仅纯文本且存在测量根时） */
  refineWithDom?: boolean;
  /** 双栏物理页 */
  dualPage?: boolean;
  /** 流式排版：先出前几页 */
  streamLayout?: boolean;
  onLayoutProgress?: (layout: ReaderChapterLayout) => void;
  /** content-slot 实测 inset（与 page-window 渲染一致） */
  padTop?: number;
  padBottom?: number;
  /** page-window 实测高度，直传分页避免往返误差 */
  clipHeightPx?: number;
  /** 按页：viewportWidth 为 content-slot 内宽（左右 inset 已在 slot 上） */
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

/** Canvas 与 DOM 页界偏差超过阈值时采用 DOM */
function shouldPreferDomOverCanvas(
  canvasStarts: number[],
  domStarts: number[],
): boolean {
  if (canvasStarts.length !== domStarts.length) return true;
  for (let i = 0; i < canvasStarts.length; i++) {
    if (Math.abs((canvasStarts[i] ?? 0) - (domStarts[i] ?? 0)) > 12) return true;
  }
  return false;
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
      ? Math.max(1, Math.round(clipHeightPx))
      : Math.max(1, viewportHeight - padTop - padBottom);
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

export function layoutReaderChapter(input: LayoutReaderChapterInput): ReaderChapterLayout {
  const layoutSignature = buildReaderLayoutSignature(input.config, {
    dualPage: input.dualPage,
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
  });
  const contentRevision = buildContentRevision(input.content);
  const viewportSignature = buildViewportSignature(
    input.viewportWidth,
    input.viewportHeight,
  );
  const cacheKey = buildChapterLayoutCacheKey({
    chapterIndex: input.chapterIndex,
    contentRevision,
    layoutSignature,
    viewportSignature,
    chapterTitle: input.chapterTitle,
  });

  if (!input.bypassCache) {
    const cached = getCachedChapterLayout(cacheKey);
    if (cached && !isIncompleteChapterLayout(cached, input.content)) {
      return { ...cached, dualPage: input.dualPage };
    }
  }

  let layout: ReaderChapterLayout;

  const useCanvas =
    !input.dualPage &&
    canUseCanvasChapterLayout(input.content) &&
    input.viewportWidth > 0 &&
    input.viewportHeight > 0;

  const layoutPads = {
    top: input.padTop,
    bottom: input.padBottom,
  };
  const domLayoutParams = {
    padTop: input.padTop,
    padBottom: input.padBottom,
    clipHeightPx: input.clipHeightPx,
  };

  if (useCanvas) {
    const canvasLayout = layoutPlainTextChapterCanvas({
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
      horizontalInsetOnSlot: input.horizontalInsetOnSlot,
    });

    if (input.contentRoot && input.refineWithDom !== false) {
      const domLayout = layoutChapterFromDom({
        chapterIndex: input.chapterIndex,
        contentRoot: input.contentRoot,
        viewportWidth: input.viewportWidth,
        viewportHeight: input.viewportHeight,
        config: input.config,
        cacheKey: `${cacheKey}:dom`,
        dualPage: input.dualPage,
        ...domLayoutParams,
      });
      if (shouldPreferDomOverCanvas(canvasLayout.pageStarts, domLayout.pageStarts)) {
        layout = { ...domLayout, engine: 'canvas+dom', cacheKey };
      } else {
        layout = canvasLayout;
      }
    } else {
      layout = canvasLayout;
    }
  } else if (input.contentRoot) {
    layout = layoutChapterFromDom({
      chapterIndex: input.chapterIndex,
      contentRoot: input.contentRoot,
      viewportWidth: input.viewportWidth,
      viewportHeight: input.viewportHeight,
      config: input.config,
      cacheKey,
      dualPage: input.dualPage,
      ...domLayoutParams,
    });
  } else {
    layout = emptyChapterLayout(
      input.chapterIndex,
      cacheKey,
      input.viewportWidth,
      input.viewportHeight,
      layoutPads.top != null || layoutPads.bottom != null
        ? {
          top: layoutPads.top ?? textViewerPagedContentInsets().top,
          bottom: layoutPads.bottom ?? textViewerPagedContentInsets().bottom,
        }
        : undefined,
      input.clipHeightPx,
    );
  }

  const provisional =
    !input.contentRoot &&
    input.content.trim().length > 0 &&
    layout.segments.length === 0;
  const resolved = { ...layout, dualPage: input.dualPage };
  if (!provisional && !isIncompleteChapterLayout(resolved, input.content)) {
    setCachedChapterLayout(cacheKey, resolved);
  }
  return resolved;
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
