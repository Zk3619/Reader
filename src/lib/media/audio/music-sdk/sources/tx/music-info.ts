/**
 * QQ 音乐曲目封面
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { zzcSign } from '@/lib/media/audio/platform/api/tx-sign';
import { safeCall } from '@/lib/media/audio/music-sdk/fallback';

async function txSignedRequest<T>(payload: Record<string, unknown>): Promise<T | null> {
  const bodyText = JSON.stringify(payload);
  const sign = zzcSign(bodyText);
  return safeCall(() =>
    onlineFetchJson<T>(`https://u.y.qq.com/cgi-bin/musics.fcg?sign=${sign}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'QQMusic 14090508(android 12)',
      },
      body: bodyText,
    }),
  );
}

export async function txGetPic(track: AudioTrack): Promise<string | null> {
  const cover = track.meta.coverUrl ?? track.meta.albumPic;
  if (typeof cover === 'string' && cover.trim()) return cover;
  const songmid = String(track.meta.songmid ?? track.meta.songId ?? '');
  if (!songmid) return null;
  try {
    const body = await txSignedRequest<{
      req?: { data?: { track_info?: { album?: { mid?: string } } } };
    }>({
      comm: { ct: 11, cv: 14090508 },
      req: {
        module: 'music.pf_song_detail_svr',
        method: 'get_song_detail',
        param: { song_mid: songmid },
      },
    });
    const albumMid = body?.req?.data?.track_info?.album?.mid;
    if (!albumMid) return null;
    return `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg`;
  } catch {
    return null;
  }
}
