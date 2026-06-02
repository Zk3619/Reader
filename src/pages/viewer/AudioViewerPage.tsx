/**
 * 音频阅读
 * 对齐 Legado AudioPlayActivity / AudioPlayService
 */

import { createSignal, createMemo, Show, type Component } from 'solid-js';
import {
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Rewind,
  FastForward,
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
import { MediaViewerCatalog } from '@/components/viewer/MediaViewerCatalog';
import { MediaViewerToolbarHeader } from '@/components/viewer/MediaViewerToolbarHeader';
import { MediaViewerChapterNavFooter } from '@/components/viewer/MediaViewerChapterNavFooter';
import { AudioSkipCreditsDialog } from '@/components/viewer/audio/AudioSkipCreditsDialog';
import { AudioLyricPanel } from '@/components/viewer/audio/AudioLyricPanel';
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
import { MultiSwitch, type MultiSwitchOption } from '@/components/ui/multi-switch';
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';
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
import { cn } from '@/lib/utils';

export interface AudioViewerPageProps {
  onClose: () => void;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const ListEndStopIcon: Component<{ class?: string }> = (props) => (
  <span class={cn('relative inline-flex', props.class)}>
    <Repeat class="h-4 w-4" />
    <span class="absolute -bottom-0.5 -right-0.5 text-[8px] font-bold leading-none">1</span>
  </span>
);

/** 顺序与 cyclePlayMode 一致，供 MultiSwitch 左键循环 */
const PLAY_MODE_OPTIONS: MultiSwitchOption<AudioPlayMode>[] = [
  { value: AudioPlayMode.listEndStop, label: '列表结束停止', icon: ListEndStopIcon },
  { value: AudioPlayMode.singleLoop, label: '单曲循环', icon: Repeat1 },
  { value: AudioPlayMode.random, label: '随机播放', icon: Shuffle },
  { value: AudioPlayMode.listLoop, label: '列表循环', icon: Repeat },
];

export function AudioViewerPage(props: AudioViewerPageProps) {
  const [catalogOpen, setCatalogOpen] = createSignal(false);
  const [catalogScrollTop, setCatalogScrollTop] = createSignal(0);
  const [skipCreditsOpen, setSkipCreditsOpen] = createSignal(false);
  const [speedDialogOpen, setSpeedDialogOpen] = createSignal(false);
  const [timerDialogOpen, setTimerDialogOpen] = createSignal(false);
  const [speedDraft, setSpeedDraft] = createSignal(1);

  const book = () => viewerStore.state.book;
  const catalog = () => viewerStore.state.catalog;
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
    chapterIndex,
    catalog,
    chapterPos: () => viewerStore.state.chapterPos,
    book,
    audioConfig,
    onChapterPosChange: (pos) => viewerStore.setChapterPos(pos),
    onEndedChapter: handleEndedChapter,
    onSaveProgress: () => viewerStore.saveProgress(),
    onSkipVolumeChapter: (index) => goChapterTo(index),
  });

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

  return (
    <>
      <MediaViewerShell>
        <MediaViewerShellMain>
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-linear-to-b from-background via-background to-muted/40 px-6">
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
                <p class="text-sm text-destructive">{error()}</p>
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

            <Show when={!bootstrapping() && !loading() && url()}>
              <div
                class="flex w-full max-w-md flex-col items-center gap-4"
                data-media-viewer-interactive-zone
              >
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
                <Tooltip>
                  <TooltipTrigger as="div">
                    <MultiSwitch<AudioPlayMode>
                      options={PLAY_MODE_OPTIONS}
                      value={() => audioConfig().playMode}
                      onChange={(mode) => void patchBookConfig({ playMode: mode })}
                      sizeClass="h-9 w-9"
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    {playModeLabel(audioConfig().playMode)}（左键循环切换，右键或长按打开菜单选择）
                  </TooltipContent>
                </Tooltip>

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

          <MediaViewerHeader placement="overlay">
            <MediaViewerToolbarHeader
              title={book()?.name ?? ''}
              subtitle={chapterTitle()}
              onClose={props.onClose}
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
              loading={loading()}
            />
          </MediaViewerHeader>

          <MediaViewerFooter placement="overlay" collapseTarget="bottom-bar">
            <MediaViewerChapterNavFooter
              chapterIndex={chapterIndex()}
              catalogLength={catalog().length}
              loading={loading()}
              onPrev={() => void goChapterDelta(-1)}
              onNext={() => void goChapterDelta(1)}
            />
          </MediaViewerFooter>
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
                void goChapterTo(index);
              }}
            />
          </AppDrawerBody>
        </AppDrawerContent>
      </AppDrawer>

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
        </AppDialogContent>
      </AppDialog>

      <AppDialog open={timerDialogOpen()} onOpenChange={setTimerDialogOpen}>
        <AppDialogContent layout="app" class="max-w-sm">
          <AppDialogHeader>
            <AppDialogTitle>定时关闭</AppDialogTitle>
          </AppDialogHeader>
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
        </AppDialogContent>
      </AppDialog>
    </>
  );
}
