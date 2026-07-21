/**
 * 音乐下载队列 — 对齐 LX：waiting/run/pause/error/completed、字节进度、暂停续传、磁盘同名跳过、manual 缓存
 */

import { getDatabase } from '@/lib/database/database-core';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { cacheMusicTrackAudio, getCachedMusicTrackByTrackId } from '@/lib/media/audio/audio-disk-cache';
import {
  consumeLastUserApiError,
  resolveTrackPlaybackUrls,
} from '@/lib/media/audio/online/online-resolver';
import { getPlayQuality } from '@/lib/media/audio/music-quality';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import { request, isAbortError } from '@/lib/http';
import { isTauri } from '@/lib/platform/detect';
import { resolveOnlineLyricFull, searchSourceLabel } from '@/lib/media/audio/online/source-router';
import { convertChineseText } from '@/lib/replace-rules/chinese-converter';
import { embedDownloadAudioTags } from '@/lib/media/audio/music-download-tags';
import {
  buildLyrics,
  encodeLyricFileBytes,
} from '@/lib/media/audio/download-lrc-tool';
import { pickLyricText } from '@/lib/media/audio/lyric-types';
import { formatMusicUrlError } from '@/lib/media/audio/music-playback-status';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import { getToggleMusicInfo } from '@/lib/media/audio/track-toggle';
import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import { resolveModuleDownloadDirectory } from '@/lib/media/media-root';

const downloadTaskListeners = new Set<() => void>();
let downloadNotifyTimer: ReturnType<typeof setTimeout> | null = null;

/** 下载任务变更订阅（入队 / 进度 / 状态）；节流避免进度狂刷 */
export function subscribeDownloadTasks(listener: () => void): () => void {
  downloadTaskListeners.add(listener);
  return () => downloadTaskListeners.delete(listener);
}

function notifyDownloadTasksChanged(): void {
  if (downloadNotifyTimer != null) return;
  downloadNotifyTimer = setTimeout(() => {
    downloadNotifyTimer = null;
    for (const listener of downloadTaskListeners) {
      try {
        listener();
      } catch {
        /* ignore */
      }
    }
  }, 120);
}

/** 默认下载目录：模块媒体目录下的 Download；非 Tauri 返回空串 */
export async function resolveDefaultDownloadDirectory(): Promise<string> {
  if (!isTauri()) return '';
  try {
    return await resolveModuleDownloadDirectory('music');
  } catch {
    return '';
  }
}

/**
 * 确保模块 Download 目录存在。
 * @returns 实际可用的下载目录（可能仍为空：非 Tauri / 解析失败）
 */
export async function ensureDownloadTargetDirectory(): Promise<string> {
  const directory = (await resolveDefaultDownloadDirectory()).trim();
  if (directory && isTauri()) {
    try {
      const { mkdir } = await import('@tauri-apps/plugin-fs');
      await mkdir(directory, { recursive: true });
    } catch {
      /* ignore */
    }
  }
  return directory;
}

function mimeToExt(mime: string): string {
  return extensionFromResponse('', mime);
}

export interface DownloadTaskMeta {
  toggled?: boolean;
  actualQuality?: string;
  fromCache?: boolean;
  cacheTier?: string;
  toggleMusicInfo?: {
    id: string;
    source: string;
    name: string;
    artist: string;
  };
}

