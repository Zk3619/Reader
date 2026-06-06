import {
  createEffect,
  createMemo,
  createSignal,
  Index,
  onCleanup,
  onMount,
  Show,
  splitProps,
  untrack,
  type Accessor,
} from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import { state as viewerState } from '@/stores/viewer/media/state';
import { ReaderContent, type ReaderContentProps } from '@/components/viewer/text-viewer/ReaderContent';
import { applyReaderTextContentSlotLayoutStyle, readerTextContentSlotPagedMountStyle, readerTextContentSlotSlidePanelStyle } from '@/components/viewer/text-viewer/reader-text-content-slot';
import { ReaderContentSkeleton } from '@/components/viewer/text-viewer/ReaderContentSkeleton';
import {
  layoutReaderChapter,
  pageCountFromChapterLayout,
  buildReaderLayoutSignature,
  chapterLayoutsEqual,
  type ReaderChapterLayout,
} from '@/lib/media/text/reader-chapter-layout';
import {
  clearChapterLayoutCache,
  getCachedChapterLayout,
} from '@/lib/media/text/reader-chapter-layout-cache';
import {
  buildChapterLayoutCacheKey,
  buildContentRevision,
  buildViewportSignature,
} from '@/lib/media/text/reader-layout-signature';
import {
  cancelAdjacentChapterLayoutPrefetch,
  prefetchAdjacentChapterLayoutsFromPool,
  scheduleAdjacentChapterLayoutPrefetch,
} from '@/lib/media/text/reader-chapter-layout-prefetch';
import {
  setPagedLayoutCacheHit,
  setPagedLayoutEngine,
} from '@/lib/media/text/reader-paged-layout-debug';
import {
  clearTurnPageCurtain,
  ensureTurnCurtainAttached,
  getPersistedTurnSlide,
  mountTurnPageCurtain,
  setTurnCurtainTransform,
} from '@/lib/media/text/reader-paged-turn-curtain';
import {
  adjacentChapterIndex,
  resolveAdjacentChapterContent,
} from '@/lib/media/text/reader-paged-cross-chapter-content';
import { readerThemeClasses } from '@/lib/media/text/reader-theme-classes';
import type { TextViewerPageAnim, TextViewerPagedContentInsets } from '@/lib/media/text/reader-ui-config';
import { textViewerPagedContentInsets, textViewerPagedDragCommitThresholdPx } from '@/lib/media/text/reader-ui-config';
import {
  mergePagedContentTransforms,
  readerPagedLayerTransform,
  readerPagedSlideIncomingTransform,
  readerPagedSlideOutgoingTransform,
  readerPagedSlideTurnOffsetPx,
  type PagedTurnDirection,
} from '@/lib/media/text/reader-paged-turn-style';
import {
  measureContentSlotInsets,
  readPagedPageWindowMetrics,
} from '@/lib/media/text/reader-paged-clip-measure';
import { cn } from '@/lib/utils';
import type { ReaderPagedNavApi } from '@/components/viewer/text-viewer/reader-paged-nav';
import { consumePagedChapterEntry } from '@/lib/media/text/reader-paged-chapter-entry';

const PAGE_TURN_MS = 320;
/** 偏移落入此区间视为未选方向，用于换向时重置翻页态 */
const DRAG_DIRECTION_DEADZONE_PX = 8;
const LAYOUT_REMEASURE_DEBOUNCE_MS = 120;
const VIEWPORT_RESIZE_EPS_PX = 2;
const CROSS_CHAPTER_LAYOUT_TIMEOUT_MS = 5000;

type TurnStage = 'idle' | 'anim' | 'drag';

/** 章末/章首翻页：outgoing=切章前 clone；incoming=staging 渲染相邻章；动画结束后才 commit store */
type CrossChapterTurnState = {
  direction: PagedTurnDirection;
  fromChapterIndex: number;
  fromPage: number;
  targetPage: number | null;
  animRunning: boolean;
  outgoingLayout: ReaderChapterLayout | null;
  pendingDragStartPx?: number;
  incomingChapterIndex: number;
  incomingContent: string;
  incomingLayout: ReaderChapterLayout | null;
  /** true = 已走 store 切章（缓存未命中时的回退路径） */
  chapterCommitted: boolean;
  stagingPainted: boolean;
};

export interface ReaderPagedViewportProps extends ReaderContentProps {
  pageAnim: Accessor<TextViewerPageAnim>;
  onRequestPrevChapter: () => void | Promise<void>;
  onRequestNextChapter: () => void | Promise<void>;
  onRegisterNav?: (api: ReaderPagedNavApi) => void;
}

