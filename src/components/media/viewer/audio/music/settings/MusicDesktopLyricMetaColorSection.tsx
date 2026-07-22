/**
 * 桌面歌词标题配色：系统默认 / 跟随已播 / 跟随未播 / 自定义（含预设与描边）
 */

import { Show, type Component, type JSX } from 'solid-js';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ColorPicker } from '@/components/ui/color-picker';
import { AppTabs, type AppTabsItem } from '@/components/shared/AppTabs';
import {
  BUILTIN_MUSIC_LYRIC_COLOR_PRESETS,
  type MusicLyricColorPresetId,
} from '@/lib/media/audio/music-lyric-color-presets';
import type { MusicDesktopLyricMetaColorMode } from '@/lib/media/audio/music-settings';

function ModeRadio(props: {
  value: MusicDesktopLyricMetaColorMode;
  current: MusicDesktopLyricMetaColorMode;
  label: string;
  onChange: (value: MusicDesktopLyricMetaColorMode) => void;
}): JSX.Element {
  const id = `music-desktop-lyric-meta-color-${props.value}`;
  return (
    <div class="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={props.current === props.value}
        onChange={(checked) => {
          if (checked) props.onChange(props.value);
        }}
      />
      <Label for={id}>{props.label}</Label>
    </div>
  );
}

export const MusicDesktopLyricMetaColorSection: Component<{
  mode: MusicDesktopLyricMetaColorMode;
  color: string;
  shadow: boolean;
  shadowColor: string;
  presetId: string;
  onModeChange: (mode: MusicDesktopLyricMetaColorMode) => void;
  onColorChange: (color: string) => void;
  onShadowChange: (enabled: boolean) => void;
  onShadowColorChange: (color: string) => void;
  onPresetChange: (presetId: MusicLyricColorPresetId) => void;
}> = (props) => {
  const presetItems = (): readonly AppTabsItem<MusicLyricColorPresetId>[] => [
    ...BUILTIN_MUSIC_LYRIC_COLOR_PRESETS.filter((p) => p.id !== 'system').map((preset) => ({
      value: preset.id,
      label: preset.name,
    })),
    { value: 'custom' as const, label: '自定义' },
  ];

  return (
    <div class="space-y-3">
      <h4 class="text-sm font-medium text-muted-foreground">标题配色风格</h4>
      <div class="flex flex-wrap gap-4">
        <ModeRadio
          value="system"
          current={props.mode}
          label="系统默认"
          onChange={props.onModeChange}
        />
        <ModeRadio
          value="followPlayed"
          current={props.mode}
          label="跟随已播歌词"
          onChange={props.onModeChange}
        />
        <ModeRadio
          value="followUnplayed"
          current={props.mode}
          label="跟随未播歌词"
          onChange={props.onModeChange}
        />
        <ModeRadio
          value="custom"
          current={props.mode}
          label="自定义"
          onChange={props.onModeChange}
        />
      </div>

      <Show when={props.mode === 'custom'}>
        <div class="space-y-3 rounded-md border border-border/60 bg-background/60 p-3">
          <AppTabs
            value={(props.presetId === 'system' ? 'custom' : props.presetId) as MusicLyricColorPresetId}
            onChange={(id) => props.onPresetChange(id)}
            items={presetItems()}
            ariaLabel="标题配色预设"
            variant="settings-equal-wrap"
          />
          <div class="flex flex-wrap items-end gap-4">
            <div class="flex w-17.5 flex-col items-center gap-2">
              <ColorPicker
                variant="minimal"
                triggerVariant="icon"
                size="sm"
                showAlpha
                defaultFormat="rgba"
                outputFormat="rgba"
                value={props.color}
                onChange={props.onColorChange}
                aria-label="标题颜色"
              />
              <span class="text-center text-xs text-muted-foreground">标题色</span>
            </div>
            <div class="flex items-center gap-2 pb-5">
              <Checkbox
                id="music-desktop-lyric-meta-shadow-input"
                checked={props.shadow}
                onChange={props.onShadowChange}
              />
              <Label for="music-desktop-lyric-meta-shadow-input">描边</Label>
            </div>
            <Show when={props.shadow}>
              <div class="flex w-17.5lex-col items-center gap-2">
                <ColorPicker
                  variant="minimal"
                  triggerVariant="icon"
                  size="sm"
                  showAlpha
                  defaultFormat="rgba"
                  outputFormat="rgba"
                  value={props.shadowColor}
                  onChange={props.onShadowColorChange}
                  aria-label="标题描边颜色"
                />
                <span class="text-center text-xs text-muted-foreground">描边色</span>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
};

/** 将内置歌词预设应用到标题自定义色（取已播色 + 已播描边） */
export function desktopLyricMetaColorsFromLyricPreset(
  presetId: MusicLyricColorPresetId,
): { color: string; shadow: boolean; shadowColor: string; presetId: string } | null {
  if (presetId === 'custom' || presetId === 'system') {
    return {
      color: '#ffffff',
      shadow: false,
      shadowColor: 'rgba(0, 0, 0, 0.35)',
      presetId: 'custom',
    };
  }
  const preset = BUILTIN_MUSIC_LYRIC_COLOR_PRESETS.find((p) => p.id === presetId);
  if (!preset) return null;
  return {
    color: preset.playedColor,
    shadow: true,
    shadowColor: preset.playedShadowColor,
    presetId: preset.id,
  };
}
