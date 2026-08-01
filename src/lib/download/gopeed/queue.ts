/**
 * Gopeed 式任务队列：maxRunning 并发、状态机、进度事件、SQLite 持久化
 */

import { isTauri } from '@/lib/platform/detect';
import { fileExists } from '@/lib/platform/filesystem';
import {
  createEmptyTask,
  type DownloadEngineKind,
  type DownloadTask,
  type DownloadTaskMeta,
  type DownloadTaskState,
} from '@/lib/download/task-model';
import { getDownloadConfig } from '@/lib/download/gopeed/config';
import {
  continueEngineTask,
  deleteEngineTask,
  engineTaskIdOf,
  mapEngineStatus,
  pauseEngineTask,
  startGopeedEngineTask,
  startYtdlpEngineTask,
} from '@/lib/download/gopeed/engine-bridge';
import { fireDownloadWebhook } from '@/lib/download/gopeed/webhook';
import { runDoneScripts } from '@/lib/download/gopeed/script';
import {
  deleteDownloadTaskFromDb,
  listDownloadTasksFromDb,
  replaceAllDownloadTasksInDb,
  upsertDownloadTaskInDb,
} from '@/lib/download/gopeed/task-db';

export type TaskQueueEventType =
  | 'task-added'
  | 'task-updated'
  | 'task-removed'
  | 'list-changed';

export type TaskQueueEvent =
  | { type: 'task-added'; task: DownloadTask }
  | { type: 'task-updated'; task: DownloadTask; prev: DownloadTask }
  | { type: 'task-removed'; id: string; task: DownloadTask }
  | { type: 'list-changed'; tasks: DownloadTask[] };

export type TaskQueueListener = (event: TaskQueueEvent) => void;

export interface CreateTaskOptions {
  url: string;
  title?: string;
  engine?: DownloadEngineKind;
  filepath?: string;
  meta?: DownloadTaskMeta;
  /** 创建后立即进入 waiting/running 调度 */
  autoStart?: boolean;
}

export interface TaskQueueOptions {
  maxRunning?: number;
  /**
   * @deprecated 已迁 SQLite；仅作无库时的短暂回退读取
   */
  persistKey?: string | null;
  /** 是否监听 Tauri `download-engine-progress` */
  listenProgress?: boolean;
  /** 使用 SQLite 持久化（默认 true） */
  useDatabase?: boolean;
}

