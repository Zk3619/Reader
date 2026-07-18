/**
 * 音频阅读
 * 对齐 Legado AudioPlayActivity / AudioPlayService
 */

import { createSignal, createMemo, createEffect, Show, onCleanup, onMount, type Accessor } from 'solid-js';
import {
  Ban,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Rewind,
  FastForward,
  ListOrdered,
  Play,
  Pause,
  Timer,
  Gauge,
  Scissors,
} from 'lucide-solid';
import { viewerStore } from '@/stores/viewer';
import { setState } from '@/stores/viewer/media/state';
import {
  MediaViewerShell,
  MediaViewerShellMain,
  MediaViewerHeader,
  MediaViewerFooter,
} from '@/components/viewer/MediaViewerShell';
import { MediaViewerChromeSlots } from '@/components/viewer/MediaViewerChromeSlots';
import { useMediaViewerMainStageClass, mediaViewerMobileContentOverflowClass } from '@/lib/viewer/viewer-chrome-layout';
import { cn } from '@/lib/utils';
import { MediaViewerCatalogDrawer } from '@/components/viewer/MediaViewerCatalogDrawer';
import { MediaViewerToolbarHeader } from '@/components/viewer/MediaViewerToolbarHeader';
import { MediaViewerProgressBottomChrome } from '@/components/viewer/MediaViewerProgressBottomChrome';
import { AudioViewerOfflineCacheDialog } from '@/components/viewer/audio/AudioViewerOfflineCacheDialog';
import { AudioSkipCreditsDialog } from '@/components/viewer/audio/AudioSkipCreditsDialog';
import { getOfflineCacheBlockedReason } from '@/lib/chapter-cache/offline-cache-actions';
import { AudioLyricPanel } from '@/components/viewer/audio/AudioLyricPanel';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/viewer/viewer-app-overlay';
import { Button } from '@/components/ui/button';
import { MultiSwitch, type MultiSwitchOption } from '@/components/ui/multi-switch';
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  getAudioPlayConfig,
  persistAudioPlayConfig,
  playModeLabel,
  clampPlaySpeed,
} from '@/lib/media/audio/book-audio-config';
import { getChapterVariable } from '@/lib/media/audio/chapter-variable';
import {
  findPlayableChapterIndex,
  resolveNextChapterIndex,
  resolvePrevChapterIndex,
} from '@/lib/media/audio/play-mode';
import { useAudioPlayer } from '@/lib/media/audio/use-audio-player';
import { AudioPlayMode, MAX_PLAY_SPEED, MIN_PLAY_SPEED } from '@/lib/media/audio/types';
import { isMusicPlaybackMode } from '@/stores/viewer/media/audio';
import { AudioMusicModeView } from '@/components/viewer/audio/music/AudioMusicModeView';
import {
  registerAudioShellHandlers,
  notifyAudioShellPlayingChanged,
} from '@/lib/media/audio/audio-shell-controls';
import { globalMediaPlayerStore } from '@/stores/global-media-player';
import { syncAndroidMediaSession } from '@/lib/media/audio/platform/android-media-session';
import { playableFromChapter } from '@/lib/media/audio/playable-item';

