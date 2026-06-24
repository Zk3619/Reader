/**
 * 相邻章预排版（后台 Canvas/缓存，切章时命中 layout 缓存）
 */

import { getPooledChapterContent } from '@/lib/chapter-cache/chapter-content-pool';
import { readCachedChapterRaw } from '@/lib/chapter-cache/storage';
import {
  buildChapterLayoutCacheKey,
  buildContentRevision,
  buildReaderLayoutSignature,
  buildViewportSignature,
  resolveLayoutPageWindowMetrics,
} from '@/lib/media/text/reader-layout-signature';
import {
  buildPretextChapterImageRevision,
  layoutReaderChapter,
} from '@/lib/media/text/reader-chapter-layout';
import { getCachedChapterLayout } from '@/lib/media/text/reader-chapter-layout-cache';
import { setPagedLayoutPrefetchStatus } from '@/lib/media/text/reader-paged-layout-debug';
import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import { textViewerPagedContentInsets } from '@/lib/media/text/reader-ui-config';
import type { Book, BookChapter } from '@/types';

export interface AdjacentLayoutPrefetchParams {
  book: Book | null;
  catalog: BookChapter[];
  chapterIndex: number;
  viewportWidth: number;
  viewportHeight: number;
  config: TextViewerUiConfig;
  dualPage?: boolean;
}

let prefetchToken = 0;

async function resolveChapterRaw(
  book: Book,
  index: number,
): Promise<string | null> {
  const pooled = getPooledChapterContent(book.bookUrl, index);
  if (pooled?.trim()) return pooled;
  return readCachedChapterRaw(book.bookUrl, index);
}

function prefetchOne(
  params: AdjacentLayoutPrefetchParams,
  index: number,
  title: string | undefined,
  content: string,
): void {
  const { config, viewportWidth, viewportHeight, dualPage = false } = params;
  const inset = textViewerPagedContentInsets(config);
  const pageWindow = resolveLayoutPageWindowMetrics(viewportHeight, {
    padTop: inset.top,
    padBottom: inset.bottom,
    defaultPads: inset,
  });
  const cacheKey = buildChapterLayoutCacheKey({
    chapterIndex: index,
    contentRevision: buildContentRevision(content),
    layoutSignature: buildReaderLayoutSignature(config, {
      dualPage,
      viewportWidth,
      viewportHeight,
    }),
    viewportSignature: buildViewportSignature(viewportWidth, viewportHeight, pageWindow),
    chapterTitle: title,
    imageRevision: buildPretextChapterImageRevision({
      content,
      config,
      viewportWidth,
      viewportHeight,
      chapterTitle: title,
      dualPage,
      horizontalInsetOnSlot: true,
    }),
  });
  if (getCachedChapterLayout(cacheKey)) return;

  layoutReaderChapter({
    chapterIndex: index,
    content,
    chapterTitle: title,
    viewportWidth,
    viewportHeight,
    config,
    contentRoot: null,
    refineWithDom: false,
    dualPage,
    padTop: pageWindow.padTop,
    padBottom: pageWindow.padBottom,
    clipHeightPx: pageWindow.clipHeight,
    horizontalInsetOnSlot: true,
  });
}

/** 同步预热：相邻章正文已在内存池时立刻写入 layout 缓存（切章零等待） */
export function prefetchAdjacentChapterLayoutsFromPool(
  params: AdjacentLayoutPrefetchParams,
): number {
  const { book, catalog, chapterIndex } = params;
  if (!book || catalog.length === 0) return 0;

  let warmed = 0;
  for (const index of [chapterIndex - 1, chapterIndex + 1]) {
    if (index < 0 || index >= catalog.length) continue;
    const pooled = getPooledChapterContent(book.bookUrl, index);
    if (!pooled?.trim()) continue;
    prefetchOne(params, index, catalog[index]?.title, pooled);
    warmed += 1;
  }
  return warmed;
}

export function scheduleAdjacentChapterLayoutPrefetch(
  params: AdjacentLayoutPrefetchParams,
): void {
  const { book, catalog, chapterIndex, viewportWidth, viewportHeight } = params;
  if (!book || viewportWidth <= 0 || viewportHeight <= 0 || catalog.length === 0) {
    return;
  }

  const token = ++prefetchToken;
  const neighbors = [chapterIndex - 1, chapterIndex + 1].filter(
    (i) => i >= 0 && i < catalog.length,
  );

  const syncWarmed = prefetchAdjacentChapterLayoutsFromPool(params);

  const run = () => {
    void (async () => {
      let warmed = 0;
      for (const index of neighbors) {
        if (token !== prefetchToken) return;
        const ch = catalog[index];
        if (!ch) continue;
        const raw = await resolveChapterRaw(book, index);
        if (!raw?.trim() || token !== prefetchToken) continue;
        prefetchOne(params, index, ch.title, raw);
        warmed += 1;
      }
      if (token === prefetchToken) {
        setPagedLayoutPrefetchStatus(
          syncWarmed + warmed > 0
            ? `排版预热 ${syncWarmed + warmed} 章`
            : '',
        );
      }
    })();
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 2000 });
  } else {
    setTimeout(run, 80);
  }
}

export function cancelAdjacentChapterLayoutPrefetch(): void {
  prefetchToken += 1;
  setPagedLayoutPrefetchStatus('');
}
