import { Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ChevronLeftIcon, ImageIcon, ListIcon, RefreshIcon } from '@/components/shared/icons';
import { WindowControlButtons } from '@/components/shell/WindowControlButtons';
import { isMobile, isTauri } from '@/lib/platform/detect';

export interface MediaViewerToolbarHeaderProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onOpenCatalog?: () => void;
  onRefresh?: () => void;
  /** ?????????????????????? */
  onRetryFailedImages?: () => void;
  loading?: boolean;
}

/** ?? / ?? / ?? / ????????????*/
export function MediaViewerToolbarHeader(props: MediaViewerToolbarHeaderProps) {
  return (
    <>
      <Button variant="ghost" size="icon" class="no-drag" onClick={props.onClose} aria-label="??">
        <ChevronLeftIcon class="h-5 w-5" />
      </Button>
      <div class="min-w-0 max-w-[40%]" data-tauri-drag-region>
        <h1 class="truncate text-sm font-medium">{props.title}</h1>
        <Show when={props.subtitle}>
          <p class="truncate text-xs text-muted-foreground">{props.subtitle}</p>
        </Show>
      </div>
      <div class="min-w-0 flex-1" data-tauri-drag-region />
      <Show when={props.onRetryFailedImages}>
        <Button
          variant="ghost"
          size="icon"
          class="no-drag"
          onClick={props.onRetryFailedImages}
          disabled={props.loading}
          aria-label="??????"
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
          aria-label="????"
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
          aria-label="??"
        >
          <ListIcon class="h-5 w-5" />
        </Button>
      </Show>
      <Show when={isTauri() && !isMobile()}>
        <Separator orientation="vertical" class="mx-2 h-6 no-drag" />
      </Show>
      <div class="flex items-center gap-2 no-drag">
        <WindowControlButtons />
      </div>
    </>
  );
}
