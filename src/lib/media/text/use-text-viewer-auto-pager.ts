import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import { stopReadAloud } from '@/lib/media/text/read-aloud';
import {
  TEXT_VIEWER_AUTO_PAGE_TURN_LOCK_MS,
  computeAutoPagePixelDelta,
  resolveAutoReadSpeed,
} from '@/lib/media/text/text-viewer-auto-pager';
import {
  normalizeAutoPageStyle,
  type TextViewerAutoPageStyle,
} from '@/lib/media/text/reader-ui-config';

export interface UseTextViewerAutoPagerOptions {
  isScrollMode: Accessor<boolean>;
  getScrollContainer: Accessor<HTMLElement | null | undefined>;
  goNextPage: () => void;
  canGoNextPage: Accessor<boolean>;
  /** 揭示下一页：由按页视口纵向 clip 下一页，返回 true 表示本屏已提交翻页 */
  drivePagedReveal?: (progress: number) => boolean;
  /** 菜单/抽屉/顶底栏唤起时暂停（对齐 Legado autoPager.pause） */
  isPaused: Accessor<boolean>;
}

export function useTextViewerAutoPager(options: UseTextViewerAutoPagerOptions) {
  const [active, setActive] = createSignal(false);
  /** 0–1：按页模式扫描线/进度条指示（滚动模式不使用） */
  const [screenProgress, setScreenProgress] = createSignal(0);

  const speed = () => resolveAutoReadSpeed(textViewerStore.state.config.autoReadSpeed);

  const pagedAutoStyle = (): TextViewerAutoPageStyle =>
    normalizeAutoPageStyle(textViewerStore.state.config.autoPageStyle);

  let rafId = 0;
  let lastTime = 0;
  let scrollOffsetRemain = 0;
  let screenProgressPx = 0;
  let pageTurnLockUntil = 0;

  const cancelFrame = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  const resetScreenProgress = () => {
    screenProgressPx = 0;
    setScreenProgress(0);
  };

  const stop = () => {
    if (!active()) return;
    setActive(false);
    resetScreenProgress();
    scrollOffsetRemain = 0;
    pageTurnLockUntil = 0;
    cancelFrame();
    if (!options.isScrollMode()) {
      options.drivePagedReveal?.(0);
    }
  };

  const scheduleFrame = () => {
    cancelFrame();
    rafId = requestAnimationFrame(tick);
  };

  const start = () => {
    stopReadAloud();
    setActive(true);
    lastTime = performance.now();
    scrollOffsetRemain = 0;
    resetScreenProgress();
    pageTurnLockUntil = 0;
    scheduleFrame();
  };

  const setEnabled = (enabled: boolean) => {
    if (enabled) start();
    else stop();
  };

  const toggle = () => setEnabled(!active());

  const viewportHeightPx = () => {
    const root = options.getScrollContainer();
    const h = root?.clientHeight ?? 0;
    return h > 0 ? h : window.innerHeight;
  };

  const isScrollAtEnd = (root: HTMLElement) =>
    root.scrollTop + root.clientHeight >= root.scrollHeight - 2;

  const completePagedScreen = (now: number): boolean => {
    const style = pagedAutoStyle();
    if (style === 'reveal') {
      const turned = options.drivePagedReveal?.(1) ?? false;
      if (!turned) {
        if (!options.canGoNextPage()) {
          stop();
          return true;
        }
        return false;
      }
    } else {
      if (!options.canGoNextPage()) {
        stop();
        return true;
      }
      options.goNextPage();
    }
    resetScreenProgress();
    pageTurnLockUntil = now + TEXT_VIEWER_AUTO_PAGE_TURN_LOCK_MS;
    return false;
  };

  const tick = (now: number) => {
    if (!active()) return;

    if (options.isPaused()) {
      lastTime = now;
      rafId = requestAnimationFrame(tick);
      return;
    }

    const elapsed = Math.max(0, now - lastTime);
    lastTime = now;

    if (options.isScrollMode()) {
      const root = options.getScrollContainer();
      if (!root) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const height = root.clientHeight;
      const delta = computeAutoPagePixelDelta(height, speed(), elapsed);
      scrollOffsetRemain += delta;
      if (scrollOffsetRemain >= 1) {
        const step = Math.floor(scrollOffsetRemain);
        scrollOffsetRemain -= step;
        root.scrollTop += step;
      }
      setScreenProgress(0);
      const catalog = textViewerStore.state.catalog;
      const isLastChapter =
        catalog.length > 0 &&
        textViewerStore.state.chapterIndex >= catalog.length - 1;
      if (isLastChapter && isScrollAtEnd(root)) {
        stop();
        return;
      }
    } else {
      if (now < pageTurnLockUntil) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const height = viewportHeightPx();
      const delta = computeAutoPagePixelDelta(height, speed(), elapsed);
      screenProgressPx += delta;
      const style = pagedAutoStyle();

      if (style === 'reveal') {
        const ratio = Math.min(1, screenProgressPx / height);
        setScreenProgress(ratio);
        if (ratio < 1) {
          options.drivePagedReveal?.(ratio);
        } else if (completePagedScreen(now)) {
          return;
        }
      } else if (screenProgressPx >= height) {
        if (completePagedScreen(now)) {
          return;
        }
      } else {
        setScreenProgress(screenProgressPx / height);
      }
    }

    rafId = requestAnimationFrame(tick);
  };

  createEffect(() => {
    if (!active()) return;
    speed();
    pagedAutoStyle();
    if (options.isPaused()) {
      lastTime = performance.now();
    }
  });

  onCleanup(stop);

  return {
    active,
    /** @deprecated 使用 screenProgress */
    pagedProgress: screenProgress,
    screenProgress,
    speed,
    /** 按页模式下的翻页样式；滚动模式始终为连续滚动 */
    autoPageStyle: pagedAutoStyle,
    start,
    stop,
    toggle,
    setEnabled,
  };
};
