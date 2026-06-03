/**
 * 视频阅读
 * 对齐 Legado VideoPlayerActivity / VideoPlay
 */

import { createSignal, createEffect, createMemo, Show, on, type Accessor } from 'solid-js';
import { Gauge } from 'lucide-solid';
import { viewerStore } from '@/stores/viewer';
import { setState } from '@/stores/viewer/media/state';
import {
  MediaViewerShell,
  MediaViewerShellMain,
  MediaViewerHeader,
  MediaViewerFooter,
} from '@/components/viewer/MediaViewerShell';
import { useMediaViewerShell } from '@/components/viewer/media-viewer-shell-context';
import { MediaViewerChromeSlots } from '@/components/viewer/MediaViewerChromeSlots';
import { useMediaViewerMainStageClass } from '@/lib/viewer/viewer-chrome-layout';
import { cn } from '@/lib/utils';
import { MediaViewerCatalog } from '@/components/viewer/MediaViewerCatalog';
import { MediaViewerToolbarHeader } from '@/components/viewer/MediaViewerToolbarHeader';
import { MediaViewerChapterNavFooter } from '@/components/viewer/MediaViewerChapterNavFooter';
import { VideoSettingsDialog } from '@/components/viewer/video/VideoSettingsDialog';
import {
  AppDrawer,
  AppDrawerBody,
  AppDrawerClose,
  AppDrawerContent,
  AppDrawerHeader,
} from '@/components/shared/AppDrawer';
import {
  AppDialog,
  AppDialogContent,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';
import { showAppToast } from '@/components/shared/AppToasts';
import { findPlayableChapterIndex } from '@/lib/media/audio/play-mode';
import { clampPlaySpeed } from '@/lib/media/audio/book-audio-config';
import { MAX_PLAY_SPEED, MIN_PLAY_SPEED } from '@/lib/media/audio/types';
import {
  getVideoPlayConfig,
  persistVideoPlaySpeed,
} from '@/lib/media/video/book-video-config';
import { parseVideoPlaybackExtrasFromRaw } from '@/lib/media/video/artplayer/parse-playback-extras';
import { useArtplayer } from '@/lib/media/video/artplayer/use-artplayer';
import { useVideoFullscreen } from '@/lib/media/video/use-video-fullscreen';
import { ArtPlayerStage } from '@/components/viewer/video/ArtPlayerStage';

export interface VideoViewerPageProps {
  onClose: () => void;
  entryVisible?: Accessor<boolean>;
}

/** 视频舞台：单击播放/暂停（不冒泡到主区），双击切换顶底栏 */
function VideoArtPlayerStage(props: {
  player: ReturnType<typeof useArtplayer>;
  loading: () => boolean;
  error: () => string | null;
  hasSrc: () => boolean;
  onRetry: () => void;
  class?: string;
}) {
  const shell = useMediaViewerShell();

  return (
    <ArtPlayerStage
      containerRef={props.player.containerRef}
      loading={props.loading}
      error={props.error}
      hasSrc={props.hasSrc}
      overlayTip={props.player.overlayTip}
      onRetry={props.onRetry}
      onPointerDown={props.player.handlePointerDown}
      onPointerUp={props.player.handlePointerUp}
      onPointerCancel={props.player.handlePointerCancel}
      class={props.class}
      onClick={(e) => {
        e.stopPropagation();
        shell.onContentPrimaryClick?.(e, () => props.player.togglePlay());
      }}
      onDblClick={(e) => {
        e.stopPropagation();
        shell.onContentDblClick?.(e, { forceChrome: true });
      }}
    />
  );
}

export function VideoViewerPage(props: VideoViewerPageProps) {
  const [catalogOpen, setCatalogOpen] = createSignal(false);
  const [catalogScrollTop, setCatalogScrollTop] = createSignal(0);
  const [speedDialogOpen, setSpeedDialogOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [speedDraft, setSpeedDraft] = createSignal(1);
  const [appConfigVersion, setAppConfigVersion] = createSignal(0);

  let videoStageEl: HTMLDivElement | undefined;
  let startFullDone = false;
  const mainStageClass = useMediaViewerMainStageClass();

  const book = () => viewerStore.state.book;
  const catalog = () => viewerStore.state.catalog;
  const chapterIndex = () => viewerStore.state.chapterIndex;
  const url = () => viewerStore.state.primaryUrl;
  const rawContent = () => viewerStore.state.rawContent;
  const loading = () => viewerStore.state.loading;
  const bootstrapping = () => viewerStore.isMediaViewerBootstrapping();
  const stageLoading = () => bootstrapping() || loading();
  const error = () => viewerStore.state.error;

  const playbackExtras = createMemo(() => parseVideoPlaybackExtrasFromRaw(rawContent()));

  const videoConfig = createMemo(() => {
    appConfigVersion();
    return getVideoPlayConfig(book());
  });

  const chapterTitle = () => catalog()[chapterIndex()]?.title ?? '';

  const fullscreen = useVideoFullscreen(() => videoStageEl);

  const goChapterTo = async (index: number) => {
    if (index < 0 || index >= catalog().length) return;
    viewerStore.setChapterPos(0);
    await viewerStore.loadChapter(index);
  };

  const handleEndedChapter = async () => {
    const playable = findPlayableChapterIndex(catalog(), chapterIndex() + 1, 1);
    if (playable == null) return;
    await goChapterTo(playable);
  };

  const player = useArtplayer({
    src: url,
    chapterIndex,
    chapterPos: () => viewerStore.state.chapterPos,
    playSpeed: () => videoConfig().playSpeed,
    longPressSpeed: () => videoConfig().longPressSpeed,
    extras: playbackExtras,
    onChapterPosChange: (pos) => viewerStore.setChapterPos(pos),
    onEndedChapter: handleEndedChapter,
    onSaveProgress: () => void viewerStore.saveProgress(),
    autoPlay: () => videoConfig().autoPlay,
    onLongPressOverlay: () => undefined,
  });

  createEffect(
    on(
      () => [url(), loading(), videoConfig().startFull, videoConfig().autoPlay] as const,
      ([src, isLoading, startFull, autoPlay]) => {
        if (!src || isLoading || !startFull || !autoPlay || startFullDone) return;
        startFullDone = true;
        void fullscreen.enterFullscreen();
      },
    ),
  );

  const goChapterDelta = async (delta: number) => {
    const cur = chapterIndex();
    const target =
      delta < 0
        ? findPlayableChapterIndex(catalog(), cur - 1, -1)
        : findPlayableChapterIndex(catalog(), cur + 1, 1);
    if (target == null) {
      if (delta > 0) {
        showAppToast({ title: '已播放完', description: '没有更多可播放章节' });
      } else {
        showAppToast({ title: '已到开头', description: '没有更早的可播放章节' });
      }
      return;
    }
    await goChapterTo(target);
  };

  const playableCatalogLength = () =>
    catalog().filter((ch) => !ch.isVolume).length;

  const patchPlaySpeed = async (speed: number) => {
    const b = book();
    if (!b) return;
    const updated = await persistVideoPlaySpeed(b, speed);
    setState({ book: updated });
    player.setPlaybackRate(speed);
  };

  const speedLabel = () => {
    const s = videoConfig().playSpeed;
    return s === 1 ? undefined : `${s.toFixed(1)}x`;
  };

  return (
    <>
      <MediaViewerShell entryVisible={props.entryVisible}>
        <MediaViewerShellMain>
          <MediaViewerChromeSlots
            header={
              <MediaViewerHeader visible={fullscreen.isFullscreen() ? false : undefined}>
                <MediaViewerToolbarHeader
                  title={book()?.name ?? ''}
                  subtitle={chapterTitle()}
                  onClose={props.onClose}
                  onOpenCatalog={() => setCatalogOpen(true)}
                  onOpenSpeed={() => {
                    setSpeedDraft(videoConfig().playSpeed);
                    setSpeedDialogOpen(true);
                  }}
                  onToggleFullscreen={() => void fullscreen.toggleFullscreen()}
                  isFullscreen={fullscreen.isFullscreen()}
                  onOpenVideoSettings={() => setSettingsOpen(true)}
                  playbackSpeedLabel={speedLabel()}
                  onRefresh={() => {
                    if (!viewerStore.isOpen()) {
                      showAppToast({
                        title: '未打开书籍',
                        description: '请从书架重新打开本书',
                      });
                      return;
                    }
                    void viewerStore.refreshChapter();
                  }}
                  loading={loading()}
                />
              </MediaViewerHeader>
            }
            footer={
              <MediaViewerFooter visible={fullscreen.isFullscreen() ? false : undefined}>
                <MediaViewerChapterNavFooter
                  chapterIndex={chapterIndex()}
                  catalogLength={playableCatalogLength()}
                  loading={loading()}
                  onPrev={() => void goChapterDelta(-1)}
                  onNext={() => void goChapterDelta(1)}
                />
              </MediaViewerFooter>
            }
          >
          <div
            ref={videoStageEl}
            class={cn(
              mainStageClass(),
              'flex items-center justify-center bg-black',
              fullscreen.isFullscreen() && 'z-50',
            )}
          >
            <VideoArtPlayerStage
              player={player}
              loading={stageLoading}
              error={error}
              hasSrc={() => Boolean(url())}
              onRetry={() => void viewerStore.refreshChapter()}
              class="absolute inset-0"
            />
          </div>

          <Show when={fullscreen.isFullscreen()}>
            <div class="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end gap-1 p-2">
              <Button
                variant="ghost"
                size="icon"
                class="pointer-events-auto h-10 w-10 text-white hover:bg-white/20"
                aria-label="播放速度"
                onClick={() => {
                  setSpeedDraft(videoConfig().playSpeed);
                  setSpeedDialogOpen(true);
                }}
              >
                <Gauge class="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="pointer-events-auto h-10 w-10 text-white hover:bg-white/20"
                aria-label="退出全屏"
                onClick={() => void fullscreen.exitFullscreen()}
              >
                退出全屏
              </Button>
            </div>
          </Show>
          </MediaViewerChromeSlots>
        </MediaViewerShellMain>
      </MediaViewerShell>

      <AppDrawer open={catalogOpen()} onOpenChange={setCatalogOpen}>
        <AppDrawerContent class={hDrawerPanel}>
          <AppDrawerHeader>
            <span>目录</span>
            <AppDrawerClose />
          </AppDrawerHeader>
          <AppDrawerBody class="min-h-0 flex-1 overflow-hidden p-0">
            <MediaViewerCatalog
              open={catalogOpen()}
              loading={bootstrapping()}
              initialScrollTop={catalogScrollTop()}
              onScrollTop={setCatalogScrollTop}
              onSelectChapter={(index) => {
                setCatalogOpen(false);
                if (catalog()[index]?.isVolume) return;
                void goChapterTo(index);
              }}
            />
          </AppDrawerBody>
        </AppDrawerContent>
      </AppDrawer>

      <VideoSettingsDialog
        open={settingsOpen()}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setAppConfigVersion((v) => v + 1);
        }}
      />

      <AppDialog open={speedDialogOpen()} onOpenChange={setSpeedDialogOpen}>
        <AppDialogContent layout="app" class="max-w-sm">
          <AppDialogHeader>
            <AppDialogTitle>播放速度</AppDialogTitle>
          </AppDialogHeader>
          <div class="px-4 py-4">
            <div class="mb-2 flex justify-between text-sm">
              <span>速度</span>
              <span class="tabular-nums">{speedDraft().toFixed(1)}x</span>
            </div>
            <Slider
              minValue={MIN_PLAY_SPEED * 100}
              maxValue={MAX_PLAY_SPEED * 100}
              step={5}
              value={[speedDraft() * 100]}
              onChange={(v) => setSpeedDraft(clampPlaySpeed((v[0] ?? 100) / 100))}
            >
              <SliderTrack>
                <SliderFill />
              </SliderTrack>
              <SliderThumb />
            </Slider>
            <div class="mt-3 flex flex-wrap gap-2">
              {[0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3].map((s) => (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSpeedDraft(s)}
                >
                  {s}x
                </Button>
              ))}
            </div>
          </div>
          <div class="px-4 pb-4">
            <Button
              class="w-full"
              onClick={() => {
                const speed = speedDraft();
                void patchPlaySpeed(speed);
                setSpeedDialogOpen(false);
              }}
            >
              确定
            </Button>
          </div>
        </AppDialogContent>
      </AppDialog>
    </>
  );
}
