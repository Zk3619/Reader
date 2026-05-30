import { Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { ChevronLeftIcon, ImageIcon, ListIcon, RefreshIcon } from '@/components/shared/icons';
import { WindowControlButtons } from '@/components/shell/WindowControlButtons';
import { isTauri } from '@/lib/platform/detect';

export interface MediaViewerToolbarHeaderProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onOpenCatalog?: () => void;
  onRefresh?: () => void;
  /** 仅重试本章加载失败的图片，不重新拉取章节正文 */
  onRetryFailedImages?: () => void;
  loading?: boolean;
}

/** 图片 / 音频 / 视频 / 文件阅读器默认顶栏内容 */
export function MediaViewerToolbarHeader(props: MediaViewerToolbarHeaderProps) {
  return (
    <>
      <Button variant="ghost" size="icon" class="no-drag" onClick={props.onClose} aria-label="返回">
        <ChevronLeftIcon class="h-5 w-5" />
      </Button>
      <div class="min-w-0 flex-1 no-drag">
        <h1 class="truncate text-sm font-medium">{props.title}</h1>
        <Show when={props.subtitle}>
          <p class="truncate text-xs text-muted-foreground">{props.subtitle}</p>
        </Show>
      </div>
      <Show when={props.onRetryFailedImages}>
        <Button
          variant="ghost"
          size="icon"
          class="no-drag"
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
          class="no-drag"
          onClick={props.onRefresh}
          disabled={props.loading}
          aria-label="刷新本章"
        >
          <RefreshIcon class="h-5 w-5" />
        </Button>
      </Show>
      <Show when={props.onOpenCatalog}>
        <Button
          variant="ghost"
          size="icon"
          class="no-drag"
          onClick={props.onOpenCatalog}
          aria-label="目录"
        >
          <ListIcon class="h-5 w-5" />
        </Button>
      </Show>
      <Show when={isTauri()}>
        <WindowControlButtons />
      </Show>
    </>
  );
}
