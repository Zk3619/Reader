/**
 * 离线缓存页书籍卡片（紧凑高度，对齐书架管理列表项）
 */

import { Show, type Component } from 'solid-js';
import type { Store } from 'solid-js/store';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BookCoverImg } from '@/components/books/BookCoverImg';
import { BookCoverIcon, ExportIcon, PlayIcon, SquareIcon } from '@/components/shared/icons';
import { Trash2 } from 'lucide-solid';
import {
  bookGroupCompactCardClass,
  bookGroupCompactCoverClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { chapterCacheDownloadStore } from '@/lib/chapter-cache';
import { cn } from '@/lib/utils';
import { sourcesStore } from '@/stores/sources';
import type { Book } from '@/types';

export interface BookshelfCacheRowState {
  book: Book;
  cached: number;
  total: number;
  downloadPercent: number | null;
}

export interface BookshelfCacheBookCardProps {
  rows: Store<BookshelfCacheRowState[]>;
  rowIndex: number;
  exporting: boolean;
  onToggleDownload: () => void;
  onExport: () => void;
  onClear: () => void;
}

/** 与 h-16 卡片一致，供虚拟列表行高计算 */
export const CACHE_BOOK_CARD_HEIGHT_PX = 64;

export const BookshelfCacheBookCard: Component<BookshelfCacheBookCardProps> = (props) => {
  const row = () => props.rows[props.rowIndex];
  const book = () => row().book;
  const cached = () => row().cached;
  const total = () => row().total;
  const downloadPercent = () => row().downloadPercent;

  const active = () =>
    chapterCacheDownloadStore.state.activeBookUrls.includes(book().bookUrl);

  return (
    <li class="w-full">
      <div
        class={cn(
          bookGroupCompactCardClass(),
          'h-16 min-h-16 cursor-default gap-2.5 hover:bg-card',
        )}
      >
        <div class={bookGroupCompactCoverClass('h-12 w-9')}>
          <BookCoverImg
            src={book().customCoverUrl || book().coverUrl}
            referer={book().origin}
            source={sourcesStore.getBookSource(book().origin)}
            bookUrl={book().bookUrl}
            alt=""
            class="h-full w-full object-cover"
            loading="lazy"
            draggable={false}
            fallback={
              <div class="flex h-full w-full items-center justify-center">
                <BookCoverIcon class="h-5 w-5 text-muted-foreground" size={20} />
              </div>
            }
          />
        </div>
        <div class="min-w-0 flex-1 flex flex-col justify-center gap-0.5 overflow-hidden">
          <p class="m-0 truncate text-sm font-medium leading-4 text-foreground">
            {book().name}
          </p>
          <p class="m-0 truncate text-xs leading-4 text-muted-foreground">
            {book().author || '—'}
          </p>
          <p class="m-0 truncate text-xs leading-4 text-muted-foreground">
            已缓存 {cached()}
            {total() > 0 ? ` / ${total()}` : ''} 章
            <Show when={downloadPercent() != null}>
              <span> · 下载中 {downloadPercent()}%</span>
            </Show>
          </p>
        </div>
        <div class="flex shrink-0 flex-row items-center gap-0.5 pl-0.5">
          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant={active() ? 'default' : 'outline'}
              size="icon"
              class="size-7"
              onClick={(e) => {
                e.stopPropagation();
                props.onToggleDownload();
              }}
            >
              <Show when={active()} fallback={<PlayIcon class="h-3.5 w-3.5" size={14} />}>
                <SquareIcon class="h-3.5 w-3.5" size={14} />
              </Show>
              <span class="sr-only">{active() ? '停止缓存' : '缓存全书'}</span>
            </TooltipTrigger>
            <TooltipContent>{active() ? '停止缓存' : '缓存全书'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant="outline"
              size="icon"
              class="size-7"
              disabled={props.exporting}
              onClick={(e) => {
                e.stopPropagation();
                props.onExport();
              }}
            >
              <ExportIcon class="h-3.5 w-3.5" size={14} />
              <span class="sr-only">导出已缓存章节</span>
            </TooltipTrigger>
            <TooltipContent>导出已缓存章节</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant="destructive"
              size="icon"
              class="size-7"
              onClick={(e) => {
                e.stopPropagation();
                props.onClear();
              }}
            >
              <Trash2 class="h-3.5 w-3.5" />
              <span class="sr-only">清除本书缓存</span>
            </TooltipTrigger>
            <TooltipContent>清除本书缓存</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </li>
  );
};
