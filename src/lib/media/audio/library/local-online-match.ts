/**
 * 本地曲目在线匹配（对齐 any-listen findMusic / lx getOnlineOtherSourceMusicUrlByLocal）
 * 播放仍走本地文件；匹配结果补封面/歌词挂载点（toggleMusicInfo）与 meta 缓存。
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { findMusic } from '@/lib/media/audio/music-sdk/find-music';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { resolveTrackPlaybackUrls } from '@/lib/media/audio/online/online-resolver';
import { attachToggleMusicInfo } from '@/lib/media/audio/track-toggle';

function hasCover(track: AudioTrack): boolean {
  const c = track.meta.coverUrl;
  return typeof c === 'string' && c.trim().length > 0;
}

function matchedOnlineStub(track: AudioTrack): AudioTrack | null {
  const id = track.meta.matchedOnlineId;
  const source = track.meta.matchedSource;
  if (typeof id !== 'string' || !id.trim()) return null;
  if (typeof source !== 'string' || !source.trim()) return null;
  const songId =
    typeof track.meta.matchedSongId === 'string' ? track.meta.matchedSongId : undefined;
  return {
    id: id.trim(),
    name: track.name,
    artist: track.artist,
    source: source.trim(),
    duration: track.duration,
    meta: {
      songId,
      songmid: songId,
      hash: typeof track.meta.matchedHash === 'string' ? track.meta.matchedHash : undefined,
      albumName: track.meta.albumName,
      coverUrl: typeof track.meta.matchedCoverUrl === 'string' ? track.meta.matchedCoverUrl : undefined,
    },
  };
}

export async function matchLocalTrackOnline(
  track: AudioTrack,
): Promise<AudioTrack | null> {
  if (track.source !== 'local') return null;
  const stub = matchedOnlineStub(track);
  if (stub) return stub;
  const candidates = await findMusic({
    ...track,
    source: 'wy',
    meta: { ...track.meta, songId: track.meta.songId ?? track.id },
  });
  return candidates[0] ?? null;
}

/**
 * 播放链路：本地曲自动匹配在线元数据（封面等），并挂 toggleMusicInfo 供歌词/封面换源。
 */
export async function enrichLocalTrackOnlineMeta(
  track: AudioTrack,
  options?: { force?: boolean },
): Promise<AudioTrack> {
  if (track.source !== 'local') return track;
  const settings = getMusicSettings();
  if (!options?.force && settings.autoMatchLocalOnline === false) return track;

  const alreadyMatched =
    typeof track.meta.matchedOnlineId === 'string' && !!track.meta.matchedOnlineId.trim();
  if (alreadyMatched && hasCover(track) && !options?.force) {
    const stub = matchedOnlineStub(track);
    return stub ? attachToggleMusicInfo(track, stub) : track;
  }

  let online: AudioTrack | null = null;
  try {
    online = await matchLocalTrackOnline(track);
  } catch {
    return track;
  }
  if (!online) return track;

  let coverUrl = hasCover(track) ? String(track.meta.coverUrl) : '';
  let matchedCover =
    typeof online.meta.coverUrl === 'string' ? online.meta.coverUrl.trim() : '';
  if (!coverUrl || !matchedCover) {
    try {
      const { resolveOnlinePic } = await import('@/lib/media/audio/online/source-router');
      const pic = await resolveOnlinePic(online);
      if (pic?.trim()) {
        matchedCover = pic.trim();
        if (!coverUrl) coverUrl = matchedCover;
      }
    } catch {
      // ignore pic failures
    }
  }

  const enrichedBase: AudioTrack = {
    ...track,
    meta: {
      ...track.meta,
      matchedOnlineId: online.id,
      matchedSource: online.source,
      matchedSongId:
        online.meta.songId != null
          ? String(online.meta.songId)
          : online.meta.songmid != null
            ? String(online.meta.songmid)
            : undefined,
      matchedHash: online.meta.hash != null ? String(online.meta.hash) : undefined,
      ...(matchedCover ? { matchedCoverUrl: matchedCover } : {}),
      ...(coverUrl ? { coverUrl } : {}),
      ...(!track.meta.albumName && online.meta.albumName
        ? { albumName: String(online.meta.albumName) }
        : {}),
    },
  };

  const enriched = attachToggleMusicInfo(enrichedBase, {
    ...online,
    meta: {
      ...online.meta,
      ...(matchedCover ? { coverUrl: matchedCover } : {}),
    },
  });

  try {
    const { upsertAudioTrack } = await import('@/lib/database/audio-library');
    void upsertAudioTrack(enriched).catch(() => undefined);
  } catch {
    // ignore persist
  }

  return enriched;
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
