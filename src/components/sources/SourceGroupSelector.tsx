/**
 * 书源页分组/筛选：以 PageToolbar 标题+描述为触发的下拉
 */

import { For, type JSX } from 'solid-js';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import {
  SOURCE_FILTER_ENABLED,
  SOURCE_FILTER_DISABLED,
  SOURCE_FILTER_NEED_LOGIN,
  SOURCE_FILTER_UNGROUPED,
  SOURCE_FILTER_DISCOVER_ENABLED,
  SOURCE_FILTER_DISCOVER_DISABLED,
} from '@/lib/sources/filters';

const FILTER_ITEMS: { value: string | null; label: string }[] = [
  { value: null, label: '全部' },
  { value: SOURCE_FILTER_ENABLED, label: '已启用' },
  { value: SOURCE_FILTER_DISABLED, label: '已禁用' },
  { value: SOURCE_FILTER_NEED_LOGIN, label: '需要登录' },
  { value: SOURCE_FILTER_UNGROUPED, label: '未分组' },
  { value: SOURCE_FILTER_DISCOVER_ENABLED, label: '已启用发现' },
  { value: SOURCE_FILTER_DISCOVER_DISABLED, label: '已禁用发现' },
];

function isSelected(current: string | null | undefined, value: string | null) {
  if (value == null) return current == null || current === '';
  return current === value;
}

const filterItemClass =
  'min-h-12 cursor-pointer rounded-md px-2.5 py-2.5 text-sm font-medium';

function SourceGroupMenuList(props: {
  sourceGroups?: string[];
  currentSourceGroup?: string | null;
  onSourceGroupChange?: (group: string | null) => void;
}) {
  return (
    <>
      <For each={FILTER_ITEMS}>
        {(item) => (
          <DropdownMenuItem
            class={cn(
              filterItemClass,
              isSelected(props.currentSourceGroup, item.value) && 'bg-accent/50'
            )}
            onSelect={() => props.onSourceGroupChange?.(item.value)}
          >
            <span class="block min-w-0 flex-1 truncate">{item.label}</span>
          </DropdownMenuItem>
        )}
      </For>
      <For each={props.sourceGroups ?? []}>
        {(groupName) => (
          <DropdownMenuItem
            class={cn(
              filterItemClass,
              props.currentSourceGroup === groupName && 'bg-accent/50'
            )}
            onSelect={() => props.onSourceGroupChange?.(groupName)}
          >
            <span class="block min-w-0 flex-1 truncate" title={groupName}>
              {groupName}
            </span>
          </DropdownMenuItem>
        )}
      </For>
    </>
  );
}

export interface SourceGroupTitleDropdownProps {
  title: string;
  description?: string | JSX.Element;
  sourceGroups?: string[];
  currentSourceGroup?: string | null;
  onSourceGroupChange?: (group: string | null) => void;
}

/** 以 PageToolbar 标题+描述为触发的书源分组/筛选下拉 */
export function SourceGroupTitleDropdown(props: SourceGroupTitleDropdownProps) {
  return (
    <PageToolbarTitleDropdown
      title={props.title}
      description={props.description}
      selectionKey={props.currentSourceGroup ?? 'all'}
    >
      <SourceGroupMenuList
        sourceGroups={props.sourceGroups}
        currentSourceGroup={props.currentSourceGroup}
        onSourceGroupChange={props.onSourceGroupChange}
      />
    </PageToolbarTitleDropdown>
  );
}
