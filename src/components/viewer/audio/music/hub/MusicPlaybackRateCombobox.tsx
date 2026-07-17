import { createEffect, createSignal, type Component } from 'solid-js';
import { AppCombobox } from '@/components/shared/AppCombobox';

export const MUSIC_PLAYBACK_RATE_PRESETS = [
  '0.5',
  '0.75',
  '1',
  '1.25',
  '1.5',
  '2',
  '3',
];

export interface MusicPlaybackRateComboboxProps {
  value: number;
  onChange: (value: number) => void;
  contentClass?: string;
}

export const MusicPlaybackRateCombobox: Component<
  MusicPlaybackRateComboboxProps
> = (props) => {
  const [input, setInput] = createSignal(String(props.value));

  createEffect(() => {
    setInput(String(props.value));
  });

  const handleChange = (value: string) => {
    setInput(value);
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0.5 || parsed > 3) return;
    props.onChange(parsed);
  };

  return (
    <div class="flex items-center gap-2">
      <AppCombobox
        class="min-w-0 flex-1"
        contentClass={props.contentClass}
        options={MUSIC_PLAYBACK_RATE_PRESETS}
        value={input()}
        onChange={handleChange}
        placeholder="0.5–3"
        aria-label="播放倍速"
      />
      <span class="shrink-0 text-sm text-muted-foreground">x</span>
    </div>
  );
};
