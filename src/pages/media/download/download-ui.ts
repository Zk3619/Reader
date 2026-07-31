/**
 * 下载模块 UI 文案与展示辅助
 */

import type { DownloadEngineKind, DownloadTaskState } from '@/lib/download';

export const DOWNLOAD_TASK_STATE_LABEL: Record<DownloadTaskState, string> = {
  ready: '就绪',
  waiting: '等待中',
  running: '下载中',
  paused: '已暂停',
  error: '出错',
  done: '已完成',
};

export type DownloadStateBadgeVariant =
  | 'default'
  | 'secondary'
  | 'outline'
  | 'success'
  | 'warning'
  | 'error';

export const DOWNLOAD_TASK_STATE_BADGE: Record<
  DownloadTaskState,
  DownloadStateBadgeVariant
> = {
  ready: 'secondary',
  waiting: 'secondary',
  running: 'default',
  paused: 'warning',
  error: 'error',
  done: 'success',
};

export const DOWNLOAD_ENGINE_LABEL: Record<DownloadEngineKind, string> = {
  gopeed: '通用下载',
  ytdlp: '媒体提取',
  extension: '扩展',
};

export function formatDownloadBytes(n: number): string {
  if (!n || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDownloadSpeed(n: number): string {
  if (!n || n <= 0) return '';
  return `${formatDownloadBytes(n)}/s`;
}

export function formatDownloadEta(seconds: number): string {
  if (seconds < 0 || !Number.isFinite(seconds)) return '';
  if (seconds < 60) return `${Math.ceil(seconds)} 秒`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} 分钟`;
  const h = Math.floor(seconds / 3600);
  const m = Math.ceil((seconds % 3600) / 60);
  return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`;
}
