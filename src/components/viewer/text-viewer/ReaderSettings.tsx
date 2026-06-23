/**
 * 阅读界面设置面板（字号、间距、配色、页眉页脚等）
 */

import { For, Show, onMount, createSignal } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import {
  AppSelect,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { ViewerAppSelectContent } from '@/components/viewer/viewer-app-overlay';
import type {
  TextViewerUiConfig as ReadConfig,
  TextViewerDualPageMode as ReaderDualPageMode,
  TextViewerLayoutEngine,
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
  TEXT_VIEWER_LAYOUT_ENGINE_LABELS,
  TEXT_VIEWER_PAGED_DRAG_COMMIT_PERCENT_MAX,
  TEXT_VIEWER_PAGED_DRAG_COMMIT_PERCENT_MIN,
  TEXT_VIEWER_SIMULATION_DRAG_ZONE_OPTIONS,
  type TextViewerPageAnim,
  type TextViewerImageStyle,
  type TextViewerSimulationDragZonePercent,
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
import { clearChapterLayoutCache } from '@/lib/media/text/reader-chapter-layout-cache';
import {
  READER_THEME_IDS,
  READER_THEME_LABELS,
  readerThemePalette,
} from '@/lib/media/text/reader-theme-classes';
import {
  TEXT_VIEWER_CHAPTER_TITLE_STYLE_LABELS,
  TEXT_VIEWER_CHAPTER_TITLE_STYLE_OPTIONS,
  type TextViewerChapterTitleStyle,
} from '@/lib/media/text/reader-chapter-title-style';
import { ReaderPageTipControls } from '@/components/viewer/text-viewer/ReaderPageTipControls';
import {
  READER_FONT_PRESET_IDS,
  READER_FONT_PRESET_LABELS,
  ensureReaderFontFace,
  readerCustomFontFamilyName,
} from '@/lib/media/text/reader-font';
import { formatRem, formatRemFromPx, pxToRem, remToPx } from '@/lib/media/text/reader-rem';
import { isTauri } from '@/lib/platform/detect';

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
  const [fontSelectOpen, setFontSelectOpen] = createSignal(false);
  const fontOptions = () => READER_FONT_PRESET_IDS.map(String);

  onMount(() => {
    void getAllHttpTTS().then(setHttpTtsList);
  });

  const setConfig = (patch: Partial<ReadConfig>) => {
    if (patch.layoutEngine != null && patch.layoutEngine !== config().layoutEngine) {
      clearChapterLayoutCache();
    }
    textViewerStore.setConfig(patch);
  };

  const onLayoutEngineChange = (value: TextViewerLayoutEngine) => {
    if (value === config().layoutEngine) return;
    clearChapterLayoutCache();
    setConfig({ layoutEngine: value });
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

  const setPageTips = (patch: Partial<ReadConfig['pageTips']>) => {
    textViewerStore.setConfig({
      pageTips: { ...config().pageTips, ...patch },
    });
  };

  const pickLocalFontFile = async () => {
    if (!isTauri()) return;
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        filters: [{ name: '字体', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
      });
      if (!selected || Array.isArray(selected)) return;
      const family = readerCustomFontFamilyName({
        customFontName: config().customFontName,
        customFontPath: selected,
      });
      ensureReaderFontFace(selected, family);
      setConfig({ font: 3, customFontPath: selected, customFontName: family });
    } catch (e) {
      console.warn('[ReaderSettings] pick font failed', e);
    }
  };

  const dualPageMiddleVisible = () =>
    isTextViewerPagedAnim(config().pageAnim) && config().dualPage !== 'off';

  return (
    <div class="flex w-full min-w-0 flex-col gap-6 pt-4 pb-2">
      <div class="space-y-3">
        <Label>顶栏与底栏布局</Label>
        <p class="text-xs text-muted-foreground">
          固定、层叠或悬浮；仅对本文本阅读器生效，与应用全局设置相互独立。
        </p>
        <ViewerChromeLayoutControls
          variant="drawer"
          value={() => config().viewerChromeLayout}
          onChange={(layout) => setConfig({ viewerChromeLayout: layout })}
        />
      </div>

      {/* 主题 */}
      <div class="space-y-3">
        <Label>主题</Label>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <For each={[...READER_THEME_IDS]}>
            {(themeId) => (
              <Button
                variant={config().theme === themeId ? 'default' : 'outline'}
                size="sm"
                onClick={() => setConfig({ theme: themeId })}
              >
                <span class="flex items-center gap-2">
                  <span
                    class="size-3 shrink-0 rounded-full border border-border/40"
                    style={{
                      'background-color': readerThemePalette(themeId).bg,
                      'box-shadow': `inset 0 0 0 1px ${readerThemePalette(themeId).text}33`,
                    }}
                    aria-hidden="true"
                  />
                  {READER_THEME_LABELS[themeId]}
                </span>
              </Button>
            )}
          </For>
        </div>
      </div>

      {/* 章节标题 */}
      <div class="space-y-3">
        <Label>章节标题</Label>
        <p class="text-xs text-muted-foreground">
          控制章节名在阅读视图中的位置与间距；间距会随字号、行距、字距、段距变化。
        </p>
        <Tabs
          value={config().chapterTitleStyle ?? 'center'}
          onChange={(value) =>
            setConfig({ chapterTitleStyle: value as TextViewerChapterTitleStyle })
          }
          class="w-full"
        >
          <TabsList class={readerDrawerOptionTabsListClass} aria-label="章节标题渲染">
            <For each={TEXT_VIEWER_CHAPTER_TITLE_STYLE_OPTIONS}>
              {(style) => (
                <TabsTrigger value={style} class={readerDrawerOptionTabsTriggerClass}>
                  {TEXT_VIEWER_CHAPTER_TITLE_STYLE_LABELS[style]}
                </TabsTrigger>
              )}
            </For>
          </TabsList>
        </Tabs>
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <Label class="text-sm font-normal">标题字号增量</Label>
            <span class="text-sm text-muted-foreground">
              {formatRem(config().chapterTitleSize ?? 0)}
            </span>
          </div>
          <Slider
            value={[config().chapterTitleSize ?? 0]}
            minValue={0}
            maxValue={1.5}
            step={0.0625}
            onChange={(values: number[]) =>
              setConfig({ chapterTitleSize: values[0] ?? config().chapterTitleSize ?? 0 })
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
            <Label class="text-sm font-normal">标题上间距</Label>
            <span class="text-sm text-muted-foreground">
              {formatRem(config().chapterTitleTopSpacing ?? 0)}
            </span>
          </div>
          <Slider
            value={[config().chapterTitleTopSpacing ?? 0]}
            minValue={0}
            maxValue={3}
            step={0.125}
            onChange={(values: number[]) =>
              setConfig({ chapterTitleTopSpacing: values[0] ?? config().chapterTitleTopSpacing ?? 0 })
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
            <Label class="text-sm font-normal">标题下间距</Label>
            <span class="text-sm text-muted-foreground">
              {formatRem(config().chapterTitleBottomSpacing ?? 0)}
            </span>
          </div>
          <Slider
            value={[config().chapterTitleBottomSpacing ?? 0]}
            minValue={0}
            maxValue={3}
            step={0.125}
            onChange={(values: number[]) =>
              setConfig({
                chapterTitleBottomSpacing: values[0] ?? config().chapterTitleBottomSpacing ?? 0,
              })
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
            <Label class="text-sm font-normal">标题字重</Label>
            <span class="text-sm text-muted-foreground">{config().chapterTitleFontWeight ?? 600}</span>
          </div>
          <Slider
            value={[config().chapterTitleFontWeight ?? 600]}
            minValue={100}
            maxValue={900}
            step={100}
            onChange={(values: number[]) =>
              setConfig({ chapterTitleFontWeight: values[0] ?? config().chapterTitleFontWeight ?? 600 })
            }
          >
            <SliderTrack>
              <SliderFill />
              <SliderThumb />
            </SliderTrack>
          </Slider>
        </div>
      </div>

      {/* 字体 */}
      <div class="space-y-3">
        <Label for="reader-font-preset">字体</Label>
        <AppSelect
          value={String(config().font)}
          onChange={(v) => setConfig({ font: Number(v ?? 0) })}
          options={fontOptions()}
          placeholder="选择字体"
          open={fontSelectOpen()}
          onOpenChange={setFontSelectOpen}
          itemComponent={(itemProps) => (
            <AppSelectItem item={itemProps.item}>
              {READER_FONT_PRESET_LABELS[Number(itemProps.item.rawValue)] ??
                itemProps.item.rawValue}
            </AppSelectItem>
          )}
        >
          <AppSelectTrigger id="reader-font-preset" aria-label="字体">
            <AppSelectValue<string>>
              {(state) => {
                const v = state.selectedOption();
                const id = Number(v);
                return READER_FONT_PRESET_LABELS[id] ?? v ?? '选择字体';
              }}
            </AppSelectValue>
            <AppSelectIcon />
          </AppSelectTrigger>
          <ViewerAppSelectContent>
            <AppSelectListbox />
          </ViewerAppSelectContent>
        </AppSelect>
        <Show when={config().font === 3}>
          <div class="space-y-2">
            <Button variant="outline" class="w-full" onClick={() => void pickLocalFontFile()}>
              选择本地字体文件
            </Button>
            <Show when={config().customFontPath}>
              <p class="truncate text-xs text-muted-foreground" title={config().customFontPath}>
                {config().customFontPath}
              </p>
            </Show>
          </div>
        </Show>
        <Show when={config().font === 4}>
          <div class="space-y-2">
            <Label class="text-sm font-normal">字体名称</Label>
            <input
              class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={config().customFontName}
              placeholder="例如：PingFang SC, Noto Serif SC"
              onInput={(e) => setConfig({ customFontName: e.currentTarget.value })}
            />
            <p class="text-xs text-muted-foreground">
              填写系统已安装或 WebView 支持的字体族名称。
            </p>
          </div>
        </Show>
      </div>

      {/* 字体大小 */}
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <Label>字体大小</Label>
          <span class="text-sm text-muted-foreground">{formatRemFromPx(config().fontSize)}</span>
        </div>
        <Slider
          value={[pxToRem(config().fontSize)]}
          minValue={0.75}
          maxValue={2}
          step={0.0625}
          onChange={(values: number[]) =>
            setConfig({ fontSize: remToPx(values[0] ?? pxToRem(config().fontSize)) })
          }
        >
          <SliderTrack>
            <SliderFill />
            <SliderThumb />
          </SliderTrack>
        </Slider>
      </div>

      {/* 字重 */}
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <Label>字重</Label>
          <span class="text-sm text-muted-foreground">{config().fontWeight ?? 400}</span>
        </div>
        <Slider
          value={[config().fontWeight ?? 400]}
          minValue={100}
          maxValue={900}
          step={100}
          onChange={(values: number[]) =>
            setConfig({ fontWeight: values[0] ?? config().fontWeight ?? 400 })
          }
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

      {/* 段首缩进 */}
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <Label>段首缩进</Label>
          <span class="text-sm text-muted-foreground">
            {config().paragraphIndentChars ?? 2} 字
          </span>
        </div>
        <Slider
          value={[config().paragraphIndentChars ?? 2]}
          minValue={0}
          maxValue={8}
          step={1}
          onChange={(values: number[]) =>
            setConfig({ paragraphIndentChars: values[0] ?? config().paragraphIndentChars ?? 2 })
          }
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
            <span class="text-sm text-muted-foreground">{formatRemFromPx(config().readWidth)}</span>
          </div>
          <Slider
            value={[pxToRem(config().readWidth)]}
            minValue={25}
            maxValue={75}
            step={0.5}
            onChange={(values: number[]) =>
              setConfig({ readWidth: remToPx(values[0] ?? pxToRem(config().readWidth)) })
            }
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
            四边间距由 content-slot 统一控制；按页双页阅读时可设置列间中心间距。
          </p>
        </div>
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <Label class="text-sm font-normal">左侧</Label>
            <span class="text-sm text-muted-foreground">{formatRemFromPx(config().contentInset.left)}</span>
          </div>
          <Slider
            value={[pxToRem(config().contentInset.left)]}
            minValue={0}
            maxValue={12.5}
            step={0.125}
            onChange={(values: number[]) =>
              setContentInset('left', remToPx(values[0] ?? pxToRem(config().contentInset.left)))
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
            <span class="text-sm text-muted-foreground">{formatRemFromPx(config().contentInset.right)}</span>
          </div>
          <Slider
            value={[pxToRem(config().contentInset.right)]}
            minValue={0}
            maxValue={12.5}
            step={0.125}
            onChange={(values: number[]) =>
              setContentInset('right', remToPx(values[0] ?? pxToRem(config().contentInset.right)))
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
            <span class="text-sm text-muted-foreground">{formatRemFromPx(config().contentInset.top)}</span>
          </div>
          <Slider
            value={[pxToRem(config().contentInset.top)]}
            minValue={0}
            maxValue={7.5}
            step={0.125}
            onChange={(values: number[]) =>
              setContentInset('top', remToPx(values[0] ?? pxToRem(config().contentInset.top)))
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
            <span class="text-sm text-muted-foreground">{formatRemFromPx(config().contentInset.bottom)}</span>
          </div>
          <Slider
            value={[pxToRem(config().contentInset.bottom)]}
            minValue={0}
            maxValue={7.5}
            step={0.125}
            onChange={(values: number[]) =>
              setContentInset('bottom', remToPx(values[0] ?? pxToRem(config().contentInset.bottom)))
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
              <span class="text-sm text-muted-foreground">{formatRemFromPx(config().contentInset.center)}</span>
            </div>
            <Slider
              value={[pxToRem(config().contentInset.center)]}
              minValue={0}
              maxValue={25}
              step={0.125}
              onChange={(values: number[]) =>
                setContentInset('center', remToPx(values[0] ?? pxToRem(config().contentInset.center)))
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

      <ReaderPageTipControls tips={() => config().pageTips} onChange={setPageTips} />

      {/* 双页 */}
      <Show when={isTextViewerPagedAnim(config().pageAnim)}>
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
      </Show>

      {/* 排版引擎 */}
      <Show when={isTextViewerPagedAnim(config().pageAnim)}>
        <div class="space-y-3">
          <Label>排版引擎</Label>
          <p class="text-xs text-muted-foreground">
            Pretext 为实验性无 DOM 行测量方案，翻页更流畅；DOM 为推荐的经典 measure-host 方案。两端对齐章节字级坐标仍依赖 DOM。
          </p>
          <Tabs
            value={config().layoutEngine}
            onChange={(value) => onLayoutEngineChange(value as TextViewerLayoutEngine)}
            class="w-full"
          >
            <TabsList class={readerDrawerOptionTabsListClass} aria-label="排版引擎">
              <For each={(['pretext', 'dom'] as TextViewerLayoutEngine[])}>
                {(engine) => (
                  <TabsTrigger value={engine} class={readerDrawerOptionTabsTriggerClass}>
                    {TEXT_VIEWER_LAYOUT_ENGINE_LABELS[engine]}
                  </TabsTrigger>
                )}
              </For>
            </TabsList>
          </Tabs>
        </div>
      </Show>

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

      {/* 点击区域（仅按页翻页） */}
      <Show when={isTextViewerPagedAnim(config().pageAnim)}>
        <div class="space-y-3">
          <Label>点击区域</Label>
          <p class="text-xs text-muted-foreground">
            全屏配置九宫格分区与动作；滚动模式下单击/双击切换顶底栏。
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
      </Show>

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

      <Show when={config().pageAnim === 'simulation'}>
        <div class="space-y-3">
          <Label>仿真拖拽分区</Label>
          <p class="text-xs text-muted-foreground">
            左侧区域仅翻上一页，右侧区域仅翻下一页。调节左右分区宽度（占视口比例）。
          </p>
          <Tabs
            value={String(config().simulationDragZonePercent)}
            onChange={(value) =>
              setConfig({
                simulationDragZonePercent: Number(value) as TextViewerSimulationDragZonePercent,
              })
            }
            class="w-full"
          >
            <TabsList class={readerDrawerOptionTabsListClass} aria-label="仿真拖拽分区">
              <For each={TEXT_VIEWER_SIMULATION_DRAG_ZONE_OPTIONS}>
                {(percent) => (
                  <TabsTrigger
                    value={String(percent)}
                    class={readerDrawerOptionTabsTriggerClass}
                  >
                    {percent}%
                  </TabsTrigger>
                )}
              </For>
            </TabsList>
          </Tabs>
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
            正文预下载见设置页「阅读体验」；全局容量与清理见设置页「章节正文缓存」。
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
