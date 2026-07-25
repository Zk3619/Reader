import { For, type Component } from 'solid-js';
import { AppSlider } from '@/components/shared/AppSlider';

export const MUSIC_EQ_FREQUENCIES = [
  '32',
  '64',
  '125',
  '250',
  '500',
  '1k',
  '2k',
  '4k',
  '8k',
  '16k',
] as const;

export const MUSIC_EQ_PRESET_LABELS: Record<string, string> = {
  flat: '平直（保持原声）',
  pop: '流行（突出人声与节奏）',
  rock: '摇滚（增强低频与高频）',
  jazz: '爵士（温暖通透）',
  classical: '古典（扩展动态与细节）',
};

export interface MusicEqualizerEditorProps {
  gains: readonly number[];
  onChange: (index: number, value: number) => void;
}

export const MusicEqualizerEditor: Component<MusicEqualizerEditorProps> = (props) => (
  <div class="grid grid-cols-5 gap-x-3 gap-y-5 lg:grid-cols-10">
    <For each={[...MUSIC_EQ_FREQUENCIES]}>
      {(frequency, index) => (
        <label class="flex min-w-0 flex-col items-center gap-2 text-center text-xs text-muted-foreground">
          <span>{frequency}Hz</span>
          <AppSlider
            orientation="vertical"
            class="h-36 w-5 flex-col"
            min={-12}
            max={12}
            step={0.5}
            value={props.gains[index()] ?? 0}
            onChange={(value) => props.onChange(index(), value)}
            aria-label={`${frequency}Hz 增益`}
            trackClass="h-full w-2"
            fillClass="h-auto w-full"
            thumbClass="left-[-6px] top-auto"
          />
          <span class="tabular-nums">{(props.gains[index()] ?? 0).toFixed(1)} dB</span>
        </label>
      )}
    </For>
  </div>
);
