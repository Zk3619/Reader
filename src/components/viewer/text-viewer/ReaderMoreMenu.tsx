/**
 * 阅读器「更多」菜单（对齐 Legado book_read.xml 溢出项）
 */

import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import { isLocalBookContentEditable } from '@/lib/chapter-cache/read-chapter-raw-for-edit';
import { EffectiveReplacesDialog } from '@/components/replace-rules/EffectiveReplacesDialog';
import { ContentEditDialog } from '@/components/viewer/text-viewer/ContentEditDialog';
import { BookPageAnimDialog } from '@/components/viewer/text-viewer/BookPageAnimDialog';
import { SimulatedReadingDialog } from '@/components/viewer/text-viewer/SimulatedReadingDialog';
import { isLocalBook } from '@/lib/local-book';
import {
  AppDropdownMenu,
  AppDropdownMenuCheckboxItem,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { ViewerAppDropdownMenuContent } from '@/components/viewer/viewer-app-overlay';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { MoreIcon } from '@/components/shared/icons';
import { showAppToast } from '@/components/shared/AppToasts';
import { blurActiveElement } from '@/utils/accessibility';
import { cn } from '@/lib/utils';
import { themeStudioStore } from '@/stores/theme-studio';

export interface ReaderMoreMenuProps {
  onOpenBookmarks: () => void;
  onAddBookmark: () => void;
  canBookmark: boolean;
  onOpenThemeStudio?: () => void;
  onUpdateToc?: () => void;
  canUpdateToc?: boolean | (() => boolean);
  /** 阅读器叠层是否栈顶可见；传给起效的替换对话框 */
  shellActive?: boolean;
  triggerClass?: string;
}

export function ReaderMoreMenu(props: ReaderMoreMenuProps) {
  const [open, setOpen] = createSignal(false);
  const [effectiveOpen, setEffectiveOpen] = createSignal(false);
  const [contentEditOpen, setContentEditOpen] = createSignal(false);
  const [pageAnimOpen, setPageAnimOpen] = createSignal(false);
  const [simulatedOpen, setSimulatedOpen] = createSignal(false);

  const replaceEnabled = () => textViewerStore.isUseReplaceRule();
  const reSegmentEnabled = () => textViewerStore.isReSegment();
  const removeDuplicateTitleEnabled = () => textViewerStore.isRemoveDuplicateTitle();
  const canEditCachedContent = () => {
    const book = textViewerStore.state.book;
    return !!book && isLocalBookContentEditable(book);
  };
  const canReverseContent = () => {
    const book = textViewerStore.state.book;
    return !!book && !isLocalBook(book);
  };
  const canUpdateToc = () => {
    const v = props.canUpdateToc;
    return typeof v === 'function' ? v() : (v ?? false);
  };

  onMount(() => {
    const handleDialogOpened = () => {
      setOpen(false);
      blurActiveElement();
    };
    window.addEventListener('dialog-opened', handleDialogOpened);
    onCleanup(() => {
      window.removeEventListener('dialog-opened', handleDialogOpened);
    });
  });

  const handleToggleReplace = async (enabled: boolean) => {
    try {
      await textViewerStore.setUseReplaceRule(enabled);
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleReSegment = async (enabled: boolean) => {
    try {
      await textViewerStore.setReSegment(enabled);
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleRemoveDuplicateTitle = async (enabled: boolean) => {
    try {
      await textViewerStore.setRemoveDuplicateTitle(enabled);
    } catch (e) {
      console.error(e);
    }
  };

  const openContentEdit = () => {
    setOpen(false);
    setContentEditOpen(true);
  };

  const handleReverseContent = async () => {
    setOpen(false);
    try {
      await textViewerStore.reverseChapterContent();
    } catch (e) {
      showAppToast({
        title: '翻转失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <AppDropdownMenu open={open()} onOpenChange={setOpen}>
        <AppTooltip>
          <AppTooltipTrigger as="div">
            <AppDropdownMenuTrigger
              as={(triggerProps: Record<string, unknown>) => (
                <AppDropdownMenuIconTrigger
                  triggerProps={triggerProps}
                  class={cn('no-drag', props.triggerClass)}
                  aria-label="更多"
                >
                  <MoreIcon class="size-5" />
                </AppDropdownMenuIconTrigger>
              )}
            />
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">更多</AppTooltipContent>
        </AppTooltip>
        <ViewerAppDropdownMenuContent layout="min" align="end">
          <Show when={props.canBookmark}>
            <AppDropdownMenuItem onSelect={props.onAddBookmark}>添加书签</AppDropdownMenuItem>
            <AppDropdownMenuItem onSelect={props.onOpenBookmarks}>本书书签</AppDropdownMenuItem>
          </Show>
          <AppDropdownMenuItem
            onSelect={() => {
              setOpen(false);
              props.onOpenThemeStudio?.();
              themeStudioStore.openStudio({ entry: 'reader', scope: 'viewer' });
            }}
          >
            阅读器主题
          </AppDropdownMenuItem>
          <AppDropdownMenuItem disabled={!canEditCachedContent()} onSelect={openContentEdit}>
            编辑正文
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => {
              setOpen(false);
              setPageAnimOpen(true);
            }}
          >
            本书翻页动画
          </AppDropdownMenuItem>
          <Show when={canReverseContent()}>
            <AppDropdownMenuItem onSelect={() => void handleReverseContent()}>
              翻转内容
            </AppDropdownMenuItem>
          </Show>
          <AppDropdownMenuItem
            onSelect={() => {
              setOpen(false);
              setSimulatedOpen(true);
            }}
          >
            模拟追更
          </AppDropdownMenuItem>
          <AppDropdownMenuCheckboxItem
            checked={replaceEnabled()}
            onChange={(checked) => void handleToggleReplace(checked)}
          >
            替换净化
          </AppDropdownMenuCheckboxItem>
          <AppDropdownMenuItem
            onSelect={() => {
              setOpen(false);
              setEffectiveOpen(true);
            }}
          >
            起效的替换
          </AppDropdownMenuItem>
          <AppDropdownMenuCheckboxItem
            checked={removeDuplicateTitleEnabled()}
            onChange={(checked) => void handleToggleRemoveDuplicateTitle(checked)}
          >
            移除重复标题
          </AppDropdownMenuCheckboxItem>
          <AppDropdownMenuCheckboxItem
            checked={reSegmentEnabled()}
            onChange={(checked) => void handleToggleReSegment(checked)}
          >
            重新分段
          </AppDropdownMenuCheckboxItem>
          <Show when={canUpdateToc()}>
            <AppDropdownMenuItem
              onSelect={() => {
                setOpen(false);
                props.onUpdateToc?.();
              }}
            >
              更新目录
            </AppDropdownMenuItem>
          </Show>
        </ViewerAppDropdownMenuContent>
      </AppDropdownMenu>

      <EffectiveReplacesDialog
        open={effectiveOpen()}
        onOpenChange={setEffectiveOpen}
        shellActive={props.shellActive}
      />
      <ContentEditDialog open={contentEditOpen()} onOpenChange={setContentEditOpen} />
      <BookPageAnimDialog open={pageAnimOpen()} onOpenChange={setPageAnimOpen} />
      <SimulatedReadingDialog open={simulatedOpen()} onOpenChange={setSimulatedOpen} />
    </>
  );
}
