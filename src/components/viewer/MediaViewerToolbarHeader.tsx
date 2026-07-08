import { Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMediaViewerChromeFloating, useMediaViewerToolbarChromeClasses } from '@/lib/viewer/viewer-chrome-layout';
import { mergeViewerChromeFloatingCapsuleStyle } from '@/lib/viewer/media-viewer-chrome-overlay-appearance';
import { appThemeBrightnessChrome } from '@/lib/theme/TextViewerTheme';
import {
  ViewerToolbarWindowControlsLead,
  ViewerToolbarWindowControlsTrail,
} from '@/components/viewer/ViewerToolbarChromeParts';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  ChevronLeftIcon,
  DownloadIcon,
  ListIcon,
  RefreshIcon,
  Settings2Icon,
} from '@/components/shared/icons';
import { Gauge, ImageUp, Maximize, Minimize, Settings } from 'lucide-solid';
import {
  mediaViewerChromeToolbarTitleInlineClass,
  mediaViewerChromeFloatingActionsClusterScrollClass,
} from '@/components/viewer/viewer-chrome';
export interface MediaViewerToolbarHeaderProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** 点击顶栏书名时进入书籍信息页（不传则书名不可点） */
  onOpenBookInfo?: () => void;
  onOpenCatalog?: () => void;
  /** 离线缓存（漫画/媒体阅读器） */
  onOpenOfflineCache?: () => void;
  onRefresh?: () => void;
  /** 打开界面设置（漫画阅读器等） */
  onOpenImageSettings?: () => void;
  /** 仅重试本章加载失败的图片，不重新拉取章节正文 */
  onRetryFailedImages?: () => void;
  onOpenSpeed?: () => void;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  onOpenVideoSettings?: () => void;
  playbackSpeedLabel?: string;
  loading?: boolean;
}

