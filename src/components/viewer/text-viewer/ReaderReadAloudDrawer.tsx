/**
 * 朗读控制抽屉（对标 Legado ReadAloudDialog）
 */

import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { List, Fullscreen, EyeOff, Pause, Play, Settings, SkipBack, SkipForward, Square } from 'lucide-solid';
import { textViewerStore } from '@/stores/viewer';
import { getAllHttpTTS } from '@/lib/database/http-tts';
import type { HttpTTS } from '@/types';
import type { ReadAloudEngine } from '@/lib/media/text/read-aloud';
import {
  isReadAloudSupported,
} from '@/lib/media/text/read-aloud';
import {
  getReadAloudSessionSnapshot,
  isReadAloudSessionActive,
  nextReadAloudChapter,
  nextReadAloudParagraph,
  prevReadAloudChapter,
  prevReadAloudParagraph,
  setReadAloudTimer,
  startReadAloudSession,
  stopReadAloudSession,
  subscribeReadAloudSession,
  toggleReadAloudSessionPlay,
  type ReadAloudSessionContext,
} from '@/lib/media/text/read-aloud-session';
import { subscribeReadAloudProgress } from '@/lib/media/text/read-aloud-progress';
import {
  TTS_SPEECH_RATE_MAX,
  TTS_SPEECH_RATE_MIN,
  TTS_TIMER_MAX_MINUTES,
} from '@/lib/media/text/reader-ui-config';
import {
  ReadAloudSpeechRateNumberField,
  ReadAloudTimerNumberField,
} from '@/components/viewer/text-viewer/ReaderReadAloudNumberFields';
import {
  ViewerAppDrawer,
  ViewerAppDrawerBody,
  ViewerAppDrawerContent,
  ViewerAppDrawerHeader,
} from '@/components/viewer/viewer-app-overlay';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider, SliderFill, SliderThumb, SliderTrack } from '@/components/ui/slider';
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  readerDrawerOptionTabsListClass,
  readerDrawerOptionTabsTriggerClass,
} from '@/lib/settings/settings-tab-styles';
import {
  AppSelect,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { ViewerAppSelectContent } from '@/components/viewer/viewer-app-overlay';
import { UpdateTimeIcon, MinusIcon, PlusIcon } from '@/components/shared/icons';
import { HttpTtsEngineManager } from '@/components/viewer/text-viewer/HttpTtsEngineManager';
import { ReaderReadAloudMoreDialog } from '@/components/viewer/text-viewer/ReaderReadAloudMoreDialog';
import { tts } from '@/lib/platform/tts';
import type { TtsVoice } from '@/lib/platform/tts';

const DEFAULT_VOICE_VALUE = '';

function iconBtnClass() {
  return 'h-9 w-9 shrink-0 rounded-md hover:bg-muted';
}

function QuickActionButton(props: {
  label: string;
  onClick: () => void;
  children: import('solid-js').JSX.Element;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      class="flex h-auto min-w-18 flex-col items-center gap-1 px-2 py-2"
      onClick={props.onClick}
    >
      {props.children}
      <span class="text-[11px] leading-none text-muted-foreground">{props.label}</span>
    </Button>
  );
}

function voiceDisplayName(voices: TtsVoice[], uri: string | null | undefined): string {
  if (!uri) return '默认音色';
  return voices.find((v) => v.voiceURI === uri)?.name ?? '默认音色';
}
export interface ReaderReadAloudDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionContext: ReadAloudSessionContext;
  onOpenCatalog?: () => void;
  onOpenSettings?: () => void;
  onOpenFullscreen?: () => void;
  onEnterBackground?: () => void;
  onSessionStateChange?: (active: boolean) => void;
}

