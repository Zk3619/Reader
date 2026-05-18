/**
 * 书源页操作区：可展开搜索、更多菜单（新建/导入/分组/搜索模式）
 */

import { createSignal, createEffect, onMount, Show } from 'solid-js';
import { withBlurBefore, blurActiveElement } from '@/utils/accessibility';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  SearchIcon,
  StarIcon,
  MoreIcon,
  FileTextIcon,
  FolderPlusIcon,
  LinkIcon,
  QrCodeIcon,
  FolderTreeIcon,
} from '@/components/icons';
import { isSourceFilterOrAll, type SourceSearchMode } from '@/lib/sources-filters';

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
          <DropdownMenuItem
            onSelect={() => {
              setMoreMenuOpen(false);
              blurActiveElement();
              props.onSourcesNew?.();
            }}
          >
            <FileTextIcon class="h-4 w-4" />
            <span>新建书源</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setMoreMenuOpen(false);
              blurActiveElement();
              props.onSourcesImportLocal?.();
            }}
          >
            <FolderPlusIcon class="h-4 w-4" />
            <span>本地导入</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setMoreMenuOpen(false);
              blurActiveElement();
              props.onSourcesImportNetwork?.();
            }}
          >
            <LinkIcon class="h-4 w-4" />
            <span>网络导入</span>
          </DropdownMenuItem>
          <Show when={props.showSourcesImportQR}>
            <DropdownMenuItem
              onSelect={() => {
                setMoreMenuOpen(false);
                blurActiveElement();
                props.onSourcesImportQR?.();
              }}
            >
              <QrCodeIcon class="h-4 w-4" />
              <span>二维码导入</span>
            </DropdownMenuItem>
          </Show>
          <DropdownMenuItem
            onSelect={() => {
              setMoreMenuOpen(false);
              blurActiveElement();
              props.onOpenSourceGroupManage?.();
            }}
          >
            <FolderTreeIcon class="h-4 w-4" />
            <span>分组管理</span>
          </DropdownMenuItem>
          <Show when={isSourceFilterOrAll(props.currentSourceGroup ?? null)}>
            <DropdownMenuItem
              onSelect={() => props.onSourcesGroupByGroupNameChange?.(!props.sourcesGroupByGroupName)}
              class="flex items-center gap-2"
            >
              <span class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none">
                <Checkbox checked={!!props.sourcesGroupByGroupName} aria-label="按分组名显示" />
              </span>
              <span>按分组名显示</span>
            </DropdownMenuItem>
          </Show>
          <DropdownMenuItem
            onSelect={() =>
              props.onSourceSearchModeChange?.(sourceSearchModeRef.current === 'fuzzy' ? 'name' : 'fuzzy')
            }
            class="flex items-center gap-2"
          >
            <span
              class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none"
              aria-label={props.sourceSearchMode === 'fuzzy' ? '已选' : '未选'}
            >
              <span
                class={cn(
                  'rounded-full border-2 border-primary',
                  props.sourceSearchMode === 'fuzzy' ? 'size-2.5 bg-primary' : 'size-4'
                )}
                aria-hidden
              />
            </span>
            <span>模糊搜索</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              props.onSourceSearchModeChange?.(sourceSearchModeRef.current === 'extended' ? 'name' : 'extended')
            }
            class="flex items-center gap-2"
          >
            <span
              class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none"
              aria-label={props.sourceSearchMode === 'extended' ? '已选' : '未选'}
            >
              <span
                class={cn(
                  'rounded-full border-2 border-primary',
                  props.sourceSearchMode === 'extended' ? 'size-2.5 bg-primary' : 'size-4'
                )}
                aria-hidden
              />
            </span>
            <span>扩展搜索规则</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
