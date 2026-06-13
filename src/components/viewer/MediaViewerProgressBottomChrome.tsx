import { Show, splitProps, type JSX } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import {
  ViewerAppTooltip,
  ViewerAppTooltipContent,
  ViewerAppTooltipTrigger,
} from '@/components/viewer/viewer-app-overlay';
import { MediaViewerBottomChromeContent } from '@/components/viewer/MediaViewerBottomChromeContent';
import { cn } from '@/lib/utils';
import { mediaViewerChromeBottomRowClass } from '@/components/viewer/viewer-chrome';
import { useMediaViewerChromeFloating } from '@/lib/viewer/viewer-chrome-layout';

export interface MediaViewerProgressBottomChromeProps {
  chapterIndex: number;
  catalogLength: number;
  loading?: boolean;
  /** 状态栏左侧：当前章节标题 */
  chapterTitle?: string;
  /** 状态栏右侧附加信息（本章页码、播放时间等） */
  statusMeta?: JSX.Element;
  /** 状态栏：本章进度 0–100 */
  chapterProgressPercent?: number;
  /** 状态栏：全书进度 0–100 */
  bookProgressPercent?: number;
  /** 是否显示状态栏行 */
  showStatusBar?: boolean;
  /** 进度条取值 0–1 */
  progressValue: number;
  onProgressChange: (values: number[]) => void;
  /** 为 false 时隐藏进度条（如仅一章/一页） */
  showProgressSlider?: boolean;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * 媒体阅读器底栏：对齐 TextViewerBottomChrome
 * 上行状态栏（标题 + 进度百分比），下行「上一章 | 进度条 | 下一章」。
 */
export function MediaViewerProgressBottomChrome(props: MediaViewerProgressBottomChromeProps) {
  const [local] = splitProps(props, [
    'chapterIndex',
    'catalogLength',
    'loading',
    'chapterTitle',
    'statusMeta',
    'chapterProgressPercent',
    'bookProgressPercent',
    'showStatusBar',
    'progressValue',
    'onProgressChange',
    'showProgressSlider',
    'onPrev',
    'onNext',
  ]);

  const floating = useMediaViewerChromeFloating();
  const pillBtn = () => cn(floating.isFloating() && floating.pillClass());
  const showStatus = () => local.showStatusBar !== false;
  const showSlider = () => local.showProgressSlider !== false;
  const bookPercent = () => {
    if (local.bookProgressPercent != null) return local.bookProgressPercent;
    const total = local.catalogLength;
    if (total <= 0) return 0;
    return Math.round(((local.chapterIndex + 1) / total) * 100);
  };
  const chapterPercent = () => local.chapterProgressPercent ?? 0;

  return (
    <MediaViewerBottomChromeContent>
      <Show when={showStatus()}>
        <div
          class={cn(
            mediaViewerChromeBottomRowClass,
            'min-h-9 border-b border-border/40 text-xs',
            floating.isFloating() &&
              cn(floating.pillClass(), 'mx-auto w-fit max-w-[calc(100%-1.5rem)] border-0'),
          )}
        >
          <ViewerAppTooltip>
            <ViewerAppTooltipTrigger as="span" class="min-w-0 flex-1 truncate text-left">
              {local.chapterTitle || '—'}
            </ViewerAppTooltipTrigger>
            <ViewerAppTooltipContent>{local.chapterTitle || '—'}</ViewerAppTooltipContent>
          </ViewerAppTooltip>
          <div class="flex shrink-0 items-center gap-3 tabular-nums text-muted-foreground">
            {local.statusMeta}
            <Show when={local.chapterProgressPercent != null}>
              <span>本章 {chapterPercent()}%</span>
            </Show>
            <span>全书 {bookPercent()}%</span>
          </div>
        </div>
      </Show>

      <div class="flex flex-col px-4 py-2">
        <div class="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            class={cn('shrink-0 text-xs no-drag', pillBtn())}
            disabled={local.chapterIndex <= 0 || local.loading}
            onClick={local.onPrev}
            aria-label="上一章"
          >
            上一章
          </Button>
          <Show
            when={showSlider()}
            fallback={<div class="min-h-9 min-w-0 flex-1" />}
          >
            <div class="min-w-0 flex-1 px-1">
              <Slider
                value={[local.progressValue]}
                minValue={0}
                maxValue={1}
                step={0.001}
                onChange={local.onProgressChange}
                class="py-2"
                disabled={local.loading}
              >
                <SliderTrack>
                  <SliderFill />
                  <SliderThumb />
                </SliderTrack>
              </Slider>
            </div>
          </Show>
          <Button
            variant="ghost"
            size="sm"
            class={cn('shrink-0 text-xs no-drag', pillBtn())}
            disabled={local.chapterIndex >= local.catalogLength - 1 || local.loading}
            onClick={local.onNext}
            aria-label="下一章"
          >
            下一章
          </Button>
        </div>
      </div>
    </MediaViewerBottomChromeContent>
  );
}
