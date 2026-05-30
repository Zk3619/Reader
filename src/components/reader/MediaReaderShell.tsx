import { Show, type JSX } from 'solid-js';
import { Button } from '@/components/ui/button';
import { ChevronLeftIcon, ImageIcon, ListIcon, RefreshIcon } from '@/components/shared/icons';
import { WindowControlButtons } from '@/components/shell/WindowControlButtons';
import { isTauri } from '@/lib/platform/detect';
import { cn } from '@/lib/utils';

export interface MediaReaderShellProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onOpenCatalog?: () => void;
  onRefresh?: () => void;
  /** 仅重试本章加载失败的图片，不重新拉取章节正文 */
  onRetryFailedImages?: () => void;
  loading?: boolean;
  children: JSX.Element;
  footer?: JSX.Element;
}

export function MediaReaderShell(props: MediaReaderShellProps) {
  return (
    <div class="fixed inset-0 flex flex-col bg-background text-foreground">
      <header
        class={cn(
          'flex shrink-0 items-center gap-2 border-b border-border px-2 py-2',
          isTauri() && 'pl-2'
        )}
      >
        <Button variant="ghost" size="icon" onClick={props.onClose} aria-label="返回">
          <ChevronLeftIcon class="h-5 w-5" />
        </Button>
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-sm font-medium">{props.title}</h1>
          <Show when={props.subtitle}>
            <p class="truncate text-xs text-muted-foreground">{props.subtitle}</p>
          </Show>
        </div>
        <Show when={props.onRetryFailedImages}>
          <Button
            variant="ghost"
            size="icon"
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
            onClick={props.onRefresh}
            disabled={props.loading}
            aria-label="刷新本章"
          >
            <RefreshIcon class="h-5 w-5" />
          </Button>
        </Show>
        <Show when={props.onOpenCatalog}>
          <Button variant="ghost" size="icon" onClick={props.onOpenCatalog} aria-label="目录">
            <ListIcon class="h-5 w-5" />
          </Button>
        </Show>
        <Show when={isTauri()}>
          <WindowControlButtons />
        </Show>
      </header>

      <main class="relative min-h-0 flex-1 overflow-hidden">{props.children}</main>

      <Show when={props.footer}>
        <footer class="shrink-0 border-t border-border">{props.footer}</footer>
      </Show>
    </div>
  );
}
