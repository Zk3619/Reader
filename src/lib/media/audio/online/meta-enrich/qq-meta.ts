/**
 * QQ 音乐仅补元数据（歌词/封面），不取播放链
 */

import type { LyricBundle } from '@/lib/media/audio/lyric-types';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import * as tx from '@/lib/media/audio/online/sources/tx';
import { findMusic } from '@/lib/media/audio/music-sdk/find-music';

async function resolveTxCandidate(track: AudioTrack): Promise<AudioTrack | null> {
  if (track.source === 'tx') return track;
  try {
    const alts = await findMusic(track);
    return alts.find((t) => t.source === 'tx') ?? null;
  } catch {
    return null;
  }
}

/** 仅用 QQ 源补歌词 */
export async function fetchQqEnrichLyric(track: AudioTrack): Promise<LyricBundle | null> {
  const candidate = await resolveTxCandidate(track);
  if (!candidate) return null;
  try {
    return await tx.txGetLyric(candidate);
  } catch {
    return null;
  }
}

/** 仅用 QQ 源补封面 URL */
export async function fetchQqEnrichPic(track: AudioTrack): Promise<string | null> {
  const candidate = await resolveTxCandidate(track);
  if (!candidate) return null;
  try {
    const { txGetPic } = await import('@/lib/media/audio/music-sdk/sources/tx/music-info');
    const url = await txGetPic(candidate);
    return url?.trim() || null;
  } catch {
    return null;
  }
}
