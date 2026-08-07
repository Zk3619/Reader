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
  deleteLocalDownloadFiles,
  engineTaskIdOf,
  engineTaskIdsOf,
  estimateYtdlpTotalBytes,
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
  upsertDownloadTaskProgressInDb,
} from '@/lib/download/gopeed/task-db';
import { formatDownloadErrorForUser } from '@/lib/download/error-message';

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
  /** 已知总大小（字节），如 probe 结果 */
  total?: number;
  downloaded?: number;
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
  // meta 按引用共享：进度推送极频繁，禁止因展开 meta 触发下游 deep compare / 重复序列化
  return { ...task, meta: task.meta };
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
  /** 进度节流：合并高频 progress 事件，避免主线程被打满 */
  private progressFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingProgress = new Map<string, ProgressPayload>();
  private dirtyProgressIds = new Set<string>();

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

  /** 进度落盘：只更新进度列，避免反复 JSON.stringify(meta) */
  private persistTaskProgress(task: DownloadTask): void {
    if (!this.useDatabase) {
      this.persist();
      return;
    }
    void upsertDownloadTaskProgressInDb(task).catch(() => {
      /* ignore */
    });
  }

  private schedulePersist(): void {
    if (this.persistTimer != null) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      if (!this.useDatabase) {
        this.persist();
        return;
      }
      const ids = [...this.dirtyProgressIds];
      this.dirtyProgressIds.clear();
      for (const id of ids) {
        const task = this.tasks.find((t) => t.id === id);
        if (task) this.persistTaskProgress(task);
      }
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
      // 出错 / 排队 / 运行中：从未完成落盘，不算「文件已丢失」
      if (
        task.state === 'error' ||
        task.state === 'waiting' ||
        task.state === 'running'
      ) {
        if (task.fileMissing) {
          task.fileMissing = false;
          changed = true;
        }
        continue;
      }
      if (!path && task.state !== 'needs_postprocess') {
        if (task.fileMissing) {
          task.fileMissing = false;
          changed = true;
        }
        continue;
      }
      try {
        let missing: boolean;
        if (task.state === 'needs_postprocess') {
          // 成片可能尚未生成；分轨存在则不算丢失
          const parts = Array.isArray(task.meta.pendingParts)
            ? task.meta.pendingParts.map((p) => String(p || '').trim()).filter(Boolean)
            : [];
          let anyExists = false;
          for (const p of parts) {
            if (await fileExists(p)) {
              anyExists = true;
              break;
            }
          }
          if (!anyExists && path) {
            anyExists = (await fileExists(path)) || (await fileExists(`${path}.part`));
          }
          missing = !anyExists && parts.length + (path ? 1 : 0) > 0;
          // 无路径可查时不标丢失
          if (!path && parts.length === 0) missing = false;
        } else {
          // done / paused：仅在有路径且文件与 .part 均不存在时标记
          const exists = path ? await fileExists(path) : false;
          const partExists = exists || !path ? false : await fileExists(`${path}.part`);
          missing = Boolean(path) && !exists && !partExists;
          // paused 且从未写入（0%）→ 不算丢失
          if (task.state === 'paused' && (task.percent || 0) <= 0 && !partExists) {
            missing = false;
          }
        }
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
    if (opts?.deferPersist) {
      this.dirtyProgressIds.add(next.id);
      this.schedulePersist();
    } else this.persistTask(next);
    if (emitType === 'task-added' || !prev) {
      this.emit({ type: 'task-added', task: cloneTask(next) });
    } else {
      this.emit({ type: 'task-updated', task: cloneTask(next), prev: cloneTask(prev) });
    }
    if (opts?.emitListChanged !== false) {
      this.emit({ type: 'list-changed', tasks: this.list() });
    }
    if (
      next.state === 'done' ||
      next.state === 'paused' ||
      next.state === 'error' ||
      next.state === 'needs_postprocess'
    ) {
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
      // meta 对象替换即视为变更；禁止对 formats 等大字段 JSON.stringify
      changed = nextMeta !== cur.meta;
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
      total: opts.total ?? 0,
      downloaded: opts.downloaded ?? 0,
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
          return this.patch(id, { state: 'error', error: formatDownloadErrorForUser(msg) });
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
    if (
      task.state !== 'paused' &&
      task.state !== 'error' &&
      task.state !== 'ready' &&
      task.state !== 'needs_postprocess'
    ) {
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
          return this.patch(id, { state: 'error', error: formatDownloadErrorForUser(msg) });
        }
        // 引擎侧已丢失任务：清掉 engineTaskId，走下方重新调度
        this.patch(id, { meta: { ...task.meta, engineTaskId: undefined } });
      }
    }

    // 出错 / 待合并：清掉引擎 id，重新调度（避免 continue 到已失败的引擎任务）
    if (task.state === 'needs_postprocess' || task.state === 'error') {
      this.patch(id, {
        meta: {
          ...task.meta,
          engineTaskId: undefined,
          engineTaskIds: undefined,
        },
      });
    }

    const next = this.patch(id, { state: 'waiting', error: null });
    await this.pump();
    return next ? cloneTask(next) : null;
  }

  async delete(id: string, opts?: { deleteFiles?: boolean }): Promise<boolean> {
    const removed = await this.removeTaskInternal(id, opts);
    if (!removed) return false;
    this.emit({ type: 'list-changed', tasks: this.list() });
    await this.pump();
    return true;
  }

  /** 批量删除；只发一次 list-changed */
  async deleteMany(ids: string[], opts?: { deleteFiles?: boolean }): Promise<number> {
    const unique = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
    let n = 0;
    for (const id of unique) {
      if (await this.removeTaskInternal(id, opts)) n += 1;
    }
    if (n > 0) {
      this.emit({ type: 'list-changed', tasks: this.list() });
      await this.pump();
    }
    return n;
  }

  private async removeTaskInternal(
    id: string,
    opts?: { deleteFiles?: boolean },
  ): Promise<boolean> {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return false;
    const task = this.tasks[idx]!;

    const deleteFiles = Boolean(opts?.deleteFiles);
    const engineIds = [
      ...new Set(
        [...engineTaskIdsOf(task), engineTaskIdOf(task) || '']
          .map((x) => String(x || '').trim())
          .filter(Boolean),
      ),
    ];
    if (isTauri() && engineIds.length) {
      for (const engineId of engineIds) {
        try {
          await deleteEngineTask(engineId, deleteFiles);
        } catch {
          /* engine may be absent after ytdlp 完成 */
        }
      }
    }

    // 成片 / 待合并分轨：不能只依赖引擎侧路径（完成后引擎任务常已不存在）
    if (deleteFiles && isTauri()) {
      const paths: string[] = [];
      const filepath = (task.filepath || '').trim();
      if (filepath) paths.push(filepath);
      const mergeOut = String(task.meta.pendingMergeOutput || '').trim();
      if (mergeOut) paths.push(mergeOut);
      if (Array.isArray(task.meta.pendingParts)) {
        for (const p of task.meta.pendingParts) {
          const s = String(p || '').trim();
          if (s) paths.push(s);
        }
      }
      try {
        await deleteLocalDownloadFiles(paths);
      } catch {
        /* ignore */
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
        // 不 await：ytdlp 整段下载很长，阻塞 pump 会导致队列卡死且进度回调堆积
        void this.startTask(next.id);
        // startTask 开头会同步把状态置为 running，便于本轮继续调度
        if (this.tasks.find((t) => t.id === next.id)?.state === 'waiting') break;
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
        const estimatedTotal = estimateYtdlpTotalBytes(task.meta);
        if (estimatedTotal > 0 && !(task.total > 0)) {
          this.patch(id, { total: estimatedTotal });
        }
        const result = await startYtdlpEngineTask(task, {
          onProgress: (report) => {
            const cur = this.tasks.find((t) => t.id === id);
            if (
              !cur ||
              cur.state === 'done' ||
              cur.state === 'needs_postprocess' ||
              cur.state === 'error'
            ) {
              return;
            }
            const speed = report.speed && report.speed > 0 ? report.speed : 0;
            const eta =
              speed > 0 && report.total > report.downloaded
                ? Math.max(0, Math.ceil((report.total - report.downloaded) / speed))
                : -1;
            // 不带 status：避免节流迟到的 running 把已完成状态冲回「下载中」
            this.notifyProgress({
              id,
              downloaded: report.downloaded,
              total: report.total,
              speed,
              percent: report.percent,
              eta,
            });
          },
          onEngineBind: (engineId, engineIds) => {
            const cur = this.tasks.find((t) => t.id === id);
            if (!cur) return;
            this.patch(id, {
              meta: {
                ...cur.meta,
                engineTaskId: engineId,
                engineTaskIds: engineIds,
              },
            });
          },
        });
        const { info, filepath, formatId, engineIds, needsPostprocess, pendingParts, postprocessReason } =
          result;
        this.clearPendingProgressForTaskId(id, engineIds);
        if (needsPostprocess) {
          this.patch(id, {
            state: 'needs_postprocess',
            percent: 100,
            speed: 0,
            eta: -1,
            downloaded: info.downloaded ?? this.tasks.find((t) => t.id === id)?.downloaded,
            total: info.total || this.tasks.find((t) => t.id === id)?.total || 0,
            filepath: info.filepath || filepath,
            error: null,
            fileMissing: false,
            meta: {
              ...task.meta,
              engineTaskId: engineIds[0] || info.id,
              engineTaskIds: engineIds,
              ...(formatId ? { formatId } : {}),
              pendingParts: pendingParts || [],
              pendingMergeOutput: info.filepath || filepath,
              postprocessReason:
                postprocessReason ||
                '音视频分轨已下载，需安装 ffmpeg（或启用 media-ffmpeg）后合并',
            },
          });
          void this.onTerminal(id, 'done');
          void this.pump();
          return;
        }
        const done = String(info.status || '').toLowerCase() === 'done';
        this.patch(id, {
          state: done ? 'done' : 'running',
          percent: done ? 100 : task.percent,
          downloaded: info.downloaded ?? this.tasks.find((t) => t.id === id)?.downloaded,
          total: info.total || this.tasks.find((t) => t.id === id)?.total || 0,
          speed: 0,
          eta: -1,
          filepath: info.filepath || filepath,
          error: null,
          fileMissing: false,
          meta: {
            ...task.meta,
            engineTaskId: engineIds[0] || info.id,
            engineTaskIds: engineIds,
            ...(formatId ? { formatId } : {}),
            pendingParts: undefined,
            pendingMergeOutput: undefined,
            postprocessReason: undefined,
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
          total: info.total && info.total > 0 ? info.total : task.total,
          meta: { ...task.meta, engineTaskId: info.id },
        });
      }
    } catch (e) {
      const msg = formatDownloadErrorForUser(e);
      this.patch(id, { state: 'error', error: msg, fileMissing: false });
      void this.onTerminal(id, 'error');
    }
  }

  private findByEngineOrLocalId(id: string): DownloadTask | undefined {
    return this.tasks.find(
      (t) => t.id === id || engineTaskIdOf(t) === id || engineTaskIdsOf(t).includes(id),
    );
  }

  private clearPendingProgressForTaskId(taskId: string, engineIds: string[] = []): void {
    this.pendingProgress.delete(taskId);
    for (const eid of engineIds) {
      if (eid) this.pendingProgress.delete(eid);
    }
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return;
    for (const eid of engineTaskIdsOf(task)) {
      this.pendingProgress.delete(eid);
    }
    const one = engineTaskIdOf(task);
    if (one) this.pendingProgress.delete(one);
  }

  private applyProgress(payload: ProgressPayload | null | undefined): void {
    if (!payload) return;
    const engineOrLocalId = payload.id || payload.taskId;
    if (!engineOrLocalId) return;

    const existing = this.findByEngineOrLocalId(engineOrLocalId);
    if (
      existing &&
      (existing.state === 'done' ||
        existing.state === 'needs_postprocess' ||
        existing.state === 'error')
    ) {
      // 终态后丢弃迟到进度（含节流队列里的 running）
      this.pendingProgress.delete(engineOrLocalId);
      this.pendingProgress.delete(existing.id);
      return;
    }

    const mapped = mapEngineStatus(payload.status) ?? payload.state;
    const urgent =
      mapped === 'done' ||
      mapped === 'error' ||
      mapped === 'paused' ||
      mapped === 'needs_postprocess';

    if (urgent) {
      this.pendingProgress.delete(engineOrLocalId);
      this.flushProgressPayload(payload);
      return;
    }

    this.pendingProgress.set(engineOrLocalId, {
      ...this.pendingProgress.get(engineOrLocalId),
      ...payload,
      id: engineOrLocalId,
    });
    if (this.progressFlushTimer != null) return;
    this.progressFlushTimer = setTimeout(() => {
      this.progressFlushTimer = null;
      const batch = [...this.pendingProgress.values()];
      this.pendingProgress.clear();
      for (const p of batch) this.flushProgressPayload(p);
    }, 200);
  }

  private flushProgressPayload(payload: ProgressPayload): void {
    const engineOrLocalId = payload.id || payload.taskId;
    if (!engineOrLocalId) return;
    const task = this.findByEngineOrLocalId(engineOrLocalId);
    if (!task) return;

    // 终态任务不再被进度事件改回 running/waiting
    if (
      task.state === 'done' ||
      task.state === 'needs_postprocess' ||
      task.state === 'error'
    ) {
      return;
    }

    const prevState = task.state;
    const patch: Partial<DownloadTask> = {};
    const mapped = mapEngineStatus(payload.status) ?? payload.state;
    const isHubLocalId = task.id === engineOrLocalId;
    // ytdlp 分轨引擎事件的 done/error 由 startYtdlpEngineTask 负责终态，避免中途标完成
    const skipTerminalState =
      !isHubLocalId &&
      task.engine === 'ytdlp' &&
      (mapped === 'done' || mapped === 'error');

    if (mapped && mapped !== task.state && !skipTerminalState) patch.state = mapped;
    if (typeof payload.percent === 'number' && payload.percent !== task.percent) {
      patch.percent = payload.percent;
    }
    if (typeof payload.speed === 'number' && payload.speed !== task.speed) {
      patch.speed = payload.speed;
    }
    // Derive ETA when engine events omit it (common for download-engine-progress)
    const nextDownloaded =
      typeof payload.downloaded === 'number' ? payload.downloaded : task.downloaded;
    const nextTotal =
      typeof payload.total === 'number' && payload.total > 0 ? payload.total : task.total;
    const nextSpeed =
      typeof payload.speed === 'number' ? payload.speed : task.speed;
    let nextEta = typeof payload.eta === 'number' ? payload.eta : task.eta;
    if (typeof payload.eta !== 'number') {
      nextEta =
        nextSpeed > 0 && nextTotal > nextDownloaded
          ? Math.max(0, Math.ceil((nextTotal - nextDownloaded) / nextSpeed))
          : -1;
    }
    if (nextEta !== task.eta) {
      patch.eta = nextEta;
    }
    if (typeof payload.downloaded === 'number' && payload.downloaded !== task.downloaded) {
      patch.downloaded = payload.downloaded;
    }
    if (typeof payload.total === 'number' && payload.total > 0 && payload.total !== task.total) {
      patch.total = payload.total;
    }
    if (typeof payload.filepath === 'string' && payload.filepath !== task.filepath) {
      patch.filepath = payload.filepath;
    }
    if (payload.error !== undefined && payload.error !== task.error && !skipTerminalState) {
      patch.error = payload.error
        ? formatDownloadErrorForUser(payload.error)
        : payload.error;
    }
    if (Object.keys(patch).length === 0) return;

    const next = this.patch(task.id, patch, { progress: true });
    if (!next || next === task) return;

    if (skipTerminalState) return;

    // 上方已提前返回终态任务，prevState 不可能是 done/error
    if (next.state === 'done') {
      this.clearPendingProgressForTaskId(task.id);
      void this.onTerminal(task.id, 'done');
      void this.pump();
    } else if (next.state === 'error') {
      this.clearPendingProgressForTaskId(task.id);
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
        const {
          isArchiveFile,
          extractArchive,
          resolveArchivePrimaryPath,
          listExpectedVolumePaths,
        } = await import('@/lib/download/gopeed/archive');
        if (isArchiveFile(task.filepath)) {
          const { primary } = resolveArchivePrimaryPath(task.filepath);
          const expected = listExpectedVolumePaths(task.filepath);
          let missing = false;
          try {
            const { exists } = await import('@tauri-apps/plugin-fs');
            for (const p of expected) {
              if (!(await exists(p))) {
                missing = true;
                break;
              }
            }
          } catch {
            /* best-effort: proceed with primary */
          }
          if (missing) {
            console.info(
              `[queue] archive waiting for volumes: ${expected.length} expected beside ${task.filepath}`,
            );
          } else {
            const destDir = primary.replace(/[/\\][^/\\]+$/, '') || primary;
            await extractArchive({
              archivePath: primary,
              destDir,
              deleteAfterExtract: false,
            });
          }
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