function parseTaskMeta(raw: unknown): DownloadTaskMeta {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as DownloadTaskMeta;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function serializeTaskMeta(meta: DownloadTaskMeta): string {
  return JSON.stringify(meta);
}

function summarizeToggleTrack(track: AudioTrack): DownloadTaskMeta['toggleMusicInfo'] {
  return {
    id: track.id,
    source: String(track.source),
    name: track.name,
    artist: track.artist,
  };
}

function buildSourceCommentLabel(
  resolvedSource: string,
  toggled: boolean,
  fromCache: boolean,
): string {
  if (fromCache) return '播放缓存';
  const label = searchSourceLabel(resolvedSource as AudioTrackSource);
  return toggled ? `${label}（换源）` : label;
}

async function findCompletedTaskId(
  trackId: string,
  quality: string,
): Promise<string | null> {
  const db = await getDatabase();
  const rows = await db.select<{ id: string }>(
    `SELECT id FROM audio_download_tasks
     WHERE track_id = ? AND quality = ? AND status = 'completed'
     ORDER BY updated_at DESC LIMIT 1`,
    [trackId, quality],
  );
  return rows[0]?.id ?? null;
}

async function resolvePlaybackCacheForDownload(
  track: AudioTrack,
): Promise<{ bytes: Uint8Array; mime: string; quality?: string; cacheTier?: string } | null> {
  let cached = await getCachedMusicTrackByTrackId(track.id);
  if (!cached) {
    const toggle = getToggleMusicInfo(track);
    if (toggle?.id) cached = await getCachedMusicTrackByTrackId(toggle.id);
  }
  if (!cached?.bytes?.byteLength) return null;
  let quality: string | undefined;
  try {
    const db = await getDatabase();
    const rows = await db.select<{ cache_quality: string | null }>(
      'SELECT cache_quality FROM audio_tracks WHERE id = ? LIMIT 1',
      [track.id],
    );
    const q = rows[0]?.cache_quality;
    if (typeof q === 'string' && q.trim()) quality = q.trim();
  } catch {
    /* ignore */
  }
  return {
    bytes: new Uint8Array(cached.bytes),
    mime: cached.mime || 'audio/mpeg',
    quality,
    cacheTier: cached.cacheTier,
  };
}

function formatDownloadError(err: unknown): string {
  const apiErr = consumeLastUserApiError();
  if (apiErr) return formatMusicUrlError(apiErr);
  if (err instanceof Error) {
    const msg = err.message.trim();
    if (/HTTP\s*\d|下载失败|Failed to fetch|Network/i.test(msg)) {
      return toUserFacingMusicError(err, '网络错误，请检查连接后重试');
    }
    return formatMusicUrlError(err);
  }
  return toUserFacingMusicError(err, '下载失败');
}

function maxConcurrent(): number {
  return getMusicSettings().downloadConcurrent || 2;
}

function downloadQuality(): MusicQuality {
  return getMusicSettings().downloadQuality ?? getPlayQuality();
}

export function formatDownloadFileName(track: AudioTrack, quality = downloadQuality()): string {
  const tpl = getMusicSettings().downloadFileNameTemplate ?? '{artist}-{name}';
  const safe = (s: string) => s.replace(/[<>:"/\\|?*]/g, '_').trim();
  const rendered = tpl
    .replace(/\{artist\}/g, safe(track.artist))
    .replace(/\{name\}/g, safe(track.name))
    .replace(/\{source\}/g, safe(String(track.source)))
    .replace(/\{quality\}/g, quality)
    .replace(/\{album\}/g, safe(String(track.meta.album ?? track.meta.albumName ?? '')));
  return safe(rendered) || track.id;
}

function extensionFromResponse(url: string, contentType: string | null): string {
  const mime = contentType?.split(';')[0]?.trim().toLowerCase();
  const byMime: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/flac': 'flac',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/aac': 'aac',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg',
  };
  if (mime && byMime[mime]) return byMime[mime];
  return url.match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i)?.[1]?.toLowerCase() ?? 'mp3';
}

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    wav: 'audio/wav',
    aac: 'audio/aac',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
  };
  return map[ext.toLowerCase()] ?? 'audio/mpeg';
}

async function joinDownloadPath(
  directory: string,
  folder: string,
  fileName: string,
): Promise<string> {
  const { join } = await import('@tauri-apps/api/path');
  const targetDir = folder ? await join(directory, folder) : directory;
  return join(targetDir, fileName);
}

async function fileExists(path: string): Promise<boolean> {
  if (!isTauri() || !path) return false;
  const { exists } = await import('@tauri-apps/plugin-fs');
  return exists(path);
}

async function readPartialBytes(path: string): Promise<Uint8Array | null> {
  if (!(await fileExists(path))) return null;
  const { readFile } = await import('@tauri-apps/plugin-fs');
  return readFile(path);
}

async function writeDownloadedFile(
  directory: string,
  folder: string,
  fileName: string,
  bytes: Uint8Array,
): Promise<string> {
  if (isTauri() && directory.trim()) {
    const [{ mkdir, writeFile }, { join }] = await Promise.all([
      import('@tauri-apps/plugin-fs'),
      import('@tauri-apps/api/path'),
    ]);
    const targetDir = folder ? await join(directory, folder) : directory;
    await mkdir(targetDir, { recursive: true });
    const path = await join(targetDir, fileName);
    await writeFile(path, bytes);
    return path;
  }
  const blob = new Blob([bytes]);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
  return fileName;
}

async function removeFileQuiet(path: string | undefined): Promise<void> {
  if (!path || !isTauri()) return;
  try {
    const { remove, exists } = await import('@tauri-apps/plugin-fs');
    if (await exists(path)) await remove(path);
  } catch {
    /* ignore */
  }
}

export type DownloadTaskStatus = 'waiting' | 'run' | 'pause' | 'error' | 'completed';

export interface AudioDownloadTask {
  id: string;
  trackId: string;
  trackName: string;
  status: DownloadTaskStatus;
  /** 0–1 派生进度 */
  progress: number;
  progressDownloaded: number;
  progressTotal: number;
  statusText: string;
  quality: string;
  ext: string;
  fileName: string;
  position: number;
  sourceUrl: string;
  localPath?: string;
  error?: string;
  resolvedSource?: string;
  taskMeta?: DownloadTaskMeta;
  createdAt: number;
  updatedAt: number;
}

const activeAbortControllers = new Map<string, AbortController>();
let activeDownloads = 0;

