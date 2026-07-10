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

function maxConcurrent(): number {
  return getMusicSettings().downloadConcurrent || 2;
}

function downloadQuality(): MusicQuality {
  return getMusicSettings().downloadQuality ?? getPlayQuality();
}

function formatDownloadFileName(track: AudioTrack): string {
  const tpl = getMusicSettings().downloadFileNameTemplate ?? '{artist}-{name}';
  const safe = (s: string) => s.replace(/[<>:"/\\|?*]/g, '_').trim();
  return (
    tpl
      .replace(/\{artist\}/g, safe(track.artist))
      .replace(/\{name\}/g, safe(track.name))
      .replace(/\{source\}/g, safe(String(track.source)))
      .replace(/\{quality\}/g, downloadQuality()) || track.id
  );
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
  _options?: { quality?: MusicQuality },
): Promise<string> {
  const db = await getDatabase();
  const id = `dl_${track.id}_${Date.now()}`;
  const now = Date.now();
  await db.execute(
    `INSERT INTO audio_download_tasks (id, track_id, track_name, status, progress, source_url, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', 0, '', ?, ?)`,
    [id, track.id, formatDownloadFileName(track), now, now],
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
    const quality = downloadQuality();
    const { setPlayQuality, getPlayQuality: getQ } = await import('@/lib/media/audio/music-quality');
    const prevQ = getQ();
    setPlayQuality(quality);
    const { urls } = await resolveTrackPlaybackUrls(track, { skipCache: true });
    setPlayQuality(prevQ);
    const url = urls[0];
    if (!url) throw new Error('无法解析下载地址');
    await updateTask(task.id, { sourceUrl: url, progress: 0.3 });
    const res = await request(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    await updateTask(task.id, { progress: 0.8 });
    const cacheId = await cacheMusicTrackAudio(track.id, url, buf);
    await updateTask(task.id, {
      status: 'completed',
      progress: 1,
      localPath: cacheId,
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
