/**
 * Video Viewer：章节 raw → 解析 URL → 代理/可播放地址
 * 对齐 Legado VideoPlay.startPlay
 */

import * as sourcesDb from '@/lib/database/sources';
import { MediaKind } from '@/lib/book-source/book-type';
import { preloadNextVideoChapter } from '@/lib/media/video/preload-video-chapter';
import { resolveVideoFromRawContent } from '@/lib/media/video/resolve-video-from-raw';
import {
  buildVideoChapterCacheKey,
  getCachedVideoChapterPlayback,
  invalidateVideoChapterCacheKey,
  setCachedVideoChapterPlayback,
} from '@/lib/media/video/video-chapter-cache';
import {
  dispatchMediaTextFallback,
  ReaderMediaMessages,
} from '@/lib/media/text/reader-media-messages';
import { state, setState } from '@/stores/viewer/media/state';
import {
  loadMediaChapterWithApply,
  openMediaBookWithKind,
  setMediaBookInitialState,
} from '@/stores/viewer/media/chapter';
import type { Book, BookChapter } from '@/types';

let playbackRevoke: (() => void) | null = null;

export function revokeVideoPlaybackUrls(): void {
  playbackRevoke?.();
  playbackRevoke = null;
}

export function setVideoBookInitialState(book: Book): void {
  setMediaBookInitialState(book, MediaKind.video);
}

export async function applyVideoFromRaw(
  raw: string,
  chapterIndex: number,
  chapter?: BookChapter,
  options?: { allowTextFallback?: boolean; forceRefresh?: boolean },
): Promise<void> {
  const allowTextFallback = options?.allowTextFallback === true;
  const forceRefresh = options?.forceRefresh === true;

  revokeVideoPlaybackUrls();

  const book = state.book;
  if (book && chapter && !forceRefresh) {
    const key = buildVideoChapterCacheKey(book, chapter);
    const cached = getCachedVideoChapterPlayback(key);
    if (cached) {
      setState({
        rawContent: raw,
        mediaUrls: cached.urls,
        primaryUrl: cached.primaryUrl,
        error: null,
      });
      preloadNextVideoChapter(book, state.catalog, chapterIndex);
      return;
    }
  }

  const source =
    book?.origin && book.origin !== 'local'
      ? await sourcesDb.getSource(book.origin)
      : undefined;

  const resolved = await resolveVideoFromRawContent(raw, {
    source: source ?? undefined,
    chapter,
    book: book ?? undefined,
  });

  if (!resolved.ok) {
    if (resolved.empty) {
      setState({
        rawContent: raw,
        mediaUrls: [],
        primaryUrl: null,
        error: ReaderMediaMessages.emptyContent,
      });
      return;
    }
    if (import.meta.env.DEV && raw.trim()) {
      console.warn('[video] 正文未解析出 URL，前 200 字:', raw.trim().slice(0, 200));
    }
    setState({
      rawContent: raw,
      mediaUrls: [],
      primaryUrl: null,
      error: resolved.message,
    });
    if (allowTextFallback && state.book) {
      dispatchMediaTextFallback({
        bookUrl: state.book.bookUrl,
        chapterIndex,
        fromKind: MediaKind.video,
      });
    }
    return;
  }

  playbackRevoke = resolved.revoke;

  if (book && chapter && !resolved.urls.some((u) => u.startsWith('blob:'))) {
    const key = buildVideoChapterCacheKey(book, chapter);
    setCachedVideoChapterPlayback(key, {
      urls: resolved.urls,
      primaryUrl: resolved.primaryUrl,
    });
  }

  if (import.meta.env.DEV) {
    console.log('[video] 可播放地址', {
      count: resolved.urls.length,
      first: resolved.primaryUrl.slice(0, 48),
      blob: resolved.primaryUrl.startsWith('blob:'),
      proxy: resolved.primaryUrl.includes('__reader_http'),
    });
  }

  setState({
    rawContent: raw,
    mediaUrls: resolved.urls,
    primaryUrl: resolved.primaryUrl,
    error: null,
  });

  if (book) {
    preloadNextVideoChapter(book, state.catalog, chapterIndex);
  }
}

export function invalidateCurrentVideoChapterCache(): void {
  const book = state.book;
  const chapter = state.catalog[state.chapterIndex];
  if (!book || !chapter) return;
  invalidateVideoChapterCacheKey(buildVideoChapterCacheKey(book, chapter));
}

export async function loadVideoChapter(
  index: number,
  options?: { forceRefresh?: boolean },
  saveProgressFn?: () => Promise<void>,
): Promise<void> {
  await loadMediaChapterWithApply(
    (raw, chapterIndex, chapter, opts) =>
      applyVideoFromRaw(raw, chapterIndex, chapter, {
        allowTextFallback: opts.allowTextFallback,
        forceRefresh: options?.forceRefresh,
      }),
    index,
    options,
    saveProgressFn,
  );
}

export async function openVideoBook(
  book: Book,
  options?: { initialCatalog?: BookChapter[] },
): Promise<void> {
  await openMediaBookWithKind(MediaKind.video, book, options, (index) =>
    loadVideoChapter(index),
  );
}
