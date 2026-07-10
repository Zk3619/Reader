/**
 * 下一首播放 URL 预加载（对齐 lx preloadNextMusic）
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { resolveTrackPlaybackUrls } from '@/lib/media/audio/online/online-resolver';
import { getOrFetchTrackUrl } from '@/lib/media/audio/online/url-cache';

const preloaded = new Map<string, string>();

export function getPreloadedTrackUrl(trackId: string): string | null {
  return preloaded.get(trackId) ?? null;
}

export function clearTrackPreload(trackId?: string): void {
  if (trackId) preloaded.delete(trackId);
  else preloaded.clear();
}

export async function preloadTrackUrl(
  track: AudioTrack,
  options?: { cookies?: string; activeSource?: string | null },
): Promise<void> {
  if (track.source === 'local') return;
  const cached = getPreloadedTrackUrl(track.id);
  if (cached) return;
  try {
    const { urls } = await resolveTrackPlaybackUrls(track, {
      ...options,
      skipCache: false,
    });
    const url = urls[0];
    if (url && !url.startsWith('blob:')) {
      preloaded.set(track.id, url);
      void getOrFetchTrackUrl(track.id, async () => url);
    }
  } catch {
    // 预加载失败不影响当前播放
  }
}