/** 标题栏：左/中/右按钮（关闭 / 标题 / 操作）*/
export function MediaViewerToolbarHeader(props: MediaViewerToolbarHeaderProps) {
  const floating = useMediaViewerChromeFloating();
  const toolbarChrome = useMediaViewerToolbarChromeClasses();
  const isFloating = () => floating.isFloating();
  const iconBtn = (inCluster = false) =>
    cn(
      'no-drag',
      isFloating()
        ? inCluster
          ? floating.clusterIconButtonClass()
          : cn(floating.inlineIconClass(), floating.iconButtonClass())
        : floating.iconButtonClass(),
    );
  const titleHeadingClass = () => cn('truncate text-sm font-medium');
  const titleClass = () => mediaViewerChromeToolbarTitleInlineClass;
  const capsuleStyle = () =>
    isFloating()
      ? mergeViewerChromeFloatingCapsuleStyle(floating.overlaySurfaceStyle(), {
          boxShadow: appThemeBrightnessChrome().capsuleGlow,
        })
      : undefined;

  const closeButton = () => (
    <AppTooltip>
      <AppTooltipTrigger
        as={Button}
        variant="ghost"
        size="icon"
        class={iconBtn()}
        onClick={props.onClose}
        aria-label="关闭"
      >
        <ChevronLeftIcon class="h-5 w-5" />
      </AppTooltipTrigger>
      <AppTooltipContent layer="viewer">关闭</AppTooltipContent>
    </AppTooltip>
  );

  const titleNode = () => (
    <>
      <Show
        when={props.onOpenBookInfo}
        fallback={
          <h1 class={cn(titleClass(), titleHeadingClass())}>{props.title || '—'}</h1>
        }
      >
        <AppTooltip>
          <AppTooltipTrigger
            as="button"
            type="button"
            class={cn(
              titleClass(),
              titleHeadingClass(),
              'no-drag block min-w-0 max-w-full overflow-hidden text-left transition-colors cursor-pointer hover:text-primary',
            )}
            onClick={() => props.onOpenBookInfo!()}
            aria-label="进入书籍信息页"
          >
            {props.title || '—'}
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">书籍信息</AppTooltipContent>
        </AppTooltip>
      </Show>
      <Show when={props.subtitle}>
        <p class="truncate text-xs text-muted-foreground">{props.subtitle}</p>
      </Show>
    </>
  );

  const titleBlock = () =>
    isFloating() ? (
      <div class={floating.titleCapsuleClass()} style={capsuleStyle()}>
        {titleNode()}
      </div>
    ) : (
      <div
        class="min-w-0 flex-1"
        data-tauri-drag-region={props.onOpenBookInfo ? undefined : true}
      >
        {titleNode()}
      </div>
    );

  const actionButtons = () => (
    <>
      <Show when={props.onOpenCatalog}>
        <AppTooltip>
          <AppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class={iconBtn(true)}
            onClick={props.onOpenCatalog}
            aria-label="目录"
          >
            <ListIcon class="h-5 w-5" />
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">目录</AppTooltipContent>
        </AppTooltip>
      </Show>
      <Show when={props.onOpenImageSettings}>
        <AppTooltip>
          <AppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class={iconBtn(true)}
            onClick={props.onOpenImageSettings}
            aria-label="界面设置"
          >
            <Settings2Icon class="h-5 w-5" />
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">界面设置</AppTooltipContent>
        </AppTooltip>
      </Show>
      <Show when={props.onRetryFailedImages}>
        <AppTooltip>
          <AppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class={iconBtn(true)}
            onClick={props.onRetryFailedImages}
            disabled={props.loading}
            aria-label="重试失败图片"
          >
            <ImageUp class="h-5 w-5" />
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">重试失败图片</AppTooltipContent>
        </AppTooltip>
      </Show>
      <Show when={props.onRefresh}>
        <AppTooltip>
          <AppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class={iconBtn(true)}
            onClick={props.onRefresh}
            disabled={props.loading}
            aria-label="刷新章节"
          >
            <RefreshIcon class="h-5 w-5" />
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">刷新章节</AppTooltipContent>
        </AppTooltip>
      </Show>
      <Show when={props.onOpenSpeed}>
        <AppTooltip>
          <AppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class={iconBtn(true)}
            onClick={props.onOpenSpeed}
            aria-label="播放速度"
          >
            <Gauge class="h-5 w-5" />
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">
            {props.playbackSpeedLabel ?? '播放速度'}
          </AppTooltipContent>
        </AppTooltip>
      </Show>
      <Show when={props.onToggleFullscreen}>
        <AppTooltip>
          <AppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class={iconBtn(true)}
            onClick={props.onToggleFullscreen}
            aria-label={props.isFullscreen ? '退出全屏' : '全屏'}
          >
            <Show when={props.isFullscreen} fallback={<Maximize class="h-5 w-5" />}>
              <Minimize class="h-5 w-5" />
            </Show>
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">
            {props.isFullscreen ? '退出全屏' : '全屏'}
          </AppTooltipContent>
        </AppTooltip>
      </Show>
      <Show when={props.onOpenVideoSettings}>
        <AppTooltip>
          <AppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class={iconBtn(true)}
            onClick={props.onOpenVideoSettings}
            aria-label="视频设置"
          >
            <Settings class="h-5 w-5" />
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">视频设置</AppTooltipContent>
        </AppTooltip>
      </Show>
      <Show when={props.onOpenOfflineCache}>
        <AppTooltip>
          <AppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class={iconBtn(true)}
            onClick={props.onOpenOfflineCache}
            aria-label="离线缓存"
          >
            <DownloadIcon class="h-5 w-5" />
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">离线缓存</AppTooltipContent>
        </AppTooltip>
      </Show>
    </>
  );

  const actionsGroupClass = () => toolbarChrome().actionsGroupClass;

  const leadRow = () => (
    <div class={cn(toolbarChrome().leadRowClass, isFloating() && 'gap-1 sm:min-w-0')}>
      {closeButton()}
      {titleBlock()}
    </div>
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
        {actionsGroupContent()}
      </div>
    </>
  );

  return (
    <Show when={toolbarChrome().mobile} fallback={desktopBody()}>
      {mobileBody()}
    </Show>
  );
}
