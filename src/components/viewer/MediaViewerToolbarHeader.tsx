import { Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMediaViewerChromeFloating } from '@/lib/viewer/viewer-chrome-layout';
import { Separator } from '@/components/ui/separator';
import {
  ChevronLeftIcon,
  ImageIcon,
  ListIcon,
  RefreshIcon,
} from '@/components/shared/icons';
import { Gauge, Maximize, Minimize, Settings } from 'lucide-solid';
import { WindowControlButtons } from '@/components/shell/WindowControlButtons';
import { isMobile, isTauri } from '@/lib/platform/detect';

export interface MediaViewerToolbarHeaderProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onOpenCatalog?: () => void;
  onRefresh?: () => void;
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
  const iconBtn = () => cn('no-drag', floating.iconButtonClass());
  const titleWrap = () =>
    cn(
      'min-w-0 max-w-[40%]',
      floating.isFloating() && floating.pillClass(),
      floating.isFloating() && 'px-3 py-1.5',
    );

  return (
    <>
      <Button variant="ghost" size="icon" class={iconBtn()} onClick={props.onClose} aria-label="关闭">
        <ChevronLeftIcon class="h-5 w-5" />
      </Button>
      <div class={titleWrap()} data-tauri-drag-region>
        <h1 class="truncate text-sm font-medium">{props.title}</h1>
        <Show when={props.subtitle}>
          <p class="truncate text-xs text-muted-foreground">{props.subtitle}</p>
        </Show>
      </div>
      <Show when={!floating.isFloating()}>
        <div class="min-w-0 flex-1" data-tauri-drag-region />
      </Show>
      <div
        class={cn(
          'flex items-center gap-0.5 no-drag',
          floating.isFloating() && 'ml-auto',
        )}
      >
      <Show when={props.onRetryFailedImages}>
        <Button
          variant="ghost"
          size="icon"
          class={iconBtn()}
          onClick={props.onRetryFailedImages}
          disabled={props.loading}
          aria-label="重试失败图片"
        >
          <ImageIcon class="h-5 w-5" />
        </Button>
      </Show>
      <Show when={props.onRefresh}>
        <Button
          variant="ghost"
          size="icon"
          class={iconBtn()}
          onClick={props.onRefresh}
          disabled={props.loading}
          aria-label="刷新章节"
        >
          <RefreshIcon class="h-5 w-5" />
        </Button>
      </Show>
      <Show when={props.onOpenSpeed}>
        <Button
          variant="ghost"
          size="icon"
          class={iconBtn()}
          onClick={props.onOpenSpeed}
          aria-label="播放速度"
          title={props.playbackSpeedLabel}
        >
          <Gauge class="h-5 w-5" />
        </Button>
      </Show>
      <Show when={props.onToggleFullscreen}>
        <Button
          variant="ghost"
          size="icon"
          class={iconBtn()}
          onClick={props.onToggleFullscreen}
          aria-label={props.isFullscreen ? '退出全屏' : '全屏'}
        >
          <Show when={props.isFullscreen} fallback={<Maximize class="h-5 w-5" />}>
            <Minimize class="h-5 w-5" />
          </Show>
        </Button>
      </Show>
      <Show when={props.onOpenVideoSettings}>
        <Button
          variant="ghost"
          size="icon"
          class={iconBtn()}
          onClick={props.onOpenVideoSettings}
          aria-label="视频设置"
        >
          <Settings class="h-5 w-5" />
        </Button>
      </Show>
      <Show when={props.onOpenCatalog}>
        <Button
          variant="ghost"
          size="icon"
          class={iconBtn()}
          onClick={props.onOpenCatalog}
          aria-label="目录"
        >
          <ListIcon class="h-5 w-5" />
        </Button>
      </Show>
      <Show when={isTauri() && !isMobile() && !floating.isFloating()}>
        <Separator orientation="vertical" class="mx-2 h-6 no-drag" />
      </Show>
      <div class="flex items-center gap-2 no-drag">
        <WindowControlButtons />
      </div>
      </div>
    </>
  );
}