type ProgressPayload = {
  id?: string;
  taskId?: string;
  /** Rust 引擎发 `status`；旧调用方可能发 `state` */
  status?: string;
  state?: DownloadTaskState;
  percent?: number;
  speed?: number;
  eta?: number;
  downloaded?: number;
  total?: number;
  filepath?: string;
  error?: string | null;
};

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `dl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function cloneTask(task: DownloadTask): DownloadTask {
  return { ...task, meta: { ...task.meta } };
}

function readPersisted(key: string): DownloadTask[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DownloadTask[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePersisted(key: string, tasks: DownloadTask[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(tasks));
  } catch {
    /* ignore */
  }
}

type PatchOptions = {
  /** 进度推送：无字段变化则跳过；延迟落盘；不广播 list-changed */
  progress?: boolean;
};

export class TaskQueue {
  private tasks: DownloadTask[] = [];
  private maxRunning: number;
  private readonly persistKey: string | null;
  private readonly useDatabase: boolean;
  private readonly listeners = new Set<TaskQueueListener>();
  private unlistenProgress: (() => void) | null = null;
  private progressWired = false;
  private pumping = false;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private hydratePromise: Promise<void> | null = null;
  private hydrated = false;
  private fileCheckTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: TaskQueueOptions = {}) {
    this.maxRunning = Math.max(1, opts.maxRunning ?? 5);
    this.persistKey = opts.persistKey === undefined ? null : opts.persistKey;
    this.useDatabase = opts.useDatabase !== false;
    if (this.persistKey) {
      this.tasks = readPersisted(this.persistKey).map(cloneTask);
    }
    if (opts.listenProgress !== false) {
      void this.ensureProgressListener();
    }
    void this.hydrateMaxRunningFromConfig();
    void this.ensureHydrated();
  }

  /** 等待 SQLite 水合完成（页面挂载时可 await） */
  ensureHydrated(): Promise<void> {
    if (this.hydrated) return Promise.resolve();
    if (this.hydratePromise) return this.hydratePromise;
    this.hydratePromise = (async () => {
      if (this.useDatabase) {
        try {
          const fromDb = await listDownloadTasksFromDb();
          if (fromDb.length > 0) {
            this.tasks = fromDb.map(cloneTask);
          } else if (this.tasks.length > 0) {
            await replaceAllDownloadTasksInDb(this.tasks);
            if (this.persistKey && typeof localStorage !== 'undefined') {
              localStorage.removeItem(this.persistKey);
            }
          }
        } catch {
          /* DB 未就绪时保留内存/LS 回退 */
        }
      }
      this.hydrated = true;
      this.emit({ type: 'list-changed', tasks: this.list() });
      void this.refreshFileMissingFlags();
    })();
    return this.hydratePromise;
  }

  private async hydrateMaxRunningFromConfig(): Promise<void> {
    try {
      const cfg = await getDownloadConfig();
      if (cfg.maxRunning > 0) this.maxRunning = cfg.maxRunning;
    } catch {
      /* ignore */
    }
  }

  private async ensureProgressListener(): Promise<void> {
    if (this.progressWired || !isTauri()) return;
    this.progressWired = true;
    try {
      const { listen } = await import('@tauri-apps/api/event');
      this.unlistenProgress = await listen<ProgressPayload>(
        'download-engine-progress',
        (event) => {
          this.applyProgress(event.payload);
        },
      );
    } catch {
      this.progressWired = false;
    }
  }

  on(listener: TaskQueueListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: TaskQueueEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* listener error must not break queue */
      }
    }
  }

  private persist(): void {
    if (this.useDatabase) {
      // 全量替换成本较高；进度路径走 schedulePersist + upsert 单行
      void replaceAllDownloadTasksInDb(this.tasks).catch(() => {
        /* ignore */
      });
      return;
    }
    if (this.persistKey) writePersisted(this.persistKey, this.tasks);
  }

  private persistTask(task: DownloadTask): void {
    if (!this.useDatabase) {
      this.persist();
      return;
    }
    void upsertDownloadTaskInDb(task).catch(() => {
      /* ignore */
    });
  }

  private schedulePersist(): void {
    if (this.persistTimer != null) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persist();
    }, 800);
  }

  private scheduleFileMissingCheck(): void {
    if (this.fileCheckTimer != null) return;
    this.fileCheckTimer = setTimeout(() => {
      this.fileCheckTimer = null;
      void this.refreshFileMissingFlags();
    }, 400);
  }

  /** 扫描本地路径是否仍存在；缺失则标记 fileMissing 并灰显 */
  async refreshFileMissingFlags(): Promise<void> {
    if (!isTauri()) return;
    let changed = false;
    for (const task of this.tasks) {
      const path = (task.filepath || '').trim();
      if (!path) {
        if (task.fileMissing) {
          task.fileMissing = false;
          changed = true;
        }
        continue;
      }
      if (task.state === 'running' || task.state === 'waiting') {
        if (task.fileMissing) {
          task.fileMissing = false;
          changed = true;
        }
        continue;
      }
      try {
        const exists = await fileExists(path);
        const partExists = exists ? false : await fileExists(`${path}.part`);
        const missing = !exists && !partExists;
        if (Boolean(task.fileMissing) !== missing) {
          const prev = cloneTask(task);
          task.fileMissing = missing;
          changed = true;
          this.emit({
            type: 'task-updated',
            task: cloneTask(task),
            prev,
          });
        }
      } catch {
        /* ignore single path */
      }
    }
    if (changed) {
      this.emit({ type: 'list-changed', tasks: this.list() });
    }
  }

  private replaceTask(
    next: DownloadTask,
    emitType: 'task-added' | 'task-updated' = 'task-updated',
    opts?: { deferPersist?: boolean; emitListChanged?: boolean },
  ): void {
    const idx = this.tasks.findIndex((t) => t.id === next.id);
    const prev = idx >= 0 ? this.tasks[idx]! : null;
    if (idx >= 0) {
      this.tasks[idx] = next;
    } else {
      this.tasks.push(next);
    }
    if (opts?.deferPersist) this.schedulePersist();
    else this.persistTask(next);
    if (emitType === 'task-added' || !prev) {
      this.emit({ type: 'task-added', task: cloneTask(next) });
    } else {
      this.emit({ type: 'task-updated', task: cloneTask(next), prev: cloneTask(prev) });
    }
    if (opts?.emitListChanged !== false) {
      this.emit({ type: 'list-changed', tasks: this.list() });
    }
    if (next.state === 'done' || next.state === 'paused' || next.state === 'error') {
      this.scheduleFileMissingCheck();
    }
  }

  private patch(
    id: string,
    patch: Partial<DownloadTask>,
    opts?: PatchOptions,
  ): DownloadTask | null {
    const cur = this.tasks.find((t) => t.id === id);
    if (!cur) return null;

    const nextMeta = patch.meta ? { ...cur.meta, ...patch.meta } : cur.meta;
    const next: DownloadTask = {
      ...cur,
      ...patch,
      meta: nextMeta,
      updatedAt: Date.now(),
    };

    const meaningfulKeys: (keyof DownloadTask)[] = [
      'engine',
      'url',
      'title',
      'state',
      'percent',
      'speed',
      'eta',
      'downloaded',
      'total',
      'filepath',
      'error',
    ];
    let changed = false;
    for (const key of meaningfulKeys) {
      if (patch[key] !== undefined && next[key] !== cur[key]) {
        changed = true;
        break;
      }
    }
    if (!changed && patch.meta) {
      changed = JSON.stringify(nextMeta) !== JSON.stringify(cur.meta);
    }
    if (!changed) return cur;

    this.replaceTask(next, 'task-updated', {
      deferPersist: opts?.progress === true,
      emitListChanged: opts?.progress !== true,
    });
    return next;
  }

  setMaxRunning(n: number): void {
    this.maxRunning = Math.max(1, n);
    void this.pump();
  }

  getMaxRunning(): number {
    return this.maxRunning;
  }

  list(): DownloadTask[] {
    return this.tasks.map(cloneTask);
  }

  get(id: string): DownloadTask | undefined {
    const t = this.tasks.find((x) => x.id === id);
    return t ? cloneTask(t) : undefined;
  }

  async create(opts: CreateTaskOptions): Promise<DownloadTask> {
    const url = (opts.url || '').trim();
    if (!url) throw new Error('createTask: url is required');

    const task = createEmptyTask({
      id: newId(),
      engine: opts.engine ?? 'gopeed',
      url,
      title: opts.title ?? url,
      filepath: opts.filepath ?? '',
      meta: opts.meta ?? {},
      state: opts.autoStart === false ? 'ready' : 'waiting',
    });

    this.replaceTask(task, 'task-added');
    if (opts.autoStart !== false) {
      await this.pump();
    }
    return cloneTask(task);
  }

  async pause(id: string): Promise<DownloadTask | null> {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return null;
    if (task.state !== 'running' && task.state !== 'waiting') {
      return cloneTask(task);
    }

    const engineId = engineTaskIdOf(task);
    if (engineId && isTauri() && task.state === 'running') {
      try {
        await pauseEngineTask(engineId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/not found|unknown command/i.test(msg)) {
          return this.patch(id, { state: 'error', error: msg });
        }
      }
    }

    const next = this.patch(id, {
      state: 'paused',
      speed: 0,
      error: null,
    });
    await this.pump();
    return next ? cloneTask(next) : null;
  }

  async resume(id: string): Promise<DownloadTask | null> {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return null;
    if (task.state !== 'paused' && task.state !== 'error' && task.state !== 'ready') {
      return cloneTask(task);
    }

    const engineId = engineTaskIdOf(task);
    // 已在引擎侧创建过的暂停任务：continue，避免再 create 一份
    if (engineId && isTauri() && task.state === 'paused') {
      try {
        await continueEngineTask(engineId);
        const next = this.patch(id, { state: 'running', error: null });
        return next ? cloneTask(next) : null;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/not found|unknown command|无法继续/i.test(msg)) {
          return this.patch(id, { state: 'error', error: msg });
        }
        // 引擎侧已丢失任务：清掉 engineTaskId，走下方重新调度
        this.patch(id, { meta: { ...task.meta, engineTaskId: undefined } });
      }
    }

    const next = this.patch(id, { state: 'waiting', error: null });
    await this.pump();
    return next ? cloneTask(next) : null;
  }

  async delete(id: string, opts?: { deleteFiles?: boolean }): Promise<boolean> {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return false;
    const task = this.tasks[idx]!;

    const engineId = engineTaskIdOf(task);
    if (engineId && isTauri()) {
      try {
        await deleteEngineTask(engineId, Boolean(opts?.deleteFiles));
      } catch {
        /* engine may be absent */
      }
    }

    this.tasks.splice(idx, 1);
    if (this.useDatabase) {
      void deleteDownloadTaskFromDb(id).catch(() => {
        /* ignore */
      });
    } else {
      this.persist();
    }
    this.emit({ type: 'task-removed', id, task: cloneTask(task) });
    this.emit({ type: 'list-changed', tasks: this.list() });
    await this.pump();
    return true;
  }

  private runningCount(): number {
    return this.tasks.filter((t) => t.state === 'running').length;
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.runningCount() < this.maxRunning) {
        const next = this.tasks.find((t) => t.state === 'waiting');
        if (!next) break;
        await this.startTask(next.id);
      }
    } finally {
      this.pumping = false;
    }
  }

  private async startTask(id: string): Promise<void> {
    const task = this.tasks.find((t) => t.id === id);
    if (!task || task.state !== 'waiting') return;

    this.patch(id, { state: 'running', error: null });

    if (task.engine === 'extension') {
      this.patch(id, {
        state: 'error',
        error: 'extension engine routing is not started for this task',
      });
      void this.onTerminal(id, 'error');
      return;
    }

    if (!isTauri()) {
      this.patch(id, {
        state: 'error',
        error:
          task.engine === 'ytdlp'
            ? 'ytdlp engine requires Tauri'
            : 'gopeed engine requires Tauri download_engine',
      });
      void this.onTerminal(id, 'error');
      return;
    }

    // 已有引擎任务：优先 continue，避免重复 create
    const existingEngineId = engineTaskIdOf(task);
    if (existingEngineId) {
      try {
        await continueEngineTask(existingEngineId);
        return;
      } catch {
        this.patch(id, { meta: { ...task.meta, engineTaskId: undefined } });
      }
    }

    try {
      if (task.engine === 'ytdlp') {
        const { info, filepath, formatId, engineIds } = await startYtdlpEngineTask(task);
        const done = String(info.status || '').toLowerCase() === 'done';
        this.patch(id, {
          state: done ? 'done' : 'running',
          percent: done ? 100 : task.percent,
          filepath: info.filepath || filepath,
          meta: {
            ...task.meta,
            engineTaskId: engineIds[0] || info.id,
            engineTaskIds: engineIds,
            ...(formatId ? { formatId } : {}),
          },
        });
        if (done) {
          void this.onTerminal(id, 'done');
          void this.pump();
        }
      } else {
        const info = await startGopeedEngineTask(task);
        this.patch(id, {
          filepath: info.filepath || task.filepath,
          meta: { ...task.meta, engineTaskId: info.id },
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.patch(id, { state: 'error', error: msg });
      void this.onTerminal(id, 'error');
    }
  }

  private findByEngineOrLocalId(id: string): DownloadTask | undefined {
    return this.tasks.find(
      (t) => t.id === id || engineTaskIdOf(t) === id,
    );
  }

  private applyProgress(payload: ProgressPayload | null | undefined): void {
    if (!payload) return;
    const engineOrLocalId = payload.id || payload.taskId;
    if (!engineOrLocalId) return;
    const task = this.findByEngineOrLocalId(engineOrLocalId);
    if (!task) return;

    const prevState = task.state;
    const patch: Partial<DownloadTask> = {};
    const mapped = mapEngineStatus(payload.status) ?? payload.state;
    if (mapped && mapped !== task.state) patch.state = mapped;
    if (typeof payload.percent === 'number' && payload.percent !== task.percent) {
      patch.percent = payload.percent;
    }
    if (typeof payload.speed === 'number' && payload.speed !== task.speed) {
      patch.speed = payload.speed;
    }
    if (typeof payload.eta === 'number' && payload.eta !== task.eta) {
      patch.eta = payload.eta;
    }
    if (typeof payload.downloaded === 'number' && payload.downloaded !== task.downloaded) {
      patch.downloaded = payload.downloaded;
    }
    if (typeof payload.total === 'number' && payload.total !== task.total) {
      patch.total = payload.total;
    }
    if (typeof payload.filepath === 'string' && payload.filepath !== task.filepath) {
      patch.filepath = payload.filepath;
    }
    if (payload.error !== undefined && payload.error !== task.error) {
      patch.error = payload.error;
    }
    if (Object.keys(patch).length === 0) return;

    const next = this.patch(task.id, patch, { progress: true });
    if (!next || next === task) return;

    if (next.state === 'done' && prevState !== 'done') {
      void this.onTerminal(task.id, 'done');
      void this.pump();
    } else if (next.state === 'error' && prevState !== 'error') {
      void this.onTerminal(task.id, 'error');
      void this.pump();
    } else if (next.state === 'paused' && prevState !== 'paused') {
      void this.pump();
    }
  }

  /** 供外部（ytdlp / 测试）直接推送进度 */
  notifyProgress(payload: ProgressPayload): void {
    this.applyProgress(payload);
  }

  private async onTerminal(id: string, kind: 'done' | 'error'): Promise<void> {
    const task = this.get(id);
    if (!task) return;
    const event = kind === 'done' ? 'DOWNLOAD_DONE' : 'DOWNLOAD_ERROR';
    void fireDownloadWebhook(event, task);
    void runDoneScripts(event, task);

    try {
      const { getExtensionHost } = await import('@/lib/download/gopeed/extensions/host');
      void getExtensionHost().triggerTaskEvent(kind === 'done' ? 'onDone' : 'onError', {
        task: {
          id: task.id,
          url: task.url,
          title: task.title,
          state: task.state,
          filepath: task.filepath,
          error: task.error,
          meta: task.meta,
        },
      });
    } catch {
      /* extension host optional */
    }

    if (kind !== 'done') return;

    try {
      const cfg = await getDownloadConfig();
      if (cfg.archiveEnabled && task.filepath) {
        const { isArchiveFile, extractArchive } = await import('@/lib/download/gopeed/archive');
        if (isArchiveFile(task.filepath)) {
          const destDir = task.filepath.replace(/[/\\][^/\\]+$/, '') || task.filepath;
          await extractArchive({
            archivePath: task.filepath,
            destDir,
            deleteAfterExtract: false,
          });
        }
      }
      if (cfg.autoTorrent && task.filepath && /\.torrent$/i.test(task.filepath)) {
        await this.create({
          url: task.filepath.startsWith('file:') ? task.filepath : `file://${task.filepath}`,
          title: task.title.replace(/\.torrent$/i, '') || 'torrent',
          engine: 'gopeed',
          autoStart: true,
          meta: { protocol: 'bt', fromAutoTorrent: true },
        });
      }
    } catch {
      /* post-done hooks must not break queue */
    }
  }

  dispose(): void {
    if (this.unlistenProgress) {
      this.unlistenProgress();
      this.unlistenProgress = null;
    }
    this.listeners.clear();
  }
}

let sharedQueue: TaskQueue | null = null;

export function getTaskQueue(opts?: TaskQueueOptions): TaskQueue {
  if (!sharedQueue) {
    sharedQueue = new TaskQueue({
      persistKey: 'download.gopeed.tasks.v1',
      useDatabase: true,
      ...opts,
    });
  }
  return sharedQueue;
}

export function resetTaskQueueForTests(): void {
  sharedQueue?.dispose();
  sharedQueue = null;
}
