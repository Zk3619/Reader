/**
 * 统一在线/本地曲目 URL 解析
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { resolveLocalTrackUrl } from '@/lib/media/audio/library/local-resolver';
import { resolveOnlineTrackUrl } from '@/lib/media/audio/online/source-router';
import { userApiMusicUrl, isFragileUserApi, listEnabledUserApiScriptIdsForUrl } from '@/lib/media/audio/online/user-api-engine';
import { getMusicOfflineMode } from '@/lib/media/audio/online/user-api-settings';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { getPlayQuality, qualityFallbackChain } from '@/lib/media/audio/music-quality';
import {
  cacheMusicTrackAudio,
  createAudioObjectUrl,
  getCachedMusicTrackByTrackId,
} from '@/lib/media/audio/audio-disk-cache';
import { resolveFallbackTrackUrl, type ToggleSourceCallbacks } from '@/lib/media/audio/platform/fallback-resolver';
import { MusicPlaybackStatusText } from '@/lib/media/audio/music-playback-status';
import { request } from '@/lib/http';
import { isTauri } from '@/lib/platform/detect';

/** 脆弱第三方代理连续失败时跳过（直连源不熔断） */
let primaryUserApiFailStreak = 0;
let primaryUserApiCircuitUntil = 0;

function isPrimaryUserApiCircuitOpen(scriptId?: string | null): boolean {
  if (scriptId && !isFragileUserApi(scriptId)) return false;
  return Date.now() < primaryUserApiCircuitUntil;
}

function notePrimaryUserApiFailure(scriptId?: string | null): void {
  if (scriptId && !isFragileUserApi(scriptId)) return;
  primaryUserApiFailStreak += 1;
  if (primaryUserApiFailStreak >= 2) {
    primaryUserApiCircuitUntil = Date.now() + 5 * 60_000;
    primaryUserApiFailStreak = 0;
    console.warn('[user-api] primary circuit opened for 5min (fragile proxy)');
  }
}

function notePrimaryUserApiSuccess(): void {
  primaryUserApiFailStreak = 0;
  primaryUserApiCircuitUntil = 0;
}

export function resetPrimaryUserApiCircuit(): void {
  primaryUserApiFailStreak = 0;
  primaryUserApiCircuitUntil = 0;
}

async function tryCachePlayback(
  track: AudioTrack,
  sourceUrl: string,
  bytes: ArrayBuffer,
  mime = 'audio/mpeg',
): Promise<void> {
  try {
    await cacheMusicTrackAudio(track.id, sourceUrl, bytes, mime);
  } catch {
    // 后台缓存失败不影响播放
  }
}

async function resolveBuiltinUrl(
  track: AudioTrack,
  cookies?: string,
  options?: { skipCache?: boolean },
): Promise<string | null> {
  const qualities = qualityFallbackChain(getPlayQuality());
  for (const q of qualities) {
    const url = await resolveOnlineTrackUrl(track, cookies, {
      skipCache: options?.skipCache,
      quality: q,
    });
    if (url) return url;
  }
  return null;
}

const USER_API_MUSIC_URL_TIMEOUT_MS = 20_000;

async function resolveUserApiUrl(
  userApiId: string,
  track: AudioTrack,
): Promise<string | null> {
  if (isPrimaryUserApiCircuitOpen(userApiId)) {
    console.warn('[user-api] circuit open, skip', userApiId);
    return null;
  }
  try {
    const result = await Promise.race([
      userApiMusicUrl(userApiId, track, undefined, getPlayQuality()),
      new Promise<null>((resolve) => {
        setTimeout(() => {
          console.warn('[user-api] musicUrl timeout', userApiId);
          resolve(null);
        }, USER_API_MUSIC_URL_TIMEOUT_MS);
      }),
    ]);
    if (result) {
      notePrimaryUserApiSuccess();
      return result;
    }
    notePrimaryUserApiFailure(userApiId);
    return null;
  } catch (err) {
    notePrimaryUserApiFailure(userApiId);
    console.warn('[user-api] musicUrl failed', userApiId, err);
    return null;
  }
}

