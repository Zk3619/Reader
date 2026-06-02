/**
 * 阅读设置面板
 * 参考 legado：主题、字体大小、行距/段距/字距、阅读宽度（最后一项；窄屏+移动端不显示）
 */

import { For, Show, onMount, createSignal } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import type {
  TextViewerUiConfig as ReadConfig,
  TextViewerPageAnim as ReaderPageAnim,
  TextViewerDualPageMode as ReaderDualPageMode,
  TextViewerImageStyle as ReaderImageStyle,
} from '@/lib/media/text/reader-ui-config';
import { READER_IMAGE_STYLE_LABELS } from '@/lib/js-engine/legado/legado-image-options';
import { getAllHttpTTS } from '@/lib/database/http-tts';
import type { HttpTTS } from '@/types';
import { Label } from '@/components/ui/label';
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from '@/components/ui/switch';
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
  /** 打开全屏九宫格点击区域配置（与首次进入阅读器相同） */
  onOpenClickRegionalConfig?: () => void;
}

export function ReaderSettings(props: ReaderSettingsProps) {
  const config = () => textViewerStore.state.config;
  const [httpTtsList, setHttpTtsList] = createSignal<HttpTTS[]>([]);

  onMount(() => {
    void getAllHttpTTS().then(setHttpTtsList);
  });

  const setConfig = (patch: Partial<ReadConfig>) => {
    textViewerStore.setConfig(patch);
  };

  const setSpacing = (key: keyof ReadConfig['spacing'], value: number) => {
    textViewerStore.setConfig({
      spacing: { ...config().spacing, [key]: value },
    });
  };

  const setContentInset = (key: keyof ReadConfig['contentInset'], value: number) => {
    textViewerStore.setConfig({
      contentInset: { ...config().contentInset, [key]: value },
    });
  };

  const dualPageMiddleVisible = () => config().dualPage !== 'off';

  return (
    <div class="flex flex-1 flex-col gap-6 overflow-y-auto scroll-gutter-stable-both pt-4 pb-2 mb-4">
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

      {/* 字间距 */}
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <Label>字间距</Label>
          <span class="text-sm text-muted-foreground">{config().spacing.letter.toFixed(2)}em</span>
        </div>
        <Slider
          value={[config().spacing.letter]}
          minValue={0}
          maxValue={0.2}
          step={0.01}
          onChange={(values: number[]) => setSpacing('letter', values[0] ?? config().spacing.letter)}
        >
          <SliderTrack>
            <SliderFill />
            <SliderThumb />
          </SliderTrack>
        </Slider>
      </div>

      {/* 双页 */}
      <div class="space-y-3">
        <Label>双页阅读</Label>
        <p class="text-xs text-muted-foreground">宽屏下分栏显示；「自动」在横屏且宽度≥900px 时启用。</p>
        <div class="grid grid-cols-3 gap-2">
          <For each={(['off', 'auto', 'always'] as ReaderDualPageMode[])}>
            {(mode) => (
              <Button
                variant={config().dualPage === mode ? 'default' : 'outline'}
                size="sm"
                onClick={() => setConfig({ dualPage: mode })}
              >
                {mode === 'off' ? '关闭' : mode === 'auto' ? '自动' : '始终'}
              </Button>
            )}
          </For>
        </div>
      </div>

      {/* 边距：正文与视口/列边界留白 */}
      <div class="space-y-4">
        <div>
          <Label>边距</Label>
          <p class="mt-1 text-xs text-muted-foreground">
            正文与左右边界的间距；双页时可设置列间中心间距。
          </p>
        </div>
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <Label class="text-sm font-normal">左侧</Label>
            <span class="text-sm text-muted-foreground">{config().contentInset.left}px</span>
          </div>
          <Slider
            value={[config().contentInset.left]}
            minValue={0}
            maxValue={80}
            step={2}
            onChange={(values: number[]) =>
              setContentInset('left', values[0] ?? config().contentInset.left)
            }
          >
            <SliderTrack>
              <SliderFill />
              <SliderThumb />
            </SliderTrack>
          </Slider>
        </div>
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <Label class="text-sm font-normal">右侧</Label>
            <span class="text-sm text-muted-foreground">{config().contentInset.right}px</span>
          </div>
          <Slider
            value={[config().contentInset.right]}
            minValue={0}
            maxValue={80}
            step={2}
            onChange={(values: number[]) =>
              setContentInset('right', values[0] ?? config().contentInset.right)
            }
          >
            <SliderTrack>
              <SliderFill />
              <SliderThumb />
            </SliderTrack>
          </Slider>
        </div>
        <Show when={dualPageMiddleVisible()}>
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <Label class="text-sm font-normal">中心间距</Label>
              <span class="text-sm text-muted-foreground">{config().contentInset.center}px</span>
            </div>
            <Slider
              value={[config().contentInset.center]}
              minValue={0}
              maxValue={120}
              step={2}
              onChange={(values: number[]) =>
                setContentInset('center', values[0] ?? config().contentInset.center)
              }
            >
              <SliderTrack>
                <SliderFill />
                <SliderThumb />
              </SliderTrack>
            </Slider>
          </div>
        </Show>
      </div>

      {/* 插图样式 */}
      <div class="space-y-3">
        <Label>插图样式</Label>
        <div class="grid grid-cols-4 gap-2">
          <For each={(['DEFAULT', 'FULL', 'TEXT', 'SINGLE'] as ReaderImageStyle[])}>
            {(style) => (
              <Button
                variant={config().imageStyle === style ? 'default' : 'outline'}
                size="sm"
                onClick={() => setConfig({ imageStyle: style })}
              >
                {READER_IMAGE_STYLE_LABELS[style]}
              </Button>
            )}
          </For>
        </div>
      </div>

      {/* 音量键翻页 */}
      <div class="flex items-center justify-between gap-4">
        <div>
          <Label>音量键翻页</Label>
          <p class="text-xs text-muted-foreground">音量上/下或方向键上/下切换章节</p>
        </div>
        <Switch
          checked={config().volumeKeyTurnPage}
          onChange={(checked) => setConfig({ volumeKeyTurnPage: checked })}
        >
          <SwitchControl>
            <SwitchThumb />
          </SwitchControl>
          <SwitchLabel class="sr-only">音量键翻页</SwitchLabel>
        </Switch>
      </div>

      {/* 朗读 */}
      <div class="space-y-3">
        <Label>朗读引擎</Label>
        <div class="grid grid-cols-2 gap-2">
          <Button
            variant={config().aloudEngine === 'system' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setConfig({ aloudEngine: 'system' })}
          >
            系统 TTS
          </Button>
          <Button
            variant={config().aloudEngine === 'httpTts' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setConfig({ aloudEngine: 'httpTts' })}
          >
            HttpTTS
          </Button>
        </div>
        <Show when={config().aloudEngine === 'httpTts'}>
          <div class="space-y-2">
            <Label class="text-xs text-muted-foreground">HttpTTS 引擎</Label>
            <div class="flex flex-col gap-1">
              <For each={httpTtsList()}>
                {(item) => (
                  <Button
                    variant={config().httpTtsId === item.id ? 'default' : 'outline'}
                    size="sm"
                    class="justify-start"
                    onClick={() => setConfig({ httpTtsId: item.id })}
                  >
                    {item.name}
                  </Button>
                )}
              </For>
              <Show when={httpTtsList().length === 0}>
                <p class="text-xs text-muted-foreground">请先在设置中配置 HttpTTS</p>
              </Show>
            </div>
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <Label>语速</Label>
                <span class="text-sm text-muted-foreground">{config().speakSpeed}</span>
              </div>
              <Slider
                value={[config().speakSpeed]}
                minValue={0}
                maxValue={10}
                step={1}
                onChange={(values: number[]) =>
                  setConfig({ speakSpeed: values[0] ?? config().speakSpeed })
                }
              >
                <SliderTrack>
                  <SliderFill />
                  <SliderThumb />
                </SliderTrack>
              </Slider>
            </div>
          </div>
        </Show>
      </div>

      {/* 点击区域 */}
      <div class="space-y-3">
        <Label>点击区域</Label>
        <p class="text-xs text-muted-foreground">
          全屏配置九宫格分区、动作与区域大小，与 Legado 点击区域设置一致。
        </p>
        <Button
          variant="outline"
          class="w-full"
          onClick={() => {
            props.onOpenClickRegionalConfig?.();
            props.onClose?.();
          }}
        >
          点击区域设置
        </Button>
      </div>

      {/* 翻页模式 */}
      <div class="space-y-3">
        <Label>翻页模式</Label>
        <p class="text-xs text-muted-foreground">
          滚动为默认；覆盖/滑动在切换章节时带过渡动画（仍为滚动阅读，与 Legado 仿真翻页不同）。
        </p>
        <div class="grid grid-cols-2 gap-2">
          <For each={(['scroll', 'cover', 'slide', 'none'] as ReaderPageAnim[])}>
            {(mode) => (
              <Button
                variant={config().pageAnim === mode ? 'default' : 'outline'}
                size="sm"
                onClick={() => setConfig({ pageAnim: mode })}
              >
                {mode === 'scroll'
                  ? '滚动'
                  : mode === 'cover'
                    ? '覆盖'
                    : mode === 'slide'
                      ? '滑动'
                      : '无动画'}
              </Button>
            )}
          </For>
        </div>
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
          textViewerStore.resetConfig();
          props.onClose?.();
        }}
      >
        恢复默认
      </Button>
    </div>
  );
}
