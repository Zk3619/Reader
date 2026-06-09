/**
 * Audio Viewer：章节 raw → 解析 URL → 代理/可播放地址
 */

import * as sourcesDb from '@/lib/database/sources';
import { MediaKind } from '@/lib/book-source/book-type';
import {
  buildAudioChapterCacheKey,
  getCachedAudioChapterPlayback,
  invalidateAudioChapterCacheKey,
  setCachedAudioChapterPlayback,
} from '@/lib/media/audio/audio-chapter-cache';
import { parseParsedAudioUrls } from '@/lib/media/audio/parsed-audio-url';
import { resolveAudioPlaybackList } from '@/lib/media/audio/resolve-audio-playback';
import {
  dispatchMediaTextFallback,
  ReaderMediaMessages,
} from '@/lib/media/text/reader-media-messages';
import { state, setState } from '@/stores/viewer/media/state';
import {
  loadChapterRaw,
  loadMediaChapterWithApply,
  openMediaBookWithKind,
  setMediaBookInitialState,
} from '@/stores/viewer/media/chapter';
import type { Book, BookChapter } from '@/types';

let playbackRevoke: (() => void) | null = null;

export function revokeAudioPlaybackUrls(): void {
  playbackRevoke?.();
  playbackRevoke = null;
}

export function setAudioBookInitialState(book: Book): void {
  setMediaBookInitialState(book, MediaKind.audio);
}

async function resolveAudioPlaybackFromRaw(
  raw: string,
  chapterIndex: number,
  chapter?: BookChapter,
): Promise<{ urls: string[]; revokeAll: () => void }> {
  const book = state.book;
  const source =
    book?.origin && book.origin !== 'local'
      ? await sourcesDb.getSource(book.origin)
      : undefined;
  const parsed = parseParsedAudioUrls(raw);
  return resolveAudioPlaybackList(parsed, {
    source: source ?? undefined,
    chapter,
    book: book ?? undefined,
    chapterIndex,
  });
}

export async function applyAudioFromRaw(
  raw: string,
  chapterIndex: number,
  chapter?: BookChapter,
  options?: { allowTextFallback?: boolean; forceRefresh?: boolean },
): Promise<void> {
  const allowTextFallback = options?.allowTextFallback === true;
  const forceRefresh = options?.forceRefresh === true;
  const parsed = parseParsedAudioUrls(raw);

  if (parsed.length === 0) {
    revokeAudioPlaybackUrls();
    if (import.meta.env.DEV && raw.trim()) {
      console.warn('[audio] 正文未解析出 URL，前 200 字:', raw.trim().slice(0, 200));
    }
    if (!raw.trim()) {
      setState({
        rawContent: raw,
        mediaUrls: [],
        primaryUrl: null,
        error: ReaderMediaMessages.emptyContent,
      });
      return;
    }
    setState({
      rawContent: raw,
      mediaUrls: [],
      primaryUrl: null,
      error: raw.trim().startsWith('@js:')
        ? '音频地址需由书源规则解析，当前未得到有效播放链接'
        : '未识别到可播放的音频地址',
    });
    if (allowTextFallback && state.book) {
      dispatchMediaTextFallback({
        bookUrl: state.book.bookUrl,
        chapterIndex,
        fromKind: MediaKind.audio,
      });
    }
    return;
  }

  const book = state.book;

  revokeAudioPlaybackUrls();

  if (book && chapter && !forceRefresh) {
    const key = buildAudioChapterCacheKey(book, chapter);
    const cached = getCachedAudioChapterPlayback(key);
    if (cached) {
      setState({
        rawContent: raw,
        mediaUrls: cached.urls,
        primaryUrl: cached.primaryUrl,
        error: null,
      });
      return;
    }
  }

  let effectiveRaw = raw;
  let { urls, revokeAll } = await resolveAudioPlaybackFromRaw(
    effectiveRaw,
    chapterIndex,
    chapter,
  );

  if (
    urls.length === 0 &&
    !forceRefresh &&
    book &&
    chapter &&
    state.catalog.length > 0
  ) {
    if (import.meta.env.DEV) {
      console.warn('[audio] 拉流失败，强制刷新本章正文后重试', {
        chapterIndex,
        title: chapter.title,
      });
    }
    invalidateAudioChapterCacheKey(buildAudioChapterCacheKey(book, chapter));
    effectiveRaw = await loadChapterRaw(
      book,
      chapter,
      state.catalog,
      chapterIndex,
      true,
    );
    ({ urls, revokeAll } = await resolveAudioPlaybackFromRaw(
      effectiveRaw,
      chapterIndex,
      chapter,
    ));
  }

  playbackRevoke = revokeAll;

  if (urls.length === 0) {
    setState({
      rawContent: effectiveRaw,
      mediaUrls: [],
      primaryUrl: null,
      error: '音频已解析但拉流失败（CDN 403 或网络错误），请刷新或重新登录书源',
    });
    return;
  }

  if (book && chapter && !urls.some((u) => u.startsWith('blob:'))) {
    setCachedAudioChapterPlayback(buildAudioChapterCacheKey(book, chapter), {
      urls,
      primaryUrl: urls[0] ?? '',
    });
  }

  if (import.meta.env.DEV) {
    console.log('[audio] 可播放地址', {
      count: urls.length,
      first: urls[0]?.slice(0, 48),
      blob: urls[0]?.startsWith('blob:'),
      proxy: urls[0]?.includes('__reader_http'),
    });
  }

  setState({
    rawContent: effectiveRaw,
    mediaUrls: urls,
    primaryUrl: urls[0] ?? null,
    error: null,
  });
}

export function invalidateCurrentAudioChapterCache(): void {
  const book = state.book;
  const chapter = state.catalog[state.chapterIndex];
  if (!book || !chapter) return;
  invalidateAudioChapterCacheKey(buildAudioChapterCacheKey(book, chapter));
}

export async function loadAudioChapter(
  index: number,
  options?: { forceRefresh?: boolean },
  saveProgressFn?: () => Promise<void>,
): Promise<void> {
  await loadMediaChapterWithApply(
    (raw, chapterIndex, chapter, opts) =>
      applyAudioFromRaw(raw, chapterIndex, chapter, {
        allowTextFallback: opts.allowTextFallback,
        forceRefresh: options?.forceRefresh,
      }),
    index,
    options,
    saveProgressFn,
  );
}

export async function openAudioBook(
  book: Book,
  options?: { initialCatalog?: BookChapter[] },
): Promise<void> {
  await openMediaBookWithKind(MediaKind.audio, book, options, (index) =>
    loadAudioChapter(index),
  );
}
