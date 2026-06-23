/**
 * dev/vitest：Pretext 与 DOM 页界对照（不接入运行时路由）
 *
 * 覆盖：纯文、figure 占位、decode 后尺寸、右浮动旁绕排（容差 4px）
 */

import { layoutChapterFromPretext } from '@/lib/media/text/pretext-chapter-layout';
import { layoutChapterFromDom } from '@/lib/media/text/dom-chapter-layout';
import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';

export interface PretextDomDiffResult {
  pageCountMatch: boolean;
  pretextPageCount: number;
  domPageCount: number;
  maxStartDeltaPx: number;
  extentDeltaPx: number;
  pageStartDeltas: number[];
}

export function diffPretextDomPageStarts(
  pretextStarts: number[],
  domStarts: number[],
): Pick<PretextDomDiffResult, 'pageCountMatch' | 'maxStartDeltaPx' | 'pageStartDeltas'> {
  const pageCountMatch = pretextStarts.length === domStarts.length;
  const len = Math.min(pretextStarts.length, domStarts.length);
  const pageStartDeltas: number[] = [];
  let maxStartDeltaPx = 0;
  for (let i = 0; i < len; i += 1) {
    const d = Math.abs((pretextStarts[i] ?? 0) - (domStarts[i] ?? 0));
    pageStartDeltas.push(d);
    maxStartDeltaPx = Math.max(maxStartDeltaPx, d);
  }
  if (!pageCountMatch) maxStartDeltaPx = Number.POSITIVE_INFINITY;
  return { pageCountMatch, maxStartDeltaPx, pageStartDeltas };
}

export function comparePretextDomChapterLayout(options: {
  chapterIndex: number;
  content: string;
  chapterTitle?: string;
  contentRoot: HTMLElement;
  viewportWidth: number;
  viewportHeight: number;
  config: TextViewerUiConfig;
  cacheKey: string;
  dualPage?: boolean;
  padTop?: number;
  padBottom?: number;
  clipHeightPx?: number;
  intrinsicByUrl?: Map<string, { width: number; height: number }>;
}): PretextDomDiffResult | null {
  const pretext = layoutChapterFromPretext({
    chapterIndex: options.chapterIndex,
    raw: options.content,
    chapterTitle: options.chapterTitle,
    viewportWidth: options.viewportWidth,
    viewportHeight: options.viewportHeight,
    config: options.config,
    cacheKey: `${options.cacheKey}:pretext`,
    dualPage: options.dualPage,
    padTop: options.padTop,
    padBottom: options.padBottom,
    clipHeightPx: options.clipHeightPx,
    horizontalInsetOnSlot: true,
    intrinsicByUrl: options.intrinsicByUrl,
  });

  if (!pretext) return null;

  const dom = layoutChapterFromDom({
    chapterIndex: options.chapterIndex,
    contentRoot: options.contentRoot,
    viewportWidth: options.viewportWidth,
    viewportHeight: options.viewportHeight,
    config: options.config,
    cacheKey: `${options.cacheKey}:dom`,
    dualPage: options.dualPage,
    padTop: options.padTop,
    padBottom: options.padBottom,
    clipHeightPx: options.clipHeightPx,
  });

  const startDiff = diffPretextDomPageStarts(pretext.pageStarts, dom.pageStarts);
  return {
    ...startDiff,
    pretextPageCount: pretext.pageStarts.length,
    domPageCount: dom.pageStarts.length,
    extentDeltaPx: Math.abs(pretext.contentExtent - dom.contentExtent),
  };
}
