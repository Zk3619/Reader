/**
 * MusicFree 形态内置 local-plugin（平台名「本地」）
 * 对齐 MusicFreeDesktop-master internal-plugins/local-plugin
 */

import { convertFileSrc } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/platform/detect';
import type { MfPluginDefine, MfMusicItem } from '@/lib/media/audio/online/mf-plugin/types';
import type { AudioTrack } from '@/lib/media/audio/track-types';

export const MF_LOCAL_PLUGIN_ID = 'local';
export const MF_LOCAL_PLUGIN_NAME = '本地';
export const MF_LOCAL_PLUGIN_HASH = '本地';

function addFileScheme(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  if (/^(https?:|blob:|data:|file:|asset:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('content://') || trimmed.startsWith('opfs:')) return trimmed;
  if (isTauri()) {
    try {
      return convertFileSrc(trimmed);
    } catch {
      return trimmed.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(trimmed)
        ? `file://${trimmed.replace(/\\/g, '/')}`
        : trimmed;
    }
  }
  return trimmed;
}

function durationSec(track: AudioTrack): number | undefined {
  const raw = track.duration;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.includes(':')) {
    const parts = raw.split(':').map((p) => Number(p));
    if (parts.every((n) => Number.isFinite(n))) {
      if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
      if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
    }
  }
  return undefined;
}

export function audioTrackToLocalMfItem(track: AudioTrack): MfMusicItem {
  const filePath =
    (typeof track.meta.filePath === 'string' && track.meta.filePath) ||
    (typeof track.meta.androidUri === 'string' && track.meta.androidUri) ||
    '';
  return {
    id: String(track.meta.songId ?? track.id),
    platform: MF_LOCAL_PLUGIN_NAME,
    title: track.name,
    artist: track.artist,
    album: typeof track.meta.albumName === 'string' ? track.meta.albumName : '',
    artwork: typeof track.meta.coverUrl === 'string' ? track.meta.coverUrl : '',
    url: filePath,
    duration: durationSec(track),
    rawLrc: typeof track.meta.rawLrc === 'string' ? track.meta.rawLrc : undefined,
  };
}

export function createLocalPluginDefine(): MfPluginDefine {
  return {
    platform: MF_LOCAL_PLUGIN_NAME,
    version: '1.0.0',
    description: 'Reader 内置本地音乐插件（MusicFree 形态）',
    author: 'Reader',
    cacheControl: 'no-cache',
    async getMediaSource(musicItem) {
      const rawUrl = String(musicItem.url ?? '').trim();
      if (!rawUrl) return null;
      if (/^(https?:|blob:|data:)/i.test(rawUrl)) {
        return { url: rawUrl };
      }
      // 托管路径 / 绝对路径：经 local-resolver 物化为可播放 URL
      try {
        const { resolveLocalTrackUrlAsync } = await import(
          '@/lib/media/audio/library/local-resolver'
        );
        const synthetic: AudioTrack = {
          id: String(musicItem.id || 'local'),
          name: String(musicItem.title ?? ''),
          artist: String(musicItem.artist ?? ''),
          source: `mf:${MF_LOCAL_PLUGIN_ID}`,
          duration: '0:00',
          meta: {
            filePath: rawUrl,
            songId: String(musicItem.id ?? ''),
          },
        };
        const resolved = await resolveLocalTrackUrlAsync(synthetic);
        if (resolved.url) return { url: resolved.url };
      } catch {
        // fall through
      }
      return { url: addFileScheme(rawUrl) };
    },
    async getLyric(musicItem) {
      const raw =
        musicItem.rawLrc ||
        musicItem.lrc ||
        (typeof musicItem.lyric === 'object' && musicItem.lyric
          ? musicItem.lyric.rawLrc || musicItem.lyric.lrc
          : undefined);
      if (!raw) return null;
      return { rawLrc: String(raw) };
    },
    async importMusicItem(filePath) {
      const path = String(filePath ?? '').trim();
      if (!path) return null;
      const { importLocalFilesToLibrary } = await import(
        '@/lib/media/audio/library/playlist-store'
      );
      const tracks = await importLocalFilesToLibrary([path]);
      const track = tracks[0];
      return track ? audioTrackToLocalMfItem(track) : null;
    },
    async importMusicSheet(folderPath) {
      const path = String(folderPath ?? '').trim();
      if (!path) return null;
      const { scanAndImportDirectory } = await import(
        '@/lib/media/audio/library/playlist-store'
      );
      const tracks = await scanAndImportDirectory(path);
      return tracks.map(audioTrackToLocalMfItem);
    },
  };
}
