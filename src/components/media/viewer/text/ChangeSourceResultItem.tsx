/**
 * 换源结果列表项：点赞/点踩 + 右键菜单（对齐 Legado ChangeBookSourceAdapter）
 */

import { Show } from 'solid-js';
import type { SearchBook } from '@/types';
import { Button } from '@/components/ui/button';
import {
  AppContextMenu,
  AppContextMenuContent,
  AppContextMenuItem,
  AppContextMenuTrigger,
} from '@/components/shared/AppContextMenu';
import { ThumbsDownIcon, ThumbsUpIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';

export interface ChangeSourceResultItemProps {
  item: SearchBook;
  score: number;
  current: boolean;
  applying: boolean;
  showWordCountMeta: boolean;
  formatRespondTime: (ms: number) => string;
  onSelect: (item: SearchBook) => void;
  onSetScore: (item: SearchBook, score: number) => void;
  onPinTop: (item: SearchBook) => void;
  onPinBottom: (item: SearchBook) => void;
  onEditSource: (item: SearchBook) => void;
  onDisableSource: (item: SearchBook) => void;
  onDeleteSource: (item: SearchBook) => void;
}

function stopRowActivation(event: Event) {
  event.preventDefault();
  event.stopPropagation();
}

export function ChangeSourceResultItem(props: ChangeSourceResultItemProps) {
  const handleGoodClick = (event: MouseEvent) => {
    stopRowActivation(event);
    props.onSetScore(props.item, props.score > 0 ? 0 : 1);
  };

  const handleBadClick = (event: MouseEvent) => {
    stopRowActivation(event);
    props.onSetScore(props.item, props.score < 0 ? 0 : -1);
  };

  return (
    <AppContextMenu>
      <AppContextMenuTrigger
        as="div"
        class={cn(
          'w-full rounded-lg border border-border/60 py-1.5 text-left transition-colors hover:bg-accent/40',
          props.current && 'border-primary/50 bg-primary/5',
          props.applying && 'pointer-events-none opacity-60',
        )}
        data-book-url={props.item.bookUrl}
        role="button"
        tabIndex={0}
        onClick={() => {
          if (!props.applying) props.onSelect(props.item);
        }}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!props.applying) props.onSelect(props.item);
          }
        }}
      >
        <div class="flex items-start gap-1">
          <div
            class="flex shrink-0 flex-col gap-0 pt-0.5"
            onPointerDown={stopRowActivation}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class={cn(
                'h-5 w-5 shrink-0 rounded-sm p-0 [&_svg]:size-3.5',
                props.score > 0
                  ? 'text-red-400 hover:text-red-400'
                  : 'text-muted-foreground/45 hover:text-muted-foreground/70',
              )}
              aria-label={props.score > 0 ? '取消点赞' : '点赞'}
              aria-pressed={props.score > 0 ? 'true' : 'false'}
              onClick={handleGoodClick}
            >
              <ThumbsUpIcon
                class={cn(props.score > 0 ? 'fill-current' : 'fill-none')}
              />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class={cn(
                'h-5 w-5 shrink-0 rounded-sm p-0 [&_svg]:size-3.5',
                props.score < 0
                  ? 'text-blue-400 hover:text-blue-400'
                  : 'text-muted-foreground/45 hover:text-muted-foreground/70',
              )}
              aria-label={props.score < 0 ? '取消点踩' : '点踩'}
              aria-pressed={props.score < 0 ? 'true' : 'false'}
              onClick={handleBadClick}
            >
              <ThumbsDownIcon
                class={cn(props.score < 0 ? 'fill-current' : 'fill-none')}
              />
            </Button>
          </div>

          <div class="min-w-0 flex-1">
            <div class="font-medium">{props.item.originName}</div>
            <div class="mt-0.5 truncate text-xs text-muted-foreground">
              {props.item.latestChapterTitle || props.item.bookUrl}
            </div>
            <Show when={props.showWordCountMeta && props.item.chapterWordCountText}>
              <div class="mt-1 text-xs text-muted-foreground">
                {props.item.chapterWordCountText}
              </div>
            </Show>
          </div>

          <div class="shrink-0 pt-0.5 text-right text-xs text-muted-foreground">
            <Show when={props.showWordCountMeta}>
              <div>{props.formatRespondTime(props.item.respondTime)}</div>
            </Show>
            <Show when={props.current}>
              <div class="mt-1 text-primary">当前</div>
            </Show>
          </div>
        </div>
      </AppContextMenuTrigger>
      <AppContextMenuContent>
        <AppContextMenuItem onSelect={() => props.onPinTop(props.item)}>
          置顶
        </AppContextMenuItem>
        <AppContextMenuItem onSelect={() => props.onPinBottom(props.item)}>
          置底
        </AppContextMenuItem>
        <AppContextMenuItem onSelect={() => props.onEditSource(props.item)}>
          编辑源
        </AppContextMenuItem>
        <AppContextMenuItem onSelect={() => props.onDisableSource(props.item)}>
          禁用源
        </AppContextMenuItem>
        <AppContextMenuItem
          class="text-destructive focus:text-destructive"
          onSelect={() => props.onDeleteSource(props.item)}
        >
          删除源
        </AppContextMenuItem>
      </AppContextMenuContent>
    </AppContextMenu>
  );
}
