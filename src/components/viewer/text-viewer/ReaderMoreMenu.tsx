/**
 * 阅读器「更多」菜单（对齐 Legado book_read 溢出项子集）
 */

import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
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
  const replaceEnabled = () => textViewerStore.isUseReplaceRule();

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

  return (
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
      </ViewerAppDropdownMenuContent>
    </AppDropdownMenu>
  );
}
