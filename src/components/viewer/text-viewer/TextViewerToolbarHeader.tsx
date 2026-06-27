import { Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMediaViewerChromeFloating } from '@/lib/viewer/viewer-chrome-layout';
import { Separator } from '@/components/ui/separator';
import { WindowControlButtons } from '@/components/shell/WindowControlButtons';
import { ThemeSwitch } from '@/components/shell/ThemeSwitch';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  ChevronLeftIcon,
  ListIcon,
  SettingsIcon,
  RefreshIcon,
  ReplaceIcon,
  DownloadIcon,
  VolumeOnIcon,
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
  /** 设置抽屉开/关期间暂停「设置」Tooltip，避免遮罩消失后 hover 误触发 */
  settingsTooltipSuspended?: boolean;
  /** 目录抽屉开/关期间暂停「目录」Tooltip */
  catalogTooltipSuspended?: boolean;
  /** 朗读抽屉/全屏开/关期间暂停「朗读」Tooltip */
  readAloudTooltipSuspended?: boolean;
  onChangeSource: () => void;
  /** 在线书架书才显示换源（对齐 Legado menu_group_on_line） */
  canChangeSource?: boolean;
  onRefreshChapter: () => void;
  onOpenOfflineCache: () => void;
  moreMenu: Omit<ReaderMoreMenuProps, 'triggerClass'>;
}

/** 文本阅读器顶栏业务内容（布局由 MediaViewerHeader 提供） */
export function TextViewerToolbarHeader(props: TextViewerToolbarHeaderProps) {
  const floating = useMediaViewerChromeFloating();
  const iconBtn = () =>
    cn(
      'no-drag text-inherit [&_svg]:text-current',
      floating.isFloating() ? floating.inlineIconClass() : floating.iconButtonClass(),
    );
  const titleClass = (inCluster: boolean) =>
    cn(
      'min-w-0 truncate text-sm font-medium text-foreground',
      inCluster
        ? 'max-w-[min(40vw,12rem)] px-1 no-drag'
        : cn('max-w-[40%]', floating.isFloating() && floating.pillClass(), floating.isFloating() && 'px-3 py-1.5 no-drag'),
    );
  const clusterClass = () => floating.clusterClass();

  const closeButton = () => (
    <AppTooltip>
      <AppTooltipTrigger
        as={Button}
        variant="ghost"
        size="icon"
        class={iconBtn()}
        onClick={props.onClose}
        aria-label="关闭阅读器"
      >
        <ChevronLeftIcon class="size-5" />
      </AppTooltipTrigger>
      <AppTooltipContent layer="viewer">关闭阅读器</AppTooltipContent>
    </AppTooltip>
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
      <AppTooltip>
        <AppTooltipTrigger
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
        </AppTooltipTrigger>
        <AppTooltipContent layer="viewer">书籍信息</AppTooltipContent>
      </AppTooltip>
    </Show>
  );

  const actionButtons = () => (
    <>
      <Show when={props.isWideScreen}>
        <AppTooltip disabled={props.catalogTooltipSuspended}>
          <AppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class={iconBtn()}
            onClick={(e) => {
              e.stopPropagation();
              props.onOpenCatalog();
            }}
            aria-label="目录"
            data-reader-catalog-trigger=""
          >
            <ListIcon class="size-5" />
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">目录</AppTooltipContent>
        </AppTooltip>
        <AppTooltip disabled={props.readAloudTooltipSuspended}>
          <AppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class={iconBtn()}
            aria-label="朗读"
            data-reader-aloud-trigger=""
            onClick={props.onReadAloud}
          >
            <VolumeOnIcon class="size-5" size={20} />
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">朗读</AppTooltipContent>
        </AppTooltip>
        <AppTooltip>
          <AppTooltipTrigger
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
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">界面</AppTooltipContent>
        </AppTooltip>
        <AppTooltip disabled={props.settingsTooltipSuspended}>
          <AppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class={iconBtn()}
            onClick={props.onOpenReaderMenu}
            aria-label="设置"
            data-reader-menu-trigger=""
          >
            <SettingsIcon class="size-5" />
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">设置</AppTooltipContent>
        </AppTooltip>
      </Show>
      <Show when={props.canChangeSource !== false}>
        <AppTooltip>
          <AppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class={iconBtn()}
            onClick={props.onChangeSource}
            aria-label="换源"
          >
            <ReplaceIcon class="size-5" />
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">换源</AppTooltipContent>
        </AppTooltip>
      </Show>
      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          variant="ghost"
          size="icon"
          class={iconBtn()}
          onClick={props.onRefreshChapter}
          aria-label="刷新当前章节"
        >
          <RefreshIcon class="size-5" />
        </AppTooltipTrigger>
        <AppTooltipContent layer="viewer">刷新</AppTooltipContent>
      </AppTooltip>
      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          variant="ghost"
          size="icon"
          class={iconBtn()}
          onClick={props.onOpenOfflineCache}
          aria-label="离线缓存"
        >
          <DownloadIcon class="size-5" />
        </AppTooltipTrigger>
        <AppTooltipContent layer="viewer">离线缓存</AppTooltipContent>
      </AppTooltip>
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
