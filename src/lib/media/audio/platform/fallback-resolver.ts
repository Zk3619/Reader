/**
 * 多源兜底：findMusic 跨平台匹配 + 关键词末位兜底
 *
 * lx-music 换源语义：同一 UserApi（音源）下切换平台（kw/wy/kg/…），
 * 由 online-resolver 按「音源 × 平台」穷尽；本文件只提供候选列表与末位兜底。
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { findMusic } from '@/lib/media/audio/music-sdk/find-music';
import { resolveOnlineTrackUrl } from '@/lib/media/audio/online/source-router';
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

export type ToggleSourceCallbacks = {
  onStatus?: (message: string | null) => void;
  onToggleSource?: (track: AudioTrack) => void;
};

export function notifyToggleTry(track: AudioTrack, callbacks?: ToggleSourceCallbacks): void {
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

/** 对齐 lx getOtherSource / findMusic：同一首歌在其它平台的匹配曲目 */
export async function getOtherSourceTracks(track: AudioTrack): Promise<AudioTrack[]> {
  if (!isFallbackResolverEnabled()) return [];
  const others = await findMusic(track);
  console.info('[music] findMusic candidates:', others.map((t) => t.source).join(',') || '(none)');
  return others;
}

export async function tryResolveBuiltinUrl(
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

/**
 * findMusic / 音源×平台矩阵都失败后的末位兜底（关键词搜网易/酷我/B 站）。
 * resolveAlt：由调用方决定对该候选如何取链（内置或指定 UserApi）。
 */
export async function resolveLastResortTrackUrl(
  track: AudioTrack,
  resolveAlt: (alt: AudioTrack) => Promise<{ url: string; track: AudioTrack } | null>,
  callbacks?: ToggleSourceCallbacks,
): Promise<{ url: string; track: AudioTrack } | null> {
  if (!isFallbackResolverEnabled()) return null;

  callbacks?.onStatus?.(MusicPlaybackStatusText.toggleTry);
  const keyword = `${track.name} ${track.artist}`.trim();
  if (!keyword) return null;

  if (track.source !== 'wy' && track.source !== 'netease') {
    try {
      const wyTracks = await wy.wySearch(keyword);
      const hit = wyTracks[0];
      if (hit) {
        notifyToggleTry(hit, callbacks);
        const resolved = await resolveAlt(hit);
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
        const resolved = await resolveAlt(hit);
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
    if (url) return { url, track: biliTrack };
  }

  return null;
}

/** @deprecated 兼容旧调用；请用 getOtherSourceTracks + resolveLastResortTrackUrl */
export async function resolveFallbackTrackUrl(
  track: AudioTrack,
  cookies?: string,
  callbacks?: ToggleSourceCallbacks & {
    acceptUrl?: (url: string, track: AudioTrack) => Promise<boolean>;
  },
): Promise<{ url: string; track: AudioTrack } | null> {
  const accept = callbacks?.acceptUrl;
  const others = await getOtherSourceTracks(track);
  for (const alt of others) {
    notifyToggleTry(alt, callbacks);
    const url = await tryResolveBuiltinUrl(alt, cookies);
    if (!url || /bitrate\$1(?:&|$)/i.test(url)) continue;
    if (!accept || (await accept(url, alt))) {
      return { url, track: alt };
    }
  }
  return resolveLastResortTrackUrl(
    track,
    async (alt) => {
      const url = await tryResolveBuiltinUrl(alt, cookies);
      if (!url || /bitrate\$1(?:&|$)/i.test(url)) return null;
      if (accept && !(await accept(url, alt))) return null;
      return { url, track: alt };
    },
    callbacks,
  );
}

/** 兼容设置切换重置；实际熔断在 online-resolver primary circuit */
export function resetUserApiCircuit(): void {}
