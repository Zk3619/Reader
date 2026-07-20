/**
 * 歌词字体颜色预设选择（桌面歌词 / 播放详情共用）
 */

import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  type Component,
  type JSX,
} from 'solid-js';
import { Button } from '@/components/ui/button';
import { ColorPicker } from '@/components/ui/color-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import { AppTabs, type AppTabsItem } from '@/components/shared/AppTabs';
import {
  BUILTIN_MUSIC_LYRIC_COLOR_PRESETS,
  createMusicLyricCustomPreset,
  isFreeEditLyricColorPresetId,
  resolveLyricColorPresetPreview,
  type MusicLyricColorContext,
  type MusicLyricColorPresetId,
  type MusicLyricCustomPreset,
} from '@/lib/media/audio/music-lyric-color-presets';

function ColorSwatchField(props: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  muted?: boolean;
}): JSX.Element {
  const resolvedValue = createMemo(() => resolveColorTokenForPicker(props.value));

  return (
    <div
      class="flex w-[70px] flex-col items-center gap-2 pr-6"
      style={{ opacity: props.muted ? '0.45' : '1' }}
    >
      <ColorPicker
        variant="minimal"
        triggerVariant="icon"
        size="sm"
        showAlpha
        defaultFormat="rgba"
        outputFormat="rgba"
        value={resolvedValue()}
        onChange={(color) => props.onChange?.(color)}
        disabled={props.disabled}
        aria-label={props.label}
        class="shrink-0"
      />
      <span class="text-center text-xs leading-tight text-muted-foreground">{props.label}</span>
    </div>
  );
}

