/**
 * 漫画阅读器 UI 配置
 */

import type { ViewerChromeLayout } from '@/components/media/viewer/viewer-chrome';
import { defaultViewerChromeLayout } from '@/components/media/viewer/viewer-chrome';
import { DEFAULT_CLICK_ACTIONS } from '@/lib/media/text/reader-click-actions';
import type { ReaderClickActions } from '@/lib/media/text/reader-click-actions';
import {
  clampClickRegion,
  DEFAULT_CLICK_REGION,
  type ReaderClickRegion,
} from '@/lib/media/text/reader-click-region';

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
  /** 翻页模式九宫格点击动作 */
  clickActions: ReaderClickActions;
  /** 翻页模式九宫格区域分界 */
  clickRegion: ReaderClickRegion;
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
  clickActions: { ...DEFAULT_CLICK_ACTIONS },
  clickRegion: clampClickRegion({ ...DEFAULT_CLICK_REGION }),
};

/** 无主动预取时 IO 下边距（约 1 屏） */
export const MANGA_LAZY_LOAD_ROOT_MARGIN_FULL_PX = 720;
/** 有主动预取时 IO 最小缓冲 */
export const MANGA_LAZY_LOAD_ROOT_MARGIN_WITH_PREFETCH_PX = 80;

/**
 * 懒加载 IO 边距：有章内预取时仅保留窄缓冲（预取负责向前拉图），无预取时用整屏边距。
 */
export function mangaLazyLoadRootMarginPx(
  mangaPreDownloadNum: number,
  estimatedPageHeightPx = IMAGE_VIEWER_ESTIMATED_PAGE_HEIGHT_DEFAULT,
): number {
  if (mangaPreDownloadNum <= 0) {
    return MANGA_LAZY_LOAD_ROOT_MARGIN_FULL_PX;
  }
  const narrow = Math.round(estimatedPageHeightPx * 0.15);
  return Math.min(
    320,
    Math.max(MANGA_LAZY_LOAD_ROOT_MARGIN_WITH_PREFETCH_PX, narrow),
  );
}
