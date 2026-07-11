/**
 * 多源兜底解析（主源失败时 findMusic + 备用源）
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { findMusic } from '@/lib/media/audio/music-sdk/find-music';
import { resolveOnlineTrackUrl } from '@/lib/media/audio/online/source-router';
import { userApiMusicUrl } from '@/lib/media/audio/online/user-api-engine';
import { getDefaultUserApiId } from '@/lib/media/audio/online/user-api-settings';
import { getPlayQuality, qualityFallbackChain } from '@/lib/media/audio/music-quality';
import * as wy from '@/lib/media/audio/online/sources/wy';
import * as kw from '@/lib/media/audio/online/sources/kw';
import { getBiliSongUrl } from '@/lib/media/audio/platform/api/bili-ytm';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { loadAuthSession } from '@/lib/media/audio/platform/auth/session';

const FALLBACK_KEY = 'reader_audio_fallback_enabled';

export function isFallbackResolverEnabled(): boolean {
  if (!getMusicSettings().fallbackUrl) return false;
  try {
    return localStorage.getItem(FALLBACK_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setFallbackResolverEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(FALLBACK_KEY, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}

async function searchBili(keyword: string): Promise<AudioTrack | null> {
  const auth = await loadAuthSession('bili');
  if (!auth?.cookies) return null;
  try {
    const body = await onlineFetchJson<{
      data?: { result?: Array<{ bvid?: string; title?: string; author?: string; cid?: number }> };
    }>(
      `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}`,
      { headers: { Cookie: auth.cookies, Referer: 'https://www.bilibili.com/' } },
    );
    const hit = body.data?.result?.[0];
    if (!hit?.bvid) return null;
    return {
      id: `bili__${hit.bvid}`,
      name: hit.title ?? keyword,
      artist: hit.author ?? '',
      source: 'bili',
      duration: '00:00',
      meta: { bvid: hit.bvid, cid: hit.cid, songId: hit.bvid },
    };
  } catch {
    return null;
  }
}

async function tryResolveUserApiUrl(track: AudioTrack): Promise<string | null> {
  const urlMode = getMusicSettings().urlSourceMode;
  if (urlMode === 'builtin') return null;
  const scriptId = getDefaultUserApiId();
  if (!scriptId) return null;
  try {
    return await userApiMusicUrl(scriptId, track);
  } catch (err) {
    console.warn('[user-api] fallback musicUrl failed', err);
    return null;
  }
}

async function tryResolveUrl(
  track: AudioTrack,
  cookies?: string,
): Promise<{ url: string; track: AudioTrack } | null> {
  const userApiUrl = await tryResolveUserApiUrl(track);
  if (userApiUrl) return { url: userApiUrl, track };

  const qualities = qualityFallbackChain(getPlayQuality());
  for (const q of qualities) {
    const url = await resolveOnlineTrackUrl(track, cookies, { skipCache: true, quality: q });
    if (url) return { url, track };
  }
  return null;
}

/** 主源 URL 解析失败时尝试备用源 */
export async function resolveFallbackTrackUrl(
  track: AudioTrack,
  cookies?: string,
): Promise<{ url: string; track: AudioTrack } | null> {
  if (!isFallbackResolverEnabled()) return null;

  const others = await findMusic(track);
  for (const alt of others) {
    const hit = await tryResolveUrl(alt, cookies);
    if (hit) return hit;
  }

  const keyword = `${track.name} ${track.artist}`.trim();
  if (!keyword) return null;

  if (track.source !== 'wy' && track.source !== 'netease') {
    try {
      const wyTracks = await wy.wySearch(keyword);
      const hit = wyTracks[0];
      if (hit) {
        const resolved = await tryResolveUrl(hit, cookies);
        if (resolved) return resolved;
      }
    } catch {
      // continue
    }
  }

  if (track.source !== 'kw') {
    try {
      const res = await kw.kwSearch(keyword);
      const hit = res.tracks[0];
      if (hit) {
        const resolved = await tryResolveUrl(hit, cookies);
        if (resolved) return resolved;
      }
    } catch {
      // continue
    }
  }

  const biliTrack = await searchBili(keyword);
  if (biliTrack) {
    const url = await getBiliSongUrl(biliTrack);
    if (url) return { url, track: biliTrack };
  }

  return null;
}
