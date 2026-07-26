/**
 * 影视边播边缓存（不替换 / 不阻塞 Artplayer 播放）
 * - 直链 MP4 等：经 proxy URL 流式写入 video.bin
 * - VOD m3u8（含 #EXT-X-ENDLIST）：下分片到 hls/ + 本地 index.m3u8
 * - 直播 m3u8（无 ENDLIST）：跳过
 */

import { join } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-fs';
import { isTauri } from '@/lib/platform/detect';
import { getFileSystem } from '@/lib/platform/filesystem';
import {
  buildVideoEpisodeCacheId,
  finalizeVideoEpisodeCacheMeta,
  getCachedVideoEpisode,
  isHlsMediaUrl,
  resolveVideoEpisodeCacheDir,
  resolveVideoEpisodeCacheHit,
  type VideoEpisodeCacheMeta,
} from '@/lib/media/video/cache/video-disk-cache';
import { normalizeVideoCacheTier, type VideoCacheTier } from '@/lib/media/video/cache/video-cache-tier';

export type VideoProgressiveCacheHandle = {
  id: string;
  abort: () => void;
  /** 完成后的本地路径（直链 bin 或 hls/index.m3u8） */
  whenComplete: Promise<string | null>;
};

type StartOpts = {
  title: string;
  episodeUrl: string;
  /** 上游原始地址（用于 cache key） */
  mediaUrl: string;
  /** 实际拉取地址：优先已 wrap 的 proxy URL（ACAO + Range） */
  fetchUrl: string;
  headers?: Record<string, string>;
  bgmId?: number;
  tier?: VideoCacheTier;
  isLive?: boolean;
};

const inflight = new Map<string, VideoProgressiveCacheHandle>();
/** mediaUrl → cache id，供 seek 缩略图查找进行中的任务 */
const inflightByMediaUrl = new Map<string, string>();

/** 当前会话可用于 SpriteStore 的 seek 源（proxy 直链或已完成本地路径） */
let activeSeekSource = '';

export function getActiveVideoSeekThumbSource(): string {
  return activeSeekSource;
}

export function setActiveVideoSeekThumbSource(urlOrPath: string): void {
  activeSeekSource = (urlOrPath || '').trim();
}

export function clearActiveVideoSeekThumbSource(): void {
  activeSeekSource = '';
}

export function abortAllVideoProgressiveCaches(): void {
  for (const h of inflight.values()) h.abort();
  inflight.clear();
  inflightByMediaUrl.clear();
}

/** 边播边缓存进行中的任务（seek 缩略图可优先等落盘） */
export function getInflightVideoProgressiveCache(
  mediaUrl: string,
): VideoProgressiveCacheHandle | null {
  const id = inflightByMediaUrl.get(mediaUrl.trim());
  if (!id) return null;
  return inflight.get(id) ?? null;
}

function looksLikeMasterPlaylist(text: string): boolean {
  return /#EXT-X-STREAM-INF/i.test(text);
}

function hasEndList(text: string): boolean {
  return /#EXT-X-ENDLIST/i.test(text);
}

function resolvePlaylistUrl(base: string, ref: string): string {
  try {
    return new URL(ref, base).toString();
  } catch {
    return ref;
  }
}

