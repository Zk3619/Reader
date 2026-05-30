import { Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          as={Button}
          variant="ghost"
          size="icon"
          class="no-drag"
          onClick={props.onClose}
          aria-label="关闭阅读器"
        >
          <ChevronLeftIcon class="size-5" />
        </TooltipTrigger>
        <TooltipContent>关闭阅读器</TooltipContent>
      </Tooltip>
      <Show
        when={props.onOpenBookInfo}
        fallback={
          <h1
            class="min-w-0 max-w-[40%] truncate text-sm font-medium text-foreground"
            data-tauri-drag-region
          >
            {props.bookName || '—'}
          </h1>
        }
      >
        <Tooltip>
          <TooltipTrigger
            as="button"
            type="button"
            class="min-w-0 max-w-[40%] truncate text-left text-sm font-medium text-foreground transition-colors cursor-pointer hover:text-primary no-drag"
            onClick={() => props.onOpenBookInfo!()}
            aria-label="进入书籍信息页"
          >
            {props.bookName || '—'}
          </TooltipTrigger>
          <TooltipContent>书籍信息</TooltipContent>
        </Tooltip>
      </Show>
      <div class="min-w-0 flex-1" data-tauri-drag-region />
      <Show when={props.isWideScreen}>
        <Tooltip>
          <TooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class="no-drag"
            onClick={(e) => {
              e.stopPropagation();
              props.onOpenCatalog();
            }}
            aria-label="目录"
          >
            <ListIcon class="size-5" />
          </TooltipTrigger>
          <TooltipContent>目录</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class="no-drag"
            onClick={props.onReadAloud}
            aria-label="朗读"
          >
            {props.readAloudActive ? (
              <VolumeOffIcon class="size-5" size={20} />
            ) : (
              <VolumeOnIcon class="size-5" size={20} />
            )}
          </TooltipTrigger>
          <TooltipContent>朗读</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class="no-drag"
            onClick={props.onOpenSettings}
            aria-label="界面（字号、间距、配色）"
          >
            <span class="text-base font-normal leading-none" aria-hidden="true">
              Aa
            </span>
          </TooltipTrigger>
          <TooltipContent>界面</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class="no-drag"
            onClick={props.onOpenReaderMenu}
            aria-label="设置"
          >
            <SettingsIcon class="size-5" />
          </TooltipTrigger>
          <TooltipContent>设置</TooltipContent>
        </Tooltip>
      </Show>
      <div class="flex shrink-0 items-center gap-0.5 no-drag">
        <Tooltip>
          <TooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class="no-drag"
            onClick={props.onChangeSource}
            aria-label="换源"
          >
            <ReplaceIcon class="size-5" />
          </TooltipTrigger>
          <TooltipContent>换源</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class="no-drag"
            onClick={props.onRefreshChapter}
            aria-label="刷新当前章节"
          >
            <RefreshIcon class="size-5" />
          </TooltipTrigger>
          <TooltipContent>刷新</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class="no-drag"
            onClick={props.onOpenOfflineCache}
            aria-label="离线缓存"
          >
            <DownloadIcon class="size-5" />
          </TooltipTrigger>
          <TooltipContent>离线缓存</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class="no-drag"
            onClick={props.onOpenMoreMenu}
            aria-label="更多"
          >
            <MoreIcon class="size-5" />
          </TooltipTrigger>
          <TooltipContent>更多</TooltipContent>
        </Tooltip>
      </div>
      <Show when={isTauri() && !isMobile()}>
        <Separator orientation="vertical" class="mx-2 h-6 no-drag" />
      </Show>
      <div class="flex items-center gap-2 no-drag">
        <Tooltip>
          <TooltipTrigger as="div">
            <Toggle
              pressed={props.isDark}
              onChange={props.onToggleTheme}
              variant="default"
              size="default"
              class="h-9 w-9 rounded-md hover:bg-muted transition-colors p-0"
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
          </TooltipTrigger>
          <TooltipContent>
            {props.isDark ? '切换到浅色模式' : '切换到深色模式'}
          </TooltipContent>
        </Tooltip>
        <WindowControlButtons />
      </div>
    </>
  );
}