function queuedTaskOptions(sourceUrl: string): {
  playlistName: string;
  quality?: MusicQuality;
} {
  if (sourceUrl.startsWith('queue:')) {
    try {
      const parsed = JSON.parse(decodeURIComponent(sourceUrl.slice('queue:'.length))) as {
        playlistName?: unknown;
        quality?: unknown;
      };
      return {
        playlistName: typeof parsed.playlistName === 'string' ? parsed.playlistName : '',
        quality:
          typeof parsed.quality === 'string' ? (parsed.quality as MusicQuality) : undefined,
      };
    } catch {
      return { playlistName: '' };
    }
  }
  return {
    playlistName: sourceUrl.startsWith('playlist:')
      ? decodeURIComponent(sourceUrl.slice('playlist:'.length))
      : '',
  };
}

function normalizeStatus(raw: string): DownloadTaskStatus {
  switch (raw) {
    case 'waiting':
    case 'run':
    case 'pause':
    case 'error':
    case 'completed':
      return raw;
    case 'pending':
      return 'waiting';
    case 'downloading':
      return 'run';
    case 'failed':
      return 'error';
    default:
      return 'waiting';
  }
}

function rowToTask(row: Record<string, unknown>): AudioDownloadTask {
  const downloaded = Number(row.progress_downloaded ?? 0);
  const total = Number(row.progress_total ?? 0);
  const legacyProgress = Number(row.progress ?? 0);
  const progress =
    total > 0 ? Math.min(1, downloaded / total) : Number.isFinite(legacyProgress) ? legacyProgress : 0;
  return {
    id: String(row.id),
    trackId: String(row.track_id),
    trackName: String(row.track_name ?? ''),
    status: normalizeStatus(String(row.status ?? 'waiting')),
    progress,
    progressDownloaded: downloaded,
    progressTotal: total,
    statusText: String(row.status_text ?? ''),
    quality: String(row.quality ?? ''),
    ext: String(row.ext ?? 'mp3'),
    fileName: String(row.file_name ?? ''),
    position: Number(row.position ?? 0),
    sourceUrl: String(row.source_url ?? ''),
    localPath: row.local_path ? String(row.local_path) : undefined,
    error: row.error ? String(row.error) : undefined,
    resolvedSource: row.resolved_source ? String(row.resolved_source) : undefined,
    taskMeta: parseTaskMeta(row.task_meta),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function listDownloadTasks(): Promise<AudioDownloadTask[]> {
  await reconcileMissingCompletedDownloads();
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM audio_download_tasks ORDER BY position ASC, created_at DESC',
  );
  return rows.map(rowToTask);
}

async function listDownloadTasksRaw(): Promise<AudioDownloadTask[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM audio_download_tasks ORDER BY position ASC, created_at DESC',
  );
  return rows.map(rowToTask);
}

/**
 * 已完成但本地下载文件已不存在的任务：硬删记录并清除「已下载」标记。
 * 仅 Tauri 路径文件；Web blob 不校验。
 */
export async function reconcileMissingCompletedDownloads(): Promise<number> {
  if (!isTauri()) return 0;
  const tasks = await listDownloadTasksRaw();
  let removed = 0;
  for (const task of tasks) {
    if (task.status !== 'completed') continue;
    const path = task.localPath?.trim() ?? '';
    const missing =
      !path ||
      path.endsWith('.part') ||
      path.startsWith('blob:') ||
      !(await fileExists(path));
    if (!missing) continue;
    await deleteDownloadTask(task.id, { deleteFile: false, fromReconcile: true });
    removed += 1;
  }
  return removed;
}

type TaskPatch = Partial<{
  status: DownloadTaskStatus;
  progress: number;
  progressDownloaded: number;
  progressTotal: number;
  statusText: string;
  quality: string;
  ext: string;
  fileName: string;
  position: number;
  sourceUrl: string;
  localPath: string;
  error: string | null;
  resolvedSource: string;
  taskMeta: DownloadTaskMeta;
}>;

async function updateTask(id: string, patch: TaskPatch): Promise<void> {
  const db = await getDatabase();
  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [Date.now()];
  const map: Array<[keyof TaskPatch, string]> = [
    ['status', 'status'],
    ['progress', 'progress'],
    ['progressDownloaded', 'progress_downloaded'],
    ['progressTotal', 'progress_total'],
    ['statusText', 'status_text'],
    ['quality', 'quality'],
    ['ext', 'ext'],
    ['fileName', 'file_name'],
    ['position', 'position'],
    ['sourceUrl', 'source_url'],
    ['localPath', 'local_path'],
    ['error', 'error'],
    ['resolvedSource', 'resolved_source'],
    ['taskMeta', 'task_meta'],
  ];
  for (const [key, col] of map) {
    if (patch[key] !== undefined) {
      fields.push(`${col} = ?`);
      values.push(key === 'taskMeta' ? serializeTaskMeta(patch.taskMeta!) : patch[key]);
    }
  }
  values.push(id);
  await db.execute(`UPDATE audio_download_tasks SET ${fields.join(', ')} WHERE id = ?`, values);
  notifyDownloadTasksChanged();
}

