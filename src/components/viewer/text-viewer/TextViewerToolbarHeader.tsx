import { Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMediaViewerChromeFloating } from '@/lib/viewer/viewer-chrome-layout';
import { Toggle } from '@/components/ui/toggle';
import {
  ViewerAppTooltip,
  ViewerAppTooltipContent,
  ViewerAppTooltipTrigger,
} from '@/components/viewer/viewer-app-overlay';
import { Separator } from '@/components/ui/separator';
import { WindowControlButtons } from '@/components/shell/WindowControlButtons';
import {
  ChevronLeftIcon,
  ListIcon,
  SettingsIcon,
  RefreshIcon,
  MoreIcon,
  ReplaceIcon,
  DownloadIcon,
  VolumeOnIcon,
  VolumeOffIcon,
  ThemeLightIcon,
  ThemeDarkIcon,
} from '@/components/shared/icons';
import { isMobile, isTauri } from '@/lib/platform/detect';

export interface TextViewerToolbarHeaderProps {
  bookName: string;
  onClose: () => void;
  onOpenBookInfo?: () => void;
  isWideScreen: boolean;
  readAloudActive: boolean;
  isDark: boolean;
  onToggleTheme: (pressed: boolean) => void;
  onOpenCatalog: () => void;
  onReadAloud: () => void;
  onOpenSettings: () => void;
  onOpenReaderMenu: () => void;
  onChangeSource: () => void;
  onRefreshChapter: () => void;
  onOpenOfflineCache: () => void;
  onOpenMoreMenu: () => void;
}

