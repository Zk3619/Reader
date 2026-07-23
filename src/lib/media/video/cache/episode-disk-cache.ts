/**
 * 番剧/影视剧集磁盘缓存（轻量；直链整文件）
 */

import { isTauri } from '@/lib/platform/detect';
import { resolveModuleMediaRoot } from '@/lib/media/media-root';
import { getFileSystem } from '@/lib/platform/filesystem';

const SUBDIR = 'video-episode-cache';

export type EpisodeCacheMeta = {
  id: string;
  bgmId?: number;
  title: string;
  episodeUrl: string;
  mediaUrl: string;
  savedAt: number;
  byteSize: number;
  localPath?: string;
};

function cacheId(bgmId: number | undefined, episodeUrl: string, mediaUrl: string): string {
  const raw = `${bgmId ?? 0}|${episodeUrl}|${mediaUrl}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) | 0;
  return `ep_${Math.abs(h).toString(16)}`;
}

async function rootDir(): Promise<string> {
  const base = await resolveModuleMediaRoot('video');
  return `${base.replace(/[/\\]$/, '')}/${SUBDIR}`;
}

/** 尽力缓存直链；HLS 仅记录 meta（完整分片下载延期） */
export async function cacheBangumiEpisode(input: {
  bgmId?: number;
  title: string;
  episodeUrl: string;
  mediaUrl: string;
}): Promise<EpisodeCacheMeta | null> {
  if (!isTauri()) return null;
  const id = cacheId(input.bgmId, input.episodeUrl, input.mediaUrl);
  const mediaUrl = input.mediaUrl.trim();
  const isHls = /\.m3u8(\?|$)/i.test(mediaUrl);
  const meta: EpisodeCacheMeta = {
    id,
    bgmId: input.bgmId,
    title: input.title,
    episodeUrl: input.episodeUrl,
    mediaUrl,
    savedAt: Date.now(),
    byteSize: 0,
  };
  try {
    const fs = await getFileSystem();
    const root = await rootDir();
    await fs.mkdir(root, true);
    const metaPath = `${root}/${id}.json`;
    if (isHls) {
      await fs.writeTextFile(metaPath, JSON.stringify(meta, null, 2));
      return meta;
    }
    if (!/^https?:\/\//i.test(mediaUrl)) {
      meta.localPath = mediaUrl;
      await fs.writeTextFile(metaPath, JSON.stringify(meta, null, 2));
      return meta;
    }
    const res = await fetch(mediaUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const binPath = `${root}/${id}.bin`;
    await fs.writeFile(binPath, buf);
    meta.byteSize = buf.byteLength;
    meta.localPath = binPath;
    await fs.writeTextFile(metaPath, JSON.stringify(meta, null, 2));
    return meta;
  } catch (e) {
    console.warn('[episode-cache]', e);
    return null;
  }
}

export async function listEpisodeCache(): Promise<EpisodeCacheMeta[]> {
  if (!isTauri()) return [];
  try {
    const fs = await getFileSystem();
    const root = await rootDir();
    const entries = await fs.readDir(root);
    const out: EpisodeCacheMeta[] = [];
    for (const name of entries || []) {
      if (!name.endsWith('.json')) continue;
      try {
        const text = await fs.readTextFile(`${root}/${name}`);
        out.push(JSON.parse(text) as EpisodeCacheMeta);
      } catch {
        /* */
      }
    }
    return out.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function exportEpisodeCacheManifest(): Promise<string> {
  const list = await listEpisodeCache();
  return JSON.stringify({ version: 1, items: list }, null, 2);
}

export async function clearEpisodeCache(): Promise<number> {
  if (!isTauri()) return 0;
  try {
    const fs = await getFileSystem();
    const root = await rootDir();
    const entries = await fs.readDir(root);
    let n = 0;
    for (const name of entries || []) {
      if (!name) continue;
      try {
        await fs.remove(`${root}/${name}`);
        n += 1;
      } catch {
        /* */
      }
    }
    return n;
  } catch {
    return 0;
  }
}
