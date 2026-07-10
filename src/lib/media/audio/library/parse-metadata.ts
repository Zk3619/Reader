/**
 * 本地音频元数据解析（music-metadata）
 */

import { parseBlob, parseBuffer } from 'music-metadata';
import type { AudioTrack, AudioTrackMeta } from '@/lib/media/audio/track-types';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import { extFromFileName } from '@/lib/media/audio/library/music-file-filter';
import { isTauri } from '@/lib/platform/detect';
import { readFile } from '@tauri-apps/plugin-fs';

export async function parseLocalFileMetadata(
  filePath: string,
  file?: File,
): Promise<AudioTrack> {
  const ext = extFromFileName(filePath);
  let title = filePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') ?? '未知';
  let artist = '未知艺术家';
  let albumName = '';
  let duration = '00:00';
  let coverUrl: string | undefined;
  let lyricText: string | undefined;

  try {
    if (file) {
      const meta = await parseBlob(file);
      title = meta.common.title ?? title;
      artist = meta.common.artist ?? meta.common.artists?.join('、') ?? artist;
      albumName = meta.common.album ?? '';
      if (meta.format.duration != null) {
        duration = formatDurationSec(meta.format.duration);
      }
      const pic = meta.common.picture?.[0];
      if (pic?.data) {
        const blob = new Blob([pic.data], { type: pic.format });
        coverUrl = URL.createObjectURL(blob);
      }
    } else if (isTauri()) {
      const bytes = await readFile(filePath);
      const meta = await parseBuffer(bytes);
      title = meta.common.title ?? title;
      artist = meta.common.artist ?? meta.common.artists?.join('、') ?? artist;
      albumName = meta.common.album ?? '';
      if (meta.format.duration != null) {
        duration = formatDurationSec(meta.format.duration);
      }
    }
  } catch (e) {
    console.warn('[audio-meta] parse failed', filePath, e);
  }

  const metaObj: AudioTrackMeta = {
    filePath,
    ext,
    albumName,
    coverUrl,
    lyricText,
  };

  return {
    id: buildTrackId('local', filePath),
    name: title,
    artist,
    source: 'local',
    duration,
    meta: metaObj,
  };
}

export async function parseLocalFilesMetadata(
  paths: string[],
  onBatch?: (done: number, total: number) => void,
): Promise<AudioTrack[]> {
  const tracks: AudioTrack[] = [];
  for (let i = 0; i < paths.length; i++) {
    tracks.push(await parseLocalFileMetadata(paths[i]!));
    onBatch?.(i + 1, paths.length);
  }
  return tracks;
}
