/**
 * 外挂元数据：LRCLIB 歌词（不取播链）
 * https://lrclib.net/docs
 */

import type { LyricBundle } from '@/lib/media/audio/lyric-types';
import type { AudioTrack } from '@/lib/media/audio/track-types';

type LrcLibHit = {
  id?: number;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
};

function durationSec(track: AudioTrack): number | undefined {
  const d = track.duration || '';
  if (!d || d === '00:00') return undefined;
  const parts = d.split(':').map((x) => parseInt(x, 10));
  if (parts.some((n) => !Number.isFinite(n))) return undefined;
  let sec = 0;
  let unit = 1;
  while (parts.length) {
    sec += (parts.pop() ?? 0) * unit;
    unit *= 60;
  }
  return sec > 0 ? sec : undefined;
}

export async function fetchLrclibLyric(track: AudioTrack): Promise<LyricBundle | null> {
  const trackName = track.name?.trim();
  const artistName = track.artist?.trim();
  if (!trackName) return null;

  const params = new URLSearchParams();
  params.set('track_name', trackName);
  if (artistName) params.set('artist_name', artistName);
  const album = String(track.meta.albumName ?? '').trim();
  if (album) params.set('album_name', album);
  const dur = durationSec(track);
  if (dur != null) params.set('duration', String(Math.round(dur)));

  try {
    const res = await fetch(`https://lrclib.net/api/search?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const list = (await res.json()) as LrcLibHit[];
    if (!Array.isArray(list) || !list.length) return null;

    const prefer =
      list.find((h) => h.syncedLyrics?.trim()) ??
      list.find((h) => h.plainLyrics?.trim()) ??
      list[0];
    if (!prefer || prefer.instrumental) return null;

    const lyric = (prefer.syncedLyrics || prefer.plainLyrics || '').trim();
    if (!lyric) return null;
    return { lyric };
  } catch {
    return null;
  }
}
