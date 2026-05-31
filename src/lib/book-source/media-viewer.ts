/**
 * 媒体阅读器页面路由（�?MediaKind / BookSourceType 一一对应�?
 */

import type { MediaKind } from '@/lib/book-source/book-type';

export type MediaViewerPage =
  | 'text-viewer'
  | 'image-viewer'
  | 'audio-viewer'
  | 'video-viewer'
  | 'file-viewer';

const MEDIA_KIND_TO_PAGE: Record<MediaKind, MediaViewerPage> = {
  text: 'text-viewer',
  image: 'image-viewer',
  audio: 'audio-viewer',
  video: 'video-viewer',
  file: 'file-viewer',
};

/** 非文本类 Media Viewer 页（使用 viewerStore�?*/
export const NON_TEXT_MEDIA_VIEWER_PAGES: MediaViewerPage[] = [
  'image-viewer',
  'audio-viewer',
  'video-viewer',
  'file-viewer',
];

export function mediaViewerPageForKind(kind: MediaKind): MediaViewerPage {
  return MEDIA_KIND_TO_PAGE[kind];
}

/** 持久化页面名兼容旧版 */
const LEGACY_VIEWER_PAGE: Record<string, MediaViewerPage> = {
  reader: 'text-viewer',
  'book-reader': 'text-viewer',
  'pic-reader': 'image-viewer',
  'audio-player': 'audio-viewer',
  'video-player': 'video-viewer',
};

const ALL_VIEWER_PAGES = new Set<string>(Object.values(MEDIA_KIND_TO_PAGE));

export function normalizeMediaViewerPage(page: string): MediaViewerPage | null {
  if (ALL_VIEWER_PAGES.has(page)) {
    return page as MediaViewerPage;
  }
  return LEGACY_VIEWER_PAGE[page] ?? null;
}
