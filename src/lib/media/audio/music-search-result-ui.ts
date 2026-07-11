/**
 * 音乐搜索结果行展示辅助（对齐 lx-music 质量标签 / 字段提取）
 */

import { searchSourceLabel, type SearchSource } from '@/lib/media/audio/online/source-router';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import type { AudioTrack } from '@/lib/media/audio/track-types';

export interface TrackQualityBadge {
  label: string;
  variant: 'default' | 'secondary' | 'outline';
}

export function trackAlbumName(track: AudioTrack): string {
  return String(track.meta.albumName ?? track.meta.album ?? '');
}

export function trackSourceBadgeLabel(track: AudioTrack): string {
  return searchSourceLabel(track.source as SearchSource);
}

function trackQualities(track: AudioTrack): MusicQuality[] {
  const raw = track.meta.qualitys;
  return Array.isArray(raw) ? (raw as MusicQuality[]) : [];
}

/** 对齐 lx：无损 / 高品 / 24bit 标签 */
export function trackQualityBadge(track: AudioTrack): TrackQualityBadge | null {
  const qualities = trackQualities(track);
  if (qualities.length === 0) {
    if (track.meta.hashFlac24bit) return { label: '24bit', variant: 'default' };
    if (track.meta.hashFlac) return { label: '无损', variant: 'default' };
    if (track.meta.hash320) return { label: '高品', variant: 'secondary' };
    return null;
  }
  if (qualities.includes('flac24bit')) return { label: '24bit', variant: 'default' };
  if (qualities.some((q) => q === 'flac' || q === 'ape' || q === 'wav')) {
    return { label: '无损', variant: 'default' };
  }
  if (qualities.includes('320k')) return { label: '高品', variant: 'secondary' };
  return null;
}

export function formatPlaylistStatCount(value?: number | string): string | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(n)) return String(value);
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, '')}亿`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1).replace(/\.0$/, '')}万`;
  return String(n);
}
