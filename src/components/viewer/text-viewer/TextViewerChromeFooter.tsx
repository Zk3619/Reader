import { Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import {
  ListIcon,
  SettingsIcon,
  VolumeOnIcon,
  VolumeOffIcon,
} from '@/components/shared/icons';
import { cn } from '@/lib/utils';

export interface TextViewerChromeFooterProps {
  isWideScreen: boolean;
  statusBarVisible: boolean;
  operationBarVisible: boolean;
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
}

/** 文本阅读器底栏：进度状态栏 + 窄屏操作栏（外层显隐由 MediaViewerFooter 控制） */
export function TextViewerChromeFooter(props: TextViewerChromeFooterProps) {
  return (
    <>
      <div
        class={cn(
          'reader-bottom-bar flex h-9 shrink-0 items-center justify-between gap-3 px-4 text-xs',
          props.isWideScreen && 'safe-area-inset-bottom',
          props.bottomBarThemeClasses ??
            'border-t border-border/50 bg-background/95 text-muted-foreground backdrop-blur',
          !props.statusBarVisible && 'reader-bar-hidden',
        )}
      >
        <Tooltip>
          <TooltipTrigger as="span" class="min-w-0 flex-1 truncate text-left">
            {props.chapterTitle || '—'}
          </TooltipTrigger>
          <TooltipContent>{props.chapterTitle || '—'}</TooltipContent>
        </Tooltip>
        <div class="flex shrink-0 items-center gap-3">
          <span>
            {props.chapterWordCountText === '—'
              ? '—'
              : `${props.chapterWordCountText}字`}
          </span>
          <span>本章 {props.chapterProgressPercent}%</span>
          <span>全书 {props.bookProgressPercent}%</span>
        </div>
      </div>
      <Show when={!props.isWideScreen}>
        <div
          class={cn(
            'reader-control-bar flex shrink-0 flex-col border-t border-border/50 bg-background/95 px-3 py-2 text-muted-foreground backdrop-blur safe-area-inset-bottom',
            !props.operationBarVisible && 'reader-bar-hidden',
          )}
        >
          <div class="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              class="shrink-0 text-xs no-drag"
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
              class="shrink-0 text-xs no-drag"
              onClick={props.onNextChapter}
              aria-label="下一章"
            >
              下一章
            </Button>
          </div>
          <div class="flex items-center justify-around pt-1">
            <Button
              variant="ghost"
              size="sm"
              class="flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-xs no-drag"
              onClick={props.onOpenCatalog}
              aria-label="目录"
            >
              <ListIcon class="h-4 w-4" />
              <span>目录</span>
            </Button>
            <Tooltip>
              <TooltipTrigger
                as={Button}
                variant="ghost"
                size="sm"
                class="flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-xs no-drag"
                onClick={props.onReadAloud}
                aria-label="朗读"
              >
                {props.readAloudActive ? (
                  <VolumeOffIcon class="h-4 w-4" size={16} />
                ) : (
                  <VolumeOnIcon class="h-4 w-4" size={16} />
                )}
                <span>朗读</span>
              </TooltipTrigger>
              <TooltipContent>朗读</TooltipContent>
            </Tooltip>
            <Button
              variant="ghost"
              size="sm"
              class="flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-xs no-drag"
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
              class="flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-xs no-drag"
              onClick={props.onOpenReaderMenu}
              aria-label="设置"
            >
              <SettingsIcon class="h-4 w-4" />
              <span>设置</span>
            </Button>
          </div>
        </div>
      </Show>
    </>
  );
}
