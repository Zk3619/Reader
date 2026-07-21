/**
 * 阅读界面设置面板（字号、间距、配色、页眉页脚等）
 */

import { For, Show, createSignal } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import {
  AppSelect,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { ViewerAppSelectContent } from '@/components/media/viewer/viewer-app-overlay';
import type {
  TextViewerUiConfig as ReadConfig,
  TextViewerDualPageMode as ReaderDualPageMode,
  TextViewerLayoutEngine,
} from '@/lib/media/text/reader-ui-config';
import { READER_IMAGE_STYLE_LABELS } from '@/lib/js-engine/legado/legado-image-options';
import { Label } from '@/components/ui/label';
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import { ReaderRemSliderRow } from '@/components/media/viewer/text/ReaderRemSliderRow';
import { Button } from '@/components/ui/button';
import { AppTabs } from '@/components/shared/AppTabs';
import { ViewerChromeLayoutControls } from '@/components/settings/ViewerChromeLayoutControls';
import type { ChineseConverterType } from '@/lib/replace-rules/chinese-converter';
import {
  TEXT_VIEWER_CHINESE_CONVERTER_TYPE_LABELS,
  TEXT_VIEWER_CHINESE_CONVERTER_TYPE_OPTIONS,
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
import {
  TEXT_VIEWER_PAGE_ANIM_LABELS,
  TEXT_VIEWER_PAGE_ANIM_OPTIONS,
  isTextViewerPagedAnim,
} from '@/lib/media/text/text-viewer-page-anim';
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
import { ReaderPageTipControls } from '@/components/media/viewer/text/ReaderPageTipControls';
import {
  READER_FONT_PRESET_IDS,
  READER_FONT_PRESET_LABELS,
  ensureReaderFontFace,
  readerCustomFontFamilyName,
} from '@/lib/media/text/reader-font';
import { formatRem, formatRemFromPx, pxToRem, remToPx } from '@/lib/media/text/reader-rem';
import { cn } from '@/lib/utils';
import { SettingsDrawerSection } from '@/components/media/viewer/SettingsDrawerSection';
import { isTauri } from '@/lib/platform/detect';

const sectionPad = 'px-3 py-2';

export interface ReaderSettingsProps {
  onClose?: () => void;
  /** 是否显示「阅读宽度」项；窄屏+移动端应为 false（正文直接占满宽度） */
  showReadWidth?: () => boolean;
  /** 打开全屏九宫格点击区域配置（与首次进入阅读器相同） */
  onOpenClickRegionalConfig?: () => void;
}

export function ReaderSettings(props: ReaderSettingsProps) {
  const config = () => textViewerStore.state.config;
  const [fontSelectOpen, setFontSelectOpen] = createSignal(false);
  const fontOptions = () => READER_FONT_PRESET_IDS.map(String);

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

  const remDialogValue = (rem: number, unit: 'px' | 'rem') =>
    unit === 'rem' ? rem : remToPx(rem);

  const applyRemDialog = (setter: (rem: number) => void) => (value: number, unit: 'px' | 'rem') => {
    setter(unit === 'rem' ? value : pxToRem(value));
  };

  const pxDialogValue = (px: number, unit: 'px' | 'rem') =>
    unit === 'px' ? px : pxToRem(px);

  const applyPxDialog = (setter: (px: number) => void) => (value: number, unit: 'px' | 'rem') => {
    setter(unit === 'px' ? value : remToPx(value));
  };

  return (
    <div class="flex w-full min-w-0 flex-col gap-1 pb-2">
      <SettingsDrawerSection title="界面与主题">
        <div class={sectionPad}>
          <Label>顶栏与底栏布局</Label>
          <p class="mt-1 text-xs text-muted-foreground">
            固定、层叠或悬浮；仅对本文本阅读器生效，与应用全局设置相互独立。
          </p>
          <div class="mt-2">
            <ViewerChromeLayoutControls
              variant="drawer"
              value={() => config().viewerChromeLayout}
              onChange={(layout) => setConfig({ viewerChromeLayout: layout })}
            />
          </div>
        </div>
        <div class={cn(sectionPad, 'space-y-2')}>
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
      </SettingsDrawerSection>

      <SettingsDrawerSection title="字体与正文">
        <div class={cn(sectionPad, 'space-y-3')}>
          <div class="space-y-2">
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
        </div>
        <ReaderRemSliderRow
          class={sectionPad}
          label="字体大小"
          valueLabel={formatRemFromPx(config().fontSize)}
          sliderValue={pxToRem(config().fontSize)}
          minValue={0.75}
          maxValue={2}
          step={0.0625}
          onSliderChange={(v) => setConfig({ fontSize: remToPx(v) })}
          getDialogValue={(unit) => pxDialogValue(config().fontSize, unit)}
          onDialogApply={applyPxDialog((v) => setConfig({ fontSize: v }))}
        />
        <div class={cn(sectionPad, 'space-y-2')}>
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
        <ReaderRemSliderRow
          class={sectionPad}
          label="行距"
          valueLabel={formatRem(config().spacing.line)}
          sliderValue={config().spacing.line}
          minValue={0.5}
          maxValue={2.5}
          step={0.1}
          onSliderChange={(v) => setSpacing('line', v)}
          getDialogValue={(unit) => remDialogValue(config().spacing.line, unit)}
          onDialogApply={applyRemDialog((v) => setSpacing('line', v))}
        />
        <ReaderRemSliderRow
          class={sectionPad}
          label="字间距"
          valueLabel={formatRem(config().spacing.letter)}
          sliderValue={config().spacing.letter}
          minValue={0}
          maxValue={0.2}
          step={0.01}
          onSliderChange={(v) => setSpacing('letter', v)}
          getDialogValue={(unit) => remDialogValue(config().spacing.letter, unit)}
          onDialogApply={applyRemDialog((v) => setSpacing('letter', v))}
        />
        <ReaderRemSliderRow
          class={sectionPad}
          label="段距"
          valueLabel={formatRem(config().spacing.paragraph)}
          sliderValue={config().spacing.paragraph}
          minValue={0}
          maxValue={2}
          step={0.1}
          onSliderChange={(v) => setSpacing('paragraph', v)}
          getDialogValue={(unit) => remDialogValue(config().spacing.paragraph, unit)}
          onDialogApply={applyRemDialog((v) => setSpacing('paragraph', v))}
        />
        <div class={cn(sectionPad, 'space-y-2')}>
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
        <AppTabs
          layout="stacked"
          variant="drawer"
          class={sectionPad}
          label="简繁转换"
          value={String(config().chineseConverterType ?? 0)}
          options={TEXT_VIEWER_CHINESE_CONVERTER_TYPE_OPTIONS.map(String)}
          labels={Object.fromEntries(
            TEXT_VIEWER_CHINESE_CONVERTER_TYPE_OPTIONS.map((type) => [
              String(type),
              TEXT_VIEWER_CHINESE_CONVERTER_TYPE_LABELS[type],
            ]),
          ) as Record<string, string>}
          ariaLabel="简繁转换"
          onChange={(value) => {
            void textViewerStore
              .setChineseConverterType(Number(value) as ChineseConverterType)
              .catch(() => undefined);
          }}
        />
      </SettingsDrawerSection>

      <SettingsDrawerSection title="章节标题">
        <AppTabs
          layout="stacked"
          variant="drawer"
          class={sectionPad}
          label="章节标题"
          description="控制章节名在阅读视图中的位置与间距；间距会随字号、行距、字距、段距变化。"
          value={config().chapterTitleStyle ?? 'center'}
          options={TEXT_VIEWER_CHAPTER_TITLE_STYLE_OPTIONS}
          labels={TEXT_VIEWER_CHAPTER_TITLE_STYLE_LABELS}
          ariaLabel="章节标题渲染"
          onChange={(value) =>
            setConfig({ chapterTitleStyle: value as TextViewerChapterTitleStyle })
          }
        />
        <ReaderRemSliderRow
          class={sectionPad}
          label="标题字号增量"
          valueLabel={formatRem(config().chapterTitleSize ?? 0)}
          sliderValue={config().chapterTitleSize ?? 0}
          minValue={0}
          maxValue={1.5}
          step={0.0625}
          onSliderChange={(v) => setConfig({ chapterTitleSize: v })}
          getDialogValue={(unit) => remDialogValue(config().chapterTitleSize ?? 0, unit)}
          onDialogApply={applyRemDialog((v) => setConfig({ chapterTitleSize: v }))}
        />
        <ReaderRemSliderRow
          class={sectionPad}
          label="标题上间距"
          valueLabel={formatRem(config().chapterTitleTopSpacing ?? 0)}
          sliderValue={config().chapterTitleTopSpacing ?? 0}
          minValue={0}
          maxValue={3}
          step={0.125}
          onSliderChange={(v) => setConfig({ chapterTitleTopSpacing: v })}
          getDialogValue={(unit) => remDialogValue(config().chapterTitleTopSpacing ?? 0, unit)}
          onDialogApply={applyRemDialog((v) => setConfig({ chapterTitleTopSpacing: v }))}
        />
        <ReaderRemSliderRow
          class={sectionPad}
          label="标题下间距"
          valueLabel={formatRem(config().chapterTitleBottomSpacing ?? 0)}
          sliderValue={config().chapterTitleBottomSpacing ?? 0}
          minValue={0}
          maxValue={3}
          step={0.125}
          onSliderChange={(v) => setConfig({ chapterTitleBottomSpacing: v })}
          getDialogValue={(unit) => remDialogValue(config().chapterTitleBottomSpacing ?? 0, unit)}
          onDialogApply={applyRemDialog((v) => setConfig({ chapterTitleBottomSpacing: v }))}
        />
        <div class={cn(sectionPad, 'space-y-2')}>
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
      </SettingsDrawerSection>

      <SettingsDrawerSection title="页面与边距">
        <Show when={props.showReadWidth?.() ?? true}>
          <ReaderRemSliderRow
            class={sectionPad}
            label="阅读宽度"
            valueLabel={formatRemFromPx(config().readWidth)}
            sliderValue={pxToRem(config().readWidth)}
            minValue={25}
            maxValue={75}
            step={0.5}
            onSliderChange={(v) => setConfig({ readWidth: remToPx(v) })}
            getDialogValue={(unit) => pxDialogValue(config().readWidth, unit)}
            onDialogApply={applyPxDialog((v) => setConfig({ readWidth: v }))}
          />
        </Show>
        <div class={sectionPad}>
          <Label>边距</Label>
          <p class="mt-1 text-xs text-muted-foreground">
            四边间距由 content-slot 统一控制；按页双页阅读时可设置列间中心间距。
          </p>
        </div>
        <ReaderRemSliderRow
          class={sectionPad}
          label="左侧"
          valueLabel={formatRemFromPx(config().contentInset.left)}
          sliderValue={pxToRem(config().contentInset.left)}
          minValue={0}
          maxValue={12.5}
          step={0.125}
          onSliderChange={(v) => setContentInset('left', remToPx(v))}
          getDialogValue={(unit) => pxDialogValue(config().contentInset.left, unit)}
          onDialogApply={applyPxDialog((v) => setContentInset('left', v))}
        />
        <ReaderRemSliderRow
          class={sectionPad}
          label="右侧"
          valueLabel={formatRemFromPx(config().contentInset.right)}
          sliderValue={pxToRem(config().contentInset.right)}
          minValue={0}
          maxValue={12.5}
          step={0.125}
          onSliderChange={(v) => setContentInset('right', remToPx(v))}
          getDialogValue={(unit) => pxDialogValue(config().contentInset.right, unit)}
          onDialogApply={applyPxDialog((v) => setContentInset('right', v))}
        />
        <ReaderRemSliderRow
          class={sectionPad}
          label="顶部"
          valueLabel={formatRemFromPx(config().contentInset.top)}
          sliderValue={pxToRem(config().contentInset.top)}
          minValue={0}
          maxValue={7.5}
          step={0.125}
          onSliderChange={(v) => setContentInset('top', remToPx(v))}
          getDialogValue={(unit) => pxDialogValue(config().contentInset.top, unit)}
          onDialogApply={applyPxDialog((v) => setContentInset('top', v))}
        />
        <ReaderRemSliderRow
          class={sectionPad}
          label="底部"
          valueLabel={formatRemFromPx(config().contentInset.bottom)}
          sliderValue={pxToRem(config().contentInset.bottom)}
          minValue={0}
          maxValue={7.5}
          step={0.125}
          onSliderChange={(v) => setContentInset('bottom', remToPx(v))}
          getDialogValue={(unit) => pxDialogValue(config().contentInset.bottom, unit)}
          onDialogApply={applyPxDialog((v) => setContentInset('bottom', v))}
        />
        <Show when={dualPageMiddleVisible()}>
          <ReaderRemSliderRow
            class={sectionPad}
            label="中心间距"
            valueLabel={formatRemFromPx(config().contentInset.center)}
            sliderValue={pxToRem(config().contentInset.center)}
            minValue={0}
            maxValue={25}
            step={0.125}
            onSliderChange={(v) => setContentInset('center', remToPx(v))}
            getDialogValue={(unit) => pxDialogValue(config().contentInset.center, unit)}
            onDialogApply={applyPxDialog((v) => setContentInset('center', v))}
          />
        </Show>
      </SettingsDrawerSection>

      <SettingsDrawerSection title="页眉页脚">
        <div class={sectionPad}>
          <ReaderPageTipControls tips={() => config().pageTips} onChange={setPageTips} />
        </div>
      </SettingsDrawerSection>

      <SettingsDrawerSection title="翻页与排版">
        <AppTabs
          layout="stacked"
          variant="drawer"
          class={sectionPad}
          label="翻页模式"
          description="滚动为连续阅读；其余模式按页翻页，可拖拽或点击换页。覆盖：当前页盖住新页；滑动：两页并排平移；仿真：折页。"
          value={config().pageAnim}
          options={TEXT_VIEWER_PAGE_ANIM_OPTIONS}
          labels={TEXT_VIEWER_PAGE_ANIM_LABELS}
          ariaLabel="翻页模式"
          onChange={(value) => setConfig({ pageAnim: value as TextViewerPageAnim })}
        />
        <Show when={isTextViewerPagedAnim(config().pageAnim)}>
          <div class={sectionPad}>
            <Label>翻页动画速度</Label>
            <p class="mt-1 text-xs text-muted-foreground">
              毫秒；数值越小动画越快（约 80–1200，默认 320）。
            </p>
            <div class="mt-2 flex items-center gap-3">
              <Slider
                class="flex-1"
                minValue={80}
                maxValue={1200}
                step={20}
                value={[config().pageTurnDurationMs ?? 320]}
                onChange={(v) =>
                  setConfig({ pageTurnDurationMs: Math.round(v[0] ?? 320) })
                }
              >
                <SliderTrack>
                  <SliderFill />
                  <SliderThumb />
                </SliderTrack>
              </Slider>
              <span class="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {config().pageTurnDurationMs ?? 320}
              </span>
            </div>
          </div>
          <AppTabs
            layout="stacked"
            variant="drawer"
            class={sectionPad}
            label="双页阅读"
            description={`宽屏下分栏显示；「自动」在视口 ≥${TEXT_VIEWER_DUAL_PAGE_XL_MIN_WIDTH_PX}px 或横屏时启用（按页模式）。`}
            value={config().dualPage}
            options={['off', 'auto', 'always'] as const}
            labels={TEXT_VIEWER_DUAL_PAGE_MODE_LABELS}
            ariaLabel="双页阅读"
            onChange={(value) => setConfig({ dualPage: value as ReaderDualPageMode })}
          />
          <AppTabs
            layout="stacked"
            variant="drawer"
            class={sectionPad}
            label="排版引擎"
            description="Pretext 为实验性无 DOM 行测量方案，翻页更流畅；DOM 为推荐的经典 measure-host 方案。两端对齐章节字级坐标仍依赖 DOM。"
            value={config().layoutEngine}
            options={['pretext', 'dom'] as const}
            labels={TEXT_VIEWER_LAYOUT_ENGINE_LABELS}
            ariaLabel="排版引擎"
            onChange={(value) => onLayoutEngineChange(value as TextViewerLayoutEngine)}
          />
          <div class={sectionPad}>
            <Label>点击区域</Label>
            <p class="mt-1 text-xs text-muted-foreground">
              全屏配置九宫格分区与动作；滚动模式下单击/双击切换顶底栏。
            </p>
            <Button
              variant="outline"
              class="mt-2 w-full"
              onClick={() => {
                props.onOpenClickRegionalConfig?.();
                props.onClose?.();
              }}
            >
              点击区域设置
            </Button>
          </div>
          <div class={cn(sectionPad, 'space-y-2')}>
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
          <AppTabs
            layout="stacked"
            variant="drawer"
            class={sectionPad}
            label="仿真拖拽分区"
            description="左侧区域仅翻上一页，右侧区域仅翻下一页。调节左右分区宽度（占视口比例）。"
            value={String(config().simulationDragZonePercent)}
            options={TEXT_VIEWER_SIMULATION_DRAG_ZONE_OPTIONS.map(String)}
            labels={Object.fromEntries(
              TEXT_VIEWER_SIMULATION_DRAG_ZONE_OPTIONS.map((percent) => [
                String(percent),
                `${percent}%`,
              ]),
            )}
            ariaLabel="仿真拖拽分区"
            onChange={(value) =>
              setConfig({
                simulationDragZonePercent: Number(value) as TextViewerSimulationDragZonePercent,
              })
            }
          />
        </Show>
      </SettingsDrawerSection>

      <SettingsDrawerSection title="插图">
        <AppTabs
          layout="stacked"
          variant="drawer"
          class={sectionPad}
          label="插图样式"
          value={config().imageStyle}
          options={['DEFAULT', 'FULL', 'TEXT', 'SINGLE'] as const}
          labels={READER_IMAGE_STYLE_LABELS}
          ariaLabel="插图样式"
          onChange={(value) => setConfig({ imageStyle: value as TextViewerImageStyle })}
        />
      </SettingsDrawerSection>

      <SettingsDrawerSection title="其他">
        <div class={sectionPad}>
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
      </SettingsDrawerSection>
    </div>
  );
}
