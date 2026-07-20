/**
 * 滚动阅读视口：多章无缝衔接（对齐 Legado 滚动模式 / legado-own ReadBook.isScroll）
 */

import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  splitProps,
  type Accessor,
} from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import { fetchProcessedChapterContent } from '@/stores/viewer/media/text';
import { ReaderContent, type ReaderContentProps } from '@/components/media/viewer/text/ReaderContent';
import {
  collectScrollChapterSections,
  findVisibleChapterProgress,
  scrollTopForChapterPos,
  type ScrollChapterSection,
} from '@/lib/media/text/text-viewer-scroll';
import { cn } from '@/lib/utils';

export type LoadedScrollChapter = {
  index: number;
  content: string;
  title: string;
};

export interface ReaderScrollNavApi {
  scrollToChapterProgress: (chapterIndex: number, pos: number) => void;
  scrollToProgressInCurrentChapter: (pos: number) => void;
  scrollByViewportPage: (direction: 1 | -1) => void;
}

export interface ReaderScrollViewportProps extends ReaderContentProps {
  /** 外层正文滚动容器（TextViewerPage 的 overflow-y-auto 节点） */
  getScrollContainer: Accessor<HTMLDivElement | null | undefined>;
  onRegisterNav?: (api: ReaderScrollNavApi) => void;
  /** 净化后的章节标题（对齐 Legado getDisplayTitle / 分页模式） */
  resolveChapterTitle?: (index: number) => string | undefined;
}

const SCROLL_LOAD_ROOT_MARGIN = '0px 0px 240px 0px';
const SCROLL_PREPEND_ROOT_MARGIN = '240px 0px 0px 0px';
const SCROLL_PROGRESS_SAVE_MS = 500;
/** 距栈顶该范围内视为「顶到上一章边界」，预载后定位到上一章末尾 */
const SCROLL_PREPEND_TO_LAST_THRESHOLD_PX = 12;

