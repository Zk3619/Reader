/**
 * 书架分组切换：下拉（标题区触发）/ 标签（PageToolbar below）
 */

import { For, Show, createSignal, createEffect, onCleanup, type JSX } from 'solid-js';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { PageToolbarTitleDropdown } from '@/components/PageToolbarTitleDropdown';
import type { GroupStyle } from '@/stores/bookshelf-layout';
import type { BookGroup } from '@/types';
import { getCoverPreviewInfo } from '@/utils/book-group-cover';
import { BookCoverPlaceholderIcon } from '@/components/book-group-cover-icon';

const groupMenuItemClass =
  'min-h-12 cursor-pointer gap-3 rounded-md px-2.5 py-2.5';

function GroupCoverThumb(props: { group: BookGroup }) {
  const [imageError, setImageError] = createSignal(false);
  const info = () => getCoverPreviewInfo(props.group.cover);
  return (
    <div class="h-8 w-8 shrink-0 overflow-hidden rounded bg-muted/50" aria-hidden>
      {(() => {
        const inf = info();
        const failed = imageError();
        if (!props.group.cover?.trim() || inf.type === 'invalid' || (inf.url && failed)) {
          return (
            <span class="flex h-full w-full items-center justify-center text-muted-foreground">
              <BookCoverPlaceholderIcon class="h-3.5 w-3.5" size={14} />
            </span>
          );
        }
        if (inf.type === 'emoji' && props.group.cover) {
          return <span class="flex h-full w-full items-center justify-center text-sm">{props.group.cover.trim()}</span>;
        }
        if (inf.url && !failed) {
          return (
            <img
              src={inf.url}
              alt=""
              class="h-full w-full object-cover"
              onError={() => setImageError(true)}
            />
          );
        }
        return (
          <span class="flex h-full w-full items-center justify-center text-muted-foreground">
            <BookCoverPlaceholderIcon class="h-3.5 w-3.5" size={14} />
          </span>
        );
      })()}
    </div>
  );
}

function BookshelfGroupMenuList(props: {
  groups: BookGroup[];
  groupBookCounts?: Record<number, number>;
  currentGroupId?: number;
  onGroupChange?: (groupId: number) => void;
}) {
  return (
    <For each={props.groups}>
      {(g) => (
        <DropdownMenuItem
          class={cn(
            groupMenuItemClass,
            props.currentGroupId === g.groupId && 'bg-accent/50'
          )}
          onSelect={() => props.onGroupChange?.(g.groupId)}
        >
          <GroupCoverThumb group={g} />
          <div class="min-w-0 flex-1 space-y-0.5 py-0.5 text-left">
            <span class="block truncate text-sm font-medium">{g.groupName}</span>
            <span class="block truncate text-xs leading-snug text-muted-foreground">
              {props.groupBookCounts?.[g.groupId] ?? 0} 本书
            </span>
          </div>
        </DropdownMenuItem>
      )}
    </For>
  );
}

export interface BookshelfGroupTitleDropdownProps {
  title: string;
  description?: string | JSX.Element;
  groups: BookGroup[];
  groupBookCounts?: Record<number, number>;
  currentGroupId?: number;
  onGroupChange?: (groupId: number) => void;
  /** 为 false 时仅展示标题+描述（常规分组样式） */
  dropdownEnabled?: boolean;
}

/** 以 PageToolbar 标题+描述为触发的分组下拉 */
export function BookshelfGroupTitleDropdown(props: BookshelfGroupTitleDropdownProps) {
  return (
    <PageToolbarTitleDropdown
      title={props.title}
      description={props.description}
      dropdownEnabled={props.dropdownEnabled}
      selectionKey={props.currentGroupId ?? 'all'}
      contentClass="p-0 w-[min(280px,calc(100dvw-2rem))] min-w-52 max-w-[min(280px,calc(100dvw-2rem))] overflow-hidden"
    >
      <BookshelfGroupMenuList
        groups={props.groups}
        groupBookCounts={props.groupBookCounts}
        currentGroupId={props.currentGroupId}
        onGroupChange={props.onGroupChange}
      />
    </PageToolbarTitleDropdown>
  );
}

export interface BookshelfGroupNavProps {
  groupStyle?: GroupStyle;
  groups?: BookGroup[];
  groupBookCounts?: Record<number, number>;
  currentGroupId?: number;
  onGroupChange?: (groupId: number) => void;
}

/** 标签式分组导航（置于 PageToolbar below） */
export function BookshelfGroupNav(props: BookshelfGroupNavProps) {
  const [tabsScrollRef, setTabsScrollRef] = createSignal<HTMLDivElement | undefined>(undefined);

  createEffect(() => {
    const style = props.groupStyle;
    const el = tabsScrollRef();
    if (style !== 'tabs' || !el) return;
    const handler = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      e.stopPropagation();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', handler, { passive: false });
    onCleanup(() => el.removeEventListener('wheel', handler));
  });

  return (
    <Show when={props.groupStyle === 'tabs' && props.groups && props.groups.length > 0}>
      <div
        ref={setTabsScrollRef}
        class="flex min-w-0 overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent [scrollbar-gutter:stable]"
      >
        <div class="flex items-center gap-1 shrink-0 py-1 min-w-max">
          <For each={props.groups}>
            {(g) => (
              <button
                type="button"
                onClick={() => props.onGroupChange?.(g.groupId)}
                class={cn(
                  'shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap',
                  props.currentGroupId === g.groupId
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                {g.groupName}
              </button>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