/** 默认音源 → 其他已启用音源 */
async function resolveAcrossUserApis(track: AudioTrack): Promise<string | null> {
  const ids = listEnabledUserApiScriptIdsForUrl();
  for (const id of ids) {
    const url = await resolveUserApiUrl(id, track);
    if (url) {
      console.info('[user-api] musicUrl ok via', id);
      return url;
    }
  }
  return null;
}

export async function resolveTrackPlaybackUrls(
  track: AudioTrack,
  options?: {
    cookies?: string;
    userApiId?: string;
    skipCache?: boolean;
    activeSource?: string | null;
  } & ToggleSourceCallbacks,
): Promise<{
  urls: string[];
  revokeAll: () => void;
  toggled?: boolean;
  track?: AudioTrack;
}> {
  const offline = getMusicOfflineMode();
  const urlMode = getMusicSettings().urlSourceMode;
  // options.userApiId / activeSource 仍保留兼容，取链统一按「默认→其他启用」遍历

  if (track.source === 'local') {
    const url = resolveLocalTrackUrl(track);
    return { urls: url ? [url] : [], revokeAll: () => {}, track };
  }

  if (!options?.skipCache) {
    const cached = await getCachedMusicTrackByTrackId(track.id);
    if (cached) {
      const blobUrl = createAudioObjectUrl(cached.bytes, cached.mime);
      return {
        urls: [blobUrl],
        revokeAll: () => URL.revokeObjectURL(blobUrl),
        track,
      };
    }
  }

  if (offline) {
    return { urls: [], revokeAll: () => {}, track };
  }

  options?.onStatus?.(MusicPlaybackStatusText.gettingUrl);

  let playable: { url: string; revoke: () => void } | null = null;
  let toggled = false;

  const acceptUrl = async (
    candidateUrl: string,
    candidateTrack: AudioTrack,
  ): Promise<{ url: string; revoke: () => void } | null> => {
    if (/bitrate\$1(?:&|$)/i.test(candidateUrl)) {
      console.warn('[music] reject kuwo stub url', candidateUrl.slice(0, 80));
      return null;
    }
    if (!candidateUrl.startsWith('http')) {
      const direct = { url: candidateUrl, revoke: () => {} };
      playable = direct;
      return direct;
    }
    const materialized = await materializePlayableUrl(
      candidateUrl,
      candidateTrack,
      options?.cookies,
    );
    if (!materialized) return null;
    playable = materialized;
    return materialized;
  };

  const acceptUrlValidator = async (url: string, t: AudioTrack) =>
    (await acceptUrl(url, t)) !== null;

  // 取链顺序：默认 UserApi → 其他已启用 UserApi → 内置
  let primaryUrl: string | null = null;
  if (urlMode !== 'builtin') {
    primaryUrl = await resolveAcrossUserApis(track);
  }
  if (!primaryUrl && urlMode !== 'userApi') {
    primaryUrl = await resolveBuiltinUrl(track, options?.cookies, options);
  }

  const acceptedPrimary = primaryUrl ? await acceptUrl(primaryUrl, track) : null;
  if (acceptedPrimary) {
    options?.onStatus?.(null);
    return {
      urls: [acceptedPrimary.url],
      revokeAll: acceptedPrimary.revoke,
      toggled: false,
      track,
    };
  }

  toggled = true;
  const fallback = await resolveFallbackTrackUrl(track, options?.cookies, {
    onStatus: options?.onStatus,
    onToggleSource: options?.onToggleSource,
    acceptUrl: acceptUrlValidator,
  });
  options?.onStatus?.(null);

  if (fallback) {
    const resolvedPlayable =
      playable ?? (await acceptUrl(fallback.url, fallback.track));
    if (resolvedPlayable) {
      return {
        urls: [resolvedPlayable.url],
        revokeAll: resolvedPlayable.revoke,
        toggled: true,
        track: fallback.track,
      };
    }
  }

  return { urls: [], revokeAll: () => {}, toggled, track };
}

