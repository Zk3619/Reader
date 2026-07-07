/**
 * 阅读器背景设置（对齐 Legado BgTextConfigDialog）
 */

import { For, Show, createSignal } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider, SliderFill, SliderThumb, SliderTrack } from '@/components/ui/slider';
import { textViewerStore } from '@/stores/viewer';
import {
  BUILTIN_READER_BACKGROUNDS,
  READER_BG_TYPE_LABELS,
  activeReaderBgSlot,
  builtinReaderBgUrl,
  isNightReaderTheme,
  pickAndSaveReaderBackgroundImage,
  setActiveReaderBgSlot,
  type ReaderBgType,
} from '@/lib/media/text/reader-background';
import { readerThemePalette } from '@/lib/media/text/reader-theme-classes';
import { showAppToast } from '@/components/shared/AppToasts';
import { cn } from '@/lib/utils';

const PRESET_BG_COLORS = [
  '#ffc0edc6',
  '#EEEEEE',
  '#CCE8CF',
  '#D3D3D3',
  '#FFFFFF',
  '#000000',
  '#1a1f2e',
];

export function ReaderBackgroundSetting() {
  const config = () => textViewerStore.state.config;
  const slot = () => activeReaderBgSlot(config());
  const [picking, setPicking] = createSignal(false);

  const setBg = (patch: { bgType?: ReaderBgType; bgStr?: string }) => {
    textViewerStore.setConfig(setActiveReaderBgSlot(config(), patch));
  };

  const previewStyle = () => {
    const s = slot();
    if (s.bgType === 0) return { 'background-color': s.bgStr };
    if (s.bgType === 1) {
      return {
        'background-image': `url("${builtinReaderBgUrl(s.bgStr)}")`,
        'background-size': 'cover',
        'background-position': 'center',
      };
    }
    return { 'background-color': readerThemePalette(config().theme).bg };
  };

  async function handlePickCustom() {
    setPicking(true);
    try {
      const fileName = await pickAndSaveReaderBackgroundImage();
      if (fileName) {
        setBg({ bgType: 2, bgStr: fileName });
        showAppToast({ title: '背景已设置', description: fileName, variant: 'default' });
      }
    } catch (error) {
      showAppToast({
        title: '选择背景失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setPicking(false);
    }
  }

  return (
    <div class="space-y-3">
      <div class="flex items-center justify-between gap-2">
        <Label class="text-sm font-medium">阅读背景</Label>
        <span class="text-xs text-muted-foreground">
          {isNightReaderTheme(config().theme) ? '夜间模式' : '日间模式'}
        </span>
      </div>

      <div
        class="h-20 w-full overflow-hidden rounded-md border border-border/60"
        style={previewStyle()}
      />

      <div class="flex flex-wrap gap-1.5">
        <For each={[0, 1, 2] as ReaderBgType[]}>
          {(type) => (
            <Button
              variant={slot().bgType === type ? 'default' : 'outline'}
              size="sm"
              class="h-8 text-xs"
              onClick={() => {
                if (type === 0) {
                  setBg({
                    bgType: 0,
                    bgStr: readerThemePalette(config().theme).bg,
                  });
                } else if (type === 1) {
                  setBg({ bgType: 1, bgStr: BUILTIN_READER_BACKGROUNDS[0] });
                } else {
                  void handlePickCustom();
                }
              }}
            >
              {READER_BG_TYPE_LABELS[type]}
            </Button>
          )}
        </For>
      </div>

      <Show when={slot().bgType === 0}>
        <div class="flex flex-wrap gap-2">
          <For each={PRESET_BG_COLORS}>
            {(color) => (
              <button
                type="button"
                class="size-8 rounded-md border border-border/60"
                style={{ 'background-color': color }}
                title={color}
                onClick={() => setBg({ bgType: 0, bgStr: color })}
              />
            )}
          </For>
        </div>
      </Show>

      <Show when={slot().bgType === 1}>
        <div class="grid grid-cols-4 gap-2">
          <For each={[...BUILTIN_READER_BACKGROUNDS]}>
            {(name) => (
              <Button
                type="button"
                variant="outline"
                class={cn(
                  'aspect-3/4 h-auto w-full min-h-0 overflow-hidden p-0 hover:opacity-90',
                  slot().bgStr === name && 'ring-2 ring-primary',
                )}
                style={{
                  'background-image': `url("${builtinReaderBgUrl(name)}")`,
                  'background-size': 'cover',
                  'background-position': 'center',
                }}
                aria-label={`内置背景 ${name}`}
                onClick={() => setBg({ bgType: 1, bgStr: name })}
              />
            )}
          </For>
        </div>
      </Show>

      <Show when={slot().bgType === 2}>
        <div class="flex items-center gap-2">
          <span class="truncate text-xs text-muted-foreground">{slot().bgStr}</span>
          <Button variant="outline" size="sm" disabled={picking()} onClick={() => void handlePickCustom()}>
            {picking() ? '选择中…' : '更换图片'}
          </Button>
        </div>
      </Show>

      <Show when={slot().bgType !== 0}>
        <div class="space-y-1">
          <div class="flex items-center justify-between text-xs text-muted-foreground">
            <span>背景透明度</span>
            <span>{config().bgAlpha ?? 100}%</span>
          </div>
          <Slider
            minValue={0}
            maxValue={100}
            step={1}
            value={[config().bgAlpha ?? 100]}
            onChange={(v) => textViewerStore.setConfig({ bgAlpha: v[0] ?? 100 })}
          >
            <SliderTrack>
              <SliderFill />
            </SliderTrack>
            <SliderThumb />
          </Slider>
        </div>
      </Show>

      <p class="text-xs text-muted-foreground">
        自定义背景会写入本地 bg/ 目录，并随 ZIP / WebDAV 备份同步。
      </p>
    </div>
  );
}
