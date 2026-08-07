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
  | 'done'
  /** 分轨已下完，需外部工具（如 ffmpeg）合并/后处理；非失败 */
  | 'needs_postprocess';

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
  /** 多轨下载产生的引擎任务 id 列表 */
  engineTaskIds?: string[];
  /** yt-dlp 选中的 format_id */
  formatId?: string;
  /** 选中的 BT/多文件索引 */
  selectFiles?: number[];
  /** 透传标签（对齐 Gopeed Request.Labels） */
  labels?: Record<string, string>;
  /** 待合并的分轨本地路径（needs_postprocess） */
  pendingParts?: string[];
  /** 期望的合并输出路径 */
  pendingMergeOutput?: string;
  /** 为何需要外部后处理（如缺少 ffmpeg） */
  postprocessReason?: string;
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
  /** 本地文件/分片已不存在（路径变更或被移走）；仅 UI / 删除策略使用，不落库 */
  fileMissing?: boolean;
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
    fileMissing: partial.fileMissing,
    id: partial.id,
    engine: partial.engine,
    url: partial.url,
  };
}
