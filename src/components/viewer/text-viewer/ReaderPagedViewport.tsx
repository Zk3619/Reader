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
  type JSX,
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
import {
  type CurlPoint,
  type SimulationCurlDirection,
  clearSimulationCurl,
  computeCurlCorner,
  computeSimulationCurl,
  legadoSimulationTouchY,
  mountSimulationNextAreaPanel,
  clearSimulationNextAreaPanel,
  simulationAnimEndTouch,
  simulationAnimStartPoint,
  simulationDragCommitAllowed,
  simulationDragIntentFromOffset,
  updateSimulationCurl,
} from '@/lib/media/text/reader-paged-simulation-curl';
import { readerThemeClasses } from '@/lib/media/text/reader-theme-classes';
import type { TextViewerPageAnim, TextViewerPagedContentInsets } from '@/lib/media/text/reader-ui-config';
import {
  textViewerDualPageActiveInViewport,
  textViewerDualPageMeasureIntent,
  textViewerPagedContentInsets,
  textViewerPagedDragCommitThresholdPx,
} from '@/lib/media/text/reader-ui-config';
import {
  applyDualSpreadPageTransforms,
  dualSpreadColumnPaneStyle,
  dualSpreadContainerStyle,
  dualSpreadYOffset,
  neutralizeDualSpreadTransforms,
  READER_PAGED_DUAL_SHIFT_CLASS,
  READER_PAGED_DUAL_PANE_LEFT_CLASS,
  READER_PAGED_DUAL_PANE_RIGHT_CLASS,
  type DualSpreadYOffset,
} from '@/lib/media/text/reader-paged-dual-spread';
import {
  columnShowsChapterTitleOnSpreadPage,
  contentBlockIndicesForSpreadPage,
  dualSpreadColumnWidthPx,
  dualSpreadMeasureHostStyle,
} from '@/lib/media/text/text-viewer-paginate-dual';
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
  readPagedSpreadContentWidthPx,
} from '@/lib/media/text/reader-paged-clip-measure';
import { cn } from '@/lib/utils';
import type { ReaderPagedNavApi } from '@/components/viewer/text-viewer/reader-paged-nav';
import { buildPagedBookmarkSnapshot } from '@/lib/media/text/reader-bookmark';
import { consumePagedChapterEntry } from '@/lib/media/text/reader-paged-chapter-entry';
import {
  dualSpreadColumnContentSpanPx,
  lastNonBlankPageIndex,
  pageContentSpanPx,
  resolvePagedMeasureRoot,
} from '@/lib/media/text/text-viewer-paginate';

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
  /** incomingLayout 加载时的拖拽/提交方向；须与 turnDir 一致才展示 staging */
  stagingDirection?: PagedTurnDirection;
  /** true = 已走 store 切章（缓存未命中时的回退路径） */
  chapterCommitted: boolean;
  stagingPainted: boolean;
  /** 是否已请求提交（松手过阈值/点击翻页）；false 时仅做拖拽预览，不自动播放切章动画 */
  commitRequested: boolean;
  /** 递增以作废进行中的 prepareCrossChapterStaging / waitForIncomingMeasureLayout */
  prepareGeneration: number;
};

export interface ReaderPagedViewportProps extends ReaderContentProps {
  pageAnim: Accessor<TextViewerPageAnim>;
  onRequestPrevChapter: () => void | Promise<void>;
  onRequestNextChapter: () => void | Promise<void>;
  onRegisterNav?: (api: ReaderPagedNavApi) => void;
  /** 章节展示标题（含替换净化）；缺省用目录原始 title */
  resolveChapterTitle?: (index: number) => string | undefined;
}

