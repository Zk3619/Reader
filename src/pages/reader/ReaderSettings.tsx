/**
 * 阅读设置面板
 * 参考 legado：主题、字体大小、行距/段距/字距、阅读宽度（最后一项；窄屏+移动端不显示）
 */

import { For, Show } from 'solid-js';
import { readerStore, type ReadConfig } from '@/stores/reader';
import { Label } from '@/components/ui/label';
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';

const themeLabels: Record<number, string> = {
  0: '默认',
  1: '护眼绿',
  2: '羊皮纸',
  3: '淡蓝',
  4: '淡紫',
  5: '深色',
  6: '夜间',
};

export interface ReaderSettingsProps {
  onClose?: () => void;
  /** 是否显示「阅读宽度」项；窄屏+移动端应为 false（正文直接占满宽度） */
  showReadWidth?: () => boolean;
}

export function ReaderSettings(props: ReaderSettingsProps) {
  const config = () => readerStore.state.config;

  const setConfig = (patch: Partial<ReadConfig>) => {
    readerStore.setConfig(patch);
  };

  const setSpacing = (key: keyof ReadConfig['spacing'], value: number) => {
    readerStore.setConfig({
      spacing: { ...config().spacing, [key]: value },
    });
  };

  return (
    <div class="flex flex-1 flex-col gap-6 overflow-y-auto py-4">
      {/* 主题 */}
      <div class="space-y-3">
        <Label>主题</Label>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <For each={[0, 1, 2, 3, 4, 5, 6]}>
            {(themeId) => (
              <Button
                variant={config().theme === themeId ? 'default' : 'outline'}
                size="sm"
                onClick={() => setConfig({ theme: themeId })}
              >
                {themeLabels[themeId] ?? themeId}
              </Button>
            )}
          </For>
        </div>
      </div>

      {/* 字体大小 */}
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <Label>字体大小</Label>
          <span class="text-sm text-muted-foreground">{config().fontSize}px</span>
        </div>
        <Slider
          value={[config().fontSize]}
          minValue={12}
          maxValue={32}
          step={1}
          onChange={(values: number[]) => setConfig({ fontSize: values[0] ?? config().fontSize })}
        >
          <SliderTrack>
            <SliderFill />
            <SliderThumb />
          </SliderTrack>
        </Slider>
      </div>

      {/* 行距 */}
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <Label>行距</Label>
          <span class="text-sm text-muted-foreground">{config().spacing.line.toFixed(1)}</span>
        </div>
        <Slider
          value={[config().spacing.line]}
          minValue={0.5}
          maxValue={2.5}
          step={0.1}
          onChange={(values: number[]) => setSpacing('line', values[0] ?? config().spacing.line)}
        >
          <SliderTrack>
            <SliderFill />
            <SliderThumb />
          </SliderTrack>
        </Slider>
      </div>

      {/* 段距 */}
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <Label>段距</Label>
          <span class="text-sm text-muted-foreground">{config().spacing.paragraph.toFixed(1)}em</span>
        </div>
        <Slider
          value={[config().spacing.paragraph]}
          minValue={0}
          maxValue={2}
          step={0.1}
          onChange={(values: number[]) => setSpacing('paragraph', values[0] ?? config().spacing.paragraph)}
        >
          <SliderTrack>
            <SliderFill />
            <SliderThumb />
          </SliderTrack>
        </Slider>
      </div>

      {/* 阅读宽度：最后一项；窄屏+移动端不显示 */}
      <Show when={props.showReadWidth?.() ?? true}>
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <Label>阅读宽度</Label>
            <span class="text-sm text-muted-foreground">{config().readWidth}px</span>
          </div>
          <Slider
            value={[config().readWidth]}
            minValue={400}
            maxValue={1200}
            step={50}
            onChange={(values: number[]) => setConfig({ readWidth: values[0] ?? config().readWidth })}
          >
            <SliderTrack>
              <SliderFill />
              <SliderThumb />
            </SliderTrack>
          </Slider>
        </div>
      </Show>

      {/* 恢复默认 */}
      <Button
        variant="outline"
        class="w-full"
        onClick={() => {
          readerStore.resetConfig();
          props.onClose?.();
        }}
      >
        恢复默认
      </Button>
    </div>
  );
}