async function fetchCoverJpeg(track: AudioTrack): Promise<Uint8Array | null> {
  const url = typeof track.meta.coverUrl === 'string' ? track.meta.coverUrl : '';
  if (!url) return null;
  try {
    const res = await request(url, {
      timeout: 15_000,
      ignorePageNavigationAbort: true,
      useBackendHttp: true,
    });
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 32) return null;
    const cacheKey = `track:${track.id}`;
    void import('@/lib/media/audio/music-cover-disk-cache')
      .then(({ writeMusicCoverToDisk }) =>
        writeMusicCoverToDisk(
          cacheKey,
          url,
          buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
          res.headers['content-type'] ?? res.headers['Content-Type'] ?? 'image/jpeg',
        ),
      )
      .catch(() => undefined);
    return buf;
  } catch {
    return null;
  }
}

async function downloadBytesWithProgress(options: {
  url: string;
  signal: AbortSignal;
  existing: Uint8Array | null;
  onProgress: (downloaded: number, total: number) => void;
}): Promise<Uint8Array> {
  const { url, signal, existing, onProgress } = options;
  const startAt = existing?.byteLength ?? 0;
  const headers: Record<string, string> = {};
  if (startAt > 0) headers.Range = `bytes=${startAt}-`;

  // 优先流式 fetch（可字节进度）；失败再走后端 request
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal,
      credentials: 'omit',
    });
    if (!res.ok && res.status !== 206) {
      throw new Error(`HTTP ${res.status}`);
    }
    const contentLength = Number(res.headers.get('content-length') ?? 0);
    const total =
      res.status === 206 && contentLength > 0
        ? startAt + contentLength
        : contentLength > 0
          ? contentLength
          : startAt;
    if (!res.body) {
      const buf = new Uint8Array(await res.arrayBuffer());
      const merged =
        startAt > 0 && res.status === 206 && existing
          ? (() => {
              const out = new Uint8Array(startAt + buf.length);
              out.set(existing, 0);
              out.set(buf, startAt);
              return out;
            })()
          : buf;
      onProgress(merged.byteLength, Math.max(total, merged.byteLength));
      return merged;
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = existing && res.status === 206 ? [existing] : [];
    let downloaded = existing && res.status === 206 ? startAt : 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        downloaded += value.length;
        onProgress(downloaded, Math.max(total, downloaded));
      }
    }
    const out = new Uint8Array(downloaded);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  } catch (err) {
    if (isAbortError(err) || signal.aborted) throw err;
  }

  const res = await request(url, {
    headers,
    signal,
    timeout: 120_000,
    ignorePageNavigationAbort: true,
    useBackendHttp: true,
    allowNon2xx: true,
  });
  if (!res.ok && res.status !== 206) {
    throw new Error(`下载失败 HTTP ${res.status}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  const merged =
    startAt > 0 && res.status === 206 && existing
      ? (() => {
          const out = new Uint8Array(startAt + buf.length);
          out.set(existing, 0);
          out.set(buf, startAt);
          return out;
        })()
      : buf;
  onProgress(merged.byteLength, merged.byteLength);
  return merged;
}

export async function enqueueTrackDownload(
  track: AudioTrack,
  options?: { quality?: MusicQuality; playlistName?: string },
): Promise<string> {
  if (!getMusicSettings().downloadEnabled) throw new Error('音乐下载已在设置中禁用');
  const downloadDirectory = await ensureDownloadTargetDirectory();
  const db = await getDatabase();
  const quality = options?.quality ?? downloadQuality();
  const settings = getMusicSettings();
  const fileBase = formatDownloadFileName(track, quality);
  const playlistFolder = settings.downloadGroupByPlaylist
    ? String(options?.playlistName || track.meta.playlistName || track.meta.listName || '未分类')
        .replace(/[<>:"/\\|?*]/g, '_')
        .trim()
    : '';

  if (settings.downloadSkipExisting && downloadDirectory && isTauri()) {
    // 磁盘同名（常见扩展）跳过
    for (const ext of ['mp3', 'flac', 'm4a', 'ogg', 'wav', 'aac']) {
      const path = await joinDownloadPath(
        downloadDirectory,
        playlistFolder,
        `${fileBase}.${ext}`,
      );
      if (await fileExists(path)) {
        const existingId = await findCompletedTaskId(track.id, quality);
        if (existingId) return existingId;
        const id = `dl_${track.id}_${Date.now()}`;
        const now = Date.now();
        await db.execute(
          `INSERT INTO audio_download_tasks (
            id, track_id, track_name, status, progress, source_url, local_path,
            created_at, updated_at, quality, ext, file_name, progress_downloaded,
            progress_total, status_text, position
          ) VALUES (?, ?, ?, 'completed', 1, ?, ?, ?, ?, ?, ?, ?, 0, 0, '已存在，跳过', 0)`,
          [
            id,
            track.id,
            fileBase,
            `queue:${encodeURIComponent(
              JSON.stringify({
                playlistName: options?.playlistName ?? '',
                quality,
              }),
            )}`,
            path,
            now,
            now,
            quality,
            ext,
            `${fileBase}.${ext}`,
          ],
        );
        // 提升为 manual 缓存（若尚未缓存则后续播放仍可走文件）
        try {
          const bytes = await readPartialBytes(path);
          if (bytes) {
            await cacheMusicTrackAudio(track.id, path, bytes.buffer.slice(0), mimeFromExt(ext), {
              tier: 'manual',
              quality,
            });
          }
        } catch {
          /* ignore */
        }
        notifyDownloadTasksChanged();
        return id;
      }
    }
  }

  if (settings.downloadSkipExisting) {
    const existingId = await findCompletedTaskId(track.id, quality);
    if (existingId) return existingId;
  }

  const id = `dl_${track.id}_${Date.now()}`;
  const now = Date.now();
  const posRows = await db.select<{ m: number | null }>(
    'SELECT MAX(position) as m FROM audio_download_tasks',
  );
  const position = (posRows[0]?.m ?? 0) + 1;
  await db.execute(
    `INSERT INTO audio_download_tasks (
      id, track_id, track_name, status, progress, source_url,
      created_at, updated_at, quality, ext, file_name, progress_downloaded,
      progress_total, status_text, position
    ) VALUES (?, ?, ?, 'waiting', 0, ?, ?, ?, ?, 'mp3', ?, 0, 0, '等待下载', ?)`,
    [
      id,
      track.id,
      fileBase,
      `queue:${encodeURIComponent(
        JSON.stringify({
          playlistName: options?.playlistName ?? '',
          quality,
        }),
      )}`,
      now,
      now,
      quality,
      fileBase,
      position,
    ],
  );
  notifyDownloadTasksChanged();
  void processDownloadQueue();
  return id;
}

async function completeDownloadWithBytes(options: {
  taskId: string;
  track: AudioTrack;
  audioBytes: Uint8Array;
  ext: string;
  quality: MusicQuality;
  usedUrl: string;
  settings: ReturnType<typeof getMusicSettings>;
  downloadDirectory: string;
  playlistFolder: string;
  fileBase: string;
  partialPath?: string;
  resolvedSource: string;
  taskMeta: DownloadTaskMeta;
  statusText?: string;
}): Promise<void> {
  const {
    taskId,
    track,
    audioBytes,
    ext,
    quality,
    usedUrl,
    settings,
    downloadDirectory,
    playlistFolder,
    fileBase,
    partialPath,
    resolvedSource,
    taskMeta,
    statusText = '下载完成',
  } = options;

  await updateTask(taskId, { sourceUrl: usedUrl, statusText: '正在写入文件', ext });

  let lyricText = '';
  let lyricFileText = '';
  if (settings.downloadSaveLyricFile || settings.downloadEmbedLyric) {
    try {
      const lyric = await resolveOnlineLyricFull(track);
      if (lyric) {
        const conversion = settings.lyricChineseConversion;
        const converted = {
          lyric: lyric.lyric
            ? await convertChineseText(lyric.lyric, conversion)
            : lyric.lyric,
          tlyric: lyric.tlyric
            ? await convertChineseText(lyric.tlyric, conversion)
            : lyric.tlyric,
          rlyric: lyric.rlyric
            ? await convertChineseText(lyric.rlyric, conversion)
            : lyric.rlyric,
          lxlyric: lyric.lxlyric
            ? await convertChineseText(lyric.lxlyric, conversion)
            : lyric.lxlyric,
        };
        // 无主轨时用 lxlyric 兜底，避免空文件
        if (!pickLyricText(converted, 'lyric') && pickLyricText(converted, 'lxlyric')) {
          converted.lyric = converted.lxlyric;
        }
        if (settings.downloadEmbedLyric) {
          lyricText = buildLyrics(converted, {
            includeLx: settings.downloadEmbedLxLyric,
            includeT: settings.downloadEmbedTLyric,
            includeR: settings.downloadEmbedRLyric,
          });
        }
        if (settings.downloadSaveLyricFile) {
          lyricFileText = buildLyrics(converted, {
            includeLx: settings.downloadSaveLxLyric,
            includeT: settings.downloadSaveTLyric,
            includeR: settings.downloadSaveRLyric,
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  let coverJpeg: Uint8Array | null = null;
  if (settings.downloadEmbedCover) {
    coverJpeg = await fetchCoverJpeg(track);
  }

  const sourceComment = buildSourceCommentLabel(
    resolvedSource,
    taskMeta.toggled === true,
    taskMeta.fromCache === true,
  );

  const tagged = embedDownloadAudioTags(audioBytes, ext, {
    title: track.name,
    artist: track.artist,
    album: String(track.meta.album ?? track.meta.albumName ?? ''),
    lyric: lyricText,
    coverJpeg,
    embedLyric: settings.downloadEmbedLyric,
    embedCover: settings.downloadEmbedCover,
    sourceComment,
  });

  const finalName = `${fileBase}.${ext}`;
  const localPath = await writeDownloadedFile(
    downloadDirectory,
    playlistFolder,
    finalName,
    tagged,
  );

  if (partialPath && partialPath !== localPath) await removeFileQuiet(partialPath);
  if (isTauri() && downloadDirectory) {
    const maybePart = await joinDownloadPath(
      downloadDirectory,
      playlistFolder,
      `${fileBase}.${ext}.part`,
    );
    if (maybePart !== localPath) await removeFileQuiet(maybePart);
  }

  if (settings.downloadSaveLyricFile && lyricFileText) {
    const lrcBytes = await encodeLyricFileBytes(
      lyricFileText,
      settings.downloadLrcFormat === 'gbk' ? 'gbk' : 'utf8',
    );
    await writeDownloadedFile(
      downloadDirectory,
      playlistFolder,
      `${fileBase}.lrc`,
      lrcBytes,
    );
  }

  const cacheBuf = tagged.buffer.slice(
    tagged.byteOffset,
    tagged.byteOffset + tagged.byteLength,
  ) as ArrayBuffer;
  await cacheMusicTrackAudio(track.id, usedUrl || localPath, cacheBuf, mimeFromExt(ext), {
    tier: 'manual',
    quality: taskMeta.actualQuality ?? quality,
  });

  await updateTask(taskId, {
    status: 'completed',
    progress: 1,
    progressDownloaded: tagged.byteLength,
    progressTotal: tagged.byteLength,
    localPath,
    fileName: finalName,
    ext,
    statusText,
    error: null,
    resolvedSource,
    taskMeta,
  });
}

async function runTask(task: AudioDownloadTask): Promise<void> {
  if (activeAbortControllers.has(task.id)) return;
  const controller = new AbortController();
  activeAbortControllers.set(task.id, controller);
  activeDownloads++;
  const partialPath =
    task.localPath && task.localPath.endsWith('.part')
      ? task.localPath
      : task.localPath
        ? `${task.localPath}.part`
        : undefined;

  try {
    await updateTask(task.id, {
      status: 'run',
      statusText: '正在获取歌曲链接',
      error: null,
      progress: task.progress || 0,
    });
    const { getAudioTrack } = await import('@/lib/database/audio-library');
    const track = await getAudioTrack(task.trackId);
    if (!track) throw new Error('曲目不存在');
    const queuedOptions = queuedTaskOptions(task.sourceUrl);
    const quality = queuedOptions.quality ?? downloadQuality();
    await updateTask(task.id, { quality });

    const settings = getMusicSettings();
    const downloadDirectory = await ensureDownloadTargetDirectory();
    const strategy = settings.downloadSourceStrategy;
    const { urls, toggled, track: resolvedTrack } = await resolveTrackPlaybackUrls(track, {
      skipCache: true,
      quality,
      allowToggleSource: strategy === 'fallback',
    });

    const playlistFolder = settings.downloadGroupByPlaylist
      ? String(queuedOptions.playlistName || track.meta.playlistName || track.meta.listName || '未分类')
          .replace(/[<>:"/\\|?*]/g, '_')
          .trim()
      : '';
    const fileBase = formatDownloadFileName(track, quality);

    let taskMeta: DownloadTaskMeta = {};
    let resolvedSource = String(track.source);
    if (toggled && resolvedTrack && resolvedTrack.id !== track.id) {
      resolvedSource = String(resolvedTrack.source);
      taskMeta = {
        toggled: true,
        toggleMusicInfo: summarizeToggleTrack(resolvedTrack),
      };
    } else if (toggled && resolvedTrack) {
      resolvedSource = String(resolvedTrack.source);
      taskMeta = { toggled: true };
    }

    let audioBytes: Uint8Array | null = null;
    let usedUrl = '';
    let ext = task.ext || 'mp3';
    let fromCache = false;

    if (urls.length > 0) {
      await updateTask(task.id, { statusText: '正在下载' });
      let lastError: unknown;
      for (const candidate of urls) {
        if (controller.signal.aborted) throw new DOMException('aborted', 'AbortError');
        try {
          const partName = `${fileBase}.${extensionFromResponse(candidate, null)}.part`;
          let existing: Uint8Array | null = null;
          let writePartPath = partialPath;
          if (isTauri() && downloadDirectory) {
            writePartPath = await joinDownloadPath(
              downloadDirectory,
              playlistFolder,
              partName,
            );
            existing = await readPartialBytes(writePartPath);
            await updateTask(task.id, { localPath: writePartPath });
          }

          const bytes = await downloadBytesWithProgress({
            url: candidate,
            signal: controller.signal,
            existing,
            onProgress: (downloaded, total) => {
              void updateTask(task.id, {
                progressDownloaded: downloaded,
                progressTotal: total,
                progress: total > 0 ? downloaded / total : 0,
                statusText: '正在下载',
              });
            },
          });
          ext = extensionFromResponse(candidate, null);
          audioBytes = bytes;
          usedUrl = candidate;
          break;
        } catch (err) {
          if (isAbortError(err) || controller.signal.aborted) throw err;
          lastError = err;
        }
      }
      if (!audioBytes) {
        throw lastError instanceof Error ? lastError : new Error('所有下载源均失败');
      }
    } else if (settings.downloadUseCacheFallback) {
      const cacheHit = await resolvePlaybackCacheForDownload(track);
      if (!cacheHit) throw new Error('无法解析下载地址');
      audioBytes = cacheHit.bytes;
      ext = mimeToExt(cacheHit.mime);
      usedUrl = `cache:${track.id}`;
      fromCache = true;
      resolvedSource = 'cache';
      taskMeta = {
        ...taskMeta,
        fromCache: true,
        cacheTier: cacheHit.cacheTier,
        actualQuality: cacheHit.quality,
      };
      await updateTask(task.id, {
        statusText: '正在写入缓存文件',
        progressDownloaded: cacheHit.bytes.byteLength,
        progressTotal: cacheHit.bytes.byteLength,
        progress: 1,
      });
    } else {
      throw new Error(formatDownloadError(new Error('无法解析下载地址')));
    }

    await completeDownloadWithBytes({
      taskId: task.id,
      track,
      audioBytes,
      ext,
      quality,
      usedUrl,
      settings,
      downloadDirectory,
      playlistFolder,
      fileBase,
      partialPath,
      resolvedSource,
      taskMeta,
      statusText: fromCache ? '来自播放缓存' : '下载完成',
    });
  } catch (e) {
    if (isAbortError(e) || activeAbortControllers.get(task.id)?.signal.aborted) {
      await updateTask(task.id, {
        status: 'pause',
        statusText: '已暂停',
      });
    } else {
      await updateTask(task.id, {
        status: 'error',
        statusText: '任务出错',
        error: formatDownloadError(e),
      });
    }
  } finally {
    activeAbortControllers.delete(task.id);
    activeDownloads--;
    void processDownloadQueue();
  }
}

export async function processDownloadQueue(): Promise<void> {
  if (!getMusicSettings().downloadEnabled) return;
  await ensureDownloadTargetDirectory();
  const limit = maxConcurrent();
  if (activeDownloads >= limit) return;
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM audio_download_tasks
     WHERE status = 'waiting'
     ORDER BY position ASC, created_at ASC
     LIMIT ?`,
    [limit - activeDownloads],
  );
  for (const row of rows) {
    void runTask(rowToTask(row));
  }
}