export function ReaderPagedViewport(props: ReaderPagedViewportProps) {
  const [local, contentProps] = splitProps(props, [
    'pageAnim',
    'onRequestPrevChapter',
    'onRequestNextChapter',
    'onRegisterNav',
    'resolveChapterTitle',
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
  /** 跨章 staging 就绪/精修时 bump，驱动 Solid 重绘（incomingLayout 存于非响应式对象） */
  const [crossChapterStagingTick, setCrossChapterStagingTick] = createSignal(0);
  /** 仿真 prev：屏外幕帘克隆宿主页码（仅用于 clone，不驱动 live 渲染） */
  const [curtainCloneHostPage, setCurtainCloneHostPage] = createSignal<number | null>(null);

  let viewportEl: HTMLDivElement | undefined;
  let clipEl: HTMLDivElement | undefined;
  let contentSlotEl: HTMLDivElement | undefined;
  let liveInnerEl: HTMLDivElement | undefined;
  let curtainCloneHostInnerEl: HTMLDivElement | undefined;
  let dualLeftShiftEl: HTMLDivElement | undefined;
  let dualRightShiftEl: HTMLDivElement | undefined;
  let dualSpreadTransformRaf = 0;
  let idleContentRoot: HTMLElement | undefined;
  let dualMeasureContentEl: HTMLElement | undefined;
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
  let dualMeasureRetryRaf = 0;
  let dualMeasureRetryChapter = -1;
  let lastViewportW = 0;
  let lastViewportH = 0;
  let lastClipLayoutOuterH = 0;

  let dragPointerId: number | null = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPageIndex = 0;
  let dragTurnInitialized = false;
  /** 仿真 prev 幕帘 DOM 未就绪前，禁止卷曲/重复 initDragTurn */
  let turnCurtainPrepInFlight = false;
  let turnCurtainPrepToken = 0;
  let dragAxis: 'none' | 'x' | 'y' = 'none';
  /** 滑动拖拽像素偏移；避免每帧 setTurnProgress 触发 Solid 重绘 */
  let dragOffsetPxRef = 0;
  let crossChapterTurn: CrossChapterTurnState | null = null;
  let crossChapterLayoutTimer: ReturnType<typeof setTimeout> | undefined;
  /** 仿真卷曲：最近指针 client 坐标 + 页脚 + 动画段插值参数 */
  let simPointerClientX = 0;
  let simPointerClientY = 0;
  let simCorner: CurlPoint | null = null;
  let curlAnim:
    | {
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      cornerX: number;
      cornerY: number;
      initial: number;
    }
    | null = null;
  /** finishTurn 异步切章期间，阻止 chapterIndex effect 重置排版 */
  let crossChapterCommitInFlight = false;
  let idleContentRootChapter = -1;
  let idleContentRevision = '';

  const pagedSlotInsetFromConfig = (): TextViewerPagedContentInsets =>
    textViewerPagedContentInsets(viewerState.config);

  /** 视口正文内宽（不读可能被宽 shift 撑大的 slot，也不触发双栏判定） */
  const viewportSpreadContentWidthPx = (): number =>
    readPagedSpreadContentWidthPx({
      viewportEl,
      contentSlotEl,
      fallbackInsets: pagedSlotInsetFromConfig(),
    });

  /** 按页双栏：宽屏 + 横屏/≥1280px（对齐设置页 dualPage 说明） */
  const pagedLayoutDualPage = () =>
    textViewerDualPageActiveInViewport(
      viewerState.config.dualPage ?? 'auto',
      viewportSpreadContentWidthPx(),
      pageWindowMetrics().viewportHeight,
    );

  /** 双栏测量/排版意图（视口高度未就绪时仍为 true，避免 1px 测量根） */
  const dualPageMeasureIntent = () => {
    viewportSize();
    const spreadW = viewportSpreadContentWidthPx();
    const vh =
      pageWindowMetrics().viewportHeight > 0
        ? pageWindowMetrics().viewportHeight
        : viewportSize().h;
    return textViewerDualPageMeasureIntent(
      viewerState.config.dualPage ?? 'auto',
      spreadW,
      vh,
    );
  };

  const layout = () => chapterLayout();

  /** 跨章 drag/anim 期间：incoming 用预排版；须 staging 方向与 turnDir 一致 */
  const pagingLayout = () => {
    crossChapterStagingTick();
    const turn = crossChapterTurn;
    if (
      turn?.incomingLayout &&
      !turn.chapterCommitted &&
      turn.stagingDirection === turnDir() &&
      viewerState.chapterIndex === turn.fromChapterIndex
    ) {
      return turn.incomingLayout;
    }
    return layout();
  };

  const pagingChapterIndex = () => {
    crossChapterStagingTick();
    const turn = crossChapterTurn;
    if (
      turn?.incomingLayout &&
      !turn.chapterCommitted &&
      turn.stagingDirection === turnDir() &&
      viewerState.chapterIndex === turn.fromChapterIndex
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
  const slotContentInnerWidth = (): number => {
    if (pagedLayoutDualPage()) {
      return viewportSpreadContentWidthPx();
    }
    const fallbackInsets = pagedSlotInsetFromConfig();
    const outerWidth = viewportEl?.clientWidth ?? 0;
    const fallback = Math.max(1, outerWidth - fallbackInsets.left - fallbackInsets.right);
    if (!contentSlotEl || contentSlotEl.clientWidth <= 0) return fallback;
    const padLeft = parseFloat(contentSlotEl.style.paddingLeft) || 0;
    const padRight = parseFloat(contentSlotEl.style.paddingRight) || 0;
    const inner = Math.round(contentSlotEl.clientWidth - padLeft - padRight);
    return inner > 0 ? inner : fallback;
  };

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
    const pageWindow = pageWindowMetrics();
    const w = slotContentInnerWidth() || viewportSize().w;
    const h = pageWindow.viewportHeight || viewportSize().h;
    return buildReaderLayoutSignature(viewerState.config, {
      dualPage: pagedLayoutDualPage() || dualPageMeasureIntent(),
      viewportWidth: w,
      viewportHeight: h,
    });
  });

  /** 当前视口模式下的章节排版是否完整（双页须 dualPage + rightPageStarts + segments） */
  const isChapterLayoutComplete = (
    l: ReaderChapterLayout | null | undefined,
    ch: number,
  ): boolean => {
    if (!l || l.chapterIndex !== ch || l.segments.length === 0) return false;
    if (pagedLayoutDualPage()) {
      if (!l.dualPage) return false;
      if (!l.rightPageStarts?.length) return false;
    }
    return true;
  };

  const normalizeAppliedLayout = (next: ReaderChapterLayout): ReaderChapterLayout => {
    if (
      pagedLayoutDualPage() &&
      next.segments.length > 0 &&
      (next.rightPageStarts?.length ?? 0) > 0
    ) {
      return { ...next, dualPage: true };
    }
    return next;
  };

  const currentChapterTitle = () => {
    const idx = viewerState.chapterIndex;
    const resolved = local.resolveChapterTitle?.(idx);
    if (resolved?.trim()) return resolved;
    return viewerState.catalog[idx]?.title;
  };

  const chapterTitleAt = (index: number) => {
    const resolved = local.resolveChapterTitle?.(index);
    if (resolved?.trim()) return resolved;
    return viewerState.catalog[index]?.title;
  };

  /** 跨章 prev 落点：跳过尾部空白页，不改动全局 pageStarts */
  const prevChapterLandingPage = (l: ReaderChapterLayout) =>
    lastNonBlankPageIndex(l.pageStarts, l.segments, l.contentExtent);

  const buildIncomingChapterLayout = (
    chapterIndex: number,
    content: string,
    chapterTitle?: string,
  ): ReaderChapterLayout | null => {
    const pageWindow = pageWindowMetrics();
    const layoutWidth = slotContentInnerWidth();
    const height = pageWindow.viewportHeight;
    if (height <= 0 || layoutWidth <= 0 || !content.trim()) return null;

    const cacheKey = buildChapterLayoutCacheKey({
      chapterIndex,
      contentRevision: buildContentRevision(content),
      layoutSignature: buildReaderLayoutSignature(viewerState.config, {
        dualPage: pagedLayoutDualPage(),
        viewportWidth: layoutWidth,
        viewportHeight: height,
      }),
      viewportSignature: buildViewportSignature(layoutWidth, height),
      chapterTitle,
    });
    const cached = getCachedChapterLayout(cacheKey);
    if (cached && isChapterLayoutComplete(cached, chapterIndex)) return cached;

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
    if (!isChapterLayoutComplete(next, chapterIndex)) return null;
    return next;
  };

  const layoutIncomingChapterFromMeasureHost = (
    chapterIndex: number,
    content: string,
    chapterTitle?: string,
  ): ReaderChapterLayout | null => {
    const pageWindow = pageWindowMetrics();
    const layoutWidth = slotContentInnerWidth();
    const height = pageWindow.viewportHeight;
    if (height <= 0 || layoutWidth <= 0 || !content.trim()) return null;
    if (!pagedLayoutDualPage()) {
      return buildIncomingChapterLayout(chapterIndex, content, chapterTitle);
    }
    if (!measureHostColumnWidthReady()) return null;
    const root =
      dualMeasureContentEl ??
      viewportEl?.querySelector<HTMLElement>(
        '.reader-dual-measure-host [data-reader-content]',
      );
    if (!(root instanceof HTMLElement) || !measureRootHasUsableBlocks(root)) {
      return null;
    }
    if (dualMeasureContentEl !== root) bindDualMeasureContentRoot(root);
    const layout = withMeasureNeutralOffset(() =>
      layoutReaderChapter({
        chapterIndex,
        content,
        chapterTitle,
        viewportWidth: layoutWidth,
        viewportHeight: height,
        config: viewerState.config,
        contentRoot: root,
        bypassCache: true,
        refineWithDom: true,
        dualPage: true,
        padTop: pageWindow.padTop,
        padBottom: pageWindow.padBottom,
        clipHeightPx: pageWindow.clipHeight,
        horizontalInsetOnSlot: true,
      }),
    );
    if (!isChapterLayoutComplete(layout, chapterIndex)) return null;
    return normalizeAppliedLayout({ ...layout, isLayoutComplete: true });
  };

  const isCrossChapterPrepareCurrent = (
    turn: CrossChapterTurnState,
    prepareToken: number,
    direction?: PagedTurnDirection,
  ): boolean => {
    if (crossChapterTurn !== turn) return false;
    if (turn.prepareGeneration !== prepareToken) return false;
    if (direction != null && turn.direction !== direction) return false;
    return true;
  };

  const waitForIncomingMeasureLayout = async (
    chapterIndex: number,
    content: string,
    chapterTitle: string | undefined,
    turn: CrossChapterTurnState,
    prepareToken: number,
  ): Promise<ReaderChapterLayout | null> => {
    for (let i = 0; i < 240; i += 1) {
      if (!isCrossChapterPrepareCurrent(turn, prepareToken)) return null;
      if (turn.incomingChapterIndex !== chapterIndex) return null;
      const layout = layoutIncomingChapterFromMeasureHost(
        chapterIndex,
        content,
        chapterTitle,
      );
      if (layout) return layout;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    if (!isCrossChapterPrepareCurrent(turn, prepareToken)) return null;
    if (turn.incomingChapterIndex !== chapterIndex) return null;
    return buildIncomingChapterLayout(chapterIndex, content, chapterTitle);
  };

  const applyLayout = (next: ReaderChapterLayout, fromCache: boolean) => {
    const normalized = normalizeAppliedLayout(next);
    const prev = untrack(layout);
    setPagedLayoutEngine(normalized.engine);
    setPagedLayoutCacheHit(fromCache);
    const prevComplete = isChapterLayoutComplete(prev, normalized.chapterIndex);
    const nextComplete = isChapterLayoutComplete(normalized, normalized.chapterIndex);
    if (chapterLayoutsEqual(prev, normalized) && prevComplete === nextComplete) return;
    setChapterLayout(normalized);
    setPageIndex((i) => {
      const turn = crossChapterTurn;
      if (turn) {
        if (turn.targetPage != null) return turn.targetPage;
        if (turn.direction === 'next') return 0;
        return prevChapterLandingPage(normalized);
      }
      const max = Math.max(0, normalized.pageStarts.length - 1);
      return i <= max ? i : max;
    });
  };

  const withMeasureNeutralOffset = <T,>(fn: () => T): T => {
    const el = liveInnerEl;
    const prevTransform = el?.style.transform ?? '';
    const prevMargin = el?.style.marginTop ?? '';
    const restoreDual = pagedLayoutDualPage()
      ? neutralizeDualSpreadTransforms(dualLeftShiftEl, dualRightShiftEl)
      : null;
    if (el) {
      el.style.marginTop = '0';
      el.style.transform = 'translate3d(0, 0, 0)';
    }
    try {
      return fn();
    } finally {
      restoreDual?.();
      if (el) {
        el.style.marginTop = prevMargin;
        el.style.transform = prevTransform;
      }
    }
  };

  /** 测量块须非零高度，否则 segments 恒为空 */
  const measureRootHasUsableBlocks = (
    contentRoot: HTMLElement | null | undefined,
  ): boolean => {
    if (!contentRoot) return false;
    const body = resolvePagedMeasureRoot(contentRoot);
    const blocks = body.querySelectorAll<HTMLElement>('[data-reader-measure-block]');
    if (blocks.length === 0) return false;
    for (const block of blocks) {
      const rect = block.getBoundingClientRect();
      if (rect.height > 0.5) return true;
    }
    return false;
  };

  const layoutAwaitingMeasure = () => {
    const ch = viewerState.chapterIndex;
    return Boolean(viewerState.content?.trim()) && !isChapterLayoutComplete(layout(), ch);
  };

  const resolveContentRootForLayout = (): HTMLElement | null => {
    if (dualPageMeasureIntent()) {
      if (!measureHostColumnWidthReady()) return null;
      if (dualMeasureContentEl && measureRootHasUsableBlocks(dualMeasureContentEl)) {
        return dualMeasureContentEl;
      }
      return null;
    }

    const candidates: HTMLElement[] = [];
    if (dualMeasureContentEl) candidates.push(dualMeasureContentEl);
    if (idleContentRoot) candidates.push(idleContentRoot);
    const live =
      liveInnerEl?.querySelector<HTMLElement>('[data-reader-content]') ??
      viewportEl?.querySelector<HTMLElement>(
        '.reader-paged-live-inner [data-reader-content]',
      );
    if (live) candidates.push(live);

    for (const root of candidates) {
      if (measureRootHasUsableBlocks(root)) return root;
    }
    return null;
  };

  const dualSpreadColumnGapPx = () => {
    const center = viewerState.config.contentInset?.center ?? 32;
    return center > 0 ? center : 32;
  };

  const dualSpreadMeasureColumnWidthPx = () => {
    const spreadW = viewportSpreadContentWidthPx();
    if (spreadW <= 0) return 0;
    return dualSpreadColumnWidthPx(spreadW, dualSpreadColumnGapPx());
  };

  const measureHostColumnWidthReady = () =>
    dualSpreadMeasureColumnWidthPx() >= 120;

  const dualSpreadLayoutForRender = (
    layoutOverride?: ReaderChapterLayout | null,
  ): ReaderChapterLayout | null => {
    const l = layoutOverride ?? pagingLayout();
    if (!l) return null;
    const ch = layoutOverride ? layoutOverride.chapterIndex : pagingChapterIndex();
    if (l.chapterIndex !== ch) return null;
    if (!pagedLayoutDualPage()) return l;
    return l.dualPage ? l : { ...l, dualPage: true };
  };

  const dualSpreadLayoutReady = (layoutOverride?: ReaderChapterLayout | null) => {
    const l = layoutOverride ?? pagingLayout();
    if (!l) return false;
    const ch = layoutOverride ? layoutOverride.chapterIndex : pagingChapterIndex();
    return isChapterLayoutComplete(l, ch);
  };

  const cancelDualMeasureRetry = () => {
    if (dualMeasureRetryRaf) {
      cancelAnimationFrame(dualMeasureRetryRaf);
      dualMeasureRetryRaf = 0;
    }
    dualMeasureRetryChapter = -1;
  };

  const dualMeasureBlocksReady = (): boolean => {
    if (dualPageMeasureIntent()) {
      if (!measureHostColumnWidthReady()) return false;
      return Boolean(
        dualMeasureContentEl && measureRootHasUsableBlocks(dualMeasureContentEl),
      );
    }
    if (dualMeasureContentEl && measureRootHasUsableBlocks(dualMeasureContentEl)) {
      return true;
    }
    if (idleContentRoot && measureRootHasUsableBlocks(idleContentRoot)) {
      return true;
    }
    return false;
  };

  const bindDualMeasureContentRoot = (root: HTMLElement | null) => {
    if (!root) return;
    const prev = dualMeasureContentEl;
    dualMeasureContentEl = root;
    if (prev !== root || measureRootHasUsableBlocks(root)) {
      setContentRootReady((n) => n + 1);
      scheduleRemeasureWhenMeasureBlocksReady({ bypassCache: true });
    }
  };

  const measureHostMountKey = createMemo(() => {
    crossChapterStagingTick();
    const turn = crossChapterTurn;
    if (
      turn?.incomingContent?.trim() &&
      !turn.chapterCommitted &&
      turn.incomingChapterIndex >= 0
    ) {
      return `incoming:${turn.incomingChapterIndex}:${buildContentRevision(turn.incomingContent)}`;
    }
    viewerState.chapterIndex;
    return `${viewerState.chapterIndex}:${buildContentRevision(viewerState.content)}:${layoutSignature()}`;
  });

  const measureHostStagedChapter = createMemo(() => {
    crossChapterStagingTick();
    const turn = crossChapterTurn;
    if (
      turn?.incomingContent?.trim() &&
      !turn.chapterCommitted &&
      turn.incomingChapterIndex >= 0
    ) {
      return {
        chapterIndex: turn.incomingChapterIndex,
        content: turn.incomingContent,
        chapterTitle: chapterTitleAt(turn.incomingChapterIndex),
      };
    }
    return {
      chapterIndex: viewerState.chapterIndex,
      content: viewerState.content,
      chapterTitle: currentChapterTitle(),
    };
  });

  const measureHostWidthStyle = createMemo(() => {
    viewportSize();
    void contentRootReady();
    if (dualPageMeasureIntent()) {
      return dualSpreadMeasureHostStyle(dualSpreadMeasureColumnWidthPx());
    }
    const w = slotContentInnerWidth();
    const fallback = Math.max(viewportSpreadContentWidthPx(), 320);
    const safeW = w > 1 ? w : fallback;
    return { width: `${Math.round(safeW)}px` };
  });

  /** 测量块随正文异步挂载；须持续重试直至排版完整（非单次 remeasure） */
  const scheduleRemeasureWhenMeasureBlocksReady = (options?: {
    bypassCache?: boolean;
  }) => {
    cancelDualMeasureRetry();
    const ch = viewerState.chapterIndex;
    dualMeasureRetryChapter = ch;
    let frames = 0;

    const tick = () => {
      dualMeasureRetryRaf = 0;
      if (viewerState.chapterIndex !== dualMeasureRetryChapter) return;
      if (turnStage() !== 'idle') {
        dualMeasureRetryRaf = requestAnimationFrame(tick);
        return;
      }
      const l = layout();
      if (isChapterLayoutComplete(l, ch)) return;

      if (!dualMeasureBlocksReady()) {
        frames = 0;
        dualMeasureRetryRaf = requestAnimationFrame(tick);
        return;
      }

      frames += 1;
      if (!remeasureInFlight && frames % 12 === 1) {
        scheduleRemeasure({
          immediate: true,
          bypassCache: options?.bypassCache ?? true,
          force: true,
        });
      }

      dualMeasureRetryRaf = requestAnimationFrame(tick);
    };

    dualMeasureRetryRaf = requestAnimationFrame(tick);
  };

  const visibleBlocksForSpreadColumn = (
    column: 'left' | 'right',
    pageIndex: number,
    layoutOverride?: ReaderChapterLayout | null,
  ): number[] | undefined => {
    const l = dualSpreadLayoutForRender(layoutOverride);
    if (!l || !pagedLayoutDualPage() || l.segments.length === 0) {
      return column === 'left' ? undefined : [];
    }
    const liveClip = clipViewportHeightPx();
    const pick = {
      pageStarts: l.pageStarts,
      rightPageStarts: l.rightPageStarts,
      segments: l.segments,
      dualPage: true as const,
      contentExtent: l.contentExtent,
      clipHeight: liveClip > 0 ? liveClip : l.clipHeight,
      leftColumnExtent: l.leftColumnExtent,
      rightColumnExtent: l.rightColumnExtent,
    };
    const indices = contentBlockIndicesForSpreadPage(
      pick,
      column === 'left' ? 0 : 1,
      pageIndex,
    );
    return indices.length > 0 ? indices : column === 'left' ? undefined : [];
  };

  const showChapterTitleForSpreadColumn = (
    column: 'left' | 'right',
    pageIndex: number,
    layoutOverride?: ReaderChapterLayout | null,
  ): boolean | undefined => {
    const l = dualSpreadLayoutForRender(layoutOverride);
    if (!l || !pagedLayoutDualPage() || l.segments.length === 0) {
      return column === 'left' ? undefined : false;
    }
    const pick = {
      pageStarts: l.pageStarts,
      rightPageStarts: l.rightPageStarts,
      segments: l.segments,
      dualPage: true as const,
      contentExtent: l.contentExtent,
      clipHeight: l.clipHeight,
      leftColumnExtent: l.leftColumnExtent,
      rightColumnExtent: l.rightColumnExtent,
    };
    return columnShowsChapterTitleOnSpreadPage(pick, column === 'left' ? 0 : 1, pageIndex);
  };

  const remeasureAllowed = () => turnStage() === 'idle';

  const remeasure = (options?: { bypassCache?: boolean; syncOnly?: boolean }) => {
    if (!viewportEl || remeasureInFlight || !remeasureAllowed()) {
      return;
    }
    const pageWindow = pageWindowMetrics();
    const height = pageWindow.viewportHeight;
    const outerWidth = viewportEl.clientWidth;
    const layoutWidth = slotContentInnerWidth();
    if (height <= 0 || layoutWidth <= 0) {
      if (viewerState.content?.trim()) {
        scheduleRemeasureWhenMeasureBlocksReady({ bypassCache: true });
      }
      return;
    }

    syncViewportSize(outerWidth, viewportEl.clientHeight);

    remeasureInFlight = true;
    const run = async () => {
      try {
        const contentRoot = resolveContentRootForLayout();

        const cfg = viewerState.config;
        const dual = pagedLayoutDualPage();
        if (dual && !measureHostColumnWidthReady()) {
          scheduleRemeasureWhenMeasureBlocksReady({ bypassCache: true });
          return;
        }
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

        const domMeasure = Boolean(contentRoot);
        const layoutInput = {
          chapterIndex: viewerState.chapterIndex,
          content: viewerState.content,
          chapterTitle: currentChapterTitle(),
          viewportWidth: layoutWidth,
          viewportHeight: height,
          config: cfg,
          contentRoot,
          bypassCache: domMeasure ? true : options?.bypassCache,
          refineWithDom: true,
          dualPage: dual,
          padTop: pageWindow.padTop,
          padBottom: pageWindow.padBottom,
          clipHeightPx: pageWindow.clipHeight,
          horizontalInsetOnSlot: true,
        };

        if (!contentRoot) {
          if (viewerState.content?.trim()) {
            scheduleRemeasureWhenMeasureBlocksReady({ bypassCache: true });
            return;
          }
          applyLayout(
            layoutReaderChapter({ ...layoutInput, dualPage: dual }),
            fromCache,
          );
          return;
        }

        if (options?.syncOnly) {
          const synced = withMeasureNeutralOffset(() =>
            layoutReaderChapter({ ...layoutInput, dualPage: dual }),
          );
          if (
            dual &&
            (synced.segments.length === 0 ||
              (synced.rightPageStarts?.length ?? 0) === 0)
          ) {
            scheduleRemeasureWhenMeasureBlocksReady({ bypassCache: true });
            return;
          }
          applyLayout(synced, fromCache);
          return;
        }

        if (dual) {
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            );
          });
        }

        const nextLayout = withMeasureNeutralOffset(() =>
          layoutReaderChapter({ ...layoutInput, dualPage: dual }),
        );
        const dualLayoutIncomplete =
          dual &&
          (nextLayout.segments.length === 0 ||
            (nextLayout.rightPageStarts?.length ?? 0) === 0);
        if (dualLayoutIncomplete) {
          scheduleRemeasureWhenMeasureBlocksReady({ bypassCache: true });
          return;
        }
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

  const effectiveDualLayout = (l: ReaderChapterLayout): ReaderChapterLayout => {
    if (!pagedLayoutDualPage()) return l;
    if (l.dualPage) return l;
    return { ...l, dualPage: true };
  };

  const spreadOffsetsForPage = (
    page: number,
    layoutOverride?: ReaderChapterLayout | null,
  ): DualSpreadYOffset => {
    const turn = crossChapterTurn;
    if (layoutOverride) return dualSpreadYOffset(effectiveDualLayout(layoutOverride), page);
    if (turn?.outgoingLayout && page === turn.fromPage) {
      return dualSpreadYOffset(effectiveDualLayout(turn.outgoingLayout), page);
    }
    const l = pagingLayout();
    const ch = pagingChapterIndex();
    if (!l || l.chapterIndex !== ch) return { leftY: 0, rightY: 0 };
    return dualSpreadYOffset(effectiveDualLayout(l), page);
  };

  const applyLiveDualSpreadPageTransforms = (
    page: number,
    extraTransform?: string,
    layoutOverride?: ReaderChapterLayout | null,
  ) => {
    // 双栏按 visibleBlockIndices 切片渲染，live pane 仅含当前页块，不可再实测页界
    applyLivePageTransforms(page, extraTransform, layoutOverride);
  };

  const applyLivePageTransforms = (
    page: number,
    extraTransform?: string,
    layoutOverride?: ReaderChapterLayout | null,
  ) => {
    const offsets = spreadOffsetsForPage(page, layoutOverride);
    if (pagedLayoutDualPage()) {
      applyDualSpreadPageTransforms(
        dualLeftShiftEl,
        dualRightShiftEl,
        offsets,
        extraTransform,
      );
      if (liveInnerEl) {
        liveInnerEl.style.transform =
          extraTransform && !offsets.leftY && !offsets.rightY ? extraTransform : '';
        liveInnerEl.style.willChange = extraTransform ? 'transform' : '';
      }
      return;
    }
    if (!liveInnerEl) return;
    liveInnerEl.style.transform =
      mergePagedContentTransforms(offsets.leftY, extraTransform) ?? '';
    liveInnerEl.style.willChange = extraTransform ? 'transform' : '';
  };

  const scheduleDualSpreadPageTransforms = (fn: () => void) => {
    if (dualSpreadTransformRaf) cancelAnimationFrame(dualSpreadTransformRaf);
    dualSpreadTransformRaf = requestAnimationFrame(() => {
      dualSpreadTransformRaf = 0;
      fn();
    });
  };

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
    const layoutWidth = slotContentInnerWidth();
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
    const layoutWidth = slotContentInnerWidth();
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
      return prevChapterLandingPage(turn.incomingLayout);
    }
    const l = layout();
    if (l && l.chapterIndex === viewerState.chapterIndex) {
      return prevChapterLandingPage(l);
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
    const layoutWidth = slotContentInnerWidth();
    if (layoutWidth <= 0 || pageWindow.viewportHeight <= 0) return;
    prefetchAdjacentChapterLayoutsFromPool({
      book,
      catalog,
      chapterIndex: ch,
      viewportWidth: layoutWidth,
      viewportHeight: pageWindow.viewportHeight,
      config: viewerState.config,
      dualPage: pagedLayoutDualPage(),
    });
  };

  const notifyCrossChapterStagingChange = () => {
    setCrossChapterStagingTick((n) => n + 1);
  };

  /** staging 方向与当前 turnDir 一致时才展示相邻章（反向拖/提交时不串页界） */
  const isCrossChapterIncomingVisualActive = () => {
    crossChapterStagingTick();
    const turn = crossChapterTurn;
    return Boolean(
      turn?.incomingLayout &&
      !turn.chapterCommitted &&
      turn.stagingDirection === turnDir(),
    );
  };

  /** 覆盖/滑动：相邻章 staging 就绪后对齐章内翻页，下层切到目标页偏移 */
  const syncCrossChapterDisplayPage = () => {
    const turn = crossChapterTurn;
    if (!turn?.incomingLayout || turn.chapterCommitted) return;
    if (turn.stagingDirection !== turnDir()) return;
    const target = resolveCrossChapterTargetPage();
    if (target == null || pageIndex() === target) return;
    skipChapterPosSync = true;
    setPageIndex(target);
    queueMicrotask(() => {
      skipChapterPosSync = false;
    });
  };

  const incomingDisplayPage = () => {
    crossChapterStagingTick();
    const turn = crossChapterTurn;
    if (isCrossChapterIncomingVisualActive() && turn!.targetPage != null) {
      return turn!.targetPage;
    }
    if (turnStage() !== 'idle') {
      // Legado SimulationPageDelegate PREV：卷曲 prevBitmap，底层 curBitmap（非 turnTo）
      if (anim() === 'simulation' && turnDir() === 'prev') {
        return turnFrom();
      }
      return turnTo();
    }
    return pageIndex();
  };

  /** live 层渲染页：仿真翻页用 turnLiveDisplayPage，其余同 incomingDisplayPage */
  const liveRenderPage = () => {
    if (turnStage() !== 'idle' && anim() === 'simulation') {
      return turnLiveDisplayPage(turnFrom(), turnTo(), turnDir());
    }
    return incomingDisplayPage();
  };

  /**
   * 幕帘 clone 页码：仿真 prev 卷上一页（目标页）；其余模式 outgoing=from。
   * @see legado-own SimulationPageDelegate.onDraw PREV/NEXT
   */
  const turnCurtainClonePage = (
    from: number,
    to: number,
    direction: PagedTurnDirection,
  ) => (anim() === 'simulation' && direction === 'prev' ? to : from);

  /** 翻页期间 live 层展示页：仿真 prev 保持当前页在下层，next/覆盖/滑动展示目标页 */
  const turnLiveDisplayPage = (
    from: number,
    to: number,
    direction: PagedTurnDirection,
  ) => (anim() === 'simulation' && direction === 'prev' ? from : to);

  /** 排版未就绪时不偏移，避免 clipHeight=0 时误算 */
  const contentOffsetY = (page: number) => {
    if (pageClipHeight() <= 0) return 0;
    return spreadOffsetsForPage(page).leftY;
  };

  /** 当前页正文裁切高度：nextStart - pageStart，防止下一页内容漏入 */
  const pageWindowSpanPx = (page: number) => {
    const clip = pageClipHeight();
    const liveClip = clipViewportHeightPx();
    if (clip <= 0 && liveClip <= 0) return null;
    const turn = crossChapterTurn;
    if (turn?.outgoingLayout && page === turn.fromPage) {
      const outgoing = turn.outgoingLayout;
      const spanLayout =
        pagedLayoutDualPage() && !outgoing.dualPage
          ? { ...outgoing, dualPage: true }
          : outgoing;
      return pageContentSpanPx(page, spanLayout, liveClip);
    }
    const l = pagingLayout();
    const ch = pagingChapterIndex();
    if (!l || l.chapterIndex !== ch) {
      return Math.max(1, liveClip);
    }
    const spanLayout =
      pagedLayoutDualPage() && !l.dualPage ? { ...l, dualPage: true } : l;
    return pageContentSpanPx(page, spanLayout, liveClip);
  };

  /** 页窗总高 = 排版区 clipHeight（恒定）；正文裁切另见 pageContentClipPx */
  const pageWindowHeightForDisplay = () => clipViewportHeightPx();

  /** 当前页正文可见高度（≤ 页窗高），避免缩页窗导致“少行” */
  const pageContentClipPx = () =>
    pageWindowSpanPx(incomingDisplayPage()) ?? clipViewportHeightPx();

  const dualSpreadColumnClipPx = (
    page: number,
    column: 'left' | 'right',
    layoutOverride?: ReaderChapterLayout | null,
  ) => {
    const liveClip = clipViewportHeightPx();
    const l = layoutOverride ?? pagingLayout();
    const ch = layoutOverride ? layoutOverride.chapterIndex : pagingChapterIndex();
    if (!l || l.chapterIndex !== ch) {
      return Math.max(1, liveClip);
    }
    const spanLayout =
      pagedLayoutDualPage() && !l.dualPage ? { ...l, dualPage: true } : l;
    return dualSpreadColumnContentSpanPx(page, column, spanLayout, liveClip);
  };

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

  /** 跨章 staging/落点须满足与 idle 相同的双栏完整性，避免占位 layout 冒充就绪 */
  const isCrossChapterLayoutReady = (l: ReaderChapterLayout, ch: number) =>
    isChapterLayoutComplete(l, ch);

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
      clearSimulationCurl(curtainSlideMountEl);
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

  /** 翻页动画进行中：禁止新拖拽/点击翻页；跨章 staging 等待不应算在内 */
  const isTurnAnimating = () =>
    turnStage() === 'anim' || Boolean(crossChapterTurn?.animRunning);

  /** 取消尚未进入动画的跨章翻页（staging 加载、松手后等待动画等） */
  const cancelPendingCrossChapterTurn = () => {
    const turn = crossChapterTurn;
    if (!turn || turn.animRunning) return;
    finishTurn(turn.fromPage, { cancel: true });
  };

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

  /**
   * 预取相邻章正文 + 离线排版用于跨章预览。
   * allowCommitEarly=false（拖拽预览期）：相邻章无缓存时不切 store，仅返回 false 由调用方维持当前页；
   * 默认 true（提交/点击）：无缓存时回退为提前切 store 加载。
   */
  const prepareCrossChapterStaging = async (
    direction: PagedTurnDirection,
    options?: { allowCommitEarly?: boolean },
  ): Promise<boolean> => {
    const turn = crossChapterTurn;
    if (!turn || turn.direction !== direction) return false;
    const prepareToken = ++turn.prepareGeneration;
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
    const content = await resolveAdjacentChapterContent(
      book,
      incomingIdx,
      viewerState.catalog[incomingIdx],
    );

    if (!isCrossChapterPrepareCurrent(turn, prepareToken, direction)) return false;

    const commitEarly = async (): Promise<boolean> => {
      try {
        await requestChapterSwitch(direction);
      } catch {
        return false;
      }
      if (!isCrossChapterPrepareCurrent(turn, prepareToken, direction)) return false;
      turn.chapterCommitted = true;
      turn.incomingChapterIndex = viewerState.chapterIndex;
      turn.incomingContent = viewerState.content;
      turn.incomingLayout = null;
      resetIdleContentBinding();
      return true;
    };

    const deferCommit = options?.allowCommitEarly === false;

    if (!content?.trim()) return deferCommit ? false : commitEarly();

    if (!isCrossChapterPrepareCurrent(turn, prepareToken, direction)) return false;

    turn.incomingChapterIndex = incomingIdx;
    turn.incomingContent = content;
    turn.incomingLayout = null;
    notifyCrossChapterStagingChange();

    const incomingLayout = await waitForIncomingMeasureLayout(
      incomingIdx,
      content,
      title,
      turn,
      prepareToken,
    );
    if (!incomingLayout) return deferCommit ? false : commitEarly();

    if (!isCrossChapterPrepareCurrent(turn, prepareToken, direction)) return false;
    if (turn.incomingChapterIndex !== incomingIdx) return false;

    turn.incomingLayout = incomingLayout;
    turn.stagingDirection = direction;
    turn.targetPage =
      direction === 'next' ? 0 : prevChapterLandingPage(incomingLayout);
    notifyCrossChapterStagingChange();
    syncCrossChapterDisplayPage();
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
        bypassCache: true,
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
    // 用户仍在拖拽且尚未请求提交：只做预览，不抢跑动画。
    // 否则已缓存相邻章预排版极快，拖拽刚起步就自动播完整段切章，丢失跟手预览。
    if (turnStage() === 'drag' && !turn.commitRequested) return;

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
          : l
            ? prevChapterLandingPage(l)
            : 0;
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
    if (isTurnAnimating()) return;
    if (crossChapterTurn) {
      if (
        crossChapterTurn.direction === direction &&
        crossChapterTurn.commitRequested &&
        (crossChapterTurn.animRunning || isCrossChapterStagingReady())
      ) {
        return;
      }
      cancelPendingCrossChapterTurn();
    }
    if (turnStage() === 'drag') {
      cancelPendingCrossChapterTurn();
    } else if (turnStage() !== 'idle') {
      return;
    }

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
      commitRequested: true,
      prepareGeneration: 0,
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
        commitRequested: true,
        prepareGeneration: 0,
      };
    }
    crossChapterTurn.direction = direction;
    crossChapterTurn.fromPage = fromPage;
    crossChapterTurn.pendingDragStartPx = dragStartPx;
    // 松手过阈值：正式请求提交，允许动画接管（drag → anim）。
    crossChapterTurn.commitRequested = true;
    if (crossChapterTurn.targetPage == null && direction === 'next') {
      crossChapterTurn.targetPage = 0;
    }

    const book = viewerState.book;
    const catalog = viewerState.catalog;
    const expectedIncomingIdx =
      book && catalog.length > 0
        ? adjacentChapterIndex(catalog, crossChapterTurn.fromChapterIndex, direction)
        : null;
    const stagingMatchesCommit =
      crossChapterTurn.incomingLayout &&
      crossChapterTurn.stagingDirection === direction &&
      (expectedIncomingIdx == null ||
        crossChapterTurn.incomingChapterIndex === expectedIncomingIdx);
    if (!stagingMatchesCommit) {
      crossChapterTurn.prepareGeneration += 1;
      crossChapterTurn.incomingLayout = null;
      crossChapterTurn.incomingContent = '';
      crossChapterTurn.incomingChapterIndex = -1;
      crossChapterTurn.stagingDirection = undefined;
      crossChapterTurn.targetPage = direction === 'next' ? 0 : null;
      crossChapterTurn.stagingPainted = false;
      notifyCrossChapterStagingChange();
    }

    // 拖拽提交切章：保持翻页视觉态连续（drag → anim），不要置 idle。
    // 置 idle 会让 staging 相邻章被卸载、滑动面板被复位，松手瞬间「硬切」回当前页后才补动画，
    // 表现为切章不跟手翻页。此处仅停止指针跟踪，动画交由 kickoffCrossChapterTurn → startAnimatedTurn 接管；
    // 相邻章排版未就绪时则维持松手位置静止，待就绪再续翻。
    dragPointerId = null;
    dragAxis = 'none';

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

  const finishTurn = (target: number, options?: { cancel?: boolean }) => {
    const turn = crossChapterTurn;
    // cancel=true：松手未过阈值/不可翻，撤销跨章预览且不切 store，回到起始页。
    const pendingCommit = turn && !turn.chapterCommitted && !options?.cancel;
    const commitDir = turn?.direction;
    const stagedLayout = turn?.incomingLayout ?? null;
    const revertPage = turn?.fromPage ?? target;

    cancelAnimFrame();
    skipChapterPosSync = true;
    clearTurnPageCurtain(turnLayerEl, curtainSlideMountEl);
    clearSimulationCurl(curtainSlideMountEl);
    simCorner = null;
    curlAnim = null;
    turnCurtainKey = '';
    dragOffsetPxRef = 0;
    clearSlidePanelStyles();
    setTurnProgress(0);
    setTurnStage('idle');
    dragPointerId = null;
    dragAxis = 'none';
    dragTurnInitialized = false;
    turnCurtainPrepInFlight = false;
    turnCurtainPrepToken += 1;
    setCurtainCloneHostPage(null);
    curtainCloneHostInnerEl = undefined;
    clearCrossChapterTurn();

    const finalize = (page: number) => {
      setPageIndex(page);
      setTurnFrom(page);
      setTurnTo(page);
      queueMicrotask(() => {
        skipChapterPosSync = false;
        if (anim() === 'slide') restoreContentSlotPagedLayout();
        const ch = viewerState.chapterIndex;
        if (!isChapterLayoutComplete(layout(), ch)) {
          scheduleRemeasureWhenMeasureBlocksReady({ bypassCache: true });
        }
      });
    };

    if (pendingCommit && commitDir) {
      crossChapterCommitInFlight = true;
      void (async () => {
        try {
          await requestChapterSwitch(commitDir);
          const ch = viewerState.chapterIndex;
          if (
            stagedLayout &&
            stagedLayout.chapterIndex === ch &&
            isChapterLayoutComplete(stagedLayout, ch)
          ) {
            applyLayout(
              normalizeAppliedLayout({ ...stagedLayout, isLayoutComplete: true }),
              false,
            );
          } else {
            setChapterLayout(null);
          }
          consumePagedChapterEntry();
          finalize(target);
        } catch {
          finalize(revertPage);
        } finally {
          crossChapterCommitInFlight = false;
          scheduleRemeasure({ immediate: true, bypassCache: true, force: true });
        }
      })();
      return;
    }

    if (turn?.chapterCommitted && !options?.cancel) {
      consumePagedChapterEntry();
    }
    finalize(options?.cancel ? revertPage : target);
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

  const readRenderedPage = (root: HTMLElement | undefined): number | null => {
    if (!root) return null;
    const raw = root.getAttribute('data-reader-render-page');
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const domRootHasPageContent = (root: HTMLElement, targetPage: number): boolean => {
    const content =
      root.querySelector<HTMLElement>('[data-reader-content]') ??
      root.querySelector<HTMLElement>('.reader-body');
    if (!content) return false;
    if (pagedLayoutDualPage() && dualSpreadLayoutReady()) {
      const l = layout();
      if (!l) return false;
      const leftIndices = visibleBlocksForSpreadColumn('left', targetPage, l);
      if (!leftIndices || leftIndices.length === 0) return false;
      return content.querySelector('.reader-p, h2, figure') != null;
    }
    return content.querySelector('.reader-p, h2, figure, [data-reader-measure-block]') != null;
  };

  const isDomReadyForPage = (
    targetPage: number,
    root?: HTMLElement | undefined,
  ): boolean => {
    const el = root ?? liveInnerEl;
    if (!el) return false;
    const rendered = readRenderedPage(el);
    if (rendered !== targetPage) return false;
    return domRootHasPageContent(el, targetPage);
  };

  const waitForCurtainPrepPaint = (
    targetPage: number,
    rootOrGetter?: HTMLElement | undefined | (() => HTMLElement | undefined),
  ): Promise<void> =>
    new Promise((resolve) => {
      let frames = 0;
      const resolveRoot = () =>
        typeof rootOrGetter === 'function' ? rootOrGetter() : rootOrGetter;
      const tick = () => {
        frames += 1;
        const root = resolveRoot() ?? liveInnerEl;
        if (isDomReadyForPage(targetPage, root) || frames >= 96) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      queueMicrotask(() => requestAnimationFrame(tick));
    });

  const afterSolidPaint = (): Promise<void> =>
    new Promise((resolve) => {
      queueMicrotask(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });
    });

  /** Legado PREV drawNextPageAreaAndShadow(curBitmap)：path1 显式贴当前页 */
  const mountSimulationPrevNextArea = (livePage: number, cloneRoot: HTMLElement) => {
    if (anim() !== 'simulation' || !curtainSlideMountEl) return;
    clearSimulationNextAreaPanel(curtainSlideMountEl);
    mountSimulationNextAreaPanel(
      curtainSlideMountEl,
      cloneRoot,
      pagedLayoutDualPage() ? 0 : pageStartPxForTurn(livePage),
      {
        contentSpanPx: pageWindowSpanPx(livePage) ?? pageClipHeight(),
        contentInsetPx: contentInset(),
      },
    );
  };

  /** 仿真 prev：幕帘从屏外宿主 clone 上一页；live 全程保持当前页 */
  const prepareTurnCurtainLayers = (
    from: number,
    to: number,
    direction: PagedTurnDirection,
    cloneSource?: HTMLElement,
  ): Promise<void> => {
    const source = cloneSource ?? liveInnerEl;
    if (to === from || !source || !turnLayerEl || !curtainSlideMountEl) {
      return Promise.resolve();
    }

    const curtainPage = turnCurtainClonePage(from, to, direction);
    const livePage = turnLiveDisplayPage(from, to, direction);

    const mountCurtainFrom = (cloneRoot: HTMLElement) => {
      turnCurtainKey = '';
      clearTurnPageCurtain(turnLayerEl, curtainSlideMountEl);
      clearSimulationNextAreaPanel(curtainSlideMountEl);
      beginTurnCurtain(curtainPage, cloneRoot);
      if (anim() === 'simulation' && direction === 'prev') {
        mountSimulationPrevNextArea(livePage, source);
      }
    };

    const settleLiveAfterCurtain = (applyTransforms: boolean) => {
      queueMicrotask(() => {
        skipChapterPosSync = false;
        if (!applyTransforms || !liveInnerEl) return;
        if (pagedLayoutDualPage()) {
          applyLiveDualSpreadPageTransforms(livePage);
        } else {
          applyLivePageTransforms(livePage);
        }
      });
    };

    skipChapterPosSync = true;
    if (curtainPage === from) {
      mountCurtainFrom(source);
      settleLiveAfterCurtain(false);
      return Promise.resolve();
    }

    curtainCloneHostInnerEl = undefined;
    setCurtainCloneHostPage(curtainPage);
    return afterSolidPaint()
      .then(() => waitForCurtainPrepPaint(curtainPage, () => curtainCloneHostInnerEl))
      .then(() => {
        const host = curtainCloneHostInnerEl;
        if (host) {
          mountCurtainFrom(host);
        } else {
          mountCurtainFrom(source);
        }
        setCurtainCloneHostPage(null);
        curtainCloneHostInnerEl = undefined;
        return waitForCurtainPrepPaint(livePage, liveInnerEl);
      })
      .then(() => settleLiveAfterCurtain(true));
  };

  const beginTurnCurtain = (fromPage: number, cloneSource?: HTMLElement) => {
    const source = cloneSource ?? liveInnerEl;
    if (!source || !turnLayerEl || !curtainSlideMountEl) return;
    if (crossChapterTurn && getPersistedTurnSlide()) {
      ensureTurnCurtainAttached(turnLayerEl, curtainSlideMountEl);
      return;
    }
    const startY = pagedLayoutDualPage()
      ? 0
      : pageStartPxForTurn(fromPage, Boolean(crossChapterTurn));
    const spread = spreadOffsetsForPage(fromPage, crossChapterTurn?.outgoingLayout ?? undefined);
    const key = pagedLayoutDualPage()
      ? `${fromPage}:${spread.leftY}:${spread.rightY}`
      : `${fromPage}:${startY}`;
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
          local.pageAnim() === 'cover' ||
            local.pageAnim() === 'slide' ||
            local.pageAnim() === 'simulation'
            ? contentInset()
            : undefined,
        slideViewportPanel:
          local.pageAnim() === 'slide' || local.pageAnim() === 'simulation',
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
      if (pagedLayoutDualPage()) {
        applyLiveDualSpreadPageTransforms(incomingDisplayPage());
      } else {
        applyLivePageTransforms(incomingDisplayPage());
      }
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

  /** 仿真分区 / 卷曲盒：与满视口 turn-layer 对齐的本地坐标与宽度 */
  const simulationInteractionWidth = () =>
    viewportEl?.clientWidth ?? curtainSlideMountEl?.clientWidth ?? 0;

  /** client 坐标 → 卷曲盒（满视口页面板，与 slide/覆盖 turn-layer 同层）本地坐标 */
  const slotLocalPoint = (clientX: number, clientY: number): CurlPoint => {
    const anchor = viewportEl ?? curtainSlideMountEl;
    const rect = anchor?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const simCurlDirection = (): SimulationCurlDirection =>
    turnDir() === 'prev' ? 'prev' : 'next';

  /** 拖拽起点确定页脚（上半/下半 + 方向左右） */
  const armSimCurlCorner = () => {
    const mount = curtainSlideMountEl;
    if (!mount) return;
    const W = mount.clientWidth;
    const H = mount.clientHeight;
    const local = slotLocalPoint(dragStartX, dragStartY);
    simCorner = computeCurlCorner(local.x, local.y, W, H, simCurlDirection());
  };

  /** 渲染一帧仿真卷曲：drag 用真实指点；anim 用 from→to 按进度插值 */
  const renderSimulationCurl = (stage: TurnStage, progressRatio: number) => {
    const mount = curtainSlideMountEl;
    if (!mount) return;
    const W = mount.clientWidth;
    // 卷曲盒 = 满视口页面板（含四边 contentInset 留白），勿用正文裁切小窗高度
    const H = mount.clientHeight;
    if (W <= 0 || H <= 0) return;

    let cornerX: number;
    let cornerY: number;
    let touch: CurlPoint;

    if (stage === 'drag') {
      const dir = simCurlDirection();
      const fallbackStart = simulationAnimStartPoint(dir, W, H);
      const corner =
        simCorner ?? computeCurlCorner(fallbackStart.x, fallbackStart.y, W, H, dir);
      cornerX = corner.x;
      cornerY = corner.y;
      const local = slotLocalPoint(simPointerClientX, simPointerClientY);
      const startLocal = slotLocalPoint(dragStartX, dragStartY);
      const rawY = Math.max(0, Math.min(H, local.y));
      touch = {
        x: Math.max(0, Math.min(W, local.x)),
        y: legadoSimulationTouchY(startLocal.y, rawY, H, simCurlDirection()),
      };
    } else {
      const a = curlAnim;
      if (!a) return;
      cornerX = a.cornerX;
      cornerY = a.cornerY;
      const span = a.initial >= 1 ? 1 : (progressRatio - a.initial) / (1 - a.initial);
      const k = Math.max(0, Math.min(1, span));
      touch = {
        x: a.fromX + (a.toX - a.fromX) * k,
        y: a.fromY + (a.toY - a.fromY) * k,
      };
    }

    const geometry = computeSimulationCurl({
      touchX: touch.x,
      touchY: touch.y,
      cornerX,
      cornerY,
      width: W,
      height: H,
    });
    updateSimulationCurl({
      slideMount: mount,
      geometry,
      useBitmapBack: viewerState.config.pagedTurnUseBitmap,
    });
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
    if (anim() === 'simulation') {
      // 仿真卷曲：不平移整层，改在幕帘上以贝塞尔 clip-path 还原翻起页 + 镜像背面 + 阴影。
      setTurnCurtainTransform(turnLayerEl, undefined);
      renderSimulationCurl(stage, Math.max(0, Math.min(1, progressRatio)));
      // 下层 live：仿真 prev 保持当前页；path1 内容由 mountSimulationNextAreaPanel 承担
      if (liveInnerEl) {
        const livePage = liveRenderPage();
        if (pagedLayoutDualPage()) {
          applyLiveDualSpreadPageTransforms(livePage);
        } else {
          applyLivePageTransforms(livePage);
        }
      }
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

    setTurnFrom(from);
    setTurnTo(target);
    setTurnDir(direction);

    let animInitial = 0;

    const tick = (now: number) => {
      const t = Math.min(
        1,
        animInitial + ((now - animStart) / PAGE_TURN_MS) * (1 - animInitial),
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

    const resumeChapterSync = () => {
      queueMicrotask(() => {
        skipChapterPosSync = false;
        if (animMode === 'slide' && turnStage() === 'anim') {
          syncSlideTurnVisuals('anim', turnProgress());
        }
      });
    };

    const beginAnim = () => {
      const w = viewportEl?.clientWidth ?? 0;
      animInitial =
        options?.dragStartPx != null && w > 0
          ? Math.min(1, Math.abs(options.dragStartPx) / w)
          : 0;

      if (animMode === 'simulation') {
        // 建立卷曲动画段：drag=松手指点；点击=Legado prevPageByAnim/nextPageByAnim 起点。
        const mount = curtainSlideMountEl;
        const W = mount?.clientWidth ?? 0;
        const H = mount?.clientHeight ?? 0;
        const cdir = simCurlDirection();
        const fromPt =
          turnStage() === 'drag'
            ? slotLocalPoint(simPointerClientX, simPointerClientY)
            : simulationAnimStartPoint(cdir, W, H);
        const corner =
          simCorner ?? computeCurlCorner(fromPt.x, fromPt.y, W, H, cdir);
        simCorner = corner;
        const toPt = simulationAnimEndTouch(corner, W, H, cdir);
        curlAnim = {
          fromX: fromPt.x,
          fromY: fromPt.y,
          toX: toPt.x,
          toY: toPt.y,
          cornerX: corner.x,
          cornerY: corner.y,
          initial: animInitial,
        };
      }

      setTurnProgress(animInitial);
      setTurnStage('anim');
      animStart = performance.now();

      if (animMode === 'slide') {
        syncSlideTurnVisuals('anim', animInitial);
      }

      animFrame = requestAnimationFrame(tick);
    };

    if (options?.skipCurtain) {
      ensureTurnCurtainAttached(turnLayerEl, curtainSlideMountEl);
      skipChapterPosSync = true;
      setPageIndex(turnLiveDisplayPage(from, target, direction));
      resumeChapterSync();
      beginAnim();
      return;
    }

    if (turnStage() === 'drag' && getPersistedTurnSlide()) {
      ensureTurnCurtainAttached(turnLayerEl, curtainSlideMountEl);
      skipChapterPosSync = true;
      setPageIndex(turnLiveDisplayPage(from, target, direction));
      resumeChapterSync();
      beginAnim();
      return;
    }

    void prepareTurnCurtainLayers(from, target, direction, liveInnerEl ?? undefined).then(
      beginAnim,
    );
  };

  const runAnimatedTurn = (target: number, direction: PagedTurnDirection) => {
    if (isTurnAnimating()) return;
    if (crossChapterTurn) {
      cancelPendingCrossChapterTurn();
    }
    if (turnStage() === 'drag') {
      cancelPendingCrossChapterTurn();
    }
    if (turnStage() !== 'idle') return;
    startAnimatedTurn(target, direction);
  };

  const commitDragTurn = (target: number, direction: PagedTurnDirection) => {
    const dragStartPx = anim() === 'slide' ? dragOffsetPxRef : turnProgress();
    const fromPage = turnFrom();
    dragPointerId = null;
    dragAxis = 'none';
    if (crossChapterTurn) {
      clearCrossChapterTurn();
      notifyCrossChapterStagingChange();
    }
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

  /** 双栏 spread：Solid 重绘会清空 imperative 右栏镜像，须在页码/正文就绪后同步 */
  createEffect(() => {
    if (!pagedLayoutDualPage()) return;
    const page = incomingDisplayPage();
    pagingLayout();
    contentRootReady();
    crossChapterStagingTick();
    const turning = turnVisualActive();
    const slideActive = slideTurnActive();
    let extraTransform: string | undefined;
    if (
      turning &&
      !slideActive &&
      anim() !== 'cover' &&
      anim() !== 'slide' &&
      anim() !== 'simulation'
    ) {
      extraTransform = readerPagedLayerTransform(
        anim(),
        'incoming',
        turnDir(),
        turnAnimProgress(),
      );
    }
    void page;
    scheduleDualSpreadPageTransforms(() => {
      if (!dualLeftShiftEl || !dualRightShiftEl) return;
      applyLiveDualSpreadPageTransforms(incomingDisplayPage(), extraTransform);
    });
  });

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
    // 跨章翻页提交期间：新章已用 staging 排版（与预取/缓存一致）就地展示，
    // 此处不得再 bypassCache 强制 DOM 重排覆盖，否则切章落点页文字重新分页而抖动。
    // 仍更新去重 key，使该章后续走缓存命中、保持版式稳定。
    if (crossChapterCommitInFlight) return;
    scheduleRemeasure({
      immediate: w <= 0 || h <= 0,
      bypassCache,
      force: true,
    });
  });

  /** 正文 / 测量块就绪后触发排版（测量根不依赖 showContent） */
  createEffect(() => {
    contentRootReady();
    turnStage();
    viewerState.chapterIndex;
    viewerState.content;
    viewerState.contentLoading;
    const ch = viewerState.chapterIndex;
    if (turnStage() !== 'idle') return;
    if (isChapterLayoutComplete(layout(), ch)) return;
    if (!viewerState.content?.trim()) return;
    scheduleRemeasureWhenMeasureBlocksReady({ bypassCache: true });
  });

  /** 测量根栏宽就绪后重测（首帧避免 1px 宽污染排版） */
  createEffect(() => {
    if (!dualPageMeasureIntent()) return;
    const style = measureHostWidthStyle();
    void style.width;
    const ch = viewerState.chapterIndex;
    if (!viewerState.content?.trim()) return;
    if (isChapterLayoutComplete(layout(), ch)) return;
    scheduleRemeasureWhenMeasureBlocksReady({ bypassCache: true });
  });

  /** 双栏：屏外测量根块高就绪后持续重测直至 layout 完整 */
  createEffect(() => {
    if (!dualPageMeasureIntent()) return;
    const key = measureHostMountKey();
    void key;
    viewerState.content;
    const ch = viewerState.chapterIndex;
    if (!viewerState.content?.trim()) return;

    let cancelled = false;
    let frames = 0;

    const poll = () => {
      if (cancelled || viewerState.chapterIndex !== ch) return;
      if (isChapterLayoutComplete(layout(), ch)) return;

      const hostRoot =
        dualMeasureContentEl ??
        viewportEl?.querySelector<HTMLElement>(
          '.reader-dual-measure-host [data-reader-content]',
        );
      if (hostRoot instanceof HTMLElement) {
        if (dualMeasureContentEl !== hostRoot) {
          bindDualMeasureContentRoot(hostRoot);
        }
        if (measureRootHasUsableBlocks(hostRoot) && !remeasureInFlight && frames % 8 === 0) {
          scheduleRemeasure({ immediate: true, bypassCache: true, force: true });
        }
      }

      frames += 1;
      if (frames < 600) requestAnimationFrame(poll);
    };

    requestAnimationFrame(poll);
    onCleanup(() => {
      cancelled = true;
    });
  });

  /** layout.clipHeight 与 content-slot 实测偏差时重测，避免页界按错误窗高计算导致裁字 */
  createEffect(() => {
    if (turnStage() !== 'idle' || crossChapterCommitInFlight) return;
    const l = layout();
    if (!l || !isChapterLayoutComplete(l, viewerState.chapterIndex)) return;
    const liveClip = readPagedPageWindowMetrics({
      viewportEl,
      clipEl,
      contentSlotEl,
      fallbackInsets: pagedSlotInsetFromConfig(),
    }).clipHeight;
    if (liveClip <= 0 || l.clipHeight <= 0) return;
    if (Math.abs(l.clipHeight - liveClip) <= 2) return;
    scheduleRemeasure({ immediate: true, bypassCache: true, force: true });
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
    const layoutWidth = slotContentInnerWidth();
    if (layoutWidth <= 0 || pageWindow.viewportHeight <= 0) return;
    scheduleAdjacentChapterLayoutPrefetch({
      book,
      catalog,
      chapterIndex: ch,
      viewportWidth: layoutWidth,
      viewportHeight: pageWindow.viewportHeight,
      config: cfg,
      dualPage: pagedLayoutDualPage(),
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

  onCleanup(() => {
    cancelDualMeasureRetry();
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
    if (viewerState.contentFetching) return true;
    if (
      viewerState.contentBootstrapping &&
      !viewerState.showContent &&
      !viewerState.content?.trim()
    ) {
      return true;
    }
    if (viewerState.contentLoading && !viewerState.showContent) return true;
    const l = layout();
    if (l != null && l.chapterIndex !== viewerState.chapterIndex) return true;
    if (
      viewerState.showContent &&
      Boolean(viewerState.content?.trim()) &&
      !isChapterLayoutComplete(l, viewerState.chapterIndex)
    ) {
      return true;
    }
    return false;
  };

  createEffect(() => {
    viewerState.chapterIndex;
    if (crossChapterCommitInFlight) return;
    if (crossChapterTurn) {
      if (!crossChapterTurn.chapterCommitted) return;
      lastMeasureTriggerKey = '';
      lastLayoutRemeasureKey = '';
      cancelDualMeasureRetry();
      lastClipLayoutOuterH = 0;
      warmAdjacentLayoutsFromPool();
      kickoffCrossChapterTurn();
      scheduleRemeasure({
        immediate: true,
        bypassCache: true,
        force: true,
        allowDuringTurn: true,
      });
      return;
    }
    lastMeasureTriggerKey = '';
    lastLayoutRemeasureKey = '';
    cancelDualMeasureRetry();
    progressRestoredKey = '';
    lastClipLayoutOuterH = 0;
    skipChapterPosSync = true;
    cancelAnimFrame();
    clearTurnPageCurtain(turnLayerEl, curtainSlideMountEl);
    clearSimulationCurl(curtainSlideMountEl);
    turnCurtainKey = '';
    setTurnStage('idle');
    setPageIndex(0);
    setChapterLayout(null);
    idleContentRoot = undefined;
    dualMeasureContentEl = undefined;
    idleContentRootChapter = -1;
    idleContentRevision = '';
    clearChapterLayoutCache();
    cancelAdjacentChapterLayoutPrefetch();
    setPagedLayoutEngine('idle');
    queueMicrotask(() => {
      if (viewerState.content?.trim()) {
        scheduleRemeasure({ immediate: true, bypassCache: true, force: true });
      }
    });
  });

  /** 测量根随章切换重挂载时丢弃旧 contentRoot 绑定 */
  createEffect(() => {
    void measureHostMountKey();
    dualMeasureContentEl = undefined;
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
    const pos = viewerState.chapterPos;
    const total = Math.max(1, starts.length);
    const target =
      total <= 1 || starts.length === 0
        ? 0
        : Math.round(Math.max(0, Math.min(1, pos)) * (total - 1));
    skipChapterPosSync = true;
    setPageIndex(target);
    queueMicrotask(() => {
      skipChapterPosSync = false;
    });
  });

  const getBookmarkSnapshot = () => {
    const idx = pageIndex();
    return buildPagedBookmarkSnapshot({
      layout: layout(),
      pageIndex: idx,
      chapterHtml: viewerState.content,
      viewportRoot: viewportEl,
      contentRoot: idleContentRoot,
    });
  };

  createEffect(() => {
    local.onRegisterNav?.({
      goNextPage,
      goPrevPage,
      setPageProgress,
      getBookmarkSnapshot,
    });
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
    clearSimulationCurl(curtainSlideMountEl);
    cancelAdjacentChapterLayoutPrefetch();
    if (progressSaveTimer !== undefined) {
      clearTimeout(progressSaveTimer);
      progressSaveTimer = undefined;
    }
    const total = pageCount();
    const pos = total <= 1 ? 0 : pageIndex() / (total - 1);
    textViewerStore.setChapterPos(pos);
    void textViewerStore.saveProgress().catch(console.error);
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
    <Show when={turnVisualActive() && anim() === 'cover'}>
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

  /** 仿真：左区仅 prev、右区仅 next，避免左侧误触下一页 */
  const resolveDragIntent = (offset: number): PagedTurnDirection | 'neutral' => {
    if (anim() !== 'simulation') return dragIntentFromOffset(offset);
    const w = simulationInteractionWidth();
    return simulationDragIntentFromOffset(
      offset,
      slotLocalPoint(dragStartX, dragStartY).x,
      w,
      DRAG_DIRECTION_DEADZONE_PX,
      viewerState.config.simulationDragZonePercent,
    );
  };

  const simulationDragCommitOk = (offset: number) => {
    if (anim() !== 'simulation') return true;
    const w = simulationInteractionWidth();
    return simulationDragCommitAllowed(
      offset,
      slotLocalPoint(dragStartX, dragStartY).x,
      w,
      viewerState.config.simulationDragZonePercent,
    );
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
    clearSimulationCurl(curtainSlideMountEl);
    simCorner = null;
    curlAnim = null;
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
    turnCurtainPrepInFlight = false;
    turnCurtainPrepToken += 1;
    setCurtainCloneHostPage(null);
    curtainCloneHostInnerEl = undefined;
    const hadCrossChapter = crossChapterTurn != null;
    clearCrossChapterTurn();
    if (hadCrossChapter) notifyCrossChapterStagingChange();
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
    if (anim() === 'simulation') {
      syncCurtainLayerTransform('drag', 0);
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
      commitRequested: false,
      prepareGeneration: 0,
    };
    dragTurnInitialized = true;
    setTurnFrom(fromPage);
    setTurnTo(fromPage);
    setTurnDir(dir);
    armSimCurlCorner();
    if (liveInnerEl) beginTurnCurtain(fromPage, liveInnerEl);
    setTurnStage('drag');
    dragOffsetPxRef = offset;
    setTurnProgress(offset);
    applyDragTurnProgress(offset);
    // 拖拽预览阶段只解析已缓存相邻章用于跟手预览；相邻章未缓存不在拖拽中切 store，
    // 推迟到松手提交再加载，避免拖拽途中「立即切换」。
    void prepareCrossChapterStaging(dir, { allowCommitEarly: false }).then((ok) => {
      if (!crossChapterTurn) return;
      if (!ok) return;
      kickoffCrossChapterTurn();
      if (turnStage() === 'drag') {
        applyDragTurnProgress(dragOffsetPxRef);
      }
    });
  };

  const initDragTurn = (fromPage: number, dir: PagedTurnDirection, offset: number) => {
    const crossNext =
      dir === 'next' && fromPage >= pageCount() - 1 && !isAtLastChapter();
    const crossPrev =
      dir === 'prev' && fromPage <= 0 && !isAtFirstChapter();
    if (crossNext || crossPrev) {
      if (crossChapterTurn && !crossChapterTurn.animRunning) {
        cancelPendingCrossChapterTurn();
      }
      beginCrossChapterDragTurn(fromPage, dir, offset);
      return;
    }

    const to =
      dir === 'next'
        ? Math.min(fromPage + 1, pageCount() - 1)
        : Math.max(fromPage - 1, 0);
    const outgoingRoot = liveInnerEl;
    setTurnFrom(fromPage);
    setTurnTo(to);
    setTurnDir(dir);
    armSimCurlCorner();
    const finishDragStart = () => {
      dragTurnInitialized = true;
      setTurnStage('drag');
      dragOffsetPxRef = offset;
      setTurnProgress(offset);
      applyDragTurnProgress(offset);
    };
    if (to !== fromPage && outgoingRoot) {
      turnCurtainPrepInFlight = true;
      const prepToken = ++turnCurtainPrepToken;
      void prepareTurnCurtainLayers(fromPage, to, dir, outgoingRoot)
        .then(() => {
          if (prepToken !== turnCurtainPrepToken) return;
          turnCurtainPrepInFlight = false;
          if (turnStage() !== 'idle') return;
          finishDragStart();
        })
        .catch(() => {
          if (prepToken !== turnCurtainPrepToken) return;
          turnCurtainPrepInFlight = false;
          setCurtainCloneHostPage(null);
          curtainCloneHostInnerEl = undefined;
        });
      return;
    }
    finishDragStart();
  };

  const width = viewportWidth;

  const onPointerDown = (e: PointerEvent) => {
    if (isTurnAnimating() || e.button !== 0) return;
    if (turnStage() === 'drag') {
      resetActiveDragTurn();
    }
    dragPointerId = e.pointerId;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    simPointerClientX = e.clientX;
    simPointerClientY = e.clientY;
    simCorner = null;
    dragStartPageIndex = pageIndex();
    dragTurnInitialized = false;
    dragAxis = 'none';
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (dragPointerId !== e.pointerId || isTurnAnimating() || turnCurtainPrepInFlight) return;
    simPointerClientX = e.clientX;
    simPointerClientY = e.clientY;
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
    const intent = resolveDragIntent(offset);

    if (dragTurnInitialized && turnStage() === 'drag') {
      if (intent === 'neutral') {
        resetActiveDragTurn();
        setTurnProgress(offset);
        return;
      }
      if (intent !== turnDir()) {
        resetActiveDragTurn();
        initDragTurn(idx, intent, offset);
        return;
      }
    }

    if (intent === 'neutral') {
      setTurnProgress(offset);
      return;
    }

    if (!dragTurnInitialized) {
      if (crossChapterTurn && !crossChapterTurn.animRunning) {
        cancelPendingCrossChapterTurn();
      }
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

    if (commit && !simulationDragCommitOk(offset)) {
      finishTurn(dragStartPageIndex, { cancel: true });
      return;
    }

    if (commit) {
      if (offset < 0) {
        if (!canDragTowardNext(dragStartPageIndex)) {
          finishTurn(dragStartPageIndex, { cancel: true });
          return;
        }
        if (dragStartPageIndex < pageCount() - 1) {
          commitDragTurn(dragStartPageIndex + 1, 'next');
        } else if (!isAtLastChapter()) {
          commitCrossChapterTurn('next', dragStartPageIndex, offset);
        } else {
          finishTurn(dragStartPageIndex, { cancel: true });
        }
        return;
      }
      if (offset > 0) {
        if (!canDragTowardPrev(dragStartPageIndex)) {
          finishTurn(dragStartPageIndex, { cancel: true });
          return;
        }
        if (dragStartPageIndex > 0) {
          commitDragTurn(dragStartPageIndex - 1, 'prev');
        } else if (!isAtFirstChapter()) {
          commitCrossChapterTurn('prev', dragStartPageIndex, offset);
        } else {
          finishTurn(dragStartPageIndex, { cancel: true });
        }
        return;
      }
    }

    // 未过阈值：撤销（含跨章预览），回到起始页且不切章
    finishTurn(dragStartPageIndex, { cancel: true });
  };

  const liveChapterContentMountKey = createMemo(() => {
    const ch = viewerState.chapterIndex;
    const rev = buildContentRevision(viewerState.content);
    const sig = layoutSignature();
    viewerState.showContent;
    return [`${ch}:${rev}:${sig}:live`];
  });

  const curtainCloneHostMountKey = createMemo(() => {
    const page = curtainCloneHostPage();
    if (page == null) return ['none'];
    const ch = viewerState.chapterIndex;
    const rev = buildContentRevision(viewerState.content);
    const sig = layoutSignature();
    return [`host:${ch}:${rev}:${sig}:${page}`];
  });

  const incomingStagingMountKey = createMemo(() => {
    crossChapterStagingTick();
    const turn = crossChapterTurn;
    if (!turn?.incomingContent?.trim() || turn.incomingChapterIndex < 0) {
      return ['none'];
    }
    return [
      `${turn.incomingChapterIndex}:${buildContentRevision(turn.incomingContent)}:${turn.stagingDirection ?? 'none'}:${turn.prepareGeneration}`,
    ];
  });

  const bindIdleContentRoot = (root: HTMLElement | null | undefined) => {
    if (!root) return;
    const ch = viewerState.chapterIndex;
    const rev = buildContentRevision(viewerState.content);
    const sameBinding =
      root === idleContentRoot &&
      idleContentRootChapter === ch &&
      idleContentRevision === rev;
    if (!sameBinding) {
      idleContentRoot = root;
      idleContentRootChapter = ch;
      idleContentRevision = rev;
      setContentRootReady((n) => n + 1);
    }
    if (layoutAwaitingMeasure()) {
      scheduleRemeasureWhenMeasureBlocksReady({ bypassCache: true });
    }
    if (pagedLayoutDualPage()) {
      scheduleDualSpreadPageTransforms(() => {
        applyLiveDualSpreadPageTransforms(incomingDisplayPage());
      });
    }
    if (crossChapterTurn?.chapterCommitted) {
      queueMicrotask(() => kickoffCrossChapterTurn());
    }
  };

  const showIncomingStaging = () => isCrossChapterIncomingVisualActive();

  /**
   * staging 章 DOM 挂载后用实测排版精修 incomingLayout，使预览页界与切章落点一致
   * （Canvas 预排与 DOM 常有偏差，尤其首/末页）。
   */
  const refineStagingLayoutFromDom = (_contentRoot: HTMLElement) => {
    const turn = crossChapterTurn;
    if (!turn || turn.chapterCommitted || !turn.incomingContent?.trim()) return;
    if (turn.stagingDirection != null && turn.stagingDirection !== turnDir()) return;
    if (turn.incomingChapterIndex < 0) return;

    const refined = layoutIncomingChapterFromMeasureHost(
      turn.incomingChapterIndex,
      turn.incomingContent,
      chapterTitleAt(turn.incomingChapterIndex),
    );
    if (!refined) return;
    if (chapterLayoutsEqual(turn.incomingLayout, refined)) return;
    if (crossChapterTurn !== turn) return;

    turn.incomingLayout = refined;
    turn.stagingDirection = turn.direction;
    turn.targetPage =
      turn.direction === 'next' ? 0 : prevChapterLandingPage(refined);

    notifyCrossChapterStagingChange();
    syncCrossChapterDisplayPage();

    if (turnStage() === 'drag') {
      applyDragTurnProgress(dragOffsetPxRef);
    } else if (turnStage() === 'anim' && anim() === 'slide') {
      syncSlideTurnVisuals('anim', turnProgress());
    }
  };

  const renderDualSpreadContentShell = (options: {
    page: number;
    extent: number;
    layoutOverride?: ReaderChapterLayout | null;
    extraTransform?: string;
    slideActive: boolean;
    turning: boolean;
    hideLive?: boolean;
    bindLiveInner?: boolean;
    innerRef?: (el: HTMLDivElement | undefined) => void;
    onMountContent?: (root: HTMLElement | null) => void;
    leftContent: JSX.Element;
    rightContent: JSX.Element;
  }) => {
    const bindLive = options.bindLiveInner !== false;
    const leftColumnClipH = dualSpreadColumnClipPx(
      options.page,
      'left',
      options.layoutOverride,
    );
    const rightColumnClipH = dualSpreadColumnClipPx(
      options.page,
      'right',
      options.layoutOverride,
    );
    const applySpreadTransforms = () => {
      applyLiveDualSpreadPageTransforms(
        options.page,
        options.slideActive ? undefined : options.extraTransform,
        options.layoutOverride,
      );
    };

    return (
      <div
        ref={(el) => {
          options.innerRef?.(el ?? undefined);
          if (bindLive) liveInnerEl = el;
        }}
        data-reader-render-page={options.page}
        class={cn(
          'reader-paged-live-inner reader-paged-dual-spread relative h-full w-full',
          theme().bg,
        )}
        style={{
          ...dualSpreadContainerStyle(dualSpreadColumnGapPx()),
          visibility: options.hideLive ? 'hidden' : undefined,
        }}
      >
        <div
          class={cn(
            'reader-paged-dual-pane-left absolute inset-y-0 overflow-hidden',
            READER_PAGED_DUAL_PANE_LEFT_CLASS,
          )}
        >
          <div
            class="reader-paged-dual-column-clip w-full overflow-hidden"
            style={{ height: `${leftColumnClipH}px` }}
          >
            <div
              ref={(el) => {
                if (bindLive) dualLeftShiftEl = el ?? undefined;
                if (el) scheduleDualSpreadPageTransforms(applySpreadTransforms);
              }}
              class={READER_PAGED_DUAL_SHIFT_CLASS}
              style={dualSpreadColumnPaneStyle()}
            >
              <div
                ref={(el) => {
                  const root =
                    el?.querySelector<HTMLElement>('[data-reader-content]') ?? el ?? null;
                  options.onMountContent?.(root);
                }}
              >
                {options.leftContent}
              </div>
            </div>
          </div>
        </div>
        <div
          class={cn(
            'reader-paged-dual-pane-right absolute inset-y-0 overflow-hidden',
            READER_PAGED_DUAL_PANE_RIGHT_CLASS,
          )}
          aria-hidden="true"
        >
          <div
            class="reader-paged-dual-column-clip w-full overflow-hidden"
            style={{ height: `${rightColumnClipH}px` }}
          >
            <div
              ref={(el) => {
                if (bindLive) dualRightShiftEl = el ?? undefined;
                if (el) scheduleDualSpreadPageTransforms(applySpreadTransforms);
              }}
              class={READER_PAGED_DUAL_SHIFT_CLASS}
              style={dualSpreadColumnPaneStyle()}
            >
              {options.rightContent}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderIncomingStagingChapter = () => {
    const turn = crossChapterTurn;
    if (!showIncomingStaging()) return null;

    const page = incomingDisplayPage();
    const il = turn!.incomingLayout!;
    const extent = il.contentExtent;
    const turning = turnVisualActive();
    const dual = pagedLayoutDualPage();

    let extraTransform: string | undefined;
    if (turning && anim() !== 'slide' && anim() !== 'simulation') {
      extraTransform = readerPagedLayerTransform(
        anim(),
        'incoming',
        turnDir(),
        turnAnimProgress(),
      );
    }

    const stagingLeft = (
      <Index each={incomingStagingMountKey()}>
        {() => (
          <div
            ref={() => {
              if (crossChapterTurn && !crossChapterTurn.stagingPainted) {
                crossChapterTurn.stagingPainted = true;
                queueMicrotask(() => kickoffCrossChapterTurn());
              }
            }}
          >
            <ReaderContent
              {...contentProps}
              dualPage={false}
              measureBlocks
              pagedLayout
              dualSpreadRender
              showChapterTitle={showChapterTitleForSpreadColumn('left', page, il)}
              visibleBlockIndices={visibleBlocksForSpreadColumn('left', page, il)}
              stagedChapter={{
                chapterIndex: turn!.incomingChapterIndex,
                content: turn!.incomingContent,
                chapterTitle: chapterTitleAt(turn!.incomingChapterIndex),
              }}
            />
          </div>
        )}
      </Index>
    );
    const stagingRight = (
      <Index each={incomingStagingMountKey()}>
        {() => (
          <ReaderContent
            {...contentProps}
            dualPage={false}
            measureBlocks
            pagedLayout
            dualSpreadRender
            showChapterTitle={showChapterTitleForSpreadColumn('right', page, il)}
            visibleBlockIndices={visibleBlocksForSpreadColumn('right', page, il)}
            stagedChapter={{
              chapterIndex: turn!.incomingChapterIndex,
              content: turn!.incomingContent,
              chapterTitle: chapterTitleAt(turn!.incomingChapterIndex),
            }}
          />
        )}
      </Index>
    );

    if (dual) {
      return (
        <div
          class={cn(
            'reader-paged-incoming-inner absolute inset-0 z-1 h-full w-full overflow-hidden pointer-events-none',
            theme().bg,
          )}
        >
          {renderDualSpreadContentShell({
            page,
            extent,
            layoutOverride: il,
            extraTransform,
            slideActive: false,
            turning,
            bindLiveInner: false,
            onMountContent: (root) => {
              if (root) queueMicrotask(() => refineStagingLayoutFromDom(root));
            },
            leftContent: stagingLeft,
            rightContent: stagingRight,
          })}
        </div>
      );
    }

    const y = Math.round(il.pageStarts[page] ?? 0);

    return (
      <div
        class={cn(
          'reader-paged-incoming-inner absolute inset-0 z-1 h-full w-full overflow-hidden pointer-events-none',
          theme().bg,
        )}
      >
        <div
          class="h-full w-full"
          style={{
            transform: mergePagedContentTransforms(y, extraTransform) || undefined,
            'min-height': extent > 0 ? `${extent}px` : undefined,
            'will-change': turning && anim() !== 'slide' ? 'transform' : undefined,
          }}
        >
          <div
            ref={(el) => {
              const root =
                el?.querySelector<HTMLElement>('[data-reader-content]') ?? el ?? null;
              if (root) queueMicrotask(() => refineStagingLayoutFromDom(root));
            }}
          >
            {stagingLeft}
          </div>
        </div>
      </div>
    );
  };

  const renderCurtainCloneHost = () => {
    const page = curtainCloneHostPage();
    if (page == null) return null;
    const extent = contentExtentPx();
    const dual = pagedLayoutDualPage();

    const hostLeftBody = (
      <Index each={curtainCloneHostMountKey()}>
        {() => (
          <ReaderContent
            {...contentProps}
            dualPage={false}
            measureBlocks={false}
            pagedLayout
            dualSpreadRender={dualSpreadLayoutReady()}
            showChapterTitle={showChapterTitleForSpreadColumn('left', page)}
            visibleBlockIndices={
              dualSpreadLayoutReady()
                ? visibleBlocksForSpreadColumn('left', page)
                : undefined
            }
          />
        )}
      </Index>
    );

    const hostRightBody = (
      <Index each={curtainCloneHostMountKey()}>
        {() => (
          <ReaderContent
            {...contentProps}
            dualPage={false}
            measureBlocks={false}
            pagedLayout
            dualSpreadRender={dualSpreadLayoutReady()}
            showChapterTitle={showChapterTitleForSpreadColumn('right', page)}
            visibleBlockIndices={
              dualSpreadLayoutReady()
                ? visibleBlocksForSpreadColumn('right', page)
                : undefined
            }
          />
        )}
      </Index>
    );

    if (dual && dualSpreadLayoutReady()) {
      return (
        <div
          class="reader-paged-curtain-clone-host pointer-events-none absolute -left-[10000px] top-0 h-full w-full overflow-hidden opacity-0"
          aria-hidden="true"
        >
          {renderDualSpreadContentShell({
            page,
            extent,
            slideActive: false,
            turning: false,
            bindLiveInner: false,
            innerRef: (el) => {
              curtainCloneHostInnerEl = el;
            },
            leftContent: hostLeftBody,
            rightContent: hostRightBody,
          })}
        </div>
      );
    }

    const transform = mergePagedContentTransforms(contentOffsetY(page));
    return (
      <div
        class="reader-paged-curtain-clone-host pointer-events-none absolute -left-[10000px] top-0 h-full w-full overflow-hidden opacity-0"
        aria-hidden="true"
      >
        <div
          ref={(el) => {
            curtainCloneHostInnerEl = el;
          }}
          data-reader-render-page={page}
          class={cn('reader-paged-live-inner h-full w-full', theme().bg)}
          style={{
            transform: transform || undefined,
            'min-height': extent > 0 ? `${extent}px` : undefined,
          }}
        >
          <Index each={curtainCloneHostMountKey()}>
            {() => (
              <ReaderContent
                {...contentProps}
                dualPage={false}
                measureBlocks={false}
                pagedLayout
                showChapterTitle={undefined}
              />
            )}
          </Index>
        </div>
      </div>
    );
  };

  const renderLiveChapter = () => {
    const page = liveRenderPage();
    const extent = contentExtentPx();
    const turning = turnVisualActive();

    let extraTransform: string | undefined;
    if (
      turning &&
      anim() !== 'cover' &&
      anim() !== 'slide' &&
      anim() !== 'simulation'
    ) {
      extraTransform = readerPagedLayerTransform(
        anim(),
        'incoming',
        turnDir(),
        turnAnimProgress(),
      );
    }

    const slideActive = slideTurnActive();
    const turn = crossChapterTurn;
    const hideLive = Boolean(turn && showIncomingStaging());

    const dual = pagedLayoutDualPage();

    const leftChapterBody = (
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
              dualPage={false}
              measureBlocks={dualSpreadLayoutReady() || (!dual && layoutAwaitingMeasure())}
              pagedLayout
              dualSpreadRender={dualSpreadLayoutReady()}
              showChapterTitle={showChapterTitleForSpreadColumn('left', page)}
              visibleBlockIndices={
                dualSpreadLayoutReady()
                  ? visibleBlocksForSpreadColumn('left', page)
                  : undefined
              }
            />
          </div>
        )}
      </Index>
    );

    const rightChapterBody = (
      <Index each={liveChapterContentMountKey()}>
        {() => (
          <ReaderContent
            {...contentProps}
            dualPage={false}
            measureBlocks={dualSpreadLayoutReady()}
            pagedLayout
            dualSpreadRender={dualSpreadLayoutReady()}
            showChapterTitle={showChapterTitleForSpreadColumn('right', page)}
            visibleBlockIndices={
              dualSpreadLayoutReady()
                ? visibleBlocksForSpreadColumn('right', page)
                : undefined
            }
          />
        )}
      </Index>
    );

    if (dual) {
      if (dualSpreadLayoutReady()) {
        return renderDualSpreadContentShell({
          page,
          extent,
          extraTransform,
          slideActive,
          turning,
          hideLive,
          leftContent: leftChapterBody,
          rightContent: rightChapterBody,
        });
      }

      if (viewerState.content?.trim()) {
        const interimLeft = (
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
                  dualPage={false}
                  measureBlocks={false}
                  pagedLayout
                  dualSpreadRender
                />
              </div>
            )}
          </Index>
        );
        const interimRight = (
          <Index each={liveChapterContentMountKey()}>
            {() => (
              <ReaderContent
                {...contentProps}
                dualPage={false}
                measureBlocks={false}
                pagedLayout
                dualSpreadRender
                showChapterTitle={false}
                visibleBlockIndices={[]}
              />
            )}
          </Index>
        );
        return renderDualSpreadContentShell({
          page,
          extent,
          extraTransform,
          slideActive,
          turning,
          hideLive,
          leftContent: interimLeft,
          rightContent: interimRight,
        });
      }

      return (
        <div
          ref={(el) => {
            liveInnerEl = el;
          }}
          class={cn('reader-paged-live-inner h-full w-full', theme().bg)}
          aria-hidden="true"
          style={{
            visibility: hideLive ? 'hidden' : undefined,
          }}
        />
      );
    }

    const chapterBody = leftChapterBody;

    const transform = mergePagedContentTransforms(contentOffsetY(page), extraTransform);

    return (
      <div
        ref={(el) => {
          liveInnerEl = el;
        }}
        data-reader-render-page={page}
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
        {chapterBody}
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
                (anim() === 'slide' || anim() === 'simulation') && 'inset-0',
              )}
              style={
                anim() === 'slide' || anim() === 'simulation'
                  ? undefined
                  : pagedContentSlotStyle(slotInset)
              }
            />
            {renderCoverTurnEdge()}
          </div>
          <div
            ref={(el) => {
              contentSlotEl = el;
            }}
            class="reader-text-content-slot absolute z-2 overflow-hidden box-border"
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
                {renderCurtainCloneHost()}
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
        <div
          class="reader-dual-measure-host"
          aria-hidden="true"
          style={measureHostWidthStyle()}
        >
          <Index each={[measureHostMountKey()]}>
            {() => (
              <ReaderContent
                {...contentProps}
                class="w-full"
                measureHost
                stagedChapter={measureHostStagedChapter()}
                onMeasureRoot={bindDualMeasureContentRoot}
                dualPage={false}
                measureAtColumnWidth={dualPageMeasureIntent()}
                measureBlocks
                pagedLayout
              />
            )}
          </Index>
        </div>
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
                class="reader-text-content-slot absolute z-2 overflow-hidden box-border"
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
