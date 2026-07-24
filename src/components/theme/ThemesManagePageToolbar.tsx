/**
 * 主题管理页 PageToolbar 操作区
 */

import { createSignal, onMount, Show, For } from 'solid-js';
import { blurActiveElement } from '@/utils/accessibility';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { ExpandableIconSearch } from '@/components/shared/ExpandableIconSearch';
import {
  MoreIcon,
  FileTextIcon,
  FolderPlusIcon,
  LinkIcon,
  CodeIcon,
  ChevronLeftIcon,
  SettingsIcon,
} from '@/components/shared/icons';

export type ThemeManageSortMode = 'updated' | 'name' | 'kind';

export interface ThemesManagePageToolbarProps {
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  sortMode: ThemeManageSortMode;
  onSortModeChange: (mode: ThemeManageSortMode) => void;
  onThemesNew?: () => void;
  onThemesImportLocal?: () => void;
  onThemesImportNetwork?: () => void;
  onThemesImportCode?: () => void;
  onOpenThemeStudio?: () => void;
}

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

export function ThemesManageToolbarLeading(props: { onBack: () => void }) {
  return (
    <AppTooltip>
      <AppTooltipTrigger
        as={Button}
        variant="ghost"
        size="icon"
        class="h-9 w-9 shrink-0"
        onClick={props.onBack}
        aria-label="返回设置"
        type="button"
      >
        <ChevronLeftIcon class="h-4 w-4" />
      </AppTooltipTrigger>
      <AppTooltipContent>返回设置</AppTooltipContent>
    </AppTooltip>
  );
}

const SORT_OPTIONS: { value: ThemeManageSortMode; label: string }[] = [
  { value: 'updated', label: '最近更新' },
  { value: 'name', label: '名称' },
  { value: 'kind', label: '来源' },
];

export function ThemesManagePageToolbar(props: ThemesManagePageToolbarProps) {
  const [moreMenuOpen, setMoreMenuOpen] = createSignal(false);

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
      <ExpandableIconSearch
        value={props.searchQuery ?? ''}
        onValueChange={(v) => props.onSearchQueryChange?.(v)}
        placeholder="搜索主题"
        tooltip="搜索"
        aria-label="搜索主题"
      />

      <AppDropdownMenu>
        <AppTooltip>
          <AppTooltipTrigger as="div">
            <AppDropdownMenuTrigger
              as={(triggerProps: Record<string, unknown>) => (
                <AppDropdownMenuIconTrigger triggerProps={triggerProps}>
                  <span class="sr-only">排序</span>
                  <span class="text-xs font-medium">
                    {SORT_OPTIONS.find((o) => o.value === props.sortMode)?.label ?? '排序'}
                  </span>
                </AppDropdownMenuIconTrigger>
              )}
            />
          </AppTooltipTrigger>
          <AppTooltipContent>排序</AppTooltipContent>
        </AppTooltip>
        <AppDropdownMenuContent layout="compact">
          <For each={SORT_OPTIONS}>
            {(opt) => (
              <AppDropdownMenuItem
                onSelect={() => props.onSortModeChange(opt.value)}
                class="flex items-center gap-2"
              >
                <MenuRadioIndicator selected={props.sortMode === opt.value} />
                <span>{opt.label}</span>
              </AppDropdownMenuItem>
            )}
          </For>
        </AppDropdownMenuContent>
      </AppDropdownMenu>

      <AppDropdownMenu open={moreMenuOpen()} onOpenChange={setMoreMenuOpen}>
        <AppTooltip>
          <AppTooltipTrigger as="div">
            <AppDropdownMenuTrigger
              as={(triggerProps: Record<string, unknown>) => (
                <AppDropdownMenuIconTrigger triggerProps={triggerProps}>
                  <MoreIcon class="h-4 w-4" />
                  <span class="sr-only">更多</span>
                </AppDropdownMenuIconTrigger>
              )}
            />
          </AppTooltipTrigger>
          <AppTooltipContent>更多</AppTooltipContent>
        </AppTooltip>
        <AppDropdownMenuContent layout="compact">
          <AppDropdownMenuItem onSelect={() => props.onThemesNew?.()}>
            <FileTextIcon class="h-4 w-4" />
            <span>新建主题</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={() => props.onThemesImportLocal?.()}>
            <FolderPlusIcon class="h-4 w-4" />
            <span>本地导入</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={() => props.onThemesImportNetwork?.()}>
            <LinkIcon class="h-4 w-4" />
            <span>网络导入</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={() => props.onThemesImportCode?.()}>
            <CodeIcon class="h-4 w-4" />
            <span>代码导入</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={() => props.onOpenThemeStudio?.()}>
            <SettingsIcon class="h-4 w-4" />
            <span>打开主题工作室</span>
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </>
  );
}