export interface AudioViewerPageProps {
  onClose: () => void;
  /** 点击顶栏书名时进入书籍信息页 */
  onOpenBookInfo?: () => void;
  entryVisible?: Accessor<boolean>;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** 顺序与 cyclePlayMode 一致，供 MultiSwitch 左键循环 */
const PLAY_MODE_OPTIONS: MultiSwitchOption<AudioPlayMode>[] = [
  { value: AudioPlayMode.listEndStop, label: '顺序播放', icon: ListOrdered },
  { value: AudioPlayMode.singleLoop, label: '单曲循环', icon: Repeat1 },
  { value: AudioPlayMode.random, label: '列表随机', icon: Shuffle },
  { value: AudioPlayMode.listLoop, label: '列表循环', icon: Repeat },
  { value: AudioPlayMode.none, label: '禁止切换', icon: Ban },
];

export function AudioViewerPage(props: AudioViewerPageProps) {
  const isMusicMode = () => isMusicPlaybackMode();

  return (
    <Show when={isMusicMode()} fallback={<AudioAudiobookView {...props} />}>
      <AudioMusicModeView onClose={props.onClose} entryVisible={props.entryVisible} />
    </Show>
  );
}

function AudioAudiobookView(props: AudioViewerPageProps) {
  const [catalogOpen, setCatalogOpen] = createSignal(false);
  const [skipCreditsOpen, setSkipCreditsOpen] = createSignal(false);
  const [speedDialogOpen, setSpeedDialogOpen] = createSignal(false);
  const [timerDialogOpen, setTimerDialogOpen] = createSignal(false);
  const [speedDraft, setSpeedDraft] = createSignal(1);
  const [offlineCacheDialogOpen, setOfflineCacheDialogOpen] = createSignal(false);
  const mainStageClass = useMediaViewerMainStageClass(
    cn(
      'flex flex-col items-center justify-center gap-4 bg-linear-to-b from-background via-background to-muted/40 px-6',
      mediaViewerMobileContentOverflowClass(),
    ),
  );

  const book = () => viewerStore.state.book;
  const catalog = () => viewerStore.state.catalog;
  const catalogSize = () => catalog().length;

  const openOfflineCacheDialog = () => {
    const blocked = getOfflineCacheBlockedReason(
      book(),
      viewerStore.isGuestReading(),
    );
    if (blocked) {
      showAppToast({
        title: '无法离线缓存',
        description: blocked,
        variant: 'default',
      });
      return;
    }
    setOfflineCacheDialogOpen(true);
  };
  const chapterIndex = () => viewerStore.state.chapterIndex;
  const url = () => viewerStore.state.primaryUrl;
  const mediaUrls = () => viewerStore.state.mediaUrls;
  const loading = () => viewerStore.state.loading;
  const bootstrapping = () => viewerStore.isMediaViewerBootstrapping();
  const error = () => viewerStore.state.error;

  const audioConfig = createMemo(() => getAudioPlayConfig(book()));
  const currentChapter = () => catalog()[chapterIndex()];
  const chapterTitle = () => currentChapter()?.title ?? '';
  const lyric = () => getChapterVariable(currentChapter()?.variable, 'lyric');

  const playableItem = createMemo(() => {
    const ch = currentChapter();
    const urls = mediaUrls();
    if (!ch || urls.length === 0) return null;
    return playableFromChapter(ch, urls, lyric() ?? undefined);
  });

  const canPrev = () => {
    const prev = resolvePrevChapterIndex(chapterIndex());
    if (prev == null) return false;
    return findPlayableChapterIndex(catalog(), prev, -1) != null;
  };

  const canNext = () => {
    const next = resolveNextChapterIndex(
      chapterIndex(),
      catalog().length,
      audioConfig().playMode,
    );
    if (next == null) return false;
    return findPlayableChapterIndex(catalog(), next, 1) != null;
  };

  const goChapterTo = async (index: number, resetPos = true) => {
    if (index < 0 || index >= catalog().length) return;
    if (resetPos) viewerStore.setChapterPos(0);
    await viewerStore.loadChapter(index);
  };

  let player!: ReturnType<typeof useAudioPlayer>;

  const handleEndedChapter = async () => {
    const cfg = audioConfig();
    if (cfg.playMode === AudioPlayMode.singleLoop) {
      player.seekTo(cfg.openCredits, true);
      return;
    }
    const next = resolveNextChapterIndex(
      chapterIndex(),
      catalog().length,
      cfg.playMode,
    );
    if (next == null) return;
    const playable = findPlayableChapterIndex(catalog(), next, 1);
    if (playable == null) return;
    await goChapterTo(playable);
  };

  player = useAudioPlayer({
    src: url,
    mediaUrls,
    playableItem,
    chapterIndex,
    catalog,
    chapterPos: () => viewerStore.state.chapterPos,
    book,
    audioConfig,
    loading,
    onChapterPosChange: (pos) => viewerStore.setChapterPos(pos),
    onEndedChapter: handleEndedChapter,
    onSaveProgress: () => viewerStore.saveProgress(),
    onSkipVolumeChapter: (index) => goChapterTo(index),
  });

  onMount(() => {
    const b = book();
    registerAudioShellHandlers({
      togglePlay: () => player.togglePlay(),
      skipPrev: () => void goChapterDelta(-1),
      skipNext: () => void goChapterDelta(1),
      stop: () => props.onClose(),
      openViewer: () => globalMediaPlayerStore.clearShell(),
      isPlaying: () => player.playing(),
    });
    if (b) {
      globalMediaPlayerStore.activate(
        'audio',
        {
          title: chapterTitle() || b.name,
          subtitle: b.name,
          coverBookUrl: b.bookUrl,
        },
        b.bookUrl,
      );
    }
  });

  createEffect(() => {
    notifyAudioShellPlayingChanged();
    const b = book();
    if (!b) return;
    void syncAndroidMediaSession({
      playing: player.playing(),
      title: chapterTitle() || b.name,
      artist: b.author || b.name,
    });
  });

  onCleanup(() => registerAudioShellHandlers(null));

  const goChapterDelta = async (delta: number) => {
    const cur = chapterIndex();
    const target =
      delta < 0
        ? findPlayableChapterIndex(catalog(), cur - 1, -1)
        : findPlayableChapterIndex(catalog(), cur + 1, 1);
    if (target == null) return;
    await goChapterTo(target);
  };

  const patchBookConfig = async (
    patch: Parameters<typeof persistAudioPlayConfig>[1],
  ) => {
    const b = book();
    if (!b) return;
    const updated = await persistAudioPlayConfig(b, patch);
    setState({ book: updated });
  };

  const SEEK_STEP_SEC = 15;

  const catalogProgressValue = () => {
    const total = catalog().length;
    if (total <= 1) return 0;
    return chapterIndex() / (total - 1);
  };

  const handleCatalogProgressChange = (values: number[]) => {
    const total = catalog().length;
    if (total <= 1) return;
    const p = Math.max(0, Math.min(1, values[0] ?? 0));
    const idx = Math.round(p * (total - 1));
    if (idx !== chapterIndex()) void goChapterTo(idx);
  };

  return (
    <>
      <MediaViewerShell themeTarget="viewer.audio" entryVisible={props.entryVisible}>
        <MediaViewerShellMain>
          <MediaViewerChromeSlots
            header={
              <MediaViewerHeader>
                <MediaViewerToolbarHeader
                  title={book()?.name ?? ''}
                  subtitle={chapterTitle()}
                  onClose={props.onClose}
                  onOpenBookInfo={props.onOpenBookInfo}
                  onOpenCatalog={() => setCatalogOpen(true)}
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
                  onOpenOfflineCache={openOfflineCacheDialog}
                  loading={loading()}
                />
              </MediaViewerHeader>
            }
            footer={
              <MediaViewerFooter>
                <MediaViewerProgressBottomChrome
                  chapterIndex={chapterIndex()}
                  catalogLength={catalog().length}
                  loading={loading()}
                  chapterTitle={chapterTitle()}
                  chapterNavAboveStatus
                  statusMeta={
                    <span>
                      {chapterIndex() + 1} / {catalog().length} 章
                    </span>
                  }
                  progressValue={catalogProgressValue()}
                  onProgressChange={handleCatalogProgressChange}
                  showProgressSlider={catalog().length > 1}
                  onPrev={() => void goChapterDelta(-1)}
                  onNext={() => void goChapterDelta(1)}
                />
              </MediaViewerFooter>
            }
          >
          <div class={mainStageClass()}>
            <Show when={book()?.coverUrl || book()?.customCoverUrl}>
              <img
                src={book()?.customCoverUrl || book()?.coverUrl}
                alt=""
                class="h-44 w-32 rounded-lg object-cover shadow-lg ring-1 ring-border/50"
              />
            </Show>

            <p class="max-w-md truncate text-center text-sm text-muted-foreground">
              {chapterTitle()}
            </p>

            <Show when={bootstrapping() || loading()}>
              <p class="text-sm text-muted-foreground">加载中…</p>
            </Show>
            <Show when={!bootstrapping() && !loading() && error()}>
              <div class="text-center">
                <p class="text-sm text-muted-foreground">内容加载失败</p>
                <Button
                  class="mt-3"
                  size="sm"
                  variant="outline"
                  onClick={() => void viewerStore.refreshChapter()}
                >
                  重试
                </Button>
              </div>
            </Show>

            <audio
              ref={player.audioRef}
              class="hidden"
              onError={() => {
                showAppToast({
                  title: '无法播放音频',
                  description:
                    '链接无效、需要登录或格式不受支持。可尝试刷新章节或检查书源 Cookie。',
                });
              }}
            />

            <Show when={!bootstrapping() && !loading() && url()}>
              <div
                class="flex w-full max-w-md flex-col items-center gap-4"
                data-media-viewer-interactive-zone
              >
                <AudioLyricPanel lyric={lyric()} positionSec={player.currentTime()} />
                <div class="flex w-full flex-col gap-1">
                  <div class="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      class="h-9 w-9 shrink-0"
                      aria-label={`快退 ${SEEK_STEP_SEC} 秒`}
                      onClick={() => player.skipBy(-SEEK_STEP_SEC)}
                    >
                      <Rewind size={20} />
                    </Button>
                    <div class="min-w-0 flex-1">
                      <Slider
                        class="w-full"
                        minValue={0}
                        maxValue={Math.max(player.duration(), 1)}
                        step={0.1}
                        value={[player.currentTime()]}
                        onChange={(v) => player.seekTo(v[0] ?? 0, player.playing())}
                      >
                        <SliderTrack>
                          <SliderFill />
                        </SliderTrack>
                        <SliderThumb />
                      </Slider>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      class="h-9 w-9 shrink-0"
                      aria-label={`快进 ${SEEK_STEP_SEC} 秒`}
                      onClick={() => player.skipBy(SEEK_STEP_SEC)}
                    >
                      <FastForward size={20} />
                    </Button>
                  </div>
                  <div class="flex justify-between px-11 text-xs tabular-nums text-muted-foreground">
                    <span>{formatTime(player.currentTime())}</span>
                    <span>{formatTime(player.duration())}</span>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <Show when={player.sleepMinutes() > 0}>
                    <span class="rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums">
                      {player.sleepMinutes()}m
                    </span>
                  </Show>
                  <Show when={audioConfig().playSpeed !== 1}>
                    <span class="rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums">
                      {audioConfig().playSpeed.toFixed(1)}x
                    </span>
                  </Show>
                  <Show when={mediaUrls().length > 1}>
                    <span class="text-xs text-muted-foreground">
                      分段 {player.segmentIndex() + 1}/{mediaUrls().length}
                    </span>
                  </Show>
                </div>

                <div class="flex items-center gap-3">
                  <AppTooltip>
                    <AppTooltipTrigger as="div">
                      <MultiSwitch<AudioPlayMode>
                        options={PLAY_MODE_OPTIONS}
                        value={() => audioConfig().playMode}
                        onChange={(mode) => void patchBookConfig({ playMode: mode })}
                        sizeClass="h-9 w-9"
                      />
                    </AppTooltipTrigger>
                    <AppTooltipContent layer="viewer">
                      {playModeLabel(audioConfig().playMode)}（左键循环切换，右键或长按打开菜单选择）
                    </AppTooltipContent>
                  </AppTooltip>

                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={!canPrev()}
                    onClick={() => void goChapterDelta(-1)}
                    aria-label="上一章"
                  >
                    <SkipBack size={22} />
                  </Button>

                  <Button
                    size="icon"
                    class="h-14 w-14 rounded-full"
                    onClick={() => player.togglePlay()}
                    aria-label={player.playing() ? '暂停' : '播放'}
                  >
                    <Show when={player.playing()} fallback={<Play size={28} />}>
                      <Pause size={28} />
                    </Show>
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={!canNext()}
                    onClick={() => void goChapterDelta(1)}
                    aria-label="下一章"
                  >
                    <SkipForward size={22} />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-9 w-9"
                    aria-label="播放速度"
                    onClick={() => {
                      setSpeedDraft(audioConfig().playSpeed);
                      setSpeedDialogOpen(true);
                    }}
                  >
                    <Gauge size={20} />
                  </Button>
                </div>

                <div class="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTimerDialogOpen(true)}
                  >
                    <Timer size={16} class="mr-1" />
                    定时
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSkipCreditsOpen(true)}
                  >
                    <Scissors size={16} class="mr-1" />
                    片头片尾
                  </Button>
                </div>
              </div>
            </Show>
          </div>
          </MediaViewerChromeSlots>
        </MediaViewerShellMain>
      </MediaViewerShell>

      <MediaViewerCatalogDrawer
        open={catalogOpen()}
        onOpenChange={setCatalogOpen}
        loading={bootstrapping()}
        onSelectChapter={(index) => {
          setCatalogOpen(false);
          void goChapterTo(index);
        }}
      />

      <Show when={book()}>
        {(b) => (
          <AudioSkipCreditsDialog
            open={skipCreditsOpen()}
            onOpenChange={setSkipCreditsOpen}
            book={b()}
            openCredits={audioConfig().openCredits}
            closeCredits={audioConfig().closeCredits}
            onSave={(openCredits, closeCredits) => {
              void patchBookConfig({ openCredits, closeCredits });
            }}
          />
        )}
      </Show>

      <ViewerAppDialog open={speedDialogOpen()} onOpenChange={setSpeedDialogOpen}>
        <ViewerAppDialogContent layout="app" class="max-w-sm">
          <ViewerAppDialogHeader>
            <ViewerAppDialogTitle>播放速度</ViewerAppDialogTitle>
          </ViewerAppDialogHeader>
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
          </div>
          <div class="px-4 pb-4">
            <Button
              class="w-full"
              onClick={() => {
                const speed = speedDraft();
                player.setPlaybackRate(speed);
                void patchBookConfig({ playSpeed: speed });
                setSpeedDialogOpen(false);
              }}
            >
              确定
            </Button>
          </div>
        </ViewerAppDialogContent>
      </ViewerAppDialog>

      <AudioViewerOfflineCacheDialog
        open={offlineCacheDialogOpen()}
        onOpenChange={setOfflineCacheDialogOpen}
        book={book() ?? null}
        chapterIndex={chapterIndex()}
        catalogSize={catalogSize()}
      />

      <ViewerAppDialog open={timerDialogOpen()} onOpenChange={setTimerDialogOpen}>
        <ViewerAppDialogContent layout="app" class="max-w-sm">
          <ViewerAppDialogHeader>
            <ViewerAppDialogTitle>定时关闭</ViewerAppDialogTitle>
          </ViewerAppDialogHeader>
          <div class="flex flex-col gap-2 px-4 py-2">
            {[0, 15, 30, 45, 60, 90, 120, 180].map((m) => (
              <Button
                variant={player.sleepMinutes() === m ? 'default' : 'outline'}
                onClick={() => {
                  player.setSleepMinutes(m);
                  setTimerDialogOpen(false);
                }}
              >
                {m === 0 ? '关闭定时' : `${m} 分钟`}
              </Button>
            ))}
            <Button
              variant="outline"
              onClick={() => {
                player.addSleepMinutes(10);
                showAppToast({ title: '已增加 10 分钟' });
              }}
            >
              +10 分钟
            </Button>
          </div>
        </ViewerAppDialogContent>
      </ViewerAppDialog>
    </>
  );
}