async function fetchText(url: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function pickMediaPlaylist(
  masterUrl: string,
  text: string,
  signal: AbortSignal,
): Promise<{ url: string; text: string }> {
  if (!looksLikeMasterPlaylist(text)) return { url: masterUrl, text };
  const lines = text.split(/\r?\n/);
  let chosen = '';
  for (let i = 0; i < lines.length; i++) {
    if (/#EXT-X-STREAM-INF/i.test(lines[i] || '')) {
      const next = (lines[i + 1] || '').trim();
      if (next && !next.startsWith('#')) {
        chosen = resolvePlaylistUrl(masterUrl, next);
        break;
      }
    }
  }
  if (!chosen) throw new Error('master playlist has no variant');
  const body = await fetchText(chosen, signal);
  return { url: chosen, text: body };
}

async function streamUrlToFile(
  url: string,
  destPath: string,
  signal: AbortSignal,
): Promise<{ bytes: number; mime: string }> {
  const res = await fetch(url, { signal, mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const mime = res.headers.get('content-type') || 'application/octet-stream';
  const body = res.body;
  if (!body) {
    const buf = await res.arrayBuffer();
    const fs = await getFileSystem();
    await fs.writeFile(destPath, buf);
    return { bytes: buf.byteLength, mime };
  }
  const file = await open(destPath, { write: true, create: true, truncate: true });
  let bytes = 0;
  try {
    const reader = body.getReader();
    for (; ;) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.byteLength) {
        await file.write(value);
        bytes += value.byteLength;
      }
    }
  } finally {
    await file.close();
  }
  return { bytes, mime };
}

async function cacheProgressiveFile(
  opts: StartOpts,
  id: string,
  signal: AbortSignal,
): Promise<string | null> {
  const existing = await getCachedVideoEpisode(id);
  if (existing?.meta.hasMedia && existing.localPath) {
    return existing.localPath;
  }
  const dir = await resolveVideoEpisodeCacheDir(id);
  const fs = await getFileSystem();
  await fs.mkdir(dir, true);
  const binPath = await join(dir, 'video.bin');
  const { bytes, mime } = await streamUrlToFile(
    opts.fetchUrl,
    binPath,
    signal,
  );
  const meta: VideoEpisodeCacheMeta = {
    id,
    bgmId: opts.bgmId,
    title: opts.title,
    episodeUrl: opts.episodeUrl,
    mediaUrl: opts.mediaUrl,
    savedAt: Date.now(),
    byteSize: bytes,
    localPath: binPath,
    cacheTier: normalizeVideoCacheTier(opts.tier ?? 'auto'),
    mime,
    isHls: false,
    hasMedia: true,
  };
  await finalizeVideoEpisodeCacheMeta(meta);
  return binPath;
}

async function cacheVodHls(
  opts: StartOpts,
  id: string,
  signal: AbortSignal,
): Promise<string | null> {
  const existing = await getCachedVideoEpisode(id);
  if (existing?.meta.hasMedia && existing.localPath) {
    return existing.localPath;
  }
  const dir = await resolveVideoEpisodeCacheDir(id);
  const hlsDir = await join(dir, 'hls');
  const fs = await getFileSystem();
  await fs.mkdir(hlsDir, true);

  const rootText = await fetchText(opts.fetchUrl, signal);
  const media = await pickMediaPlaylist(opts.fetchUrl, rootText, signal);
  if (!hasEndList(media.text)) {
    // 直播：只记 meta
    await finalizeVideoEpisodeCacheMeta({
      id,
      bgmId: opts.bgmId,
      title: opts.title,
      episodeUrl: opts.episodeUrl,
      mediaUrl: opts.mediaUrl,
      savedAt: Date.now(),
      byteSize: 0,
      cacheTier: normalizeVideoCacheTier(opts.tier ?? 'auto'),
      isHls: true,
      hasMedia: false,
    });
    return null;
  }

  const lines = media.text.split(/\r?\n/);
  const outLines: string[] = [];
  let segIndex = 0;
  let totalBytes = 0;

  for (let i = 0; i < lines.length; i++) {
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      outLines.push(line);
      continue;
    }
    const segUrl = resolvePlaylistUrl(media.url, trimmed);
    // 分片若为绝对外链，尽量仍走当前 fetch 基址的同源策略：直接 fetch segUrl
    // （playlist 已由 proxy 改写时，seg 也是 proxy URL）
    const name = `seg_${String(segIndex).padStart(5, '0')}.ts`;
    const dest = await join(hlsDir, name);
    const { bytes } = await streamUrlToFile(segUrl, dest, signal);
    totalBytes += bytes;
    outLines.push(name);
    segIndex += 1;
  }

  const indexPath = await join(hlsDir, 'index.m3u8');
  await fs.writeTextFile(indexPath, outLines.join('\n'));
  const meta: VideoEpisodeCacheMeta = {
    id,
    bgmId: opts.bgmId,
    title: opts.title,
    episodeUrl: opts.episodeUrl,
    mediaUrl: opts.mediaUrl,
    savedAt: Date.now(),
    byteSize: totalBytes,
    localPath: indexPath,
    cacheTier: normalizeVideoCacheTier(opts.tier ?? 'auto'),
    mime: 'application/vnd.apple.mpegurl',
    isHls: true,
    hasMedia: true,
  };
  await finalizeVideoEpisodeCacheMeta(meta);
  return indexPath;
}

/**
 * 起播后调用：后台缓存，立即返回。
 * 播放继续用原 Artplayer URL，互不影响。
 */
export function startVideoProgressiveCache(opts: StartOpts): VideoProgressiveCacheHandle | null {
  if (!isTauri() || opts.isLive) return null;
  const mediaUrl = opts.mediaUrl.trim();
  const fetchUrl = (opts.fetchUrl || mediaUrl).trim();
  if (!mediaUrl || !fetchUrl) return null;
  if (!/^https?:\/\//i.test(fetchUrl) && !/^https?:\/\//i.test(mediaUrl)) {
    return null;
  }

  const preferredId = buildVideoEpisodeCacheId(opts.bgmId, opts.episodeUrl, mediaUrl);
  const existingInflight =
    inflight.get(preferredId) ||
    (inflightByMediaUrl.get(mediaUrl)
      ? inflight.get(inflightByMediaUrl.get(mediaUrl)!)
      : undefined);
  if (existingInflight) return existingInflight;

  const ac = new AbortController();
  const isHls =
    isHlsMediaUrl(mediaUrl) ||
    isHlsMediaUrl(fetchUrl) ||
    /[?&]do=m3u8\b/i.test(fetchUrl) ||
    /m3u8/i.test(fetchUrl);

  // 直链：立刻允许用 proxy URL 做 SpriteStore（与播放并行）
  if (!isHls && /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/i.test(fetchUrl)) {
    setActiveVideoSeekThumbSource(fetchUrl);
  }

  const whenComplete = (async () => {
    let id = preferredId;
    try {
      const hit = await resolveVideoEpisodeCacheHit({
        bgmId: opts.bgmId,
        episodeUrl: opts.episodeUrl,
        mediaUrl,
      });
      if (hit?.meta.hasMedia && hit.localPath) {
        // 复用旧目录 id，避免同一集因签名 URL 再开新目录
        id = hit.id;
        setActiveVideoSeekThumbSource(hit.localPath);
        return hit.localPath;
      }
      const path = isHls
        ? await cacheVodHls(opts, id, ac.signal)
        : await cacheProgressiveFile(opts, id, ac.signal);
      if (path) setActiveVideoSeekThumbSource(path);
      return path;
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return null;
      console.warn('[video-progressive-cache]', e);
      return null;
    } finally {
      inflight.delete(id);
      inflight.delete(preferredId);
      inflightByMediaUrl.delete(mediaUrl);
    }
  })();

  const handle: VideoProgressiveCacheHandle = {
    id: preferredId,
    abort: () => ac.abort(),
    whenComplete,
  };
  inflight.set(preferredId, handle);
  inflightByMediaUrl.set(mediaUrl, preferredId);
  return handle;
}
