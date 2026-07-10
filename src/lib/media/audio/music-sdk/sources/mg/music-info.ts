/**
 * 咪咕曲目/歌单字段映射（对齐 lx-music mg/musicInfo.js）
 */

import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import type { MusicSdkSource } from '@/lib/media/audio/music-sdk/types';

const SOURCE: MusicSdkSource = 'mg';

function formatMgSingers(singers: unknown): string {
  if (!Array.isArray(singers)) return '未知';
  return singers
    .map((s) => {
      if (typeof s === 'object' && s && 'name' in s) return String((s as { name?: string }).name ?? '');
      if (typeof s === 'object' && s && 'singer' in s) return String((s as { singer?: string }).singer ?? '');
      return '';
    })
    .filter(Boolean)
    .join('、') || '未知';
}

export function mapMgPlaylistTrack(data: Record<string, unknown>) {
  const songId = String(data.songId ?? '');
  const copyrightId = String(data.copyrightId ?? '');
  if (!songId || !copyrightId) return null;
  const sec = Number(data.duration ?? 0);
  return {
    id: buildTrackId(SOURCE, copyrightId),
    name: String(data.songName ?? data.name ?? '未知'),
    artist: formatMgSingers(data.singerList),
    source: SOURCE,
    duration: sec > 0 ? formatDurationSec(sec) : '00:00',
    meta: {
      songId,
      songmid: songId,
      copyrightId,
      albumId: String(data.albumId ?? ''),
      albumName: String(data.album ?? ''),
    },
  };
}

export function formatMgPlayCount(num: number | string): string {
  const n = Number(num);
  if (Number.isNaN(n)) return String(num);
  if (n > 100_000_000) return `${Math.floor(n / 10_000_000) / 10}亿`;
  if (n > 10_000) return `${Math.floor(n / 1000) / 10}万`;
  return String(n);
}
