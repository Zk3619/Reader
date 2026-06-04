import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
  splitProps,
  type Accessor,
} from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import { ReaderContent, type ReaderContentProps } from '@/components/viewer/text-viewer/ReaderContent';
import {
  paginateReaderContent,
  pageCountFromStarts,
  pageDisplayHeight,
  type ReaderLayoutSegment,
} from '@/lib/media/text/text-viewer-paginate';
import { TEXT_VIEWER_PAGED_VERTICAL_PAD_PX } from '@/lib/media/text/reader-ui-config';
import { readerThemeClasses } from '@/lib/media/text/reader-theme-classes';
import type { TextViewerPageAnim } from '@/lib/media/text/reader-ui-config';
import {
  readerPagedContentOffsetStyle,
  readerPagedIncomingZIndex,
  readerPagedLayerTransform,
  readerPagedOutgoingZIndex,
  type PagedTurnDirection,
} from '@/lib/media/text/reader-paged-turn-style';
import { cn } from '@/lib/utils';
import type { ReaderPagedNavApi } from '@/components/viewer/text-viewer/reader-paged-nav';

const PAGE_TURN_MS = 320;
const DRAG_COMMIT_RATIO = 0.18;
const DRAG_COMMIT_PX = 48;

type TurnStage = 'idle' | 'anim' | 'drag';

export interface ReaderPagedViewportProps extends ReaderContentProps {
  pageAnim: Accessor<TextViewerPageAnim>;
  onRequestPrevChapter: () => void;
  onRequestNextChapter: () => void;
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
  const [pageStarts, setPageStarts] = createSignal<number[]>([0]);
  const [pageClipHeight, setPageClipHeight] = createSignal(0);
  const [contentExtent, setContentExtent] = createSignal(0);
  const [layoutSegments, setLayoutSegments] = createSignal<ReaderLayoutSegment[]>([]);
  const [pagePad, setPagePad] = createSignal({
    top: TEXT_VIEWER_PAGED_VERTICAL_PAD_PX,
    bottom: TEXT_VIEWER_PAGED_VERTICAL_PAD_PX,
  });

  const [turnStage, setTurnStage] = createSignal<TurnStage>('idle');
  const [turnFrom, setTurnFrom] = createSignal(0);
  const [turnTo, setTurnTo] = createSignal(0);
  const [turnDir, setTurnDir] = createSignal<PagedTurnDirection>('next');
  const [turnProgress, setTurnProgress] = createSignal(0);

  let measureSlot: HTMLDivElement | undefined;
  let measureInner: HTMLDivElement | undefined;
  let viewportEl: HTMLDivElement | undefined;
  let animFrame: number | undefined;
  let animStart = 0;
  let skipChapterPosSync = false;
  let progressRestoredKey = '';
  let progressSaveTimer: ReturnType<typeof setTimeout> | undefined;

  let dragPointerId: number | null = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragAxis: 'none' | 'x' | 'y' = 'none';

  const pageCount = createMemo(() => pageCountFromStarts(pageStarts()));

  const theme = () => readerThemeClasses(textViewerStore.state.config.theme);

  const remeasure = () => {
    if (!measureInner || !viewportEl) return;
    const height = viewportEl.clientHeight;
    const width = viewportEl.clientWidth;
    if (height <= 0 || width <= 0) return;

    measureInner.style.width = `${width}px`;
    measureInner.style.maxWidth = `${width}px`;

    const contentRoot = measureInner.querySelector<HTMLElement>('[data-reader-content]');
    if (!contentRoot) return;

    const cfg = textViewerStore.state.config;
    const paginateOpts = {
      padTop: TEXT_VIEWER_PAGED_VERTICAL_PAD_PX,
      padBottom: TEXT_VIEWER_PAGED_VERTICAL_PAD_PX,
      fontSize: cfg.fontSize,
      lineSpacing: cfg.spacing.line,
    };

    let result = paginateReaderContent(contentRoot, height, paginateOpts);

    if (turnStage() === 'idle' && viewportEl) {
      const visibleRoot = viewportEl.querySelector<HTMLElement>('[data-reader-content]');
      if (visibleRoot && visibleRoot !== contentRoot) {
        result = paginateReaderContent(visibleRoot, height, paginateOpts);
      }
    }

    setPageClipHeight(result.clipHeight);
    setContentExtent(result.contentExtent);
    setLayoutSegments(result.segments);
    setPagePad({ top: result.padTop, bottom: result.padBottom });
    setPageStarts(result.pageStarts);
    setPageIndex((i) => Math.min(i, Math.max(0, result.pageStarts.length - 1)));
  };