export function ReaderPagedViewport(props: ReaderPagedViewportProps) {
  const [local, contentProps] = splitProps(props, [
    'pageAnim',
    'onRequestPrevChapter',
    'onRequestNextChapter',
    'onRegisterNav',
  ]);

  const [pageIndex, setPageIndex] = createSignal(0);
  const [chapterLayout, setChapterLayout] = createSignal<ReaderChapterLayout | null>(null);
  const [viewportSize, setViewportSize] = createSignal({ w: 0, h: 0 });
  const [contentRootReady, setContentRootReady] = createSignal(0);

  const [turnStage, setTurnStage] = createSignal<TurnStage>('idle');
  const [turnFrom, setTurnFrom] = createSignal(0);
  const [turnTo, setTurnTo] = createSignal(0);
  const [turnDir, setTurnDir] = createSignal<PagedTurnDirection>('next');
  const [turnProgress, setTurnProgress] = createSignal(0);

  let viewportEl: HTMLDivElement | undefined;
  let clipEl: HTMLDivElement | undefined;
  let contentSlotEl: HTMLDivElement | undefined;
  let liveInnerEl: HTMLDivElement | undefined;
  let idleContentRoot: HTMLElement | undefined;
  let turnLayerEl: HTMLDivElement | undefined;
  let curtainSlideMountEl: HTMLDivElement | undefined;
  let turnCurtainKey = '';
  let animFrame: number | undefined;
  let animStart = 0;
  let skipChapterPosSync = false;
  let progressRestoredKey = '';
  let progressSaveTimer: ReturnType<typeof setTimeout> | undefined;
  let remeasureDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  let remeasureInFlight = false;
  let remeasurePendingKey = '';
  let lastMeasureTriggerKey = '';
  let lastLayoutRemeasureKey = '';
  let remeasureScheduledForChapter = -1;
  let lastViewportW = 0;
  let lastViewportH = 0;
  let lastClipLayoutOuterH = 0;

  let dragPointerId: number | null = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPageIndex = 0;
  let dragTurnInitialized = false;
  let dragAxis: 'none' | 'x' | 'y' = 'none';
  /** 滑动拖拽像素偏移；避免每帧 setTurnProgress 触发 Solid 重绘 */
  let dragOffsetPxRef = 0;
  let crossChapterTurn: CrossChapterTurnState | null = null;
  let crossChapterLayoutTimer: ReturnType<typeof setTimeout> | undefined;
  /** finishTurn 异步切章期间，阻止 chapterIndex effect 重置排版 */
  let crossChapterCommitInFlight = false;
  let idleContentRootChapter = -1;
  let idleContentRevision = '';

  /** 按页模式暂禁 CSS 双栏（与 Y 向裁切分页不兼容，待双槽物理页实现后再开） */
  const pagedLayoutDualPage = () => false;

  const layout = () => chapterLayout();

  /** 跨章 drag/anim 期间：incoming 用预排版；等待 staging 时仍用当前章 layout */
  const pagingLayout = () => {
    const turn = crossChapterTurn;
    if (
      turn?.incomingLayout &&
      !turn.chapterCommitted &&
      viewerState.chapterIndex === turn.fromChapterIndex &&
      (turn.animRunning || turnStage() !== 'idle')
    ) {
      return turn.incomingLayout;
    }
    return layout();
  };

  const pagingChapterIndex = () => {
    const turn = crossChapterTurn;
    if (
      turn?.incomingLayout &&
      !turn.chapterCommitted &&
      viewerState.chapterIndex === turn.fromChapterIndex &&
      (turn.animRunning || turnStage() !== 'idle')
    ) {
      return turn.incomingChapterIndex;
    }
    return viewerState.chapterIndex;
  };

  const pageStarts = () => {
    const l = pagingLayout();
    const ch = pagingChapterIndex();
    if (l && l.chapterIndex === ch) return l.pageStarts;
    return [0];
  };
  const pagedSlotInsetFromConfig = (): TextViewerPagedContentInsets =>
    textViewerPagedContentInsets(viewerState.config);

  const contentInset = (): TextViewerPagedContentInsets => {
    const fallback = pagedSlotInsetFromConfig();
    if (slideTurnActive()) return fallback;
    if (contentSlotEl) {
      return measureContentSlotInsets(contentSlotEl, fallback);
    }
    const l = layout();
    if (l) {
      return {
        ...fallback,
        top: l.padTop,
        bottom: l.padBottom,
      };
    }
    return fallback;
  };

  const pageWindowMetrics = () =>
    readPagedPageWindowMetrics({
      viewportEl,
      clipEl,
      contentSlotEl,
      fallbackInsets: pagedSlotInsetFromConfig(),
    });

  /** 满视口裁切层（无 padding，翻页/书脊对齐此层） */
  const pagedClipStyle = () =>
    ({
      height: '100%',
      'box-sizing': 'border-box',
    }) as const;

  /** @deprecated 使用 readerTextContentSlotPagedMountStyle */
  const pagedContentSlotStyle = (inset: TextViewerPagedContentInsets) =>
    readerTextContentSlotPagedMountStyle(inset);

  const contentExtentPx = () => {
    const l = pagingLayout();
    const ch = pagingChapterIndex();
    if (l && l.chapterIndex === ch && l.contentExtent > 0) return l.contentExtent;
    const extent = layout()?.contentExtent ?? 0;
    if (extent > 0) return extent;
    return crossChapterTurn?.outgoingLayout?.contentExtent ?? 0;
  };
  const pageClipHeight = () => {
    const l = pagingLayout();
    const ch = pagingChapterIndex();
    if (l && l.chapterIndex === ch && l.clipHeight > 0) return l.clipHeight;
    const live = layout();
    const storeCh = viewerState.chapterIndex;
    if (live && live.chapterIndex === storeCh && live.clipHeight > 0) return live.clipHeight;
    return crossChapterTurn?.outgoingLayout?.clipHeight ?? 0;
  };

  const pageCount = createMemo(() =>
    layout() ? pageCountFromChapterLayout(layout()!) : 1,
  );

  const theme = () => readerThemeClasses(textViewerStore.state.config.theme);

  const syncViewportSize = (w: number, h: number) => {
    if (w <= 0 || h <= 0) return;
    setViewportSize((prev) =>
      prev.w === w && prev.h === h ? prev : { w, h },
    );
  };

  const layoutSignature = createMemo(() => {
    viewerState.config;
    const { w, h } = viewportSize();
    return buildReaderLayoutSignature(viewerState.config, {
      dualPage: pagedLayoutDualPage(),
      viewportWidth: w,
      viewportHeight: h,
    });
  });

  const currentChapterTitle = () => {
    const catalog = viewerState.catalog;
    const idx = viewerState.chapterIndex;
    return catalog[idx]?.title;
  };

  const chapterTitleAt = (index: number) => viewerState.catalog[index]?.title;

  const buildIncomingChapterLayout = (
    chapterIndex: number,
    content: string,
    chapterTitle?: string,
  ): ReaderChapterLayout | null => {
    const pageWindow = pageWindowMetrics();
    const slotInset = pagedSlotInsetFromConfig();
    const outerWidth = viewportEl?.clientWidth ?? 0;
    const layoutWidth =
      contentSlotEl && contentSlotEl.clientWidth > 0
        ? contentSlotEl.clientWidth
        : Math.max(1, outerWidth - slotInset.left - slotInset.right);
    const height = pageWindow.viewportHeight;
    if (height <= 0 || layoutWidth <= 0 || !content.trim()) return null;

    const next = layoutReaderChapter({
      chapterIndex,
      content,
      chapterTitle,
      viewportWidth: layoutWidth,
      viewportHeight: height,
      config: viewerState.config,
      contentRoot: null,
      refineWithDom: false,
      dualPage: pagedLayoutDualPage(),
      padTop: pageWindow.padTop,
      padBottom: pageWindow.padBottom,
      clipHeightPx: pageWindow.clipHeight,
      horizontalInsetOnSlot: true,
    });
    if (!isCrossChapterLayoutReady(next, chapterIndex)) return null;
    return next;
  };

  const applyLayout = (next: ReaderChapterLayout, fromCache: boolean) => {
    const prev = untrack(layout);
    setPagedLayoutEngine(next.engine);
    setPagedLayoutCacheHit(fromCache);
    if (chapterLayoutsEqual(prev, next)) return;
    setChapterLayout(next);
    setPageIndex((i) => {
      const turn = crossChapterTurn;
      if (turn) {
        if (turn.targetPage != null) return turn.targetPage;
        if (turn.direction === 'next') return 0;
        return Math.max(0, next.pageStarts.length - 1);
      }
      const max = Math.max(0, next.pageStarts.length - 1);
      return i <= max ? i : max;
    });
  };

  const withMeasureNeutralOffset = <T,>(fn: () => T): T => {
    const el = liveInnerEl;
    const prevTransform = el?.style.transform ?? '';
    const prevMargin = el?.style.marginTop ?? '';
    if (el) {
      el.style.marginTop = '0';
      el.style.transform = 'translate3d(0, 0, 0)';
    }
    try {
      return fn();
    } finally {
      if (el) {
        el.style.marginTop = prevMargin;
        el.style.transform = prevTransform;
      }
    }
  };

  const remeasureAllowed = () => turnStage() === 'idle';

  const remeasure = (options?: { bypassCache?: boolean; syncOnly?: boolean }) => {
    if (!viewportEl || remeasureInFlight || !remeasureAllowed()) {
      return;
    }
    const pageWindow = pageWindowMetrics();
    const height = pageWindow.viewportHeight;
    const slotInset = pagedSlotInsetFromConfig();
    const outerWidth = viewportEl.clientWidth;
    const layoutWidth =
      contentSlotEl && contentSlotEl.clientWidth > 0
        ? contentSlotEl.clientWidth
        : Math.max(1, outerWidth - slotInset.left - slotInset.right);
    if (height <= 0 || layoutWidth <= 0) return;

    syncViewportSize(outerWidth, viewportEl.clientHeight);

    remeasureInFlight = true;
    const run = async () => {
      try {
        const contentRoot =
          idleContentRoot ??
          liveInnerEl?.querySelector<HTMLElement>('[data-reader-content]') ??
          viewportEl!.querySelector<HTMLElement>('[data-reader-content]') ??
          null;

        const cfg = viewerState.config;
        const dual = pagedLayoutDualPage();
        const cacheKey = buildChapterLayoutCacheKey({
          chapterIndex: viewerState.chapterIndex,
          contentRevision: buildContentRevision(viewerState.content),
          layoutSignature: buildReaderLayoutSignature(cfg, {
            dualPage: dual,
            viewportWidth: layoutWidth,
            viewportHeight: height,
          }),
          viewportSignature: buildViewportSignature(layoutWidth, height),
          chapterTitle: currentChapterTitle(),
        });
        const fromCache =
          !options?.bypassCache && getCachedChapterLayout(cacheKey) != null;

        const layoutInput = {
          chapterIndex: viewerState.chapterIndex,
          content: viewerState.content,
          chapterTitle: currentChapterTitle(),
          viewportWidth: layoutWidth,
          viewportHeight: height,
          config: cfg,
          contentRoot,
          bypassCache: options?.bypassCache,
          refineWithDom: true,
          dualPage: dual,
          padTop: pageWindow.padTop,
          padBottom: pageWindow.padBottom,
          clipHeightPx: pageWindow.clipHeight,
          horizontalInsetOnSlot: true,
        };

        if (!contentRoot) {
          const awaitingDom =
            Boolean(viewerState.showContent && viewerState.content?.trim());
          if (awaitingDom) {
            if (crossChapterTurn) {
              requestAnimationFrame(() => {
                scheduleRemeasure({
                  immediate: true,
                  bypassCache: options?.bypassCache,
                  force: true,
                  allowDuringTurn: true,
                });
              });
            }
            return;
          }
          applyLayout(
            layoutReaderChapter({ ...layoutInput, dualPage: dual }),
            fromCache,
          );
          return;
        }

        if (options?.syncOnly) {
          applyLayout(
            withMeasureNeutralOffset(() =>
              layoutReaderChapter({ ...layoutInput, dualPage: dual }),
            ),
            fromCache,
          );
          return;
        }

        if (dual) {
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          });
        }

        const nextLayout = withMeasureNeutralOffset(() =>
          layoutReaderChapter({ ...layoutInput, dualPage: dual }),
        );
        applyLayout(
          { ...nextLayout, cacheKey, dualPage: dual, isLayoutComplete: true },
          fromCache,
        );
      } finally {
        remeasureInFlight = false;
      }
    };

    void run();
  };

  const scheduleRemeasure = (options?: {
    immediate?: boolean;
    bypassCache?: boolean;
    force?: boolean;
    allowDuringTurn?: boolean;
  }) => {
    const duringTurnOk = Boolean(
      options?.allowDuringTurn &&
        crossChapterTurn &&
        !crossChapterTurn.animRunning,
    );
    if (!duringTurnOk && turnStage() !== 'idle') {
      return;
    }

    const key = [
      viewerState.chapterIndex,
      buildContentRevision(viewerState.content),
      layoutSignature(),
      buildViewportSignature(
        viewportEl?.clientWidth ?? 0,
        viewportEl?.clientHeight ?? 0,
      ),
      options?.bypassCache ? '1' : '0',
    ].join('|');
    if (!options?.force && key === remeasurePendingKey && remeasureInFlight) return;
    remeasurePendingKey = key;

    if (remeasureDebounceTimer !== undefined) {
      clearTimeout(remeasureDebounceTimer);
      remeasureDebounceTimer = undefined;
    }

    const run = () => {
      remeasurePendingKey = '';
      remeasure({ bypassCache: options?.bypassCache });
    };

    if (options?.immediate) {
      requestAnimationFrame(run);
      return;
    }

    remeasureDebounceTimer = setTimeout(() => {
      requestAnimationFrame(run);
    }, LAYOUT_REMEASURE_DEBOUNCE_MS);
  };

  const pageStartAt = (index: number) => Math.round(pageStarts()[index] ?? 0);

  /** 跨章 outgoing 幕帘须用切章前冻结的 pageStarts，避免 layout 已切到新章导致偏移错位 */
  const pageStartPxForTurn = (page: number, forOutgoing = false) => {
    const turn = crossChapterTurn;
    if (forOutgoing && turn?.outgoingLayout && page === turn.fromPage) {
      return Math.round(turn.outgoingLayout.pageStarts[page] ?? 0);
    }
    return pageStartAt(page);
  };

  const buildCurrentChapterLayoutCacheKey = () => {
    const pageWindow = pageWindowMetrics();
    const slotInset = pagedSlotInsetFromConfig();
    const outerWidth = viewportEl?.clientWidth ?? 0;
    const layoutWidth =
      contentSlotEl && contentSlotEl.clientWidth > 0
        ? contentSlotEl.clientWidth
        : Math.max(1, outerWidth - slotInset.left - slotInset.right);
    const height = pageWindow.viewportHeight;
    const cfg = viewerState.config;
    const dual = pagedLayoutDualPage();
    return buildChapterLayoutCacheKey({
      chapterIndex: viewerState.chapterIndex,
      contentRevision: buildContentRevision(viewerState.content),
      layoutSignature: buildReaderLayoutSignature(cfg, {
        dualPage: dual,
        viewportWidth: layoutWidth,
        viewportHeight: height,
      }),
      viewportSignature: buildViewportSignature(layoutWidth, height),
      chapterTitle: currentChapterTitle(),
    });
  };

  const tryApplyCachedChapterLayout = (): boolean => {
    if (!crossChapterTurn) return false;
    if (viewerState.chapterIndex === crossChapterTurn.fromChapterIndex) return false;
    if (!viewerState.content?.trim()) return false;

    const cached = getCachedChapterLayout(buildCurrentChapterLayoutCacheKey());
    if (!cached || cached.chapterIndex !== viewerState.chapterIndex) return false;
    if (!isCrossChapterLayoutReady(cached, viewerState.chapterIndex)) return false;
    applyLayout(cached, true);
    return true;
  };

  const tryApplyProvisionalChapterLayout = (): boolean => {
    if (!crossChapterTurn) return false;
    if (viewerState.chapterIndex === crossChapterTurn.fromChapterIndex) return false;
    if (!viewerState.content?.trim()) return false;
    const l = layout();
    if (l && isCrossChapterLayoutReady(l, viewerState.chapterIndex)) return false;

    const pageWindow = pageWindowMetrics();
    const slotInset = pagedSlotInsetFromConfig();
    const outerWidth = viewportEl?.clientWidth ?? 0;
    const layoutWidth =
      contentSlotEl && contentSlotEl.clientWidth > 0
        ? contentSlotEl.clientWidth
        : Math.max(1, outerWidth - slotInset.left - slotInset.right);
    const height = pageWindow.viewportHeight;
    if (height <= 0 || layoutWidth <= 0) return false;

    const cfg = viewerState.config;
    const dual = pagedLayoutDualPage();
    const next = layoutReaderChapter({
      chapterIndex: viewerState.chapterIndex,
      content: viewerState.content,
      chapterTitle: currentChapterTitle(),
      viewportWidth: layoutWidth,
      viewportHeight: height,
      config: cfg,
      contentRoot: null,
      refineWithDom: false,
      dualPage: dual,
      padTop: pageWindow.padTop,
      padBottom: pageWindow.padBottom,
      clipHeightPx: pageWindow.clipHeight,
      horizontalInsetOnSlot: true,
    });
    if (!isCrossChapterLayoutReady(next, viewerState.chapterIndex)) return false;
    applyLayout(next, false);
    return true;
  };

  const resetIdleContentBinding = () => {
    idleContentRoot = undefined;
    idleContentRootChapter = -1;
    idleContentRevision = '';
  };

  const resolveCrossChapterTargetPage = (): number | null => {
    const turn = crossChapterTurn;
    if (!turn) return null;
    if (turn.targetPage != null) return turn.targetPage;
    if (turn.direction === 'next') return 0;
    if (turn.incomingLayout && !turn.chapterCommitted) {
      return Math.max(0, turn.incomingLayout.pageStarts.length - 1);
    }
    const l = layout();
    if (l && l.chapterIndex === viewerState.chapterIndex) {
      return Math.max(0, l.pageStarts.length - 1);
    }
    return null;
  };

  const isCrossChapterStagingReady = () => {
    const turn = crossChapterTurn;
    if (!turn) return false;

    if (turn.chapterCommitted) {
      if (viewerState.chapterIndex === turn.fromChapterIndex) return false;
      if (!viewerState.showContent || !viewerState.content?.trim()) return false;
      const l = layout();
      if (!l || !isCrossChapterLayoutReady(l, viewerState.chapterIndex)) return false;
    } else {
      if (!turn.incomingLayout || !turn.incomingContent?.trim()) return false;
    }

    const target = resolveCrossChapterTargetPage();
    if (target == null) return false;

    const l = turn.chapterCommitted ? layout() : turn.incomingLayout;
    if (!l || target < 0 || target >= l.pageStarts.length) return false;
    return true;
  };

  const warmAdjacentLayoutsFromPool = () => {
    const book = viewerState.book;
    const catalog = viewerState.catalog;
    const ch = viewerState.chapterIndex;
    const outerW = viewportEl?.clientWidth ?? 0;
    if (!book || outerW <= 0) return;
    const inset = pagedSlotInsetFromConfig();
    const pageWindow = readPagedPageWindowMetrics({
      viewportEl,
      clipEl,
      contentSlotEl,
      fallbackInsets: inset,
    });
    const layoutWidth =
      contentSlotEl && contentSlotEl.clientWidth > 0
        ? contentSlotEl.clientWidth
        : Math.max(1, outerW - inset.left - inset.right);
    if (layoutWidth <= 0 || pageWindow.viewportHeight <= 0) return;
    prefetchAdjacentChapterLayoutsFromPool({
      book,
      catalog,
      chapterIndex: ch,
      viewportWidth: layoutWidth,
      viewportHeight: pageWindow.viewportHeight,
      config: viewerState.config,
    });
  };

  const incomingDisplayPage = () => {
    const turn = crossChapterTurn;
    if (turn?.targetPage != null && (turn.animRunning || turnStage() !== 'idle')) {
      return turn.targetPage;
    }
    return pageIndex();
  };

  /** 排版未就绪时不偏移，避免 clipHeight=0 时误算 */
  const contentOffsetY = (page: number) => {
    if (pageClipHeight() <= 0) return 0;
    return pageStartAt(page);
  };

  /** 当前页正文裁切高度：nextStart - pageStart，防止下一页内容漏入 */
  const pageWindowSpanPx = (page: number) => {
    const clip = pageClipHeight();
    if (clip <= 0) return null;
    const turn = crossChapterTurn;
    if (turn?.outgoingLayout && page === turn.fromPage) {
      const ol = turn.outgoingLayout;
      const start = Math.round(ol.pageStarts[page] ?? 0);
      const nextTop = ol.pageStarts[page + 1];
      if (nextTop == null) return clip;
      return Math.min(clip, Math.max(1, Math.round(nextTop - start)));
    }
    const l = pagingLayout();
    const ch = pagingChapterIndex();
    if (!l || l.chapterIndex !== ch) return clip;
    const start = Math.round(l.pageStarts[page] ?? 0);
    const nextTop = l.pageStarts[page + 1];
    if (nextTop == null) return clip;
    return Math.min(clip, Math.max(1, Math.round(nextTop - start)));
  };

  /** 页窗总高 = 排版区 clipHeight（恒定）；正文裁切另见 pageContentClipPx */
  const pageWindowHeightForDisplay = () => clipViewportHeightPx();

  /** 当前页正文可见高度（≤ 页窗高），避免缩页窗导致“少行” */
  const pageContentClipPx = () =>
    pageWindowSpanPx(incomingDisplayPage()) ?? clipViewportHeightPx();

  /** 裁切视口内容区高度（与 DOM page-window / 分页 clipHeight 一致） */
  const clipViewportHeightPx = () => {
    const live = pageWindowMetrics().clipHeight;
    if (live > 0) return live;
    const clip = pageClipHeight();
    if (clip > 0) return clip;
    return Math.max(
      1,
      (viewportEl?.clientHeight ?? 0) -
        contentInset().top -
        contentInset().bottom,
    );
  };

  /** 满视口页面包（含上下 contentInset，用于翻页幕帘/书脊） */
  const pagedFaceHeightPx = () => {
    if (clipEl && clipEl.clientHeight > 0) return clipEl.clientHeight;
    const inset = contentInset();
    return clipViewportHeightPx() + inset.top + inset.bottom;
  };

  const viewportWidth = () => viewportEl?.clientWidth ?? 0;

  /** 滑动翻页位移基准：满视口 clip 宽（每页为视口宽面板，inset 在面板内 padding） */
  const slideTurnSpanWidthPx = () =>
    clipEl?.clientWidth || viewportEl?.clientWidth || 0;

  const isCrossChapterLayoutReady = (l: ReaderChapterLayout, ch: number) => {
    if (l.chapterIndex !== ch) return false;
    return l.segments.length > 0;
  };

  const clearCrossChapterLayoutTimer = () => {
    if (crossChapterLayoutTimer !== undefined) {
      clearTimeout(crossChapterLayoutTimer);
      crossChapterLayoutTimer = undefined;
    }
  };

  const armCrossChapterLayoutTimer = () => {
    clearCrossChapterLayoutTimer();
    crossChapterLayoutTimer = setTimeout(() => {
      crossChapterLayoutTimer = undefined;
      const turn = crossChapterTurn;
      if (!turn || turn.animRunning) return;
      if (isCrossChapterStagingReady()) {
        tryStartCrossChapterAnimation();
        return;
      }
      clearTurnPageCurtain(turnLayerEl, curtainSlideMountEl);
      turnCurtainKey = '';
      const l = turn.chapterCommitted ? layout() : turn.incomingLayout;
      const fallback =
        turn.targetPage ??
        (turn.direction === 'next'
          ? 0
          : Math.max(0, (l?.pageStarts.length ?? 1) - 1));
      finishTurn(fallback);
    }, CROSS_CHAPTER_LAYOUT_TIMEOUT_MS);
  };

  const isCrossChapterTurnActive = () => crossChapterTurn != null;

  /** 与章内翻页一致：仅在 drag/anim 阶段激活翻页视觉；跨章等待新章就绪期间保持静止排版 */
  const turnVisualActive = () => {
    if (turnStage() !== 'idle') return true;
    if (crossChapterTurn?.animRunning) return true;
    if (crossChapterTurn) return false;
    return turnFrom() !== turnTo();
  };

  const slideTurnActive = () => anim() === 'slide' && turnVisualActive();

  const requestChapterSwitch = (direction: PagedTurnDirection) =>
    Promise.resolve(
      direction === 'next'
        ? local.onRequestNextChapter()
        : local.onRequestPrevChapter(),
    );

  /** 预取相邻章正文 + 离线排版；失败则回退为提前切 store */
  const prepareCrossChapterStaging = async (
    direction: PagedTurnDirection,
  ): Promise<boolean> => {
    const turn = crossChapterTurn;
    if (!turn) return false;
    const book = viewerState.book;
    const catalog = viewerState.catalog;
    if (!book) return false;

    const incomingIdx = adjacentChapterIndex(
      catalog,
      turn.fromChapterIndex,
      direction,
    );
    if (incomingIdx == null) return false;

    const title = chapterTitleAt(incomingIdx);
    const content = await resolveAdjacentChapterContent(book, incomingIdx);

    const commitEarly = async (): Promise<boolean> => {
      try {
        await requestChapterSwitch(direction);
      } catch {
        return false;
      }
      if (!crossChapterTurn) return false;
      crossChapterTurn.chapterCommitted = true;
      crossChapterTurn.incomingChapterIndex = viewerState.chapterIndex;
      crossChapterTurn.incomingContent = viewerState.content;
      crossChapterTurn.incomingLayout = null;
      resetIdleContentBinding();
      return true;
    };

    if (!content?.trim()) return commitEarly();

    const incomingLayout = buildIncomingChapterLayout(incomingIdx, content, title);
    if (!incomingLayout) return commitEarly();

    turn.incomingChapterIndex = incomingIdx;
    turn.incomingContent = content;
    turn.incomingLayout = incomingLayout;
    turn.targetPage =
      direction === 'next'
        ? 0
        : Math.max(0, incomingLayout.pageStarts.length - 1);
    return true;
  };

  const kickoffCrossChapterTurn = () => {
    if (isCrossChapterStagingReady()) {
      tryStartCrossChapterAnimation();
      return;
    }
    if (crossChapterTurn?.chapterCommitted) {
      scheduleRemeasure({
        immediate: true,
        bypassCache: false,
        force: true,
        allowDuringTurn: true,
      });
    }
  };

  const clearCrossChapterTurn = () => {
    clearCrossChapterLayoutTimer();
    crossChapterTurn = null;
  };

  const tryStartCrossChapterAnimation = () => {
    const turn = crossChapterTurn;
    if (!turn || turn.animRunning) return;

    if (turn.chapterCommitted) {
      tryApplyCachedChapterLayout();
      if (turn.direction === 'prev') {
        tryApplyProvisionalChapterLayout();
      }
    }

    if (!isCrossChapterStagingReady()) return;

    if (turn.targetPage == null) {
      const l = turn.chapterCommitted ? layout() : turn.incomingLayout;
      turn.targetPage =
        turn.direction === 'next'
          ? 0
          : Math.max(0, (l?.pageStarts.length ?? 1) - 1);
    }
    const target = turn.targetPage;
    if (target == null) return;

    clearCrossChapterLayoutTimer();
    turn.animRunning = true;
    startAnimatedTurn(target, turn.direction, {
      fromPage: turn.fromPage,
      dragStartPx: turn.pendingDragStartPx,
      skipCurtain: true,
    });
  };

  const startCrossChapterTurn = (
    direction: PagedTurnDirection,
    fromPage: number,
    options?: { dragStartPx?: number },
  ) => {
    const animMode = local.pageAnim();
    if (animMode === 'none') {
      void requestChapterSwitch(direction);
      return;
    }
    if (turnStage() !== 'idle' || crossChapterTurn) return;

    crossChapterTurn = {
      direction,
      fromChapterIndex: viewerState.chapterIndex,
      fromPage,
      targetPage: direction === 'next' ? 0 : null,
      animRunning: false,
      outgoingLayout: untrack(layout),
      pendingDragStartPx: options?.dragStartPx,
      incomingChapterIndex: -1,
      incomingContent: '',
      incomingLayout: null,
      chapterCommitted: false,
      stagingPainted: false,
    };

    skipChapterPosSync = true;
    setTurnFrom(fromPage);
    setTurnTo(fromPage);
    setTurnDir(direction);
    setTurnProgress(0);
    if (liveInnerEl) beginTurnCurtain(fromPage, liveInnerEl);
    warmAdjacentLayoutsFromPool();

    void (async () => {
      const ok = await prepareCrossChapterStaging(direction);
      if (!crossChapterTurn) return;
      if (!ok) {
        finishTurn(fromPage);
        return;
      }
      skipChapterPosSync = false;
      kickoffCrossChapterTurn();
      armCrossChapterLayoutTimer();
    })();
  };

  const commitCrossChapterTurn = (
    direction: PagedTurnDirection,
    fromPage: number,
    dragStartPx: number,
  ) => {
    if (!crossChapterTurn) {
      crossChapterTurn = {
        direction,
        fromChapterIndex: viewerState.chapterIndex,
        fromPage,
        targetPage: direction === 'next' ? 0 : null,
        animRunning: false,
        outgoingLayout: untrack(layout),
        incomingChapterIndex: -1,
        incomingContent: '',
        incomingLayout: null,
        chapterCommitted: false,
        stagingPainted: false,
      };
    }
    crossChapterTurn.direction = direction;
    crossChapterTurn.fromPage = fromPage;
    crossChapterTurn.pendingDragStartPx = dragStartPx;
    if (crossChapterTurn.targetPage == null && direction === 'next') {
      crossChapterTurn.targetPage = 0;
    }

    dragPointerId = null;
    dragAxis = 'none';
    setTurnStage('idle');

    if (!getPersistedTurnSlide() && liveInnerEl) {
      beginTurnCurtain(fromPage, liveInnerEl);
    }

    skipChapterPosSync = true;
    setTurnFrom(fromPage);
    setTurnTo(fromPage);
    setTurnDir(direction);

    void (async () => {
      if (
        !crossChapterTurn?.incomingLayout &&
        !crossChapterTurn?.chapterCommitted
      ) {
        const ok = await prepareCrossChapterStaging(direction);
        if (!crossChapterTurn) return;
        if (!ok) {
          finishTurn(fromPage);
          return;
        }
      }
      warmAdjacentLayoutsFromPool();
      skipChapterPosSync = false;
      kickoffCrossChapterTurn();
      armCrossChapterLayoutTimer();
    })();
  };

  const finishTurn = (target: number) => {
    const turn = crossChapterTurn;
    const pendingCommit = turn && !turn.chapterCommitted;
    const commitDir = turn?.direction;
    const stagedLayout = turn?.incomingLayout ?? null;
    const revertPage = turn?.fromPage ?? target;

    cancelAnimFrame();
    skipChapterPosSync = true;
    clearTurnPageCurtain(turnLayerEl, curtainSlideMountEl);
    turnCurtainKey = '';
    dragOffsetPxRef = 0;
    clearSlidePanelStyles();
    setTurnProgress(0);
    setTurnStage('idle');
    dragPointerId = null;
    dragAxis = 'none';
    dragTurnInitialized = false;
    clearCrossChapterTurn();

    const finalize = (page: number) => {
      setPageIndex(page);
      setTurnFrom(page);
      setTurnTo(page);
      queueMicrotask(() => {
        skipChapterPosSync = false;
        if (anim() === 'slide') restoreContentSlotPagedLayout();
      });
    };

    if (pendingCommit && commitDir) {
      crossChapterCommitInFlight = true;
      void (async () => {
        try {
          await requestChapterSwitch(commitDir);
          if (stagedLayout) {
            applyLayout(stagedLayout, false);
          }
          consumePagedChapterEntry();
          finalize(target);
        } catch {
          finalize(revertPage);
        } finally {
          crossChapterCommitInFlight = false;
        }
      })();
      return;
    }

    if (turn?.chapterCommitted) {
      consumePagedChapterEntry();
    }
    finalize(target);
  };

  const slideTurnOffsetPx = (stage: TurnStage, progressOrDrag: number) =>
    readerPagedSlideTurnOffsetPx(turnDir(), slideTurnSpanWidthPx(), {
      dragOffsetPx: stage === 'drag' ? progressOrDrag : undefined,
      progressRatio: stage === 'anim' ? progressOrDrag : undefined,
    });

  const cancelAnimFrame = () => {
    if (animFrame !== undefined) {
      cancelAnimationFrame(animFrame);
      animFrame = undefined;
    }
  };

  const curtainViewportHeightPx = (fromPage: number) => {
    const clipH = pageClipHeight() || clipViewportHeightPx();
    const a = local.pageAnim();
    if (a === 'cover') {
      return pagedFaceHeightPx();
    }
    return pageWindowSpanPx(fromPage) ?? clipH;
  };

  const beginTurnCurtain = (fromPage: number, cloneSource?: HTMLElement) => {
    const source = cloneSource ?? liveInnerEl;
    if (!source || !turnLayerEl || !curtainSlideMountEl) return;
    if (crossChapterTurn && getPersistedTurnSlide()) {
      ensureTurnCurtainAttached(turnLayerEl, curtainSlideMountEl);
      return;
    }
    const startY = pageStartPxForTurn(fromPage, Boolean(crossChapterTurn));
    const key = `${fromPage}:${startY}`;
    const stage = turnStage();
    if (stage !== 'idle' && getPersistedTurnSlide()) {
      ensureTurnCurtainAttached(turnLayerEl, curtainSlideMountEl);
      return;
    }
    if (
      turnCurtainKey === key &&
      (curtainSlideMountEl.querySelector('.reader-paged-turn-curtain') ||
        ensureTurnCurtainAttached(turnLayerEl, curtainSlideMountEl))
    ) {
      return;
    }
    turnCurtainKey = key;
    mountTurnPageCurtain(
      turnLayerEl,
      curtainSlideMountEl,
      source,
      startY,
      {
        contentSpanPx: pageWindowSpanPx(fromPage) ?? pageClipHeight(),
        viewportHeightPx: curtainViewportHeightPx(fromPage),
        contentInsetPx:
          local.pageAnim() === 'cover' || local.pageAnim() === 'slide'
            ? contentInset()
            : undefined,
        slideViewportPanel: local.pageAnim() === 'slide',
      },
    );
  };

  const restoreContentSlotPagedLayout = () => {
    if (!contentSlotEl || slideTurnActive()) return;
    applyReaderTextContentSlotLayoutStyle(
      contentSlotEl,
      readerTextContentSlotPagedMountStyle(pagedSlotInsetFromConfig()),
    );
    contentSlotEl.style.removeProperty('transform');
    contentSlotEl.style.removeProperty('will-change');
  };

  const clearSlidePanelStyles = () => {
    if (!contentSlotEl) return;
    contentSlotEl.style.transform = '';
    contentSlotEl.style.willChange = '';
  };

  const syncSlideIncomingPanelTransform = (stage: TurnStage, value: number) => {
    if (anim() !== 'slide') return;
    if (stage === 'idle' || (turnFrom() === turnTo() && !isCrossChapterTurnActive())) {
      clearSlidePanelStyles();
      queueMicrotask(restoreContentSlotPagedLayout);
      return;
    }
    if (!contentSlotEl) return;
    const offset = slideTurnOffsetPx(stage, value);
    const xForm = readerPagedSlideIncomingTransform(
      turnDir(),
      slideTurnSpanWidthPx(),
      offset,
    );
    contentSlotEl.style.transform = xForm ?? '';
    contentSlotEl.style.willChange = 'transform';
    const turn = crossChapterTurn;
    if (
      liveInnerEl &&
      (!turn || (turn.chapterCommitted && !turn.incomingLayout))
    ) {
      const y = contentOffsetY(incomingDisplayPage());
      liveInnerEl.style.transform = mergePagedContentTransforms(y) ?? '';
      liveInnerEl.style.willChange = '';
    }
  };

  const syncSlideTurnVisuals = (stage: TurnStage, value: number) => {
    if (anim() !== 'slide') return;
    syncCurtainLayerTransform(stage, stage === 'anim' ? value : 0, stage === 'drag' ? value : undefined);
    syncSlideIncomingPanelTransform(stage, value);
  };

  /** setPageIndex 触发 Solid 重绘后可能清掉 imperative 幕帘，挂回已缓存 slide（勿再 clone live） */
  const syncTurnCurtainAfterRender = () => {
    if (!crossChapterTurn && turnStage() === 'idle') return;
    if (
      !crossChapterTurn &&
      turnFrom() === turnTo()
    ) {
      return;
    }
    ensureTurnCurtainAttached(turnLayerEl, curtainSlideMountEl);
  };

  const syncCurtainLayerTransform = (stage: TurnStage, progressRatio: number, dragPx?: number) => {
    if (stage === 'idle' || !turnLayerEl) {
      setTurnCurtainTransform(turnLayerEl, undefined);
      return;
    }
    if (anim() === 'slide') {
      const offset = slideTurnOffsetPx(stage, stage === 'drag' ? (dragPx ?? 0) : progressRatio);
      setTurnCurtainTransform(turnLayerEl, readerPagedSlideOutgoingTransform(offset));
      return;
    }
    const layerTransform = readerPagedLayerTransform(
      anim(),
      'outgoing',
      turnDir(),
      progressRatio,
    );
    setTurnCurtainTransform(turnLayerEl, layerTransform);
  };

  const turnAnimProgress = () => {
    const stage = turnStage();
    if (stage === 'anim') return turnProgress();
    if (stage === 'drag') {
      const w = viewportWidth();
      return w > 0 ? Math.min(1, Math.abs(turnProgress()) / w) : 0;
    }
    return 0;
  };

  const startAnimatedTurn = (
    target: number,
    direction: PagedTurnDirection,
    options?: {
      dragStartPx?: number;
      fromPage?: number;
      /** 跨章：outgoing 已在切章前 clone，禁止用新章 live 再 clone */
      skipCurtain?: boolean;
    },
  ) => {
    const animMode = local.pageAnim();
    if (animMode === 'none') {
      finishTurn(target);
      return;
    }

    const from =
      options?.fromPage ??
      (turnStage() === 'drag' ? turnFrom() : pageIndex());

    if (from === target && turnStage() !== 'drag' && !options?.skipCurtain) {
      finishTurn(target);
      return;
    }

    if (options?.skipCurtain) {
      ensureTurnCurtainAttached(turnLayerEl, curtainSlideMountEl);
    } else {
      beginTurnCurtain(from, liveInnerEl ?? undefined);
    }

    skipChapterPosSync = true;
    setPageIndex(target);
    setTurnFrom(from);
    setTurnTo(target);
    setTurnDir(direction);
    queueMicrotask(() => {
      skipChapterPosSync = false;
      if (animMode === 'slide' && turnStage() === 'anim') {
        syncSlideTurnVisuals('anim', turnProgress());
      }
    });

    const w = viewportEl?.clientWidth ?? 0;
    const initial =
      options?.dragStartPx != null && w > 0
        ? Math.min(1, Math.abs(options.dragStartPx) / w)
        : 0;

    setTurnProgress(initial);
    setTurnStage('anim');
    animStart = performance.now();

    if (animMode === 'slide') {
      syncSlideTurnVisuals('anim', initial);
    }

    const tick = (now: number) => {
      const t = Math.min(
        1,
        initial + ((now - animStart) / PAGE_TURN_MS) * (1 - initial),
      );
      if (animMode === 'slide') {
        syncSlideTurnVisuals('anim', t);
      } else {
        setTurnProgress(t);
      }
      if (t < 1) {
        animFrame = requestAnimationFrame(tick);
        return;
      }
      finishTurn(target);
    };
    animFrame = requestAnimationFrame(tick);
  };

  const runAnimatedTurn = (target: number, direction: PagedTurnDirection) => {
    if (turnStage() !== 'idle' || crossChapterTurn) return;
    startAnimatedTurn(target, direction);
  };

  const commitDragTurn = (target: number, direction: PagedTurnDirection) => {
    const dragStartPx = anim() === 'slide' ? dragOffsetPxRef : turnProgress();
    const fromPage = turnFrom();
    dragPointerId = null;
    dragAxis = 'none';
    startAnimatedTurn(target, direction, { dragStartPx, fromPage });
  };

  const goNextPage = () => {
    const idx = pageIndex();
    if (idx < pageCount() - 1) {
      runAnimatedTurn(idx + 1, 'next');
      return;
    }
    if (!isAtLastChapter()) {
      startCrossChapterTurn('next', idx);
    }
  };

  const goPrevPage = () => {
    const idx = pageIndex();
    if (idx > 0) {
      runAnimatedTurn(idx - 1, 'prev');
      return;
    }
    if (!isAtFirstChapter()) {
      startCrossChapterTurn('prev', idx);
    }
  };

  const setPageProgress = (ratio: number) => {
    const total = pageCount();
    const target =
      total <= 1 ? 0 : Math.round(Math.max(0, Math.min(1, ratio)) * (total - 1));
    if (target === pageIndex()) return;
    runAnimatedTurn(target, target > pageIndex() ? 'next' : 'prev');
  };

  /** 内容 / 排版 / 视口变化：合并为一次防抖重测 */
  createEffect(() => {
    const ch = viewerState.chapterIndex;
    const contentRev = buildContentRevision(viewerState.content);
    viewerState.showContent;
    const sig = layoutSignature();
    const { w, h } = viewportSize();
    const vp = w > 0 && h > 0 ? buildViewportSignature(w, h) : '0x0';
    const layoutKey = `${ch}:${contentRev}:${sig}`;
    const bypassCache = layoutKey !== lastLayoutRemeasureKey;
    if (bypassCache) lastLayoutRemeasureKey = layoutKey;
    const triggerKey = `${layoutKey}:${vp}`;
    if (triggerKey === lastMeasureTriggerKey) return;
    lastMeasureTriggerKey = triggerKey;
    scheduleRemeasure({
      immediate: w <= 0 || h <= 0,
      bypassCache,
      force: true,
    });
  });

  /** 正文 DOM 首次就绪后再测（每章仅一次，优先走缓存） */
  createEffect(() => {
    contentRootReady();
    const ch = viewerState.chapterIndex;
    if (!idleContentRoot) return;
    const l = layout();
    if (l?.chapterIndex === ch && l.segments.length > 0) return;
    if (remeasureScheduledForChapter === ch) return;
    remeasureScheduledForChapter = ch;
    scheduleRemeasure({ immediate: true, bypassCache: false, force: true });
  });

  createEffect(() => {
    const book = viewerState.book;
    const catalog = viewerState.catalog;
    const ch = viewerState.chapterIndex;
    const cfg = viewerState.config;
    const outerW = viewportEl?.clientWidth ?? 0;
    if (!book || outerW <= 0) return;
    const inset = textViewerPagedContentInsets(cfg);
    const pageWindow = readPagedPageWindowMetrics({
      viewportEl,
      clipEl,
      contentSlotEl,
      fallbackInsets: inset,
    });
    const layoutWidth =
      contentSlotEl && contentSlotEl.clientWidth > 0
        ? contentSlotEl.clientWidth
        : Math.max(1, outerW - inset.left - inset.right);
    if (layoutWidth <= 0 || pageWindow.viewportHeight <= 0) return;
    scheduleAdjacentChapterLayoutPrefetch({
      book,
      catalog,
      chapterIndex: ch,
      viewportWidth: layoutWidth,
      viewportHeight: pageWindow.viewportHeight,
      config: cfg,
    });
  });

  onMount(() => {
    requestAnimationFrame(() => {
      if (viewportEl) {
        syncViewportSize(viewportEl.clientWidth, viewportEl.clientHeight);
      }
    });
    void document.fonts?.ready.then(() =>
      scheduleRemeasure({ immediate: false, bypassCache: false, force: true }),
    );
  });

  createEffect(() => {
    if (turnStage() !== 'idle' || !idleContentRoot) return;
    const images = idleContentRoot.querySelectorAll('img');
    let imageRemeasureTimer: ReturnType<typeof setTimeout> | undefined;
    const onLoad = () => {
      if (imageRemeasureTimer !== undefined) clearTimeout(imageRemeasureTimer);
      imageRemeasureTimer = setTimeout(
        () => scheduleRemeasure({ immediate: false, bypassCache: true }),
        300,
      );
    };
    images.forEach((img) => img.addEventListener('load', onLoad, { passive: true }));
    onCleanup(() => {
      if (imageRemeasureTimer !== undefined) clearTimeout(imageRemeasureTimer);
      images.forEach((img) => img.removeEventListener('load', onLoad));
    });
  });

  createEffect(() => {
    if (skipChapterPosSync) return;
    const total = pageCount();
    const pos = total <= 1 ? 0 : pageIndex() / (total - 1);
    textViewerStore.setChapterPos(pos);
    if (progressSaveTimer !== undefined) clearTimeout(progressSaveTimer);
    progressSaveTimer = setTimeout(() => {
      void textViewerStore.saveProgress().catch(console.error);
      progressSaveTimer = undefined;
    }, 500);
  });

  const showPagedLoading = () => {
    if (isCrossChapterTurnActive()) return false;
    if (viewerState.contentFetching || viewerState.contentBootstrapping) return true;
    if (viewerState.contentLoading && !viewerState.showContent) return true;
    const l = layout();
    return l != null && l.chapterIndex !== viewerState.chapterIndex;
  };

  createEffect(() => {
    viewerState.chapterIndex;
    if (crossChapterCommitInFlight) return;
    if (crossChapterTurn) {
      if (!crossChapterTurn.chapterCommitted) return;
      lastMeasureTriggerKey = '';
      lastLayoutRemeasureKey = '';
      remeasureScheduledForChapter = -1;
      lastClipLayoutOuterH = 0;
      warmAdjacentLayoutsFromPool();
      kickoffCrossChapterTurn();
      scheduleRemeasure({
        immediate: true,
        bypassCache: false,
        force: true,
        allowDuringTurn: true,
      });
      return;
    }
    lastMeasureTriggerKey = '';
    lastLayoutRemeasureKey = '';
    remeasureScheduledForChapter = -1;
    progressRestoredKey = '';
    lastClipLayoutOuterH = 0;
    skipChapterPosSync = true;
    cancelAnimFrame();
    clearTurnPageCurtain(turnLayerEl, curtainSlideMountEl);
    turnCurtainKey = '';
    setTurnStage('idle');
    setPageIndex(0);
    setChapterLayout(null);
    idleContentRoot = undefined;
    idleContentRootChapter = -1;
    idleContentRevision = '';
    clearChapterLayoutCache();
    cancelAdjacentChapterLayoutPrefetch();
    setPagedLayoutEngine('idle');
    queueMicrotask(() => {
      skipChapterPosSync = false;
    });
  });

  /** 跨章翻页：新章排版就绪后启动 incoming 动画 */
  createEffect(() => {
    if (!crossChapterTurn) return;
    layout();
    viewerState.chapterIndex;
    viewerState.showContent;
    viewerState.content;
    contentRootReady();
    kickoffCrossChapterTurn();
  });

  /** 跨章期间 Solid 重绘可能 detach 幕帘，需挂回 */
  createEffect(() => {
    if (!crossChapterTurn) return;
    viewerState.chapterIndex;
    viewerState.content;
    pageIndex();
    turnStage();
    queueMicrotask(syncTurnCurtainAfterRender);
  });

  /** 仅在新章节排版首次就绪时，从 chapterPos 恢复页码（翻页后不再重置） */
  createEffect(() => {
    if (crossChapterTurn) return;
    const ch = viewerState.chapterIndex;
    const l = layout();
    if (!l || l.chapterIndex !== ch || l.segments.length === 0) return;
    const key = `${ch}`;
    if (progressRestoredKey === key) return;
    progressRestoredKey = key;
    const starts = l.pageStarts;
    if (starts.length === 0) return;
    const pos = viewerState.chapterPos;
    const total = Math.max(1, starts.length);
    const target =
      total <= 1 ? 0 : Math.round(Math.max(0, Math.min(1, pos)) * (total - 1));
    skipChapterPosSync = true;
    setPageIndex(target);
    queueMicrotask(() => {
      skipChapterPosSync = false;
    });
  });

  createEffect(() => {
    local.onRegisterNav?.({ goNextPage, goPrevPage, setPageProgress });
  });

  createEffect(() => {
    const stage = turnStage();
    if (stage !== 'anim') return;
    turnDir();
    pageIndex();
    turnFrom();
    turnTo();
    queueMicrotask(syncTurnCurtainAfterRender);
  });

  createEffect(() => {
    const stage = turnStage();
    if (stage !== 'drag') return;
    turnDir();
    pageIndex();
    turnFrom();
    turnTo();
    queueMicrotask(syncTurnCurtainAfterRender);
  });

  createEffect(() => {
    const stage = turnStage();
    if (stage !== 'anim') return;
    if (anim() === 'slide') return;
    turnDir();
    const progress = turnProgress();
    syncCurtainLayerTransform('anim', progress);
  });

  let resizeObserver: ResizeObserver | undefined;

  onCleanup(() => {
    resizeObserver?.disconnect();
    cancelAnimFrame();
    clearCrossChapterLayoutTimer();
    clearTurnPageCurtain(turnLayerEl, curtainSlideMountEl);
    cancelAdjacentChapterLayoutPrefetch();
    if (progressSaveTimer !== undefined) clearTimeout(progressSaveTimer);
    if (remeasureDebounceTimer !== undefined) clearTimeout(remeasureDebounceTimer);
    setPagedLayoutEngine('idle');
  });

  const anim = () => local.pageAnim();

  /** 纯覆盖模式：翻页时在内容区被揭起的一侧显示书脊边线 */
  const isCoverTurnEdgeVisible = () =>
    anim() === 'cover' && turnStage() !== 'idle';

  const renderCoverTurnEdge = () => (
    <Show when={isCoverTurnEdgeVisible()}>
      <div
        class={cn(
          'reader-paged-cover-edge pointer-events-none absolute inset-y-0',
          turnDir() === 'next'
            ? 'reader-paged-cover-edge-right'
            : 'reader-paged-cover-edge-left',
        )}
      />
    </Show>
  );

  /** 翻页/拖拽时 turn-layer 在 content-slot 外缘透明，需用主题色遮住下方 incoming 页 */
  const renderTurnGutterBackdrop = (
    themeCls: ReturnType<typeof theme>,
    inset: TextViewerPagedContentInsets,
  ) => (
    <Show when={turnVisualActive() && anim() !== 'slide'}>
      {inset.left > 0 ? (
        <div
          class={cn(
            'reader-paged-turn-gutter pointer-events-none absolute inset-y-0 left-0 z-0',
            themeCls.bg,
          )}
          style={{ width: `${inset.left}px` }}
        />
      ) : null}
      {inset.right > 0 ? (
        <div
          class={cn(
            'reader-paged-turn-gutter pointer-events-none absolute inset-y-0 right-0 z-0',
            themeCls.bg,
          )}
          style={{ width: `${inset.right}px` }}
        />
      ) : null}
      {inset.top > 0 ? (
        <div
          class={cn(
            'reader-paged-turn-gutter pointer-events-none absolute inset-x-0 top-0 z-0',
            themeCls.bg,
          )}
          style={{ height: `${inset.top}px` }}
        />
      ) : null}
      {inset.bottom > 0 ? (
        <div
          class={cn(
            'reader-paged-turn-gutter pointer-events-none absolute inset-x-0 bottom-0 z-0',
            themeCls.bg,
          )}
          style={{ height: `${inset.bottom}px` }}
        />
      ) : null}
    </Show>
  );

  const catalogLength = () => viewerState.catalog.length;
  const isAtFirstChapter = () => viewerState.chapterIndex <= 0;
  const isAtLastChapter = () =>
    catalogLength() <= 0 || viewerState.chapterIndex >= catalogLength() - 1;

  /** 能否向上一页/上一章拖（向右拖） */
  const canDragTowardPrev = (fromPage: number) =>
    fromPage > 0 || !isAtFirstChapter();

  /** 能否向下一页/下一章拖（向左拖） */
  const canDragTowardNext = (fromPage: number) =>
    fromPage < pageCount() - 1 || !isAtLastChapter();

  const dragIntentFromOffset = (offset: number): PagedTurnDirection | 'neutral' => {
    if (offset < -DRAG_DIRECTION_DEADZONE_PX) return 'next';
    if (offset > DRAG_DIRECTION_DEADZONE_PX) return 'prev';
    return 'neutral';
  };

  const clampDragOffset = (rawDx: number, fromPage: number) => {
    let offset = rawDx;
    if (offset < 0 && !canDragTowardNext(fromPage)) return 0;
    if (offset > 0 && !canDragTowardPrev(fromPage)) return 0;
    if (offset < 0 && fromPage >= pageCount() - 1 && isAtLastChapter()) offset *= 0.35;
    if (offset > 0 && fromPage <= 0 && isAtFirstChapter()) offset *= 0.35;
    return offset;
  };

  const resetActiveDragTurn = () => {
    clearTurnPageCurtain(turnLayerEl, curtainSlideMountEl);
    turnCurtainKey = '';
    dragOffsetPxRef = 0;
    clearSlidePanelStyles();
    setTurnProgress(0);
    setTurnStage('idle');
    skipChapterPosSync = true;
    setPageIndex(dragStartPageIndex);
    setTurnFrom(dragStartPageIndex);
    setTurnTo(dragStartPageIndex);
    queueMicrotask(() => {
      skipChapterPosSync = false;
      if (anim() === 'slide') restoreContentSlotPagedLayout();
    });
    dragTurnInitialized = false;
    clearCrossChapterTurn();
    syncCurtainLayerTransform('idle', 0);
  };

  const applyDragTurnProgress = (offset: number) => {
    const turn = crossChapterTurn;
    if (
      turn &&
      turnStage() === 'drag' &&
      viewerState.chapterIndex === turn.fromChapterIndex
    ) {
      if (anim() === 'slide') {
        dragOffsetPxRef = offset;
        if (turn.incomingLayout && !turn.chapterCommitted) {
          syncSlideTurnVisuals('drag', offset);
        } else {
          syncCurtainLayerTransform('drag', 0, offset);
        }
        return;
      }
      const w = width();
      const ratio = w > 0 ? Math.min(1, Math.abs(offset) / w) : 0;
      syncCurtainLayerTransform('drag', ratio);
      return;
    }
    if (anim() === 'slide') {
      dragOffsetPxRef = offset;
      syncSlideTurnVisuals('drag', offset);
      return;
    }
    const w = width();
    const ratio = w > 0 ? Math.min(1, Math.abs(offset) / w) : 0;
    syncCurtainLayerTransform('drag', ratio);
  };

  const beginCrossChapterDragTurn = (
    fromPage: number,
    dir: PagedTurnDirection,
    offset: number,
  ) => {
    crossChapterTurn = {
      direction: dir,
      fromChapterIndex: viewerState.chapterIndex,
      fromPage,
      targetPage: dir === 'next' ? 0 : null,
      animRunning: false,
      outgoingLayout: untrack(layout),
      pendingDragStartPx: offset,
      incomingChapterIndex: -1,
      incomingContent: '',
      incomingLayout: null,
      chapterCommitted: false,
      stagingPainted: false,
    };
    dragTurnInitialized = true;
    setTurnFrom(fromPage);
    setTurnTo(fromPage);
    setTurnDir(dir);
    if (liveInnerEl) beginTurnCurtain(fromPage, liveInnerEl);
    setTurnStage('drag');
    dragOffsetPxRef = offset;
    setTurnProgress(offset);
    applyDragTurnProgress(offset);
    void prepareCrossChapterStaging(dir).then(() => {
      if (crossChapterTurn) {
        kickoffCrossChapterTurn();
        if (turnStage() === 'drag') {
          applyDragTurnProgress(dragOffsetPxRef);
        }
      }
    });
  };

  const initDragTurn = (fromPage: number, dir: PagedTurnDirection, offset: number) => {
    const crossNext =
      dir === 'next' && fromPage >= pageCount() - 1 && !isAtLastChapter();
    const crossPrev =
      dir === 'prev' && fromPage <= 0 && !isAtFirstChapter();
    if (crossNext || crossPrev) {
      beginCrossChapterDragTurn(fromPage, dir, offset);
      return;
    }

    const to =
      dir === 'next'
        ? Math.min(fromPage + 1, pageCount() - 1)
        : Math.max(fromPage - 1, 0);
    const outgoingRoot = liveInnerEl;
    dragTurnInitialized = true;
    setTurnFrom(fromPage);
    setTurnTo(to);
    setTurnDir(dir);
    if (to !== fromPage && outgoingRoot) {
      beginTurnCurtain(fromPage, outgoingRoot);
      skipChapterPosSync = true;
      setPageIndex(to);
      queueMicrotask(() => {
        skipChapterPosSync = false;
        if (anim() === 'slide' && turnStage() === 'drag') {
          syncSlideTurnVisuals('drag', dragOffsetPxRef);
        }
      });
    }
    setTurnStage('drag');
    dragOffsetPxRef = offset;
    setTurnProgress(offset);
    applyDragTurnProgress(offset);
  };

  const width = viewportWidth;

  const onPointerDown = (e: PointerEvent) => {
    if (turnStage() === 'anim' || crossChapterTurn || e.button !== 0) return;
    if (turnStage() === 'drag') {
      resetActiveDragTurn();
    }
    dragPointerId = e.pointerId;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartPageIndex = pageIndex();
    dragTurnInitialized = false;
    dragAxis = 'none';
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (dragPointerId !== e.pointerId || turnStage() === 'anim') return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (dragAxis === 'none') {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      dragAxis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      if (dragAxis === 'y') return;
    }
    if (dragAxis !== 'x') return;
    e.stopPropagation();

    const w = width();
    if (w <= 0) return;

    const idx = dragStartPageIndex;
    const offset = clampDragOffset(dx, idx);
    const intent = dragIntentFromOffset(offset);

    if (dragTurnInitialized && turnStage() === 'drag') {
      if (intent === 'neutral') {
        resetActiveDragTurn();
        setTurnProgress(offset);
        return;
      }
      if (intent !== turnDir()) {
        resetActiveDragTurn();
      }
    }

    if (intent === 'neutral') {
      setTurnProgress(offset);
      return;
    }

    if (!dragTurnInitialized) {
      initDragTurn(idx, intent, offset);
      return;
    }

    if (anim() === 'slide') {
      applyDragTurnProgress(offset);
    } else {
      setTurnProgress(offset);
      applyDragTurnProgress(offset);
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (dragPointerId !== e.pointerId) return;
    dragPointerId = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (turnStage() !== 'drag') return;

    const offset = anim() === 'slide' ? dragOffsetPxRef : turnProgress();
    const w = width();
    const commitThreshold = textViewerPagedDragCommitThresholdPx(w, viewerState.config);
    const commit = w > 0 && Math.abs(offset) >= commitThreshold;

    if (commit) {
      if (offset < 0) {
        if (!canDragTowardNext(dragStartPageIndex)) {
          finishTurn(dragStartPageIndex);
          return;
        }
        if (dragStartPageIndex < pageCount() - 1) {
          commitDragTurn(dragStartPageIndex + 1, 'next');
        } else if (!isAtLastChapter()) {
          commitCrossChapterTurn('next', dragStartPageIndex, offset);
        } else {
          finishTurn(dragStartPageIndex);
        }
        return;
      }
      if (offset > 0) {
        if (!canDragTowardPrev(dragStartPageIndex)) {
          finishTurn(dragStartPageIndex);
          return;
        }
        if (dragStartPageIndex > 0) {
          commitDragTurn(dragStartPageIndex - 1, 'prev');
        } else if (!isAtFirstChapter()) {
          commitCrossChapterTurn('prev', dragStartPageIndex, offset);
        } else {
          finishTurn(dragStartPageIndex);
        }
        return;
      }
    }

    finishTurn(dragStartPageIndex);
  };

  const liveChapterContentMountKey = createMemo(() => {
    const ch = viewerState.chapterIndex;
    const rev = buildContentRevision(viewerState.content);
    viewerState.showContent;
    return [`${ch}:${rev}`];
  });

  const bindIdleContentRoot = (root: HTMLElement | null | undefined) => {
    if (!root) return;
    const ch = viewerState.chapterIndex;
    const rev = buildContentRevision(viewerState.content);
    if (
      root === idleContentRoot &&
      idleContentRootChapter === ch &&
      idleContentRevision === rev
    ) {
      return;
    }
    idleContentRoot = root;
    idleContentRootChapter = ch;
    idleContentRevision = rev;
    setContentRootReady((n) => n + 1);
    if (crossChapterTurn?.chapterCommitted) {
      queueMicrotask(() => kickoffCrossChapterTurn());
    }
  };

  const showIncomingStaging = () => {
    const turn = crossChapterTurn;
    if (!turn?.incomingLayout || turn.chapterCommitted) return false;
    return turn.animRunning || turnStage() !== 'idle';
  };

  const renderIncomingStagingChapter = () => {
    const turn = crossChapterTurn;
    if (!showIncomingStaging()) return null;

    const page = turn!.targetPage ?? (turn!.direction === 'next' ? 0 : 0);
    const il = turn!.incomingLayout!;
    const y = Math.round(il.pageStarts[page] ?? 0);
    const extent = il.contentExtent;
    const turning = turnVisualActive();

    let extraTransform: string | undefined;
    if (turning && anim() !== 'slide') {
      extraTransform = readerPagedLayerTransform(
        anim(),
        'incoming',
        turnDir(),
        turnAnimProgress(),
      );
    }

    return (
      <div
        class={cn(
          'reader-paged-incoming-inner absolute inset-0 z-[1] h-full w-full overflow-hidden pointer-events-none',
          theme().bg,
        )}
        ref={() => {
          if (crossChapterTurn && !crossChapterTurn.stagingPainted) {
            crossChapterTurn.stagingPainted = true;
            queueMicrotask(() => kickoffCrossChapterTurn());
          }
        }}
      >
        <div
          class="h-full w-full"
          style={{
            transform: mergePagedContentTransforms(y, extraTransform) || undefined,
            'min-height': extent > 0 ? `${extent}px` : undefined,
            'will-change': turning && anim() !== 'slide' ? 'transform' : undefined,
          }}
        >
          <ReaderContent
            {...contentProps}
            measureBlocks
            pagedLayout
            dualPage={pagedLayoutDualPage()}
            stagedChapter={{
              chapterIndex: turn!.incomingChapterIndex,
              content: turn!.incomingContent,
              chapterTitle: chapterTitleAt(turn!.incomingChapterIndex),
            }}
          />
        </div>
      </div>
    );
  };

  const renderLiveChapter = () => {
    const page = incomingDisplayPage();
    const extent = contentExtentPx();
    const turning = turnVisualActive();

    let extraTransform: string | undefined;
    if (turning && anim() !== 'cover' && anim() !== 'slide') {
      extraTransform = readerPagedLayerTransform(
        anim(),
        'incoming',
        turnDir(),
        turnAnimProgress(),
      );
    }

    const transform = mergePagedContentTransforms(contentOffsetY(page), extraTransform);
    const slideActive = slideTurnActive();
    const turn = crossChapterTurn;
    const hideLive = Boolean(turn && showIncomingStaging());

    return (
      <div
        ref={(el) => {
          liveInnerEl = el;
        }}
        class={cn('reader-paged-live-inner h-full w-full', theme().bg)}
        style={{
          transform: slideActive
            ? mergePagedContentTransforms(contentOffsetY(page))
            : transform || undefined,
          'min-height': extent > 0 ? `${extent}px` : undefined,
          'will-change': turning && !slideActive ? 'transform' : undefined,
          visibility: hideLive ? 'hidden' : undefined,
        }}
      >
        <Index each={liveChapterContentMountKey()}>
          {() => (
            <div
              ref={(el) => {
                const root =
                  el?.querySelector<HTMLElement>('[data-reader-content]') ??
                  el ??
                  null;
                bindIdleContentRoot(root);
              }}
            >
              <ReaderContent
                {...contentProps}
                measureBlocks
                pagedLayout
                dualPage={pagedLayoutDualPage()}
              />
            </div>
          )}
        </Index>
      </div>
    );
  };

  const renderPagedWindow = () => {
    const themeCls = theme();
    const pageWindowH = pageWindowHeightForDisplay();
    const contentClipH = pageContentClipPx();
    const slotInset = pagedSlotInsetFromConfig();
    const slideActive = slideTurnActive();

    return (
      <div
        class={cn(
          'reader-paged-window absolute inset-0 box-border h-full w-full overflow-hidden',
          themeCls.bg,
          themeCls.text,
        )}
      >
        <div
          ref={(el) => {
            clipEl = el;
            const outer = viewportEl?.clientHeight ?? 0;
            if (!el || outer <= 0 || outer === lastClipLayoutOuterH) return;
            lastClipLayoutOuterH = outer;
            requestAnimationFrame(() => {
              scheduleRemeasure({ immediate: true, bypassCache: true, force: true });
            });
          }}
          class="reader-paged-clip relative box-border h-full overflow-hidden"
          style={pagedClipStyle()}
        >
          <div
            ref={(el) => {
              turnLayerEl = el;
            }}
            class="reader-paged-turn-layer pointer-events-none absolute inset-0 overflow-hidden"
          >
            {renderTurnGutterBackdrop(themeCls, slotInset)}
            <div
              ref={(el) => {
                curtainSlideMountEl = el;
              }}
              class={cn(
                'reader-paged-curtain-slide-mount absolute overflow-hidden box-border',
                anim() === 'slide' && 'inset-0',
              )}
              style={anim() === 'slide' ? undefined : pagedContentSlotStyle(slotInset)}
            />
            {renderCoverTurnEdge()}
          </div>
          <div
            ref={(el) => {
              contentSlotEl = el;
            }}
            class="reader-text-content-slot absolute z-[2] overflow-hidden box-border"
            style={
              slideActive
                ? readerTextContentSlotSlidePanelStyle(slotInset)
                : pagedContentSlotStyle(slotInset)
            }
          >
            <div
              class={cn(
                'reader-paged-page-window relative w-full overflow-hidden',
                themeCls.bg,
                themeCls.text,
                pageWindowH == null && 'h-full',
              )}
              style={pageWindowH != null ? { height: `${pageWindowH}px` } : undefined}
            >
              <div
                class="reader-paged-page-content-clip relative w-full overflow-hidden"
                style={{ height: `${contentClipH}px` }}
              >
                {renderLiveChapter()}
                {renderIncomingStagingChapter()}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={(el) => {
        viewportEl = el;
        syncViewportSize(el.clientWidth, el.clientHeight);
        resizeObserver?.disconnect();
        resizeObserver = new ResizeObserver(() => {
          const w = el.clientWidth;
          const h = el.clientHeight;
          if (
            Math.abs(w - lastViewportW) < VIEWPORT_RESIZE_EPS_PX &&
            Math.abs(h - lastViewportH) < VIEWPORT_RESIZE_EPS_PX
          ) {
            return;
          }
          lastViewportW = w;
          lastViewportH = h;
          syncViewportSize(w, h);
          scheduleRemeasure({ immediate: true, bypassCache: true });
        });
        resizeObserver.observe(el);
        lastViewportW = el.clientWidth;
        lastViewportH = el.clientHeight;
      }}
      class={cn(
        'reader-paged-viewport relative h-full min-h-0 w-full overflow-hidden',
        theme().bg,
        theme().text,
      )}
      data-dual-page={pagedLayoutDualPage() ? '' : undefined}
      style={{ 'touch-action': 'pan-x pinch-zoom' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div class={cn('relative z-10 h-full min-h-0 w-full', theme().bg)}>
        {renderPagedWindow()}
        <Show when={showPagedLoading()}>
          <div
            class={cn(
              'reader-paged-loading absolute inset-0 z-30 overflow-hidden',
              theme().bg,
              theme().text,
            )}
          >
            <div class="reader-paged-clip relative h-full overflow-hidden" style={pagedClipStyle()}>
              <div
                class="reader-text-content-slot absolute z-[2] overflow-hidden box-border"
                style={pagedContentSlotStyle(contentInset())}
              >
                <ReaderContentSkeleton />
              </div>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