export async function pauseDownloadTask(id: string): Promise<void> {
  const controller = activeAbortControllers.get(id);
  if (controller) {
    controller.abort();
  }
  await updateTask(id, { status: 'pause', statusText: '已暂停' });
}

export async function resumeDownloadTask(id: string): Promise<void> {
  await updateTask(id, {
    status: 'waiting',
    statusText: '等待下载',
    error: null,
  });
  void processDownloadQueue();
}

export async function retryDownloadTask(id: string): Promise<void> {
  await updateTask(id, {
    status: 'waiting',
    statusText: '等待下载',
    error: null,
    progress: 0,
    progressDownloaded: 0,
  });
  void processDownloadQueue();
}

/**
 * 移除任务（硬删数据库行）。
 * - 未完成：删除半成品 .part
 * - 已完成：可选删除本地下载文件；始终清除「已下载」标记（无其它完成任务时）
 */
export async function deleteDownloadTask(
  id: string,
  options?: { deleteFile?: boolean; fromReconcile?: boolean },
): Promise<void> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM audio_download_tasks WHERE id = ? LIMIT 1',
    [id],
  );
  const task = rows[0] ? rowToTask(rows[0]) : null;
  const controller = activeAbortControllers.get(id);
  if (controller) controller.abort();
  activeAbortControllers.delete(id);

  if (task) {
    const unfinished = task.status !== 'completed';
    if (unfinished && task.localPath) {
      await removeFileQuiet(task.localPath);
      if (!task.localPath.endsWith('.part')) await removeFileQuiet(`${task.localPath}.part`);
    }
    if (options?.deleteFile && task.status === 'completed' && task.localPath) {
      await removeFileQuiet(task.localPath);
      // 同名歌词文件（若存在）
      if (!task.localPath.endsWith('.part')) {
        const lrc = task.localPath.replace(/\.[^.]+$/, '.lrc');
        if (lrc !== task.localPath) await removeFileQuiet(lrc);
      }
    }
  }

  await db.execute('DELETE FROM audio_download_tasks WHERE id = ?', [id]);

  if (task?.trackId) {
    await clearDownloadedMarkIfOrphaned(task.trackId);
  }

  notifyDownloadTasksChanged();
}

