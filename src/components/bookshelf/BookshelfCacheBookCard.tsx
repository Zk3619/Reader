/**
 * 离线缓存页书籍卡片（紧凑高度，对齐书架管理列表项）
 */

import { Show, type Component } from 'solid-js';
import type { Store } from 'solid-js/store';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BookCoverFromBook } from '@/components/books/BookCoverFromBook';
import { BookCoverIcon, ExportIcon, PlayIcon, SquareIcon } from '@/components/shared/icons';
import { Trash2 } from 'lucide-solid';
import {
  bookGroupCompactCardClass,
  bookshelfCompactCoverClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { chapterCacheDownloadStore, formatChapterCacheSize } from '@/lib/chapter-cache';
import { formatMangaImageCacheSize } from '@/lib/media/image/manga-image-disk-cache';
import { isTauri } from '@/lib/platform/detect';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { cn } from '@/lib/utils';
import type { Book } from '@/types';

export interface BookshelfCacheRowState {
  book: Book;
  cached: number;
  autoCached: number;
  manualCached: number;
  cacheBytes: number;
  imageCount: number;
  imageCacheBytes: number;
  /** 漫画书（元数据或正文抽样） */
  isManga: boolean;
  total: number;
  downloadPercent: number | null;
}

export interface BookshelfCacheBookCardProps {
  rows: Store<BookshelfCacheRowState[]>;
  rowIndex: number;
  exporting: boolean;
  onToggleDownload: () => void;
  onExportTxt: () => void;
  onExportMangaZip?: () => void;
  onExportMangaFolder?: () => void;
  /** 后台正在将已缓存章节 HTML 中的图片写入磁盘 */
  imageWarming?: () => boolean;
  onClear: () => void;
}

/** 与 h-16 卡片一致，供虚拟列表行高计算 */
export const CACHE_BOOK_CARD_HEIGHT_PX = 64;

export const BookshelfCacheBookCard: Component<BookshelfCacheBookCardProps> = (props) => {
  const row = () => props.rows[props.rowIndex];
  const book = () => row().book;
  const cached = () => row().cached;
  const autoCached = () => row().autoCached;
  const manualCached = () => row().manualCached;
  const cacheBytes = () => row().cacheBytes;
  const total = () => row().total;
  const downloadPercent = () => row().downloadPercent;
  const imageCount = () => row().imageCount;
  const imageCacheBytes = () => row().imageCacheBytes;
  const isMangaBook = () => row().isManga;

  const active = () =>
    chapterCacheDownloadStore.state.activeBookUrls.includes(book().bookUrl);

  return (
    <li class="w-full">
      <div
        class={cn(
          bookGroupCompactCardClass(),
          'h-16 min-h-16 cursor-default gap-2.5',
        )}
      >
        <div class={bookshelfCompactCoverClass('h-12 w-9')}>
          <BookCoverFromBook
            book={book()}
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
            <Show when={cached() > 0}>
              <span>
                {' '}
                （自动 {autoCached()} · 离线 {manualCached()}）
              </span>
            </Show>
            <Show when={isMangaBook()} fallback={
              cacheBytes() > 0 ? <span> · {formatChapterCacheSize(cacheBytes())}</span> : null
            }>
              {cacheBytes() > 0 ? (
                <span> · 章节 HTML {formatChapterCacheSize(cacheBytes())}</span>
              ) : null}
            </Show>
            <Show when={isMangaBook() && (imageCount() > 0 || (cached() > 0 && props.imageWarming?.()))}>
              <Show
                when={imageCount() > 0}
                fallback={<span> · 图片缓存中…</span>}
              >
                <span>
                  {' '}
                  · 图片 {imageCount()} 张
                  {imageCacheBytes() > 0
                    ? ` (${formatMangaImageCacheSize(imageCacheBytes())})`
                    : ''}
                </span>
              </Show>
            </Show>
            <Show when={downloadPercent() != null}>
              <span>
                {' '}
                · 缓存中 {downloadPercent()}%
                <Show when={isMangaBook()}>（含图片）</Show>
              </span>
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
          <Show
            when={isMangaBook()}
            fallback={
              <Tooltip>
                <TooltipTrigger
                  as={Button}
                  variant="outline"
                  size="icon"
                  class="size-7"
                  disabled={props.exporting}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onExportTxt();
                  }}
                >
                  <ExportIcon class="h-3.5 w-3.5" size={14} />
                  <span class="sr-only">导出已缓存章节</span>
                </TooltipTrigger>
                <TooltipContent>导出 TXT</TooltipContent>
              </Tooltip>
            }
          >
            <AppDropdownMenu>
              <AppDropdownMenuTrigger
                as={(triggerProps: Record<string, unknown>) => (
                  <Tooltip>
                    <TooltipTrigger
                      as={Button}
                      variant="outline"
                      size="icon"
                      class="size-7"
                      disabled={props.exporting}
                      {...triggerProps}
                      onClick={(e: MouseEvent) => {
                        e.stopPropagation();
                      }}
                    >
                      <ExportIcon class="h-3.5 w-3.5" size={14} />
                      <span class="sr-only">导出</span>
                    </TooltipTrigger>
                    <TooltipContent>导出 TXT / 图片</TooltipContent>
                  </Tooltip>
                )}
              />
              <AppDropdownMenuContent layout="compact">
                <AppDropdownMenuItem onSelect={() => props.onExportTxt()}>
                  导出 TXT
                </AppDropdownMenuItem>
                <AppDropdownMenuItem onSelect={() => props.onExportMangaZip?.()}>
                  导出图片 ZIP
                </AppDropdownMenuItem>
                <Show when={isTauri()}>
                  <AppDropdownMenuItem onSelect={() => props.onExportMangaFolder?.()}>
                    导出图片到文件夹
                  </AppDropdownMenuItem>
                </Show>
              </AppDropdownMenuContent>
            </AppDropdownMenu>
          </Show>
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
