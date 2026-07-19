/**
 * 离线缓存页书籍卡片（紧凑高度，对齐书架管理列表项）
 */

import { Show, type Component } from 'solid-js';
import type { Store } from 'solid-js/store';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { BookCoverFromBook } from '@/components/media/reader/books/BookCoverFromBook';
import { BookCoverIcon, ExportIcon, PlayIcon, SquareIcon } from '@/components/shared/icons';
import { Trash2 } from 'lucide-solid';
import {
  bookGroupCompactCardClass,
  bookshelfCompactCoverClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { chapterCacheDownloadStore, formatChapterCacheSize } from '@/lib/chapter-cache';
import { formatAudioCacheSize } from '@/lib/media/audio/audio-disk-cache';
import { formatMangaImageCacheSize } from '@/lib/media/image/image-disk-cache';
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
  audioTrackCount: number;
  audioCacheBytes: number;
  /** 图片章节书（元数据或正文抽样） */
  isManga: boolean;
  isAudioBook: boolean;
  total: number;
  downloadPercent: number | null;
}

export interface BookshelfCacheBookCardProps {
  rows: Store<BookshelfCacheRowState[]>;
  rowIndex: number;
  exporting: boolean;
  onToggleDownload: () => void;
  onOpenExport: () => void;
  mediaWarming?: () => boolean;
  onClear: () => void;
}

/** 虚拟列表行高：标题/作者 + 已缓存行 + 占用行 */
export const CACHE_BOOK_CARD_HEIGHT_PX = 88;

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
  const audioTrackCount = () => row().audioTrackCount;
  const audioCacheBytes = () => row().audioCacheBytes;
  const isMangaBook = () => row().isManga;
  const isAudioBook = () => row().isAudioBook;
  const active = () =>
    chapterCacheDownloadStore.state.activeBookUrls.includes(book().bookUrl);

  const showImageWarming = () =>
    isMangaBook() &&
    imageCount() <= 0 &&
    cached() > 0 &&
    (props.mediaWarming?.() ?? false);

  const showAudioWarming = () =>
    isAudioBook() &&
    audioTrackCount() <= 0 &&
    cached() > 0 &&
    (props.mediaWarming?.() ?? false);

  const hasCacheSizeLine = () => {
    if (!isMangaBook() && !isAudioBook() && cacheBytes() > 0) return true;
    if (cacheBytes() > 0) return true;
    if (isMangaBook() && imageCount() > 0) return true;
    if (isAudioBook() && audioTrackCount() > 0) return true;
    return false;
  };

  return (
    <li class="w-full">
      <div
        class={cn(
          bookGroupCompactCardClass(),
          'h-[5.5rem] min-h-[5.5rem] cursor-default items-stretch gap-2.5',
        )}
      >
        <div class={bookshelfCompactCoverClass()}>
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
        <div class="min-w-0 flex-1 flex flex-col justify-center gap-0.5 overflow-hidden py-0.5">
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
            <Show when={showImageWarming()}>
              <span> · 图片缓存中…</span>
            </Show>
            <Show when={showAudioWarming()}>
              <span> · 音频缓存中…</span>
            </Show>
            <Show when={downloadPercent() != null}>
              <span>
                {' '}
                · 缓存中 {downloadPercent()}%
                <Show when={isMangaBook()}>（含图片）</Show>
                <Show when={isAudioBook()}>（含音频）</Show>
              </span>
            </Show>
          </p>
          <Show when={hasCacheSizeLine()}>
            <p class="m-0 truncate text-xs leading-4 text-muted-foreground">
              <Show
                when={isMangaBook() || isAudioBook()}
                fallback={
                  cacheBytes() > 0 ? (
                    <span>{formatChapterCacheSize(cacheBytes())}</span>
                  ) : null
                }
              >
                <Show when={cacheBytes() > 0}>
                  <span>章节 HTML {formatChapterCacheSize(cacheBytes())}</span>
                </Show>
                <Show when={isMangaBook() && imageCount() > 0}>
                  <Show when={cacheBytes() > 0}>
                    <span> · </span>
                  </Show>
                  <span>
                    图片 {imageCount()} 张
                    {imageCacheBytes() > 0
                      ? ` (${formatMangaImageCacheSize(imageCacheBytes())})`
                      : ''}
                  </span>
                </Show>
                <Show when={isAudioBook() && audioTrackCount() > 0}>
                  <Show when={cacheBytes() > 0 || (isMangaBook() && imageCount() > 0)}>
                    <span> · </span>
                  </Show>
                  <span>
                    音频 {audioTrackCount()} 段
                    {audioCacheBytes() > 0
                      ? ` (${formatAudioCacheSize(audioCacheBytes())})`
                      : ''}
                  </span>
                </Show>
              </Show>
            </p>
          </Show>
        </div>
        <div class="flex shrink-0 flex-row items-center gap-0.5 self-center pl-0.5">
          <AppTooltip>
            <AppTooltipTrigger
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
            </AppTooltipTrigger>
            <AppTooltipContent>{active() ? '停止缓存' : '缓存全书'}</AppTooltipContent>
          </AppTooltip>
          <AppTooltip>
            <AppTooltipTrigger
              as={Button}
              variant="outline"
              size="icon"
              class="size-7"
              disabled={props.exporting}
              onClick={(e) => {
                e.stopPropagation();
                props.onOpenExport();
              }}
            >
              <ExportIcon class="h-3.5 w-3.5" size={14} />
              <span class="sr-only">导出已缓存内容</span>
            </AppTooltipTrigger>
            <AppTooltipContent>导出缓存</AppTooltipContent>
          </AppTooltip>
          <AppTooltip>
            <AppTooltipTrigger
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
            </AppTooltipTrigger>
            <AppTooltipContent>清除本书缓存</AppTooltipContent>
          </AppTooltip>
        </div>
      </div>
    </li>
  );
};
