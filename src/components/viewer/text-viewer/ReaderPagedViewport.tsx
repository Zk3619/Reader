import {
  createEffect,
  createMemo,
  createSignal,
  Index,
  on,
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
import { getPooledChapterContent } from '@/lib/chapter-cache/chapter-content-pool';
import { ReaderContent, type ReaderContentProps } from '@/components/viewer/text-viewer/ReaderContent';
import { ReaderPagedAloudOverlay } from '@/components/viewer/text-viewer/ReaderPagedAloudOverlay';
import { applyReaderTextContentSlotLayoutStyle, readerTextContentSlotPagedBodyMountStyle, readerTextContentSlotPagedFrameStyle, readerTextContentSlotPagedMountStyle, readerTextContentSlotPaddingStyle, readerTextContentSlotSlidePanelStyle } from '@/components/viewer/text-viewer/reader-text-content-slot';
import { ReaderContentSkeleton } from '@/components/viewer/text-viewer/ReaderContentSkeleton';
import {
  canUsePretextChapterLayout,
  isChapterLayoutCompleteForContent,
  layoutReaderChapter,
  pageCountFromChapterLayout,
  buildReaderLayoutSignature,
  buildPretextChapterImageRevision,
  chapterLayoutWithPageStarts,
  chapterLayoutsEqual,
  needsDomChapterLayout,
  type ReaderChapterLayout,
} from '@/lib/media/text/reader-chapter-layout';
import { attachVisiblePageDomLines } from '@/lib/media/text/attach-visible-page-lines';
import { decodePretextChapterImages } from '@/lib/media/image/pretext-image-intrinsic';
import { layoutDocumentFromChapter } from '@/lib/media/text/pretext-layout-document';
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
import { readerThemeClasses, readerThemePalette } from '@/lib/media/text/reader-theme-classes';
import { ReaderPageTipChrome } from '@/components/viewer/text-viewer/ReaderPageTipChrome';
import type { ReaderPageTipContext } from '@/lib/media/text/reader-page-tip';
import { readerPageTipsCarryWithTurn, readerPageTipContentBudget } from '@/lib/media/text/reader-page-tip';
import { isReaderInlineMeasureImage } from '@/lib/media/image/inline-text-image-size';
import { isMediaViewerInteractiveClick } from '@/lib/media/is-media-viewer-interactive-click';
import {
  isTouchLikePointer,
  markPagedTurnPointerConsumed,
  READER_PAGED_DRAG_AXIS_DEADZONE_PX,
  readerPagedViewportTouchAction,
  resolvePagedDragAxis,
  shouldPreventTouchDefaultForPagedDrag,
  shouldSuppressPagedTapAfterPointer,
} from '@/lib/media/text/reader-paged-pointer-gesture';
import type { TextViewerPageAnim, TextViewerPagedContentInsets } from '@/lib/media/text/reader-ui-config';
import {
  textViewerDualPageMeasureIntent,
  textViewerPagedContentInsets,
  textViewerPagedDragCommitThresholdPx,
  textViewerUsesPretextLayout,
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
  readerPagedIdleContentTransform,
  readerPagedLayerTransform,
  readerPagedSlideIncomingTransform,
  readerPagedSlideOutgoingTransform,
  readerPagedSlideTurnOffsetPx,
  type PagedTurnDirection,
} from '@/lib/media/text/reader-paged-turn-style';
import {
  readPagedPageWindowMetrics,
  readPagedSpreadContentWidthPx,
  readContentSlotInnerHeightPx,
} from '@/lib/media/text/reader-paged-clip-measure';
import {
  pagedMeasureRootHasUsableBlocks,
  pagedMeasureRootLegadoPlaceholdersPending,
  queryPagedMeasureContentRoot,
  queryPagedLiveMeasureContentRoot,
  READER_PAGED_MEASURE_HOST_CLASS,
  readStrictTipBodyClipHeightPx,
  tipBodyReadyForPagedMeasure,
} from '@/lib/media/text/reader-paged-tip-body-measure';
import { cn } from '@/lib/utils';
import type { ReaderPagedNavApi } from '@/components/viewer/text-viewer/reader-paged-nav';
import { buildPagedBookmarkSnapshot } from '@/lib/media/text/reader-bookmark';
import { consumePagedChapterEntry } from '@/lib/media/text/reader-paged-chapter-entry';
import {
  dualSpreadColumnContentSpanPx,
  lastNonBlankPageIndex,
  pageContentSpanPx,
  resolvePagedMeasureRoot,
  trimPageStartsBeforeClipStraddle,
  trimPageStartsToSegmentVisualBounds,
} from '@/lib/media/text/text-viewer-paginate';

const PAGE_TURN_MS = 320;
/** 偏移落入此区间视为未选方向，用于换向时重置翻页态 */
const DRAG_DIRECTION_DEADZONE_PX = 8;
/** 跨章拖拽：超过此位移后再切 staging/live，避免起手瞬间层切换卡顿 */
const CROSS_CHAPTER_DRAG_STAGING_PX = 12;
const LAYOUT_REMEASURE_DEBOUNCE_MS = 200;
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
  /** 自动翻页进行中：禁用拖拽翻页，避免与揭示动画冲突 */
  suppressPointerTurn?: Accessor<boolean>;
  /** 章节展示标题（含替换净化）；缺省用目录原始 title */
  resolveChapterTitle?: (index: number) => string | undefined;
  /** 顶底操作栏是否可见（页眉 follow 模式） */
  chromeBarsVisible?: Accessor<boolean>;
}

