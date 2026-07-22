/**
 * MusicFree 媒体模型 ↔ Reader AudioTrack
 */

import {
  buildTrackId,
  formatDurationSec,
  type AudioTrack,
} from '@/lib/media/audio/track-types';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import type { LyricBundle } from '@/lib/media/audio/lyric-types';
import {
  mfSourceKey,
  type MfLyricSource,
  type MfMusicItem,
  type MfQualityKey,
  type MfSheetItem,
} from '@/lib/media/audio/online/mf-plugin/types';

const MF_TO_LX: Record<MfQualityKey, MusicQuality> = {
  low: '128k',
  standard: '320k',
  high: 'flac',
  super: 'flac24bit',
};

const LX_TO_MF: Partial<Record<MusicQuality, MfQualityKey>> = {
  '128k': 'low',
  '192k': 'standard',
  '320k': 'standard',
  flac: 'high',
  flac24bit: 'super',
  ape: 'high',
  wav: 'high',
};

export function mfQualityToLx(q: MfQualityKey): MusicQuality {
  return MF_TO_LX[q] ?? '320k';
}

export function lxQualityToMf(q: MusicQuality | string | undefined): MfQualityKey {
  if (!q) return 'standard';
  if (q === 'low' || q === 'standard' || q === 'high' || q === 'super') return q;
  return LX_TO_MF[q as MusicQuality] ?? 'standard';
}

function pickPrimaryId(item: MfMusicItem, primaryKey?: string[]): string {
  if (Array.isArray(primaryKey) && primaryKey.length > 0) {
    const parts = primaryKey
      .map((k) => {
        const v = item[k];
        return v == null ? '' : String(v);
      })
      .filter(Boolean);
    if (parts.length) return parts.join('_');
  }
  return String(item.id ?? '');
}

function qualitiesFromMfItem(item: MfMusicItem): {
  qualitys: MusicQuality[];
  _qualitys: Record<string, { size?: string | number }>;
} {
  const qualitys: MusicQuality[] = [];
  const _qualitys: Record<string, { size?: string | number }> = {};
  const src = item.qualities ?? item.source;
  if (src && typeof src === 'object') {
    for (const key of ['low', 'standard', 'high', 'super'] as MfQualityKey[]) {
      const entry = (src as Record<string, unknown>)[key];
      if (!entry) continue;
      const lx = mfQualityToLx(key);
      if (!qualitys.includes(lx)) qualitys.push(lx);
      const size =
        typeof entry === 'object' && entry && 'size' in entry
          ? (entry as { size?: string | number }).size
          : undefined;
      _qualitys[lx] = size != null ? { size } : {};
    }
  }
  if (qualitys.length === 0) {
    qualitys.push('128k', '320k');
    _qualitys['128k'] = {};
    _qualitys['320k'] = {};
  }
  return { qualitys, _qualitys };
}

/** 将 MusicFree 曲目转为 Reader AudioTrack */
export function mfMusicItemToTrack(
  item: MfMusicItem,
  pluginId: string,
  options?: { primaryKey?: string[] },
): AudioTrack {
  const songKey = pickPrimaryId(item, options?.primaryKey) || String(item.id ?? '');
  const source = mfSourceKey(pluginId);
  const { qualitys, _qualitys } = qualitiesFromMfItem(item);
  const durationSec =
    typeof item.duration === 'number' && Number.isFinite(item.duration)
      ? item.duration
      : Number(item.duration) || 0;
  const artwork =
    typeof item.artwork === 'string' && item.artwork.trim()
      ? item.artwork.trim()
      : undefined;
  const album =
    typeof item.album === 'string' && item.album.trim() ? item.album.trim() : undefined;

  return {
    id: buildTrackId(source, songKey || `unknown_${Date.now()}`),
    name: String(item.title ?? '').trim() || '未知歌曲',
    artist: String(item.artist ?? '').trim(),
    source,
    duration: formatDurationSec(durationSec),
    meta: {
      songId: String(item.id ?? songKey),
      albumName: album,
      coverUrl: artwork,
      qualitys,
      _qualitys,
      mfPluginId: pluginId,
      mfPlatform: item.platform,
      mfPrimaryKey: options?.primaryKey,
      /** 完整原始项，供 getMediaSource / getLyric 回传 */
      mfMusicItem: { ...item, platform: item.platform },
    },
  };
}

/** 从 AudioTrack 还原 MusicFree 曲目（调用插件方法前） */
export function trackToMfMusicItem(track: AudioTrack): MfMusicItem {
  const raw = track.meta.mfMusicItem;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const item = { ...(raw as MfMusicItem) };
    if (!item.platform && typeof track.meta.mfPlatform === 'string') {
      item.platform = track.meta.mfPlatform;
    }
    if (!item.id && track.meta.songId != null) {
      item.id = String(track.meta.songId);
    }
    return item;
  }
  const platform =
    (typeof track.meta.mfPlatform === 'string' && track.meta.mfPlatform) ||
    'unknown';
  return {
    id: String(track.meta.songId ?? track.id),
    platform,
    artist: track.artist,
    title: track.name,
    duration: undefined,
    album: typeof track.meta.albumName === 'string' ? track.meta.albumName : '',
    artwork: typeof track.meta.coverUrl === 'string' ? track.meta.coverUrl : '',
  };
}

export function mfLyricToBundle(lyric: MfLyricSource | null | undefined): LyricBundle | null {
  if (!lyric) return null;
  const text =
    (typeof lyric.rawLrc === 'string' && lyric.rawLrc.trim() && lyric.rawLrc) ||
    (typeof lyric.lrc === 'string' && lyric.lrc.trim() && lyric.lrc) ||
    '';
  if (!text && !(typeof lyric.translation === 'string' && lyric.translation.trim())) {
    return null;
  }
  return {
    lyric: text || undefined,
    tlyric: typeof lyric.translation === 'string' ? lyric.translation : undefined,
  };
}

export function mfSheetToSummary(
  sheet: MfSheetItem,
  pluginId: string,
): {
  id: string;
  name: string;
  author?: string;
  coverUrl?: string;
  trackCount?: number;
  desc?: string;
  source: string;
  mfPluginId: string;
  mfSheetItem: MfSheetItem;
} {
  return {
    id: String(sheet.id),
    name: String(sheet.title ?? sheet.id),
    author:
      typeof sheet.artist === 'string'
        ? sheet.artist
        : typeof sheet.createUser === 'string'
          ? sheet.createUser
          : undefined,
    coverUrl: typeof sheet.artwork === 'string' ? sheet.artwork : undefined,
    trackCount: typeof sheet.worksNum === 'number' ? sheet.worksNum : undefined,
    desc: typeof sheet.description === 'string' ? sheet.description : undefined,
    source: mfSourceKey(pluginId),
    mfPluginId: pluginId,
    mfSheetItem: sheet,
  };
}
