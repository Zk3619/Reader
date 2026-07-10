/**
 * 平台流 URL 解析
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { getNeteaseSongUrl } from '@/lib/media/audio/platform/api/netease';
import { getBiliSongUrl, getYtmSongUrl } from '@/lib/media/audio/platform/api/bili-ytm';
import { getOrFetchTrackUrl } from '@/lib/media/audio/online/url-cache';

export async function resolvePlatformStreamUrl(
  track: AudioTrack,
  _cookies?: string,
  options?: { skipCache?: boolean },
): Promise<string | null> {
  return getOrFetchTrackUrl(
    track.id,
    async () => {
      switch (track.source) {
        case 'netease':
          return getNeteaseSongUrl(track) ?? null;
        case 'bili':
          return getBiliSongUrl(track);
        case 'ytm':
          return getYtmSongUrl(track);
        case 'wy':
          return null;
        default:
          return null;
      }
    },
    undefined,
    { skipCache: options?.skipCache },
  );
}
