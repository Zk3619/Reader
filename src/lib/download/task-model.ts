/**
 * 统一下载任务模型（对齐 Gopeed 状态机 + 多引擎路由）
 */

export type DownloadEngineKind = 'gopeed' | 'ytdlp' | 'extension';

export type DownloadTaskState =
  | 'ready'
  | 'waiting'
  | 'running'
  | 'paused'
  | 'error'
  | 'done';

export type ResolveProtocol = 'http' | 'bt' | 'ed2k' | 'ytdlp';

export interface ResolveFileEntry {
  name: string;
  size: number;
  selected: boolean;
}

export interface ResolveResult {
  name: string;
  size: number;
  files?: ResolveFileEntry[];
  protocol: ResolveProtocol;
  /** 引擎附加（如 ytdlp formats） */
  meta?: Record<string, unknown>;
}

export interface DownloadTaskMeta {
  /** 原始请求 URL（扩展改写前） */
  rawUrl?: string;
  /** 协议探测结果 */
  protocol?: ResolveProtocol;
  /** 扩展 identity（引擎为 extension 时） */
  extensionId?: string;
  /** Tauri download_engine 侧任务 id（进度/暂停映射） */
  engineTaskId?: string;
  /** yt-dlp 选中的 format_id */
  formatId?: string;
  /** 选中的 BT/多文件索引 */
  selectFiles?: number[];
  /** 透传标签（对齐 Gopeed Request.Labels） */
  labels?: Record<string, string>;
  /** 任意引擎附加信息 */
  [key: string]: unknown;
}

export interface DownloadTask {
  id: string;
  engine: DownloadEngineKind;
  url: string;
  title: string;
  state: DownloadTaskState;
  /** 0–100 */
  percent: number;
  /** bytes/s */
  speed: number;
  /** seconds; -1 表示未知 */
  eta: number;
  downloaded: number;
  total: number;
  filepath: string;
  error: string | null;
  meta: DownloadTaskMeta;
  createdAt: number;
  updatedAt: number;
}

export function createEmptyTask(
  partial: Pick<DownloadTask, 'id' | 'engine' | 'url'> & Partial<DownloadTask>,
): DownloadTask {
  const now = Date.now();
  return {
    title: partial.title ?? partial.url,
    state: partial.state ?? 'ready',
    percent: partial.percent ?? 0,
    speed: partial.speed ?? 0,
    eta: partial.eta ?? -1,
    downloaded: partial.downloaded ?? 0,
    total: partial.total ?? 0,
    filepath: partial.filepath ?? '',
    error: partial.error ?? null,
    meta: partial.meta ?? {},
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    id: partial.id,
    engine: partial.engine,
    url: partial.url,
  };
}
