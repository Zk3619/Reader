/**
 * 在线歌词统一解析
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import type { LyricBundle } from '@/lib/media/audio/lyric-types';
import { hasLyricContent, pickLyricText } from '@/lib/media/audio/lyric-types';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { findMusic } from '@/lib/media/audio/music-sdk/find-music';
import * as kw from '@/lib/media/audio/online/sources/kw';
import * as wy from '@/lib/media/audio/online/sources/wy';
import * as kg from '@/lib/media/audio/online/sources/kg';
import * as tx from '@/lib/media/audio/online/sources/tx';
import * as mg from '@/lib/media/audio/online/sources/mg';
import { userApiLyric } from '@/lib/media/audio/online/user-api-engine';

async function resolveBuiltinLyric(track: AudioTrack): Promise<LyricBundle | null> {
  switch (track.source) {
    case 'kw':
      return kw.kwGetLyric(track);
    case 'wy':
      return wy.wyGetLyric(track);
    case 'kg':
      return kg.kgGetLyric(track);
    case 'tx':
      return tx.txGetLyric(track);
    case 'mg':
      return mg.mgGetLyric(track);
    case 'netease': {
      const { getNeteaseLyric } = await import('@/lib/media/audio/platform/api/netease');
      const lyric = await getNeteaseLyric(track);
      return lyric ? { lyric } : null;
    }
    default:
      return null;
  }
}

export async function resolveOnlineLyricBundle(track: AudioTrack): Promise<LyricBundle | null> {
  if (track.source === 'userApi') {
    const userApiId = track.meta.userApiId;
    if (typeof userApiId !== 'string') return null;
    const lyric = await userApiLyric(userApiId, track);
    return lyric ? { lyric } : null;
  }

  let bundle = await resolveBuiltinLyric(track);
  if (hasLyricContent(bundle)) return bundle;

  // 主源歌词失败时换平台搜同曲（默认开启；与播放换源独立）
  if (getMusicSettings().fallbackLyric !== false) {
    try {
      const others = await findMusic(track);
      for (const alt of others) {
        bundle = await resolveBuiltinLyric(alt);
        if (hasLyricContent(bundle)) return bundle;
      }
    } catch {
      // ignore
    }
  }
  return bundle;
}

export async function resolveOnlineLyricText(track: AudioTrack): Promise<string | null> {
  const bundle = await resolveOnlineLyricBundle(track);
  const kind = getMusicSettings().lyricTrack;
  return pickLyricText(bundle, kind);
}
