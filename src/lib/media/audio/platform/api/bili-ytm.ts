/** Bilibili / YouTube Music API 最小实现 */
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { loadAuthSession } from '@/lib/media/audio/platform/auth/session';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { buildTrackId } from '@/lib/media/audio/track-types';

export async function getBiliSongUrl(track: AudioTrack): Promise<string | null> {
  const auth = await loadAuthSession('bili');
  const bvid = String(track.meta.bvid ?? track.meta.songId ?? '');
  if (!bvid || !auth?.cookies) return null;
  try {
    const body = await onlineFetchJson<{ data?: { dash?: { audio?: Array<{ baseUrl?: string }> } } }>(
      `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${track.meta.cid ?? ''}&fnval=16`,
      { headers: { Cookie: auth.cookies, Referer: 'https://www.bilibili.com/' } },
    );
    return body.data?.dash?.audio?.[0]?.baseUrl ?? null;
  } catch {
    return null;
  }
}

export async function biliSearch(keyword: string, limit = 20): Promise<AudioTrack[]> {
  const auth = await loadAuthSession('bili');
  if (!auth?.cookies) return [];
  try {
    const body = await onlineFetchJson<{
      data?: { result?: Array<{ bvid?: string; title?: string; author?: string; duration?: string }> };
    }>(
      `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}&page=1`,
      { headers: { Cookie: auth.cookies, Referer: 'https://www.bilibili.com/' } },
    );
    return (body.data?.result ?? []).slice(0, limit).map((item) => ({
      id: buildTrackId('bili', item.bvid ?? item.title ?? keyword),
      name: item.title ?? keyword,
      artist: item.author ?? '',
      source: 'bili',
      duration: item.duration ?? '00:00',
      meta: { bvid: item.bvid, songId: item.bvid },
    }));
  } catch {
    return [];
  }
}

/** YouTube Music innertube 最小占位：需后续接完整 player API */
export async function getYtmSongUrl(track: AudioTrack): Promise<string | null> {
  const videoId = String(track.meta.videoId ?? track.meta.songId ?? '');
  if (!videoId) return null;
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/"url":"(https:\\\/\\\/[^"]+googlevideo[^"]+)"/);
    if (!match?.[1]) return null;
    return match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
  } catch {
    return null;
  }
}

export async function ytmSearch(keyword: string, limit = 20): Promise<AudioTrack[]> {
  try {
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}`,
    );
    if (!res.ok) return [];
    const html = await res.text();
    const ids = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)]
      .map((m) => m[1])
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .slice(0, limit);
    return ids.map((videoId) => ({
      id: buildTrackId('ytm', videoId),
      name: keyword,
      artist: '',
      source: 'ytm',
      duration: '00:00',
      meta: { videoId, songId: videoId },
    }));
  } catch {
    return [];
  }
}