/** 文本阅读器顶栏业务内容（布局由 MediaViewerHeader 提供） */
export function TextViewerToolbarHeader(props: TextViewerToolbarHeaderProps) {
  const floating = useMediaViewerChromeFloating();
  const iconBtn = () => cn('no-drag', floating.iconButtonClass());
  const titleClass = () =>
    cn(
      'min-w-0 max-w-[40%] truncate text-sm font-medium text-foreground',
      floating.isFloating() && floating.pillClass(),
      floating.isFloating() && 'px-3 py-1.5 no-drag',
    );

  return (
    <>
      <ViewerAppTooltip>
        <ViewerAppTooltipTrigger
          as={Button}
          variant="ghost"
          size="icon"
          class={iconBtn()}
          onClick={props.onClose}
          aria-label="关闭阅读器"
        >
          <ChevronLeftIcon class="size-5" />
        </ViewerAppTooltipTrigger>
        <ViewerAppTooltipContent>关闭阅读器</ViewerAppTooltipContent>
      </ViewerAppTooltip>
      <Show
        when={props.onOpenBookInfo}
        fallback={
          <h1 class={titleClass()} data-tauri-drag-region>
            {props.bookName || '—'}
          </h1>
        }
      >
        <ViewerAppTooltip>
          <ViewerAppTooltipTrigger
            as="button"
            type="button"
            class={cn(
              titleClass(),
              'text-left transition-colors cursor-pointer hover:text-primary',
            )}
            onClick={() => props.onOpenBookInfo!()}
            aria-label="进入书籍信息页"
          >
            {props.bookName || '—'}
          </ViewerAppTooltipTrigger>
          <ViewerAppTooltipContent>书籍信息</ViewerAppTooltipContent>
        </ViewerAppTooltip>
      </Show>
      <Show when={!floating.isFloating()}>
        <div class="min-w-0 flex-1" data-tauri-drag-region />
      </Show>
      <div
        class={cn(
          'flex shrink-0 items-center gap-0.5 no-drag',
          floating.isFloating() && 'ml-auto',
        )}
      >
      <Show when={props.isWideScreen}>
        <ViewerAppTooltip>
          <ViewerAppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class={iconBtn()}
            onClick={(e) => {
              e.stopPropagation();
              props.onOpenCatalog();
            }}
            aria-label="目录"
          >
            <ListIcon class="size-5" />
          </ViewerAppTooltipTrigger>
          <ViewerAppTooltipContent>目录</ViewerAppTooltipContent>
        </ViewerAppTooltip>
        <ViewerAppTooltip>
          <ViewerAppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class={iconBtn()}
            onClick={props.onReadAloud}
            aria-label="朗读"
          >
            {props.readAloudActive ? (
              <VolumeOffIcon class="size-5" size={20} />
            ) : (
              <VolumeOnIcon class="size-5" size={20} />
            )}
          </ViewerAppTooltipTrigger>
          <ViewerAppTooltipContent>朗读</ViewerAppTooltipContent>
        </ViewerAppTooltip>
        <ViewerAppTooltip>
          <ViewerAppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class={iconBtn()}
            onClick={props.onOpenSettings}
            aria-label="界面（字号、间距、配色）"
          >
            <span class="text-base font-normal leading-none" aria-hidden="true">
              Aa
            </span>
          </ViewerAppTooltipTrigger>
          <ViewerAppTooltipContent>界面</ViewerAppTooltipContent>
        </ViewerAppTooltip>
        <ViewerAppTooltip>
          <ViewerAppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class={iconBtn()}
            onClick={props.onOpenReaderMenu}
            aria-label="设置"
          >
            <SettingsIcon class="size-5" />
          </ViewerAppTooltipTrigger>
          <ViewerAppTooltipContent>设置</ViewerAppTooltipContent>
        </ViewerAppTooltip>
      </Show>
        <ViewerAppTooltip>
          <ViewerAppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class={iconBtn()}
            onClick={props.onChangeSource}
            aria-label="换源"
          >
            <ReplaceIcon class="size-5" />
          </ViewerAppTooltipTrigger>
          <ViewerAppTooltipContent>换源</ViewerAppTooltipContent>
        </ViewerAppTooltip>
        <ViewerAppTooltip>
          <ViewerAppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class={iconBtn()}
            onClick={props.onRefreshChapter}
            aria-label="刷新当前章节"
          >
            <RefreshIcon class="size-5" />
          </ViewerAppTooltipTrigger>
          <ViewerAppTooltipContent>刷新</ViewerAppTooltipContent>
        </ViewerAppTooltip>
        <ViewerAppTooltip>
          <ViewerAppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class={iconBtn()}
            onClick={props.onOpenOfflineCache}
            aria-label="离线缓存"
          >
            <DownloadIcon class="size-5" />
          </ViewerAppTooltipTrigger>
          <ViewerAppTooltipContent>离线缓存</ViewerAppTooltipContent>
        </ViewerAppTooltip>
        <ViewerAppTooltip>
          <ViewerAppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class={iconBtn()}
            onClick={props.onOpenMoreMenu}
            aria-label="更多"
          >
            <MoreIcon class="size-5" />
          </ViewerAppTooltipTrigger>
          <ViewerAppTooltipContent>更多</ViewerAppTooltipContent>
        </ViewerAppTooltip>
      <Show when={isTauri() && !isMobile() && !floating.isFloating()}>
        <Separator orientation="vertical" class="mx-2 h-6 no-drag" />
      </Show>
      <div class="flex items-center gap-2 no-drag">
        <ViewerAppTooltip>
          <ViewerAppTooltipTrigger as="div">
            <Toggle
              pressed={props.isDark}
              onChange={props.onToggleTheme}
              variant="default"
              size="default"
              class={cn(
                'h-9 w-9 p-0 transition-colors',
                floating.isFloating()
                  ? floating.iconButtonClass()
                  : 'rounded-md hover:bg-muted',
              )}
            >
              <Show
                when={props.isDark}
                fallback={<ThemeLightIcon class="h-4 w-4" size={16} />}
              >
                <ThemeDarkIcon class="h-4 w-4" size={16} />
              </Show>
              <span class="sr-only">
                {props.isDark ? '切换到浅色模式' : '切换到深色模式'}
              </span>
            </Toggle>
          </ViewerAppTooltipTrigger>
          <ViewerAppTooltipContent>
            {props.isDark ? '切换到浅色模式' : '切换到深色模式'}
          </ViewerAppTooltipContent>
        </ViewerAppTooltip>
        <WindowControlButtons />
      </div>
      </div>
    </>
  );
}
