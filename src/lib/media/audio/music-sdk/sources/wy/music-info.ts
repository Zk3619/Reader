/**
 * 网易曲目信息与封面（对齐 lx wy/musicInfo.js）
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { weapiPost } from '@/lib/media/audio/platform/api/weapi-crypto';

export async function wyGetPic(track: AudioTrack): Promise<string | null> {
  const cover = track.meta.coverUrl ?? track.meta.picUrl;
  if (typeof cover === 'string' && cover.trim()) return cover;
  const id = String(track.meta.songId ?? '');
  if (!id) return null;
  try {
    const body = await weapiPost<{
      songs?: Array<{ al?: { picUrl?: string } }>;
    }>('song/detail', { ids: `[${id}]` });
    const pic = body.songs?.[0]?.al?.picUrl;
    return pic?.trim() ? pic : null;
  } catch {
    return null;
  }
}

export async function wyGetMusicInfo(track: AudioTrack): Promise<Record<string, unknown> | null> {
  const id = String(track.meta.songId ?? '');
  if (!id) return null;
  try {
    const body = await weapiPost<{ songs?: Record<string, unknown>[] }>('song/detail', {
      ids: `[${id}]`,
    });
    return body.songs?.[0] ?? null;
  } catch {
    return null;
  }
}
