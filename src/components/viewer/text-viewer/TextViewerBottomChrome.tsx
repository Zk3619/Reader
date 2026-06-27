import { Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import {
  ListIcon,
  SettingsIcon,
  VolumeOnIcon,
} from '@/components/shared/icons';
import { MediaViewerBottomChromeContent } from '@/components/viewer/MediaViewerBottomChromeContent';
import { cn } from '@/lib/utils';
import { textViewerStore } from '@/stores/viewer';
import {
  TEXT_VIEWER_AUTO_READ_SPEED_MAX,
  TEXT_VIEWER_AUTO_READ_SPEED_MIN,
  normalizeAutoReadSpeed,
} from '@/lib/media/text/text-viewer-auto-pager';
import { useMediaViewerChromeFloating } from '@/lib/viewer/viewer-chrome-layout';

export interface TextViewerBottomChromeProps {
  isWideScreen: boolean;
  chapterPos: number;
  chapterIndex: number;
  catalogLength: number;
  onChapterProgressChange: (values: number[]) => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  onOpenCatalog: () => void;
  onReadAloud: () => void;
  readAloudActive: boolean;
  readAloudTooltipSuspended?: boolean;
  onOpenSettings: () => void;
  onOpenReaderMenu: () => void;
  autoPageActive?: boolean | (() => boolean);
  autoReadSpeed?: number | (() => number);
  onAutoReadSpeedChange?: (speed: number) => void;
}

/**
 * 文本阅读器底栏：与 MediaViewerChapterNavFooter 相同封装链
 * MediaViewerFooter → MediaViewerOverlayBottomChrome → MediaViewerBottomChromeContent → 本组件
 */
export function TextViewerBottomChrome(props: TextViewerBottomChromeProps) {
  const floating = useMediaViewerChromeFloating();
  const hideOperationBar = () => props.isWideScreen;
  const pillBtn = () => cn(floating.isFloating() && floating.pillClass());

  const resolveProp = <T,>(value: T | (() => T) | undefined, fallback: T): T => {
    if (value === undefined) return fallback;
    return typeof value === 'function' ? (value as () => T)() : value;
  };

  const autoPageActive = () => resolveProp(props.autoPageActive, false);
  const autoReadSpeed = () => resolveProp(props.autoReadSpeed, normalizeAutoReadSpeed(undefined));
  const progressBarBehavior = () => textViewerStore.state.config.progressBarBehavior ?? 'page';
  const sliderValue = () =>
    progressBarBehavior() === 'chapter' ? props.chapterIndex : props.chapterPos;
  const sliderMax = () =>
    progressBarBehavior() === 'chapter' ? Math.max(0, props.catalogLength - 1) : 1;
  const sliderStep = () => (progressBarBehavior() === 'chapter' ? 1 : 0.01);

  return (
    <MediaViewerBottomChromeContent>
      <Show when={autoPageActive()}>
        <div
          class={cn(
            'flex w-full min-w-0 items-center gap-3 px-4 py-2 text-xs',
            !floating.isFloating() && 'border-b border-border/40',
            floating.isFloating() &&
              cn(
                floating.pillClass(),
                'mx-auto max-w-[min(100%,24rem)]',
                hideOperationBar() && 'mb-2',
              ),
          )}
        >
          <span class="w-14 shrink-0 opacity-80">自动翻页</span>
          <div class="min-w-0 flex-1 basis-0">
            <Slider
              value={[autoReadSpeed()]}
              minValue={TEXT_VIEWER_AUTO_READ_SPEED_MIN}
              maxValue={TEXT_VIEWER_AUTO_READ_SPEED_MAX}
              step={1}
              onChange={(values) => {
                const next = normalizeAutoReadSpeed(values[0]);
                props.onAutoReadSpeedChange?.(next);
              }}
              class="py-1"
            >
              <SliderTrack>
                <SliderFill />
                <SliderThumb />
              </SliderTrack>
            </Slider>
          </div>
          <span class="shrink-0 tabular-nums">{autoReadSpeed()}s</span>
        </div>
      </Show>

      <div
        class={cn(
          'flex flex-col px-4 py-2',
          hideOperationBar() && 'hidden',
        )}
      >
        <div class="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            class={cn('shrink-0 text-xs no-drag', pillBtn())}
            onClick={props.onPrevChapter}
            aria-label="上一章"
          >
            上一章
          </Button>
          <div class="min-w-0 flex-1 px-1">
            <Slider
              value={[sliderValue()]}
              minValue={0}
              maxValue={sliderMax()}
              step={sliderStep()}
              onChange={props.onChapterProgressChange}
              class="py-2"
            >
              <SliderTrack>
                <SliderFill />
                <SliderThumb />
              </SliderTrack>
            </Slider>
          </div>
          <Button
            variant="ghost"
            size="sm"
            class={cn('shrink-0 text-xs no-drag', pillBtn())}
            onClick={props.onNextChapter}
            aria-label="下一章"
          >
            下一章
          </Button>
        </div>
        <div
          class={cn(
            'flex items-center pt-1',
            floating.isFloating() ? 'justify-center gap-2' : 'justify-around',
          )}
        >
          <Button
            variant="ghost"
            size="sm"
            class={cn(
              'flex flex-col items-center gap-0.5 px-3 py-1.5 text-xs no-drag',
              floating.isFloating() ? floating.pillClass() : 'rounded-md',
            )}
            onClick={props.onOpenCatalog}
            aria-label="目录"
          >
            <ListIcon class="h-4 w-4" />
            <span>目录</span>
          </Button>
          <AppTooltip disabled={props.readAloudTooltipSuspended}>
            <AppTooltipTrigger
              as={Button}
              variant="ghost"
              size="sm"
              class={cn(
              'flex flex-col items-center gap-0.5 px-3 py-1.5 text-xs no-drag',
              floating.isFloating() ? floating.pillClass() : 'rounded-md',
            )}
              aria-label="朗读"
              data-reader-aloud-trigger=""
              onClick={props.onReadAloud}
            >
              <VolumeOnIcon class="h-4 w-4" size={16} />
              <span>朗读</span>
            </AppTooltipTrigger>
            <AppTooltipContent layer="viewer">朗读</AppTooltipContent>
          </AppTooltip>
          <Button
            variant="ghost"
            size="sm"
            class={cn(
              'flex flex-col items-center gap-0.5 px-3 py-1.5 text-xs no-drag',
              floating.isFloating() ? floating.pillClass() : 'rounded-md',
            )}
            onClick={props.onOpenSettings}
            aria-label="界面（字号、间距、配色）"
          >
            <span class="text-sm font-normal leading-none" aria-hidden="true">
              Aa
            </span>
            <span>界面</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class={cn(
              'flex flex-col items-center gap-0.5 px-3 py-1.5 text-xs no-drag',
              floating.isFloating() ? floating.pillClass() : 'rounded-md',
            )}
            onClick={props.onOpenReaderMenu}
            aria-label="设置"
          >
            <SettingsIcon class="h-4 w-4" />
            <span>设置</span>
          </Button>
        </div>
      </div>
    </MediaViewerBottomChromeContent>
  );
}
