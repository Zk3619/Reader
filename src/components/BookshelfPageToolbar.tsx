/**
 * 书架页操作区：搜索占位、收藏占位、更多菜单、书架布局对话框
 */

import { createSignal, onMount, Show } from 'solid-js';
import { withBlurBefore, blurActiveElement } from '@/utils/accessibility';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SearchIcon,
  StarIcon,
  MoreIcon,
  RefreshIcon,
  FolderPlusIcon,
  GlobeIcon,
  LinkIcon,
  Settings2Icon,
  LayoutIcon,
  FolderTreeIcon,
  DownloadIcon,
  UploadIcon,
  ImportIcon,
  FileTextIcon,
} from '@/components/icons';
import { BookshelfLayoutDialog } from '@/components/BookshelfLayoutDialog';
import type { PageType } from '@/components/Navigation';

export interface BookshelfPageToolbarProps {
  onPageChange?: (page: PageType) => void;
  onOpenGroupManage?: () => void;
  onImportLocal?: () => void;
  onAddBookByUrl?: () => void;
}

export function BookshelfPageToolbar(props: BookshelfPageToolbarProps) {
  const [moreMenuOpen, setMoreMenuOpen] = createSignal(false);
  const [showBookshelfLayoutDialog, setShowBookshelfLayoutDialog] = createSignal(false);

  onMount(() => {
    const handleDialogOpened = () => {
      setMoreMenuOpen(false);
      blurActiveElement();
    };
    window.addEventListener('dialog-opened', handleDialogOpened);
    return () => window.removeEventListener('dialog-opened', handleDialogOpened);
  });

  return (
    <>
      <Tooltip>
        <TooltipTrigger as={Button} variant="ghost" size="icon" class="h-9 w-9 shrink-0">
          <SearchIcon class="h-4 w-4" />
          <span class="sr-only">搜索</span>
        </TooltipTrigger>
        <TooltipContent>搜索</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger as={Button} variant="ghost" size="icon" class="h-9 w-9">
          <StarIcon class="h-4 w-4" />
          <span class="sr-only">收藏</span>
        </TooltipTrigger>
        <TooltipContent>收藏</TooltipContent>
      </Tooltip>

      <DropdownMenu open={moreMenuOpen()} onOpenChange={setMoreMenuOpen}>
        <Tooltip>
          <TooltipTrigger as="div">
            <DropdownMenuTrigger
              as={(triggerProps: Record<string, unknown>) => (
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-9 w-9"
                  onClick={withBlurBefore(triggerProps.onClick as (() => void) | undefined)}
                  {...triggerProps}
                >
                  <MoreIcon class="h-4 w-4" />
                  <span class="sr-only">更多</span>
                </Button>
              )}
            />
          </TooltipTrigger>
          <TooltipContent>更多</TooltipContent>
        </Tooltip>
        <DropdownMenuContent class="min-w-0 w-auto">
          <DropdownMenuItem>
            <RefreshIcon class="h-4 w-4" />
            <span>更新目录</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setMoreMenuOpen(false);
              blurActiveElement();
              props.onImportLocal?.();
            }}
          >
            <FolderPlusIcon class="h-4 w-4" />
            <span>添加本地</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setMoreMenuOpen(false);
              blurActiveElement();
              props.onPageChange?.('remote-book');
            }}
          >
            <GlobeIcon class="h-4 w-4" />
            <span>远程书籍</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setMoreMenuOpen(false);
              blurActiveElement();
              props.onAddBookByUrl?.();
            }}
          >
            <LinkIcon class="h-4 w-4" />
            <span>添加网址</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <Settings2Icon class="h-4 w-4" />
            <span>书架管理</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setMoreMenuOpen(false);
              blurActiveElement();
              setShowBookshelfLayoutDialog(true);
            }}
          >
            <LayoutIcon class="h-4 w-4" />
            <span>书架布局</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setMoreMenuOpen(false);
              blurActiveElement();
              props.onOpenGroupManage?.();
            }}
          >
            <FolderTreeIcon class="h-4 w-4" />
            <span>分组管理</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <DownloadIcon class="h-4 w-4" />
            <span>缓存导出</span>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <UploadIcon class="h-4 w-4" />
            <span>导出书单</span>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <ImportIcon class="h-4 w-4" />
            <span>导入书单</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <FileTextIcon class="h-4 w-4" />
            <span>查看日志</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <BookshelfLayoutDialog
        open={showBookshelfLayoutDialog()}
        onOpenChange={(open) => {
          setShowBookshelfLayoutDialog(open);
          if (open) {
            window.dispatchEvent(new CustomEvent('dialog-opened'));
          }
        }}
      />
    </>
  );
}
