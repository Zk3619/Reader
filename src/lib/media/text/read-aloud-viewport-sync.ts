/**
 * 将当前朗读进度同步到阅读视口（滚动 / 按页），用于从壳层播放器回到阅读器后恢复高亮与页位。
 */

import { getReadAloudProgress } from '@/lib/media/text/read-aloud-progress';
import { isReadAloudSessionActive } from '@/lib/media/text/read-aloud-session';

export type ReadAloudViewportNav = {
  isPaged: boolean;
  setPagedProgress?: (ratio: number) => void;
  scrollToProgress?: (ratio: number) => void;
};

/** 布局就绪后多次重试，避免双页 / 边距重排未完成时高亮错位 */
export function scheduleReadAloudViewportSync(
  apply: () => void,
  retries = 3,
): void {
  const run = (attempt: number) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        apply();
        if (attempt < retries) {
          window.setTimeout(() => run(attempt + 1), 100 + attempt * 80);
        }
      });
    });
  };
  run(0);
}

export function syncReadAloudProgressToViewport(nav: ReadAloudViewportNav): boolean {
  if (!isReadAloudSessionActive()) return false;
  const progress = getReadAloudProgress();
  if (!progress) return false;

  scheduleReadAloudViewportSync(() => {
    if (nav.isPaged) {
      nav.setPagedProgress?.(progress.chapterPos);
    } else {
      nav.scrollToProgress?.(progress.chapterPos);
    }
  });

  return true;
}
