/**
 * 听书章节与音乐曲目统一播放适配层
 */

import type { BookChapter } from '@/types';
import type { AudioTrack } from '@/lib/media/audio/track-types';

export interface PlayableItem {
  id: string;
  title: string;
  subtitle?: string;
  coverUrl?: string;
  /** 解析后的可播放 URL 列表（多段） */
  urls: string[];
  lyric?: string;
  kind: 'chapter' | 'track';
  raw: BookChapter | AudioTrack;
}

export function playableFromChapter(
  chapter: BookChapter,
  urls: string[],
  lyric?: string,
): PlayableItem {
  return {
    id: chapter.url,
    title: chapter.title,
    urls,
    lyric,
    kind: 'chapter',
    raw: chapter,
  };
}

export function playableFromTrack(track: AudioTrack, urls: string[]): PlayableItem {
  const coverUrl =
    typeof track.meta.coverUrl === 'string' ? track.meta.coverUrl : undefined;
  const lyric =
    typeof track.meta.lyricText === 'string' ? track.meta.lyricText : undefined;
  return {
    id: track.id,
    title: track.name,
    subtitle: track.artist,
    coverUrl,
    urls,
    lyric,
    kind: 'track',
    raw: track,
  };
}

export function getPlayableUrls(item: PlayableItem | null | undefined): string[] {
  if (!item) return [];
  return item.urls.filter(Boolean);
}