  const pageStartAt = (index: number) => Math.round(pageStarts()[index] ?? 0);

  const displayHeightForPage = (page: number) =>
    pageDisplayHeight(
      page,
      pageStarts(),
      pageClipHeight(),
      contentExtent(),
      layoutSegments(),
    );

  const cancelAnimFrame = () => {
    if (animFrame !== undefined) {
      cancelAnimationFrame(animFrame);
      animFrame = undefined;
    }
  };

  const finishTurn = (target: number) => {
    cancelAnimFrame();
    setPageIndex(target);
    setTurnStage('idle');
    setTurnProgress(0);
  };

  const runAnimatedTurn = (target: number, direction: PagedTurnDirection) => {
    if (target === pageIndex() || turnStage() !== 'idle') return;
    const anim = local.pageAnim();
    if (anim === 'none') {
      finishTurn(target);
      return;
    }
    setTurnFrom(pageIndex());
    setTurnTo(target);
    setTurnDir(direction);
    setTurnProgress(0);
    setTurnStage('anim');
    animStart = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - animStart) / PAGE_TURN_MS);
      setTurnProgress(t);
      if (t < 1) {
        animFrame = requestAnimationFrame(tick);
        return;
      }
      finishTurn(target);
    };
    animFrame = requestAnimationFrame(tick);
  };

  const goNextPage = () => {
    const idx = pageIndex();
    if (idx < pageCount() - 1) {
      runAnimatedTurn(idx + 1, 'next');
      return;
    }
    local.onRequestNextChapter();
  };

  const goPrevPage = () => {
    const idx = pageIndex();
    if (idx > 0) {
      runAnimatedTurn(idx - 1, 'prev');
      return;
    }
    local.onRequestPrevChapter();
  };

  const setPageProgress = (ratio: number) => {
    const total = pageCount();
    const target =
      total <= 1 ? 0 : Math.round(Math.max(0, Math.min(1, ratio)) * (total - 1));
    if (target === pageIndex()) return;
    runAnimatedTurn(target, target > pageIndex() ? 'next' : 'prev');
  };

  const scheduleRemeasure = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => remeasure());
    });
  };

  createEffect(() => {
    textViewerStore.state.content;
    textViewerStore.state.config;
    textViewerStore.state.chapterIndex;
    textViewerStore.state.showContent;
    scheduleRemeasure();
  });

  onMount(() => {
    void document.fonts?.ready.then(() => scheduleRemeasure());
  });

  createEffect(() => {
    if (!measureInner) return;
    const images = measureInner.querySelectorAll('img');
    const onLoad = () => scheduleRemeasure();
    images.forEach((img) => img.addEventListener('load', onLoad, { passive: true }));
    onCleanup(() => images.forEach((img) => img.removeEventListener('load', onLoad)));
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

  createEffect(() => {
    textViewerStore.state.chapterIndex;
    progressRestoredKey = '';
    skipChapterPosSync = true;
    cancelAnimFrame();
    setTurnStage('idle');
    setPageIndex(0);
    queueMicrotask(() => {
      skipChapterPosSync = false;
    });
  });

  createEffect(() => {
    const ch = textViewerStore.state.chapterIndex;
    const starts = pageStarts();
    if (starts.length === 0) return;
    const key = `${ch}:${starts.length}:${pageClipHeight()}`;
    if (progressRestoredKey === key) return;
    progressRestoredKey = key;
    const pos = textViewerStore.state.chapterPos;
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

  let resizeObserver: ResizeObserver | undefined;
  onCleanup(() => {
    resizeObserver?.disconnect();
    cancelAnimFrame();
    if (progressSaveTimer !== undefined) clearTimeout(progressSaveTimer);
  });

  const anim = () => local.pageAnim();
  const width = () => viewportEl?.clientWidth ?? 0;

  const dragProgress = () => {
    const w = width();
    if (w <= 0) return 0;
    return Math.max(-1, Math.min(1, turnProgress() / w));
  };

  const onPointerDown = (e: PointerEvent) => {
    if (turnStage() === 'anim' || e.button !== 0) return;
    dragPointerId = e.pointerId;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
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

    let offset = dx;
    const idx = pageIndex();
    if (offset < 0 && idx >= pageCount() - 1) offset *= 0.35;
    if (offset > 0 && idx <= 0) offset *= 0.35;

    setTurnFrom(idx);
    setTurnTo(offset < 0 ? Math.min(idx + 1, pageCount() - 1) : Math.max(idx - 1, 0));
    setTurnDir(offset < 0 ? 'next' : 'prev');
    setTurnProgress(offset);
    setTurnStage('drag');
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

    const offset = turnProgress();
    const w = width();
    const commit =
      w > 0 &&
      (Math.abs(offset) > w * DRAG_COMMIT_RATIO || Math.abs(offset) > DRAG_COMMIT_PX);

    if (commit) {
      if (offset < 0 && pageIndex() < pageCount() - 1) {
        runAnimatedTurn(pageIndex() + 1, 'next');
        return;
      }
      if (offset > 0 && pageIndex() > 0) {
        runAnimatedTurn(pageIndex() - 1, 'prev');
        return;
      }
    }

    setTurnStage('idle');
    setTurnProgress(0);
  };

  const renderPageWindow = (
    page: number,
    role: 'outgoing' | 'incoming',
    progress: number,
    _extraTransform?: string,
  ) => {
    const start = pageStartAt(page);
    const displayH = displayHeightForPage(page);
    const pad = pagePad();
    const layerTransform = readerPagedLayerTransform(anim(), role, turnDir(), progress);
    const dragTransform =
      role === 'outgoing' && turnStage() === 'drag'
        ? `translate3d(${turnProgress()}px, 0, 0)`
        : undefined;

    const themeCls = theme();
    return (
      <div
        class={cn(
          'reader-paged-window absolute inset-0 box-border h-full w-full overflow-hidden',
          themeCls.bg,
          themeCls.text,
        )}
        style={{
          'padding-top': `${pad.top}px`,
          'padding-bottom': `${pad.bottom}px`,
          'z-index': role === 'outgoing'
            ? readerPagedOutgoingZIndex(anim())
            : readerPagedIncomingZIndex(anim()),
        }}
      >
        <div
          class="relative overflow-hidden"
          style={displayH > 0 ? { height: `${displayH}px` } : { height: '100%' }}
        >
          <div
            class={cn('reader-paged-window-inner w-full will-change-transform', themeCls.bg)}
            style={{
              ...readerPagedContentOffsetStyle(start),
              transform: [layerTransform, dragTransform].filter(Boolean).join(' ') || undefined,
              'min-height': `${start + displayH}px`,
            }}
          >
            <ReaderContent {...contentProps} pagedLayout dualPage={false} />
          </div>
        </div>
        <Show when={anim() === 'linkedCover' && role === 'incoming'}>
          <div
            class="pointer-events-none absolute inset-0 bg-black/25"
            style={{ opacity: `${Math.max(0, 1 - progress) * 0.4}` }}
          />
        </Show>
      </div>
    );
  };

  const idlePage = () => pageIndex();
  const showDualLayer = () => turnStage() !== 'idle';
  const animProgress = () => (turnStage() === 'drag' ? Math.abs(dragProgress()) : turnProgress());

  return (
    <div
      ref={(el) => {
        viewportEl = el;
        resizeObserver?.disconnect();
        resizeObserver = new ResizeObserver(() => remeasure());
        resizeObserver.observe(el);
      }}
      class={cn(
        'reader-paged-viewport relative h-full min-h-0 w-full touch-pan-y overflow-hidden',
        theme().bg,
        theme().text,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        ref={measureSlot}
        class="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-0"
        aria-hidden="true"
      >
        <div ref={measureInner} class="mx-auto w-full">
          <ReaderContent {...contentProps} measureBlocks pagedLayout dualPage={false} />
        </div>
      </div>

      <div class={cn('relative z-10 h-full min-h-0 w-full', theme().bg)}>
        <Show
          when={showDualLayer()}
          fallback={renderPageWindow(idlePage(), 'outgoing', 0)}
        >
          {renderPageWindow(turnFrom(), 'outgoing', animProgress())}
          <Show when={turnTo() !== turnFrom()}>
            {renderPageWindow(turnTo(), 'incoming', animProgress())}
          </Show>
        </Show>
      </div>
    </div>
  );
}
