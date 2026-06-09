/**
 * 阅读记录列表项「更多」菜单
 */

import { Show } from 'solid-js';
import { MoreIcon } from '@/components/shared/icons';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import type { ReadRecordEntry } from '@/lib/record/read-record-presenter';
import type { Book } from '@/types';

export interface ReadRecordEntryRowMenuProps {
  entry: ReadRecordEntry;
  onOpenBook?: (book: Book) => void;
  onSearchBook?: (bookName: string) => void;
  onOpenBookInfo?: (book: Book) => void;
  onDelete?: () => void;
  /** 继续阅读 / 搜索此书的文案，默认按是否有 book 推断 */
  primaryActionLabel?: string;
}

export function ReadRecordEntryRowMenu(props: ReadRecordEntryRowMenuProps) {
  const entry = () => props.entry;

  const handlePrimary = () => {
    const book = entry().book;
    if (book) props.onOpenBook?.(book);
    else props.onSearchBook?.(entry().bookName);
  };

  const handleBookInfo = () => {
    const book = entry().book;
    if (book) props.onOpenBookInfo?.(book);
  };

  return (
    <div class="flex shrink-0 items-center">
      <AppDropdownMenu>
        <Tooltip>
          <TooltipTrigger as="div">
            <AppDropdownMenuTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100 data-expanded:opacity-100"
              aria-label="更多操作"
              onClick={(e: MouseEvent) => e.stopPropagation()}
            >
              <MoreIcon class="h-4 w-4" size={16} />
            </AppDropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>更多操作</TooltipContent>
        </Tooltip>
        <AppDropdownMenuContent align="end">
          <AppDropdownMenuItem onSelect={handlePrimary}>
            {props.primaryActionLabel ??
              (entry().book ? '继续阅读' : '搜索此书')}
          </AppDropdownMenuItem>
          <Show when={entry().book && props.onOpenBookInfo}>
            <AppDropdownMenuItem onSelect={handleBookInfo}>查看详情</AppDropdownMenuItem>
          </Show>
          <Show when={entry().hasDurationRecord && props.onDelete}>
            <AppDropdownMenuItem
              class="text-destructive focus:text-destructive"
              onSelect={() => props.onDelete?.()}
            >
              删除记录
            </AppDropdownMenuItem>
          </Show>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </div>
  );
}
