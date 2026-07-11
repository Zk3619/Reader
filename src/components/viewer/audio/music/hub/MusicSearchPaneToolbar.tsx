/**
 * 音乐搜索页操作区：可展开搜索、来源/类型下拉、更多（控件风格）
 */

import { Show, createEffect, createSignal, onMount } from 'solid-js';
import { blurActiveElement } from '@/utils/accessibility';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  AppDropdownMenu,
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
import { SearchIcon, MoreIcon, XIcon } from '@/components/shared/icons';
import {
  getSearchState,
  listHubSearchSources,
  searchSourceLabel,
  setSearchHelpVisible,
  setSearchKeyword,
  setSearchSource,
  setSearchTab,
  submitSearch,
  type SearchTab,
} from '@/stores/music-hub/search';
import type { SearchSource } from '@/lib/media/audio/online/source-router';
import {
  getMusicSearchUi,
  setMusicSearchSourceControl,
  setMusicSearchTabControl,
} from '@/stores/music-hub/music-search-ui';
import { pageToolbarBelowScrollTrack } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';

const SEARCH_TABS: readonly SearchTab[] = ['song', 'playlist'];
const SEARCH_TAB_LABELS: Record<SearchTab, string> = {
  song: '歌曲',
  playlist: '歌单',
};

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

function HubSearchSourceSelect() {
  const state = getSearchState;
  const sources = () => listHubSearchSources();

  return (
    <AppSelect
      value={state().source}
      onChange={(value) => {
        if (value != null) setSearchSource(value as SearchSource);
      }}
      options={[...sources()]}
      itemComponent={(itemProps) => (
        <AppSelectItem item={itemProps.item}>
          {searchSourceLabel(itemProps.item.rawValue as SearchSource)}
        </AppSelectItem>
      )}
    >
      <AppSelectTrigger layout="compact" class="h-9 w-22 sm:w-24" aria-label="搜索来源">
        <AppSelectValue>
          {(selectState) => {
            const raw = selectState.selectedOption();
            return raw != null ? searchSourceLabel(raw as SearchSource) : '';
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

function HubSearchTabSelect() {
  const state = getSearchState;

  return (
    <AppSelect
      value={state().tab}
      onChange={(value) => {
        if (value != null) setSearchTab(value as SearchTab);
      }}
      options={[...SEARCH_TABS]}
      itemComponent={(itemProps) => (
        <AppSelectItem item={itemProps.item}>
          {SEARCH_TAB_LABELS[itemProps.item.rawValue as SearchTab]}
        </AppSelectItem>
      )}
    >
      <AppSelectTrigger layout="compact" class="h-9 w-22 sm:w-24" aria-label="搜索类型">
        <AppSelectValue>
          {(selectState) => {
            const raw = selectState.selectedOption();
            return raw != null ? SEARCH_TAB_LABELS[raw as SearchTab] : '';
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

export function MusicSearchPaneToolbar() {
  const state = getSearchState;
  const ui = getMusicSearchUi;
  const [moreMenuOpen, setMoreMenuOpen] = createSignal(false);
  const [searchExpanded, setSearchExpanded] = createSignal(false);
  const searchQueryRef: { current: string } = { current: '' };

  createEffect(() => {
    searchQueryRef.current = state().keyword;
    if (state().keyword.trim()) setSearchExpanded(true);
  });

  onMount(() => {
    const handleDialogOpened = () => {
      setMoreMenuOpen(false);
      blurActiveElement();
    };
    window.addEventListener('dialog-opened', handleDialogOpened);
    return () => window.removeEventListener('dialog-opened', handleDialogOpened);
  });

  const searchPlaceholder = () => (state().tab === 'song' ? '搜索歌曲' : '搜索歌单');

  return (
    <>
      <Show
        when={searchExpanded()}
        fallback={
          <AppTooltip>
            <AppTooltipTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="h-9 w-9 shrink-0"
              onClick={() => setSearchExpanded(true)}
            >
              <SearchIcon class="h-4 w-4" />
              <span class="sr-only">搜索</span>
            </AppTooltipTrigger>
            <AppTooltipContent>搜索</AppTooltipContent>
          </AppTooltip>
        }
      >
        <div class="relative flex h-9 w-36 sm:w-52 items-center rounded-md border border-input bg-transparent text-sm">
          <SearchIcon class="absolute left-2.5 h-4 w-4 shrink-0 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder={searchPlaceholder()}
            value={state().keyword}
            onInput={(e) => {
              const value = e.currentTarget.value;
              searchQueryRef.current = value;
              setSearchKeyword(value);
              if (!state().submitted) setSearchHelpVisible(true);
            }}
            onFocus={() => {
              if (!state().submitted || state().tracks.length === 0) setSearchHelpVisible(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitSearch();
            }}
            onBlur={() => {
              if (!searchQueryRef.current.trim()) setSearchExpanded(false);
            }}
            class="h-full w-full flex-1 bg-transparent pl-9 pr-8 py-2 placeholder:text-muted-foreground focus-visible:outline-none rounded-md"
            aria-label={searchPlaceholder()}
          />
          <Show when={state().keyword.length > 0}>
            <button
              type="button"
              class="absolute right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="清除搜索内容"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                searchQueryRef.current = '';
                setSearchKeyword('');
                setSearchHelpVisible(true);
                setSearchExpanded(false);
              }}
            >
              <XIcon class="h-3.5 w-3.5" />
            </button>
          </Show>
        </div>
      </Show>

      <Show when={ui().sourceControl === 'select'}>
        <HubSearchSourceSelect />
      </Show>

      <Show when={ui().tabControl === 'select'}>
        <HubSearchTabSelect />
      </Show>

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
            onSelect={() => setMusicSearchSourceControl('select')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={ui().sourceControl === 'select'} />
            <span>下拉</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => setMusicSearchSourceControl('tabs')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={ui().sourceControl === 'tabs'} />
            <span>标签 Tab</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem class="pointer-events-none text-xs text-muted-foreground">
            歌曲/歌单切换风格
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => setMusicSearchTabControl('select')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={ui().tabControl === 'select'} />
            <span>下拉</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => setMusicSearchTabControl('tabs')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={ui().tabControl === 'tabs'} />
            <span>标签 Tab</span>
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </>
  );
}

export function MusicSearchPaneBelow() {
  const state = getSearchState;
  const ui = getMusicSearchUi;

  return (
    <div class={cn(pageToolbarBelowScrollTrack, 'flex min-w-max items-center gap-3 px-4 pb-2')}>
      <Show when={ui().sourceControl === 'tabs'}>
        <HubSearchSourceTabs />
      </Show>
      <Show when={ui().tabControl === 'tabs'}>
        <HubSearchTypeTabs value={state().tab} />
      </Show>
    </div>
  );
}

function HubSearchSourceTabs() {
  const state = getSearchState;
  const sources = () => listHubSearchSources();
  const labels = () =>
    Object.fromEntries(sources().map((source) => [source, searchSourceLabel(source)])) as Record<
      string,
      string
    >;

  return (
    <AppTabs
      value={state().source}
      onChange={(value) => setSearchSource(value as SearchSource)}
      options={sources()}
      labels={labels()}
      ariaLabel="搜索来源"
      variant="drawer-inline"
      layout="inline"
    />
  );
}

function HubSearchTypeTabs(props: { value: SearchTab }) {
  return (
    <AppTabs
      value={props.value}
      onChange={(value) => setSearchTab(value as SearchTab)}
      options={SEARCH_TABS}
      labels={SEARCH_TAB_LABELS}
      ariaLabel="搜索类型"
      variant="drawer-inline"
      layout="inline"
    />
  );
}