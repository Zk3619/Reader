/**
 * 本地曲目在线匹配（对齐 lx getOnlineOtherSourceMusicUrlByLocal）
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { findMusic } from '@/lib/media/audio/music-sdk/find-music';
import { resolveTrackPlaybackUrls } from '@/lib/media/audio/online/online-resolver';

export async function matchLocalTrackOnline(
  track: AudioTrack,
): Promise<AudioTrack | null> {
  if (track.source !== 'local') return null;
  const candidates = await findMusic({
    ...track,
    source: 'wy',
    meta: { ...track.meta, songId: track.meta.songId ?? track.id },
  });
  return candidates[0] ?? null;
}

export async function resolveLocalTrackWithOnlineFallback(
  track: AudioTrack,
  options?: { activeSource?: string | null },
): Promise<{ urls: string[]; matched?: AudioTrack }> {
  const online = await matchLocalTrackOnline(track);
  if (online) {
    const { urls } = await resolveTrackPlaybackUrls(online, options);
    if (urls.length > 0) return { urls, matched: online };
  }
  const { urls } = await resolveTrackPlaybackUrls(track, options);
  return { urls };
}