/** 该曲目若已无任何 completed 下载任务，则去掉「已下载」(manual) 标记 */
async function clearDownloadedMarkIfOrphaned(trackId: string): Promise<void> {
  const db = await getDatabase();
  const rows = await db.select<{ c: number }>(
    "SELECT COUNT(*) as c FROM audio_download_tasks WHERE track_id = ? AND status = 'completed'",
    [trackId],
  );
  if ((rows[0]?.c ?? 0) > 0) return;

  try {
    const { getAudioTrackCacheTier, updateAudioTrackCacheMeta } = await import(
      '@/lib/database/audio-library'
    );
    const { invalidateGroupTracksCache } = await import('@/lib/database/group-tracks-cache');
    const tier = await getAudioTrackCacheTier(trackId);
    if (tier !== 'manual') return;

    const pathRows = await db.select<{ cache_path: string | null }>(
      'SELECT cache_path FROM audio_tracks WHERE id = ? LIMIT 1',
      [trackId],
    );
    const cachePath = pathRows[0]?.cache_path?.trim() || null;
    // 仍有离线缓存文件索引 → 降为 auto「已缓存」；否则清空标记
    await updateAudioTrackCacheMeta(trackId, {
      cachePath,
      cacheTier: cachePath ? 'auto' : null,
      cachedAt: cachePath ? Date.now() : null,
      cacheBytes: null,
      cacheMime: null,
      cacheQuality: null,
    });
    invalidateGroupTracksCache();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('reader:music-playlists-changed'));
    }
  } catch (err) {
    console.warn('[download] clear downloaded mark failed', trackId.slice(0, 40), err);
  }
}

