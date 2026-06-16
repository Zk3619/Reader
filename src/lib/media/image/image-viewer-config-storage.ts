/**
 * 漫画阅读器 UI 配置持久化
 */

import { getStorage, setStorage } from '@/lib/platform/storage';
import {
  defaultImageViewerUiConfig,
  IMAGE_VIEWER_ESTIMATED_PAGE_HEIGHT_MAX,
  IMAGE_VIEWER_ESTIMATED_PAGE_HEIGHT_MIN,
  IMAGE_VIEWER_MANGA_PRELOAD_MAX,
  IMAGE_VIEWER_MANGA_PRELOAD_MIN,
  IMAGE_VIEWER_PAGED_PRELOAD_MAX,
  IMAGE_VIEWER_PAGED_PRELOAD_MIN,
  type ImageViewerReadingMode,
  type ImageViewerUiConfig,
} from '@/lib/media/image/image-viewer-ui-config';
import { DEFAULT_CLICK_ACTIONS } from '@/lib/media/text/reader-click-actions';
import type { ReaderClickActions } from '@/lib/media/text/reader-click-actions';
import {
  clampClickRegion,
  DEFAULT_CLICK_REGION,
  type ReaderClickRegion,
} from '@/lib/media/text/reader-click-region';
import { isTextViewerPagedAnim, normalizeTextViewerPageAnim } from '@/lib/media/text/text-viewer-page-anim';
import { normalizeViewerChromeLayout } from '@/lib/viewer/viewer-chrome-layout';
import { settingsState } from '@/stores/settings';

const STORAGE_KEY = 'reader_image_viewer_ui_config_v1';
const LEGACY_CONTENT_SCALE_KEY = 'reader.imageViewer.contentScale';

let cached: ImageViewerUiConfig | null = null;

function clampContentScale(value: number): number {
  return Math.min(2, Math.max(0.5, value));
}

function clampMangaPreDownloadNum(value: number): number {
  return Math.min(
    IMAGE_VIEWER_MANGA_PRELOAD_MAX,
    Math.max(IMAGE_VIEWER_MANGA_PRELOAD_MIN, Math.round(value)),
  );
}

function clampMangaPagedPreDownloadNum(value: number): number {
  return Math.min(
    IMAGE_VIEWER_PAGED_PRELOAD_MAX,
    Math.max(IMAGE_VIEWER_PAGED_PRELOAD_MIN, Math.round(value)),
  );
}

function clampMangaEstimatedPageHeightPx(value: number): number {
  return Math.min(
    IMAGE_VIEWER_ESTIMATED_PAGE_HEIGHT_MAX,
    Math.max(IMAGE_VIEWER_ESTIMATED_PAGE_HEIGHT_MIN, Math.round(value)),
  );
}

function normalizeReadingMode(raw: unknown): ImageViewerReadingMode {
  if (raw === 'scroll' || raw === 'paged') return raw;
  if (typeof raw === 'string') {
    const anim = normalizeTextViewerPageAnim(raw);
    return isTextViewerPagedAnim(anim) ? 'paged' : 'scroll';
  }
  return defaultImageViewerUiConfig.readingMode;
}

function mergeClickActions(saved: Partial<ReaderClickActions> | undefined): ReaderClickActions {
  if (!saved || typeof saved !== 'object') return { ...DEFAULT_CLICK_ACTIONS };
  return { ...DEFAULT_CLICK_ACTIONS, ...saved };
}

function mergeClickRegion(saved: Partial<ReaderClickRegion> | undefined): ReaderClickRegion {
  if (!saved || typeof saved !== 'object') {
    return clampClickRegion({ ...DEFAULT_CLICK_REGION });
  }
  return clampClickRegion({
    xSplits: [
      saved.xSplits?.[0] ?? DEFAULT_CLICK_REGION.xSplits[0],
      saved.xSplits?.[1] ?? DEFAULT_CLICK_REGION.xSplits[1],
    ] as [number, number],
    ySplits: [
      saved.ySplits?.[0] ?? DEFAULT_CLICK_REGION.ySplits[0],
      saved.ySplits?.[1] ?? DEFAULT_CLICK_REGION.ySplits[1],
    ] as [number, number],
  });
}

function mergeConfig(raw: Partial<ImageViewerUiConfig & { pageAnim?: string }> | null): ImageViewerUiConfig {
  const base = { ...defaultImageViewerUiConfig };
  if (!raw || typeof raw !== 'object') return base;
  return {
    readingMode: normalizeReadingMode(raw.readingMode ?? raw.pageAnim),
    contentScale:
      typeof raw.contentScale === 'number'
        ? clampContentScale(raw.contentScale)
        : base.contentScale,
    mangaPreDownloadNum:
      typeof raw.mangaPreDownloadNum === 'number'
        ? clampMangaPreDownloadNum(raw.mangaPreDownloadNum)
        : base.mangaPreDownloadNum,
    mangaPagedPreDownloadNum:
      typeof raw.mangaPagedPreDownloadNum === 'number'
        ? clampMangaPagedPreDownloadNum(raw.mangaPagedPreDownloadNum)
        : base.mangaPagedPreDownloadNum,
    mangaDiskCacheWhileReading:
      typeof raw.mangaDiskCacheWhileReading === 'boolean'
        ? raw.mangaDiskCacheWhileReading
        : base.mangaDiskCacheWhileReading,
    mangaEstimatedPageHeightPx:
      typeof raw.mangaEstimatedPageHeightPx === 'number'
        ? clampMangaEstimatedPageHeightPx(raw.mangaEstimatedPageHeightPx)
        : base.mangaEstimatedPageHeightPx,
    viewerChromeLayout: normalizeViewerChromeLayout(
      raw.viewerChromeLayout ?? settingsState.app.viewerChromeLayout,
    ),
    clickActions: mergeClickActions(raw.clickActions),
    clickRegion: mergeClickRegion(raw.clickRegion),
  };
}

function loadLegacyContentScale(): number | null {
  try {
    const raw = localStorage.getItem(LEGACY_CONTENT_SCALE_KEY);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? clampContentScale(n) : null;
  } catch {
    return null;
  }
}

export async function loadImageViewerUiConfig(): Promise<ImageViewerUiConfig> {
  if (cached) return cached;
  try {
    const parsed = await getStorage<Partial<ImageViewerUiConfig & { pageAnim?: string }>>(STORAGE_KEY);
    if (parsed && typeof parsed === 'object') {
      cached = mergeConfig(parsed);
      return cached;
    }
  } catch (e) {
    console.warn('[image-viewer-config] load failed', e);
  }
  const legacyScale = loadLegacyContentScale();
  cached = mergeConfig(legacyScale != null ? { contentScale: legacyScale } : null);
  return cached;
}

export async function saveImageViewerUiConfig(config: ImageViewerUiConfig): Promise<void> {
  cached = config;
  try {
    await setStorage(STORAGE_KEY, config);
    localStorage.setItem(LEGACY_CONTENT_SCALE_KEY, String(config.contentScale));
  } catch (e) {
    console.warn('[image-viewer-config] save failed', e);
  }
}

export function invalidateImageViewerUiConfigCache(): void {
  cached = null;
}
