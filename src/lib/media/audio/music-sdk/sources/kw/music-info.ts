/**
 * 酷我曲目封面（对齐 lx kw/musicInfo）
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { safeCall } from '@/lib/media/audio/music-sdk/fallback';

export async function kwGetPic(track: AudioTrack): Promise<string | null> {
  const cover = track.meta.coverUrl ?? track.meta.pic;
  if (typeof cover === 'string' && cover.trim()) return cover;
  const songId = String(track.meta.songId ?? track.meta.songmid ?? '');
  if (!songId) return null;
  const body = await safeCall(() =>
    onlineFetchJson<{ data?: { pic?: string; img?: string } }>(
      `https://www.kuwo.cn/api/www/music/musicInfo?mid=${songId}`,
      { headers: { Referer: 'https://www.kuwo.cn/' } },
    ),
  );
  const pic = body?.data?.pic ?? body?.data?.img;
  return pic?.trim() ? pic : null;
}
