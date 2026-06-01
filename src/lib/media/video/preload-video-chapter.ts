/**
 * 预加载下一集视频（对齐 Legado VideoPlay.preloadNextEpisode）
 */

import * as sourcesDb from '@/lib/database/sources';
import { isLocalBook } from '@/lib/local-book';
import { findPlayableChapterIndex } from '@/lib/media/audio/play-mode';
import { loadChapterRaw } from '@/stores/viewer/media/chapter';
import { resolveVideoFromRawContent } from '@/lib/media/video/resolve-video-from-raw';
import {
  buildVideoChapterCacheKey,
  endVideoPreload,
  setCachedVideoChapterPlayback,
  tryBeginVideoPreload,
} from '@/lib/media/video/video-chapter-cache';
import type { Book, BookChapter } from '@/types';

export function preloadNextVideoChapter(
  book: Book,
  catalog: BookChapter[],
  currentIndex: number,
): void {
  const nextIndex = findPlayableChapterIndex(catalog, currentIndex + 1, 1);
  if (nextIndex == null) return;

  const chapter = catalog[nextIndex];
  if (!chapter) return;

  const key = buildVideoChapterCacheKey(book, chapter);
  if (!tryBeginVideoPreload(key)) return;

  void (async () => {
    try {
      let source = undefined;
      if (!isLocalBook(book) && book.origin) {
        source = (await sourcesDb.getSource(book.origin)) ?? undefined;
      }
      const raw = await loadChapterRaw(book, chapter, catalog, nextIndex, false);
      const resolved = await resolveVideoFromRawContent(raw, {
        source,
        chapter,
        book,
      });
      if (!resolved.ok) return;
      if (resolved.urls.some((u) => u.startsWith('blob:'))) return;
      setCachedVideoChapterPlayback(key, {
        urls: resolved.urls,
        primaryUrl: resolved.primaryUrl,
      });
      resolved.revoke();
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn('[video] 预加载下一集失败', chapter.title, e);
      }
    } finally {
      endVideoPreload(key);
    }
  })();
}
