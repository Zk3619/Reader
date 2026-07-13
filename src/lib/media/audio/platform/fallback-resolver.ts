/**
 * 多源兜底解析（主源失败时 findMusic + 备用源）
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { findMusic } from '@/lib/media/audio/music-sdk/find-music';
import { resolveOnlineTrackUrl } from '@/lib/media/audio/online/source-router';
import { userApiMusicUrl, isFragileUserApi, listEnabledUserApiScriptIdsForUrl } from '@/lib/media/audio/online/user-api-engine';
import { getPlayQuality, qualityFallbackChain } from '@/lib/media/audio/music-quality';
import {
  MusicPlaybackStatusText,
  formatToggleSourceTry,
} from '@/lib/media/audio/music-playback-status';
import * as wy from '@/lib/media/audio/online/sources/wy';
import * as kw from '@/lib/media/audio/online/sources/kw';
import { getBiliSongUrl } from '@/lib/media/audio/platform/api/bili-ytm';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { loadAuthSession } from '@/lib/media/audio/platform/auth/session';

const FALLBACK_KEY = 'reader_audio_fallback_enabled';
const USER_API_FALLBACK_TIMEOUT_MS = 20_000;

export type ToggleSourceCallbacks = {
  onStatus?: (message: string | null) => void;
  onToggleSource?: (track: AudioTrack) => void;
};

function notifyToggleTry(track: AudioTrack, callbacks?: ToggleSourceCallbacks): void {
  callbacks?.onToggleSource?.(track);
  callbacks?.onStatus?.(formatToggleSourceTry(track));
  console.info('[music] try toggle to:', track.source, track.name, track.artist, track.duration);
}

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

async function tryResolveOneUserApi(
  scriptId: string,
  track: AudioTrack,
): Promise<string | null> {
  if (isUserApiCircuitOpen(scriptId)) {
    console.warn('[user-api] circuit open, skip', scriptId);
    return null;
  }
  try {
    const result = await Promise.race([
      userApiMusicUrl(scriptId, track),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), USER_API_FALLBACK_TIMEOUT_MS);
      }),
    ]);
    if (result) {
      noteUserApiSuccess();
      return result;
    }
    noteUserApiFailure(scriptId);
    return null;
  } catch (err) {
    noteUserApiFailure(scriptId);
    console.warn('[user-api] fallback musicUrl failed', scriptId, err);
    return null;
  }
}

async function tryResolveUserApiUrl(track: AudioTrack): Promise<string | null> {
  const urlMode = getMusicSettings().urlSourceMode;
  if (urlMode === 'builtin') return null;
  const ids = listEnabledUserApiScriptIdsForUrl();
  for (const id of ids) {
    const url = await tryResolveOneUserApi(id, track);
    if (url) {
      console.info('[user-api] fallback musicUrl ok via', id);
      return url;
    }
  }
  return null;
}

/** 脆弱第三方代理连续失败时熔断；直连源（小熊猫等）不熔断 */
let userApiFailStreak = 0;
let userApiCircuitUntil = 0;

function isUserApiCircuitOpen(scriptId?: string | null): boolean {
  if (scriptId && !isFragileUserApi(scriptId)) return false;
  return Date.now() < userApiCircuitUntil;
}

function noteUserApiFailure(scriptId?: string | null): void {
  if (scriptId && !isFragileUserApi(scriptId)) return;
  userApiFailStreak += 1;
  if (userApiFailStreak >= 2) {
    userApiCircuitUntil = Date.now() + 5 * 60_000;
    userApiFailStreak = 0;
    console.warn('[user-api] circuit opened for 5min (third-party proxy failing)');
  }
}

function noteUserApiSuccess(): void {
  userApiFailStreak = 0;
  userApiCircuitUntil = 0;
}

export function resetUserApiCircuit(): void {
  userApiFailStreak = 0;
  userApiCircuitUntil = 0;
}

async function tryResolveBuiltinUrl(
  track: AudioTrack,
  cookies?: string,
): Promise<string | null> {
  const qualities = qualityFallbackChain(getPlayQuality());
  for (const q of qualities) {
    const url = await resolveOnlineTrackUrl(track, cookies, { skipCache: true, quality: q });
    if (url) return url;
  }
  return null;
}

async function tryResolveUrl(
  track: AudioTrack,
  cookies?: string,
  accept?: (url: string, track: AudioTrack) => Promise<boolean>,
): Promise<{ url: string; track: AudioTrack } | null> {
  // 换源取链：默认/其他 UserApi → 内置
  const userApiUrl = await tryResolveUserApiUrl(track);
  if (userApiUrl && !/bitrate\$1(?:&|$)/i.test(userApiUrl)) {
    if (!accept || (await accept(userApiUrl, track))) {
      console.info('[music] user-api url ok:', track.source, track.name);
      return { url: userApiUrl, track };
    }
    console.warn('[music] user-api url rejected by validator:', track.source, track.name);
  }

  const url = await tryResolveBuiltinUrl(track, cookies);
  if (url && !/bitrate\$1(?:&|$)/i.test(url)) {
    if (!accept || (await accept(url, track))) {
      console.info('[music] builtin url ok:', track.source, track.name);
      return { url, track };
    }
    console.warn('[music] builtin url rejected by validator:', track.source, track.name);
  }

  console.warn('[music] resolve url failed:', track.source, track.name, track.id);
  return null;
}

/** 主源 URL 解析失败时尝试备用源（对齐 lx-music getOnlineOtherSourceMusicUrl） */
export async function resolveFallbackTrackUrl(
  track: AudioTrack,
  cookies?: string,
  callbacks?: ToggleSourceCallbacks & {
    /** 可选：校验播放地址是否可用（如拉流后非占位/非试听片段） */
    acceptUrl?: (url: string, track: AudioTrack) => Promise<boolean>;
  },
): Promise<{ url: string; track: AudioTrack } | null> {
  if (!isFallbackResolverEnabled()) return null;

  callbacks?.onStatus?.(MusicPlaybackStatusText.toggleTry);
  const accept = callbacks?.acceptUrl;

  const others = await findMusic(track);
  console.info('[music] findMusic candidates:', others.map((t) => t.source).join(','));
  for (const alt of others) {
    notifyToggleTry(alt, callbacks);
    const hit = await tryResolveUrl(alt, cookies, accept);
    if (hit) return hit;
  }

  const keyword = `${track.name} ${track.artist}`.trim();
  if (!keyword) return null;

  if (track.source !== 'wy' && track.source !== 'netease') {
    try {
      const wyTracks = await wy.wySearch(keyword);
      const hit = wyTracks[0];
      if (hit) {
        notifyToggleTry(hit, callbacks);
        const resolved = await tryResolveUrl(hit, cookies, accept);
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
        notifyToggleTry(hit, callbacks);
        const resolved = await tryResolveUrl(hit, cookies, accept);
        if (resolved) return resolved;
      }
    } catch {
      // continue
    }
  }

  const biliTrack = await searchBili(keyword);
  if (biliTrack) {
    notifyToggleTry(biliTrack, callbacks);
    const url = await getBiliSongUrl(biliTrack);
    if (url && (!accept || (await accept(url, biliTrack)))) {
      return { url, track: biliTrack };
    }
  }

  return null;
}
