import { Show, splitProps, type JSX } from 'solid-js';
import { Button } from '@/components/ui/button';
import { MediaViewerChromeHoldSlider } from '@/components/media/viewer/MediaViewerChromeHoldSlider';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { MediaViewerBottomChromeContent } from '@/components/media/viewer/MediaViewerBottomChromeContent';
import { cn } from '@/lib/utils';
import {
  mediaViewerChromeBottomPassThroughClass,
  mediaViewerChromeBottomRowClass,
  mediaViewerChromeFloatingBottomPillClass,
  mediaViewerChromeFloatingBottomRowClass,
  mediaViewerChromeFloatingSliderPillClass,
  mediaViewerChromeFloatingStatusPillClass,
  mediaViewerChromeSliderLaneClass,
} from '@/components/media/viewer/viewer-chrome';
import { useMediaViewerChromeFloating } from '@/lib/viewer/viewer-chrome-layout';
import { mergeViewerChromeFloatingCapsuleStyle } from '@/lib/viewer/media-viewer-chrome-overlay-appearance';
import { appThemeBrightnessChrome } from '@/lib/theme/TextViewerTheme';

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
  /**
   * 将「上一章 | 进度条 | 下一章」放在章节名/页数状态栏上方。
   * 漫画阅读默认启用；听书/视频等保持状态栏在上。
   */
  chapterNavAboveStatus?: boolean;
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
 * 默认：上行状态栏（标题 + 进度百分比），下行「上一章 | 进度条 | 下一章」。
 * chapterNavAboveStatus：两行对调（漫画阅读）。
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
    'chapterNavAboveStatus',
    'progressValue',
    'onProgressChange',
    'showProgressSlider',
    'onPrev',
    'onNext',
  ]);

  const floating = useMediaViewerChromeFloating();
  const floatingPill = () =>
    cn(floating.isFloating() && mediaViewerChromeFloatingBottomPillClass);
  const floatingPillStyle = () =>
    floating.isFloating()
      ? mergeViewerChromeFloatingCapsuleStyle(floating.overlaySurfaceStyle(), {
        boxShadow: appThemeBrightnessChrome().capsuleGlow,
      })
      : undefined;
  const showStatus = () => local.showStatusBar !== false;
  const showSlider = () => local.showProgressSlider !== false;
  const navAbove = () => local.chapterNavAboveStatus === true;
  const bookPercent = () => {
    if (local.bookProgressPercent != null) return local.bookProgressPercent;
    const total = local.catalogLength;
    if (total <= 0) return 0;
    return Math.round(((local.chapterIndex + 1) / total) * 100);
  };
  const chapterPercent = () => local.chapterProgressPercent ?? 0;

  const statusMetaNode = () => (
    <div class="flex min-w-0 shrink items-center gap-3 tabular-nums text-muted-foreground">
      {local.statusMeta}
      <Show when={local.chapterProgressPercent != null}>
        <span>本章 {chapterPercent()}%</span>
      </Show>
      <span>全书 {bookPercent()}%</span>
    </div>
  );

  const statusBar = () => (
    <Show when={showStatus()}>
      <Show
        when={floating.isFloating()}
        fallback={
          <div
            class={cn(
              mediaViewerChromeBottomRowClass,
              'min-h-9 text-xs',
              navAbove() ? 'border-t border-border/40' : 'border-b border-border/40',
            )}
          >
            <AppTooltip>
              <AppTooltipTrigger as="span" class="min-w-0 flex-1 truncate text-left">
                {local.chapterTitle || '—'}
              </AppTooltipTrigger>
              <AppTooltipContent layer="viewer">{local.chapterTitle || '—'}</AppTooltipContent>
            </AppTooltip>
            {statusMetaNode()}
          </div>
        }
      >
        <div class={mediaViewerChromeFloatingBottomRowClass}>
          <div class={mediaViewerChromeFloatingStatusPillClass} style={floatingPillStyle()}>
            <AppTooltip>
              <AppTooltipTrigger as="span" class="min-w-0 truncate text-left">
                {local.chapterTitle || '—'}
              </AppTooltipTrigger>
              <AppTooltipContent layer="viewer">{local.chapterTitle || '—'}</AppTooltipContent>
            </AppTooltip>
          </div>
          <div class={mediaViewerChromeFloatingStatusPillClass} style={floatingPillStyle()}>
            {statusMetaNode()}
          </div>
        </div>
      </Show>
    </Show>
  );

  const chapterNav = () => (
    <Show
      when={floating.isFloating()}
      fallback={
        <div class="flex min-w-0 max-w-full flex-col px-4 py-2">
          <div class="flex min-w-0 max-w-full items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              class="shrink-0 text-xs no-drag"
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
              <div class={mediaViewerChromeSliderLaneClass}>
                <MediaViewerChromeHoldSlider
                  value={[local.progressValue]}
                  minValue={0}
                  maxValue={1}
                  step={0.001}
                  onChange={local.onProgressChange}
                  class="py-2"
                  disabled={local.loading}
                />
              </div>
            </Show>
            <Button
              variant="ghost"
              size="sm"
              class="shrink-0 text-xs no-drag"
              disabled={local.chapterIndex >= local.catalogLength - 1 || local.loading}
              onClick={local.onNext}
              aria-label="下一章"
            >
              下一章
            </Button>
          </div>
        </div>
      }
    >
      <div class={mediaViewerChromeFloatingBottomRowClass}>
        <Button
          variant="ghost"
          size="sm"
          class={cn('shrink-0 text-xs no-drag', floatingPill())}
          style={floatingPillStyle()}
          disabled={local.chapterIndex <= 0 || local.loading}
          onClick={local.onPrev}
          aria-label="上一章"
        >
          上一章
        </Button>
        <Show
          when={showSlider()}
          fallback={<div class="min-h-9 min-w-0" />}
        >
          <div class={mediaViewerChromeFloatingSliderPillClass} style={floatingPillStyle()}>
            <div class="min-w-0 w-full overflow-visible">
              <MediaViewerChromeHoldSlider
                value={[local.progressValue]}
                minValue={0}
                maxValue={1}
                step={0.001}
                onChange={local.onProgressChange}
                class="w-full min-w-0 py-1"
                disabled={local.loading}
              />
            </div>
          </div>
        </Show>
        <Button
          variant="ghost"
          size="sm"
          class={cn('shrink-0 text-xs no-drag', floatingPill())}
          style={floatingPillStyle()}
          disabled={local.chapterIndex >= local.catalogLength - 1 || local.loading}
          onClick={local.onNext}
          aria-label="下一章"
        >
          下一章
        </Button>
      </div>
    </Show>
  );

  return (
    <MediaViewerBottomChromeContent
      class={cn(floating.isFloating() && mediaViewerChromeBottomPassThroughClass)}
    >
      <Show when={navAbove()} fallback={
        <>
          {statusBar()}
          {chapterNav()}
        </>
      }>
        {chapterNav()}
        {statusBar()}
      </Show>
    </MediaViewerBottomChromeContent>
  );
}
