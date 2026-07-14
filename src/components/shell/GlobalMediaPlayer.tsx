/**
 * 全局壳层媒体播放器（朗读 / 音频 / 视频共用）
 * 后台朗读退出阅读器后，在主界面顶/底展示控制条。
 */

import { Show, createEffect, createMemo, createSignal, onCleanup, onMount, type Accessor } from 'solid-js';
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
} from 'lucide-solid';
import { BookCoverFallback } from '@/components/books/BookCoverFallback';
import { BookCoverFromBook } from '@/components/books/BookCoverFromBook';
import {
  bookGroupGridCoverClass,
  bookGroupGridCoverZoomClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { Button } from '@/components/ui/button';
import {
  mediaViewerChromeBottomSurfaceClass,
  mediaViewerChromeFloatingControlClass,
  mediaViewerChromeHitTargetClass,
  type ViewerChromeLayout,
} from '@/components/viewer/viewer-chrome';
import { cn } from '@/lib/utils';
import { insetBottomAppBar, insetTopAppBar } from '@/lib/ui/viewport-classes';
import {
  resolveMediaPlayerChromeLayout,
  resolveMediaPlayerChromePosition,
  globalMediaPlayerFloatingEdgeClass,
} from '@/lib/viewer/media-player-chrome-layout';
import {
  getReadAloudSessionSnapshot,
  isReadAloudSessionActive,
  nextReadAloudChapter,
  nextReadAloudParagraph,
  prevReadAloudChapter,
  prevReadAloudParagraph,
  stopReadAloudSession,
  subscribeReadAloudSession,
  toggleReadAloudSessionPlay,
  type ReadAloudSessionSnapshot,
} from '@/lib/media/text/read-aloud-session';
import { subscribeReadAloudProgress } from '@/lib/media/text/read-aloud-progress';
import {
  globalMediaPlayerState,
  globalMediaPlayerStore,
} from '@/stores/global-media-player';
import { AUDIO_HUB_BOOK_URL } from '@/lib/media/content-session';
import { isMusicHubShellActive } from '@/stores/shell-tabs';
import {
  audioShellOpenViewer,
  audioShellSkipNext,
  audioShellSkipPrev,
  audioShellStop,
  audioShellTogglePlay,
  audioShellIsPlaying,
  hasAudioShellHandlers,
  subscribeAudioShellPlaying,
} from '@/lib/media/audio/audio-shell-controls';

export interface GlobalMediaPlayerProps {
  /** 独立页（阅读器等）打开时隐藏壳层播放器 */
  shellOverlayOpen: Accessor<boolean>;
  /** 当前壳层页（用于在音乐模块内隐藏全局播放器） */
  currentShellPage: Accessor<string>;
  showTopNav: Accessor<boolean>;
  showBottomBar: Accessor<boolean>;
  /** 与主内容区一致的左侧偏移（桌面侧栏） */
  shellMainLeftClass?: string;
  onOpenTextReader?: (bookUrl: string) => void;
  onOpenAudioHub?: () => void;
}

export function useGlobalMediaPlayerFixedInset(props: {
  shellOverlayOpen: Accessor<boolean>;
  currentShellPage: Accessor<string>;
  showTopNav: Accessor<boolean>;
  showBottomBar: Accessor<boolean>;
}): Accessor<{ top: boolean; bottom: boolean; heightPx: number }> {
  return createMemo(() => {
    if (props.shellOverlayOpen()) return { top: false, bottom: false, heightPx: 0 };
    if (isMusicHubShellActive(props.currentShellPage())) {
      return { top: false, bottom: false, heightPx: 0 };
    }
    if (!globalMediaPlayerState.shellActive || !globalMediaPlayerState.kind) {
      return { top: false, bottom: false, heightPx: 0 };
    }
    const layout = resolveMediaPlayerChromeLayout();
    if (layout !== 'fixed') return { top: false, bottom: false, heightPx: 0 };
    if (globalMediaPlayerState.collapsed) return { top: false, bottom: false, heightPx: 0 };
    const pos = resolveMediaPlayerChromePosition();
    const readAloudActive =
      globalMediaPlayerState.kind !== 'read-aloud' || isReadAloudSessionActive();
    if (!readAloudActive) return { top: false, bottom: false, heightPx: 0 };
    const heightPx = globalMediaPlayerState.chromeHeightPx || 76;
    return { top: pos === 'top', bottom: pos === 'bottom', heightPx };
  });
}

function ReadAloudEqualizer(props: { active: boolean }) {
  return (
    <div
      class="flex h-4 items-end gap-0.5"
      aria-hidden="true"
    >
      <span
        class={cn(
          'w-0.5 rounded-full bg-primary/80 transition-all',
          props.active ? 'h-2 animate-pulse' : 'h-1 bg-muted-foreground/40',
        )}
        style={{ 'animation-delay': '0ms' }}
      />
      <span
        class={cn(
          'w-0.5 rounded-full bg-primary/70 transition-all',
          props.active ? 'h-3.5 animate-pulse' : 'h-1.5 bg-muted-foreground/35',
        )}
        style={{ 'animation-delay': '120ms' }}
      />
      <span
        class={cn(
          'w-0.5 rounded-full bg-primary/60 transition-all',
          props.active ? 'h-2.5 animate-pulse' : 'h-1 bg-muted-foreground/30',
        )}
        style={{ 'animation-delay': '240ms' }}
      />
    </div>
  );
}

function GlobalMediaPlayerAudioControls() {
  const [playing, setPlaying] = createSignal(audioShellIsPlaying());
  onMount(() => subscribeAudioShellPlaying(() => setPlaying(audioShellIsPlaying())));

  return (
    <div class="flex shrink-0 items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        class="hidden h-8 w-8 sm:inline-flex"
        aria-label="上一首"
        onClick={() => audioShellSkipPrev()}
      >
        <SkipBack class="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="h-9 w-9"
        aria-label={playing() ? '暂停' : '播放'}
        onClick={() => audioShellTogglePlay()}
      >
        <Show when={playing()} fallback={<Play class="size-5" />}>
          <Pause class="size-5" />
        </Show>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="hidden h-8 w-8 sm:inline-flex"
        aria-label="下一首"
        onClick={() => audioShellSkipNext()}
      >
        <SkipForward class="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="h-8 w-8 text-muted-foreground"
        aria-label="停止"
        onClick={() => audioShellStop()}
      >
        <Square class="size-4" />
      </Button>
    </div>
  );
}

function GlobalMediaPlayerReadAloudControls(props: {
  snapshot: ReadAloudSessionSnapshot;
  preview: string;
}) {
  const isPlaying = () => props.snapshot.state === 'playing';

  return (
    <div class="flex shrink-0 items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        class="hidden h-8 w-8 sm:inline-flex"
        aria-label="上一段"
        onClick={() => void prevReadAloudParagraph()}
      >
        <SkipBack class="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="h-9 w-9"
        aria-label={isPlaying() ? '暂停' : '播放'}
        onClick={() => toggleReadAloudSessionPlay()}
      >
        <Show when={isPlaying()} fallback={<Play class="size-5" />}>
          <Pause class="size-5" />
        </Show>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="hidden h-8 w-8 sm:inline-flex"
        aria-label="下一段"
        onClick={() => void nextReadAloudParagraph()}
      >
        <SkipForward class="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="h-8 w-8 text-muted-foreground"
        aria-label="停止"
        onClick={() => {
          stopReadAloudSession();
        }}
      >
        <Square class="size-4" />
      </Button>
    </div>
  );
}

function shellHorizontalInsetClass(
  showTopNav: boolean,
  showBottomBar: boolean,
  position: 'top' | 'bottom',
  shellMainLeftClass?: string,
) {
  const horizontal = cn(shellMainLeftClass ?? 'left-0', 'right-0');
  if (position === 'top') {
    return cn(horizontal, showTopNav ? insetTopAppBar : 'top-0 safe-area-inset-top');
  }
  return cn(horizontal, showBottomBar ? insetBottomAppBar : 'bottom-0 safe-area-inset-bottom');
}

export function GlobalMediaPlayer(props: GlobalMediaPlayerProps) {
  const [snapshot, setSnapshot] = createSignal<ReadAloudSessionSnapshot>(
    getReadAloudSessionSnapshot(),
  );
  const [livePreview, setLivePreview] = createSignal('');
  let chromeMeasureEl: HTMLDivElement | undefined;
  let chromeResizeObserver: ResizeObserver | undefined;

  const measureChromeHeight = () => {
    if (!chromeMeasureEl) return;
    globalMediaPlayerStore.setChromeHeight(chromeMeasureEl.offsetHeight);
  };

  onMount(() => {
    const unsubSession = subscribeReadAloudSession((s) => {
      setSnapshot(s);
      if (s.currentParagraphPreview) setLivePreview(s.currentParagraphPreview);
      const meta = globalMediaPlayerState.meta;
      if (meta && s.currentParagraphPreview) {
        globalMediaPlayerStore.updateMeta({ preview: s.currentParagraphPreview });
      }
    });
    const unsubProgress = subscribeReadAloudProgress((p) => {
      if (p?.paragraphText) setLivePreview(p.paragraphText);
    });
    onCleanup(() => {
      unsubSession();
      unsubProgress();
      chromeResizeObserver?.disconnect();
      globalMediaPlayerStore.setChromeHeight(0);
    });
  });

  createEffect(() => {
    if (globalMediaPlayerState.kind !== 'read-aloud') return;
    if (!globalMediaPlayerState.shellActive) return;
    const snap = snapshot();
    if (snap.state !== 'playing' && snap.state !== 'paused') {
      globalMediaPlayerStore.deactivate();
      void import('@/lib/media/text/read-aloud-background').then((m) => {
        void m.cleanupReadAloudBackgroundBook();
      });
    }
  });

  const layout = () => resolveMediaPlayerChromeLayout();
  const position = () => resolveMediaPlayerChromePosition();

  const sessionActive = () => {
    if (globalMediaPlayerState.kind === 'read-aloud') {
      const st = snapshot().state;
      return st === 'playing' || st === 'paused';
    }
    return !!globalMediaPlayerState.kind;
  };

  const visible = () =>
    globalMediaPlayerState.shellActive &&
    !!globalMediaPlayerState.kind &&
    !props.shellOverlayOpen() &&
    !isMusicHubShellActive(props.currentShellPage()) &&
    sessionActive();

  const meta = () => globalMediaPlayerState.meta;
  const previewText = createMemo(() => {
    const live = livePreview().trim();
    if (live) return live;
    return meta()?.preview?.trim() || snapshot().currentParagraphPreview.trim() || '…';
  });

  const isPlaying = () => snapshot().state === 'playing';
  const canCollapse = () => layout() === 'stacked' || layout() === 'floating';
  const collapsed = () => globalMediaPlayerState.collapsed && canCollapse();

  createEffect(() => {
    if (!visible() || collapsed() || layout() !== 'fixed') {
      globalMediaPlayerStore.setChromeHeight(0);
      return;
    }
    queueMicrotask(() => measureChromeHeight());
  });

  const bindChromeMeasureRef = (el: HTMLDivElement) => {
    chromeMeasureEl = el;
    chromeResizeObserver?.disconnect();
    if (!el || typeof ResizeObserver === 'undefined') {
      measureChromeHeight();
      return;
    }
    chromeResizeObserver = new ResizeObserver(() => measureChromeHeight());
    chromeResizeObserver.observe(el);
    measureChromeHeight();
  };

  const openReader = () => {
    const url = globalMediaPlayerState.bookUrl;
    if (globalMediaPlayerState.kind === 'audio') {
      if (hasAudioShellHandlers()) {
        audioShellOpenViewer();
        return;
      }
      if (url === AUDIO_HUB_BOOK_URL || url === 'shell-music-hub') {
        props.onOpenAudioHub?.();
        return;
      }
    }
    if (url) props.onOpenTextReader?.(url);
  };

  const positionClass = (l: ViewerChromeLayout) => {
    const pos = position();
    const edge = shellHorizontalInsetClass(
      props.showTopNav(),
      props.showBottomBar(),
      pos,
      props.shellMainLeftClass,
    );
    if (l === 'floating') {
      return cn(
        'fixed z-[48] flex justify-center px-3 pointer-events-none',
        edge,
      );
    }
    return cn('fixed z-[48]', edge);
  };

  const surfaceClass = (l: ViewerChromeLayout) => {
    if (l === 'floating') {
      return cn(
        mediaViewerChromeFloatingControlClass,
        mediaViewerChromeHitTargetClass,
        globalMediaPlayerFloatingEdgeClass,
        'w-[min(92vw,28rem)] rounded-2xl px-3 py-2.5 shadow-lg',
      );
    }
    if (l === 'stacked') {
      return cn(
        mediaViewerChromeBottomSurfaceClass,
        'shadow-md',
        position() === 'top' ? 'border-b' : 'border-t',
      );
    }
    return cn(
      'border-border/60 bg-card/95 text-foreground backdrop-blur-md',
      position() === 'top' ? 'border-b' : 'border-t',
    );
  };

  const CollapseToggle = () => (
    <Button
      variant="ghost"
      size="icon"
      class="h-8 w-8 shrink-0 text-muted-foreground"
      aria-label="收起播放器"
      onClick={() => globalMediaPlayerStore.toggleCollapsed()}
    >
      <ChevronRight class="size-4" />
    </Button>
  );

  return (
    <Show when={visible()}>
      <Show
        when={!collapsed()}
        fallback={
          <div
            class={cn(
              mediaViewerChromeFloatingControlClass,
              mediaViewerChromeHitTargetClass,
              'fixed z-48 right-0 flex flex-col items-center gap-2 rounded-l-2xl border-r-0 px-2 py-3 shadow-lg',
              position() === 'bottom'
                ? props.showBottomBar()
                  ? insetBottomAppBar
                  : 'bottom-20 safe-area-inset-bottom'
                : props.showTopNav()
                  ? insetTopAppBar
                  : 'top-20 safe-area-inset-top',
            )}
            role="region"
            aria-label="媒体播放控制（已收起）"
          >
            <Button
              variant="ghost"
              size="icon"
              class="h-9 w-9"
              aria-label={isPlaying() ? '暂停' : '播放'}
              onClick={() => toggleReadAloudSessionPlay()}
            >
              <Show when={isPlaying()} fallback={<Play class="size-4" />}>
                <Pause class="size-4" />
              </Show>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8 text-muted-foreground"
              aria-label="展开播放器"
              onClick={() => globalMediaPlayerStore.setCollapsed(false)}
            >
              <ChevronLeft class="size-4" />
            </Button>
          </div>
        }
      >
        <div class={positionClass(layout())} role="region" aria-label="媒体播放控制">
          <div
            ref={layout() === 'fixed' ? bindChromeMeasureRef : undefined}
            class={cn(
              surfaceClass(layout()),
              layout() === 'fixed' && 'px-4 py-2.5',
              layout() === 'stacked' && 'px-4 py-2.5',
            )}
          >
            <div class="flex min-w-0 items-center gap-3">
              <button
                type="button"
                class="group shrink-0 transition hover:opacity-90"
                onClick={openReader}
                aria-label="返回阅读器"
              >
                <div class={cn(bookGroupGridCoverClass('w-10 shadow-sm ring-1 ring-border/50'), 'shrink-0')}>
                  <div class={bookGroupGridCoverZoomClass()}>
                    <Show
                      when={
                        globalMediaPlayerState.kind === 'audio' && meta()?.coverUrl
                      }
                      fallback={
                        <Show
                          when={meta()?.coverBookUrl}
                          fallback={<BookCoverFallback class="h-6 w-6 text-muted-foreground" />}
                        >
                          <BookCoverFromBook
                            bookUrl={meta()!.coverBookUrl}
                            alt=""
                            class="h-full w-full object-cover"
                            draggable={false}
                            fallback={<BookCoverFallback class="h-6 w-6 text-muted-foreground" />}
                          />
                        </Show>
                      }
                    >
                      <img
                        src={meta()!.coverUrl}
                        alt=""
                        class="h-full w-full object-cover"
                        draggable={false}
                      />
                    </Show>
                  </div>
                </div>
              </button>

              <button
                type="button"
                class="min-w-0 flex-1 text-left"
                onClick={openReader}
              >
                <div class="flex items-center gap-2">
                  <p class="truncate text-sm font-medium text-foreground">
                    {meta()?.title || '播放中'}
                  </p>
                  <ReadAloudEqualizer active={isPlaying()} />
                </div>
                <Show when={meta()?.subtitle}>
                  <p class="truncate text-xs text-muted-foreground">{meta()?.subtitle}</p>
                </Show>
                <p class="mt-0.5 line-clamp-1 text-xs text-muted-foreground/90">{previewText()}</p>
              </button>

              <Show when={globalMediaPlayerState.kind === 'read-aloud'}>
                <GlobalMediaPlayerReadAloudControls
                  snapshot={snapshot()}
                  preview={previewText()}
                />
              </Show>

              <Show when={globalMediaPlayerState.kind === 'audio' && hasAudioShellHandlers()}>
                <GlobalMediaPlayerAudioControls />
              </Show>

              <Show when={canCollapse()}>
                <CollapseToggle />
              </Show>
            </div>

            <Show when={globalMediaPlayerState.kind === 'read-aloud'}>
              <div class="mt-2 hidden items-center justify-center gap-1 border-t border-border/40 pt-2 sm:flex">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 px-2 text-xs"
                  onClick={() => void prevReadAloudChapter()}
                >
                  上一章
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 px-2 text-xs"
                  onClick={() => void nextReadAloudChapter()}
                >
                  下一章
                </Button>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </Show>
  );
}
