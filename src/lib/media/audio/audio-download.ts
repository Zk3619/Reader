/**
 * 音乐下载队列管理
 */

import { getDatabase } from '@/lib/database/database-core';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { cacheMusicTrackAudio } from '@/lib/media/audio/audio-disk-cache';
import { resolveTrackPlaybackUrls } from '@/lib/media/audio/online/online-resolver';
import { getPlayQuality } from '@/lib/media/audio/music-quality';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import { request } from '@/lib/http';
import { isTauri } from '@/lib/platform/detect';
import { resolveOnlineLyricFull } from '@/lib/media/audio/online/source-router';
import { convertChineseText } from '@/lib/replace-rules/chinese-converter';

function maxConcurrent(): number {
  return getMusicSettings().downloadConcurrent || 2;
}

function downloadQuality(): MusicQuality {
  return getMusicSettings().downloadQuality ?? getPlayQuality();
}

export function formatDownloadFileName(track: AudioTrack, quality = downloadQuality()): string {
  const tpl = getMusicSettings().downloadFileNameTemplate ?? '{artist}-{name}';
  const safe = (s: string) => s.replace(/[<>:"/\\|?*]/g, '_').trim();
  const rendered =
    tpl
      .replace(/\{artist\}/g, safe(track.artist))
      .replace(/\{name\}/g, safe(track.name))
      .replace(/\{source\}/g, safe(String(track.source)))
      .replace(/\{quality\}/g, quality)
      .replace(/\{album\}/g, safe(String(track.meta.album ?? '')));
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

async function saveDownloadedFile(
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

export type DownloadTaskStatus = 'pending' | 'downloading' | 'completed' | 'failed';

export interface AudioDownloadTask {
  id: string;
  trackId: string;
  trackName: string;
  status: DownloadTaskStatus;
  progress: number;
  sourceUrl: string;
  localPath?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

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

function rowToTask(row: Record<string, unknown>): AudioDownloadTask {
  return {
    id: String(row.id),
    trackId: String(row.track_id),
    trackName: String(row.track_name ?? ''),
    status: String(row.status) as DownloadTaskStatus,
    progress: Number(row.progress ?? 0),
    sourceUrl: String(row.source_url ?? ''),
    localPath: row.local_path ? String(row.local_path) : undefined,
    error: row.error ? String(row.error) : undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function listDownloadTasks(): Promise<AudioDownloadTask[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM audio_download_tasks ORDER BY created_at DESC',
  );
  return rows.map(rowToTask);
}

export async function enqueueTrackDownload(
  track: AudioTrack,
  options?: { quality?: MusicQuality; playlistName?: string },
): Promise<string> {
  if (!getMusicSettings().downloadEnabled) throw new Error('音乐下载已在设置中禁用');
  const db = await getDatabase();
  if (getMusicSettings().downloadSkipExisting) {
    const existing = await db.select<{ id: string }>(
      `SELECT id FROM audio_download_tasks
       WHERE track_id = ? AND status = 'completed'
       ORDER BY updated_at DESC LIMIT 1`,
      [track.id],
    );
    if (existing[0]?.id) return existing[0].id;
  }
  const id = `dl_${track.id}_${Date.now()}`;
  const now = Date.now();
  await db.execute(
    `INSERT INTO audio_download_tasks (id, track_id, track_name, status, progress, source_url, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', 0, ?, ?, ?)`,
    [
      id,
      track.id,
      formatDownloadFileName(track, options?.quality),
      `queue:${encodeURIComponent(
        JSON.stringify({
          playlistName: options?.playlistName ?? '',
          quality: options?.quality ?? downloadQuality(),
        }),
      )}`,
      now,
      now,
    ],
  );
  void processDownloadQueue();
  return id;
}

async function updateTask(
  id: string,
  patch: Partial<Pick<AudioDownloadTask, 'status' | 'progress' | 'sourceUrl' | 'localPath' | 'error'>>,
): Promise<void> {
  const db = await getDatabase();
  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [Date.now()];
  if (patch.status != null) {
    fields.push('status = ?');
    values.push(patch.status);
  }
  if (patch.progress != null) {
    fields.push('progress = ?');
    values.push(patch.progress);
  }
  if (patch.sourceUrl != null) {
    fields.push('source_url = ?');
    values.push(patch.sourceUrl);
  }
  if (patch.localPath != null) {
    fields.push('local_path = ?');
    values.push(patch.localPath);
  }
  if (patch.error != null) {
    fields.push('error = ?');
    values.push(patch.error);
  }
  values.push(id);
  await db.execute(`UPDATE audio_download_tasks SET ${fields.join(', ')} WHERE id = ?`, values);
}

async function runTask(task: AudioDownloadTask): Promise<void> {
  activeDownloads++;
  try {
    await updateTask(task.id, { status: 'downloading', progress: 0.1 });
    const { getAudioTrack } = await import('@/lib/database/audio-library');
    const track = await getAudioTrack(task.trackId);
    if (!track) throw new Error('曲目不存在');
    const queuedOptions = queuedTaskOptions(task.sourceUrl);
    const quality = queuedOptions.quality ?? downloadQuality();
    const { urls } = await resolveTrackPlaybackUrls(track, {
      skipCache: true,
      quality,
    });
    const candidates =
      getMusicSettings().downloadSourceStrategy === 'fallback' ? urls : urls.slice(0, 1);
    if (!candidates.length) throw new Error('无法解析下载地址');
    let res: Awaited<ReturnType<typeof request>> | undefined;
    let url = '';
    for (const candidate of candidates) {
      const response = await request(candidate);
      if (response.ok) {
        res = response;
        url = candidate;
        break;
      }
    }
    if (!res) throw new Error('所有下载源均失败');
    await updateTask(task.id, { sourceUrl: url, progress: 0.3 });
    const buf = await res.arrayBuffer();
    await updateTask(task.id, { progress: 0.8 });
    const cacheId = await cacheMusicTrackAudio(track.id, url, buf);
    const settings = getMusicSettings();
    const extension = extensionFromResponse(
      url,
      res.headers['content-type'] ?? res.headers['Content-Type'] ?? null,
    );
    const fileBase = formatDownloadFileName(track, quality);
    const queuedPlaylistName = queuedOptions.playlistName;
    const playlistFolder = settings.downloadGroupByPlaylist
      ? String(queuedPlaylistName || track.meta.playlistName || track.meta.listName || '未分类')
          .replace(/[<>:"/\\|?*]/g, '_')
          .trim()
      : '';
    const localPath = await saveDownloadedFile(
      settings.downloadTargetDirectory,
      playlistFolder,
      `${fileBase}.${extension}`,
      new Uint8Array(buf),
    );
    if (settings.downloadSaveLyricFile) {
      const lyric = await resolveOnlineLyricFull(track);
      const rawText = lyric?.lyric ?? lyric?.lxlyric ?? '';
      const text = await convertChineseText(
        rawText,
        settings.lyricChineseConversion,
      );
      if (text) {
        await saveDownloadedFile(
          settings.downloadTargetDirectory,
          playlistFolder,
          `${fileBase}.lrc`,
          new TextEncoder().encode(text),
        );
      }
    }
    await updateTask(task.id, {
      status: 'completed',
      progress: 1,
      localPath: localPath || cacheId,
    });
  } catch (e) {
    await updateTask(task.id, {
      status: 'failed',
      error: e instanceof Error ? e.message : String(e),
    });
  } finally {
    activeDownloads--;
    void processDownloadQueue();
  }
}

export async function processDownloadQueue(): Promise<void> {
  if (!getMusicSettings().downloadEnabled) return;
  const limit = maxConcurrent();
  if (activeDownloads >= limit) return;
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    "SELECT * FROM audio_download_tasks WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?",
    [limit - activeDownloads],
  );
  for (const row of rows) {
    void runTask(rowToTask(row));
  }
}

export async function deleteDownloadTask(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM audio_download_tasks WHERE id = ?', [id]);
}

export async function isTrackDownloaded(trackId: string): Promise<boolean> {
  const db = await getDatabase();
  const rows = await db.select<{ c: number }>(
    "SELECT COUNT(*) as c FROM audio_download_tasks WHERE track_id = ? AND status = 'completed'",
    [trackId],
  );
  return (rows[0]?.c ?? 0) > 0;
}
