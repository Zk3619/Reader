/**
 * 咪咕曲目封面
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { mgSearchHeaders } from '@/lib/media/audio/online/sources/mg';
import { safeCall } from '@/lib/media/audio/music-sdk/fallback';

export async function mgGetPic(track: AudioTrack): Promise<string | null> {
  const cover = track.meta.coverUrl ?? track.meta.img;
  if (typeof cover === 'string' && cover.trim()) return cover;
  const copyrightId = String(track.meta.copyrightId ?? track.meta.songId ?? '');
  if (!copyrightId) return null;
  const body = await safeCall(() =>
    onlineFetchJson<{ imgItems?: Array<{ img?: string }>; img?: string }>(
      `https://app.c.nf.migu.cn/v1.0/content/resourceinfo.do?copyrightId=${copyrightId}&resourceType=2`,
      { headers: mgSearchHeaders(copyrightId) },
    ),
  );
  const pic = body?.imgItems?.[0]?.img ?? body?.img;
  return pic?.trim() ? pic : null;
}
