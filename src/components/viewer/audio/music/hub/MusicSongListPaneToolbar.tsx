/**
 * 在线歌单页操作区：标签/来源/排序（AppSelect 默认）、打开链接、更多（控件风格）
 */

import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { blurActiveElement } from '@/utils/accessibility';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  AppDropdownMenu,
  AppDropdownMenuButtonTrigger,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import {
  AppSelect,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { AppTabs } from '@/components/shared/AppTabs';
import { ViewerAppSelectContent } from '@/components/viewer/viewer-app-overlay';
import { ChevronDownIcon, LinkIcon, MoreIcon, RefreshIcon } from '@/components/shared/icons';
import {
  getMusicSongListUi,
  setMusicSongListPaginationPreference,
  setMusicSongListSortControl,
  setMusicSongListSourceControl,
  setMusicSongListTagControl,
} from '@/stores/music-hub/music-songlist-ui';
import {
  getSongListState,
  loadSongListPage,
  loadSongListTags,
  MUSIC_SDK_SOURCES,
  MUSIC_SDK_SOURCE_LABELS,
  setSongListSort,
  setSongListSource,
  setSongListTag,
} from '@/stores/music-hub/songList';
import { getSongListSorts } from '@/lib/media/audio/music-sdk';
import type { MusicSdkSource, SongListTag, SongListTagGroup } from '@/lib/media/audio/music-sdk/types';
import { pageToolbarBelowScrollTrack } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';

/** 对齐探索页分类徽标轨 */
const TAG_STACK_TRACK_CLASS =
  'flex max-h-32 flex-wrap items-center gap-1 overflow-y-auto scroll-gutter-stable-both overscroll-contain p-1';

const TAG_CHIP_CLASS = (selected: boolean) =>
  cn(
    'h-auto shrink-0 rounded-lg border border-border/60 bg-background/80 px-2.5 py-1 text-xs font-medium shadow-sm',
    selected && 'border-primary/50 bg-primary/5 ring-1 ring-primary/30',
  );

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

/** 对齐 lx TagList：热门标签置顶 + API 分组 */
export function buildSongListTagGroups(
  hotTags: SongListTag[],
  tags: SongListTagGroup[],
): SongListTagGroup[] {
  const groups: SongListTagGroup[] = [];
  if (hotTags.length > 0) {
    groups.push({ name: '热门标签', list: hotTags });
  }
  for (const group of tags) {
    if (group.list.length > 0) groups.push(group);
  }
  return groups;
}

function flattenSongListTags(groups: SongListTagGroup[]): SongListTag[] {
  const seen = new Set<string>();
  const out: SongListTag[] = [];
  for (const group of groups) {
    for (const tag of group.list) {
      if (seen.has(tag.id)) continue;
      seen.add(tag.id);
      out.push(tag);
    }
  }
  return out;
}

function resolveSongListTagName(tagId: string | null, groups: SongListTagGroup[]): string {
  if (!tagId) return '全部';
  for (const group of groups) {
    const tag = group.list.find((item) => item.id === tagId);
    if (tag) return tag.name;
  }
  return tagId;
}

function HubSongListSourceSelect() {
  const state = getSongListState;

  return (
    <AppSelect
      value={state().source}
      onChange={(value) => {
        if (value != null) setSongListSource(value as MusicSdkSource);
      }}
      options={[...MUSIC_SDK_SOURCES]}
      itemComponent={(itemProps) => (
        <AppSelectItem item={itemProps.item}>
          {MUSIC_SDK_SOURCE_LABELS[itemProps.item.rawValue as MusicSdkSource]}
        </AppSelectItem>
      )}
    >
      <AppSelectTrigger layout="compact" class="h-9 w-22 sm:w-24" aria-label="歌单来源">
        <AppSelectValue>
          {(selectState) => {
            const raw = selectState.selectedOption();
            return raw != null ? MUSIC_SDK_SOURCE_LABELS[raw as MusicSdkSource] : '';
          }}
        </AppSelectValue>
        <AppSelectIcon />
      </AppSelectTrigger>
      <ViewerAppSelectContent>
        <AppSelectListbox />
      </ViewerAppSelectContent>
    </AppSelect>
  );
}

function HubSongListSortSelect() {
  const state = getSongListState;
  const sorts = () => getSongListSorts(state().source);
  const sortIds = () => sorts().map((sort) => sort.id);
  const labels = () =>
    Object.fromEntries(sorts().map((sort) => [sort.id, sort.name])) as Record<string, string>;

  return (
    <Show when={sortIds().length > 0}>
      <AppSelect
        value={state().sortId}
        onChange={(value) => {
          if (value != null) setSongListSort(value);
        }}
        options={sortIds()}
        itemComponent={(itemProps) => (
          <AppSelectItem item={itemProps.item}>
            {labels()[itemProps.item.rawValue as string] ?? String(itemProps.item.rawValue)}
          </AppSelectItem>
        )}
      >
        <AppSelectTrigger layout="compact" class="h-9 w-22 sm:w-24" aria-label="排序方式">
          <AppSelectValue>
            {(selectState) => {
              const raw = selectState.selectedOption();
              return raw != null ? (labels()[raw as string] ?? String(raw)) : '';
            }}
          </AppSelectValue>
          <AppSelectIcon />
        </AppSelectTrigger>
        <ViewerAppSelectContent>
          <AppSelectListbox />
        </ViewerAppSelectContent>
      </AppSelect>
    </Show>
  );
}

/** 对齐 lx TagList：分组下拉（触发器外观对齐 AppSelect compact） */
function HubSongListTagGroupedSelect() {
  const state = getSongListState;
  const [open, setOpen] = createSignal(false);
  const groups = createMemo(() => buildSongListTagGroups(state().hotTags, state().tags));
  const tagName = () => resolveSongListTagName(state().tagId, groups());
  const hasTags = () => groups().length > 0;

  const selectTag = (id: string | null) => {
    setSongListTag(id);
    setOpen(false);
  };

  return (
    <Show when={hasTags()}>
      <AppDropdownMenu open={open()} onOpenChange={setOpen} placement="bottom-start">
        <AppDropdownMenuTrigger
          as={(triggerProps: Record<string, unknown>) => (
            <AppDropdownMenuButtonTrigger
              triggerProps={triggerProps}
              variant="outline"
              size="sm"
              class="h-9 w-28 sm:w-32 justify-between gap-1 border-border/60 bg-background px-2.5 font-normal"
              aria-label="歌单标签"
            >
              <span class="min-w-0 truncate">{tagName()}</span>
              <ChevronDownIcon class="h-3.5 w-3.5 shrink-0 opacity-50" />
            </AppDropdownMenuButtonTrigger>
          )}
        />
        <AppDropdownMenuContent
          layout="plain"
          class="w-[min(40rem,calc(100dvw-2rem))] max-h-[min(20rem,65dvh)] p-2"
        >
          <div class="space-y-2">
            <button
              type="button"
              class={cn(
                'inline-flex rounded-md bg-muted/60 px-2.5 py-1.5 text-xs transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                state().tagId === null && 'bg-primary text-primary-foreground hover:bg-primary/90',
              )}
              onClick={() => selectTag(null)}
            >
              全部
            </button>
            <For each={groups()}>
              {(group) => (
                <dl class="space-y-1.5">
                  <dt class="pt-1 text-xs text-muted-foreground">{group.name}</dt>
                  <dd class="flex flex-wrap gap-1.5">
                    <For each={group.list}>
                      {(tag) => (
                        <button
                          type="button"
                          class={cn(
                            'inline-flex rounded-md bg-muted/60 px-2.5 py-1.5 text-xs transition-colors',
                            'hover:bg-accent hover:text-accent-foreground',
                            state().tagId === tag.id &&
                              'bg-primary text-primary-foreground hover:bg-primary/90',
                          )}
                          onClick={() => selectTag(tag.id)}
                        >
                          {tag.name}
                        </button>
                      )}
                    </For>
                  </dd>
                </dl>
              )}
            </For>
          </div>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </Show>
  );
}

function HubSongListTagStacked() {
  const state = getSongListState;
  const groups = createMemo(() => buildSongListTagGroups(state().hotTags, state().tags));
  const flatTags = createMemo(() => flattenSongListTags(groups()));

  return (
    <Show when={flatTags().length > 0}>
      <div class={TAG_STACK_TRACK_CLASS} role="listbox" aria-label="歌单标签">
        <Button
          type="button"
          variant="outline"
          size="sm"
          class={TAG_CHIP_CLASS(state().tagId === null)}
          aria-selected={state().tagId === null}
          onClick={() => setSongListTag(null)}
        >
          全部
        </Button>
        <For each={flatTags()}>
          {(tag) => (
            <Button
              type="button"
              variant="outline"
              size="sm"
              class={TAG_CHIP_CLASS(state().tagId === tag.id)}
              aria-selected={state().tagId === tag.id}
              onClick={() => setSongListTag(tag.id)}
            >
              {tag.name}
            </Button>
          )}
        </For>
      </div>
    </Show>
  );
}

export function MusicSongListPaneToolbar(props: {
  onOpenLink: () => void;
}) {
  const state = getSongListState;
  const ui = getMusicSongListUi;
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
      <Show when={ui().tagControl === 'grouped'}>
        <HubSongListTagGroupedSelect />
      </Show>

      <Show when={ui().sourceControl === 'select'}>
        <HubSongListSourceSelect />
      </Show>

      <Show when={ui().sortControl === 'select'}>
        <HubSongListSortSelect />
      </Show>

      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          variant="ghost"
          size="icon"
          class="h-9 w-9 shrink-0"
          onClick={props.onOpenLink}
        >
          <LinkIcon class="h-4 w-4" />
          <span class="sr-only">打开链接</span>
        </AppTooltipTrigger>
        <AppTooltipContent>打开链接</AppTooltipContent>
      </AppTooltip>

      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          variant="ghost"
          size="icon"
          class="h-9 w-9 shrink-0"
          disabled={state().loading || state().loadingMore}
          onClick={() => {
            void loadSongListTags();
            void loadSongListPage(1);
          }}
        >
          <RefreshIcon
            class={cn('h-4 w-4', (state().loading || state().loadingMore) && 'animate-spin')}
          />
          <span class="sr-only">刷新</span>
        </AppTooltipTrigger>
        <AppTooltipContent>刷新</AppTooltipContent>
      </AppTooltip>

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
          <AppDropdownMenuItem class="pointer-events-none text-xs text-muted-foreground">
            来源选择风格
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => setMusicSongListSourceControl('select')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={ui().sourceControl === 'select'} />
            <span>下拉</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => setMusicSongListSourceControl('tabs')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={ui().sourceControl === 'tabs'} />
            <span>标签 Tab</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem class="pointer-events-none text-xs text-muted-foreground">
            排序选择风格
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => setMusicSongListSortControl('select')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={ui().sortControl === 'select'} />
            <span>下拉</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => setMusicSongListSortControl('tabs')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={ui().sortControl === 'tabs'} />
            <span>标签 Tab</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem class="pointer-events-none text-xs text-muted-foreground">
            标签选择风格
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => setMusicSongListTagControl('grouped')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={ui().tagControl === 'grouped'} />
            <span>分组下拉</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => setMusicSongListTagControl('stacked')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={ui().tagControl === 'stacked'} />
            <span>徽标堆叠</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem class="pointer-events-none text-xs text-muted-foreground">
            列表分页方式
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => {
              setMusicSongListPaginationPreference('scroll');
              void loadSongListPage(1);
            }}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={ui().paginationPreference === 'scroll'} />
            <span>滚动加载</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => {
              setMusicSongListPaginationPreference('pagination');
              void loadSongListPage(1);
            }}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={ui().paginationPreference === 'pagination'} />
            <span>分页加载</span>
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </>
  );
}

