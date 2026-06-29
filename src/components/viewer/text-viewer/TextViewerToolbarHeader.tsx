import { Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMediaViewerChromeFloating, useMediaViewerToolbarChromeClasses } from '@/lib/viewer/viewer-chrome-layout';
import {
  ViewerToolbarWindowControlsLead,
  ViewerToolbarWindowControlsTrail,
} from '@/components/viewer/ViewerToolbarChromeParts';
import {
  mediaViewerChromeToolbarLeadRowClass,
  mediaViewerChromeToolbarPrimaryActionsClass,
  mediaViewerChromeToolbarTitleInlineClass,
  mediaViewerChromeFloatingActionsClusterScrollClass,
} from '@/components/viewer/viewer-chrome';
import { isMobile } from '@/lib/platform/detect';
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

export interface TextViewerToolbarHeaderProps {
  bookName: string;
  onClose: () => void;
  onOpenBookInfo?: () => void;
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
  const toolbarChrome = useMediaViewerToolbarChromeClasses();
  const isFloating = () => floating.isFloating();
  const iconBtn = (inCluster = false) =>
    cn(
      'no-drag text-inherit [&_svg]:text-current',
      isFloating()
        ? inCluster
          ? floating.clusterIconButtonClass()
          : cn(floating.inlineIconClass(), floating.iconButtonClass())
        : floating.iconButtonClass(),
    );
  const titleClass = () => mediaViewerChromeToolbarTitleInlineClass;
  const capsuleStyle = () => (isFloating() ? floating.overlaySurfaceStyle() : undefined);

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

  const titleNode = () => (
    <Show
      when={props.onOpenBookInfo}
      fallback={
        <h1 class={titleClass()} data-tauri-drag-region={isFloating() ? undefined : true}>
          {props.bookName || '—'}
        </h1>
      }
    >
      <AppTooltip>
        <AppTooltipTrigger
          as="button"
          type="button"
          class={cn(
            titleClass(),
            'min-w-0 max-w-full overflow-hidden text-left transition-colors cursor-pointer hover:text-primary',
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

  const titleBlock = () =>
    isFloating() ? (
      <div class={floating.titleCapsuleClass()} style={capsuleStyle()}>
        {titleNode()}
      </div>
    ) : (
      titleNode()
    );

  const primaryActionButtons = () => (
    <>
      <AppTooltip disabled={props.catalogTooltipSuspended}>
        <AppTooltipTrigger
          as={Button}
          variant="ghost"
          size="icon"
          class={iconBtn(true)}
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
          class={iconBtn(true)}
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
          class={iconBtn(true)}
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
          class={iconBtn(true)}
          onClick={props.onOpenReaderMenu}
          aria-label="设置"
          data-reader-menu-trigger=""
        >
          <SettingsIcon class="size-5" />
        </AppTooltipTrigger>
        <AppTooltipContent layer="viewer">设置</AppTooltipContent>
      </AppTooltip>
    </>
  );

  const secondaryActionButtons = () => (
    <>
      <Show when={props.canChangeSource !== false}>
        <AppTooltip>
          <AppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class={iconBtn(true)}
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
          class={iconBtn(true)}
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
          class={iconBtn(true)}
          onClick={props.onOpenOfflineCache}
          aria-label="离线缓存"
        >
          <DownloadIcon class="size-5" />
        </AppTooltipTrigger>
        <AppTooltipContent layer="viewer">离线缓存</AppTooltipContent>
      </AppTooltip>
      <ReaderMoreMenu {...props.moreMenu} triggerClass={iconBtn(true)} />
    </>
  );

  const desktopPrimaryActions = () => (
    <Show when={!isMobile()}>
      <div class={mediaViewerChromeToolbarPrimaryActionsClass}>{primaryActionButtons()}</div>
    </Show>
  );

  const actionsGroupClass = () => toolbarChrome().actionsGroupClass;

  const leadRow = () => (
    <div
      class={cn(
        mediaViewerChromeToolbarLeadRowClass,
        isFloating() && 'gap-1 sm:min-w-0 sm:shrink',
      )}
    >
      {closeButton()}
      {titleBlock()}
    </div>
  );

  const actionButtons = () => (
    <>
      {desktopPrimaryActions()}
      {secondaryActionButtons()}
    </>
  );

  const actionsGroupContent = () =>
    isFloating() ? (
      <div class={mediaViewerChromeFloatingActionsClusterScrollClass}>{actionButtons()}</div>
    ) : (
      actionButtons()
    );

  const desktopBody = () => (
    <>
      <div class={toolbarChrome().overlayFirstRowClass}>
        {leadRow()}
        <ViewerToolbarWindowControlsLead />
      </div>
      <Show when={toolbarChrome().showSpacer}>
        <div class={toolbarChrome().spacerClass} data-tauri-drag-region />
      </Show>
      <div class={actionsGroupClass()} style={capsuleStyle()}>
        {actionsGroupContent()}
      </div>
      <ViewerToolbarWindowControlsTrail />
    </>
  );

  const mobileBody = () => (
    <>
      {leadRow()}
      <div class={actionsGroupClass()} style={capsuleStyle()}>
        {isFloating() ? (
          <div class={mediaViewerChromeFloatingActionsClusterScrollClass}>
            {secondaryActionButtons()}
          </div>
        ) : (
          secondaryActionButtons()
        )}
      </div>
    </>
  );

  return (
    <Show when={toolbarChrome().mobile} fallback={desktopBody()}>
      {mobileBody()}
    </Show>
  );
}
