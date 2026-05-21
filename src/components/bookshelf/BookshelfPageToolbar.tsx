/**
 * 书架页操作区：搜索占位、收藏占位、更多菜单、书架布局对话框
 */

import { createSignal, onMount } from 'solid-js';
import { blurActiveElement } from '@/utils/accessibility';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
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
} from '@/components/shared/icons';
import { BookshelfLayoutDialog } from '@/components/bookshelf/BookshelfLayoutDialog';
import type { PageType } from '@/components/shell/Navigation';

export interface BookshelfPageToolbarProps {
  onPageChange?: (page: PageType) => void;
  onOpenGroupManage?: () => void;
  onImportLocal?: () => void;
  onAddBookByUrl?: () => void;
  /** 更新当前分组内可更新的在线书籍目录 */
  onUpdateToc?: () => void;
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

      <AppDropdownMenu open={moreMenuOpen()} onOpenChange={setMoreMenuOpen}>
        <Tooltip>
          <TooltipTrigger as="div">
            <AppDropdownMenuTrigger
              as={(triggerProps: Record<string, unknown>) => (
                <AppDropdownMenuIconTrigger triggerProps={triggerProps}>
                  <MoreIcon class="h-4 w-4" />
                  <span class="sr-only">更多</span>
                </AppDropdownMenuIconTrigger>
              )}
            />
          </TooltipTrigger>
          <TooltipContent>更多</TooltipContent>
        </Tooltip>
        <AppDropdownMenuContent layout="compact">
          <AppDropdownMenuItem
            onSelect={() => {
              setMoreMenuOpen(false);
              blurActiveElement();
              props.onUpdateToc?.();
            }}
          >
            <RefreshIcon class="h-4 w-4" />
            <span>更新目录</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => {
              setMoreMenuOpen(false);
              blurActiveElement();
              props.onImportLocal?.();
            }}
          >
            <FolderPlusIcon class="h-4 w-4" />
            <span>添加本地</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => {
              setMoreMenuOpen(false);
              blurActiveElement();
              props.onPageChange?.('remote-book');
            }}
          >
            <GlobeIcon class="h-4 w-4" />
            <span>远程书籍</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => {
              setMoreMenuOpen(false);
              blurActiveElement();
              props.onAddBookByUrl?.();
            }}
          >
            <LinkIcon class="h-4 w-4" />
            <span>添加网址</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem>
            <Settings2Icon class="h-4 w-4" />
            <span>书架管理</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => {
              setMoreMenuOpen(false);
              requestAnimationFrame(() => {
                blurActiveElement();
                requestAnimationFrame(() => setShowBookshelfLayoutDialog(true));
              });
            }}
          >
            <LayoutIcon class="h-4 w-4" />
            <span>书架布局</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => {
              setMoreMenuOpen(false);
              blurActiveElement();
              props.onOpenGroupManage?.();
            }}
          >
            <FolderTreeIcon class="h-4 w-4" />
            <span>分组管理</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem>
            <DownloadIcon class="h-4 w-4" />
            <span>缓存导出</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem>
            <UploadIcon class="h-4 w-4" />
            <span>导出书单</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem>
            <ImportIcon class="h-4 w-4" />
            <span>导入书单</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem>
            <FileTextIcon class="h-4 w-4" />
            <span>查看日志</span>
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>

      <BookshelfLayoutDialog
        open={showBookshelfLayoutDialog()}
        onOpenChange={setShowBookshelfLayoutDialog}
      />
    </>
  );
}
