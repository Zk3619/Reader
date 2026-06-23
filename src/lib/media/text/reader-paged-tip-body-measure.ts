import type { TextViewerPageTipsConfig } from '@/lib/media/text/reader-ui-config';
import {
  readerPageTipBarVisible,
  readerPageTipChromeDomMatchesChromeBars,
  readerPageTipChromeMeasureReady,
} from '@/lib/media/text/reader-page-tip';
import { resolvePagedMeasureRoot } from '@/lib/media/text/text-viewer-paginate';

/** 页眉/页脚之间正文区内的屏外测量层（与展示同几何） */
export const READER_PAGED_MEASURE_HOST_CLASS = 'reader-paged-measure-host';

export const READER_PAGED_MEASURE_HOST_SELECTOR = `.${READER_PAGED_MEASURE_HOST_CLASS}`;

/** 分页 clipHeight 唯一来源：tip-body 实测（向下取整，避免多排半行） */
export function readStrictTipBodyClipHeightPx(
  tipBodyEl: HTMLElement | null | undefined,
): number {
  if (!tipBodyEl) return 0;
  const h = tipBodyEl.clientHeight;
  if (!Number.isFinite(h) || h <= 0) return 0;
  return Math.max(1, Math.floor(h));
}

export function queryPagedMeasureHostEl(
  tipBodyEl: HTMLElement | null | undefined,
): HTMLElement | null {
  if (!tipBodyEl) return null;
  return tipBodyEl.querySelector<HTMLElement>(READER_PAGED_MEASURE_HOST_SELECTOR);
}

export function queryPagedMeasureContentRoot(
  tipBodyEl: HTMLElement | null | undefined,
): HTMLElement | null {
  const host = queryPagedMeasureHostEl(tipBodyEl);
  if (!host) return null;
  return host.querySelector<HTMLElement>('[data-reader-content]');
}

export function queryPagedLiveMeasureContentRoot(
  tipBodyEl: HTMLElement | null | undefined,
): HTMLElement | null {
  if (!tipBodyEl) return null;
  return tipBodyEl.querySelector<HTMLElement>(
    '.reader-paged-live-inner [data-reader-content]',
  );
}

/**
 * 测量块须非零高度；Legado 行内段评占位未就绪时不阻塞整棵测量树（避免首屏永久卡住）。
 */
export function pagedMeasureRootHasUsableBlocks(
  contentRoot: HTMLElement | null | undefined,
): boolean {
  if (!contentRoot) return false;
  const body = resolvePagedMeasureRoot(contentRoot);
  const blocks = body.querySelectorAll<HTMLElement>('[data-reader-measure-block]');
  if (blocks.length === 0) return false;
  let hasUsable = false;
  for (const block of blocks) {
    const rect = block.getBoundingClientRect();
    if (rect.height <= 0.5) continue;
    hasUsable = true;
  }
  return hasUsable;
}

/** Legado 段评占位是否仍有未量高度（供 remeasure 轮询） */
export function pagedMeasureRootLegadoPlaceholdersPending(
  contentRoot: HTMLElement | null | undefined,
): boolean {
  if (!contentRoot) return false;
  const body = resolvePagedMeasureRoot(contentRoot);
  for (const block of body.querySelectorAll<HTMLElement>('[data-reader-legado-inline]')) {
    const rect = block.getBoundingClientRect();
    if (rect.height <= 0.5) continue;
    const placeholder = block.querySelector<HTMLElement>('[data-reader-inline-img]');
    if (!placeholder) return true;
    if (placeholder.getBoundingClientRect().height < 0.5) return true;
  }
  return false;
}

/** 页眉/页脚可见时须 DOM 稳定；无 chrome 时 frame 有高即可首屏引导测量 */
export function tipBodyReadyForPagedMeasure(
  frameEl: HTMLElement | null | undefined,
  tipBodyEl: HTMLElement | null | undefined,
  tips: TextViewerPageTipsConfig,
  chromeBarsVisible: boolean,
): boolean {
  const headerVisible = readerPageTipBarVisible('header', tips, chromeBarsVisible);
  const footerVisible = readerPageTipBarVisible('footer', tips, chromeBarsVisible);
  if (!headerVisible && !footerVisible) {
    return (
      readStrictTipBodyClipHeightPx(tipBodyEl) > 0 || (frameEl?.clientHeight ?? 0) > 0
    );
  }
  if (!readerPageTipChromeMeasureReady(frameEl, tips, chromeBarsVisible)) return false;
  return readerPageTipChromeDomMatchesChromeBars(frameEl, tips, chromeBarsVisible);
}
