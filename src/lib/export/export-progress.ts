/**
 * 缓存导出进度（Toast / 弹窗共用）
 */

import {
  dismissAppToast,
  showAppToast,
  updateAppToastProgress,
} from '@/components/shared/AppToasts';

export const CACHE_EXPORT_TOAST_ID = 'reader-cache-export-toast';

export type ExportProgressPayload = {
  phase: string;
  current: number;
  total: number;
};

export type ExportProgressCallback = (payload: ExportProgressPayload) => void;

export function createExportProgressReporter(
  bookName: string,
  onDialog?: (payload: ExportProgressPayload) => void,
): ExportProgressCallback {
  let started = false;
  return (payload) => {
    onDialog?.(payload);
    const ratio =
      payload.total > 0
        ? Math.min(1, Math.max(0, payload.current / payload.total))
        : 0;
    const pct = Math.round(ratio * 100);
    const description =
      payload.total > 0
        ? `${payload.phase}（${payload.current}/${payload.total}，${pct}%）`
        : payload.phase;
    if (!started) {
      started = true;
      showAppToast({
        id: CACHE_EXPORT_TOAST_ID,
        title: `正在导出：${bookName}`,
        description,
        progress: ratio,
        persistent: true,
        variant: 'plain',
      });
      return;
    }
    updateAppToastProgress(CACHE_EXPORT_TOAST_ID, ratio);
    showAppToast({
      id: CACHE_EXPORT_TOAST_ID,
      title: `正在导出：${bookName}`,
      description,
      progress: ratio,
      persistent: true,
      variant: 'plain',
    });
  };
}

export function finishExportProgressToast(
  success: boolean,
  title: string,
  description?: string,
): void {
  dismissAppToast(CACHE_EXPORT_TOAST_ID);
  if (success) {
    showAppToast({ title, description, variant: 'success' });
    return;
  }
  if (title) {
    showAppToast({ title, description, variant: 'destructive' });
  }
}
