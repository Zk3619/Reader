import { Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from '@/components/ui/switch';
import { AppTabs } from '@/components/shared/AppTabs';
import {
  defaultImageViewerUiConfig,
  IMAGE_VIEWER_ESTIMATED_PAGE_HEIGHT_MAX,
  IMAGE_VIEWER_ESTIMATED_PAGE_HEIGHT_MIN,
  IMAGE_VIEWER_MANGA_PRELOAD_MAX,
  IMAGE_VIEWER_MANGA_PRELOAD_MIN,
  IMAGE_VIEWER_PAGED_PRELOAD_MAX,
  IMAGE_VIEWER_PAGED_PRELOAD_MIN,
  type ImageViewerReadingMode,
  type ImageViewerUiConfig,
} from '@/lib/media/image/image-viewer-ui-config';
import { ViewerChromeLayoutControls } from '@/components/settings/ViewerChromeLayoutControls';
import { ChapterBodyPrefetchControls } from '@/components/viewer/ChapterBodyPrefetchControls';
import { SettingsDrawerSection } from '@/components/viewer/SettingsDrawerSection';
import { cn } from '@/lib/utils';
import { ZoomIn, ZoomOut } from 'lucide-solid';

const IMAGE_VIEWER_SCALE_MIN = 0.5;
const IMAGE_VIEWER_SCALE_MAX = 2;
const IMAGE_VIEWER_SCALE_STEP = 0.05;

const READING_MODE_LABELS: Record<ImageViewerReadingMode, string> = {
  scroll: '滚动',
  paged: '翻页',
};

const sectionPad = 'px-3 py-2';

function clampContentScale(value: number): number {
  return Math.min(IMAGE_VIEWER_SCALE_MAX, Math.max(IMAGE_VIEWER_SCALE_MIN, value));
}

export interface ImageViewerSettingsProps {
  config: () => ImageViewerUiConfig;
  onChange: (patch: Partial<ImageViewerUiConfig>) => void;
  onClose?: () => void;
  /** 打开全屏九宫格点击区域配置（翻页模式） */
  onOpenClickRegionalConfig?: () => void;
}

export function ImageViewerSettings(props: ImageViewerSettingsProps) {
  const setConfig = (patch: Partial<ImageViewerUiConfig>) => {
    props.onChange(patch);
  };

  const nudgeContentScale = (delta: number) => {
    setConfig({
      contentScale: clampContentScale(props.config().contentScale + delta),
    });
  };

  return (
    <div class="flex w-full min-w-0 flex-col gap-1 pb-2">
      <SettingsDrawerSection title="阅读模式">
        <AppTabs
          layout="stacked"
          variant="drawer"
          class={sectionPad}
          label="阅读模式"
          hint="滚动为纵向连续阅读，单击切换顶底栏；翻页为单张全屏切换，支持九宫格点击区域。"
          value={props.config().readingMode}
          options={['scroll', 'paged'] as const}
          labels={READING_MODE_LABELS}
          ariaLabel="阅读模式"
          onChange={(value) => setConfig({ readingMode: value as ImageViewerReadingMode })}
        />
      </SettingsDrawerSection>

      <SettingsDrawerSection title="界面布局">
        <div class={sectionPad}>
          <Label>顶栏与底栏布局</Label>
          <p class="mt-1 text-xs text-muted-foreground">
            固定、层叠或悬浮；仅对本漫画阅读器生效，与应用全局设置相互独立。
          </p>
          <div class="mt-2">
            <ViewerChromeLayoutControls
              variant="drawer"
              value={() => props.config().viewerChromeLayout}
              onChange={(layout) => setConfig({ viewerChromeLayout: layout })}
            />
          </div>
        </div>
      </SettingsDrawerSection>

      <SettingsDrawerSection title="预加载与缓存">
        <div class={cn(sectionPad, 'space-y-2')}>
          <div class="flex items-center justify-between">
            <Label>章内预加载</Label>
            <span class="text-sm tabular-nums text-muted-foreground">
              {props.config().mangaPreDownloadNum} 页
            </span>
          </div>
          <p class="text-xs text-muted-foreground">
            向前预加载图片页数（对齐 Legado mangaPreDownloadNum）。大于 0 时缩小 IO
            懒加载边距、改由预取负责向前拉取。
          </p>
          <Slider
            class="py-2"
            value={[props.config().mangaPreDownloadNum]}
            minValue={IMAGE_VIEWER_MANGA_PRELOAD_MIN}
            maxValue={IMAGE_VIEWER_MANGA_PRELOAD_MAX}
            step={1}
            onChange={(values) =>
              setConfig({
                mangaPreDownloadNum: Math.round(
                  values[0] ?? props.config().mangaPreDownloadNum,
                ),
              })
            }
          >
            <SliderTrack>
              <SliderFill />
              <SliderThumb />
            </SliderTrack>
          </Slider>
        </div>

        <Show when={props.config().readingMode === 'paged'}>
          <div class={cn(sectionPad, 'space-y-2')}>
            <div class="flex items-center justify-between">
              <Label>翻页预加载上限</Label>
              <span class="text-sm tabular-nums text-muted-foreground">
                {props.config().mangaPagedPreDownloadNum} 页
              </span>
            </div>
            <p class="text-xs text-muted-foreground">
              翻页模式下章内向前预取的上限（对齐 Legado Preloader，通常 3–5 页），不超过章内预加载总数。
            </p>
            <Slider
              class="py-2"
              value={[props.config().mangaPagedPreDownloadNum]}
              minValue={IMAGE_VIEWER_PAGED_PRELOAD_MIN}
              maxValue={IMAGE_VIEWER_PAGED_PRELOAD_MAX}
              step={1}
              onChange={(values) =>
                setConfig({
                  mangaPagedPreDownloadNum: Math.round(
                    values[0] ?? props.config().mangaPagedPreDownloadNum,
                  ),
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

        <div class={cn(sectionPad, 'space-y-2')}>
          <ChapterBodyPrefetchControls viewer="manga" />
        </div>

        <div class={cn(sectionPad, 'flex items-center justify-between gap-4')}>
          <div class="min-w-0 flex-1 space-y-0.5">
            <Label>阅读时写入磁盘缓存</Label>
            <p class="text-xs text-muted-foreground">
              开启后阅读也会缓存图片到本地（便于离线）；关闭则仅内存+网络，更贴近 Legado 正常阅读。
            </p>
          </div>
          <Switch
            checked={props.config().mangaDiskCacheWhileReading}
            onChange={(v) => setConfig({ mangaDiskCacheWhileReading: v })}
          >
            <SwitchControl>
              <SwitchThumb />
            </SwitchControl>
            <SwitchLabel class="sr-only">阅读时写入磁盘缓存</SwitchLabel>
          </Switch>
        </div>
      </SettingsDrawerSection>

      <Show when={props.config().readingMode === 'paged'}>
        <SettingsDrawerSection title="翻页">
          <div class={sectionPad}>
            <Label>点击区域</Label>
            <p class="mt-1 text-xs text-muted-foreground">
              全屏配置九宫格分区与动作，与文本阅读器翻页模式一致。
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
        </SettingsDrawerSection>
      </Show>

      <SettingsDrawerSection title="显示">
        <div class={cn(sectionPad, 'space-y-2')}>
          <div class="flex items-center justify-between">
            <Label>预估单页高度</Label>
            <span class="text-sm tabular-nums text-muted-foreground">
              {props.config().mangaEstimatedPageHeightPx} px
            </span>
          </div>
          <p class="text-xs text-muted-foreground">
            用于滚动模式懒加载边距估算；页高差异大时可适当调高。
          </p>
          <Slider
            class="py-2"
            value={[props.config().mangaEstimatedPageHeightPx]}
            minValue={IMAGE_VIEWER_ESTIMATED_PAGE_HEIGHT_MIN}
            maxValue={IMAGE_VIEWER_ESTIMATED_PAGE_HEIGHT_MAX}
            step={50}
            onChange={(values) =>
              setConfig({
                mangaEstimatedPageHeightPx: Math.round(
                  values[0] ?? props.config().mangaEstimatedPageHeightPx,
                ),
              })
            }
          >
            <SliderTrack>
              <SliderFill />
              <SliderThumb />
            </SliderTrack>
          </Slider>
        </div>

        <div class={cn(sectionPad, 'space-y-2')}>
          <div class="flex items-center justify-between">
            <Label>内容缩放</Label>
            <span class="text-sm tabular-nums text-muted-foreground">
              {Math.round(props.config().contentScale * 100)}%
            </span>
          </div>
          <p class="text-xs text-muted-foreground">
            滚动模式限制最大宽度；翻页模式以视口高度为基准，100% 为默认高度。
          </p>
          <div class="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              class="shrink-0"
              aria-label="缩小"
              disabled={props.config().contentScale <= IMAGE_VIEWER_SCALE_MIN}
              onClick={() => nudgeContentScale(-IMAGE_VIEWER_SCALE_STEP)}
            >
              <ZoomOut class="h-4 w-4" />
            </Button>
            <Slider
              class="min-w-0 flex-1 py-2"
              value={[props.config().contentScale]}
              minValue={IMAGE_VIEWER_SCALE_MIN}
              maxValue={IMAGE_VIEWER_SCALE_MAX}
              step={IMAGE_VIEWER_SCALE_STEP}
              onChange={(values) =>
                setConfig({
                  contentScale: clampContentScale(
                    values[0] ?? props.config().contentScale,
                  ),
                })
              }
            >
              <SliderTrack>
                <SliderFill />
                <SliderThumb />
              </SliderTrack>
            </Slider>
            <Button
              variant="outline"
              size="icon"
              class="shrink-0"
              aria-label="放大"
              disabled={props.config().contentScale >= IMAGE_VIEWER_SCALE_MAX}
              onClick={() => nudgeContentScale(IMAGE_VIEWER_SCALE_STEP)}
            >
              <ZoomIn class="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SettingsDrawerSection>

      <SettingsDrawerSection title="其他">
        <div class={sectionPad}>
          <Button
            variant="outline"
            class="w-full"
            onClick={() => {
              props.onChange(defaultImageViewerUiConfig);
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
