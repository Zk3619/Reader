/**
 * 下载任务 SQLite 持久化（download_tasks）
 */

import { getDatabase } from '@/lib/platform/database';
import { DownloadTables } from '@/lib/database/table-names';
import {
  createEmptyTask,
  type DownloadEngineKind,
  type DownloadTask,
  type DownloadTaskState,
} from '@/lib/download/task-model';

type TaskRow = {
  id: string;
  engine: string;
  url: string;
  title: string;
  state: string;
  percent: number;
  speed: number;
  eta: number;
  downloaded: number;
  total: number;
  filepath: string;
  error: string | null;
  meta: string;
  created_at: number;
  updated_at: number;
};

function parseMeta(raw: string): DownloadTask['meta'] {
  try {
    const parsed = JSON.parse(raw || '{}') as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as DownloadTask['meta']) : {};
  } catch {
    return {};
  }
}

function rowToTask(row: TaskRow): DownloadTask {
  return createEmptyTask({
    id: row.id,
    engine: (row.engine as DownloadEngineKind) || 'gopeed',
    url: row.url || '',
    title: row.title || row.url || '',
    state: (row.state as DownloadTaskState) || 'ready',
    percent: Number(row.percent) || 0,
    speed: Number(row.speed) || 0,
    eta: Number(row.eta ?? -1),
    downloaded: Number(row.downloaded) || 0,
    total: Number(row.total) || 0,
    filepath: row.filepath || '',
    error: row.error,
    meta: parseMeta(row.meta),
    createdAt: Number(row.created_at) || Date.now(),
    updatedAt: Number(row.updated_at) || Date.now(),
  });
}

export async function listDownloadTasksFromDb(): Promise<DownloadTask[]> {
  try {
    const db = await getDatabase();
    const rows = await db.select<TaskRow>(
      `SELECT * FROM ${DownloadTables.tasks} ORDER BY updated_at DESC, created_at DESC`,
    );
    return rows.map(rowToTask);
  } catch {
    return [];
  }
}

export async function replaceAllDownloadTasksInDb(tasks: DownloadTask[]): Promise<void> {
  const db = await getDatabase();
  const table = DownloadTables.tasks;
  await db.execute(`DELETE FROM ${table}`);
  for (const task of tasks) {
    await db.execute(
      `INSERT INTO ${table}
        (id, engine, url, title, state, percent, speed, eta, downloaded, total, filepath, error, meta, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.engine,
        task.url,
        task.title,
        task.state,
        task.percent,
        Math.trunc(task.speed),
        Math.trunc(task.eta),
        Math.trunc(task.downloaded),
        Math.trunc(task.total),
        task.filepath,
        task.error,
        JSON.stringify(task.meta ?? {}),
        Math.trunc(task.createdAt),
        Math.trunc(task.updatedAt),
      ],
    );
  }
}

export async function upsertDownloadTaskInDb(task: DownloadTask): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO ${DownloadTables.tasks}
      (id, engine, url, title, state, percent, speed, eta, downloaded, total, filepath, error, meta, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      engine = excluded.engine,
      url = excluded.url,
      title = excluded.title,
      state = excluded.state,
      percent = excluded.percent,
      speed = excluded.speed,
      eta = excluded.eta,
      downloaded = excluded.downloaded,
      total = excluded.total,
      filepath = excluded.filepath,
      error = excluded.error,
      meta = excluded.meta,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at`,
    [
      task.id,
      task.engine,
      task.url,
      task.title,
      task.state,
      task.percent,
      Math.trunc(task.speed),
      Math.trunc(task.eta),
      Math.trunc(task.downloaded),
      Math.trunc(task.total),
      task.filepath,
      task.error,
      JSON.stringify(task.meta ?? {}),
      Math.trunc(task.createdAt),
      Math.trunc(task.updatedAt),
    ],
  );
}

/** 进度刷新：只更新进度字段，避免反复序列化巨大 meta（formats 等）阻塞主线程 */
export async function upsertDownloadTaskProgressInDb(task: DownloadTask): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE ${DownloadTables.tasks}
     SET state = ?, percent = ?, speed = ?, eta = ?, downloaded = ?, total = ?,
         filepath = ?, error = ?, updated_at = ?
     WHERE id = ?`,
    [
      task.state,
      task.percent,
      Math.trunc(task.speed),
      Math.trunc(task.eta),
      Math.trunc(task.downloaded),
      Math.trunc(task.total),
      task.filepath,
      task.error,
      Math.trunc(task.updatedAt),
      task.id,
    ],
  );
}

export async function deleteDownloadTaskFromDb(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM ${DownloadTables.tasks} WHERE id = ?`, [id]);
}
