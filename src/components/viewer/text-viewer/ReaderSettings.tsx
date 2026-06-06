/**
 * 阅读设置面板
 * 参考 legado：主题、字体、行距/字距/段距、阅读宽度、边距、双页等
 */

import { For, Show, onMount, createSignal } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import type {
  TextViewerUiConfig as ReadConfig,
  TextViewerDualPageMode as ReaderDualPageMode,
} from '@/lib/media/text/reader-ui-config';
import { READER_IMAGE_STYLE_LABELS } from '@/lib/js-engine/legado/legado-image-options';
import { getAllHttpTTS } from '@/lib/database/http-tts';
import type { HttpTTS } from '@/types';
import { Label } from '@/components/ui/label';
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ViewerChromeLayoutControls } from '@/components/settings/ViewerChromeLayoutControls';
import {
  readerDrawerOptionTabsListClass,
  readerDrawerOptionTabsTriggerClass,
} from '@/lib/settings/settings-tab-styles';
import {
  TEXT_VIEWER_DUAL_PAGE_MODE_LABELS,
  TEXT_VIEWER_DUAL_PAGE_XL_MIN_WIDTH_PX,
  TEXT_VIEWER_PAGED_DRAG_COMMIT_PERCENT_MAX,
  TEXT_VIEWER_PAGED_DRAG_COMMIT_PERCENT_MIN,
  type TextViewerPageAnim,
  type TextViewerImageStyle,
} from '@/lib/media/text/reader-ui-config';
import type { ReadAloudEngine } from '@/lib/media/text/read-aloud';
import {
  TEXT_VIEWER_PAGE_ANIM_LABELS,
  TEXT_VIEWER_PAGE_ANIM_OPTIONS,
  isTextViewerPagedAnim,
} from '@/lib/media/text/text-viewer-page-anim';
import {
  pagedLayoutCacheHit,
  pagedLayoutEngine,
  pagedLayoutPrefetchStatus,
} from '@/lib/media/text/reader-paged-layout-debug';
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
      <div class="space-y-3">
        <Label>顶栏与底栏布局</Label>
        <p class="text-xs text-muted-foreground">
          固定、层叠或悬浮；对所有阅读器生效，可在应用设置中同样修改。
        </p>
        <ViewerChromeLayoutControls variant="drawer" />
      </div>

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

      {/* 阅读宽度：窄屏+移动端不显示 */}
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

      {/* 边距：正文与视口/列边界留白 */}
      <div class="space-y-4">
        <div>
          <Label>边距</Label>
          <p class="mt-1 text-xs text-muted-foreground">
            四边间距由 content-slot 统一控制；双页滚动时可设置列间中心间距。
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
            maxValue={200}
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
            maxValue={200}
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
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <Label class="text-sm font-normal">顶部</Label>
            <span class="text-sm text-muted-foreground">{config().contentInset.top}px</span>
          </div>
          <Slider
            value={[config().contentInset.top]}
            minValue={0}
            maxValue={120}
            step={2}
            onChange={(values: number[]) =>
              setContentInset('top', values[0] ?? config().contentInset.top)
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
            <Label class="text-sm font-normal">底部</Label>
            <span class="text-sm text-muted-foreground">{config().contentInset.bottom}px</span>
          </div>
          <Slider
            value={[config().contentInset.bottom]}
            minValue={0}
            maxValue={120}
            step={2}
            onChange={(values: number[]) =>
              setContentInset('bottom', values[0] ?? config().contentInset.bottom)
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
              maxValue={400}
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

      {/* 双页 */}
      <div class="space-y-3">
        <Label>双页阅读</Label>
        <p class="text-xs text-muted-foreground">
          宽屏下分栏显示；「自动」在视口 ≥{TEXT_VIEWER_DUAL_PAGE_XL_MIN_WIDTH_PX}px 或横屏时启用（按页模式）。
        </p>
        <Tabs
          value={config().dualPage}
          onChange={(value) => setConfig({ dualPage: value as ReaderDualPageMode })}
          class="w-full"
        >
          <TabsList class={readerDrawerOptionTabsListClass} aria-label="双页阅读">
            <For each={(['off', 'auto', 'always'] as ReaderDualPageMode[])}>
              {(mode) => (
                <TabsTrigger value={mode} class={readerDrawerOptionTabsTriggerClass}>
                  {TEXT_VIEWER_DUAL_PAGE_MODE_LABELS[mode]}
                </TabsTrigger>
              )}
            </For>
          </TabsList>
        </Tabs>
      </div>

      {/* 插图样式 */}
      <div class="space-y-3">
        <Label>插图样式</Label>
        <Tabs
          value={config().imageStyle}
          onChange={(value) => setConfig({ imageStyle: value as TextViewerImageStyle })}
          class="w-full"
        >
          <TabsList class={readerDrawerOptionTabsListClass} aria-label="插图样式">
            <For each={(['DEFAULT', 'FULL', 'TEXT', 'SINGLE'] as TextViewerImageStyle[])}>
              {(style) => (
                <TabsTrigger value={style} class={readerDrawerOptionTabsTriggerClass}>
                  {READER_IMAGE_STYLE_LABELS[style]}
                </TabsTrigger>
              )}
            </For>
          </TabsList>
        </Tabs>
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
        <Tabs
          value={config().aloudEngine}
          onChange={(value) => setConfig({ aloudEngine: value as ReadAloudEngine })}
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
        <Show when={config().aloudEngine === 'httpTts'}>
          <div class="space-y-2">
            <Label class="text-xs text-muted-foreground">HttpTTS 引擎</Label>
            <Show
              when={httpTtsList().length > 0}
              fallback={
                <p class="text-xs text-muted-foreground">请先在设置中配置 HttpTTS</p>
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
                <TabsList class={readerDrawerOptionTabsListClass} aria-label="HttpTTS 引擎">
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
          滚动为连续阅读；其余模式按页翻页，可拖拽或点击换页。覆盖：当前页盖住新页；滑动：两页并排平移；仿真：折页。
        </p>
        <Tabs
          value={config().pageAnim}
          onChange={(value) => setConfig({ pageAnim: value as TextViewerPageAnim })}
          class="w-full"
        >
          <TabsList class={readerDrawerOptionTabsListClass} aria-label="翻页模式">
            <For each={TEXT_VIEWER_PAGE_ANIM_OPTIONS}>
              {(mode) => (
                <TabsTrigger value={mode} class={readerDrawerOptionTabsTriggerClass}>
                  {TEXT_VIEWER_PAGE_ANIM_LABELS[mode]}
                </TabsTrigger>
              )}
            </For>
          </TabsList>
        </Tabs>
      </div>

      <Show when={isTextViewerPagedAnim(config().pageAnim)}>
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <Label>拖拽翻页阈值</Label>
            <span class="text-sm tabular-nums text-muted-foreground">
              {config().pagedDragCommitPercent}%
            </span>
          </div>
          <p class="text-xs text-muted-foreground">
            拖动距离需超过视口宽度的该比例才翻页，否则松手回弹。
          </p>
          <Slider
            value={[config().pagedDragCommitPercent]}
            minValue={TEXT_VIEWER_PAGED_DRAG_COMMIT_PERCENT_MIN}
            maxValue={TEXT_VIEWER_PAGED_DRAG_COMMIT_PERCENT_MAX}
            step={1}
            onChange={(values: number[]) =>
              setConfig({
                pagedDragCommitPercent:
                  values[0] ?? config().pagedDragCommitPercent,
              })
            }
          >
            <SliderTrack>
              <SliderFill />
              <SliderThumb />
            </SliderTrack>
          </Slider>
        </div>
      </Show>

      {/* 分页引擎（调试） */}
      <Show when={isTextViewerPagedAnim(config().pageAnim)}>
        <div class="space-y-2 rounded-lg border border-dashed border-muted-foreground/40 px-3 py-2">
          <Label class="text-muted-foreground">分页引擎（调试）</Label>
          <p class="text-sm font-medium tabular-nums">
            {pagedLayoutEngine() === 'idle' ? '—' : pagedLayoutEngine()}
            <Show when={pagedLayoutCacheHit()}>
              <span class="ml-2 text-xs font-normal text-muted-foreground">缓存命中</span>
            </Show>
          </p>
          <Show when={pagedLayoutPrefetchStatus()}>
            <p class="text-xs text-muted-foreground">{pagedLayoutPrefetchStatus()}</p>
          </Show>
          <p class="text-xs text-muted-foreground">
            canvas：纯文本 Canvas 预排；dom：HTML/插图 DOM 测量；canvas+dom：Canvas 初算后经 DOM 精修。
            正文缓存由设置页「章节正文缓存」控制，切章后自动预取相邻章。
          </p>
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
