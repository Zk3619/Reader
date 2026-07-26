/**
 * 音乐搜索页操作区：可展开搜索、来源/类型下拉、更多（控件风格）
 */

import { Show, createEffect, createRenderEffect, createSignal, For, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';
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
import { ViewerAppSelectContent } from '@/components/media/viewer/viewer-app-overlay';
import { MoreIcon, RefreshIcon, SettingsIcon } from '@/components/shared/icons';
import { ExpandableIconSearch } from '@/components/shared/ExpandableIconSearch';
import { MusicSearchConfigDialog } from '@/components/media/viewer/audio/music/MusicSearchConfigDialog';
import {
  getSearchState,
  clearSearchResults,
  listHubSearchSources,
  listSearchTabsForSource,
  searchSourceLabel,
  searchByKeyword,
  refreshHotKeywords,
  setSearchHelpVisible,
  setSearchKeyword,
  setSearchSource,
  setSearchTab,
  submitSearch,
  type SearchTab,
} from '@/stores/music-hub/search';
import {
  AGGREGATE_SEARCH_SOURCE,
  type SearchSource,
} from '@/lib/media/audio/online/source-router';
import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import {
  getMusicSearchUi,
  setMusicSearchPaginationPreference,
  setMusicSearchSourceControl,
  setMusicSearchTabControl,
} from '@/stores/music-hub/music-search-ui';
import { APP_TOAST_Z } from '@/lib/ui/overlay-z';
import { pageToolbarBelowScrollTrack, popperMenuPanelShell } from '@/lib/ui/viewport-classes';
import { PopperScrollViewport } from '@/components/shared/PopperScrollViewport';
import { cn } from '@/lib/utils';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { viewerStore } from '@/stores/viewer';

/** 与 AppSelectContent 动画/外观一致（非 Select 原语的轻量 tip 列表面板） */
const TIP_PANEL_CLASS = cn(
  'relative overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md',
  'animate-in fade-in-0 zoom-in-95 slide-in-from-top-2',
  popperMenuPanelShell,
);

/** 与 AppSelectItem 行样式一致（无左侧勾选占位） */
const TIP_ITEM_CLASS =
  'relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground';

const SEARCH_TAB_LABELS: Record<SearchTab, string> = {
  song: '歌曲',
  album: '专辑',
  artist: '歌手',
  sheet: '歌单(MF)',
  lyric: '歌词',
  playlist: '歌单(LX)',
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
  const tabs = () => listSearchTabsForSource(state().source);

  return (
    <AppSelect
      value={state().tab}
      onChange={(value) => {
        if (value != null) setSearchTab(value as SearchTab);
      }}
      options={[...tabs()]}
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
  const [tipDropdownOpen, setTipDropdownOpen] = createSignal(false);
  const [selectedTipIndex, setSelectedTipIndex] = createSignal(-1);
  const [searchBoxEl, setSearchBoxEl] = createSignal<HTMLDivElement | undefined>();
  const [searchInputEl, setSearchInputEl] = createSignal<HTMLInputElement | undefined>();
  const [searchConfigOpen, setSearchConfigOpen] = createSignal(false);
  const [tipPanelStyle, setTipPanelStyle] = createSignal<Record<string, string>>({
    display: 'none',
  });
  let tipBlurTimer: ReturnType<typeof setTimeout> | null = null;

  const expandSearch = () => {
    setSearchExpanded(true);
    setTipDropdownOpen(true);
  };

  let previousSection: string | null = null;
  createEffect(() => {
    const section = viewerStore.state.musicSection;
    const settings = getMusicSettings();
    if (section === 'search' && previousSection !== 'search' && settings.searchFocusOnEnter) {
      expandSearch();
      queueMicrotask(() => searchInputEl()?.focus());
    } else if (section !== 'search' && previousSection === 'search') {
      if (settings.searchClearInputOnLeave) setSearchKeyword('');
      if (settings.searchClearResultsOnLeave) clearSearchResults();
    }
    previousSection = section;
  });

  // 对齐 lx：焦点下输入时保持可见；联想结果到达后强制展开
  createEffect(() => {
    if (state().tipKeywords.length > 0 && state().keyword.trim() && !state().submitted) {
      setTipDropdownOpen(true);
    }
  });

  createEffect(() => {
    state().tipKeywords;
    setSelectedTipIndex(-1);
  });

  const showTipDropdown = () =>
    tipDropdownOpen() &&
    !state().submitted &&
    state().tipKeywords.length > 0 &&
    !!state().keyword.trim();

  const updateTipPanelPosition = () => {
    const el = searchBoxEl() ?? searchInputEl();
    if (!el) {
      setTipPanelStyle({ display: 'none' });
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) {
      setTipPanelStyle({ display: 'none' });
      return;
    }
    setTipPanelStyle({
      position: 'fixed',
      top: `${Math.round(rect.bottom + 4)}px`,
      left: `${Math.round(rect.left)}px`,
      width: `${Math.round(rect.width)}px`,
      zIndex: '200',
      display: 'block',
    });
  };

  // 对齐 lx：列表出现前同步算高度/位置，避免首帧无定位挂在 body 底部
  createRenderEffect(() => {
    if (!showTipDropdown()) {
      setTipPanelStyle({ display: 'none' });
      return;
    }
    updateTipPanelPosition();
  });

  createEffect(() => {
    if (!showTipDropdown()) return;
    let raf = 0;
    const onReposition = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        updateTipPanelPosition();
      });
    };
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    onCleanup(() => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    });
  });

  const clearTipBlurTimer = () => {
    if (tipBlurTimer) {
      clearTimeout(tipBlurTimer);
      tipBlurTimer = null;
    }
  };

  const applyTipKeyword = (word: string) => {
    clearTipBlurTimer();
    setTipDropdownOpen(false);
    setSelectedTipIndex(-1);
    void searchByKeyword(word);
  };

  onMount(() => {
    const handleDialogOpened = () => {
      setMoreMenuOpen(false);
      blurActiveElement();
    };
    window.addEventListener('dialog-opened', handleDialogOpened);
    return () => window.removeEventListener('dialog-opened', handleDialogOpened);
  });

  onCleanup(() => clearTipBlurTimer());

  const searchPlaceholder = () => (state().tab === 'song' ? '搜索歌曲' : '搜索歌单');

  return (
    <>
      <ExpandableIconSearch
        value={state().keyword}
        onValueChange={(value) => {
          setSearchKeyword(value);
          if (value.trim()) {
            setTipDropdownOpen(true);
            if (!state().submitted) setSearchHelpVisible(true);
          } else {
            setSearchHelpVisible(true);
            setTipDropdownOpen(false);
            setSelectedTipIndex(-1);
          }
        }}
        onSearch={() => {
          setTipDropdownOpen(false);
          void submitSearch();
        }}
        placeholder={searchPlaceholder()}
        tooltip="搜索"
        aria-label={searchPlaceholder()}
        inputClass="w-40 sm:w-56"
        expanded={searchExpanded()}
        onExpandedChange={(next) => {
          setSearchExpanded(next);
          if (next) setTipDropdownOpen(true);
        }}
        boxRef={setSearchBoxEl}
        inputRef={setSearchInputEl}
        onInputFocus={() => {
          clearTipBlurTimer();
          setTipDropdownOpen(true);
          if (!state().submitted || state().tracks.length === 0) setSearchHelpVisible(true);
        }}
        onInputBlur={() => {
          tipBlurTimer = setTimeout(() => {
            setTipDropdownOpen(false);
            setSelectedTipIndex(-1);
            tipBlurTimer = null;
          }, 180);
        }}
        onInputKeyDown={(e) => {
          const tips = state().tipKeywords;
          if (showTipDropdown() && tips.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSelectedTipIndex((index) => (index + 1 < tips.length ? index + 1 : 0));
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSelectedTipIndex((index) => (index - 1 < 0 ? tips.length - 1 : index - 1));
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setTipDropdownOpen(false);
              setSelectedTipIndex(-1);
              return;
            }
            if (e.key === 'Enter' && selectedTipIndex() >= 0) {
              e.preventDefault();
              const word = tips[selectedTipIndex()];
              if (word) applyTipKeyword(word);
            }
          }
        }}
      />

      <Show when={showTipDropdown()}>
        <Portal mount={document.body}>
          <div
            class={cn(TIP_PANEL_CLASS, APP_TOAST_Z)}
            style={tipPanelStyle()}
            data-music-search-tip-list
          >
            <PopperScrollViewport class="max-h-80">
              <ul class="p-0" role="listbox" aria-label="搜索建议">
                <For each={[...state().tipKeywords]}>
                  {(word, index) => (
                    <li
                      role="option"
                      aria-selected={selectedTipIndex() === index()}
                      class={cn(
                        TIP_ITEM_CLASS,
                        selectedTipIndex() === index() && 'bg-accent text-accent-foreground',
                      )}
                      onMouseEnter={() => setSelectedTipIndex(index())}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyTipKeyword(word)}
                    >
                      <span class="line-clamp-2 min-w-0 flex-1">{word}</span>
                    </li>
                  )}
                </For>
              </ul>
            </PopperScrollViewport>
          </div>
        </Portal>
      </Show>

      <Show when={ui().sourceControl === 'select'}>
        <HubSearchSourceSelect />
      </Show>

      <Show when={ui().tabControl === 'select'}>
        <HubSearchTabSelect />
      </Show>

      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          variant="ghost"
          size="icon"
          class="h-9 w-9 shrink-0"
          disabled={state().loading || state().loadingMore}
          onClick={() => {
            if (state().submitted && state().keyword.trim()) {
              void submitSearch(1);
              return;
            }
            const src = state().source;
            if (src === AGGREGATE_SEARCH_SOURCE) {
              void refreshHotKeywords('wy');
              return;
            }
            if (typeof src === 'string' && !src.startsWith('userApi:')) {
              void refreshHotKeywords(src as AudioTrackSource);
            }
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
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem class="pointer-events-none text-xs text-muted-foreground">
            列表分页方式
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => {
              setMusicSearchPaginationPreference('scroll');
              if (state().submitted) void submitSearch(1);
            }}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={ui().paginationPreference === 'scroll'} />
            <span>滚动加载</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => {
              setMusicSearchPaginationPreference('pagination');
              if (state().submitted) void submitSearch(1);
            }}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={ui().paginationPreference === 'pagination'} />
            <span>分页加载</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem
            onSelect={() => {
              setMoreMenuOpen(false);
              setSearchConfigOpen(true);
            }}
          >
            <SettingsIcon class="h-4 w-4" />
            <span>搜索配置</span>
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>

      <MusicSearchConfigDialog
        open={searchConfigOpen()}
        onOpenChange={setSearchConfigOpen}
        onSaved={() => {
          if (state().submitted) void submitSearch(1);
        }}
      />
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
  const state = getSearchState;
  const tabs = () => listSearchTabsForSource(state().source);

  return (
    <AppTabs
      value={props.value}
      onChange={(value) => setSearchTab(value as SearchTab)}
      options={tabs()}
      labels={SEARCH_TAB_LABELS}
      ariaLabel="搜索类型"
      variant="drawer-inline"
      layout="inline"
    />
  );
}