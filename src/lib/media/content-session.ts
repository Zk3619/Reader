/**
 * 统一内容消费会话抽象（听书 / 音乐等平台化薄层）
 */

import type { MediaKind } from '@/lib/book-source/book-type';
import type { Book, BookChapter } from '@/types';
import type { AudioTrack } from '@/lib/media/audio/track-types';

export const AUDIO_HUB_SOURCE = 'audio-hub';
export const AUDIO_HUB_BOOK_URL = 'audio-hub://music';

export type ContentSessionSource =
  | 'bookshelf'
  | typeof AUDIO_HUB_SOURCE
  | 'local'
  | string;

export type ContentSessionItem =
  | { type: 'chapter'; chapter: BookChapter; index: number }
  | { type: 'track'; track: AudioTrack; index: number };

export interface ContentSessionProgress {
  index: number;
  positionSec: number;
}

export interface ContentSession {
  id: string;
  kind: MediaKind;
  source: ContentSessionSource;
  title: string;
  subtitle?: string;
  coverUrl?: string;
  items: ContentSessionItem[];
  progress: ContentSessionProgress;
  /** 关联书籍（听书模式）；音乐模式为 null */
  bookUrl: string | null;
}

export function createAudiobookSession(
  book: Book,
  catalog: BookChapter[],
  chapterIndex: number,
  chapterPos = 0,
): ContentSession {
  return {
    id: book.bookUrl,
    kind: 'audio',
    source: 'bookshelf',
    title: book.name,
    subtitle: book.author,
    coverUrl: book.customCoverUrl || book.coverUrl || undefined,
    items: catalog.map((chapter, index) => ({ type: 'chapter', chapter, index })),
    progress: { index: chapterIndex, positionSec: chapterPos },
    bookUrl: book.bookUrl,
  };
}

export function createMusicHubSession(
  tracks: AudioTrack[],
  trackIndex = 0,
  positionSec = 0,
): ContentSession {
  const current = tracks[trackIndex];
  return {
    id: AUDIO_HUB_BOOK_URL,
    kind: 'audio',
    source: AUDIO_HUB_SOURCE,
    title: current?.name ?? '音频中心',
    subtitle: current?.artist,
    coverUrl: typeof current?.meta?.coverUrl === 'string' ? current.meta.coverUrl : undefined,
    items: tracks.map((track, index) => ({ type: 'track', track, index })),
    progress: { index: trackIndex, positionSec },
    bookUrl: null,
  };
}

export function isAudioHubSession(session: ContentSession | null | undefined): boolean {
  return session?.source === AUDIO_HUB_SOURCE;
}

export function isAudioHubBookUrl(url: string | null | undefined): boolean {
  return url === AUDIO_HUB_BOOK_URL;
}
