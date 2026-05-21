/**
 * 书源页操作区：可展开搜索、更多菜单（新建/导入/分组/搜索模式）
 */

import { createSignal, createEffect, onMount, Show } from 'solid-js';
import { blurActiveElement } from '@/utils/accessibility';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { Checkbox } from '@/components/ui/checkbox';
import {
  SearchIcon,
  StarIcon,
  MoreIcon,
  FileTextIcon,
  FolderPlusIcon,
  LinkIcon,
  QrCodeIcon,
  FolderTreeIcon,
} from '@/components/shared/icons';
import { isSourceFilterOrAll, type SourceSearchMode } from '@/lib/sources/filters';

export interface SourcesPageToolbarProps {
  sourceSearchQuery?: string;
  onSourceSearchQueryChange?: (query: string) => void;
  sourceSearchMode?: SourceSearchMode;
  onSourceSearchModeChange?: (mode: SourceSearchMode) => void;
  currentSourceGroup?: string | null;
  sourcesGroupByGroupName?: boolean;
  onSourcesGroupByGroupNameChange?: (value: boolean) => void;
  onSourcesNew?: () => void;
  onSourcesImportLocal?: () => void;
  onSourcesImportNetwork?: () => void;
  onSourcesImportQR?: () => void;
  showSourcesImportQR?: boolean;
  onOpenSourceGroupManage?: () => void;
}

/** 菜单内单选指示：外圈始终可见，选中时叠加内点（对齐 RadioGroup 细线样式） */
function MenuRadioIndicator(props: { selected: boolean }) {
  return (
    <span
      class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none"
      aria-label={props.selected ? '已选' : '未选'}
    >
      <span class="relative flex size-4 items-center justify-center" aria-hidden>
        <span class="size-4 rounded-full border border-primary" />
        <Show when={props.selected}>
          <span class="absolute size-2 rounded-full bg-primary" />
        </Show>
      </span>
    </span>
  );
}

export function SourcesPageToolbar(props: SourcesPageToolbarProps) {
  const [moreMenuOpen, setMoreMenuOpen] = createSignal(false);
  const [sourceSearchExpanded, setSourceSearchExpanded] = createSignal(false);
  const sourceSearchQueryRef: { current: string } = { current: '' };
  const sourceSearchModeRef: { current: SourceSearchMode } = { current: 'name' };

  createEffect(() => {
    sourceSearchQueryRef.current = props.sourceSearchQuery ?? '';
    if ((props.sourceSearchQuery ?? '').trim()) setSourceSearchExpanded(true);
  });

  createEffect(() => {
    sourceSearchModeRef.current = props.sourceSearchMode ?? 'name';
  });

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
      <Show
        when={sourceSearchExpanded()}
        fallback={
          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="h-9 w-9 shrink-0"
              onClick={() => setSourceSearchExpanded(true)}
            >
              <SearchIcon class="h-4 w-4" />
              <span class="sr-only">搜索</span>
            </TooltipTrigger>
            <TooltipContent>搜索</TooltipContent>
          </Tooltip>
        }
      >
        <div class="relative flex h-9 w-40 sm:w-52 items-center rounded-md border border-input bg-transparent text-sm">
          <SearchIcon class="absolute left-2.5 h-4 w-4 shrink-0 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="搜索书源"
            value={props.sourceSearchQuery ?? ''}
            onInput={(e) => {
              const v = e.currentTarget.value;
              sourceSearchQueryRef.current = v;
              props.onSourceSearchQueryChange?.(v);
            }}
            onBlur={() => {
              if (!sourceSearchQueryRef.current.trim()) setSourceSearchExpanded(false);
            }}
            class="h-full w-full flex-1 bg-transparent pl-9 pr-3 py-2 placeholder:text-muted-foreground focus-visible:outline-none rounded-md"
            aria-label="搜索书源"
          />
        </div>
      </Show>

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
              props.onSourcesNew?.();
            }}
          >
            <FileTextIcon class="h-4 w-4" />
            <span>新建书源</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => {
              setMoreMenuOpen(false);
              blurActiveElement();
              props.onSourcesImportLocal?.();
            }}
          >
            <FolderPlusIcon class="h-4 w-4" />
            <span>本地导入</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => {
              setMoreMenuOpen(false);
              blurActiveElement();
              props.onSourcesImportNetwork?.();
            }}
          >
            <LinkIcon class="h-4 w-4" />
            <span>网络导入</span>
          </AppDropdownMenuItem>
          <Show when={props.showSourcesImportQR}>
            <AppDropdownMenuItem
              onSelect={() => {
                setMoreMenuOpen(false);
                blurActiveElement();
                props.onSourcesImportQR?.();
              }}
            >
              <QrCodeIcon class="h-4 w-4" />
              <span>二维码导入</span>
            </AppDropdownMenuItem>
          </Show>
          <AppDropdownMenuItem
            onSelect={() => {
              setMoreMenuOpen(false);
              blurActiveElement();
              props.onOpenSourceGroupManage?.();
            }}
          >
            <FolderTreeIcon class="h-4 w-4" />
            <span>分组管理</span>
          </AppDropdownMenuItem>
          <Show when={isSourceFilterOrAll(props.currentSourceGroup ?? null)}>
            <AppDropdownMenuItem
              onSelect={() => props.onSourcesGroupByGroupNameChange?.(!props.sourcesGroupByGroupName)}
              class="flex items-center gap-2"
            >
              <span class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none">
                <Checkbox checked={!!props.sourcesGroupByGroupName} aria-label="按分组名显示" />
              </span>
              <span>按分组名显示</span>
            </AppDropdownMenuItem>
          </Show>
          <AppDropdownMenuItem
            onSelect={() =>
              props.onSourceSearchModeChange?.(sourceSearchModeRef.current === 'fuzzy' ? 'name' : 'fuzzy')
            }
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={props.sourceSearchMode === 'fuzzy'} />
            <span>模糊搜索</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() =>
              props.onSourceSearchModeChange?.(sourceSearchModeRef.current === 'extended' ? 'name' : 'extended')
            }
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={props.sourceSearchMode === 'extended'} />
            <span>扩展搜索规则</span>
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </>
  );
}
