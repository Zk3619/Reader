/**
 * 漫画阅读器 UI 配置
 */

import type { ViewerChromeLayout } from '@/components/viewer/viewer-chrome';
import { defaultViewerChromeLayout } from '@/components/viewer/viewer-chrome';

export type ImageViewerReadingMode = 'scroll' | 'paged';

export type ImageViewerUiConfig = {
  /** 滚动：纵向连续阅读；翻页：单张全屏按页切换 */
  readingMode: ImageViewerReadingMode;
  /** 正文最大宽度缩放（相对 48rem，仅滚动模式生效） */
  contentScale: number;
  /** 章内向前预加载图片页数，对齐 Legado mangaPreDownloadNum */
  mangaPreDownloadNum: number;
  /** 翻页模式章内预取上限（对齐 Legado Preloader，通常 3–5） */
  mangaPagedPreDownloadNum: number;
  /** 阅读时是否写入漫画磁盘缓存（关则仅内存+网络，更贴近 Legado 正常阅读） */
  mangaDiskCacheWhileReading: boolean;
  /** 懒加载 IO 边距估算用的单页高度（px） */
  mangaEstimatedPageHeightPx: number;
  /** 顶栏与底栏布局（仅漫画阅读器；未配置时沿用应用设置） */
  viewerChromeLayout: ViewerChromeLayout;
};

export const IMAGE_VIEWER_MANGA_PRELOAD_MIN = 1;
export const IMAGE_VIEWER_MANGA_PRELOAD_MAX = 20;
export const IMAGE_VIEWER_MANGA_PRELOAD_DEFAULT = 10;

export const IMAGE_VIEWER_PAGED_PRELOAD_MIN = 1;
export const IMAGE_VIEWER_PAGED_PRELOAD_MAX = 10;
export const IMAGE_VIEWER_PAGED_PRELOAD_DEFAULT = 3;

export const IMAGE_VIEWER_ESTIMATED_PAGE_HEIGHT_MIN = 400;
export const IMAGE_VIEWER_ESTIMATED_PAGE_HEIGHT_MAX = 2400;
export const IMAGE_VIEWER_ESTIMATED_PAGE_HEIGHT_DEFAULT = 1200;

export const defaultImageViewerUiConfig: ImageViewerUiConfig = {
  readingMode: 'scroll',
  contentScale: 1,
  mangaPreDownloadNum: IMAGE_VIEWER_MANGA_PRELOAD_DEFAULT,
  mangaPagedPreDownloadNum: IMAGE_VIEWER_PAGED_PRELOAD_DEFAULT,
  mangaDiskCacheWhileReading: true,
  mangaEstimatedPageHeightPx: IMAGE_VIEWER_ESTIMATED_PAGE_HEIGHT_DEFAULT,
  viewerChromeLayout: defaultViewerChromeLayout,
};

/** 无主动预取时 IO 下边距（约 1 屏） */
export const MANGA_LAZY_LOAD_ROOT_MARGIN_FULL_PX = 720;
/** 有主动预取时 IO 最小缓冲 */
export const MANGA_LAZY_LOAD_ROOT_MARGIN_WITH_PREFETCH_PX = 80;

/**
 * 懒加载 IO 边距：有章内预取时按「页数 × 预估页高 × 系数」与预取分工。
 */
export function mangaLazyLoadRootMarginPx(
  mangaPreDownloadNum: number,
  estimatedPageHeightPx = IMAGE_VIEWER_ESTIMATED_PAGE_HEIGHT_DEFAULT,
): number {
  if (mangaPreDownloadNum <= 0) {
    return MANGA_LAZY_LOAD_ROOT_MARGIN_FULL_PX;
  }
  const dynamic = Math.round(
    mangaPreDownloadNum * estimatedPageHeightPx * 0.35,
  );
  return Math.min(
    MANGA_LAZY_LOAD_ROOT_MARGIN_FULL_PX,
    Math.max(MANGA_LAZY_LOAD_ROOT_MARGIN_WITH_PREFETCH_PX, dynamic),
  );
}
