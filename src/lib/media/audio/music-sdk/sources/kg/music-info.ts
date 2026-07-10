/**
 * 酷狗曲目封面
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { safeCall } from '@/lib/media/audio/music-sdk/fallback';

const KUGOU_HEADERS = { Referer: 'https://www.kugou.com/' };

export async function kgGetPic(track: AudioTrack): Promise<string | null> {
  const cover = track.meta.coverUrl ?? track.meta.albumImg;
  if (typeof cover === 'string' && cover.trim()) return cover;
  const hash = String(track.meta.hash ?? track.meta.songId ?? '');
  if (!hash) return null;
  const body = await safeCall(() =>
    onlineFetchJson<{
      data?: { album_img?: string; img?: string };
    }>(
      `https://wwwapi.kugou.com/yy/index.php?r=play/getdata&hash=${hash}`,
      { headers: KUGOU_HEADERS },
    ),
  );
  const pic = body?.data?.album_img ?? body?.data?.img;
  return pic?.trim() ? pic : null;
}