export function MusicSongListPaneBelow() {
  const state = getSongListState;
  const ui = getMusicSongListUi;
  const sorts = () => getSongListSorts(state().source);
  const sortIds = () => sorts().map((sort) => sort.id);
  const sortLabels = () =>
    Object.fromEntries(sorts().map((sort) => [sort.id, sort.name])) as Record<string, string>;
  const sourceLabels = () =>
    Object.fromEntries(
      MUSIC_SDK_SOURCES.map((source) => [source, MUSIC_SDK_SOURCE_LABELS[source]]),
    ) as Record<string, string>;

  const showTabsRow = () => ui().sourceControl === 'tabs' || ui().sortControl === 'tabs';
  const showStackedTags = () => ui().tagControl === 'stacked';

  return (
    <Show when={showTabsRow() || showStackedTags()}>
      <div class="space-y-1 px-4 pb-2">
        <Show when={showTabsRow()}>
          <div class={cn(pageToolbarBelowScrollTrack, 'flex min-w-max items-center gap-3')}>
            <Show when={ui().sourceControl === 'tabs'}>
              <AppTabs
                value={state().source}
                onChange={(value) => setSongListSource(value as MusicSdkSource)}
                options={[...MUSIC_SDK_SOURCES]}
                labels={sourceLabels()}
                ariaLabel="歌单来源"
                variant="drawer-inline"
                layout="inline"
              />
            </Show>
            <Show when={ui().sortControl === 'tabs' && sortIds().length > 0}>
              <AppTabs
                value={state().sortId}
                onChange={(value) => setSongListSort(value)}
                options={sortIds()}
                labels={sortLabels()}
                ariaLabel="排序方式"
                variant="drawer-inline"
                layout="inline"
              />
            </Show>
          </div>
        </Show>
        <Show when={showStackedTags()}>
          <HubSongListTagStacked />
        </Show>
      </div>
    </Show>
  );
}
