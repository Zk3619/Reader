import { createEffect, createMemo, createSignal, type Component } from 'solid-js';
import { AppCombobox } from '@/components/shared/AppCombobox';

/** 0.25～2.00 共 8 档，Popover 内两行四列（快捷预设；输入可超出到完整可调范围） */
export const MUSIC_PLAYBACK_RATE_PRESETS = [
  '0.25',
  '0.50',
  '0.75',
  '1.00',
  '1.25',
  '1.50',
  '1.75',
  '2.00',
] as const;

/** 音调快捷预设（完整可调见 MUSIC_PITCH_RATE_MIN/MAX） */
export const MUSIC_PITCH_RATE_PRESETS = [
  '0.50',
  '0.65',
  '0.80',
  '0.95',
  '1.10',
  '1.25',
  '1.40',
  '1.50',
] as const;

/** 倍速数字输入 / 滑条可调范围 */
export const MUSIC_PLAY_SPEED_MIN = 0.25;
export const MUSIC_PLAY_SPEED_MAX = 4;

/** 音调数字输入 / 滑条可调范围 */
export const MUSIC_PITCH_RATE_MIN = 0.5;
export const MUSIC_PITCH_RATE_MAX = 2;

function formatRate(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return (1).toFixed(decimals);
  return (Math.round(value * 10 ** decimals) / 10 ** decimals).toFixed(decimals);
}

export interface MusicRateComboboxProps {
  value: number;
  onChange: (value: number) => void;
  presets: readonly string[];
  min: number;
  max: number;
  contentClass?: string;
  /** 嵌在 Popover 内时关闭 Combobox Portal，避免触发外侧交互关闭浮层 */
  disablePortal?: boolean;
  'aria-label'?: string;
  suffix?: string;
}

/**
 * 倍率 Combobox：输入框完整显示实际倍速/音调（如 1.05），
 * 不把显示文案吸附为某一预设；预设仅作为下拉快捷项。
 * 注意：嵌在 AppPopover 内时易触发 dismiss，播放详情调节面板改用预设网格。
 */
export const MusicRateCombobox: Component<MusicRateComboboxProps> = (props) => {
  const display = () => formatRate(props.value);
  const [input, setInput] = createSignal(display());

  createEffect(() => {
    setInput(display());
  });

  /** 保证当前实际值始终是合法 option，避免 Combobox 因无匹配而清空输入框 */
  const options = createMemo(() => {
    const current = input().trim() || display();
    const list = [...props.presets];
    if (current && !list.includes(current)) {
      list.unshift(current);
    }
    return list;
  });

  const commit = (raw: string) => {
    setInput(raw);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < props.min || parsed > props.max) return;
    const next = Math.round(parsed * 100) / 100;
    props.onChange(next);
    setInput(formatRate(next));
  };

  return (
    <div class="flex items-center gap-2">
      <AppCombobox
        class="min-w-0 flex-1"
        contentClass={props.contentClass}
        options={options()}
        value={input()}
        onChange={commit}
        disableFilter
        disablePortal={props.disablePortal}
        placeholder={`${props.min.toFixed(2)}–${props.max.toFixed(2)}`}
        aria-label={props['aria-label'] ?? '倍率'}
      />
      <span class="shrink-0 text-sm text-muted-foreground">{props.suffix ?? 'x'}</span>
    </div>
  );
};

export interface MusicPlaybackRateComboboxProps {
  value: number;
  onChange: (value: number) => void;
  contentClass?: string;
  disablePortal?: boolean;
}

export const MusicPlaybackRateCombobox: Component<
  MusicPlaybackRateComboboxProps
> = (props) => (
  <MusicRateCombobox
    value={props.value}
    onChange={props.onChange}
    presets={MUSIC_PLAYBACK_RATE_PRESETS}
    min={MUSIC_PLAY_SPEED_MIN}
    max={MUSIC_PLAY_SPEED_MAX}
    contentClass={props.contentClass}
    disablePortal={props.disablePortal}
    aria-label="播放倍速"
  />
);

export interface MusicPitchRateComboboxProps {
  value: number;
  onChange: (value: number) => void;
  contentClass?: string;
  disablePortal?: boolean;
}

export const MusicPitchRateCombobox: Component<MusicPitchRateComboboxProps> = (
  props,
) => (
  <MusicRateCombobox
    value={props.value}
    onChange={props.onChange}
    presets={MUSIC_PITCH_RATE_PRESETS}
    min={MUSIC_PITCH_RATE_MIN}
    max={MUSIC_PITCH_RATE_MAX}
    contentClass={props.contentClass}
    disablePortal={props.disablePortal}
    aria-label="音调"
  />
);
