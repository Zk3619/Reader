/**
 * 全屏朗读页（对标 Legado ReadAloudActivity）
 */

import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import {
  ChevronLeft,
  EyeOff,
  List,
  Pause,
  Play,
  Settings,
  SkipBack,
  SkipForward,
  Square,
  Timer,
} from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider, SliderFill, SliderThumb, SliderTrack } from '@/components/ui/slider';
import { AppSwitch, AppSwitchControl, AppSwitchLabel, AppSwitchThumb } from '@/components/shared/AppSwitch';
import { cn } from '@/lib/utils';
import { textViewerStore } from '@/stores/viewer';
import {
  getReadAloudSessionSnapshot,
  isReadAloudSessionActive,
  nextReadAloudChapter,
  nextReadAloudParagraph,
  pauseReadAloudSession,
  prevReadAloudChapter,
  prevReadAloudParagraph,
  resumeReadAloudSession,
  setReadAloudTimer,
  startReadAloudSession,
  stopReadAloudSession,
  subscribeReadAloudSession,
  toggleReadAloudSessionPlay,
  type ReadAloudSessionContext,
  type ReadAloudSessionSnapshot,
} from '@/lib/media/text/read-aloud-session';
import {
  TTS_SPEECH_RATE_MAX,
  TTS_SPEECH_RATE_MIN,
  TTS_TIMER_MAX_MINUTES,
} from '@/lib/media/text/reader-ui-config';
import {
  ReadAloudSpeechRateNumberField,
  ReadAloudTimerNumberField,
} from '@/components/viewer/text-viewer/ReaderReadAloudNumberFields';
import { ReaderReadAloudMoreDialog } from '@/components/viewer/text-viewer/ReaderReadAloudMoreDialog';
import { BookCoverFromBook } from '@/components/books/BookCoverFromBook';
import { BookCoverFallback } from '@/components/books/BookCoverFallback';
import {
  bookGroupGridCoverClass,
  bookGroupGridCoverZoomClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { MinusIcon, PlusIcon } from '@/components/shared/icons';

function iconBtnClass() {
  return 'h-9 w-9 shrink-0 rounded-md hover:bg-muted';
}

export interface ReaderReadAloudFullscreenProps {
  open: boolean;
  onClose: () => void;
  onOpenCatalog?: () => void;
  onEnterBackground?: () => void;
  sessionContext: ReadAloudSessionContext;
}

export function ReaderReadAloudFullscreen(props: ReaderReadAloudFullscreenProps) {
  const [snapshot, setSnapshot] = createSignal<ReadAloudSessionSnapshot>(
    getReadAloudSessionSnapshot(),
  );
  const [moreDialogOpen, setMoreDialogOpen] = createSignal(false);

  onMount(() => {
    const unsub = subscribeReadAloudSession(setSnapshot);
    onCleanup(unsub);
  });

  const config = () => textViewerStore.state.config;
  const book = () => textViewerStore.state.book;
  const catalog = () => textViewerStore.state.catalog;
  const chapterTitle = () =>
    catalog()[textViewerStore.state.chapterIndex]?.title ?? '';

  const isPlaying = () => snapshot().state === 'playing';

  const handlePlayPause = () => {
    if (isReadAloudSessionActive()) {
      toggleReadAloudSessionPlay();
      return;
    }
    void startReadAloudSession(props.sessionContext);
  };

  const handleStop = () => {
    stopReadAloudSession();
    props.onClose();
  };

  const applyTimerMinutes = (minutes: number) => {
    setReadAloudTimer(minutes);
    textViewerStore.setConfig({ ttsTimer: minutes });
  };

  const applySpeechRate = (rate: number) => {
    const next = Math.min(TTS_SPEECH_RATE_MAX, Math.max(TTS_SPEECH_RATE_MIN, rate));
    const wasPlaying = isPlaying();
    if (wasPlaying) pauseReadAloudSession();
    textViewerStore.setConfig({ ttsSpeechRate: next, speakSpeed: next });
    if (wasPlaying) resumeReadAloudSession();
  };

  const adjustSpeechRate = (delta: number) => {
    applySpeechRate((config().ttsSpeechRate ?? 5) + delta);
  };

  const setSpeechRate = applySpeechRate;

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-[calc(var(--viewer-chrome-z,50)+20)] flex flex-col bg-background text-foreground"
        role="dialog"
        aria-label="全屏朗读"
      >
        <div class="absolute inset-0 overflow-hidden">
          <Show when={book()}>
            {(b) => (
              <BookCoverFromBook
                book={b()}
                alt=""
                class="h-full w-full scale-110 object-cover opacity-30 blur-2xl"
              />
            )}
          </Show>
          <div class="absolute inset-0 bg-background/75 backdrop-blur-md" />
        </div>

        <div class="relative flex min-h-0 flex-1 flex-col px-5 pb-8 pt-12">
          <div class="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={props.onClose} aria-label="返回阅读">
              <ChevronLeft class="size-6" />
            </Button>
            <span class="text-lg font-semibold">朗读</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMoreDialogOpen(true)}
              aria-label="更多设置"
            >
              <Settings class="size-5" />
            </Button>
          </div>

          <div class="mx-auto mt-8 w-full max-w-40">
            <div class={bookGroupGridCoverClass('shadow-xl')}>
              <div class={bookGroupGridCoverZoomClass()}>
                <BookCoverFromBook
                  book={book()}
                  alt=""
                  class="h-full w-full object-cover"
                  draggable={false}
                  fallback={<BookCoverFallback class="h-10 w-10" />}
                />
              </div>
            </div>
            <p class="mt-4 line-clamp-2 text-center text-lg font-bold">{chapterTitle()}</p>
            <p class="mt-1 truncate text-center text-sm text-muted-foreground">
              {book()?.name ?? ''}
            </p>
            <Show when={book()?.author?.trim()}>
              <p class="mt-0.5 truncate text-center text-xs text-muted-foreground/80">
                {book()?.author?.trim()}
              </p>
            </Show>
          </div>

          <p class="mx-auto mt-5 line-clamp-3 min-h-15 max-w-lg px-2 text-center text-sm text-muted-foreground">
            {snapshot().currentParagraphPreview || chapterTitle()}
          </p>

          <div class="mt-auto space-y-4">
            <div class="flex items-center gap-3 px-2">
              <Timer class="size-4 shrink-0 text-muted-foreground" />
              <Slider
                minValue={0}
                maxValue={TTS_TIMER_MAX_MINUTES}
                step={1}
                value={[snapshot().timerMinutes]}
                onChange={(v) => applyTimerMinutes(v[0] ?? 0)}
                class="flex-1"
              >
                <SliderTrack>
                  <SliderFill />
                  <SliderThumb />
                </SliderTrack>
              </Slider>
              <ReadAloudTimerNumberField
                minutes={snapshot().timerMinutes}
                onMinutesChange={applyTimerMinutes}
              />
            </div>

            <div class="space-y-2 px-2">
              <div class="flex items-center justify-center gap-3">
                <Label class="shrink-0 text-sm">语速</Label>
                <ReadAloudSpeechRateNumberField
                  rate={config().ttsSpeechRate ?? 5}
                  onRateChange={applySpeechRate}
                  disabled={config().ttsFollowSys}
                />
                <AppSwitch
                  class="flex items-center gap-2"
                  checked={config().ttsFollowSys ?? true}
                  onChange={(checked) => textViewerStore.setConfig({ ttsFollowSys: checked })}
                >
                  <AppSwitchControl>
                    <AppSwitchThumb />
                  </AppSwitchControl>
                  <AppSwitchLabel class="text-xs text-muted-foreground">跟随系统</AppSwitchLabel>
                </AppSwitch>
              </div>
              <div class="flex items-center gap-2">
                <Button
                  variant="ghost"
                  class={iconBtnClass()}
                  disabled={config().ttsFollowSys}
                  onClick={() => adjustSpeechRate(-1)}
                >
                  <MinusIcon class="size-4" size={16} />
                </Button>
                <Slider
                  class="flex-1"
                  disabled={config().ttsFollowSys}
                  value={[config().ttsSpeechRate ?? 5]}
                  minValue={TTS_SPEECH_RATE_MIN}
                  maxValue={TTS_SPEECH_RATE_MAX}
                  step={1}
                  onChange={(values: number[]) => setSpeechRate(values[0] ?? 5)}
                >
                  <SliderTrack>
                    <SliderFill />
                    <SliderThumb />
                  </SliderTrack>
                </Slider>
                <Button
                  variant="ghost"
                  class={iconBtnClass()}
                  disabled={config().ttsFollowSys}
                  onClick={() => adjustSpeechRate(1)}
                >
                  <PlusIcon class="size-4" size={16} />
                </Button>
              </div>
            </div>

            <div class="flex items-center justify-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                class="h-8 px-2 text-xs"
                onClick={() => void prevReadAloudChapter()}
              >
                上一章
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="h-9 w-9 shrink-0"
                aria-label="上一段"
                onClick={() => void prevReadAloudParagraph()}
              >
                <SkipBack class="size-5" />
              </Button>
              <Button
                size="icon"
                class={cn('size-14 shrink-0 rounded-full')}
                onClick={handlePlayPause}
                aria-label={isPlaying() ? '暂停' : '播放'}
              >
                <Show when={isPlaying()} fallback={<Play class="size-7" />}>
                  <Pause class="size-7" />
                </Show>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="h-9 w-9 shrink-0"
                aria-label="停止"
                onClick={handleStop}
              >
                <Square class="size-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="h-9 w-9 shrink-0"
                aria-label="下一段"
                onClick={() => void nextReadAloudParagraph()}
              >
                <SkipForward class="size-5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="h-8 px-2 text-xs"
                onClick={() => void nextReadAloudChapter()}
              >
                下一章
              </Button>
            </div>

            <div class="flex items-center justify-center gap-8">
              <Button
                variant="ghost"
                class="flex h-auto flex-col gap-1 py-2"
                onClick={props.onOpenCatalog}
              >
                <List class="size-5" />
                <span class="text-[11px]">目录</span>
              </Button>
              <Show when={props.onEnterBackground}>
                <Button
                  variant="ghost"
                  class="flex h-auto flex-col gap-1 py-2"
                  onClick={props.onEnterBackground}
                >
                  <EyeOff class="size-5" />
                  <span class="text-[11px]">后台</span>
                </Button>
              </Show>
            </div>
          </div>
        </div>
      </div>

      <ReaderReadAloudMoreDialog open={moreDialogOpen()} onOpenChange={setMoreDialogOpen} />
    </Show>
  );
}
