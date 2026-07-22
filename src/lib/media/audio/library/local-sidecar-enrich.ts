/**
 * 本地扫描后：后台补同名 .lrc / 封面 sidecar（快入库后异步 enrich）
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { upsertAudioTracks } from '@/lib/database/audio-library';
import { isTauri } from '@/lib/platform/detect';

const COVER_NAMES = ['cover.jpg', 'cover.jpeg', 'cover.png', 'folder.jpg', 'folder.png'];

function stemPath(filePath: string): { dir: string; stem: string } {
  const norm = filePath.replace(/\\/g, '/');
  const slash = norm.lastIndexOf('/');
  const file = slash >= 0 ? norm.slice(slash + 1) : norm;
  const dir = slash >= 0 ? filePath.slice(0, filePath.length - file.length) : '';
  const stem = file.replace(/\.[^.]+$/, '');
  return { dir, stem };
}

async function tryReadText(path: string): Promise<string | null> {
  try {
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const text = await readTextFile(path);
    return text?.trim() ? text : null;
  } catch {
    return null;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    const { exists } = await import('@tauri-apps/plugin-fs');
    return await exists(path);
  } catch {
    return false;
  }
}

async function convertFileSrcSafe(path: string): Promise<string | null> {
  try {
    const { convertFileSrc } = await import('@tauri-apps/api/core');
    return convertFileSrc(path);
  } catch {
    return null;
  }
}

/** 单曲 sidecar：同目录 `{stem}.lrc` + cover.* / `{stem}.jpg` */
export async function enrichLocalTrackSidecar(track: AudioTrack): Promise<AudioTrack> {
  if (!isTauri()) return track;
  const filePath = String(track.meta.filePath ?? '').trim();
  if (!filePath || filePath.startsWith('content://') || filePath.startsWith('blob:')) {
    return track;
  }

  const { dir, stem } = stemPath(filePath);
  if (!dir || !stem) return track;

  let lyricText = typeof track.meta.lyricText === 'string' ? track.meta.lyricText : undefined;
  let coverUrl = typeof track.meta.coverUrl === 'string' ? track.meta.coverUrl : undefined;
  let changed = false;

  if (!lyricText?.trim()) {
    const lrcPath = `${dir}${stem}.lrc`;
    const text = await tryReadText(lrcPath);
    if (text) {
      lyricText = text;
      changed = true;
    }
  }

  if (!coverUrl?.trim()) {
    const candidates = [
      `${dir}${stem}.jpg`,
      `${dir}${stem}.jpeg`,
      `${dir}${stem}.png`,
      ...COVER_NAMES.map((n) => `${dir}${n}`),
    ];
    for (const p of candidates) {
      if (!(await pathExists(p))) continue;
      const src = await convertFileSrcSafe(p);
      if (src) {
        coverUrl = src;
        changed = true;
        break;
      }
    }
  }

  if (!changed) return track;
  return {
    ...track,
    meta: {
      ...track.meta,
      lyricText,
      coverUrl,
      sidecarEnrichedAt: Date.now(),
    },
  };
}

/**
 * 后台批量补全；不阻塞扫描返回。
 * concurrency 默认 4。
 */
export function scheduleLocalSidecarEnrich(
  tracks: AudioTrack[],
  options?: { concurrency?: number },
): void {
  if (!isTauri() || tracks.length === 0) return;
  const concurrency = Math.max(1, Math.min(8, options?.concurrency ?? 4));
  let i = 0;
  const run = async () => {
    const batch: AudioTrack[] = [];
    while (i < tracks.length) {
      const start = i;
      i += 1;
      const track = tracks[start];
      if (!track) continue;
      try {
        const next = await enrichLocalTrackSidecar(track);
        if (next !== track) batch.push(next);
      } catch {
        // ignore single failure
      }
      if (batch.length >= 20) {
        await upsertAudioTracks(batch.splice(0, batch.length)).catch(() => undefined);
      }
    }
    if (batch.length) {
      await upsertAudioTracks(batch).catch(() => undefined);
    }
  };
  const workers = Array.from({ length: concurrency }, () => run());
  void Promise.all(workers);
}
