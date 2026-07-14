/**
 * 音乐搜索结果行展示辅助（对齐 lx-music OnlineList 质量 / 来源标签）
 * @see lx-music-desktop OnlineList：24bit / SQ / HQ + source
 */

import { searchSourceShortLabel } from '@/lib/media/audio/online/source-router';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import type { AudioTrack } from '@/lib/media/audio/track-types';

/** 24bit=紫；SQ=翠绿；HQ=天蓝；source=琥珀（均非主题色、互不撞色） */
export type TrackBadgeTone = 'hires' | 'sq' | 'hq' | 'source';

export interface TrackQualityBadge {
  label: string;
  tone: TrackBadgeTone;
}

export function trackAlbumName(track: AudioTrack): string {
  return String(track.meta.albumName ?? track.meta.album ?? '');
}

export function trackSourceBadgeLabel(track: AudioTrack): string {
  return searchSourceShortLabel(String(track.source));
}

function trackQualityMap(track: AudioTrack): Record<string, unknown> | null {
  const raw = track.meta._qualitys;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

function trackQualities(track: AudioTrack): MusicQuality[] {
  const fromMap = trackQualityMap(track);
  if (fromMap) return Object.keys(fromMap) as MusicQuality[];
  const raw = track.meta.qualitys;
  return Array.isArray(raw) ? (raw as MusicQuality[]) : [];
}

/**
 * 对齐 lx OnlineList 文案：
 * flac24bit → 24bit；flac/ape/wav → SQ；320k → HQ
 */
export function trackQualityBadge(track: AudioTrack): TrackQualityBadge | null {
  const map = trackQualityMap(track);
  if (map) {
    if (map.flac24bit) return { label: '24bit', tone: 'hires' };
    if (map.ape || map.flac || map.wav) return { label: 'SQ', tone: 'sq' };
    if (map['320k']) return { label: 'HQ', tone: 'hq' };
    return null;
  }

  const qualities = trackQualities(track);
  if (qualities.length === 0) {
    if (track.meta.hashFlac24bit || track.meta.hash_high) {
      return { label: '24bit', tone: 'hires' };
    }
    if (track.meta.hashFlac || track.meta.hash_flac) {
      return { label: 'SQ', tone: 'sq' };
    }
    if (track.meta.hash320 || track.meta.hash_320) {
      return { label: 'HQ', tone: 'hq' };
    }
    return null;
  }
  if (qualities.includes('flac24bit')) return { label: '24bit', tone: 'hires' };
  if (qualities.some((q) => q === 'flac' || q === 'ape' || q === 'wav')) {
    return { label: 'SQ', tone: 'sq' };
  }
  if (qualities.includes('320k')) return { label: 'HQ', tone: 'hq' };
  return null;
}

const BADGE_BASE =
  'border-transparent bg-transparent px-1 py-0 text-[10px] font-medium leading-4';

/** 列表徽标 class：四色互斥，不占用主题色 */
export function trackBadgeToneClass(tone: TrackBadgeTone): string {
  switch (tone) {
    case 'hires':
      return `${BADGE_BASE} text-violet-500 dark:text-violet-400`;
    case 'sq':
      return `${BADGE_BASE} text-emerald-500 dark:text-emerald-400`;
    case 'hq':
      return `${BADGE_BASE} text-sky-500 dark:text-sky-400`;
    case 'source':
      return `${BADGE_BASE} text-amber-500 dark:text-amber-400`;
  }
}

export function formatPlaylistStatCount(value?: number | string): string | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(n)) return String(value);
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, '')}亿`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1).replace(/\.0$/, '')}万`;
  return String(n);
}