export function ReaderReadAloudDrawer(props: ReaderReadAloudDrawerProps) {
  const config = () => textViewerStore.state.config;
  const [httpTtsList, setHttpTtsList] = createSignal<HttpTTS[]>([]);
  const [engineMgrOpen, setEngineMgrOpen] = createSignal(false);
  const [moreDialogOpen, setMoreDialogOpen] = createSignal(false);
  const [voices, setVoices] = createSignal<TtsVoice[]>([]);
  const [snapshot, setSnapshot] = createSignal(getReadAloudSessionSnapshot());
  const [liveParagraphText, setLiveParagraphText] = createSignal('');

  const setConfig = (patch: Parameters<typeof textViewerStore.setConfig>[0]) => {
    textViewerStore.setConfig(patch);
  };

  const refreshHttpTts = () => {
    void getAllHttpTTS().then(setHttpTtsList);
  };

  onMount(() => {
    refreshHttpTts();
    const loadVoices = () => {
      if (tts.isSupported()) void tts.getVoices().then(setVoices);
    };
    loadVoices();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    const unsubSession = subscribeReadAloudSession((s) => {
      setSnapshot(s);
      const active = s.state === 'playing' || s.state === 'paused';
      props.onSessionStateChange?.(active);
      if (s.currentParagraphPreview) setLiveParagraphText(s.currentParagraphPreview);
    });
    const unsubProgress = subscribeReadAloudProgress((p) => {
      if (p?.paragraphText) setLiveParagraphText(p.paragraphText);
    });
    onCleanup(() => {
      unsubSession();
      unsubProgress();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    });
  });

  createEffect(() => {
    if (props.open) {
      setSnapshot(getReadAloudSessionSnapshot());
    }
  });

  const playState = () => snapshot().state;
  const isPlaying = () => playState() === 'playing';

  const currentReadingText = createMemo(() => {
    const live = liveParagraphText().trim();
    if (live) return live;
    return snapshot().currentParagraphPreview.trim();
  });

  const voiceOptions = createMemo(() => [DEFAULT_VOICE_VALUE, ...voices().map((v) => v.voiceURI)]);

  const handlePlayPause = () => {
    if (isReadAloudSessionActive()) {
      toggleReadAloudSessionPlay();
      return;
    }
    void startReadAloudSession(props.sessionContext);
  };

  const handleStop = () => {
    stopReadAloudSession();
  };

  const applySpeechRate = (rate: number) => {
    setConfig({ ttsSpeechRate: rate, speakSpeed: rate });
  };

  const applyTimerMinutes = (minutes: number) => {
    setReadAloudTimer(minutes);
    setConfig({ ttsTimer: minutes });
  };

  const adjustSpeechRate = (delta: number) => {
    const next = Math.min(
      TTS_SPEECH_RATE_MAX,
      Math.max(TTS_SPEECH_RATE_MIN, (config().ttsSpeechRate ?? 5) + delta),
    );
    applySpeechRate(next);
  };

  return (
    <>
      <ViewerAppDrawer
        open={props.open}
        onOpenChange={props.onOpenChange}
        snapPoints={[0, 1]}
        defaultSnapPoint={1}
      >
        <ViewerAppDrawerContent
          class={cn('flex flex-col', hDrawerPanel, 'max-h-[85dvh]')}
          showNativeDragHandle={false}
        >
          <ViewerAppDrawerHeader title="朗读" />
          <ViewerAppDrawerBody class="min-h-0 flex-1 space-y-4 overflow-y-auto scroll-gutter-stable-both px-4 pb-4">
            <Show when={currentReadingText()}>
              <p class="max-h-36 overflow-y-auto whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-foreground/90">
                {currentReadingText()}
              </p>
            </Show>

            {/* 播放控制 */}
            <div class="flex items-center justify-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                class="px-2 text-xs"
                onClick={() => void prevReadAloudChapter()}
              >
                上一章
              </Button>
              <Button
                variant="ghost"
                class={iconBtnClass()}
                aria-label="上一段"
                onClick={() => void prevReadAloudParagraph()}
              >
                <SkipBack class="size-5" />
              </Button>
              <Button
                variant="ghost"
                class={cn(iconBtnClass(), 'h-10 w-10')}
                aria-label={isPlaying() ? '暂停' : '播放'}
                onClick={handlePlayPause}
              >
                <Show when={isPlaying()} fallback={<Play class="size-6" />}>
                  <Pause class="size-6" />
                </Show>
              </Button>
              <Button
                variant="ghost"
                class={iconBtnClass()}
                aria-label="停止"
                onClick={handleStop}
              >
                <Square class="size-5" />
              </Button>
              <Button
                variant="ghost"
                class={iconBtnClass()}
                aria-label="下一段"
                onClick={() => void nextReadAloudParagraph()}
              >
                <SkipForward class="size-5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="px-2 text-xs"
                onClick={() => void nextReadAloudChapter()}
              >
                下一章
              </Button>
            </div>

            {/* 定时 */}
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <UpdateTimeIcon class="size-5 shrink-0 text-muted-foreground" size={20} />
                <Slider
                  class="flex-1"
                  value={[snapshot().timerMinutes]}
                  minValue={0}
                  maxValue={TTS_TIMER_MAX_MINUTES}
                  step={1}
                  onChange={(values: number[]) => applyTimerMinutes(values[0] ?? 0)}
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
            </div>

            {/* 语速 */}
            <div class="space-y-2">
              <div class="flex items-center justify-center gap-3">
                <Label class="shrink-0 text-sm">语速</Label>
                <ReadAloudSpeechRateNumberField
                  rate={config().ttsSpeechRate ?? 5}
                  onRateChange={applySpeechRate}
                  disabled={config().ttsFollowSys}
                />
                <Switch
                  class="flex items-center gap-2"
                  checked={config().ttsFollowSys ?? true}
                  onChange={(checked) => setConfig({ ttsFollowSys: checked })}
                >
                  <SwitchControl>
                    <SwitchThumb />
                  </SwitchControl>
                  <SwitchLabel class="text-xs text-muted-foreground">跟随系统</SwitchLabel>
                </Switch>
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
                  onChange={(values: number[]) => {
                    applySpeechRate(values[0] ?? 5);
                  }}
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

            {/* 引擎 */}
            <div class="space-y-3">
              <Label>朗读引擎</Label>
              <Tabs
                value={config().aloudEngine}
                onChange={(value) =>
                  setConfig({ aloudEngine: value as ReadAloudEngine })
                }
                class="w-full"
              >
                <TabsList class={readerDrawerOptionTabsListClass} aria-label="朗读引擎">
                  <TabsTrigger value="system" class={readerDrawerOptionTabsTriggerClass}>
                    系统 TTS
                  </TabsTrigger>
                  <TabsTrigger value="httpTts" class={readerDrawerOptionTabsTriggerClass}>
                    HttpTTS
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <Show when={config().aloudEngine === 'system'}>
                <Show
                  when={isReadAloudSupported()}
                  fallback={
                    <p class="text-xs text-destructive">当前环境不支持语音合成</p>
                  }
                >
                  <div class="space-y-2">
                    <Label class="text-xs text-muted-foreground">音色</Label>
                    <AppSelect
                      options={voiceOptions()}
                      value={config().systemTtsVoiceURI || DEFAULT_VOICE_VALUE}
                      onChange={(value) =>
                        setConfig({
                          systemTtsVoiceURI:
                            !value || value === DEFAULT_VOICE_VALUE ? '' : value,
                        })
                      }
                      itemComponent={(p) => (
                        <AppSelectItem item={p.item}>
                          {p.item.rawValue === DEFAULT_VOICE_VALUE
                            ? '默认音色'
                            : voiceDisplayName(voices(), p.item.rawValue)}
                        </AppSelectItem>
                      )}
                    >
                      <AppSelectTrigger class="w-full" aria-label="音色">
                        <AppSelectValue<string>>
                          {(state) =>
                            voiceDisplayName(voices(), state.selectedOption())
                          }
                        </AppSelectValue>
                        <AppSelectIcon />
                      </AppSelectTrigger>
                      <ViewerAppSelectContent>
                        <AppSelectListbox />
                      </ViewerAppSelectContent>
                    </AppSelect>
                  </div>
                </Show>
              </Show>

              <Show when={config().aloudEngine === 'httpTts'}>
                <div class="space-y-2">
                  <Label class="text-xs text-muted-foreground">HttpTTS 引擎</Label>
                  <Show
                    when={httpTtsList().length > 0}
                    fallback={
                      <p class="text-xs text-muted-foreground">暂无引擎，请添加或导入</p>
                    }
                  >
                    <Tabs
                      value={
                        config().httpTtsId != null
                          ? String(config().httpTtsId)
                          : undefined
                      }
                      onChange={(value) => setConfig({ httpTtsId: Number(value) })}
                      class="w-full"
                    >
                      <TabsList
                        class={cn(readerDrawerOptionTabsListClass, 'flex-wrap')}
                        aria-label="HttpTTS"
                      >
                        <For each={httpTtsList()}>
                          {(item) => (
                            <TabsTrigger
                              value={String(item.id)}
                              class={cn(readerDrawerOptionTabsTriggerClass, 'truncate')}
                              title={item.name}
                            >
                              {item.name}
                            </TabsTrigger>
                          )}
                        </For>
                      </TabsList>
                    </Tabs>
                  </Show>
                  <Button
                    variant="outline"
                    size="sm"
                    class="w-full"
                    onClick={() => setEngineMgrOpen(true)}
                  >
                    管理引擎
                  </Button>
                </div>
              </Show>
            </div>

            {/* 快捷入口 */}
            <div class="flex items-start justify-center gap-1 border-t border-border/40 pt-3">
              <Show when={props.onOpenCatalog}>
                <QuickActionButton label="目录" onClick={() => props.onOpenCatalog?.()}>
                  <List class="size-5" />
                </QuickActionButton>
              </Show>
              <Show when={props.onOpenSettings}>
                <QuickActionButton label="界面" onClick={() => props.onOpenSettings?.()}>
                  <span class="text-base font-normal leading-none" aria-hidden="true">
                    Aa
                  </span>
                </QuickActionButton>
              </Show>
              <Show when={props.onOpenFullscreen}>
                <QuickActionButton label="全屏朗读" onClick={() => props.onOpenFullscreen?.()}>
                  <Fullscreen class="size-5" />
                </QuickActionButton>
              </Show>
              <Show when={props.onEnterBackground}>
                <QuickActionButton label="后台" onClick={() => props.onEnterBackground?.()}>
                  <EyeOff class="size-5" />
                </QuickActionButton>
              </Show>
              <QuickActionButton label="更多设置" onClick={() => setMoreDialogOpen(true)}>
                <Settings class="size-5" />
              </QuickActionButton>
            </div>
          </ViewerAppDrawerBody>
        </ViewerAppDrawerContent>
      </ViewerAppDrawer>

      <ReaderReadAloudMoreDialog
        open={moreDialogOpen()}
        onOpenChange={setMoreDialogOpen}
      />

      <HttpTtsEngineManager
        open={engineMgrOpen()}
        onOpenChange={setEngineMgrOpen}
        onListChange={refreshHttpTts}
      />
    </>
  );
}
