/**
 * 统一在线/本地曲目 URL 解析
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { resolveLocalTrackUrl } from '@/lib/media/audio/library/local-resolver';
import { resolveOnlineTrackUrl } from '@/lib/media/audio/online/source-router';
import { userApiMusicUrl } from '@/lib/media/audio/online/user-api-engine';
import { resolveUserApiIdForTrack } from '@/lib/media/audio/online/user-api-settings';
import { getMusicOfflineMode } from '@/lib/media/audio/online/user-api-settings';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { getPlayQuality } from '@/lib/media/audio/music-quality';
import {
  cacheMusicTrackAudio,
  createAudioObjectUrl,
  getCachedMusicTrackByTrackId,
} from '@/lib/media/audio/audio-disk-cache';
import { resolveFallbackTrackUrl } from '@/lib/media/audio/platform/fallback-resolver';
import { request } from '@/lib/http';
import { isTauri } from '@/lib/platform/detect';

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
  return resolveOnlineTrackUrl(track, cookies, {
    skipCache: options?.skipCache,
    quality: getPlayQuality(),
  });
}

async function resolveUserApiUrl(
  userApiId: string,
  track: AudioTrack,
): Promise<string | null> {
  return userApiMusicUrl(userApiId, track, undefined, getPlayQuality());
}

export async function resolveTrackPlaybackUrls(
  track: AudioTrack,
  options?: {
    cookies?: string;
    userApiId?: string;
    skipCache?: boolean;
    activeSource?: string | null;
  },
): Promise<{ urls: string[]; revokeAll: () => void }> {
  const userApiId =
    options?.userApiId ?? resolveUserApiIdForTrack(track, options?.activeSource);
  const offline = getMusicOfflineMode();
  const urlMode = getMusicSettings().urlSourceMode;

  if (track.source === 'local') {
    const url = resolveLocalTrackUrl(track);
    return { urls: url ? [url] : [], revokeAll: () => {} };
  }

  if (!options?.skipCache) {
    const cached = await getCachedMusicTrackByTrackId(track.id);
    if (cached) {
      const blobUrl = createAudioObjectUrl(cached.bytes, cached.mime);
      return { urls: [blobUrl], revokeAll: () => URL.revokeObjectURL(blobUrl) };
    }
  }

  if (offline) {
    return { urls: [], revokeAll: () => {} };
  }

  let url: string | null = null;

  if (track.source === 'userApi' && userApiId) {
    url = await resolveUserApiUrl(userApiId, track);
    if (url) return { urls: [url], revokeAll: () => {} };
  }

  if (urlMode === 'userApi' && userApiId) {
    url = await resolveUserApiUrl(userApiId, track);
    if (url) return { urls: [url], revokeAll: () => {} };
  }

  if (urlMode === 'builtin' || urlMode === 'auto') {
    url = await resolveBuiltinUrl(track, options?.cookies, options);
    if (!url && urlMode === 'auto' && userApiId) {
      url = await resolveUserApiUrl(userApiId, track);
    }
  } else if (userApiId && track.source !== 'userApi') {
    url = await resolveUserApiUrl(userApiId, track);
  }

  if (!url) {
    const fallback = await resolveFallbackTrackUrl(track, options?.cookies);
    if (fallback) {
      url = fallback.url;
      track = fallback.track;
    }
  }

  if (!url) return { urls: [], revokeAll: () => {} };

  if (!isTauri() && url.startsWith('http')) {
    try {
      const res = await request(url, {
        headers: options?.cookies ? { Cookie: options.cookies } : undefined,
      });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        void tryCachePlayback(track, url, buf);
        const blob = new Blob([buf]);
        const blobUrl = URL.createObjectURL(blob);
        return {
          urls: [blobUrl],
          revokeAll: () => URL.revokeObjectURL(blobUrl),
        };
      }
    } catch {
      // fallback direct url
    }
  }

  return { urls: [url], revokeAll: () => {} };
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