export function ReaderPagedViewport(props: ReaderPagedViewportProps) {
  const [local, contentProps] = splitProps(props, [
    'pageAnim',
    'onRequestPrevChapter',
    'onRequestNextChapter',
    'onRegisterNav',
    'suppressPointerTurn',
    'resolveChapterTitle',
    'chromeBarsVisible',
  ]);

  const [pageIndex, setPageIndex] = createSignal(0);
  const [chapterLayout, setChapterLayout] = createSignal<ReaderChapterLayout | null>(null);
  const [viewportSize, setViewportSize] = createSignal({ w: 0, h: 0 });
  const [contentRootReady, setContentRootReady] = createSignal(0);

  const [turnStage, setTurnStage] = createSignal<TurnStage>('idle');
  const [turnFrom, setTurnFrom] = createSignal(0);
  const [turnTo, setTurnTo] = createSignal(0);
  const [turnDir, setTurnDir] = createSignal<PagedTurnDirection>('next');
  /** 跨章 staging 就绪/精修时 bump，驱动 Solid 重绘（incomingLayout 存于非响应式对象） */
  const [crossChapterStagingTick, setCrossChapterStagingTick] = createSignal(0);
  /** 跨章拖拽门槛切换：仅驱动页眉页脚 context，避免整段 staging 重挂载 */
  const [crossChapterDragStagingUnlockTick, setCrossChapterDragStagingUnlockTick] =
    createSignal(0);
  /** tip-body 实测高度（ResizeObserver / ref），驱动 span-clip 响应式重绘 */
  const [tipBodyClipPx, setTipBodyClipPx] = createSignal(0);
  /** 按页骨架遮罩：visible → exiting → hidden，与正文淡入交叉 */
  const [pagedSkeletonPhase, setPagedSkeletonPhase] = createSignal<
    'hidden' | 'visible' | 'exiting'
  >('hidden');
  /** 自动翻页「揭示下一页」：0=关闭，(0,1]=扫描线进度（Legado 顶向下 clip 下一页） */
  const [autoPagerScanRatio, setAutoPagerScanRatio] = createSignal(0);
  /** 仿真 prev：屏外幕帘克隆宿主页码（仅用于 clone，不驱动 live 渲染） */
  const [curtainCloneHostPage, setCurtainCloneHostPage] = createSignal<number | null>(null);

  let viewportEl: HTMLDivElement | undefined;
  let clipEl: HTMLDivElement | undefined;
  let contentFrameEl: HTMLDivElement | undefined;
  let pageTipBodyEl: HTMLDivElement | undefined;
  let contentSlotEl: HTMLDivElement | undefined;
  let tipChromeResizeObserver: ResizeObserver | undefined;
  let tipChromeObservedTargets = new Set<Element>();
  let tipChromeResizeDebounce: ReturnType<typeof setTimeout> | undefined;
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
  let skeletonExitTimer: ReturnType<typeof setTimeout> | undefined;
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
  let dragPointerCaptured = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPageIndex = 0;
  let dragTurnInitialized = false;
  /** 仿真 prev 幕帘 DOM 未就绪前，禁止卷曲/重复 initDragTurn */
  let turnCurtainPrepInFlight = false;
  let turnCurtainPrepToken = 0;
  let dragAxis: 'none' | 'x' | 'y' = 'none';
  /** 自动翻页「揭示下一页」会话 */
  let autoPagerRevealActive = false;
  /** 滑动拖拽像素偏移；覆盖/仿真 anim 用 turnAnimProgressRef，避免每帧触发 Solid 重绘 */
  let dragOffsetPxRef = 0;
  /** 覆盖/仿真 anim 进度 0–1（imperative，不驱动 JSX） */
  let turnAnimProgressRef = 0;
  let incomingStagingTransformEl: HTMLDivElement | undefined;
  let stagingDualLeftShiftEl: HTMLDivElement | undefined;
  let stagingDualRightShiftEl: HTMLDivElement | undefined;
  let crossChapterTurn: CrossChapterTurnState | null = null;
  /** finishTurn 已清 crossChapterTurn 但 live 排版尚未落到新章时的桥接版式 */
  let postTurnStagingLayout: ReaderChapterLayout | null = null;
  /** 跨章拖拽：位移过阈值后才切换 staging/live（避免起手层闪） */
  let crossChapterDragStagingUnlocked = false;
  /** 跨章拖拽：过门槛后才启动相邻章预排版，避免起手异步挂载 staging */
  let crossChapterStagingPrepStarted = false;
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
  /** 仿真卷曲：合并同帧多次 pointermove 为单次 paint */
  let simCurlPaintRaf = 0;
  let simCurlPaintStage: TurnStage = 'idle';
  let simCurlPaintProgress = 0;
  /** 覆盖/滑动拖拽：合并 pointermove 为每帧单次 imperative 绘制 */
  let dragTurnPaintRaf = 0;
  /** 跨章拖拽页眉页脚：推迟到下一帧，避免与 12px 显隐同帧 Solid 重绘 */
  let crossChapterDragFooterSyncRaf = 0;
  /** 覆盖翻页：pointerdown 预挂幕帘 rAF（轻点可取消，避免阻塞九宫格点击） */
  let coverCurtainPrepRaf = 0;
  /** 仿真翻页 live 层已应用的页码，避免每帧重复写 transform */
  let simLiveTransformPage = -1;
  /** finishTurn 异步切章期间，阻止 chapterIndex effect 重置排版 */
  let crossChapterCommitInFlight = false;
  let idleContentRootChapter = -1;
  let idleContentRevision = '';
  /** 当前章骨架已退场后不再因顶栏显隐/重测而重新遮挡 */
  let pagedSkeletonDismissedKey = '';

  const chapterSkeletonKey = () =>
    `${viewerState.chapterIndex}:${buildContentRevision(viewerState.content)}`;

  const isPagedSkeletonDismissed = () =>
    pagedSkeletonDismissedKey === chapterSkeletonKey();

  const pagedSlotInsetFromConfig = (): TextViewerPagedContentInsets =>
    textViewerPagedContentInsets(viewerState.config);

  const pagedFrameFallbackInsets = (): TextViewerPagedContentInsets => {
    const pads = pagedSlotInsetFromConfig();
    return { ...pads, top: 0, bottom: 0 };
  };

  const pageTipContentBudget = () =>
    readerPageTipContentBudget(
      contentFrameEl,
      viewerState.config.pageTips,
      chromeBarsVisible(),
      pageTipBodyEl,
    );

  const pageTipVerticalPads = () => {
    const budget = pageTipContentBudget();
    return { top: budget.headerPad, bottom: budget.footerPad };
  };

  /** 视口正文内宽（不读可能被宽 shift 撑大的 slot，也不触发双栏判定） */
  const viewportSpreadContentWidthPx = (): number => {
    const spreadW = readPagedSpreadContentWidthPx({
      viewportEl,
      contentSlotEl,
      fallbackInsets: pagedSlotInsetFromConfig(),
    });
    const cachedW = viewportSize().w;
    if (cachedW > 0) {
      const insets = pagedSlotInsetFromConfig();
      const cachedSpread = Math.max(
        1,
        Math.round(cachedW - insets.left - insets.right),
      );
      return Math.max(spreadW, cachedSpread);
    }
    return spreadW;
  };

  const isAlwaysDualPageMode = () =>
    (viewerState.config.dualPage ?? 'auto') === 'always';

  /** 始终双栏：须等完整 spread 排版后再展示，避免左栏 interim 像单栏 */
  const pagedDualSpreadAwaitingFullLayout = () =>
    pagedLayoutDualPage() && isAlwaysDualPageMode() && !dualSpreadLayoutReady();

  /** 双栏布局/测量意图（视口高度未就绪时沿用缓存高度，避免单页→双页闪烁） */
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

  /** 按页双栏：与测量意图一致，避免首帧/窗口缩放时先单页后双页 */
  const pagedLayoutDualPage = () => dualPageMeasureIntent();

  const layout = () => chapterLayout();

  /** 跨章 drag/anim 期间：incoming 用预排版；须 staging 方向与 turnDir 一致 */
  const pagingLayout = () => {
    crossChapterStagingTick();
    const turn = crossChapterTurn;
    const live = layout();
    const storeCh = viewerState.chapterIndex;
    if (
      postTurnStagingLayout &&
      postTurnStagingLayout.chapterIndex === storeCh &&
      live?.chapterIndex !== storeCh
    ) {
      return postTurnStagingLayout;
    }
    if (turn?.incomingLayout && turn.stagingDirection === turnDir()) {
      if (!turn.chapterCommitted && storeCh === turn.fromChapterIndex) {
        return turn.incomingLayout;
      }
      // 提前切 store 后 live 排版可能仍滞后一帧，继续用 staging 版式避免 clip=0 白屏
      if (
        turn.chapterCommitted &&
        storeCh === turn.incomingChapterIndex &&
        live?.chapterIndex !== storeCh
      ) {
        return turn.incomingLayout;
      }
    }
    return live;
  };

  const pagingChapterIndex = () => {
    crossChapterStagingTick();
    const turn = crossChapterTurn;
    const storeCh = viewerState.chapterIndex;
    if (
      postTurnStagingLayout &&
      postTurnStagingLayout.chapterIndex === storeCh &&
      layout()?.chapterIndex !== storeCh
    ) {
      return postTurnStagingLayout.chapterIndex;
    }
    if (turn?.incomingLayout && turn.stagingDirection === turnDir()) {
      if (!turn.chapterCommitted && storeCh === turn.fromChapterIndex) {
        return turn.incomingChapterIndex;
      }
      if (
        turn.chapterCommitted &&
        storeCh === turn.incomingChapterIndex &&
        layout()?.chapterIndex !== storeCh
      ) {
        return turn.incomingChapterIndex;
      }
    }
    return storeCh;
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
    const horizontal = pagedSlotInsetFromConfig();
    const tips = pageTipVerticalPads();
    return {
      left: horizontal.left,
      right: horizontal.right,
      top: tips.top,
      bottom: tips.bottom,
    };
  };

  const chromeBarsVisible = () => local.chromeBarsVisible?.() ?? false;

  const pageThemeBg = () => readerThemePalette(viewerState.config.theme).bg;

  /** 与章内翻页一致：仅在 drag/anim 阶段激活翻页视觉；跨章点击已就绪时亦激活以挂载幕帘 */
  const turnVisualActive = () => {
    if (turnStage() !== 'idle') return true;
    if (crossChapterTurn?.animRunning) return true;
    if (
      crossChapterTurn?.commitRequested &&
      crossChapterTurn.incomingLayout
    ) {
      return true;
    }
    if (crossChapterTurn) return false;
    return turnFrom() !== turnTo();
  };

  const turnSlidePanelLayoutActive = () =>
    turnVisualActive() && (anim() === 'slide' || anim() === 'simulation');

  const carryPageTipsWithTurn = () =>
    readerPageTipsCarryWithTurn(viewerState.config.pageTips, chromeBarsVisible());

  const slideTurnPanelEl = () =>
    carryPageTipsWithTurn() ? contentFrameEl : contentSlotEl;

  const turnSlidePanelStyle = () => ({
    'background-color': pageThemeBg(),
  });

  const applyTurnFrameSlideLayout = () => {
    if (!contentFrameEl) return;
    const a = anim();
    if (a !== 'slide' && a !== 'simulation') return;
    applyReaderTextContentSlotLayoutStyle(
      contentFrameEl,
      readerTextContentSlotSlidePanelStyle(),
    );
  };

  const turnCurtainSpanPx = (fromPage: number) => {
    const span = pageWindowSpanPx(fromPage);
    if (span != null && span > 0) return span;
    return clipViewportHeightPx();
  };

  const turnCurtainMountOptions = (fromPage: number) => {
    const carry = carryPageTipsWithTurn();
    const useFrameChrome = carry && Boolean(contentFrameEl);
    return {
      contentSpanPx: turnCurtainSpanPx(fromPage),
      /** 正文区几何由 JSX curtain-slide-mount（pagedBodyMountStyle）承担，幕帘内不再叠 padding */
      contentInsetPx: undefined,
      slideViewportPanel: false,
      pageBg: pageThemeBg(),
      carryPageTips: useFrameChrome,
      frameEl: useFrameChrome ? contentFrameEl : undefined,
    };
  };

  const pageTipBodyHeightPx = (): number | undefined => {
    const dom = readStrictTipBodyClipHeightPx(pageTipBodyEl);
    return dom > 0 ? dom : undefined;
  };

  const strictTipBodyClipHeightPx = () => readStrictTipBodyClipHeightPx(pageTipBodyEl);

  const syncTipBodyClipPxFromDom = () => {
    const h = readStrictTipBodyClipHeightPx(pageTipBodyEl);
    setTipBodyClipPx((prev) => (prev === h ? prev : h));
  };

  /** 与顶栏显隐相同：同步 tip-body 实测并催促 live 首帧绘制，修复缓存章切章后白屏 */
  const syncPagedClipAndRepaint = (page?: number) => {
    syncTipBodyClipPxFromDom();
    if (turnStage() !== 'idle' || turnVisualActive()) return;
    scheduleRemeasure({
      immediate: true,
      bypassCache: true,
      force: true,
      syncOnly: true,
    });
    scheduleIdleLivePagePaint(page ?? incomingDisplayPage());
  };

  const pageWindowMetrics = () =>
    readPagedPageWindowMetrics({
      viewportEl,
      clipEl,
      contentSlotEl,
      pageTipBodyEl,
      contentFrameEl,
      fallbackInsets: pagedFrameFallbackInsets(),
      tipChromePadTop: pageTipVerticalPads().top,
      tipChromePadBottom: pageTipVerticalPads().bottom,
      authoritativeBodyHeightPx: pageTipBodyHeightPx(),
    });

  const pagedViewportSignature = (layoutWidth: number, viewportHeight: number) =>
    `${buildViewportSignature(layoutWidth, viewportHeight, pageWindowMetrics())}|cb${chromeBarsVisible() ? 1 : 0}`;

  const pageTipContext = (): ReaderPageTipContext => {
    const catalog = viewerState.catalog;
    const turn = crossChapterTurn;
    if (showIncomingStaging() && turn?.incomingLayout) {
      const ch = turn.incomingChapterIndex;
      const il = turn.incomingLayout;
      const page = incomingDisplayPage();
      const totalCh = catalog.length;
      const pageTotal = Math.max(1, il.pageStarts.length);
      const bookProgress =
        totalCh > 0
          ? Math.min(1, Math.max(0, (ch + page / pageTotal) / totalCh))
          : 0;
      return {
        bookName: viewerState.book?.name,
        chapterTitle: chapterTitleAt(ch),
        pageIndex: page,
        pageCount: pageTotal,
        bookProgressPercent: bookProgress,
        bookProgressLabel: totalCh > 0 ? `${ch + 1}/${totalCh}` : undefined,
      };
    }
    const ch = viewerState.chapterIndex;
    const totalCh = catalog.length;
    const bookProgress =
      totalCh > 0 ? Math.min(1, Math.max(0, (ch + pageIndex() / Math.max(1, pageCount())) / totalCh)) : 0;
    return {
      bookName: viewerState.book?.name,
      chapterTitle:
        local.resolveChapterTitle?.(ch) ?? catalog[ch]?.title ?? '',
      pageIndex: incomingDisplayPage(),
      pageCount: pageCount(),
      bookProgressPercent: bookProgress,
      bookProgressLabel:
        totalCh > 0 ? `${ch + 1}/${totalCh}` : undefined,
    };
  };

  const pagedClipStyle = () =>
    ({
      height: '100%',
      'box-sizing': 'border-box',
    }) as const;

  const pagedFrameStyle = () => readerTextContentSlotPagedFrameStyle();

  const pagedBodyMountStyle = (inset: TextViewerPagedContentInsets) =>
    readerTextContentSlotPagedBodyMountStyle(inset, pageTipVerticalPads());

  /** turn-layer 边衬：与正文区（页眉页脚之间）对齐，勿用配置里的垂直 contentInset */
  const turnGutterInsets = (): TextViewerPagedContentInsets =>
    carryPageTipsWithTurn()
      ? { top: 0, bottom: 0, left: 0, right: 0 }
      : contentInset();

  /** 幕帘挂载：携带页眉页脚时须满视口，否则仅正文区 */
  const turnCurtainSlideMountActiveStyle = (
    horizontalInset: TextViewerPagedContentInsets,
  ): Record<string, string> =>
    carryPageTipsWithTurn()
      ? readerTextContentSlotPagedFrameStyle()
      : pagedBodyMountStyle(horizontalInset);

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
    const pending = postTurnStagingLayout;
    if (pending && pending.chapterIndex === storeCh && pending.clipHeight > 0) {
      return pending.clipHeight;
    }
    return crossChapterTurn?.outgoingLayout?.clipHeight ?? 0;
  };

  const effectivePagedClipHeightPx = (): number => {
    const tipH = strictTipBodyClipHeightPx();
    if (tipH > 0) {
      return readContentSlotInnerHeightPx(contentSlotEl, tipH);
    }
    if (contentSlotEl && contentSlotEl.clientHeight > 0) {
      return readContentSlotInnerHeightPx(contentSlotEl, contentSlotEl.clientHeight);
    }
    return 0;
  };

  /**
   * 页眉/页脚之间正文带高度：优先 tip-body 实测并扣除 content-slot 上下间距；
   * 排版已完成时用 layout.clipHeight 兜底，避免 renderPagedWindow 在 ref 赋值前算出 span-clip height:0 导致首屏白屏。
   */
  const tipBodyBandHeightPx = (): number => {
    const dom = effectivePagedClipHeightPx();
    if (dom > 0) return dom;
    void tipBodyClipPx();
    const tracked = tipBodyClipPx();
    if (tracked > 0) return tracked;
    const clip = pageClipHeight();
    if (clip > 0) return clip;
    return 0;
  };

  /** 裁切视口内容区高度（与 DOM tip-body / 分页 clipHeight 一致） */
  const clipViewportHeightPx = () => tipBodyBandHeightPx();

  const pageCount = createMemo(() =>
    layout() ? pageCountFromChapterLayout(layout()!) : 1,
  );

  const theme = () => readerThemeClasses(textViewerStore.state.config.theme);

  const pagedViewportThemeStyle = (): Record<string, string> => ({
    'background-color': pageThemeBg(),
    color: readerThemePalette(viewerState.config.theme).text,
    'touch-action': readerPagedViewportTouchAction(),
  });

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
      dualPage: pagedLayoutDualPage(),
      viewportWidth: w,
      viewportHeight: h,
    });
  });

  const pagedUsesPretextLayout = () => textViewerUsesPretextLayout(viewerState.config);

  const canLayoutWithoutMeasureHost = (content: string) =>
    pagedUsesPretextLayout() && canUsePretextChapterLayout(content);

  const chapterLayoutImageRevision = (
    content: string,
    chapterTitle: string | undefined,
    layoutWidth: number,
    height: number,
    dual?: boolean,
  ) =>
    buildPretextChapterImageRevision({
      content,
      config: viewerState.config,
      viewportWidth: layoutWidth,
      viewportHeight: height,
      chapterTitle,
      dualPage: dual ?? pagedLayoutDualPage(),
      horizontalInsetOnSlot: true,
    });

  const buildPagedChapterLayoutCacheKey = (params: {
    chapterIndex: number;
    content: string;
    chapterTitle?: string;
    layoutWidth: number;
    height: number;
    dual?: boolean;
  }) =>
    buildChapterLayoutCacheKey({
      chapterIndex: params.chapterIndex,
      contentRevision: buildContentRevision(params.content),
      layoutSignature: buildReaderLayoutSignature(viewerState.config, {
        dualPage: params.dual ?? pagedLayoutDualPage(),
        viewportWidth: params.layoutWidth,
        viewportHeight: params.height,
      }),
      viewportSignature: pagedViewportSignature(params.layoutWidth, params.height),
      chapterTitle: params.chapterTitle,
      imageRevision: chapterLayoutImageRevision(
        params.content,
        params.chapterTitle,
        params.layoutWidth,
        params.height,
        params.dual,
      ),
    });

  /** 当前视口模式下的章节排版是否完整（双页须 dualPage + rightPageStarts + segments；须 DOM 时校验 engine） */
  const isChapterLayoutComplete = (
    l: ReaderChapterLayout | null | undefined,
    ch: number,
    content?: string,
  ): boolean => {
    const raw = content ?? viewerState.content;
    return isChapterLayoutCompleteForContent(l, ch, raw, {
      dualPage: pagedLayoutDualPage(),
      layoutEngine: viewerState.config.layoutEngine,
    });
  };

  const isProvisionalCanvasLayout = (l: ReaderChapterLayout | null | undefined) =>
    Boolean(
      l &&
        (l.engine === 'canvas' || l.engine === 'pretext') &&
        l.isLayoutComplete === false,
    );

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

  /** 切章瞬间 store 正文可能滞后：优先用章节池内容校验排版 */
  const resolveLayoutContentForChapter = (chapterIndex = viewerState.chapterIndex): string => {
    const inState = viewerState.content?.trim() ?? '';
    if (viewerState.chapterIndex === chapterIndex && inState) return inState;
    const book = viewerState.book;
    if (book) {
      const pooled = getPooledChapterContent(book.bookUrl, chapterIndex);
      if (pooled?.trim()) return pooled;
    }
    return inState;
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

    const cacheKey = buildPagedChapterLayoutCacheKey({
      chapterIndex,
      content,
      chapterTitle,
      layoutWidth,
      height,
    });
    const cached = getCachedChapterLayout(cacheKey);
    if (cached && isChapterLayoutComplete(cached, chapterIndex, content)) return cached;

    const next = layoutReaderChapter({
      chapterIndex,
      content,
      chapterTitle,
      viewportWidth: layoutWidth,
      viewportHeight: height,
      config: viewerState.config,
      contentRoot: null,
      dualPage: pagedLayoutDualPage(),
      padTop: pageWindow.padTop,
      padBottom: pageWindow.padBottom,
      clipHeightPx: pageWindow.clipHeight,
      horizontalInsetOnSlot: true,
    });
    if (!isChapterLayoutComplete(next, chapterIndex, content)) return null;
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
    if (pagedLayoutDualPage() && !pagedUsesPretextLayout() && !measureHostColumnWidthReady()) return null;
    const root = resolveMeasureHostContentRoot();
    if (!(root instanceof HTMLElement) || !pagedMeasureRootHasUsableBlocks(root)) {
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
        dualPage: pagedLayoutDualPage(),
        padTop: pageWindow.padTop,
        padBottom: pageWindow.padBottom,
        clipHeightPx: pageWindow.clipHeight,
        horizontalInsetOnSlot: true,
      }),
    );
    if (!isChapterLayoutComplete(layout, chapterIndex, content)) return null;
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
    if (needsDomChapterLayout(content) && !canLayoutWithoutMeasureHost(content)) return null;
    return buildIncomingChapterLayout(chapterIndex, content, chapterTitle);
  };

  const pageTipChromeActive = () => {
    const pads = pageTipVerticalPads();
    return pads.top > 0 || pads.bottom > 0;
  };

  const layoutClipMatchesTipBody = (clipHeight: number): boolean => {
    const live = effectivePagedClipHeightPx();
    if (live <= 0 || clipHeight <= 0) {
      return !pageTipChromeActive();
    }
    return Math.abs(clipHeight - live) <= 2;
  };

  /** tip-body 尚未实测时允许暂用排版 clip，避免切章/翻页后 span-clip 高度为 0 白屏 */
  const canApplyLayoutClipNow = (clipHeight: number, _fromCache: boolean): boolean => {
    if (layoutClipMatchesTipBody(clipHeight)) return true;
    return (
      pageTipChromeActive() &&
      strictTipBodyClipHeightPx() <= 0 &&
      clipHeight > 0
    );
  };

  const syncLayoutClipToTipBody = (layout: ReaderChapterLayout): ReaderChapterLayout => {
    const live = effectivePagedClipHeightPx();
    if (live <= 0) return layout;
    if (Math.abs(layout.clipHeight - live) <= 2) {
      return layout.clipHeight === live ? layout : { ...layout, clipHeight: live };
    }
    return layout;
  };

  const applyLayout = (next: ReaderChapterLayout, fromCache: boolean) => {
    const synced = syncLayoutClipToTipBody(next);
    if (!canApplyLayoutClipNow(synced.clipHeight, fromCache)) {
      scheduleRemeasureWhenMeasureBlocksReady({ bypassCache: true });
      return;
    }
    const normalized = normalizeAppliedLayout(synced);
    const prev = untrack(layout);
    setPagedLayoutEngine(normalized.engine);
    setPagedLayoutCacheHit(fromCache);
    const prevComplete = isChapterLayoutComplete(prev, normalized.chapterIndex);
    const nextComplete = isChapterLayoutComplete(normalized, normalized.chapterIndex);
    if (chapterLayoutsEqual(prev, normalized) && prevComplete === nextComplete) {
      if (nextComplete) {
        revealPagedChapterWhenReady();
        queueMicrotask(() => {
          scheduleIdleLivePagePaint(incomingDisplayPage());
        });
      }
      return;
    }
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
    if (nextComplete) {
      revealPagedChapterWhenReady();
      queueMicrotask(() => {
        scheduleIdleLivePagePaint(incomingDisplayPage());
      });
    }
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
        if (turnStage() === 'idle' && !turnVisualActive()) {
          scheduleIdleLivePagePaint(incomingDisplayPage());
        } else {
          el.style.transform = prevTransform;
        }
      }
    }
  };

  const layoutAwaitingMeasure = () => {
    const ch = viewerState.chapterIndex;
    return Boolean(viewerState.content?.trim()) && !isChapterLayoutComplete(layout(), ch);
  };

  /** 双栏 interim：左栏已挂载完整章正文，供测量根引导与首屏展示 */
  const dualSpreadLiveBodyVisible = (root: HTMLElement | null | undefined): boolean => {
    if (!root) return false;
    if (pagedMeasureRootHasUsableBlocks(root)) return true;
    const body = root.querySelector<HTMLElement>('.reader-body') ?? root;
    return body.querySelector('.reader-p, h2, figure, .prose') != null;
  };

  const dualSpreadInterimLiveMounted = () => {
    if (!pagedLayoutDualPage() || dualSpreadLayoutReady()) return false;
    if (!resolveLayoutContentForChapter().trim()) return false;
    const ch = viewerState.chapterIndex;
    const rev = buildContentRevision(viewerState.content);
    if (
      idleContentRoot != null &&
      idleContentRootChapter === ch &&
      idleContentRevision === rev
    ) {
      return true;
    }
    const liveRoot =
      dualLeftShiftEl?.querySelector<HTMLElement>('[data-reader-content]') ??
      liveInnerEl?.querySelector<HTMLElement>(
        '.reader-paged-dual-pane-left [data-reader-content]',
      );
    return dualSpreadLiveBodyVisible(liveRoot);
  };

  /** 单栏 live 正文层已挂载且与当前章一致（contentRootReady 为响应式订阅点） */
  const pagedLiveContentRootReady = () => {
    void contentRootReady();
    if (pagedLayoutDualPage()) {
      if (isAlwaysDualPageMode()) {
        return dualSpreadLayoutReady();
      }
      return dualSpreadLayoutReady() || dualSpreadInterimLiveMounted();
    }
    if (idleContentRoot == null) return false;
    if (
      typeof document !== 'undefined' &&
      !document.contains(idleContentRoot)
    ) {
      return false;
    }
    const ch = viewerState.chapterIndex;
    const rev = buildContentRevision(viewerState.content);
    return idleContentRootChapter === ch && idleContentRevision === rev;
  };

  /** 骨架屏期间完成拉取 + DOM 分页 + live 挂载后再展示正文 */
  const pagedChapterReadyForDisplay = () => {
    const ch = viewerState.chapterIndex;
    const content = viewerState.content;
    if (!content?.trim()) return false;
    if (viewerState.contentLoading || viewerState.contentFetching) return false;
    if (viewerState.contentBootstrapping) return false;
    const l = layout();
    if (l != null && l.chapterIndex !== ch) return false;
    if (!isChapterLayoutComplete(l, ch, content)) return false;
    if (!l || l.clipHeight <= 0) return false;
    if (!pagedLiveContentRootReady()) return false;
    return true;
  };

  /**
   * 双栏 surface 可展示：正文已拉取 + tip-body 有高度即可（不等排版完成）。
   * 页眉页脚常显时排版较慢，若仍等 isChapterLayoutComplete 骨架会一直盖住 live 层。
   */
  const pagedDualSpreadSurfaceReady = () => {
    if (!pagedLayoutDualPage()) return false;
    const content = resolveLayoutContentForChapter();
    if (!content.trim()) return false;
    if (viewerState.contentFetching) return false;
    if (viewerState.contentLoading && !hasWarmChapterLayoutCache()) return false;
    if (
      viewerState.contentBootstrapping &&
      !content.trim() &&
      !hasWarmChapterLayoutCache()
    ) {
      return false;
    }
    return tipBodyBandHeightPx() > 0;
  };

  /** 骨架可撤下：完整展示管线就绪，或双栏 surface 已可展示 */
  const shouldDismissPagedSkeleton = () => {
    if (pagedDisplayPipelineReady()) return true;
    if (pagedDualSpreadAwaitingFullLayout()) return false;
    return pagedDualSpreadSurfaceReady();
  };

  /** 排版完成即可撤骨架（不等待 tip-body DOM 与 layout 逐像素对齐） */
  const pagedLayoutReadyForReveal = () => {
    const ch = viewerState.chapterIndex;
    const content = resolveLayoutContentForChapter(ch);
    if (!content.trim()) return false;
    if (viewerState.contentFetching) return false;
    if (viewerState.contentLoading && !hasWarmChapterLayoutCache()) return false;
    if (viewerState.contentBootstrapping && !hasWarmChapterLayoutCache()) return false;
    const l = layout();
    if (l != null && l.chapterIndex !== ch) return false;
    if (!isChapterLayoutComplete(l, ch, content)) return false;
    return clipViewportHeightPx() > 0 || pageClipHeight() > 0;
  };

  const revealPagedChapterWhenReady = () => {
    if (!pagedLayoutReadyForReveal()) return;
    textViewerStore.revealPagedChapterContent();
  };

  /** idle 时撤下翻页幕帘并复位 turn-layer 叠层，避免不透明层挡住正文 */
  const ensureIdleTurnLayerClear = () => {
    if (turnStage() !== 'idle' || turnVisualActive()) return;
    clearTurnPageCurtain(turnLayerEl, curtainSlideMountEl);
    if (turnLayerEl) {
      turnLayerEl.style.zIndex = '';
      turnLayerEl.style.transform = '';
      turnLayerEl.style.willChange = '';
      turnLayerEl.removeAttribute('data-turn-active');
    }
  };

  /** idle 态强制同步 live 层 translateY（声明式 style 首帧常不触发合成层绘制） */
  const scheduleIdleLivePagePaint = (page: number) => {
    if (turnVisualActive()) return;
    const apply = () => {
      if (turnStage() !== 'idle') return;
      ensureIdleTurnLayerClear();
      if (pagedLayoutDualPage()) {
        applyLiveDualSpreadPageTransforms(page);
      } else {
        applyLivePageTransforms(page);
      }
      void liveInnerEl?.offsetHeight;
      void pageTipBodyEl?.offsetHeight;
    };
    apply();
    requestAnimationFrame(apply);
    requestAnimationFrame(() => requestAnimationFrame(apply));
  };

  /** 单栏/双栏 live 均不挂测量块（双栏由屏外 measure-host 承担，避免 live 误切片） */
  const pagedLiveUsesMeasureBlocks = createMemo(() => false);

  const resolveMeasureHostContentRoot = (): HTMLElement | null => {
    const attached =
      dualMeasureContentEl &&
      (typeof document === 'undefined' || document.contains(dualMeasureContentEl))
        ? dualMeasureContentEl
        : null;
    if (attached && pagedMeasureRootHasUsableBlocks(attached)) {
      return attached;
    }
    const hostRoot = queryPagedMeasureContentRoot(pageTipBodyEl);
    if (!(hostRoot instanceof HTMLElement)) return null;
    bindDualMeasureContentRoot(hostRoot);
    return pagedMeasureRootHasUsableBlocks(hostRoot) ? hostRoot : null;
  };

  /** 测量根：优先 tip-body 内测量宿主；live 仅作引导（不得据此 reveal） */
  const resolveContentRootForLayoutDetailed = (): {
    root: HTMLElement | null;
    provisional: boolean;
  } => {
    const tips = viewerState.config.pageTips;
    const chromeVisible = chromeBarsVisible();
    if (!tipBodyReadyForPagedMeasure(contentFrameEl, pageTipBodyEl, tips, chromeVisible)) {
      return { root: null, provisional: false };
    }
    if (pagedLayoutDualPage()) {
      if (!measureHostColumnWidthReady()) return { root: null, provisional: false };
    }
    const hostRoot = resolveMeasureHostContentRoot();
    if (hostRoot) return { root: hostRoot, provisional: false };

    const live = queryPagedLiveMeasureContentRoot(pageTipBodyEl);
    if (live && pagedMeasureRootHasUsableBlocks(live)) {
      return { root: live, provisional: true };
    }

    return { root: null, provisional: false };
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
    pagedUsesPretextLayout() || dualSpreadMeasureColumnWidthPx() >= 120;

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
    if (pagedUsesPretextLayout()) return true;
    if (dualPageMeasureIntent() && pagedLayoutDualPage()) {
      if (!measureHostColumnWidthReady()) return false;
    }
    const host = resolveMeasureHostContentRoot();
    if (host) return true;
    if (idleContentRoot && pagedMeasureRootHasUsableBlocks(idleContentRoot)) {
      return true;
    }
    const live =
      liveInnerEl?.querySelector<HTMLElement>('[data-reader-content]') ??
      viewportEl?.querySelector<HTMLElement>(
        '.reader-paged-live-inner [data-reader-content]',
      );
    return live != null && pagedMeasureRootHasUsableBlocks(live);
  };

  const bindDualMeasureContentRoot = (root: HTMLElement | null) => {
    if (!root) return;
    const prev = dualMeasureContentEl;
    dualMeasureContentEl = root;
    if (prev !== root || pagedMeasureRootHasUsableBlocks(root)) {
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
    return `${viewerState.chapterIndex}:${buildContentRevision(viewerState.content)}`;
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

  const measureHostInnerStyle = createMemo(() => {
    viewportSize();
    void contentRootReady();
    void pageTipBodyEl;
    const inset = pagedSlotInsetFromConfig();
    const base: Record<string, string> = {
      top: `${inset.top}px`,
      right: `${inset.right}px`,
      bottom: `${inset.bottom}px`,
      left: `${inset.left}px`,
    };
    if (dualPageMeasureIntent()) {
      Object.assign(base, dualSpreadMeasureHostStyle(dualSpreadMeasureColumnWidthPx()));
    }
    return base;
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
    if ((viewerState.config.chapterTitleStyle ?? 'center') === 'none') return false;
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

    const tips = viewerState.config.pageTips;
    const chromeVisible = chromeBarsVisible();
    if (!tipBodyReadyForPagedMeasure(contentFrameEl, pageTipBodyEl, tips, chromeVisible)) {
      scheduleRemeasureWhenMeasureBlocksReady({ bypassCache: true });
      return;
    }

    syncViewportSize(outerWidth, viewportEl.clientHeight);

    remeasureInFlight = true;
    const run = async () => {
      try {
        if (!options?.bypassCache && applyCachedChapterLayoutIfReady()) {
          return;
        }

        const { root: contentRoot, provisional: provisionalDomMeasure } =
          resolveContentRootForLayoutDetailed();

        const cfg = viewerState.config;
        const dual = pagedLayoutDualPage();
        if (dual && !measureHostColumnWidthReady()) {
          scheduleRemeasureWhenMeasureBlocksReady({ bypassCache: true });
          return;
        }
        const cacheKey = buildPagedChapterLayoutCacheKey({
          chapterIndex: viewerState.chapterIndex,
          content: viewerState.content,
          chapterTitle: currentChapterTitle(),
          layoutWidth,
          height,
          dual,
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
          bypassCache: domMeasure ? true : options?.bypassCache || pageTipChromeActive(),
          dualPage: dual,
          padTop: pageWindow.padTop,
          padBottom: pageWindow.padBottom,
          clipHeightPx: pageWindow.clipHeight,
          horizontalInsetOnSlot: true,
        };

        if (!contentRoot) {
          if (viewerState.content?.trim()) {
            const measureReady = tipBodyReadyForPagedMeasure(
              contentFrameEl,
              pageTipBodyEl,
              tips,
              chromeVisible,
            );
            const tipChrome = pageTipChromeActive();
            const cached = measureReady ? getCachedChapterLayout(cacheKey) : null;
            if (
              cached &&
              layoutClipMatchesTipBody(cached.clipHeight) &&
              isChapterLayoutComplete(cached, viewerState.chapterIndex, viewerState.content)
            ) {
              applyLayout(cached, true);
            } else if (
              measureReady &&
              !tipChrome &&
              canLayoutWithoutMeasureHost(viewerState.content)
            ) {
              const provisional = layoutReaderChapter({
                ...layoutInput,
                contentRoot: null,
              });
              if (
                isChapterLayoutComplete(
                  provisional,
                  viewerState.chapterIndex,
                  viewerState.content,
                )
              ) {
                applyLayout({ ...provisional, isLayoutComplete: true }, false);
                return;
              }
            }
            if (!pagedUsesPretextLayout() || tipChrome) {
              scheduleRemeasureWhenMeasureBlocksReady({ bypassCache: true });
            } else if (measureReady) {
              const next = layoutReaderChapter({
                ...layoutInput,
                contentRoot: null,
              });
              if (next.segments.length > 0) {
                applyLayout({ ...next, isLayoutComplete: true }, false);
              }
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
          applyLayout(
            {
              ...synced,
              cacheKey,
              dualPage: dual,
              isLayoutComplete: provisionalDomMeasure ? false : true,
            },
            fromCache,
          );
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
          {
            ...nextLayout,
            cacheKey,
            dualPage: dual,
            isLayoutComplete: provisionalDomMeasure ? false : true,
          },
          fromCache,
        );
        if (pagedMeasureRootLegadoPlaceholdersPending(contentRoot)) {
          scheduleRemeasureWhenMeasureBlocksReady({ bypassCache: true });
        }
      } finally {
        remeasureInFlight = false;
        queueMicrotask(() => {
          revealPagedChapterWhenReady();
          if (turnStage() === 'idle' && !turnVisualActive()) {
            scheduleIdleLivePagePaint(incomingDisplayPage());
          }
        });
      }
    };

    void run();
  };

  const scheduleRemeasure = (options?: {
    immediate?: boolean;
    bypassCache?: boolean;
    force?: boolean;
    allowDuringTurn?: boolean;
    syncOnly?: boolean;
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
        pageWindowMetrics(),
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
      remeasure({ bypassCache: options?.bypassCache, syncOnly: options?.syncOnly });
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
    liveInnerEl.style.transform = readerPagedIdleContentTransform(
      offsets.leftY,
      extraTransform,
    );
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

  const buildCurrentChapterLayoutCacheKey = (contentOverride?: string) => {
    const pageWindow = pageWindowMetrics();
    const layoutWidth = slotContentInnerWidth();
    const height = pageWindow.viewportHeight;
    const dual = pagedLayoutDualPage();
    return buildPagedChapterLayoutCacheKey({
      chapterIndex: viewerState.chapterIndex,
      content: contentOverride ?? viewerState.content,
      chapterTitle: currentChapterTitle(),
      layoutWidth,
      height,
      dual,
    });
  };

  /** 切章瞬间 store 正文可能滞后：优先用章节池内容查排版缓存 */
  const dismissPagedSkeletonInstant = () => {
    if (skeletonExitTimer !== undefined) {
      clearTimeout(skeletonExitTimer);
      skeletonExitTimer = undefined;
    }
    setPagedSkeletonPhase('hidden');
    pagedSkeletonDismissedKey = chapterSkeletonKey();
  };

  const hasWarmChapterLayoutCache = (): boolean => {
    const ch = viewerState.chapterIndex;
    const content = resolveLayoutContentForChapter(ch);
    if (!content.trim()) return false;
    const cached = getCachedChapterLayout(buildCurrentChapterLayoutCacheKey(content));
    return Boolean(
      cached &&
        cached.chapterIndex === ch &&
        isChapterLayoutComplete(cached, ch, content),
    );
  };

  /** 翻页切章结束：将 staging/缓存排版落到 live，避免幕帘撤下后永久白屏 */
  const restoreLayoutAfterCrossChapterTurn = (
    turn: CrossChapterTurnState | null,
    cancelled: boolean,
  ) => {
    if (!turn || cancelled) return;
    if (applyCachedChapterLayoutIfReady()) return;

    const ch = viewerState.chapterIndex;
    const content = resolveLayoutContentForChapter(ch);
    const staged = turn.incomingLayout;
    if (
      staged &&
      staged.chapterIndex === ch &&
      isChapterLayoutComplete(staged, ch, content)
    ) {
      applyLayout(
        normalizeAppliedLayout({ ...staged, isLayoutComplete: true }),
        true,
      );
      dismissPagedSkeletonInstant();
      queueMicrotask(() => syncPagedClipAndRepaint());
      return;
    }

    const l = layout();
    if (l && isChapterLayoutComplete(l, ch, content)) {
      dismissPagedSkeletonInstant();
      return;
    }

    scheduleRemeasure({
      immediate: true,
      bypassCache: false,
      force: true,
    });
  };

  /** 按页展示管线就绪：正文 + 排版 + live 挂载 */
  const pagedDisplayPipelineReady = () => {
    if (!resolveLayoutContentForChapter().trim()) return false;
    if (viewerState.contentFetching) return false;
    if (
      viewerState.contentBootstrapping &&
      !viewerState.content?.trim() &&
      !hasWarmChapterLayoutCache()
    ) {
      return false;
    }
    if (viewerState.contentLoading && !hasWarmChapterLayoutCache()) return false;
    if (!pagedLayoutReadyForReveal()) return false;
    if (!pagedLiveContentRootReady()) return false;
    return true;
  };

  /** 同步命中章节排版缓存时立即 apply，避免切章闪骨架/白屏 */
  const applyCachedChapterLayoutIfReady = (): boolean => {
    const ch = viewerState.chapterIndex;
    const content = resolveLayoutContentForChapter(ch);
    if (!content.trim()) return false;
    if (viewerState.contentFetching) return false;
    if (viewerState.contentLoading && !hasWarmChapterLayoutCache()) return false;

    const cached = getCachedChapterLayout(buildCurrentChapterLayoutCacheKey(content));
    if (!cached || cached.chapterIndex !== ch) return false;
    if (!isChapterLayoutComplete(cached, ch, content)) return false;
    if (!canApplyLayoutClipNow(cached.clipHeight, true)) return false;

    applyLayout(cached, true);
    dismissPagedSkeletonInstant();
    queueMicrotask(() => syncPagedClipAndRepaint());
    return true;
  };

  const tryApplyCachedChapterLayout = (): boolean => {
    if (!crossChapterTurn) return false;
    if (viewerState.chapterIndex === crossChapterTurn.fromChapterIndex) return false;
    return applyCachedChapterLayoutIfReady();
  };

  const tryApplyProvisionalChapterLayout = (): boolean => {
    if (!crossChapterTurn) return false;
    if (viewerState.chapterIndex === crossChapterTurn.fromChapterIndex) return false;
    const content = viewerState.content;
    if (!content?.trim()) return false;
    if (needsDomChapterLayout(content) && !canLayoutWithoutMeasureHost(content)) return false;
    const l = layout();
    if (l && isCrossChapterLayoutReady(l, viewerState.chapterIndex, content)) return false;

    const pageWindow = pageWindowMetrics();
    const layoutWidth = slotContentInnerWidth();
    const height = pageWindow.viewportHeight;
    if (height <= 0 || layoutWidth <= 0) return false;

    const cfg = viewerState.config;
    const dual = pagedLayoutDualPage();
    const next = layoutReaderChapter({
      chapterIndex: viewerState.chapterIndex,
      content,
      chapterTitle: currentChapterTitle(),
      viewportWidth: layoutWidth,
      viewportHeight: height,
      config: cfg,
      contentRoot: null,
      dualPage: dual,
      padTop: pageWindow.padTop,
      padBottom: pageWindow.padBottom,
      clipHeightPx: pageWindow.clipHeight,
      horizontalInsetOnSlot: true,
    });
    if (!isCrossChapterLayoutReady(next, viewerState.chapterIndex, content)) return false;
    applyLayout({ ...next, isLayoutComplete: false }, false);
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
      if (!viewerState.content?.trim()) return false;
      const l = layout();
      if (!l || !isCrossChapterLayoutReady(l, viewerState.chapterIndex, viewerState.content)) {
        return false;
      }
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
    const pageWindow = pageWindowMetrics();
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

  /** 跨章 staging 渲染用版式：已切 store 时优先用本章 layout，否则用预排版 */
  const resolveCrossChapterStagingLayout = (): ReaderChapterLayout | null => {
    const turn = crossChapterTurn;
    if (!turn) return null;
    if (turn.chapterCommitted) {
      const l = layout();
      const content = viewerState.content;
      const ch = viewerState.chapterIndex;
      if (l && isCrossChapterLayoutReady(l, ch, content)) {
        return l;
      }
    }
    return turn.incomingLayout;
  };

  /** staging 方向与当前 turnDir 一致时才展示相邻章（反向拖/提交时不串页界） */
  const isCrossChapterIncomingVisualActive = () => {
    crossChapterStagingTick();
    const turn = crossChapterTurn;
    if (!turn || turn.stagingDirection !== turnDir()) return false;

    if (!turn.chapterCommitted) {
      return Boolean(turn.incomingLayout);
    }

    // 已切 store：动画结束前继续 staging，避免 live 早显、骨架闪屏与幕帘叠字
    if (
      turnStage() === 'idle' &&
      !turn.animRunning &&
      !crossChapterCommitInFlight
    ) {
      return false;
    }
    return Boolean(resolveCrossChapterStagingLayout());
  };

  /**
   * 跨章预览期勿改写 live 的 pageIndex：incoming 由 staging 层 transform 承担。
   * 若在切 store 前把 pageIndex 指到相邻章页界，live 仍以本章正文渲染该页码，会与 staging 叠字。
   */
  const syncCrossChapterDisplayPage = () => {
    const turn = crossChapterTurn;
    if (!turn?.incomingLayout || !turn.chapterCommitted) return;
    if (turn.stagingDirection !== turnDir()) return;
    const target = resolveCrossChapterTargetPage();
    if (target == null || pageIndex() === target) return;
    skipChapterPosSync = true;
    setPageIndex(target);
    queueMicrotask(() => {
      skipChapterPosSync = false;
    });
  };

  const finishIncomingStagingPrep = (
    turn: CrossChapterTurnState,
    prepareToken: number,
    direction: PagedTurnDirection,
    incomingIdx: number,
    incomingLayout: ReaderChapterLayout,
  ): boolean => {
    if (!isCrossChapterPrepareCurrent(turn, prepareToken, direction)) return false;
    if (turn.incomingChapterIndex !== incomingIdx) return false;
    turn.incomingLayout = incomingLayout;
    turn.stagingDirection = direction;
    turn.targetPage =
      direction === 'next' ? 0 : prevChapterLandingPage(incomingLayout);
    notifyCrossChapterStagingChange();
    if (turn.chapterCommitted) {
      syncCrossChapterDisplayPage();
    }
    if (turnStage() === 'drag') {
      queueMicrotask(() => syncCrossChapterDragLayerVisibility());
    }
    return true;
  };

  const crossChapterDragShowsIncoming = (): boolean => {
    const turn = crossChapterTurn;
    if (turnStage() !== 'drag' || !turn || turn.chapterCommitted) return false;
    if (!turn.incomingLayout || turn.stagingDirection !== turnDir()) return false;
    return true;
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

  /** live 层渲染页：仿真翻页用 turnLiveDisplayPage；跨章预览期 live 固定 outgoing 页 */
  const liveRenderPage = () => {
    if (turnStage() !== 'idle' && anim() === 'simulation') {
      return turnLiveDisplayPage(turnFrom(), turnTo(), turnDir());
    }
    const turn = crossChapterTurn;
    if (
      turn &&
      !turn.chapterCommitted &&
      turn.incomingLayout &&
      turn.stagingDirection === turnDir()
    ) {
      return turn.fromPage;
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

  /** 当前页正文裁切高度（= 页界 nextStart − pageStart，≤ liveClip） */
  const pageContentClipPx = () =>
    pageWindowSpanPx(incomingDisplayPage()) ?? clipViewportHeightPx();

  /**
   * 单栏 span-clip 高度 = min(tip-body, 本页页界跨度)。
   * 满高窗 + translateY 会在 nextStart < pageStart+clip 时把下一页首行漏进当前页（重复/半行）。
   */
  const pageSpanClipHeightPx = (page: number) => {
    let band = tipBodyBandHeightPx();
    if (band <= 0) {
      const clip = pageClipHeight();
      if (clip > 0) {
        band = clip;
      } else {
        const pw = pageWindowMetrics();
        if (pw.clipHeight > 0) {
          band = pw.clipHeight;
        } else if (pw.viewportHeight > 0) {
          const inset = contentInset();
          band = Math.max(1, pw.viewportHeight - inset.top - inset.bottom);
        }
      }
    }
    if (band <= 0) return band;
    const span = pageWindowSpanPx(page);
    if (span != null && span > 0) {
      return Math.min(band, Math.max(1, Math.round(span)));
    }
    return band;
  };

  const pageSpanClipStyle = createMemo((): Record<string, string> => {
    layout();
    pagingLayout();
    pagingChapterIndex();
    pageClipHeight();
    pageIndex();
    contentRootReady();
    crossChapterStagingTick();
    tipBodyClipPx();
    viewerState.chapterIndex;
    const turn = crossChapterTurn;
    if (
      turn?.incomingLayout &&
      !turn.chapterCommitted &&
      turn.stagingDirection === turnDir() &&
      (turnStage() === 'drag' || isCrossChapterIncomingVisualActive())
    ) {
      const target = turn.targetPage ?? 0;
      const band = tipBodyBandHeightPx();
      const liveClip = clipViewportHeightPx();
      const span = pageContentSpanPx(target, turn.incomingLayout, liveClip);
      if (band > 0 && span > 0) {
        return { height: `${Math.min(band, Math.max(1, Math.round(span)))}px` };
      }
    }
    const page = liveRenderPage();
    if (pagedLayoutDualPage()) {
      const band = tipBodyBandHeightPx();
      if (band > 0) {
        return { height: `${band}px`, minHeight: `${band}px` };
      }
      return { top: '0', bottom: '0', height: 'auto' };
    }
    const h = pageSpanClipHeightPx(page);
    return h > 0 ? { height: `${h}px` } : { top: '0', bottom: '0', height: 'auto' };
  });

  /** idle 单栏页偏移（响应式，避免首屏仅声明式 style 不绘制） */
  const idleLivePageTransform = createMemo(() => {
    if (turnStage() !== 'idle' || turnVisualActive()) return undefined;
    const page = incomingDisplayPage();
    layout();
    pagingLayout();
    pagingChapterIndex();
    pageClipHeight();
    tipBodyClipPx();
    pageIndex();
    if (pageClipHeight() <= 0) return undefined;
    return readerPagedIdleContentTransform(contentOffsetY(page));
  });

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

  const viewportWidth = () => viewportEl?.clientWidth ?? 0;

  /** 滑动翻页位移基准：与翻页面板同宽（满 clip 或 content-frame） */
  const slideTurnSpanWidthPx = () => {
    const panel = slideTurnPanelEl();
    if (panel && panel.clientWidth > 0) return panel.clientWidth;
    if (contentFrameEl && contentFrameEl.clientWidth > 0) return contentFrameEl.clientWidth;
    return clipEl?.clientWidth || viewportEl?.clientWidth || 0;
  };

  /** 跨章 staging/落点须满足与 idle 相同的双栏完整性，避免占位 layout 冒充就绪 */
  const isCrossChapterLayoutReady = (
    l: ReaderChapterLayout,
    ch: number,
    content?: string,
  ) => isChapterLayoutComplete(l, ch, content);

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
    const pooled = getPooledChapterContent(book.bookUrl, incomingIdx);
    let content = pooled?.trim() ? pooled : null;
    if (!content) {
      content = await resolveAdjacentChapterContent(
        book,
        incomingIdx,
        viewerState.catalog[incomingIdx],
      );
    }

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
      resetIdleContentBinding();
      return true;
    };

    const deferCommit = options?.allowCommitEarly === false;

    if (!content?.trim()) return deferCommit ? false : commitEarly();

    if (!isCrossChapterPrepareCurrent(turn, prepareToken, direction)) return false;

    turn.incomingChapterIndex = incomingIdx;
    turn.incomingContent = content;
    turn.incomingLayout = null;

    const cachedLayout = buildIncomingChapterLayout(incomingIdx, content, title);
    if (
      cachedLayout &&
      finishIncomingStagingPrep(turn, prepareToken, direction, incomingIdx, cachedLayout)
    ) {
      return true;
    }

    const incomingLayout = await waitForIncomingMeasureLayout(
      incomingIdx,
      content,
      title,
      turn,
      prepareToken,
    );
    if (!incomingLayout) return deferCommit ? false : commitEarly();

    if (
      finishIncomingStagingPrep(turn, prepareToken, direction, incomingIdx, incomingLayout)
    ) {
      return true;
    }
    return deferCommit ? false : commitEarly();
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
        force: !applyCachedChapterLayoutIfReady(),
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

    if (
      !turn.chapterCommitted &&
      turn.incomingLayout &&
      !turn.stagingPainted
    ) {
      return;
    }

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
      skipCurtain: turnStage() === 'drag',
    });
  };

  const startCrossChapterTurn = (
    direction: PagedTurnDirection,
    fromPage: number,
    options?: { dragStartPx?: number },
  ) => {
    dismissIdleCoverCurtain();
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
    if (animMode === 'slide' || animMode === 'simulation') {
      applyTurnFrameSlideLayout();
    }
    warmAdjacentLayoutsFromPool();

    void (async () => {
      const ok = await prepareCrossChapterStaging(direction);
      if (!crossChapterTurn) return;
      if (!ok) {
        finishTurn(fromPage);
        return;
      }
      skipChapterPosSync = false;
      await afterSolidPaint();
      if (!crossChapterTurn) return;
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
      if (showIncomingStaging()) {
        ensureTurnCurtainAttached(turnLayerEl, curtainSlideMountEl);
      } else {
        beginTurnCurtain(fromPage, liveInnerEl);
      }
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

    if (pendingCommit && stagedLayout) {
      postTurnStagingLayout = stagedLayout;
      notifyCrossChapterStagingChange();
    }

    if (turn && !options?.cancel && (turn.chapterCommitted || !pendingCommit)) {
      restoreLayoutAfterCrossChapterTurn(turn, false);
    }

    cancelAnimFrame();
    cancelDragTurnPaint();
    cancelCrossChapterDragFooterSync();
    skipChapterPosSync = true;
    clearTurnPageCurtain(turnLayerEl, curtainSlideMountEl);
    clearSimulationCurl(curtainSlideMountEl);
    simCorner = null;
    curlAnim = null;
    simLiveTransformPage = -1;
    cancelSimulationCurlPaint();
    turnCurtainKey = '';
    dragOffsetPxRef = 0;
    turnAnimProgressRef = 0;
    incomingStagingTransformEl = undefined;
    stagingDualLeftShiftEl = undefined;
    stagingDualRightShiftEl = undefined;
    clearSlidePanelStyles();
    releaseDragTurnLayerCompositor();
    setTurnStage('idle');
    dragPointerId = null;
    dragAxis = 'none';
    dragTurnInitialized = false;
    turnCurtainPrepInFlight = false;
    turnCurtainPrepToken += 1;
    setCurtainCloneHostPage(null);
    curtainCloneHostInnerEl = undefined;
    clearCrossChapterTurn();
    crossChapterDragStagingUnlocked = false;
    crossChapterStagingPrepStarted = false;

    const finalize = (page: number) => {
      setPageIndex(page);
      setTurnFrom(page);
      setTurnTo(page);
      queueMicrotask(() => {
        skipChapterPosSync = false;
        if (anim() === 'slide' || anim() === 'simulation') restoreContentSlotPagedLayout();
        const ch = viewerState.chapterIndex;
        if (!isChapterLayoutComplete(layout(), ch)) {
          scheduleRemeasureWhenMeasureBlocksReady({ bypassCache: true });
        }
        const l = layout();
        const liveClip = tipBodyBandHeightPx();
        if (
          l &&
          liveClip > 0 &&
          Math.round(l.clipHeight) !== Math.round(liveClip)
        ) {
          scheduleRemeasure({ immediate: true, bypassCache: true, force: true });
        }
        revealPagedChapterWhenReady();
        syncPagedClipAndRepaint(page);
        if (!pagedLiveContentRootReady()) {
          scheduleRemeasureWhenMeasureBlocksReady({ bypassCache: false });
        }
      });
    };

    if (pendingCommit && commitDir) {
      crossChapterCommitInFlight = true;
      void (async () => {
        try {
          await requestChapterSwitch(commitDir);
          const ch = viewerState.chapterIndex;
          const content = resolveLayoutContentForChapter(ch);
          if (
            stagedLayout &&
            stagedLayout.chapterIndex === ch &&
            isChapterLayoutComplete(stagedLayout, ch, content)
          ) {
            applyLayout(
              normalizeAppliedLayout({ ...stagedLayout, isLayoutComplete: true }),
              true,
            );
          } else if (!applyCachedChapterLayoutIfReady()) {
            setChapterLayout(null);
          }
          consumePagedChapterEntry();
          finalize(target);
        } catch {
          finalize(revertPage);
        } finally {
          crossChapterCommitInFlight = false;
          restoreLayoutAfterCrossChapterTurn(turn, false);
          postTurnStagingLayout = null;
          notifyCrossChapterStagingChange();
          dismissPagedSkeletonInstant();
          requestAnimationFrame(() => {
            syncPagedClipAndRepaint(target);
            scheduleRemeasure({
              immediate: true,
              bypassCache: false,
              force: !applyCachedChapterLayoutIfReady(),
            });
          });
        }
      })();
      return;
    }

    postTurnStagingLayout = null;
    notifyCrossChapterStagingChange();

    if (turn?.chapterCommitted && !options?.cancel) {
      consumePagedChapterEntry();
      dismissPagedSkeletonInstant();
    }
    finalize(options?.cancel ? revertPage : target);
  };

  const slideTurnOffsetPx = (stage: TurnStage, progressOrDrag: number) =>
    readerPagedSlideTurnOffsetPx(turnDir(), slideTurnSpanWidthPx(), {
      dragOffsetPx: stage === 'drag' ? progressOrDrag : undefined,
      progressRatio: stage === 'anim' ? progressOrDrag : undefined,
    });

  const cancelAnimFrame = () => {
    cancelSimulationCurlPaint();
    if (animFrame !== undefined) {
      cancelAnimationFrame(animFrame);
      animFrame = undefined;
    }
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
        contentSpanPx: turnCurtainSpanPx(livePage),
        contentInsetPx: undefined,
        pageBg: pageThemeBg(),
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
        curtainSlideMountEl.querySelector('.reader-paged-turn-frame-clone') ||
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
      turnCurtainMountOptions(fromPage),
    );
  };

  const restoreContentSlotPagedLayout = () => {
    if (!contentFrameEl || turnSlidePanelLayoutActive()) return;
    applyReaderTextContentSlotLayoutStyle(
      contentFrameEl,
      readerTextContentSlotPagedFrameStyle(),
    );
    if (contentSlotEl) {
      contentSlotEl.style.removeProperty('transform');
      contentSlotEl.style.removeProperty('will-change');
    }
    if (contentFrameEl) {
      contentFrameEl.style.removeProperty('transform');
      contentFrameEl.style.removeProperty('will-change');
    }
  };

  const clearSlidePanelStyles = () => {
    for (const el of [contentSlotEl, contentFrameEl]) {
      if (!el) continue;
      el.style.transform = '';
      el.style.willChange = '';
    }
  };

  const syncSlideIncomingPanelTransform = (stage: TurnStage, value: number) => {
    if (anim() !== 'slide') return;
    if (stage === 'idle' || (turnFrom() === turnTo() && !isCrossChapterTurnActive())) {
      clearSlidePanelStyles();
      queueMicrotask(restoreContentSlotPagedLayout);
      return;
    }
    const panel = slideTurnPanelEl();
    if (!panel) return;
    const offset = slideTurnOffsetPx(stage, value);
    const xForm = readerPagedSlideIncomingTransform(
      turnDir(),
      slideTurnSpanWidthPx(),
      offset,
    );
    panel.style.transform = xForm ?? '';
    panel.style.willChange = 'transform';
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

  /** Solid 重绘后恢复仿真幕帘 + 卷曲（anim 阶段须重挂，否则翻起页消失） */
  const syncSimulationTurnAfterSolidRender = () => {
    if (anim() !== 'simulation') return;
    const stage = turnStage();
    if (stage === 'idle') return;
    syncTurnCurtainAfterRender();
    const progress =
      stage === 'anim'
        ? turnAnimProgressRef
        : Math.max(
            0,
            Math.min(
              1,
              viewportWidth() > 0
                ? Math.abs(dragOffsetPxRef) / viewportWidth()
                : 0,
            ),
          );
    renderSimulationCurl(stage, progress);
    if (!liveInnerEl) return;
    const livePage = liveRenderPage();
    if (simLiveTransformPage !== livePage) {
      simLiveTransformPage = livePage;
      if (pagedLayoutDualPage()) {
        applyLiveDualSpreadPageTransforms(livePage);
      } else {
        applyLivePageTransforms(livePage);
      }
    }
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
      pageBg: pageThemeBg(),
    });
  };

  const cancelSimulationCurlPaint = () => {
    if (simCurlPaintRaf) {
      cancelAnimationFrame(simCurlPaintRaf);
      simCurlPaintRaf = 0;
    }
  };

  /** drag/anim 合并为每显示帧单次 clip-path 更新 */
  const scheduleSimulationCurl = (stage: TurnStage, progressRatio: number) => {
    simCurlPaintStage = stage;
    simCurlPaintProgress = progressRatio;
    if (simCurlPaintRaf) return;
    simCurlPaintRaf = requestAnimationFrame(() => {
      simCurlPaintRaf = 0;
      renderSimulationCurl(simCurlPaintStage, simCurlPaintProgress);
    });
  };

  /** 覆盖/仿真翻页视觉（imperative，避免每帧 Solid 重绘） */
  const syncPagedTurnVisuals = (
    stage: TurnStage,
    progress: number,
    dragPx?: number,
  ) => {
    const mode = anim();
    if (mode === 'slide') return;
    syncCurtainLayerTransform(stage, progress, dragPx);

    if (mode === 'cover' && crossChapterTurn?.incomingLayout) {
      const extra = readerPagedLayerTransform('cover', 'incoming', turnDir(), progress);
      const page = incomingDisplayPage();
      const il = crossChapterTurn.incomingLayout;
      const y = Math.round(il.pageStarts[page] ?? 0);
      if (pagedLayoutDualPage() && stagingDualLeftShiftEl && stagingDualRightShiftEl) {
        const offsets = dualSpreadYOffset(effectiveDualLayout(il), page);
        applyDualSpreadPageTransforms(
          stagingDualLeftShiftEl,
          stagingDualRightShiftEl,
          offsets,
          extra,
        );
      } else if (incomingStagingTransformEl) {
        incomingStagingTransformEl.style.transform =
          mergePagedContentTransforms(y, extra) ?? '';
        incomingStagingTransformEl.style.willChange = 'transform';
      }
      return;
    }

    if (
      mode !== 'cover' &&
      mode !== 'simulation' &&
      turnVisualActive() &&
      pagedLayoutDualPage()
    ) {
      const extra = readerPagedLayerTransform(mode, 'incoming', turnDir(), progress);
      applyLiveDualSpreadPageTransforms(incomingDisplayPage(), extra);
    }
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
      setTurnCurtainTransform(turnLayerEl, undefined);
      if (stage === 'anim') {
        renderSimulationCurl(stage, Math.max(0, Math.min(1, progressRatio)));
      } else {
        scheduleSimulationCurl(stage, Math.max(0, Math.min(1, progressRatio)));
      }
      if (liveInnerEl) {
        const livePage = liveRenderPage();
        if (simLiveTransformPage !== livePage) {
          simLiveTransformPage = livePage;
          if (pagedLayoutDualPage()) {
            applyLiveDualSpreadPageTransforms(livePage);
          } else {
            applyLivePageTransforms(livePage);
          }
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
    if (stage === 'anim') return turnAnimProgressRef;
    if (stage === 'drag') {
      const w = viewportWidth();
      return w > 0 ? Math.min(1, Math.abs(dragOffsetPxRef) / w) : 0;
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
        turnAnimProgressRef = t;
        syncPagedTurnVisuals('anim', t);
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
          syncSlideTurnVisuals('anim', turnAnimProgressRef);
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

      turnAnimProgressRef = animInitial;

      const startAnimLoop = () => {
        setTurnStage('anim');
        animStart = performance.now();
        if (animMode === 'slide') {
          syncSlideTurnVisuals('anim', animInitial);
        }
        if (animMode === 'simulation') {
          queueMicrotask(() => {
            syncSimulationTurnAfterSolidRender();
            animFrame = requestAnimationFrame(tick);
          });
          return;
        }
        if (animMode === 'cover') {
          syncPagedTurnVisuals('anim', animInitial);
        }
        animFrame = requestAnimationFrame(tick);
      };

      if (animMode === 'simulation') {
        requestAnimationFrame(startAnimLoop);
        return;
      }

      startAnimLoop();
    };

    const beginSimulationDragCommitAnim = () => {
      syncTurnCurtainAfterRender();
      skipChapterPosSync = true;
      const livePage = turnLiveDisplayPage(from, target, direction);
      const commitAnim = () => {
        resumeChapterSync();
        beginAnim();
      };
      if (pageIndex() !== livePage) {
        requestAnimationFrame(() => {
          setPageIndex(livePage);
          queueMicrotask(() => {
            syncSimulationTurnAfterSolidRender();
            commitAnim();
          });
        });
        return;
      }
      commitAnim();
    };

    const runSimulationTurnPrep = () => {
      const curtainPage = turnCurtainClonePage(from, target, direction);
      const livePage = turnLiveDisplayPage(from, target, direction);
      if (!getPersistedTurnSlide()) {
        beginTurnCurtain(curtainPage, liveInnerEl ?? undefined);
      }
      if (direction === 'prev' && liveInnerEl) {
        mountSimulationPrevNextArea(livePage, liveInnerEl);
      }
      syncTurnCurtainAfterRender();
      skipChapterPosSync = true;
      requestAnimationFrame(() => {
        setPageIndex(livePage);
        queueMicrotask(() => {
          syncSimulationTurnAfterSolidRender();
          resumeChapterSync();
          beginAnim();
        });
      });
    };

    if (options?.skipCurtain) {
      ensureTurnCurtainAttached(turnLayerEl, curtainSlideMountEl);
      if (!getPersistedTurnSlide() && liveInnerEl) {
        beginTurnCurtain(from, liveInnerEl);
      }
      armDragTurnLayerCompositor();
      skipChapterPosSync = true;
      const crossPreview =
        crossChapterTurn && !crossChapterTurn.chapterCommitted;
      if (!crossPreview) {
        setPageIndex(turnLiveDisplayPage(from, target, direction));
      }
      resumeChapterSync();
      beginAnim();
      return;
    }

    if (animMode === 'cover' && turnStage() === 'idle') {
      if (liveInnerEl) beginTurnCurtain(from, liveInnerEl);
      armDragTurnLayerCompositor();
      skipChapterPosSync = true;
      resumeChapterSync();
      beginAnim();
      return;
    }

    if (animMode === 'simulation' && turnStage() === 'idle') {
      runSimulationTurnPrep();
      return;
    }

    if (turnStage() === 'drag' && animMode === 'simulation') {
      beginSimulationDragCommitAnim();
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

    if (turnStage() === 'drag' && animMode === 'cover') {
      skipChapterPosSync = true;
      resumeChapterSync();
      beginAnim();
      return;
    }

    void prepareTurnCurtainLayers(from, target, direction, liveInnerEl ?? undefined).then(
      beginAnim,
    );
  };

  const cancelCoverCurtainPrep = () => {
    if (!coverCurtainPrepRaf) return;
    cancelAnimationFrame(coverCurtainPrepRaf);
    coverCurtainPrepRaf = 0;
  };

  const scheduleCoverCurtainPrep = (fromPage: number) => {
    if (anim() !== 'cover' || turnStage() !== 'idle' || !liveInnerEl) return;
    if (turnCurtainPrepInFlight || dragTurnInitialized) return;
    cancelCoverCurtainPrep();
    coverCurtainPrepRaf = requestAnimationFrame(() => {
      coverCurtainPrepRaf = 0;
      if (dragPointerId === null || turnStage() !== 'idle' || dragTurnInitialized) return;
      if (anim() !== 'cover' || !liveInnerEl) return;
      beginTurnCurtain(fromPage, liveInnerEl);
      armDragTurnLayerCompositor();
    });
  };

  const dismissIdleCoverCurtain = () => {
    cancelCoverCurtainPrep();
    clearIdleCoverDragCurtain();
  };

  const runAnimatedTurn = (target: number, direction: PagedTurnDirection) => {
    dismissIdleCoverCurtain();
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
    const dragStartPx = dragOffsetPxRef;
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
    dismissIdleCoverCurtain();
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
    dismissIdleCoverCurtain();
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

  /** 双栏 spread：Solid 重绘会清空 imperative 右栏镜像，须在页码/正文就绪后同步（翻页中由 rAF 驱动） */
  createEffect(() => {
    if (!pagedLayoutDualPage()) return;
    if (turnVisualActive()) return;
    const page = incomingDisplayPage();
    pagingLayout();
    contentRootReady();
    crossChapterStagingTick();
    void page;
    scheduleDualSpreadPageTransforms(() => {
      if (!dualLeftShiftEl || !dualRightShiftEl) return;
      applyLiveDualSpreadPageTransforms(page);
    });
  });

  /** 内容 / 排版 / 视口变化：合并为一次防抖重测 */
  createEffect(() => {
    const ch = viewerState.chapterIndex;
    const contentRev = buildContentRevision(viewerState.content);
    viewerState.showContent;
    const sig = layoutSignature();
    const { w, h } = viewportSize();
    const vp =
      w > 0 && h > 0 ? pagedViewportSignature(slotContentInnerWidth() || w, h) : '0x0';
    const tipClip = strictTipBodyClipHeightPx();
    const layoutKey = `${ch}:${contentRev}:${sig}`;
    const bypassCache = layoutKey !== lastLayoutRemeasureKey;
    if (bypassCache) lastLayoutRemeasureKey = layoutKey;
    const triggerKey = `${layoutKey}:${vp}:tb${tipClip}`;
    if (triggerKey === lastMeasureTriggerKey) return;
    lastMeasureTriggerKey = triggerKey;
    // 跨章翻页提交期间：新章已用 staging 排版（与预取/缓存一致）就地展示，
    // 此处不得再 bypassCache 强制 DOM 重排覆盖，否则切章落点页文字重新分页而抖动。
    // 仍更新去重 key，使该章后续走缓存命中、保持版式稳定。
    if (crossChapterCommitInFlight) return;
    scheduleRemeasure({
      immediate: w <= 0 || h <= 0,
      bypassCache: bypassCache || pageTipChromeActive(),
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
    const style = measureHostInnerStyle();
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
        dualMeasureContentEl ?? queryPagedMeasureContentRoot(pageTipBodyEl);
      if (hostRoot instanceof HTMLElement) {
        if (dualMeasureContentEl !== hostRoot) {
          bindDualMeasureContentRoot(hostRoot);
        }
        if (pagedMeasureRootHasUsableBlocks(hostRoot) && !remeasureInFlight && frames % 8 === 0) {
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

  /** layout.clipHeight 与 tip-body 实测偏差时重测，避免页界按错误窗高计算导致裁字 */
  createEffect(() => {
    if (turnStage() !== 'idle' || crossChapterCommitInFlight) return;
    const l = layout();
    if (!l || !isChapterLayoutComplete(l, viewerState.chapterIndex)) return;
    const liveClip = tipBodyBandHeightPx();
    if (liveClip <= 0 || l.clipHeight <= 0) return;
    if (Math.floor(l.clipHeight) === liveClip) return;
    scheduleRemeasure({ immediate: true, bypassCache: true, force: true });
  });

  createEffect(() => {
    const book = viewerState.book;
    const catalog = viewerState.catalog;
    const ch = viewerState.chapterIndex;
    const cfg = viewerState.config;
    const outerW = viewportEl?.clientWidth ?? 0;
    if (!book || outerW <= 0) return;
    const pageWindow = pageWindowMetrics();
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

  createEffect(
    on(
      () => chromeBarsVisible(),
      (_visible, prev) => {
        if (prev === undefined) return;
        requestAnimationFrame(() => {
          syncPagedClipAndRepaint();
        });
      },
    ),
  );

  createEffect(
    on(
      () => viewerState.config.layoutEngine,
      (engine, prev) => {
        if (prev === undefined) return;
        lastMeasureTriggerKey = '';
        lastLayoutRemeasureKey = '';
        clearChapterLayoutCache();
        requestAnimationFrame(() => {
          scheduleRemeasure({ immediate: true, bypassCache: true, force: true });
        });
        void engine;
      },
    ),
  );

  createEffect(
    on(
      () =>
        [
          viewerState.config.pageTips.headerMode,
          viewerState.config.pageTips.footerMode,
          viewerState.config.pageTips.headerLeft,
          viewerState.config.pageTips.headerMiddle,
          viewerState.config.pageTips.headerRight,
          viewerState.config.pageTips.footerLeft,
          viewerState.config.pageTips.footerMiddle,
          viewerState.config.pageTips.footerRight,
          chromeBarsVisible(),
        ] as const,
      () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            bindPageTipChromeFrame(contentFrameEl);
            scheduleRemeasureWhenMeasureBlocksReady({ bypassCache: true });
          });
        });
      },
    ),
  );

  onCleanup(() => {
    tipChromeResizeObserver?.disconnect();
    tipChromeResizeObserver = undefined;
    tipChromeObservedTargets = new Set();
    if (tipChromeResizeDebounce !== undefined) {
      clearTimeout(tipChromeResizeDebounce);
      tipChromeResizeDebounce = undefined;
    }
    cancelDualMeasureRetry();
  });

  createEffect(
    on(
      () => [
        viewerState.chapterIndex,
        buildContentRevision(viewerState.content),
        pagedUsesPretextLayout(),
        layoutSignature(),
      ] as const,
      () => {
        if (!pagedUsesPretextLayout()) return;
        const content = viewerState.content;
        if (!content?.trim() || !canUsePretextChapterLayout(content)) return;

        let cancelled = false;
        let debounceTimer: ReturnType<typeof setTimeout> | undefined;

        debounceTimer = setTimeout(() => {
          void (async () => {
            const pageWindow = pageWindowMetrics();
            const layoutWidth = slotContentInnerWidth();
            const height = pageWindow.viewportHeight;
            if (layoutWidth <= 0 || height <= 0 || cancelled) return;

            const dual = pagedLayoutDualPage();
            const revisionInput = {
              content,
              config: viewerState.config,
              viewportWidth: layoutWidth,
              viewportHeight: height,
              chapterTitle: currentChapterTitle(),
              dualPage: dual,
              horizontalInsetOnSlot: true as const,
            };
            const beforeRevision = buildPretextChapterImageRevision(revisionInput);

            const doc = layoutDocumentFromChapter({
              raw: content,
              config: viewerState.config,
              viewportWidth: layoutWidth,
              viewportHeight: height,
              chapterTitle: currentChapterTitle(),
              horizontalInsetOnSlot: true,
              disableFloat: dual,
            });
            if (doc.imageIds.length === 0 || cancelled) return;

            const headersByUrl = new Map<string, Record<string, string>>();
            for (const block of doc.blocks) {
              if (block.kind === 'figure') {
                const ref = block.refs[0];
                if (ref?.legadoHeaders) headersByUrl.set(block.url, ref.legadoHeaders);
              }
            }

            await decodePretextChapterImages(doc.imageIds, { headersByUrl });
            if (cancelled) return;

            const afterRevision = buildPretextChapterImageRevision(revisionInput);
            if (beforeRevision === afterRevision) return;

            clearChapterLayoutCache();
            scheduleRemeasure({ bypassCache: true, immediate: true, force: true });
          })();
        }, 50);

        onCleanup(() => {
          cancelled = true;
          if (debounceTimer !== undefined) clearTimeout(debounceTimer);
        });
      },
    ),
  );

  createEffect(() => {
    if (turnStage() !== 'idle' || !idleContentRoot) return;
    if (pagedUsesPretextLayout()) return;
    const images = idleContentRoot.querySelectorAll('img');
    let imageRemeasureTimer: ReturnType<typeof setTimeout> | undefined;
    const onLoad = (e: Event) => {
      const img = e.currentTarget as HTMLImageElement;
      if (isReaderInlineMeasureImage(img)) return;
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

  createEffect(
    on(
      () => [
        incomingDisplayPage(),
        turnStage(),
        contentRootReady(),
        layout()?.cacheKey,
        pagedUsesPretextLayout(),
        viewerState.config.textFullJustify,
      ] as const,
      () => {
        if (!pagedUsesPretextLayout()) return;
        if (turnStage() !== 'idle' || turnVisualActive()) return;
        if (!pagedLiveContentRootReady()) return;
        const root = idleContentRoot;
        const currentLayout = layout();
        if (!root || !currentLayout || currentLayout.engine !== 'pretext') return;

        const applyDomLines = () => {
          const page = incomingDisplayPage();
          const enriched = attachVisiblePageDomLines(currentLayout, root, page, {
            fontSize: viewerState.config.fontSize,
            lineSpacing: viewerState.config.spacing.line,
            preservePretextMeta: !viewerState.config.textFullJustify,
          });
          const visible = [page - 1, page, page + 1].filter(
            (i) => i >= 0 && i < currentLayout.pages.length,
          );
          const changed = visible.some((i) => {
            const prevLines = currentLayout.pages[i]?.lines?.length ?? 0;
            const nextLines = enriched.pages[i]?.lines?.length ?? 0;
            return nextLines > 0 && nextLines !== prevLines;
          });
          if (changed) setChapterLayout(enriched);
        };

        requestAnimationFrame(applyDomLines);
      },
    ),
  );

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
    void tipBodyClipPx();
    layout();
    contentRootReady();
    viewerState.chapterIndex;
    viewerState.content;
    if (viewerState.contentFetching) return true;
    if (
      viewerState.contentBootstrapping &&
      !viewerState.content?.trim() &&
      !hasWarmChapterLayoutCache()
    ) {
      return true;
    }
    if (viewerState.contentLoading && !hasWarmChapterLayoutCache()) return true;
    if (!resolveLayoutContentForChapter().trim()) return true;
    // 跨章翻页全程不显示骨架（staging/幕帘承担过渡；已切 store 后亦勿闪骨架）
    if (isCrossChapterTurnActive()) return false;
    // 始终双栏：排版完成前保持骨架，避免白屏/左栏 interim
    if (pagedDualSpreadAwaitingFullLayout()) return true;
    // 已有预热排版 / 排版已就绪：不挡骨架（避免 白屏→骨架→白屏）
    if (hasWarmChapterLayoutCache()) return false;
    if (pagedLayoutReadyForReveal()) return false;
    if (pagedDisplayPipelineReady()) return false;
    if (pagedDualSpreadSurfaceReady()) return false;
    if (isPagedSkeletonDismissed() && pagedLayoutReadyForReveal()) return false;
    return true;
  };

  const PAGED_SKELETON_EXIT_MS = 200;

  /** 骨架 visible 时正文透明；exiting 时与骨架交叉淡入淡出 */
  const pagedLiveContentRevealClass = () => {
    // 跨章 staging / 覆盖幕帘克隆也在 span-clip 子树内，须保持 reader-body 可见
    if (isCrossChapterIncomingVisualActive()) return 'is-live-content-revealing';
    if (turnVisualActive()) return 'is-live-content-revealing';
    if (pagedDisplayPipelineReady()) {
      return 'is-live-content-revealed';
    }
    if (
      pagedLayoutReadyForReveal() &&
      (!viewerState.contentLoading || hasWarmChapterLayoutCache())
    ) {
      return 'is-live-content-revealing';
    }
    // 双栏排版进行中：surface 已就绪，勿保持 reader-body opacity:0 白屏（始终双栏等完整排版）
    if (pagedDualSpreadSurfaceReady() && !pagedDualSpreadAwaitingFullLayout()) {
      return 'is-live-content-revealing';
    }
    if (
      pagedLayoutDualPage() &&
      dualSpreadInterimLiveMounted() &&
      !pagedDualSpreadAwaitingFullLayout() &&
      !viewerState.contentFetching &&
      (!viewerState.contentLoading || hasWarmChapterLayoutCache())
    ) {
      return 'is-live-content-revealing';
    }
    if (pagedSkeletonPhase() === 'exiting') return 'is-live-content-revealing';
    return '';
  };

  createEffect(() => {
    if (!isCrossChapterTurnActive()) return;
    if (skeletonExitTimer !== undefined) {
      clearTimeout(skeletonExitTimer);
      skeletonExitTimer = undefined;
    }
    if (pagedSkeletonPhase() !== 'hidden') {
      setPagedSkeletonPhase('hidden');
    }
  });

  createEffect(() => {
    void tipBodyClipPx();
    layout();
    contentRootReady();
    viewerState.chapterIndex;
    viewerState.content;
    viewerState.contentLoading;
    viewerState.contentFetching;
    viewerState.contentBootstrapping;

    const loading = showPagedLoading();

    if (loading) {
      if (
        !isPagedSkeletonDismissed() &&
        !pagedLayoutReadyForReveal() &&
        !hasWarmChapterLayoutCache() &&
        !pagedDualSpreadSurfaceReady()
      ) {
        if (skeletonExitTimer !== undefined) {
          clearTimeout(skeletonExitTimer);
          skeletonExitTimer = undefined;
        }
        setPagedSkeletonPhase('visible');
      }
      return;
    }

    const phase = pagedSkeletonPhase();
    if (phase === 'visible') {
      if (!shouldDismissPagedSkeleton()) {
        return;
      }
      revealPagedChapterWhenReady();
      setPagedSkeletonPhase('exiting');
      skeletonExitTimer = setTimeout(() => {
        setPagedSkeletonPhase('hidden');
        pagedSkeletonDismissedKey = chapterSkeletonKey();
        skeletonExitTimer = undefined;
        scheduleIdleLivePagePaint(incomingDisplayPage());
      }, PAGED_SKELETON_EXIT_MS);
    } else if (phase === 'hidden') {
      pagedSkeletonDismissedKey = chapterSkeletonKey();
    } else if (phase === 'exiting') {
      // 等待退场动画结束
    }
  });

  /** 排版就绪后催促 live 挂载与首帧绘制，缩短缓存章切章白屏 */
  createEffect(() => {
    if (!pagedLayoutReadyForReveal()) return;
    if (pagedDisplayPipelineReady()) return;
    if (turnStage() !== 'idle' || turnVisualActive()) return;
    let frames = 0;
    const tick = () => {
      frames += 1;
      scheduleIdleLivePagePaint(incomingDisplayPage());
      if (!pagedLiveContentRootReady() && frames < 48) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });

  /** 展示管线 / 双栏 surface 就绪时确保撤骨架并绘制 */
  createEffect(() => {
    if (!shouldDismissPagedSkeleton()) return;
    dismissPagedSkeletonInstant();
    scheduleIdleLivePagePaint(incomingDisplayPage());
  });

  /** 排版就绪但 live 长期未挂载：强制重测自救 */
  createEffect(() => {
    if (!pagedLayoutReadyForReveal()) return;
    if (pagedDisplayPipelineReady()) return;
    if (turnStage() !== 'idle' || turnVisualActive()) return;
    const timer = window.setTimeout(() => {
      if (!pagedDisplayPipelineReady()) {
        scheduleRemeasure({
          immediate: true,
          bypassCache: false,
          force: true,
        });
      }
    }, 400);
    onCleanup(() => window.clearTimeout(timer));
  });

  createEffect(() => {
    if (!pagedLayoutReadyForReveal()) return;
    revealPagedChapterWhenReady();
  });

  /** 骨架撤下后补绘（首屏常见：Show 卸载遮罩后下层未合成） */
  createEffect(() => {
    if (showPagedLoading()) return;
    if (!pagedLayoutReadyForReveal()) return;
    if (!pagedChapterReadyForDisplay()) return;
    if (turnStage() !== 'idle' || turnVisualActive()) return;
    const page = incomingDisplayPage();
    layout();
    pageIndex();
    ensureIdleTurnLayerClear();
    scheduleIdleLivePagePaint(page);
  });

  createEffect(() => {
    viewerState.chapterIndex;
    viewerState.content;
    viewerState.contentLoading;
    viewerState.contentFetching;
    viewerState.showContent;
    layout();
    contentRootReady();
    revealPagedChapterWhenReady();
  });

  createEffect(() => {
    if (crossChapterTurn || crossChapterCommitInFlight) return;
    viewerState.chapterIndex;
    viewerState.content;
    viewerState.contentLoading;
    if (applyCachedChapterLayoutIfReady()) {
      dismissPagedSkeletonInstant();
    }
  });

  createEffect(
    on(
      () => viewerState.chapterIndex,
      (_ch, prevCh) => {
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
            bypassCache: false,
            force: !applyCachedChapterLayoutIfReady(),
            allowDuringTurn: true,
          });
          return;
        }

        // 初次挂载：测量根 ref 已绑定，勿清空 dualMeasureContentEl（否则单栏首屏 DOM 分页永久卡住）
        if (prevCh === undefined) {
          queueMicrotask(() => {
            if (viewerState.content?.trim()) {
              scheduleRemeasure({ immediate: true, bypassCache: true, force: true });
            }
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
        const cacheHit = applyCachedChapterLayoutIfReady();
        if (!cacheHit) {
          setChapterLayout(null);
        } else {
          dismissPagedSkeletonInstant();
        }
        idleContentRoot = undefined;
        dualMeasureContentEl = undefined;
        idleContentRootChapter = -1;
        idleContentRevision = '';
        cancelAdjacentChapterLayoutPrefetch();
        setPagedLayoutEngine(cacheHit ? (layout()?.engine ?? 'idle') : 'idle');
        queueMicrotask(() => {
          if (cacheHit) {
            syncPagedClipAndRepaint();
          }
          const content = resolveLayoutContentForChapter(viewerState.chapterIndex);
          if (content.trim()) {
            scheduleRemeasure({
              immediate: true,
              bypassCache: false,
              force: !cacheHit,
            });
          }
        });
      },
    ),
  );

  /** 跨章提前切章后正文晚到：作废 Canvas 占位排版并强制 DOM 重测 */
  createEffect(() => {
    const turn = crossChapterTurn;
    if (!turn?.chapterCommitted) return;
    viewerState.showContent;
    const content = viewerState.content;
    const ch = viewerState.chapterIndex;
    if (!content?.trim() || ch === turn.fromChapterIndex) return;
    const l = layout();
    if (!l || l.chapterIndex !== ch) return;
    if (isChapterLayoutComplete(l, ch, content)) return;
    if (
      l.segments.length > 0 &&
      (isProvisionalCanvasLayout(l) ||
        (needsDomChapterLayout(content) &&
          l.engine !== 'dom' &&
          l.engine !== 'canvas+dom'))
    ) {
      setChapterLayout(null);
    }
    scheduleRemeasureWhenMeasureBlocksReady({ bypassCache: true });
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

  /** 跨章期间 Solid 重绘可能 detach 幕帘，需挂回（drag 由专用 effect 处理） */
  createEffect(() => {
    if (!crossChapterTurn) return;
    viewerState.chapterIndex;
    viewerState.content;
    pageIndex();
    turnStage();
    if (turnStage() === 'drag') return;
    if (anim() === 'simulation' && turnStage() !== 'idle') {
      queueMicrotask(syncSimulationTurnAfterSolidRender);
      return;
    }
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
      scheduleIdleLivePagePaint(target);
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
    const stage = turnStage();
    if (stage !== 'anim') return;
    turnDir();
    pageIndex();
    turnFrom();
    turnTo();
    if (anim() === 'simulation') {
      queueMicrotask(syncSimulationTurnAfterSolidRender);
      return;
    }
    queueMicrotask(syncTurnCurtainAfterRender);
  });

  createEffect(
    on(
      () => [turnStage(), crossChapterStagingTick()] as const,
      ([stage]) => {
        if (stage !== 'drag') return;
        if (anim() === 'simulation') {
          queueMicrotask(syncSimulationTurnAfterSolidRender);
          return;
        }
        queueMicrotask(syncTurnCurtainAfterRender);
      },
    ),
  );

  let resizeObserver: ResizeObserver | undefined;

  onCleanup(() => {
    resizeObserver?.disconnect();
    cancelAnimFrame();
    cancelDragTurnPaint();
    cancelCrossChapterDragFooterSync();
    cancelCoverCurtainPrep();
    clearCrossChapterLayoutTimer();
    clearTurnPageCurtain(turnLayerEl, curtainSlideMountEl);
    clearSimulationCurl(curtainSlideMountEl);
    cancelAdjacentChapterLayoutPrefetch();
    if (progressSaveTimer !== undefined) {
      clearTimeout(progressSaveTimer);
      progressSaveTimer = undefined;
    }
    if (skeletonExitTimer !== undefined) {
      clearTimeout(skeletonExitTimer);
      skeletonExitTimer = undefined;
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
    <Show when={turnVisualActive() && (anim() === 'cover' || anim() === 'slide' || anim() === 'simulation')}>
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

  /** 覆盖翻页：方向死区更小，缩短按下到翻页视觉的等待 */
  const dragDirectionDeadzonePx = () =>
    anim() === 'cover' ? 4 : DRAG_DIRECTION_DEADZONE_PX;

  const dragAxisDeadzonePx = () =>
    anim() === 'cover' ? 4 : READER_PAGED_DRAG_AXIS_DEADZONE_PX;

  const dragIntentFromOffset = (offset: number): PagedTurnDirection | 'neutral' => {
    const deadzone = dragDirectionDeadzonePx();
    if (offset < -deadzone) return 'next';
    if (offset > deadzone) return 'prev';
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

  const armDragTurnLayerCompositor = () => {
    if (turnLayerEl) turnLayerEl.style.willChange = 'transform';
  };

  const releaseDragTurnLayerCompositor = () => {
    if (turnLayerEl) turnLayerEl.style.willChange = '';
  };

  const resetActiveDragTurn = () => {
    cancelDragTurnPaint();
    cancelCrossChapterDragFooterSync();
    cancelCoverCurtainPrep();
    clearTurnPageCurtain(turnLayerEl, curtainSlideMountEl);
    clearSimulationCurl(curtainSlideMountEl);
    simCorner = null;
    simLiveTransformPage = -1;
    cancelSimulationCurlPaint();
    dragPointerCaptured = false;
    curlAnim = null;
    turnCurtainKey = '';
    dragOffsetPxRef = 0;
    turnAnimProgressRef = 0;
    incomingStagingTransformEl = undefined;
    stagingDualLeftShiftEl = undefined;
    stagingDualRightShiftEl = undefined;
    clearSlidePanelStyles();
    releaseDragTurnLayerCompositor();
    if (turnStage() !== 'idle') setTurnStage('idle');
    skipChapterPosSync = true;
    const from = dragStartPageIndex;
    if (pageIndex() !== from) setPageIndex(from);
    if (turnFrom() !== from) setTurnFrom(from);
    if (turnTo() !== from) setTurnTo(from);
    queueMicrotask(() => {
      skipChapterPosSync = false;
      if (anim() === 'slide' || anim() === 'simulation') restoreContentSlotPagedLayout();
    });
    dragTurnInitialized = false;
    turnCurtainPrepInFlight = false;
    turnCurtainPrepToken += 1;
    setCurtainCloneHostPage(null);
    curtainCloneHostInnerEl = undefined;
    const hadCrossChapter = crossChapterTurn != null;
    crossChapterDragStagingUnlocked = false;
    crossChapterStagingPrepStarted = false;
    syncCrossChapterDragLayerVisibility();
    clearCrossChapterTurn();
    if (hadCrossChapter) notifyCrossChapterStagingChange();
    syncCurtainLayerTransform('idle', 0);
  };

  /** 拖回死区：仅复位幕帘位移，保留幕帘挂载，避免起手/回位时拆层卡顿 */
  const coastDragTurnToNeutral = () => {
    dragOffsetPxRef = 0;
    if (turnStage() === 'drag') {
      applyDragTurnProgress(0);
    }
  };

  const resolveIncomingStagingInnerEl = (): HTMLElement | null => {
    if (incomingStagingTransformEl) {
      return incomingStagingTransformEl.closest('.reader-paged-incoming-inner');
    }
    return pageTipBodyEl?.querySelector<HTMLElement>('.reader-paged-incoming-inner') ?? null;
  };

  /** 跨章拖拽：staging 就绪即显示 incoming，勿随 12px 门槛来回切 live（防叠字/闪烁） */
  const syncCrossChapterDragLayerVisibility = () => {
    if (turnStage() !== 'drag' || !crossChapterTurn) {
      liveInnerEl?.classList.remove('reader-paged-live-suppressed');
      resolveIncomingStagingInnerEl()?.classList.remove('reader-paged-incoming-drag-held');
      return;
    }
    const showStaging = crossChapterDragShowsIncoming();
    if (liveInnerEl) {
      liveInnerEl.classList.toggle('reader-paged-live-suppressed', showStaging);
    }
    const incoming = resolveIncomingStagingInnerEl();
    if (incoming) {
      incoming.classList.toggle('reader-paged-incoming-drag-held', !showStaging);
    }
  };

  const scheduleCrossChapterDragFooterSync = () => {
    if (crossChapterDragFooterSyncRaf) return;
    crossChapterDragFooterSyncRaf = requestAnimationFrame(() => {
      crossChapterDragFooterSyncRaf = 0;
      setCrossChapterDragStagingUnlockTick((n) => n + 1);
    });
  };

  const cancelCrossChapterDragFooterSync = () => {
    if (!crossChapterDragFooterSyncRaf) return;
    cancelAnimationFrame(crossChapterDragFooterSyncRaf);
    crossChapterDragFooterSyncRaf = 0;
  };

  const ensureCrossChapterStagingPrep = (direction: PagedTurnDirection) => {
    if (crossChapterStagingPrepStarted) return;
    const turn = crossChapterTurn;
    if (!turn || turn.direction !== direction) return;
    crossChapterStagingPrepStarted = true;
    void prepareCrossChapterStaging(direction, { allowCommitEarly: false }).then((ok) => {
      if (!crossChapterTurn) return;
      if (!ok) {
        crossChapterStagingPrepStarted = false;
        return;
      }
      syncCrossChapterDragLayerVisibility();
      if (turnStage() === 'drag') {
        applyDragTurnProgress(dragOffsetPxRef);
      } else {
        kickoffCrossChapterTurn();
      }
    });
  };

  const syncCrossChapterDragStagingVisualGate = (offset: number) => {
    if (turnStage() !== 'drag' || !crossChapterTurn) {
      if (crossChapterDragStagingUnlocked) {
        crossChapterDragStagingUnlocked = false;
        crossChapterStagingPrepStarted = false;
        cancelCrossChapterDragFooterSync();
        setCrossChapterDragStagingUnlockTick((n) => n + 1);
      }
      return;
    }
    const unlocked = Math.abs(offset) >= CROSS_CHAPTER_DRAG_STAGING_PX;
    if (crossChapterDragStagingUnlocked !== unlocked) {
      crossChapterDragStagingUnlocked = unlocked;
      scheduleCrossChapterDragFooterSync();
    }
  };

  const cancelDragTurnPaint = () => {
    if (!dragTurnPaintRaf) return;
    cancelAnimationFrame(dragTurnPaintRaf);
    dragTurnPaintRaf = 0;
  };

  /** 覆盖翻页：方向死区前跟手（幕帘已在 pointerdown 预挂） */
  const paintProvisionalCoverDrag = (offset: number) => {
    if (anim() !== 'cover' || !turnLayerEl || !getPersistedTurnSlide()) return;
    if (offset === 0) {
      setTurnCurtainTransform(turnLayerEl, undefined);
      return;
    }
    const w = width();
    if (w <= 0) return;
    const ratio = Math.min(1, Math.abs(offset) / w);
    const dir: PagedTurnDirection = offset < 0 ? 'next' : 'prev';
    setTurnCurtainTransform(
      turnLayerEl,
      readerPagedLayerTransform('cover', 'outgoing', dir, ratio),
    );
  };

  const paintDragTurnVisuals = (offset: number) => {
    const turn = crossChapterTurn;
    if (
      turn &&
      turnStage() === 'drag' &&
      viewerState.chapterIndex === turn.fromChapterIndex
    ) {
      if (anim() === 'slide') {
        if (turn.incomingLayout && !turn.chapterCommitted) {
          syncSlideTurnVisuals('drag', offset);
        } else {
          syncCurtainLayerTransform('drag', 0, offset);
        }
        syncCrossChapterDragStagingVisualGate(offset);
        return;
      }
      const w = width();
      const ratio = w > 0 ? Math.min(1, Math.abs(offset) / w) : 0;
      syncPagedTurnVisuals('drag', ratio);
      syncCrossChapterDragStagingVisualGate(offset);
      return;
    }
    if (anim() === 'slide') {
      syncSlideTurnVisuals('drag', offset);
      syncCrossChapterDragStagingVisualGate(offset);
      return;
    }
    if (anim() === 'simulation') {
      syncPagedTurnVisuals('drag', 0);
      syncCrossChapterDragStagingVisualGate(offset);
      return;
    }
    const w = width();
    const ratio = w > 0 ? Math.min(1, Math.abs(offset) / w) : 0;
    syncPagedTurnVisuals('drag', ratio);
    syncCrossChapterDragStagingVisualGate(offset);
  };

  const applyDragTurnProgress = (offset: number) => {
    dragOffsetPxRef = offset;
    paintDragTurnVisuals(offset);
  };

  const scheduleDragTurnPaint = () => {
    if (dragTurnPaintRaf) return;
    dragTurnPaintRaf = requestAnimationFrame(() => {
      dragTurnPaintRaf = 0;
      if (turnStage() !== 'drag') return;
      paintDragTurnVisuals(dragOffsetPxRef);
    });
  };

  /** 覆盖翻页：轴向锁定后预挂幕帘（含页眉页脚），越过方向死区时无需再阻塞 clone */
  const maybeArmCoverDragCurtain = (fromPage: number) => {
    if (anim() !== 'cover' || turnStage() !== 'idle' || !liveInnerEl) return;
    if (turnCurtainPrepInFlight || dragTurnInitialized) return;
    beginTurnCurtain(fromPage, liveInnerEl);
  };

  const clearIdleCoverDragCurtain = () => {
    if (turnStage() !== 'idle' || dragTurnInitialized) return;
    if (!getPersistedTurnSlide()) return;
    cancelDragTurnPaint();
    releaseDragTurnLayerCompositor();
    clearTurnPageCurtain(turnLayerEl, curtainSlideMountEl);
    turnCurtainKey = '';
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
    crossChapterDragStagingUnlocked = false;
    crossChapterStagingPrepStarted = false;
    dragTurnInitialized = true;
    setTurnFrom(fromPage);
    setTurnTo(fromPage);
    setTurnDir(dir);
    if (pageIndex() !== fromPage) {
      skipChapterPosSync = true;
      setPageIndex(fromPage);
      queueMicrotask(() => {
        skipChapterPosSync = false;
      });
    }
    armSimCurlCorner();
    if (liveInnerEl) beginTurnCurtain(fromPage, liveInnerEl);
    setTurnStage('drag');
    armDragTurnLayerCompositor();
    dragOffsetPxRef = offset;
    applyDragTurnProgress(offset);
    syncCrossChapterDragLayerVisibility();
    ensureCrossChapterStagingPrep(dir);
  };

  const initDragTurn = (fromPage: number, dir: PagedTurnDirection, offset: number) => {
    dragOffsetPxRef = offset;
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
    if (anim() === 'slide' || anim() === 'simulation') {
      applyTurnFrameSlideLayout();
    }
    setTurnFrom(fromPage);
    setTurnTo(to);
    setTurnDir(dir);
    armSimCurlCorner();
    const finishDragStart = () => {
      dragTurnInitialized = true;
      setTurnStage('drag');
      armDragTurnLayerCompositor();
      applyDragTurnProgress(dragOffsetPxRef);
    };
    if (to !== fromPage && outgoingRoot) {
      const mode = anim();
      if (mode === 'cover') {
        beginTurnCurtain(fromPage, outgoingRoot);
        finishDragStart();
        return;
      }
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

  const resetAutoPagerReveal = () => {
    autoPagerRevealActive = false;
    setAutoPagerScanRatio(0);
  };

  const commitInstantNextPage = (): boolean => {
    const from = pageIndex();
    if (from < pageCount() - 1) {
      const target = from + 1;
      skipChapterPosSync = true;
      setPageIndex(target);
      const total = pageCount();
      textViewerStore.setChapterPos(total <= 1 ? 0 : target / (total - 1));
      queueMicrotask(() => {
        skipChapterPosSync = false;
      });
      return true;
    }
    if (!isAtLastChapter()) {
      goNextPage();
      return true;
    }
    return false;
  };

  /**
   * 揭示下一页：扫描线以上 clip 显示下一页，以下保留当前页（对齐 Legado AutoPager 非滚动路径）
   * 覆盖 / 滑动 / 仿真 / 无动画均走同一纵向揭示，不触发横向拖拽翻页动画。
   */
  const driveAutoPagerReveal = (progress: number): boolean => {
    if (progress <= 0) {
      resetAutoPagerReveal();
      return false;
    }
    const fromPage = pageIndex();
    const ratio = Math.min(1, Math.max(0, progress));

    if (!autoPagerRevealActive && ratio > 0) {
      if (!canDragTowardNext(fromPage)) return false;
      autoPagerRevealActive = true;
    }

    if (turnVisualActive()) {
      return false;
    }

    setAutoPagerScanRatio(ratio);

    if (ratio >= 1) {
      autoPagerRevealActive = false;
      setAutoPagerScanRatio(0);
      return commitInstantNextPage();
    }
    return false;
  };

  const renderAutoPagerScanReveal = () => {
    const ratio = autoPagerScanRatio();
    if (ratio <= 0 || turnVisualActive() || pagedLayoutDualPage()) return null;

    const current = pageIndex();
    const nextPage = current + 1;
    if (nextPage >= pageCount()) return null;

    const clipH = pageContentClipPx();
    if (clipH <= 0) return null;
    const revealH = Math.max(0, Math.min(clipH, Math.round(clipH * ratio)));
    if (revealH <= 0) return null;

    const extent = contentExtentPx();
    const yOff = contentOffsetY(nextPage);
    const themeCls = theme();

    return (
      <div class="reader-auto-pager-scan pointer-events-none absolute inset-0 z-6" aria-hidden>
        <div class="absolute inset-x-0 top-0 overflow-hidden" style={{ height: `${revealH}px` }}>
          <div
            data-reader-render-page={nextPage}
            class={cn('reader-paged-live-inner h-full w-full', themeCls.bg)}
            style={{
              transform: mergePagedContentTransforms(yOff) ?? undefined,
              'min-height': extent > 0 ? `${extent}px` : undefined,
            }}
          >
            <ReaderContent
              {...contentProps}
              dualPage={false}
              measureBlocks={false}
              pagedLayout
            />
          </div>
        </div>
        <div
          class="absolute left-0 right-0 h-0.5 bg-primary shadow-sm"
          style={{ top: `${revealH}px` }}
        />
      </div>
    );
  };

  createEffect(() => {
    local.onRegisterNav?.({
      goNextPage,
      goPrevPage,
      setPageProgress,
      getBookmarkSnapshot,
      getPageTipContext: pageTipContext,
      canGoNextPage: () => canDragTowardNext(pageIndex()),
      driveAutoPagerReveal,
      isDualPageLayoutActive: () => pagedLayoutDualPage(),
    });
  });

  const width = viewportWidth;

  const releaseDragPointerCapture = (e: PointerEvent) => {
    if (!dragPointerCaptured) return;
    dragPointerCaptured = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const finalizePointerGesture = (e: PointerEvent) => {
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    dismissIdleCoverCurtain();
    if (
      shouldSuppressPagedTapAfterPointer(dx, dy, {
        dragTurnInitialized,
        turnStage: turnStage(),
      })
    ) {
      markPagedTurnPointerConsumed();
      if (isTouchLikePointer(e)) {
        e.preventDefault();
      }
    }
    releaseDragPointerCapture(e);
    dragPointerId = null;
    dragAxis = 'none';
  };

  const onPointerDown = (e: PointerEvent) => {
    if (local.suppressPointerTurn?.()) return;
    if (isTurnAnimating() || e.button !== 0) return;
    if (!e.isPrimary) return;
    if (isMediaViewerInteractiveClick(e.target)) return;
    if (dragPointerId !== null && dragPointerId !== e.pointerId) {
      resetActiveDragTurn();
    }
    if (turnStage() === 'drag') {
      resetActiveDragTurn();
    }
    dragPointerId = e.pointerId;
    dragPointerCaptured = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    simPointerClientX = e.clientX;
    simPointerClientY = e.clientY;
    simCorner = null;
    dragStartPageIndex = pageIndex();
    dragTurnInitialized = false;
    dragAxis = 'none';
    const idx = dragStartPageIndex;
    if (
      (idx <= 0 && !isAtFirstChapter()) ||
      (idx >= pageCount() - 1 && !isAtLastChapter())
    ) {
      warmAdjacentLayoutsFromPool();
    }
    scheduleCoverCurtainPrep(idx);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (dragPointerId !== e.pointerId || isTurnAnimating()) {
      return;
    }
    simPointerClientX = e.clientX;
    simPointerClientY = e.clientY;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (dragAxis === 'none') {
      const axis = resolvePagedDragAxis(dx, dy, dragAxisDeadzonePx());
      if (axis === 'none') return;
      dragAxis = axis;
      if (dragAxis === 'y') return;
      maybeArmCoverDragCurtain(dragStartPageIndex);
      if (!dragPointerCaptured) {
        dragPointerCaptured = true;
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          dragPointerCaptured = false;
        }
      }
    }
    if (dragAxis !== 'x') return;
    if (shouldPreventTouchDefaultForPagedDrag(e, dragAxis)) {
      e.preventDefault();
    }
    e.stopPropagation();

    const w = width();
    if (w <= 0) return;

    const idx = dragStartPageIndex;
    const offset = clampDragOffset(dx, idx);

    if (turnCurtainPrepInFlight) {
      dragOffsetPxRef = offset;
      if (anim() === 'slide') {
        syncSlideTurnVisuals('drag', offset);
      }
      return;
    }

    const intent = resolveDragIntent(offset);

    if (dragTurnInitialized && turnStage() === 'drag') {
      if (intent === 'neutral') {
        coastDragTurnToNeutral();
        return;
      }
      if (intent !== turnDir()) {
        resetActiveDragTurn();
        initDragTurn(idx, intent, offset);
        return;
      }
    }

    if (intent === 'neutral') {
      dragOffsetPxRef = offset;
      paintProvisionalCoverDrag(offset);
      return;
    }

    if (!dragTurnInitialized) {
      if (crossChapterTurn && !crossChapterTurn.animRunning) {
        cancelPendingCrossChapterTurn();
      }
      initDragTurn(idx, intent, offset);
      return;
    }

    dragOffsetPxRef = offset;
    scheduleDragTurnPaint();
  };

  const onPointerUp = (e: PointerEvent) => {
    if (dragPointerId !== e.pointerId) return;

    if (turnStage() !== 'drag') {
      finalizePointerGesture(e);
      return;
    }

    cancelDragTurnPaint();
    paintDragTurnVisuals(dragOffsetPxRef);

    const offset = dragOffsetPxRef;
    const w = width();
    const commitThreshold = textViewerPagedDragCommitThresholdPx(w, viewerState.config);
    const commit = w > 0 && Math.abs(offset) >= commitThreshold;

    markPagedTurnPointerConsumed();
    if (isTouchLikePointer(e)) {
      e.preventDefault();
    }
    releaseDragPointerCapture(e);
    dragPointerId = null;
    dragAxis = 'none';

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
    return [`${ch}:${rev}:live`];
  });

  let lastLiveChapterMountKey = '';
  createEffect(() => {
    const key = liveChapterContentMountKey()[0] ?? '';
    if (key === lastLiveChapterMountKey) return;
    lastLiveChapterMountKey = key;
    if (
      !isCrossChapterTurnActive() &&
      !pagedLayoutReadyForReveal() &&
      !hasWarmChapterLayoutCache()
    ) {
      pagedSkeletonDismissedKey = '';
    }
    idleContentRoot = undefined;
    idleContentRootChapter = -1;
    idleContentRevision = '';
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
      livePageStartRefineKey = '';
      setContentRootReady((n) => n + 1);
    }
    if (layoutAwaitingMeasure()) {
      scheduleRemeasureWhenMeasureBlocksReady({ bypassCache: true });
    }
    if (pagedLayoutReadyForReveal()) {
      queueMicrotask(() => scheduleIdleLivePagePaint(incomingDisplayPage()));
    }
    if (pagedChapterReadyForDisplay()) {
      queueMicrotask(() => scheduleIdleLivePagePaint(incomingDisplayPage()));
    }
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        if (idleContentRoot) refineLiveLayoutPageStartsFromDom(idleContentRoot);
      });
    });
    if (pagedLayoutDualPage()) {
      scheduleDualSpreadPageTransforms(() => {
        applyLiveDualSpreadPageTransforms(incomingDisplayPage());
      });
    }
    if (crossChapterTurn?.chapterCommitted) {
      queueMicrotask(() => kickoffCrossChapterTurn());
    }
  };

  const shouldMountIncomingStaging = () => isCrossChapterIncomingVisualActive();

  const showIncomingStaging = () => {
    crossChapterDragStagingUnlockTick();
    if (!isCrossChapterIncomingVisualActive()) return false;
    if (turnStage() === 'drag' && !crossChapterDragStagingUnlocked) return false;
    return true;
  };

  /**
   * staging 章 DOM 挂载后用实测排版精修 incomingLayout，使预览页界与切章落点一致
   * （Canvas 预排与 DOM 常有偏差，尤其首/末页）。
   */
  const refineStagingLayoutFromDom = (_contentRoot: HTMLElement) => {
    if (turnStage() === 'drag') return;
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

    if (turn.chapterCommitted) {
      syncCrossChapterDisplayPage();
    }

    if (turnStage() === 'drag') {
      applyDragTurnProgress(dragOffsetPxRef);
    } else if (turnStage() === 'anim' && anim() === 'slide') {
      syncSlideTurnVisuals('anim', turnAnimProgressRef);
    }
  };

  let livePageStartRefineKey = '';

  /** live 正文挂载后复核页界，修正 measure-host 与行内图实测偏差 */
  const refineLiveLayoutPageStartsFromDom = (contentRoot: HTMLElement) => {
    if (pagedLayoutDualPage()) return;
    if (turnStage() !== 'idle' || turnVisualActive()) return;
    const l = layout();
    const ch = viewerState.chapterIndex;
    if (!l || l.chapterIndex !== ch || !isChapterLayoutComplete(l, ch)) return;
    if (l.clipHeight <= 0 || l.pageStarts.length <= 1) return;

    const measureRoot = resolvePagedMeasureRoot(contentRoot);
    const refineKey = `${l.cacheKey}|${l.pageStarts.join(',')}|${l.clipHeight}|${measureRoot.scrollHeight}`;
    if (livePageStartRefineKey === refineKey) return;

    let trimmed = trimPageStartsToSegmentVisualBounds(
      l.pageStarts,
      l.segments,
      l.clipHeight,
      l.contentExtent,
    );
    if (trimmed.length > 1) {
      trimmed = trimPageStartsBeforeClipStraddle(measureRoot, trimmed, l.clipHeight);
    }
    const unchanged =
      trimmed.length === l.pageStarts.length &&
      trimmed.every((v, i) => Math.abs(v - (l.pageStarts[i] ?? -1)) < 0.5);
    livePageStartRefineKey = refineKey;
    if (unchanged) return;

    applyLayout(chapterLayoutWithPageStarts(l, trimmed), false);
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
    /** 跨章 staging：捕获 shift 节点供 imperative 翻页动画 */
    captureStagingShifts?: boolean;
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
          if (bindLive) {
            liveInnerEl = el;
            if (el) setContentRootReady((n) => n + 1);
          }
        }}
        data-reader-render-page={options.page}
        class={cn(
          'reader-paged-live-inner reader-paged-dual-spread relative h-full w-full',
          theme().bg,
          options.hideLive && 'reader-paged-live-suppressed',
        )}
        style={{
          ...dualSpreadContainerStyle(dualSpreadColumnGapPx()),
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
                else if (options.captureStagingShifts) stagingDualLeftShiftEl = el ?? undefined;
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
                else if (options.captureStagingShifts) stagingDualRightShiftEl = el ?? undefined;
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
    if (!shouldMountIncomingStaging()) return null;

    const page = incomingDisplayPage();
    const il = resolveCrossChapterStagingLayout();
    if (!il) return null;
    const extent = il.contentExtent;
    const turning = turnVisualActive();
    const dual = pagedLayoutDualPage();
    const stagingMeasureBlocks = turnStage() !== 'drag';

    const syncIncomingDragHeld = (el: HTMLElement | undefined) => {
      if (el && turnStage() === 'drag') {
        syncCrossChapterDragLayerVisibility();
      }
    };

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
              measureBlocks={stagingMeasureBlocks}
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
            measureBlocks={stagingMeasureBlocks}
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
          ref={(el) => syncIncomingDragHeld(el ?? undefined)}
          class={cn(
            'reader-paged-incoming-inner absolute inset-0 z-1 h-full w-full overflow-hidden pointer-events-none',
            theme().bg,
          )}
        >
          {renderDualSpreadContentShell({
            page,
            extent,
            layoutOverride: il,
            slideActive: false,
            turning,
            bindLiveInner: false,
            captureStagingShifts: true,
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
        ref={(el) => syncIncomingDragHeld(el ?? undefined)}
        class={cn(
          'reader-paged-incoming-inner absolute inset-0 z-1 h-full w-full overflow-hidden pointer-events-none',
          theme().bg,
        )}
      >
        <div
          ref={(el) => {
            incomingStagingTransformEl = el ?? undefined;
          }}
          class="h-full w-full"
          style={{
            transform: mergePagedContentTransforms(y) || undefined,
            'min-height': extent > 0 ? `${extent}px` : undefined,
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
          class={cn('reader-paged-live-inner h-full w-full min-w-0 max-w-full', theme().bg)}
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
    const simTurning = turning && anim() === 'simulation';

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
    const hideLive = Boolean(
      turn &&
        ((turnStage() !== 'drag' && showIncomingStaging()) ||
          crossChapterDragShowsIncoming()),
    );
    const dual = pagedLayoutDualPage();
    const liveMeasureBlocks = pagedLiveUsesMeasureBlocks();

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
              measureBlocks={liveMeasureBlocks}
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

    if (dual) {
      if (dualSpreadLayoutReady()) {
        return renderDualSpreadContentShell({
          page,
          extent,
          extraTransform,
          slideActive,
          turning,
          hideLive: hideLive,
          leftContent: leftChapterBody,
          rightContent: rightChapterBody,
        });
      }

      if (!isAlwaysDualPageMode() && viewerState.content?.trim()) {
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
          hideLive: hideLive,
          leftContent: interimLeft,
          rightContent: interimRight,
        });
      }

      return (
        <div
          ref={(el) => {
            liveInnerEl = el;
          }}
          class={cn(
            'reader-paged-live-inner h-full w-full min-w-0 max-w-full',
            theme().bg,
            hideLive && 'reader-paged-live-suppressed',
          )}
          aria-hidden="true"
        />
      );
    }

    const chapterBody = leftChapterBody;

    const transform = simTurning
      ? undefined
      : turning || slideActive
        ? mergePagedContentTransforms(contentOffsetY(page), extraTransform)
        : idleLivePageTransform();

    return (
      <div
        ref={(el) => {
          liveInnerEl = el;
          if (el) {
            setContentRootReady((n) => n + 1);
            if (pagedChapterReadyForDisplay()) {
              scheduleIdleLivePagePaint(page);
            }
          }
        }}
        data-reader-render-page={page}
        class={cn(
          'reader-paged-live-inner h-full w-full min-w-0 max-w-full',
          theme().bg,
          hideLive && 'reader-paged-live-suppressed',
        )}
        style={{
          transform: slideActive
            ? mergePagedContentTransforms(contentOffsetY(page))
            : transform ??
              (turnStage() === 'idle' && !turning && !simTurning
                ? readerPagedIdleContentTransform(contentOffsetY(page))
                : undefined),
          'min-height': extent > 0 ? `${extent}px` : undefined,
          'will-change': turning && !slideActive && !simTurning ? 'transform' : undefined,
          'background-color': pageThemeBg(),
        }}
      >
        {chapterBody}
      </div>
    );
  };

  const observeTipChromeNode = (node: Element | null | undefined) => {
    if (!node || !tipChromeResizeObserver || tipChromeObservedTargets.has(node)) return;
    tipChromeResizeObserver.observe(node);
    tipChromeObservedTargets.add(node);
  };

  const observePageTipChromeResizeTargets = (frame: HTMLDivElement) => {
    if (!tipChromeResizeObserver) return;
    observeTipChromeNode(frame.querySelector('.reader-page-tip-header'));
    observeTipChromeNode(frame.querySelector('.reader-page-tip-footer'));
    observeTipChromeNode(frame.querySelector('.reader-page-tip-body'));
  };

  const bindPageTipChromeFrame = (el: HTMLDivElement | undefined) => {
    if (!el) {
      contentFrameEl = undefined;
      tipChromeResizeObserver?.disconnect();
      tipChromeResizeObserver = undefined;
      tipChromeObservedTargets = new Set();
      if (tipChromeResizeDebounce !== undefined) {
        clearTimeout(tipChromeResizeDebounce);
        tipChromeResizeDebounce = undefined;
      }
      return;
    }

    const sameFrame = contentFrameEl === el;
    contentFrameEl = el;

    if (sameFrame) {
      observePageTipChromeResizeTargets(el);
      return;
    }

    tipChromeResizeObserver?.disconnect();
    tipChromeResizeObserver = undefined;
    tipChromeObservedTargets = new Set();
    if (tipChromeResizeDebounce !== undefined) {
      clearTimeout(tipChromeResizeDebounce);
      tipChromeResizeDebounce = undefined;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scheduleRemeasure({ immediate: true, bypassCache: true, force: true });
      });
    });

    if (typeof ResizeObserver === 'undefined') return;
    tipChromeResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const target = entry.target;
        if (
          target instanceof HTMLElement &&
          target.classList.contains('reader-page-tip-body')
        ) {
          const h = readStrictTipBodyClipHeightPx(target);
          if (h > 0) {
            setTipBodyClipPx((prev) => (prev === h ? prev : h));
          }
        }
      }
      if (tipChromeResizeDebounce !== undefined) {
        clearTimeout(tipChromeResizeDebounce);
      }
      tipChromeResizeDebounce = setTimeout(() => {
        tipChromeResizeDebounce = undefined;
        syncTipBodyClipPxFromDom();
        scheduleRemeasure({ immediate: true, bypassCache: true, force: true });
      }, 120);
    });
    observeTipChromeNode(el);
    observePageTipChromeResizeTargets(el);

    let observePasses = 0;
    const attachLateTipChromeTargets = () => {
      if (contentFrameEl !== el) return;
      observePageTipChromeResizeTargets(el);
      observePasses += 1;
      if (observePasses < 4) requestAnimationFrame(attachLateTipChromeTargets);
    };
    requestAnimationFrame(attachLateTipChromeTargets);
  };

  const renderPagedWindow = () => {
    const themeCls = theme();
    const slotInset = pagedSlotInsetFromConfig();
    const slideActive = slideTurnActive();
    const turnPanelLayout = turnSlidePanelLayoutActive();

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
          class={cn(
            'reader-paged-clip relative box-border h-full overflow-hidden',
            themeCls.bg,
          )}
          style={{
            ...pagedClipStyle(),
            'background-color': pageThemeBg(),
          }}
        >
          <div
            ref={(el) => {
              turnLayerEl = el;
            }}
            class={cn(
              'reader-paged-turn-layer pointer-events-none absolute inset-0 overflow-hidden',
              turnVisualActive() && themeCls.bg,
            )}
            style={{
              'background-color': turnVisualActive() ? pageThemeBg() : 'transparent',
            }}
          >
            {renderTurnGutterBackdrop(themeCls, turnGutterInsets())}
            <div
              ref={(el) => {
                curtainSlideMountEl = el;
              }}
              class={cn(
                'reader-paged-curtain-slide-mount absolute overflow-hidden box-border',
                turnVisualActive() && themeCls.bg,
              )}
              style={{
                ...(turnVisualActive() &&
                (anim() === 'slide' || anim() === 'simulation' || anim() === 'cover')
                  ? {
                      ...turnCurtainSlideMountActiveStyle(slotInset),
                      'background-color': pageThemeBg(),
                      ...((anim() === 'slide' || anim() === 'simulation') && {
                        contain: 'layout style paint',
                      }),
                    }
                  : { 'background-color': 'transparent' }),
              }}
            />
            {renderCoverTurnEdge()}
          </div>
          <ReaderPageTipChrome
            tips={viewerState.config.pageTips}
            context={pageTipContext()}
            chromeBarsVisible={chromeBarsVisible()}
            themeId={viewerState.config.theme}
            frameRef={bindPageTipChromeFrame}
            bodyRef={(el) => {
              pageTipBodyEl = el;
              if (!el) {
                setTipBodyClipPx(0);
                return;
              }
              syncTipBodyClipPxFromDom();
              requestAnimationFrame(() => {
                syncTipBodyClipPxFromDom();
              });
            }}
            layoutStyle={{
              ...(slideActive || turnPanelLayout
                ? readerTextContentSlotSlidePanelStyle()
                : pagedFrameStyle()),
              ...turnSlidePanelStyle(),
            }}
          >
            <div
              ref={(el) => {
                contentSlotEl = el;
              }}
              class="reader-text-content-slot relative z-1 h-full min-h-0 w-full overflow-hidden box-border"
              style={readerTextContentSlotPaddingStyle(slotInset)}
            >
              <div
                class={cn(
                  READER_PAGED_MEASURE_HOST_CLASS,
                  'pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-0',
                )}
                aria-hidden="true"
                style={measureHostInnerStyle()}
              >
                <Index each={[measureHostMountKey()]}>
                  {() => (
                    <ReaderContent
                      {...contentProps}
                      class="h-full w-full"
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
              <div
                class={cn(
                  'reader-paged-page-window relative z-1 h-full min-h-0 w-full overflow-hidden',
                  themeCls.bg,
                  themeCls.text,
                )}
              >
                  <div class="reader-paged-page-content-clip relative h-full min-h-0 w-full overflow-hidden">
                    {renderCurtainCloneHost()}
                    <div
                      class={cn(
                        'reader-paged-page-span-clip absolute inset-x-0 top-0 overflow-hidden',
                        pagedLayoutDualPage() && 'bottom-0',
                      )}
                      style={pageSpanClipStyle()}
                    >
                      {renderLiveChapter()}
                      {renderIncomingStagingChapter()}
                      <ReaderPagedAloudOverlay
                        layout={() => layout()}
                        pageIndex={() => incomingDisplayPage()}
                        chapterIndex={() => viewerState.chapterIndex}
                        contentOffsetY={() => contentOffsetY(incomingDisplayPage())}
                      />
                    </div>
                    {renderAutoPagerScanReveal()}
                  </div>
              </div>
            </div>
          </ReaderPageTipChrome>
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
        pagedLiveContentRevealClass(),
      )}
      data-cross-chapter-staging={shouldMountIncomingStaging() ? '' : undefined}
      data-dual-page={pagedLayoutDualPage() ? '' : undefined}
      style={pagedViewportThemeStyle()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={(e) => {
        if (dragPointerId === e.pointerId) {
          dragPointerCaptured = false;
          dragPointerId = null;
          dragAxis = 'none';
        }
      }}
    >
      <div class={cn('relative z-10 h-full min-h-0 w-full', theme().bg)}>
        {renderPagedWindow()}
        <Show when={pagedSkeletonPhase() !== 'hidden'}>
          <div
            class={cn(
              'reader-paged-loading absolute inset-0 z-30 overflow-hidden',
              theme().bg,
              theme().text,
              pagedSkeletonPhase() === 'exiting' && 'is-exiting',
            )}
            style={{
              'background-color': pageThemeBg(),
            }}
          >
            <div class="reader-paged-clip relative h-full overflow-hidden" style={pagedClipStyle()}>
              <div
                class="reader-text-content-slot absolute z-2 overflow-hidden box-border"
                style={readerTextContentSlotPagedMountStyle(pagedSlotInsetFromConfig())}
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
