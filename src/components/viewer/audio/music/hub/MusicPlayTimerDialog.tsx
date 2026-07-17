import { createEffect, createMemo, createSignal, For, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { NumberField, NumberFieldInput } from '@/components/ui/number-field';
import {
  AppSelect,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
  ViewerAppSelectContent,
} from '@/components/viewer/viewer-app-overlay';
import {
  getMusicSettings,
  setMusicSettings,
  type MusicPlayTimerAction,
} from '@/lib/media/audio/music-settings';
import {
  MUSIC_PLAY_TIMER_ACTION_LABELS,
  MUSIC_PLAY_TIMER_ACTIONS,
} from '@/lib/media/audio/music-play-timer';
import { cn } from '@/lib/utils';

type TimerMode = 'duration' | 'datetime';

export interface MusicPlayTimerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function toDateTimeLocal(timestamp: number): string {
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(timestamp - offset).toISOString().slice(0, 16);
}

export const MusicPlayTimerDialog: Component<MusicPlayTimerDialogProps> = (props) => {
  const [mode, setMode] = createSignal<TimerMode>('duration');
  const [durationMinutes, setDurationMinutes] = createSignal(30);
  const [dateTime, setDateTime] = createSignal('');
  const [action, setAction] = createSignal<MusicPlayTimerAction>('pause');

  createEffect(() => {
    if (!props.open) return;
    const settings = getMusicSettings();
    const remainingMs = settings.playTimerTargetAt - Date.now();
    const defaultMinutes =
      remainingMs > 0
        ? Math.max(1, Math.ceil(remainingMs / 60_000))
        : Math.max(1, Math.round((settings.playTimeoutSec ?? 1800) / 60));
    setDurationMinutes(defaultMinutes);
    setDateTime(
      toDateTimeLocal(
        remainingMs > 0 ? settings.playTimerTargetAt : Date.now() + defaultMinutes * 60_000,
      ),
    );
    setAction(settings.playTimerAction);
  });

  const targetAt = createMemo(() =>
    mode() === 'duration'
      ? Date.now() + Math.max(0, durationMinutes()) * 60_000
      : new Date(dateTime()).getTime(),
  );
  const valid = () => Number.isFinite(targetAt()) && targetAt() > Date.now();
  const timerActive = () => getMusicSettings().playTimerTargetAt > Date.now();

  const save = () => {
    if (!valid()) return;
    setMusicSettings({
      playTimeoutSec: Math.max(60, Math.round((targetAt() - Date.now()) / 1000)),
      playTimeoutWaitForTrackEnd: action() !== 'pause',
      playTimerTargetAt: targetAt(),
      playTimerAction: action(),
    });
    props.onOpenChange(false);
  };

  const cancelTimer = () => {
    setMusicSettings({ playTimerTargetAt: 0 });
    props.onOpenChange(false);
  };

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <ViewerAppDialogContent class="sm:max-w-lg" layout="app">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>播放定时</ViewerAppDialogTitle>
          <ViewerAppDialogDescription>
            可按持续时长或指定日期时间触发；退出程序与关机会等待当前歌曲播放完毕。
          </ViewerAppDialogDescription>
        </ViewerAppDialogHeader>

        <div class="space-y-5 px-6 pb-6">
          <div class="grid grid-cols-2 rounded-lg bg-muted/60 p-1">
            <For each={['duration', 'datetime'] as const}>
              {(item) => (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  class={cn(
                    'h-8 rounded-md',
                    mode() === item && 'bg-background shadow-sm hover:bg-background',
                  )}
                  onClick={() => setMode(item)}
                >
                  {item === 'duration' ? '持续时长' : '指定时间'}
                </Button>
              )}
            </For>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium" for="music-play-timer-value">
              {mode() === 'duration' ? '定时时长' : '结束日期与时间'}
            </label>
            {mode() === 'duration' ? (
              <div class="flex items-center gap-2">
                <NumberField
                  rawValue={durationMinutes()}
                  onRawValueChange={setDurationMinutes}
                  minValue={1}
                  step={5}
                  class="flex-1"
                >
                  <NumberFieldInput id="music-play-timer-value" aria-label="定时时长（分钟）" />
                </NumberField>
                <span class="shrink-0 text-sm text-muted-foreground">分钟</span>
              </div>
            ) : (
              <input
                id="music-play-timer-value"
                type="datetime-local"
                value={dateTime()}
                min={toDateTimeLocal(Date.now())}
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onInput={(event) => setDateTime(event.currentTarget.value)}
              />
            )}
          </div>

          <div class="space-y-2">
            <span class="text-sm font-medium">定时结束后行为</span>
            <AppSelect
              value={action()}
              onChange={(value) => value && setAction(value as MusicPlayTimerAction)}
              options={[...MUSIC_PLAY_TIMER_ACTIONS]}
              itemComponent={(itemProps) => (
                <AppSelectItem item={itemProps.item}>
                  {MUSIC_PLAY_TIMER_ACTION_LABELS[itemProps.item.rawValue as MusicPlayTimerAction]}
                </AppSelectItem>
              )}
            >
              <AppSelectTrigger aria-label="定时结束后行为">
                <AppSelectValue<MusicPlayTimerAction>>
                  {(state) =>
                    MUSIC_PLAY_TIMER_ACTION_LABELS[
                      (state.selectedOption() as MusicPlayTimerAction | undefined) ?? 'pause'
                    ]
                  }
                </AppSelectValue>
                <AppSelectIcon />
              </AppSelectTrigger>
              <ViewerAppSelectContent>
                <AppSelectListbox />
              </ViewerAppSelectContent>
            </AppSelect>
            <p class="text-xs text-muted-foreground">
              “暂停播放”会在定时到达时立即执行；其余行为会先等待当前歌曲自然结束。
            </p>
          </div>
        </div>

        <ViewerAppDialogFooter>
          {timerActive() && (
            <Button type="button" variant="destructive" onClick={cancelTimer}>
              取消当前定时
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            关闭
          </Button>
          <Button type="button" disabled={!valid()} onClick={save}>
            启用定时
          </Button>
        </ViewerAppDialogFooter>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
};