function parseTrackDurationSec(duration: string | undefined): number {
  if (!duration) return 0;
  const parts = duration.split(':').map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  let sec = 0;
  let unit = 1;
  while (parts.length) {
    sec += (parts.pop() ?? 0) * unit;
    unit *= 60;
  }
  return sec;
}

async function materializePlayableUrl(
  url: string,
  track: AudioTrack,
  cookies?: string,
): Promise<{ url: string; revoke: () => void } | null> {
  if (/bitrate\$1(?:&|$)/i.test(url)) {
    console.warn('[music] skip kuwo stub audio', url.slice(0, 80));
    return null;
  }
  try {
    const headers: Record<string, string> = {};
    if (cookies) headers.Cookie = cookies;
    // 酷我 / QQ / 咪咕 CDN 常要求 Referer
    if (/kuwo\.cn/i.test(url)) headers.Referer = 'https://www.kuwo.cn/';
    else if (/qqmusic\.qq\.com|y\.qq\.com/i.test(url)) headers.Referer = 'https://y.qq.com/';
    else if (/migu\.cn|nf\.migu/i.test(url)) headers.Referer = 'https://music.migu.cn/';
    else if (/music\.126\.net|163\.com/i.test(url)) headers.Referer = 'https://music.163.com/';

    const res = await request(url, {
      method: 'GET',
      headers,
      timeout: 120_000,
      useBackendHttp: isTauri(),
      ignorePageNavigationAbort: true,
      allowNon2xx: true,
    });
    if (!res.ok) {
      // CDN 偶发 503：回退直链，WebView <audio> 常仍可播
      console.warn('[music] materialize HTTP', res.status, 'fallback to direct url');
      return { url, revoke: () => {} };
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 8_192) {
      console.warn('[music] audio too small', buf.byteLength, url.slice(0, 60));
      return null;
    }
    // VIP 试听片段通常远小于整曲；按时长粗估拒绝过短内容（约 <64kbps 整曲）
    const dur = parseTrackDurationSec(track.duration);
    if (dur >= 60) {
      const minBytes = Math.floor(dur * 8_000);
      if (buf.byteLength < minBytes) {
        console.warn(
          '[music] audio looks like preview fragment',
          { bytes: buf.byteLength, minBytes, dur, url: url.slice(0, 60) },
        );
        return null;
      }
    }
    const mime =
      (typeof res.headers['content-type'] === 'string' && res.headers['content-type']) ||
      'audio/mpeg';
    void tryCachePlayback(track, url, buf, mime);
    const blobUrl = URL.createObjectURL(new Blob([buf], { type: mime }));
    return { url: blobUrl, revoke: () => URL.revokeObjectURL(blobUrl) };
  } catch (err) {
    console.warn('[music] materialize playable url failed, fallback direct', url.slice(0, 80), err);
    // 网络抖动时仍尝试直链播放
    if (/^https?:\/\//i.test(url) && !/bitrate\$1(?:&|$)/i.test(url)) {
      return { url, revoke: () => {} };
    }
    return null;
  }
}

/** 主动缓存当前曲目到本地 */
export async function cacheTrackForOffline(
  track: AudioTrack,
  options?: { cookies?: string; userApiId?: string; activeSource?: string | null },
): Promise<boolean> {
  const { urls } = await resolveTrackPlaybackUrls(track, {
    ...options,
    skipCache: true,
  });
  const url = urls[0];
  if (!url) return false;
  if (url.startsWith('blob:')) {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    await cacheMusicTrackAudio(track.id, url, buf);
    return true;
  }
  const res = await request(url, {
    headers: options?.cookies ? { Cookie: options.cookies } : undefined,
  });
  if (!res.ok) return false;
  const buf = await res.arrayBuffer();
  await cacheMusicTrackAudio(track.id, url, buf);
  return true;
}