export async function openDownloadTaskFolder(task: AudioDownloadTask): Promise<void> {
  if (!isTauri()) return;
  const directory = await ensureDownloadTargetDirectory();
  const filePath =
    task.localPath &&
    !task.localPath.endsWith('.part') &&
    (task.localPath.includes('/') || task.localPath.includes('\\'))
      ? task.localPath
      : '';
  const folderFromFile = filePath
    ? filePath.replace(/[/\\][^/\\]+$/, '')
    : '';
  const targetFile = filePath;
  const targetDir = folderFromFile || directory;
  if (!targetDir) throw new Error('未设置下载目录');

  try {
    const { mkdir } = await import('@tauri-apps/plugin-fs');
    await mkdir(targetDir, { recursive: true });
  } catch {
    /* ignore */
  }

  try {
    const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
    await revealItemInDir(targetFile || targetDir);
  } catch {
    const { openPath } = await import('@tauri-apps/plugin-opener');
    await openPath(targetDir);
  }
}

/** 从已完成下载任务播放（本地路径优先） */
export async function playDownloadTask(task: AudioDownloadTask): Promise<void> {
  const { getAudioTrack } = await import('@/lib/database/audio-library');
  const track = await getAudioTrack(task.trackId);
  if (!track) throw new Error('曲目不存在');
  const withPath = {
    ...track,
    meta: {
      ...track.meta,
      filePath:
        task.localPath && !task.localPath.endsWith('.part')
          ? task.localPath
          : track.meta.filePath,
    },
  };
  const { setMusicTrackQueue } = await import('@/stores/viewer/media/audio');
  setMusicTrackQueue([withPath], 0, 'local', {
    origin: 'download',
    listName: '下载列表',
    listKind: 'temporary',
  });
}

