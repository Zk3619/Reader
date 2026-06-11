import { Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMediaViewerChromeFloating } from '@/lib/viewer/viewer-chrome-layout';
import { Separator } from '@/components/ui/separator';
import { WindowControlButtons } from '@/components/shell/WindowControlButtons';
import { ThemeSwitch } from '@/components/shell/ThemeSwitch';
import {
  ViewerAppTooltip,
  ViewerAppTooltipContent,
  ViewerAppTooltipTrigger,
} from '@/components/viewer/viewer-app-overlay';
import {
  ChevronLeftIcon,
  ListIcon,
  SettingsIcon,
  RefreshIcon,
  ReplaceIcon,
  DownloadIcon,
  VolumeOnIcon,
  VolumeOffIcon,
} from '@/components/shared/icons';
import { ReaderMoreMenu, type ReaderMoreMenuProps } from '@/components/viewer/text-viewer/ReaderMoreMenu';
import { isMobile, isTauri } from '@/lib/platform/detect';

export interface TextViewerToolbarHeaderProps {
  bookName: string;
  onClose: () => void;
  onOpenBookInfo?: () => void;
  isWideScreen: boolean;
  readAloudActive: boolean;
  onOpenCatalog: () => void;
  onReadAloud: () => void;
  onOpenSettings: () => void;
  onOpenReaderMenu: () => void;
  onChangeSource: () => void;
  onRefreshChapter: () => void;
  onOpenOfflineCache: () => void;
  moreMenu: Omit<ReaderMoreMenuProps, 'triggerClass'>;
}

/** 文本阅读器顶栏业务内容（布局由 MediaViewerHeader 提供） */
export function TextViewerToolbarHeader(props: TextViewerToolbarHeaderProps) {
  const floating = useMediaViewerChromeFloating();
  const iconBtn = () =>
    cn('no-drag', floating.isFloating() ? floating.inlineIconClass() : floating.iconButtonClass());
  const titleClass = (inCluster: boolean) =>
    cn(
      'min-w-0 truncate text-sm font-medium text-foreground',
      inCluster
        ? 'max-w-[min(40vw,12rem)] px-1 no-drag'
        : cn('max-w-[40%]', floating.isFloating() && floating.pillClass(), floating.isFloating() && 'px-3 py-1.5 no-drag'),
    );
  const clusterClass = () => floating.clusterClass();

  const closeButton = () => (
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
  );

  const titleNode = (inCluster: boolean) => (
    <Show
      when={props.onOpenBookInfo}
      fallback={
        <h1 class={titleClass(inCluster)} data-tauri-drag-region={inCluster ? undefined : true}>
          {props.bookName || '—'}
        </h1>
      }
    >
      <ViewerAppTooltip>
        <ViewerAppTooltipTrigger
          as="button"
          type="button"
          class={cn(
            titleClass(inCluster),
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
  );

  const actionButtons = () => (
    <>
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
      <ReaderMoreMenu {...props.moreMenu} triggerClass={iconBtn()} />
    </>
  );

  const windowChrome = () => (
    <>
      <Show when={isTauri() && !isMobile() && !floating.isFloating()}>
        <Separator orientation="vertical" class="mx-2 h-6 no-drag" />
      </Show>
      <div class="flex items-center gap-2 no-drag">
        <ThemeSwitch withTooltip inViewerOverlay />
        <WindowControlButtons />
      </div>
    </>
  );

  return (
    <Show
      when={floating.isFloating()}
      fallback={
        <>
          {closeButton()}
          {titleNode(false)}
          <Show when={!floating.isFloating()}>
            <div class="min-w-0 flex-1" data-tauri-drag-region />
          </Show>
          <div class="flex shrink-0 items-center gap-0.5 no-drag">
            {actionButtons()}
            {windowChrome()}
          </div>
        </>
      }
    >
      <div
        class={cn(
          clusterClass(),
          'flex min-w-0 max-w-[calc(50%-0.375rem)] items-center gap-0.5',
        )}
        data-tauri-drag-region
      >
        {closeButton()}
        {titleNode(true)}
      </div>
      <div
        class={cn(
          clusterClass(),
          'ml-auto flex max-w-[calc(50%-0.375rem)] shrink-0 items-center gap-0.5 no-drag',
        )}
      >
        {actionButtons()}
        {windowChrome()}
      </div>
    </Show>
  );
}
