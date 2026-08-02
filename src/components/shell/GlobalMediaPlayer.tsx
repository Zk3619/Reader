/**
 * 全局壳层媒体播放器（朗读 / 音频 / 视频共用）
 * 后台朗读退出阅读器后，在主界面顶/底展示控制条；悬浮模式可拖拽并贴边收起。
 */

import {
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type Accessor,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
  X,
} from 'lucide-solid';
import { BookCoverFallback } from '@/components/media/reader/books/BookCoverFallback';
import { BookCoverFromBook } from '@/components/media/reader/books/BookCoverFromBook';
import { MusicCoverImg } from '@/components/media/viewer/audio/music/MusicCoverImg';
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
} from '@/components/media/viewer/viewer-chrome';
import { GlobalMediaPlayerFloatShell } from '@/components/shell/GlobalMediaPlayerFloatShell';
import { cn } from '@/lib/utils';
import { insetBottomAppBar, insetTopAppBar } from '@/lib/ui/viewport-classes';
import {
  defaultMediaPlayerChromeLayout,
  resolveMediaPlayerChromeLayout,
  resolveMediaPlayerChromePosition,
  normalizeMediaPlayerChromePosition,
  globalMediaPlayerOverReaderBottomClass,
  globalMediaPlayerOverReaderTopClass,
  mediaPlayerCollapseMotionClass,
  mediaPlayerExpandMotionClass,
} from '@/lib/viewer/media-player-chrome-layout';
import { normalizeViewerChromeLayout } from '@/lib/viewer/viewer-chrome-layout';
import {
  clampGmpFloatPos,
  nearestGmpFloatEdge,
  normalizeMediaPlayerFloat,
  nudgeGmpFloatOffEdge,
  snapGmpFloatToEdge,
  type GmpFloatEdge,
} from '@/lib/viewer/global-media-player-float-pos';
import { getGmpFloatLive, getGmpFloatLastDock, setGmpFloatLive } from '@/lib/viewer/gmp-float-live';
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
import { isAudioHubBookUrl } from '@/lib/media/content-session';
import { isMusicHubShellActive } from '@/stores/shell-tabs';
import {
  APP_GLOBAL_MEDIA_PLAYER_OVER_VIEWER_Z,
} from '@/lib/ui/overlay-z';
import type { OverlayPageKind } from '@/lib/navigation/overlay-stack';
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
import {
  isMusicGlobalMediaPlayerEnabled,
  subscribeMusicSettings,
} from '@/lib/media/audio/music-settings';
import { settingsState, settingsStore } from '@/stores/settings';


/** 音乐/有声书后台条可叠在其上的阅读器（听书/视频/文件自带播放 UI，不叠） */
const OVERLAY_KINDS_ALLOW_AUDIO_PLAYER = new Set<OverlayPageKind>([
  'text-viewer',
  'image-viewer',
]);