export function ReaderScrollViewport(props: ReaderScrollViewportProps) {
  const [local, contentProps] = splitProps(props, [
    'getScrollContainer',
    'onRegisterNav',
    'resolveChapterTitle',
  ]);

  const catalog = () => textViewerStore.state.catalog;
  const storeChapterIndex = () => textViewerStore.state.chapterIndex;
  const storeChapterPos = () => textViewerStore.state.chapterPos;
  const storeContent = () => textViewerStore.state.content;
  const showContent = () => textViewerStore.state.showContent;
  const contentLoading = () => textViewerStore.state.contentLoading;

  const [loadedChapters, setLoadedChapters] = createSignal<LoadedScrollChapter[]>([]);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [loadingPrev, setLoadingPrev] = createSignal(false);

  let loadSentinel: HTMLDivElement | undefined;
  let prependSentinel: HTMLDivElement | undefined;
  let loadObserver: IntersectionObserver | undefined;
  let prependObserver: IntersectionObserver | undefined;
  let scrollSaveTimer: number | null = null;
  let isRestoringScroll = false;
  let suppressProgressSync = false;
  let lastNavigationKey = '';
  /** 仅当 store.content 变更时同步栈内对应章，避免滚动改 chapterIndex 时用旧正文覆盖预载章 */
  let lastSyncedStoreContent = '';
  /** 章索引由用户滚动更新时为 true，避免导航 effect 再次 scrollTo 导致跳动 */
  let chapterIndexChangedByScroll = false;

  const lastLoadedIndex = createMemo(() => {
    const list = loadedChapters();
    return list.length > 0 ? list[list.length - 1]!.index : -1;
  });

  const firstLoadedIndex = createMemo(() => {
    const list = loadedChapters();
    return list.length > 0 ? list[0]!.index : -1;
  });

  const chapterTitle = (index: number) => {
    const resolved = local.resolveChapterTitle?.(index);
    return resolved ?? catalog()[index]?.title ?? '';
  };

  const scrollEl = () => local.getScrollContainer() ?? null;

  const resetLoadedFromStore = () => {
    const idx = storeChapterIndex();
    const content = storeContent();
    if (!content?.trim() || !showContent()) {
      setLoadedChapters([]);
      return;
    }
    setLoadedChapters([
      {
        index: idx,
        content,
        title: chapterTitle(idx),
      },
    ]);
    lastSyncedStoreContent = content;
    const root = scrollEl();
    if (root) root.scrollTop = 0;
  };

  const getSections = (): ScrollChapterSection[] => {
    const root = scrollEl();
    if (!root) return [];
    return collectScrollChapterSections(root);
  };

  const finishScrollRestore = () => {
    requestAnimationFrame(() => {
      isRestoringScroll = false;
      suppressProgressSync = false;
    });
  };

  const scrollBehavior = (): ScrollBehavior => {
    const ms = textViewerStore.state.config.jumpDuration ?? 1000;
    return ms > 0 ? 'smooth' : 'auto';
  };

  const applyScrollToChapter = (
    chapterIndex: number,
    pos: number,
    syncStore: boolean,
  ) => {
    const root = scrollEl();
    if (!root) return false;
    const section = getSections().find((s) => s.index === chapterIndex);
    if (!section || section.height <= 0) return false;
    suppressProgressSync = true;
    isRestoringScroll = true;
    const top = scrollTopForChapterPos(
      section.top,
      section.height,
      root.clientHeight,
      pos,
    );
    root.scrollTo({ top, behavior: scrollBehavior() });
    if (syncStore) {
      textViewerStore.setScrollReadingPosition(chapterIndex, pos);
    }
    finishScrollRestore();
    return true;
  };

  const scrollToChapterProgress = (chapterIndex: number, pos: number) => {
    applyScrollToChapter(chapterIndex, pos, true);
  };

  const scrollToChapterWithRetry = (
    chapterIndex: number,
    pos: number,
    maxRetries = 16,
  ) => {
    let retry = 0;
    const attempt = () => {
      if (applyScrollToChapter(chapterIndex, pos, true)) return;
      if (retry++ < maxRetries) requestAnimationFrame(attempt);
    };
    requestAnimationFrame(() => requestAnimationFrame(attempt));
  };

  const scrollToProgressInCurrentChapter = (pos: number) => {
    scrollToChapterProgress(storeChapterIndex(), pos);
  };

  const scrollByViewportPage = (direction: 1 | -1) => {
    const root = scrollEl();
    if (!root) return;
    const delta = root.clientHeight * 0.92 * direction;
    root.scrollBy({ top: delta, behavior: scrollBehavior() });
  };

  const syncProgressFromScroll = () => {
    const root = scrollEl();
    if (!root || isRestoringScroll || suppressProgressSync) return;
    const progress = findVisibleChapterProgress(
      root.scrollTop,
      root.clientHeight,
      getSections(),
    );
    if (!progress) return;
    const indexChanged = progress.chapterIndex !== storeChapterIndex();
    const posChanged =
      Math.abs(progress.chapterPos - storeChapterPos()) > 0.002;
    if (indexChanged || posChanged) {
      if (indexChanged) chapterIndexChangedByScroll = true;
      textViewerStore.setScrollReadingPosition(
        progress.chapterIndex,
        progress.chapterPos,
      );
    }
    if (scrollSaveTimer !== null) clearTimeout(scrollSaveTimer);
    scrollSaveTimer = window.setTimeout(() => {
      void textViewerStore.saveProgress().catch(console.error);
      scrollSaveTimer = null;
    }, SCROLL_PROGRESS_SAVE_MS);
  };

  const appendNextChapter = async () => {
    const list = loadedChapters();
    if (list.length === 0 || loadingMore() || loadingPrev()) return;
    const last = list[list.length - 1]!.index;
    const next = last + 1;
    if (next >= catalog().length) return;
    if (list.some((ch) => ch.index === next)) return;

    setLoadingMore(true);
    try {
      const content = await fetchProcessedChapterContent(next);
      setLoadedChapters((prev) => [
        ...prev,
        { index: next, content, title: chapterTitle(next) },
      ]);
    } catch (e) {
      console.error('[ReaderScrollViewport] 预载下一章失败', e);
    } finally {
      setLoadingMore(false);
    }
  };

  const restoreScrollAfterPrepend = (prevIndex: number, scrollBefore: number) => {
    const root = scrollEl();
    if (!root) return;

    const adjust = () => {
      const section = getSections().find((s) => s.index === prevIndex);
      if (!section || section.height <= 0) return false;

      suppressProgressSync = true;
      isRestoringScroll = true;

      if (scrollBefore <= SCROLL_PREPEND_TO_LAST_THRESHOLD_PX) {
        root.scrollTop = scrollTopForChapterPos(
          section.top,
          section.height,
          root.clientHeight,
          1,
        );
        chapterIndexChangedByScroll = true;
        textViewerStore.setScrollReadingPosition(prevIndex, 1);
      } else {
        root.scrollTop = scrollBefore + section.height;
      }

      finishScrollRestore();
      return true;
    };

    requestAnimationFrame(() => {
      if (adjust()) return;
      requestAnimationFrame(() => {
        adjust();
      });
    });
  };

  const prependPrevChapter = async () => {
    const list = loadedChapters();
    if (list.length === 0 || loadingPrev() || loadingMore()) return;
    const first = list[0]!.index;
    const prev = first - 1;
    if (prev < 0) return;
    if (list.some((ch) => ch.index === prev)) return;

    const root = scrollEl();
    if (!root) return;
    const scrollBefore = root.scrollTop;

    setLoadingPrev(true);
    try {
      const content = await fetchProcessedChapterContent(prev);
      setLoadedChapters((prevList) => [
        { index: prev, content, title: chapterTitle(prev) },
        ...prevList,
      ]);
      restoreScrollAfterPrepend(prev, scrollBefore);
    } catch (e) {
      console.error('[ReaderScrollViewport] 预载上一章失败', e);
    } finally {
      setLoadingPrev(false);
    }
  };

  const handleLoadSentinel = (entries: IntersectionObserverEntry[]) => {
    if (loadingMore() || loadingPrev() || contentLoading()) return;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      void appendNextChapter();
      return;
    }
  };

  const handlePrependSentinel = (entries: IntersectionObserverEntry[]) => {
    if (loadingPrev() || loadingMore() || contentLoading()) return;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      void prependPrevChapter();
      return;
    }
  };

  const bindLoadObserver = () => {
    loadObserver?.disconnect();
    const root = scrollEl();
    if (!root || !loadSentinel) return;
    loadObserver = new IntersectionObserver(handleLoadSentinel, {
      root,
      rootMargin: SCROLL_LOAD_ROOT_MARGIN,
      threshold: 0,
    });
    loadObserver.observe(loadSentinel);
  };

  const bindPrependObserver = () => {
    prependObserver?.disconnect();
    const root = scrollEl();
    if (!root || !prependSentinel) return;
    prependObserver = new IntersectionObserver(handlePrependSentinel, {
      root,
      rootMargin: SCROLL_PREPEND_ROOT_MARGIN,
      threshold: 0,
    });
    prependObserver.observe(prependSentinel);
  };

  const bindObservers = () => {
    bindLoadObserver();
    bindPrependObserver();
  };

  // 书内正文就绪：初始化章节栈或滚到栈内目标章
  createEffect(() => {
    const shown = showContent();
    const content = storeContent();
    const idx = storeChapterIndex();
    const key = `${idx}:${content.length}:${shown}`;
    if (!shown || !content?.trim()) return;
    if (key === lastNavigationKey && loadedChapters().length > 0) return;

    const loaded = loadedChapters();
    const inStack =
      loaded.length > 0 &&
      idx >= loaded[0]!.index &&
      idx <= loaded[loaded.length - 1]!.index;

    if (inStack) {
      lastNavigationKey = key;
      const fromScroll = chapterIndexChangedByScroll;
      chapterIndexChangedByScroll = false;
      if (!fromScroll) {
        scrollToChapterWithRetry(idx, storeChapterPos());
      }
      return;
    }

    chapterIndexChangedByScroll = false;

    lastNavigationKey = key;
    resetLoadedFromStore();
    requestAnimationFrame(() => {
      bindObservers();
      scrollToChapterWithRetry(idx, storeChapterPos());
    });
  });

  // 刷新 / 重载：仅 store.content 变化时写入对应章（不随滚动更新的 chapterIndex 重跑）
  createEffect(() => {
    const content = storeContent();
    if (!content?.trim()) return;
    if (content === lastSyncedStoreContent) return;
    lastSyncedStoreContent = content;

    const idx = textViewerStore.state.chapterIndex;
    setLoadedChapters((prev) => {
      const i = prev.findIndex((ch) => ch.index === idx);
      if (i < 0) return prev;
      if (prev[i]!.content === content) return prev;
      const next = [...prev];
      next[i] = { ...next[i]!, content, title: chapterTitle(idx) };
      return next;
    });
  });

  // 绑定外层滚动监听
  createEffect(() => {
    const root = scrollEl();
    if (!root) return;
    root.addEventListener('scroll', syncProgressFromScroll, { passive: true });
    bindObservers();
    onCleanup(() => {
      root.removeEventListener('scroll', syncProgressFromScroll);
    });
  });

  const refreshLoadedChapterContents = async () => {
    const list = loadedChapters();
    if (list.length === 0 || !showContent()) return;

    const refreshed: LoadedScrollChapter[] = [];
    for (const ch of list) {
      try {
        const content =
          ch.index === storeChapterIndex()
            ? storeContent()
            : await fetchProcessedChapterContent(ch.index);
        refreshed.push({
          index: ch.index,
          content,
          title: chapterTitle(ch.index),
        });
      } catch (e) {
        console.error('[ReaderScrollViewport] 刷新章节正文失败', ch.index, e);
        refreshed.push({ ...ch, title: chapterTitle(ch.index) });
      }
    }
    setLoadedChapters(refreshed);
  };

  onMount(() => {
    local.onRegisterNav?.({
      scrollToChapterProgress,
      scrollToProgressInCurrentChapter,
      scrollByViewportPage,
    });
    bindObservers();

    const onDisplayProcessingChanged = () => {
      void refreshLoadedChapterContents();
    };
    window.addEventListener('reader-scroll-chapters-refresh', onDisplayProcessingChanged);
    onCleanup(() => {
      window.removeEventListener('reader-scroll-chapters-refresh', onDisplayProcessingChanged);
    });
  });

  onCleanup(() => {
    if (scrollSaveTimer !== null) clearTimeout(scrollSaveTimer);
    loadObserver?.disconnect();
    prependObserver?.disconnect();
    loadObserver = undefined;
    prependObserver = undefined;
  });

  return (
    <div class={cn('reader-scroll-viewport min-h-full w-full', contentProps.class)}>
      <Show when={loadingPrev()}>
        <div class="reader-scroll-loading-prev py-4 text-center text-sm text-muted-foreground">
          加载上一章…
        </div>
      </Show>

      <Show when={loadedChapters().length > 0 && firstLoadedIndex() > 0}>
        <div
          ref={(el) => {
            prependSentinel = el;
            bindPrependObserver();
          }}
          class="reader-scroll-prepend-sentinel h-px w-full shrink-0"
          aria-hidden="true"
        />
      </Show>

      <For each={loadedChapters()}>
        {(chapter) => (
          <section
            data-reader-scroll-chapter={String(chapter.index)}
            class="reader-scroll-chapter-section w-full"
          >
            <ReaderContent
              {...contentProps}
              class={undefined}
              stagedChapter={{
                chapterIndex: chapter.index,
                content: chapter.content,
                chapterTitle: chapterTitle(chapter.index),
              }}
            />
          </section>
        )}
      </For>

      <Show when={loadedChapters().length > 0 && lastLoadedIndex() < catalog().length - 1}>
        <div
          ref={(el) => {
            loadSentinel = el;
            bindLoadObserver();
          }}
          class="reader-scroll-load-sentinel h-px w-full shrink-0"
          aria-hidden="true"
        />
      </Show>

      <Show when={loadingMore()}>
        <div class="reader-scroll-loading-more py-6 text-center text-sm text-muted-foreground">
          加载下一章…
        </div>
      </Show>
    </div>
  );
}
