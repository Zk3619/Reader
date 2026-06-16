import { Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  ViewerAppTooltip,
  ViewerAppTooltipContent,
  ViewerAppTooltipTrigger,
} from '@/components/viewer/viewer-app-overlay';
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import {
  ListIcon,
  SettingsIcon,
  VolumeOnIcon,
  VolumeOffIcon,
} from '@/components/shared/icons';
import { MediaViewerBottomChromeContent } from '@/components/viewer/MediaViewerBottomChromeContent';
import { cn } from '@/lib/utils';
import { mediaViewerChromeBottomRowClass } from '@/components/viewer/viewer-chrome';
import { useMediaViewerChromeFloating } from '@/lib/viewer/viewer-chrome-layout';
import { textViewerStore } from '@/stores/viewer';
import {
  TEXT_VIEWER_AUTO_READ_SPEED_MAX,
  TEXT_VIEWER_AUTO_READ_SPEED_MIN,
  normalizeAutoReadSpeed,
} from '@/lib/media/text/text-viewer-auto-pager';

export interface TextViewerBottomChromeProps {
  isWideScreen: boolean;
  /** 窄屏移动端 + 状态栏始终显示时，与阅读主题一致的底栏配色 */
  bottomBarThemeClasses: string | null;
  chapterTitle: string;
  chapterWordCountText: string;
  chapterProgressPercent: number;
  bookProgressPercent: number;
  chapterPos: number;
  onChapterProgressChange: (values: number[]) => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  onOpenCatalog: () => void;
  onReadAloud: () => void;
  readAloudActive: boolean;
  onOpenSettings: () => void;
  onOpenReaderMenu: () => void;
  autoPageActive?: boolean | (() => boolean);
  autoReadSpeed?: number | (() => number);
  onAutoReadSpeedChange?: (speed: number) => void;
}

/**
 * 文本阅读器底栏：与 MediaViewerChapterNavFooter 相同封装链
 * MediaViewerFooter → MediaViewerOverlayBottomChrome → MediaViewerBottomChromeContent → 本组件
 *
 * 顶栏显隐动画只由 overlay 壳层负责；此处仅用 CSS hidden 控制配置/宽屏，不用 Show 卸载节点。
 */
export function TextViewerBottomChrome(props: TextViewerBottomChromeProps) {
  const floating = useMediaViewerChromeFloating();
  const statusBarStyle = () => textViewerStore.state.config.statusBarDisplayStyle;
  const hideStatusBar = () => statusBarStyle() === 'never';
  const hideOperationBar = () => props.isWideScreen;
  const pillBtn = () => cn(floating.isFloating() && floating.pillClass());

  const resolveProp = <T,>(value: T | (() => T) | undefined, fallback: T): T => {
    if (value === undefined) return fallback;
    return typeof value === 'function' ? (value as () => T)() : value;
  };

  const autoPageActive = () => resolveProp(props.autoPageActive, false);
  const autoReadSpeed = () => resolveProp(props.autoReadSpeed, normalizeAutoReadSpeed(undefined));

  return (
    <MediaViewerBottomChromeContent>
      <Show when={autoPageActive()}>
        <div
          class={cn(
            'flex w-full min-w-0 items-center gap-3 px-4 py-2 text-xs',
            props.bottomBarThemeClasses,
            !props.bottomBarThemeClasses &&
              !floating.isFloating() &&
              'border-b border-border/40',
            floating.isFloating() &&
              cn(
                floating.pillClass(),
                'mx-auto max-w-[min(100%,24rem)]',
                hideOperationBar() && 'mb-2',
              ),
          )}
        >
          <span class="w-14 shrink-0 text-muted-foreground">自动翻页</span>
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
          mediaViewerChromeBottomRowClass,
          'min-h-9 text-xs',
          hideStatusBar() && 'hidden',
          props.bottomBarThemeClasses,
          !props.bottomBarThemeClasses &&
            !hideOperationBar() &&
            !floating.isFloating() &&
            'border-b border-border/40',
          floating.isFloating() &&
            cn(floating.pillClass(), 'mx-auto w-fit max-w-[calc(100%-1.5rem)]'),
        )}
      >
        <ViewerAppTooltip>
          <ViewerAppTooltipTrigger as="span" class="min-w-0 flex-1 truncate text-left">
            {props.chapterTitle || '—'}
          </ViewerAppTooltipTrigger>
          <ViewerAppTooltipContent>{props.chapterTitle || '—'}</ViewerAppTooltipContent>
        </ViewerAppTooltip>
        <div class="flex shrink-0 items-center gap-3 tabular-nums">
          <span>
            {props.chapterWordCountText === '—'
              ? '—'
              : `${props.chapterWordCountText}字`}
          </span>
          <span>本章 {props.chapterProgressPercent}%</span>
          <span>全书 {props.bookProgressPercent}%</span>
        </div>
      </div>

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
              value={[props.chapterPos]}
              minValue={0}
              maxValue={1}
              step={0.01}
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
          <ViewerAppTooltip>
            <ViewerAppTooltipTrigger
              as={Button}
              variant="ghost"
              size="sm"
              class={cn(
              'flex flex-col items-center gap-0.5 px-3 py-1.5 text-xs no-drag',
              floating.isFloating() ? floating.pillClass() : 'rounded-md',
            )}
              onClick={props.onReadAloud}
              aria-label="朗读"
            >
              {props.readAloudActive ? (
                <VolumeOffIcon class="h-4 w-4" size={16} />
              ) : (
                <VolumeOnIcon class="h-4 w-4" size={16} />
              )}
              <span>朗读</span>
            </ViewerAppTooltipTrigger>
            <ViewerAppTooltipContent>朗读</ViewerAppTooltipContent>
          </ViewerAppTooltip>
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
