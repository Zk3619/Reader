/**
 * 阅读器「更多」菜单（对齐 Legado book_read 溢出项子集）
 */

import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import { isLocalBookContentEditable } from '@/lib/chapter-cache/read-chapter-raw-for-edit';
import { EffectiveReplacesDialog } from '@/components/replace-rules/EffectiveReplacesDialog';
import { ContentEditDialog } from '@/components/viewer/text-viewer/ContentEditDialog';
import {
  AppDropdownMenu,
  AppDropdownMenuCheckboxItem,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import {
  ViewerAppDropdownMenuContent,
  ViewerAppTooltip,
  ViewerAppTooltipContent,
  ViewerAppTooltipTrigger,
} from '@/components/viewer/viewer-app-overlay';
import { MoreIcon } from '@/components/shared/icons';
import { blurActiveElement } from '@/utils/accessibility';
import { cn } from '@/lib/utils';
import type { ChineseConverterType } from '@/lib/replace-rules/chinese-converter';

export interface ReaderMoreMenuProps {
  onOpenSearch: () => void;
  onOpenBookmarks: () => void;
  onAddBookmark: () => void;
  onOpenDict?: () => void;
  canBookmark: boolean;
  /** 工具栏图标按钮 class（与 MediaViewer chrome 一致） */
  triggerClass?: string;
}

export function ReaderMoreMenu(props: ReaderMoreMenuProps) {
  const [open, setOpen] = createSignal(false);
  const [effectiveOpen, setEffectiveOpen] = createSignal(false);
  const [contentEditOpen, setContentEditOpen] = createSignal(false);
  const replaceEnabled = () => textViewerStore.isUseReplaceRule();
  const reSegmentEnabled = () => textViewerStore.isReSegment();
  const removeDuplicateTitleEnabled = () => textViewerStore.isRemoveDuplicateTitle();
  const chineseT2sEnabled = () => textViewerStore.getChineseConverterType() === 1;
  const chineseS2tEnabled = () => textViewerStore.getChineseConverterType() === 2;
  const canEditCachedContent = () => {
    const book = textViewerStore.state.book;
    return !!book && isLocalBookContentEditable(book);
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

  const handleChineseConverter = async (type: ChineseConverterType) => {
    try {
      await textViewerStore.setChineseConverterType(type);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
    <AppDropdownMenu open={open()} onOpenChange={setOpen}>
      <ViewerAppTooltip>
        <ViewerAppTooltipTrigger as="div">
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
        </ViewerAppTooltipTrigger>
        <ViewerAppTooltipContent>更多</ViewerAppTooltipContent>
      </ViewerAppTooltip>
      <ViewerAppDropdownMenuContent layout="min" align="end">
        <AppDropdownMenuItem onSelect={props.onOpenSearch}>全书搜索</AppDropdownMenuItem>
        <Show when={props.onOpenDict}>
          <AppDropdownMenuItem onSelect={() => props.onOpenDict?.()}>字典</AppDropdownMenuItem>
        </Show>
        <Show when={props.canBookmark}>
          <AppDropdownMenuItem onSelect={props.onAddBookmark}>添加书签</AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={props.onOpenBookmarks}>本书书签</AppDropdownMenuItem>
        </Show>
        <AppDropdownMenuCheckboxItem
          checked={replaceEnabled()}
          onChange={(checked) => void handleToggleReplace(checked)}
        >
          启用替换净化
        </AppDropdownMenuCheckboxItem>
        <AppDropdownMenuCheckboxItem
          checked={reSegmentEnabled()}
          onChange={(checked) => void handleToggleReSegment(checked)}
        >
          重新分段
        </AppDropdownMenuCheckboxItem>
        <AppDropdownMenuCheckboxItem
          checked={removeDuplicateTitleEnabled()}
          onChange={(checked) => void handleToggleRemoveDuplicateTitle(checked)}
        >
          去除重复标题
        </AppDropdownMenuCheckboxItem>
        <AppDropdownMenuCheckboxItem
          checked={chineseT2sEnabled()}
          onChange={(checked) => {
            void handleChineseConverter(checked ? 1 : chineseS2tEnabled() ? 2 : 0);
          }}
        >
          繁转简
        </AppDropdownMenuCheckboxItem>
        <AppDropdownMenuCheckboxItem
          checked={chineseS2tEnabled()}
          onChange={(checked) => {
            void handleChineseConverter(checked ? 2 : chineseT2sEnabled() ? 1 : 0);
          }}
        >
          简转繁
        </AppDropdownMenuCheckboxItem>
        <AppDropdownMenuItem
          onSelect={() => {
            setOpen(false);
            setEffectiveOpen(true);
          }}
        >
          生效的替换规则
        </AppDropdownMenuItem>
        <Show when={canEditCachedContent()}>
          <AppDropdownMenuItem
            onSelect={() => {
              setOpen(false);
              setContentEditOpen(true);
            }}
          >
            编辑正文
          </AppDropdownMenuItem>
        </Show>
      </ViewerAppDropdownMenuContent>
    </AppDropdownMenu>
    <EffectiveReplacesDialog open={effectiveOpen()} onOpenChange={setEffectiveOpen} />
    <ContentEditDialog open={contentEditOpen()} onOpenChange={setContentEditOpen} />
    </>
  );
}
