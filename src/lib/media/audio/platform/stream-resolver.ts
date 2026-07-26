/**
 * 平台流 URL 解析（账号态 netease / bili / ytm）
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { getOrFetchTrackUrl } from '@/lib/media/audio/online/url-cache';
import { isPlatformSource } from '@/lib/media/audio/platform/platform-sources';
import { loadAuthSession } from '@/lib/media/audio/platform/auth/session';

export interface PlatformStreamResult {
  url: string;
  headers?: Record<string, string>;
  /** 试听片段（如网易 freeTrialInfo）；长度不固定，不得当完整曲缓存 */
  isPreview?: boolean;
  contentLength?: number;
}

export async function resolvePlatformStream(
  track: AudioTrack,
  options?: { skipCache?: boolean; quality?: import('@/lib/media/audio/lyric-types').MusicQuality },
): Promise<PlatformStreamResult | null> {
  if (!isPlatformSource(String(track.source))) return null;

  switch (track.source) {
    case 'netease': {
      const { getNeteaseSongStream } = await import('@/lib/media/audio/platform/api/netease');
      const stream = await getNeteaseSongStream(track, options?.quality);
      if (!stream?.url) return null;
      return {
        url: stream.url,
        headers: { Referer: 'https://music.163.com/' },
        isPreview: stream.isPreview,
        contentLength: stream.contentLength,
      };
    }
    case 'bili': {
      const { getBiliSongStream } = await import('@/lib/media/audio/platform/api/bili');
      return getBiliSongStream(track, options?.quality);
    }
    case 'ytm': {
      const { getYtmSongStream } = await import('@/lib/media/audio/platform/api/ytm');
      return getYtmSongStream(track, options?.quality);
    }
    default:
      return null;
  }
}

export async function resolvePlatformStreamUrl(
  track: AudioTrack,
  _cookies?: string,
  options?: { skipCache?: boolean; quality?: import('@/lib/media/audio/lyric-types').MusicQuality },
): Promise<string | null> {
  if (options?.skipCache) {
    const stream = await resolvePlatformStream(track, options);
    return stream?.url ?? null;
  }
  return getOrFetchTrackUrl(
    track.id,
    async () => {
      const stream = await resolvePlatformStream(track, options);
      // 试听不进 URL 缓存
      if (!stream?.url || stream.isPreview) return null;
      return stream.url;
    },
    undefined,
    { skipCache: options?.skipCache },
  );
}

/** 平台播放所需 Cookie（物化 / 代理头） */
export async function platformPlaybackCookies(
  track: AudioTrack,
): Promise<string | undefined> {
  if (!isPlatformSource(String(track.source))) return undefined;
  const auth = await loadAuthSession(track.source as 'netease' | 'bili' | 'ytm');
  return auth?.cookies?.trim() || undefined;
}