function resolveColorTokenForPicker(value: string): string {
  const raw = value.trim();
  if (!raw) return raw;
  if (typeof window === 'undefined') return raw;

  const matched = raw.match(
    /^hsl\(var\(--([a-zA-Z0-9-_]+)\)\s*(?:\/\s*([0-9.]+%?))?\)$/i,
  );
  if (!matched) return raw;

  const varName = matched[1];
  const alpha = matched[2];
  const varValue = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${varName}`)
    .trim();
  if (!varValue) return raw;

  return alpha ? `hsl(${varValue} / ${alpha})` : `hsl(${varValue})`;
}

export const MusicLyricColorPresetSection: Component<{
  context: MusicLyricColorContext;
  presetId: string;
  customPresets: readonly MusicLyricCustomPreset[];
  playedColor: string;
  unplayedColor: string;
  unplayedShadow: boolean;
  unplayedShadowColor: string;
  playedShadow: boolean;
  playedShadowColor: string;
  onPresetChange: (
    presetId: MusicLyricColorPresetId,
    customPresetsOverride?: MusicLyricCustomPreset[],
  ) => void;
  onCustomPresetsChange: (next: MusicLyricCustomPreset[]) => void;
  onPatch: (
    patch: Partial<{
      playedColor: string;
      unplayedColor: string;
      unplayedShadow: boolean;
      unplayedShadowColor: string;
      playedShadow: boolean;
      playedShadowColor: string;
    }>,
  ) => void;
}> = (props) => {
  const [nameDraft, setNameDraft] = createSignal('');

  const selectedCustomPreset = createMemo(() =>
    props.customPresets.find((preset) => preset.id === props.presetId),
  );
  const isFreeEdit = () => isFreeEditLyricColorPresetId(props.presetId);
  const isSavedCustom = () => !!selectedCustomPreset();
  const editable = () => isFreeEdit() || isSavedCustom();

  createEffect(() => {
    setNameDraft(selectedCustomPreset()?.name ?? '');
  });

  const preview = createMemo(() =>
    resolveLyricColorPresetPreview(
      props.context,
      props.presetId,
      {
        playDetailLyricPlayedColor: props.playedColor,
        playDetailLyricUnplayedColor: props.unplayedColor,
        playDetailLyricUnplayedShadowColor: props.unplayedShadowColor,
        playDetailLyricPlayedShadowColor: props.playedShadowColor,
        playDetailLyricUnplayedShadow: props.unplayedShadow,
        playDetailLyricPlayedShadow: props.playedShadow,
        desktopLyricPlayedColor: props.playedColor,
        desktopLyricUnplayedColor: props.unplayedColor,
        desktopLyricUnplayedShadowColor: props.unplayedShadowColor,
        desktopLyricPlayedShadowColor: props.playedShadowColor,
        desktopLyricUnplayedShadow: props.unplayedShadow,
        desktopLyricPlayedShadow: props.playedShadow,
      },
      props.customPresets,
    ),
  );

  const tabItems = createMemo<readonly AppTabsItem<MusicLyricColorPresetId>[]>(() => [
    ...BUILTIN_MUSIC_LYRIC_COLOR_PRESETS.map((preset) => ({
      value: preset.id,
      label: preset.name,
    })),
    ...props.customPresets.map((preset) => ({ value: preset.id, label: preset.name })),
    { value: 'custom' as const, label: '自定义' },
  ]);

  const nextPresetName = () => `个性预设 ${props.customPresets.length + 1}`;

  const updateSelectedCustomPreset = (
    patch: Partial<
      Pick<
        MusicLyricCustomPreset,
        | 'name'
        | 'playedColor'
        | 'unplayedColor'
        | 'unplayedShadowColor'
        | 'playedShadowColor'
        | 'unplayedShadow'
        | 'playedShadow'
      >
    >,
  ) => {
    const selected = selectedCustomPreset();
    if (!selected) return;
    const next = props.customPresets.map((preset) =>
      preset.id === selected.id ? { ...preset, ...patch } : preset,
    );
    props.onCustomPresetsChange(next);
  };

  const patchColors = (
    patch: Partial<{
      playedColor: string;
      unplayedColor: string;
      unplayedShadow: boolean;
      unplayedShadowColor: string;
      playedShadow: boolean;
      playedShadowColor: string;
    }>,
  ) => {
    props.onPatch(patch);
    if (isSavedCustom()) updateSelectedCustomPreset(patch);
  };

  const createPresetFromCurrent = () => {
    const created = createMusicLyricCustomPreset(nextPresetName(), preview());
    const next = [...props.customPresets, created];
    props.onCustomPresetsChange(next);
    props.onPresetChange(created.id, next);
  };

  const savePresetName = () => {
    const selected = selectedCustomPreset();
    if (!selected) return;
    const nextName = nameDraft().trim();
    if (!nextName) return;
    updateSelectedCustomPreset({ name: nextName });
  };

  const deleteSelectedPreset = () => {
    const selected = selectedCustomPreset();
    if (!selected) return;
    const next = props.customPresets.filter((preset) => preset.id !== selected.id);
    props.onCustomPresetsChange(next);
    props.onPresetChange('system', next);
  };

  return (
    <section class="space-y-3">
      <h3 class="font-medium">歌词字体颜色</h3>
      <AppTabs
        value={props.presetId as MusicLyricColorPresetId}
        onChange={(id) => props.onPresetChange(id, [...props.customPresets])}
        items={tabItems()}
        ariaLabel="歌词配色预设"
        variant="settings-equal-wrap"
      />

      <div class="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" type="button" onClick={createPresetFromCurrent}>
          基于当前创建个性预设
        </Button>
        <Show when={isSavedCustom()}>
          <AppTextFieldBareInput
            layout="compact"
            class="w-36"
            value={nameDraft()}
            onInput={(e) => setNameDraft(e.currentTarget.value)}
            aria-label="个性预设名称"
          />
          <Button size="sm" variant="outline" type="button" onClick={savePresetName}>
            保存名称
          </Button>
          <Button size="sm" variant="destructive" type="button" onClick={deleteSelectedPreset}>
            删除预设
          </Button>
        </Show>
      </div>

      <div class="flex flex-wrap">
        <ColorSwatchField
          label="未播放"
          value={preview().unplayedColor}
          disabled={!editable()}
          onChange={(value) => patchColors({ unplayedColor: value })}
        />
        <ColorSwatchField
          label="已播放"
          value={preview().playedColor}
          disabled={!editable()}
          onChange={(value) => patchColors({ playedColor: value })}
        />
        <ColorSwatchField
          label="未播描边"
          value={preview().unplayedShadowColor}
          muted={!preview().unplayedShadow}
          disabled={!editable()}
          onChange={(value) =>
            patchColors({ unplayedShadowColor: value, unplayedShadow: true })
          }
        />
        <ColorSwatchField
          label="已播描边"
          value={preview().playedShadowColor}
          muted={!preview().playedShadow}
          disabled={!editable()}
          onChange={(value) =>
            patchColors({ playedShadowColor: value, playedShadow: true })
          }
        />
      </div>

      <Show when={editable()}>
        <div class="flex flex-wrap gap-4">
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-lyric-unplayed-shadow-input"
              checked={props.unplayedShadow}
              onChange={(checked) => patchColors({ unplayedShadow: checked })}
            />
            <Label for="music-lyric-unplayed-shadow-input">未播放描边/外发光</Label>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-lyric-played-shadow-input"
              checked={props.playedShadow}
              onChange={(checked) => patchColors({ playedShadow: checked })}
            />
            <Label for="music-lyric-played-shadow-input">已播放描边/外发光</Label>
          </div>
        </div>
      </Show>
    </section>
  );
};
