/**
 * 阅读器「更多」菜单（对齐 Legado book_read 溢出项子集）
 */

import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
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
  AppManualRadioGroup,
  AppManualRadioOption,
} from '@/components/shared/AppManualRadio';
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
import {
  TEXT_VIEWER_AUTO_PAGE_STYLE_LABELS,
  TEXT_VIEWER_AUTO_PAGE_PROGRESS_EDGE_LABELS,
  type TextViewerAutoPageStyle,
  type TextViewerAutoPageProgressEdge,
} from '@/lib/media/text/text-viewer-auto-pager';

export interface ReaderMoreMenuProps {
  onOpenSearch: () => void;
  onOpenBookmarks: () => void;
  onAddBookmark: () => void;
  onOpenDict?: () => void;
  canBookmark: boolean;
  autoPageActive?: boolean | (() => boolean);
  onAutoPageToggle?: (enabled: boolean) => void;
  /** 双页排版下不可开启自动翻页 */
  autoPageBlocked?: boolean | (() => boolean);
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
  const chineseConverterType = () => textViewerStore.getChineseConverterType();
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

  const isAutoPageActive = () => {
    const v = props.autoPageActive;
    return typeof v === 'function' ? v() : (v ?? false);
  };

  const isAutoPageBlocked = () => {
    const v = props.autoPageBlocked;
    return typeof v === 'function' ? v() : (v ?? false);
  };

  const autoPageStyle = () => textViewerStore.state.config.autoPageStyle ?? 'scanLine';
  const autoPageProgressEdge = () =>
    textViewerStore.state.config.autoPageProgressEdge ?? 'bottom';

  const setAutoPageStyle = (style: TextViewerAutoPageStyle) => {
    textViewerStore.setConfig({ autoPageStyle: style });
  };

  const setAutoPageProgressEdge = (edge: TextViewerAutoPageProgressEdge) => {
    textViewerStore.setConfig({ autoPageProgressEdge: edge });
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
        <Show when={props.onAutoPageToggle}>
          <AppDropdownMenuCheckboxItem
            checked={isAutoPageActive() && !isAutoPageBlocked()}
            onChange={(checked) => {
              if (isAutoPageBlocked()) return;
              props.onAutoPageToggle?.(checked);
            }}
            class={isAutoPageBlocked() ? 'opacity-50' : undefined}
          >
            自动翻页
            <Show when={isAutoPageBlocked()}>
              <span class="ml-1 text-xs text-muted-foreground">（双页不可用）</span>
            </Show>
          </AppDropdownMenuCheckboxItem>
        </Show>
        <div class="px-2 py-1.5">
          <div class="mb-1 px-2 text-xs text-muted-foreground">自动翻页方式（按页模式）</div>
          <AppManualRadioGroup>
            <For each={['scanLine', 'progressBar', 'reveal'] as TextViewerAutoPageStyle[]}>
              {(style) => (
                <AppManualRadioOption
                  selected={autoPageStyle() === style}
                  onSelect={() => setAutoPageStyle(style)}
                >
                  {TEXT_VIEWER_AUTO_PAGE_STYLE_LABELS[style]}
                </AppManualRadioOption>
              )}
            </For>
          </AppManualRadioGroup>
          <Show when={autoPageStyle() === 'progressBar'}>
            <div class="mt-2 mb-1 px-2 text-xs text-muted-foreground">进度条位置</div>
            <AppManualRadioGroup>
              <For each={['top', 'bottom'] as TextViewerAutoPageProgressEdge[]}>
                {(edge) => (
                  <AppManualRadioOption
                    selected={autoPageProgressEdge() === edge}
                    onSelect={() => setAutoPageProgressEdge(edge)}
                  >
                    {TEXT_VIEWER_AUTO_PAGE_PROGRESS_EDGE_LABELS[edge]}
                  </AppManualRadioOption>
                )}
              </For>
            </AppManualRadioGroup>
          </Show>
        </div>
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
        <div class="px-2 py-1.5">
          <div class="mb-1 px-2 text-xs text-muted-foreground">简繁转换</div>
          <AppManualRadioGroup>
            <AppManualRadioOption
              selected={chineseConverterType() === 0}
              onSelect={() => void handleChineseConverter(0)}
            >
              不转换
            </AppManualRadioOption>
            <AppManualRadioOption
              selected={chineseConverterType() === 1}
              onSelect={() => void handleChineseConverter(1)}
            >
              繁转简
            </AppManualRadioOption>
            <AppManualRadioOption
              selected={chineseConverterType() === 2}
              onSelect={() => void handleChineseConverter(2)}
            >
              简转繁
            </AppManualRadioOption>
          </AppManualRadioGroup>
        </div>
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
