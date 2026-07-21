/**
 * 阅读器「更多」菜单（对齐 Legado book_read.xml 溢出项）
 */

import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import { isLocalBookContentEditable } from '@/lib/chapter-cache/read-chapter-raw-for-edit';
import { EffectiveReplacesDialog } from '@/components/media/reader/replace-rules/EffectiveReplacesDialog';
import { ContentEditDialog } from '@/components/media/viewer/text/ContentEditDialog';
import { BookPageAnimDialog } from '@/components/media/viewer/text/BookPageAnimDialog';
import { BookThemeOverrideDialog } from '@/components/media/viewer/text/BookThemeOverrideDialog';
import { SimulatedReadingDialog } from '@/components/media/viewer/text/SimulatedReadingDialog';
import { isLocalBook } from '@/lib/local-book';
import { clickCustomButton } from '@/lib/book-source/source-callback';
import { getSource } from '@/lib/database/sources';
import {
  AppDropdownMenu,
  AppDropdownMenuCheckboxItem,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { ViewerAppDropdownMenuContent } from '@/components/media/viewer/viewer-app-overlay';
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
  const [themeOverrideOpen, setThemeOverrideOpen] = createSignal(false);
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
  const [sourceHasCustomButton, setSourceHasCustomButton] = createSignal(false);

  createEffect(() => {
    const origin = textViewerStore.state.book?.origin;
    if (!origin) {
      setSourceHasCustomButton(false);
      return;
    }
    let cancelled = false;
    void getSource(origin).then((src) => {
      if (!cancelled) setSourceHasCustomButton(!!src?.customButton);
    });
    onCleanup(() => {
      cancelled = true;
    });
  });

  const handleCustomButton = async () => {
    setOpen(false);
    const book = textViewerStore.state.book;
    if (!book?.origin) return;
    const src = await getSource(book.origin);
    const chapter = textViewerStore.state.catalog[textViewerStore.state.chapterIndex];
    const handled = await clickCustomButton(src, book, chapter);
    if (!handled) {
      showAppToast({
        title: '自定义按钮',
        description: src?.eventListener
          ? '回调未返回成功，或未配置 callBackJs'
          : '请开启书源「事件监听」并配置 callBackJs',
        variant: 'default',
      });
    }
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
          <AppDropdownMenuItem
            onSelect={() => {
              setOpen(false);
              setThemeOverrideOpen(true);
            }}
          >
            本书阅读主题
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
          <Show when={sourceHasCustomButton()}>
            <AppDropdownMenuItem onSelect={() => void handleCustomButton()}>
              源操作
            </AppDropdownMenuItem>
          </Show>
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
      <BookThemeOverrideDialog open={themeOverrideOpen()} onOpenChange={setThemeOverrideOpen} />
      <SimulatedReadingDialog open={simulatedOpen()} onOpenChange={setSimulatedOpen} />
    </>
  );
}