function isMusicHubGlobalPlayerSession(): boolean {
  return (
    globalMediaPlayerState.kind === 'audio' &&
    isAudioHubBookUrl(globalMediaPlayerState.bookUrl)
  );
}
export interface GlobalMediaPlayerProps {
  /** 独立页（阅读器等）打开时；文本/漫画上仍可显示音频后台条 */
  shellOverlayOpen: Accessor<boolean>;
  /** 当前导航栈顶叠层 kind（用于判断是否叠在文本/漫画之上） */
  overlayTopKind?: Accessor<OverlayPageKind | undefined>;
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
  overlayTopKind?: Accessor<OverlayPageKind | undefined>;
  currentShellPage: Accessor<string>;
  showTopNav: Accessor<boolean>;
  showBottomBar: Accessor<boolean>;
}): Accessor<{ top: boolean; bottom: boolean; heightPx: number }> {
  return createMemo(() => {
    // 叠在阅读器上或主壳隐藏时，无需给主内容让位
    if (props.shellOverlayOpen()) return { top: false, bottom: false, heightPx: 0 };
    if (isMusicHubShellActive(props.currentShellPage())) {
      return { top: false, bottom: false, heightPx: 0 };
    }
    if (!globalMediaPlayerState.shellActive || !globalMediaPlayerState.kind) {
      return { top: false, bottom: false, heightPx: 0 };
    }
    if (isMusicHubGlobalPlayerSession() && !isMusicGlobalMediaPlayerEnabled()) {
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

function GlobalMediaPlayerAudioControls(props: {
  canCollapse: boolean;
  onCollapse?: () => void;
  /** 收起方向（悬浮随贴边变化） */
  collapseEdge?: () => Exclude<GmpFloatEdge, 'none'>;
}) {
  const [playing, setPlaying] = createSignal(audioShellIsPlaying());
  onMount(() => subscribeAudioShellPlaying(() => setPlaying(audioShellIsPlaying())));

  const chromeBtnClass = 'h-8 w-8 shrink-0 text-muted-foreground';
  const collapseIcon = () => {
    const edge = props.collapseEdge?.() ?? 'right';
    if (edge === 'left') return <ChevronLeft class="size-4" />;
    if (edge === 'top') return <ChevronUp class="size-4" />;
    if (edge === 'bottom') return <ChevronDown class="size-4" />;
    return <ChevronRight class="size-4" />;
  };

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
        class={chromeBtnClass}
        aria-label="关闭"
        title="关闭"
        onClick={() => audioShellStop()}
      >
        <X class="size-4" />
      </Button>
      <Show when={props.canCollapse}>
        <Button
          variant="ghost"
          size="icon"
          class={chromeBtnClass}
          aria-label="收起播放器"
          title="收起播放器"
          onClick={() => (props.onCollapse ? props.onCollapse() : globalMediaPlayerStore.toggleCollapsed())}
        >
          {collapseIcon()}
        </Button>
      </Show>
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
        class="h-8 w-8"
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
  const [musicGlobalPlayerEnabled, setMusicGlobalPlayerEnabled] = createSignal(
    isMusicGlobalMediaPlayerEnabled(),
  );
  let chromeMeasureEl: HTMLDivElement | undefined;
  let chromeResizeObserver: ResizeObserver | undefined;

  const measureChromeHeight = () => {
    if (!chromeMeasureEl) return;
    globalMediaPlayerStore.setChromeHeight(chromeMeasureEl.offsetHeight);
  };

  onMount(() => {
    // 启动时若停在收起态，直接展开，避免侧条难找被当成丢失
    if (globalMediaPlayerState.collapsed) {
      globalMediaPlayerStore.setCollapsed(false);
    }
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
    const unsubMusicSettings = subscribeMusicSettings(() => {
      const enabled = isMusicGlobalMediaPlayerEnabled();
      setMusicGlobalPlayerEnabled(enabled);
      if (!enabled && isMusicHubGlobalPlayerSession()) {
        globalMediaPlayerStore.clearShell();
      }
    });
    onCleanup(() => {
      unsubSession();
      unsubProgress();
      unsubMusicSettings();
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

  const layout = createMemo(() =>
    normalizeViewerChromeLayout(
      settingsState.app.mediaPlayerChromeLayout ?? defaultMediaPlayerChromeLayout,
    ),
  );
  const position = createMemo(() =>
    normalizeMediaPlayerChromePosition(settingsState.app.mediaPlayerChromePosition),
  );

  const sessionActive = () => {
    if (globalMediaPlayerState.kind === 'read-aloud') {
      const st = snapshot().state;
      return st === 'playing' || st === 'paused';
    }
    return !!globalMediaPlayerState.kind;
  };

  /** 音乐/有声书后台：允许叠在文本/漫画阅读器上 */
  const allowOverTextOrImageReader = () => {
    if (globalMediaPlayerState.kind !== 'audio') return false;
    const topKind = props.overlayTopKind?.();
    return !!topKind && OVERLAY_KINDS_ALLOW_AUDIO_PLAYER.has(topKind);
  };

  const hideForStandaloneOverlay = () => {
    if (!props.shellOverlayOpen()) return false;
    return !allowOverTextOrImageReader();
  };

  const visible = () =>
    globalMediaPlayerState.shellActive &&
    !!globalMediaPlayerState.kind &&
    !hideForStandaloneOverlay() &&
    !isMusicHubShellActive(props.currentShellPage()) &&
    !(isMusicHubGlobalPlayerSession() && !musicGlobalPlayerEnabled()) &&
    sessionActive();

  const overReader = () => props.shellOverlayOpen() && allowOverTextOrImageReader();

  /** 叠在阅读器上强制悬浮，避免与固定/层叠阅读器栏抢同一贴边 */
  const effectiveLayout = (): ViewerChromeLayout =>
    overReader() ? 'floating' : layout();

  const meta = () => globalMediaPlayerState.meta;
  const previewText = createMemo(() => {
    const live = livePreview().trim();
    if (live) return live;
    return meta()?.preview?.trim() || snapshot().currentParagraphPreview.trim() || '…';
  });

  const [audioPlaying, setAudioPlaying] = createSignal(audioShellIsPlaying());
  onMount(() => {
    const unsub = subscribeAudioShellPlaying(() => setAudioPlaying(audioShellIsPlaying()));
    onCleanup(unsub);
  });

  const isPlaying = () =>
    globalMediaPlayerState.kind === 'audio'
      ? audioPlaying()
      : snapshot().state === 'playing';

  const canCollapse = () =>
    overReader() || effectiveLayout() === 'stacked' || effectiveLayout() === 'floating';
  const collapsed = () => globalMediaPlayerState.collapsed && canCollapse();

  /** 展开动画 transform-origin：记住上次收起边（展开时 live.edge 已清 none） */
  const [expandFromEdge, setExpandFromEdge] =
    createSignal<Exclude<GmpFloatEdge, 'none'>>('right');

  /** 高于顶/底栏 z-50；低于抽屉 z-85；Portal 挂到 body 避免壳层 overflow 裁切 */
  const playerZClass = () =>
    overReader() ? APP_GLOBAL_MEDIA_PLAYER_OVER_VIEWER_Z : 'z-[80]';

  /** 悬浮收起侧：live.edge 优先；勿用 stored.edge 在展开态误判已贴边 */
  const collapseDockEdge = (): Exclude<GmpFloatEdge, 'none'> => {
    if (effectiveLayout() !== 'floating' && !overReader()) {
      return 'right';
    }
    const dock = getGmpFloatLive();
    if (dock?.edge && dock.edge !== 'none') return dock.edge;
    const stored = normalizeMediaPlayerFloat(settingsState.app.mediaPlayerFloat);
    // 仅收起态可读 stored.edge；展开态按当前位置取最近边（决定收起按钮方向）
    if (collapsed() && stored?.edge && stored.edge !== 'none') return stored.edge;
    const pos = dock?.pos ?? (stored ? { left: stored.left, top: stored.top } : null);
    const w = dock?.width ?? 320;
    const h = dock?.height ?? 72;
    if (pos) return nearestGmpFloatEdge(pos.left, pos.top, w, h);
    return 'right';
  };

  const collapseDockStyle = (): Record<string, string> | undefined => {
    if (effectiveLayout() !== 'floating' && !overReader()) return undefined;
    const edge = collapseDockEdge();
    const dock = getGmpFloatLive() ?? getGmpFloatLastDock();
    const stored = normalizeMediaPlayerFloat(settingsState.app.mediaPlayerFloat);
    const base = dock?.pos ?? (stored ? { left: stored.left, top: stored.top } : null);
    const chipW = 56;
    const chipH = 96;

    if (edge === 'left' || edge === 'right') {
      if (!base) return { top: '50%', transform: 'translateY(-50%)', bottom: 'auto' };
      const top = clampGmpFloatPos(base.left, base.top, chipW, chipH).top;
      return { top: `${Math.round(top)}px`, bottom: 'auto', transform: 'none' };
    }

    if (!base) return { left: '50%', transform: 'translateX(-50%)' };
    const left = clampGmpFloatPos(base.left, base.top, chipW, chipH).left;
    return { left: `${Math.round(left)}px`, right: 'auto', transform: 'none' };
  };

  /** 收起：悬浮时先写入贴边侧再 collapsed（贴边松手共用） */
  const requestCollapse = (forcedEdge?: Exclude<GmpFloatEdge, 'none'>) => {
    if (effectiveLayout() === 'floating' || overReader()) {
      const dock = getGmpFloatLive() ?? getGmpFloatLastDock();
      const stored = normalizeMediaPlayerFloat(settingsState.app.mediaPlayerFloat);
      const cur =
        dock?.pos ?? (stored ? { left: stored.left, top: stored.top } : null);
      const w = dock?.width ?? 320;
      const h = dock?.height ?? 72;
      if (cur) {
        const edge =
          forcedEdge ??
          (dock?.edge && dock.edge !== 'none'
            ? dock.edge
            : nearestGmpFloatEdge(cur.left, cur.top, w, h));
        setExpandFromEdge(edge);
        const snapped = snapGmpFloatToEdge(cur, edge, w, h);
        setGmpFloatLive({ pos: snapped, edge, width: w, height: h });
        void settingsStore.setMediaPlayerFloat({
          left: snapped.left,
          top: snapped.top,
          edge,
        });
      } else if (forcedEdge) {
        setExpandFromEdge(forcedEdge);
      }
    } else {
      setExpandFromEdge('right');
    }
    globalMediaPlayerStore.setCollapsed(true);
  };

  /** 展开：推离贴边位并清 edge，避免再次落到自动收起区 */
  const requestExpand = () => {
    const dock = getGmpFloatLive() ?? getGmpFloatLastDock();
    const stored = normalizeMediaPlayerFloat(settingsState.app.mediaPlayerFloat);
    const cur = dock?.pos ?? (stored ? { left: stored.left, top: stored.top } : null);
    const w = dock?.width ?? 320;
    const h = dock?.height ?? 72;
    if (cur) {
      const nudged = nudgeGmpFloatOffEdge(cur, w, h);
      setGmpFloatLive({ pos: nudged, edge: 'none', width: w, height: h });
      void settingsStore.setMediaPlayerFloat({
        left: nudged.left,
        top: nudged.top,
        edge: 'none',
      });
    }
    globalMediaPlayerStore.setCollapsed(false);
  };

  // 布局变更时展开
  let prevChromeLayoutKey = '';
  createEffect(() => {
    const key = `${layout()}:${position()}`;
    if (prevChromeLayoutKey && prevChromeLayoutKey !== key && globalMediaPlayerState.collapsed) {
      globalMediaPlayerStore.setCollapsed(false);
    }
    prevChromeLayoutKey = key;
  });

  createEffect(() => {
    if (!visible() || collapsed() || effectiveLayout() !== 'fixed') {
      if (globalMediaPlayerState.chromeHeightPx !== 0) {
        globalMediaPlayerStore.setChromeHeight(0);
      }
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
      if (isAudioHubBookUrl(url)) {
        props.onOpenAudioHub?.();
        return;
      }
    }
    if (url) props.onOpenTextReader?.(url);
  };

  const togglePlay = () => {
    if (globalMediaPlayerState.kind === 'audio') {
      audioShellTogglePlay();
      return;
    }
    void toggleReadAloudSessionPlay();
  };

  const positionClass = (_l: ViewerChromeLayout) => {
    const pos = position();
    const edge = shellHorizontalInsetClass(
      props.showTopNav(),
      props.showBottomBar(),
      pos,
      props.shellMainLeftClass,
    );
    return cn('fixed', playerZClass(), edge);
  };

  const surfaceClass = (l: ViewerChromeLayout) => {
    if (l === 'floating') {
      return cn(
        mediaViewerChromeFloatingControlClass,
        mediaViewerChromeHitTargetClass,
        'w-[min(92vw,28rem)] rounded-2xl p-2.5 shadow-lg',
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

  const reduceMotion = () => !!settingsState.app.reduceMotion;

  const expandedMotionClass = () =>
    mediaPlayerExpandMotionClass({
      reduceMotion: reduceMotion(),
      layout: effectiveLayout(),
      position: position(),
      floatEdge:
        effectiveLayout() === 'floating' || overReader()
          ? expandFromEdge()
          : undefined,
    });

  const collapsedMotionClass = () =>
    mediaPlayerCollapseMotionClass({
      reduceMotion: reduceMotion(),
      edge:
        effectiveLayout() === 'floating' || overReader()
          ? collapseDockEdge()
          : 'right',
    });

  const collapseActionIcon = () => {
    const edge = collapseDockEdge();
    if (edge === 'left') return <ChevronLeft class="size-4" />;
    if (edge === 'top') return <ChevronUp class="size-4" />;
    if (edge === 'bottom') return <ChevronDown class="size-4" />;
    return <ChevronRight class="size-4" />;
  };

  /** 层叠/非悬浮收起：右侧 + 顶/底设置；悬浮：按贴边侧 */
  const collapsedChromeClass = () => {
    const edge = collapseDockEdge();
    const base = cn(
      mediaViewerChromeFloatingControlClass,
      mediaViewerChromeHitTargetClass,
      'fixed flex items-center gap-2 shadow-lg',
      playerZClass(),
    );

    if (effectiveLayout() === 'floating' || overReader()) {
      if (edge === 'left') {
        return cn(base, 'left-0 flex-col rounded-r-2xl border-l-0 px-2 py-3');
      }
      if (edge === 'top') {
        return cn(
          base,
          'flex-row rounded-b-2xl border-t-0 px-3 py-2',
          overReader()
            ? globalMediaPlayerOverReaderTopClass
            : props.showTopNav()
              ? insetTopAppBar
              : 'top-0 safe-area-inset-top',
        );
      }
      if (edge === 'bottom') {
        return cn(
          base,
          'flex-row rounded-t-2xl border-b-0 px-3 py-2',
          overReader()
            ? globalMediaPlayerOverReaderBottomClass
            : props.showBottomBar()
              ? insetBottomAppBar
              : 'bottom-0 safe-area-inset-bottom',
        );
      }
      // right
      return cn(base, 'right-0 flex-col rounded-l-2xl border-r-0 px-2 py-3');
    }

    // 层叠：右侧，顶/底随位置设置
    return cn(
      base,
      'right-0 flex-col rounded-l-2xl border-r-0 px-2 py-3',
      position() === 'bottom'
        ? props.showBottomBar()
          ? insetBottomAppBar
          : 'bottom-20 safe-area-inset-bottom'
        : props.showTopNav()
          ? insetTopAppBar
          : 'top-20 safe-area-inset-top',
    );
  };

  const collapsedExpandIcon = () => {
    const edge = collapseDockEdge();
    if (edge === 'left') return <ChevronRight class="size-4" />;
    if (edge === 'top') return <ChevronDown class="size-4" />;
    if (edge === 'bottom') return <ChevronUp class="size-4" />;
    return <ChevronLeft class="size-4" />;
  };

  const chromeBody = () => (
    <>
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
                when={globalMediaPlayerState.kind === 'audio' && meta()?.coverUrl}
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
                <MusicCoverImg
                  src={meta()!.coverUrl}
                  alt=""
                  class="h-full w-full object-cover"
                  draggable={false}
                  fallback={<BookCoverFallback class="h-6 w-6 text-muted-foreground" />}
                />
              </Show>
            </div>
          </div>
        </button>

        <button type="button" class="min-w-0 flex-1 text-left" onClick={openReader}>
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
          <div data-no-drag>
            <GlobalMediaPlayerReadAloudControls
              snapshot={snapshot()}
              preview={previewText()}
            />
          </div>
        </Show>

        <Show when={globalMediaPlayerState.kind === 'audio' && hasAudioShellHandlers()}>
          <div data-no-drag>
            <GlobalMediaPlayerAudioControls
              canCollapse={canCollapse()}
              onCollapse={() => requestCollapse()}
              collapseEdge={collapseDockEdge}
            />
          </div>
        </Show>

        <Show
          when={
            canCollapse() &&
            !(globalMediaPlayerState.kind === 'audio' && hasAudioShellHandlers())
          }
        >
          <div data-no-drag>
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8 shrink-0 text-muted-foreground"
              aria-label="收起播放器"
              onClick={() => requestCollapse()}
            >
              {collapseActionIcon()}
            </Button>
          </div>
        </Show>
      </div>

      <Show when={globalMediaPlayerState.kind === 'read-aloud'}>
        <div
          class="mt-2 hidden items-center justify-center gap-1 border-t border-border/40 pt-2 sm:flex"
          data-no-drag
        >
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
    </>
  );

  return (
    <Show when={visible()}>
      <Portal>
        <Switch>
          <Match when={collapsed()}>
            <Show when={`c:${globalMediaPlayerState.collapseAnimEpoch}`} keyed>
              <div
                class={cn(collapsedChromeClass(), collapsedMotionClass())}
                style={collapseDockStyle()}
                role="region"
                aria-label="媒体播放控制（已收起）"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-9 w-9"
                  aria-label={isPlaying() ? '暂停' : '播放'}
                  onClick={() => togglePlay()}
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
                  onClick={() => requestExpand()}
                >
                  {collapsedExpandIcon()}
                </Button>
              </div>
            </Show>
          </Match>
          <Match when={effectiveLayout() === 'floating'}>
            <GlobalMediaPlayerFloatShell
              zClass={playerZClass()}
              onEdgeCollapse={(edge) => requestCollapse(edge)}
            >
              <Show when={`e:${globalMediaPlayerState.expandAnimEpoch}`} keyed>
                <div class={cn(surfaceClass('floating'), expandedMotionClass())}>
                  {chromeBody()}
                </div>
              </Show>
            </GlobalMediaPlayerFloatShell>
          </Match>
          <Match when={effectiveLayout() === 'fixed'}>
            <div class={positionClass('fixed')} role="region" aria-label="媒体播放控制">
              <Show when={`e:${globalMediaPlayerState.expandAnimEpoch}`} keyed>
                <div
                  ref={bindChromeMeasureRef}
                  class={cn(surfaceClass('fixed'), 'px-4 py-2.5', expandedMotionClass())}
                >
                  {chromeBody()}
                </div>
              </Show>
            </div>
          </Match>
          <Match when={effectiveLayout() === 'stacked'}>
            <div class={positionClass('stacked')} role="region" aria-label="媒体播放控制">
              <Show when={`e:${globalMediaPlayerState.expandAnimEpoch}`} keyed>
                <div
                  class={cn(surfaceClass('stacked'), 'px-4 py-2.5', expandedMotionClass())}
                >
                  {chromeBody()}
                </div>
              </Show>
            </div>
          </Match>
        </Switch>
      </Portal>
    </Show>
  );
}
