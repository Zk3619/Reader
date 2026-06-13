import { describe, expect, it } from 'vitest';

import {
  defaultImageViewerUiConfig,
  mangaLazyLoadRootMarginPx,
  MANGA_LAZY_LOAD_ROOT_MARGIN_FULL_PX,
  MANGA_LAZY_LOAD_ROOT_MARGIN_WITH_PREFETCH_PX,
} from '@/lib/media/image/image-viewer-ui-config';

describe('image-viewer-ui-config manga scroll', () => {
  it('shrinks IO margin when prefetch is active', () => {
    expect(mangaLazyLoadRootMarginPx(0)).toBe(MANGA_LAZY_LOAD_ROOT_MARGIN_FULL_PX);
    expect(mangaLazyLoadRootMarginPx(1, 200)).toBe(
      MANGA_LAZY_LOAD_ROOT_MARGIN_WITH_PREFETCH_PX,
    );
    expect(mangaLazyLoadRootMarginPx(10, 1200)).toBeLessThan(400);
    expect(mangaLazyLoadRootMarginPx(10, 1200)).toBeGreaterThanOrEqual(
      MANGA_LAZY_LOAD_ROOT_MARGIN_WITH_PREFETCH_PX,
    );
  });

  it('includes viewer chrome layout in defaults', () => {
    expect(defaultImageViewerUiConfig.viewerChromeLayout).toBe('stacked');
  });

  it('includes paged preload and disk cache defaults', () => {
    expect(defaultImageViewerUiConfig.mangaPagedPreDownloadNum).toBe(3);
    expect(defaultImageViewerUiConfig.mangaDiskCacheWhileReading).toBe(true);
    expect(defaultImageViewerUiConfig.mangaEstimatedPageHeightPx).toBe(1200);
  });

  it('narrows IO margin with prefetch using estimated page height', () => {
    const low = mangaLazyLoadRootMarginPx(2, 400);
    const high = mangaLazyLoadRootMarginPx(2, 2000);
    expect(low).toBe(80);
    expect(high).toBe(300);
    expect(high).toBeGreaterThan(low);
  });
});