export async function isTrackDownloaded(
  trackId: string,
  quality?: MusicQuality,
): Promise<boolean> {
  // 以磁盘上仍存在的完成任务为准（与列表 reconcile 一致）
  return (await getCompletedDownloadPath(trackId, quality)) != null;
}

/** 已完成任务的本地路径（存在才返回）；可按音质筛选 */
export async function getCompletedDownloadPath(
  trackId: string,
  quality?: MusicQuality,
): Promise<string | null> {
  const db = await getDatabase();
  const rows = quality
    ? await db.select<{ local_path: string | null }>(
        `SELECT local_path FROM audio_download_tasks
         WHERE track_id = ? AND quality = ? AND status = 'completed'
           AND local_path IS NOT NULL AND local_path != ''
         ORDER BY updated_at DESC LIMIT 1`,
        [trackId, quality],
      )
    : await db.select<{ local_path: string | null }>(
        `SELECT local_path FROM audio_download_tasks
         WHERE track_id = ? AND status = 'completed' AND local_path IS NOT NULL AND local_path != ''
         ORDER BY updated_at DESC LIMIT 1`,
        [trackId],
      );
  const path = rows[0]?.local_path;
  if (!path || path.endsWith('.part')) return null;
  if (isTauri() && !(await fileExists(path))) return null;
  return path;
}
