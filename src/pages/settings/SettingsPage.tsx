/**
 * 设置页：桌面端 Tab 切换分类；移动端卡片入口 + 子页面（保留主列表滚动位置）
 */

import {
  createSignal,
  createMemo,
  createEffect,
  onCleanup,
  For,
  Show,
} from 'solid-js';
import { cn } from '@/lib/utils';
import { mainShellPageRoot, mainShellPageScroll } from '@/lib/ui/viewport-classes';
import {
  bookshelfCompactListCardClass,
  bookshelfCompactMainClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { SettingsCategoryIcon } from '@/pages/settings/SettingsCategoryIcon';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import {
  SettingsPageToolbar,
  SettingsToolbarLeading,
} from '@/components/shell/SettingsPageToolbar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import { ChevronRightIcon } from '@/components/shared/icons';
import type { PageType } from '@/components/shell/Navigation';
import {
  SETTINGS_CATEGORIES,
  getSettingsCategory,
  searchSettingsItems,
  type SettingsCategoryId,
} from '@/lib/settings/settings-catalog';
import { SETTINGS_MOBILE_QUICK_PAGES } from '@/lib/settings/settings-mobile-nav';
import { SettingsCategoryContent } from '@/pages/settings/SettingsCategoryContent';
import type { ReadingRulePageId } from '@/lib/settings/reading-rules-nav';

export interface SettingsPageProps {
  /** 移动端子页面开关变化，供 App 注册系统返回层 */
  onSubPageOpenChange?: (open: boolean, close?: () => void) => void;
  /** 移动端主列表跳转到书签 / 阅读记录等独立页 */
  onNavigateToPage?: (page: PageType) => void;
  /** 打开阅读规则独立页（TXT 目录 / 替换净化 / 字典） */
  onOpenReadingRulePage?: (page: ReadingRulePageId) => void;
}

const SETTINGS_PAGE_TITLE = '设置';
const SETTINGS_PAGE_DESCRIPTION = '自定义你的阅读体验';

const settingsPageScrollTrackClass =
  'flex min-h-0 w-full min-w-0 flex-1 flex-col items-stretch';
const settingsPageSearchResultsClass = 'w-full min-w-0 self-stretch';
const settingsPageListClass = 'flex w-full min-w-0 flex-col gap-2';
const settingsPageListItemClass = 'w-full min-w-0';

const settingsMobileListCardClass = cn(
  bookshelfCompactListCardClass('h-16 w-full min-w-0'),
  'cursor-pointer items-center text-left',
);

const settingsSearchEmptyStateClass =
  'w-full rounded-xl border border-dashed border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground';

export function SettingsPage(props: SettingsPageProps) {
  const shell = useShellLayout();
  const useMobileLayout = () => shell().useMobileShell;

  const [activeTab, setActiveTab] = createSignal<SettingsCategoryId>('appearance');
  const [mobileSubPage, setMobileSubPage] = createSignal<SettingsCategoryId | null>(null);
  /** 移动端已打开过的子页：保持挂载以避免重复拉取存储类数据 */
  const [mountedMobileSubPages, setMountedMobileSubPages] = createSignal<
    Set<SettingsCategoryId>
  >(new Set());
  /** 桌面端首次进入「存储与缓存」后保持挂载，避免重复请求 */
  const [storageTabVisited, setStorageTabVisited] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [highlightedItemId, setHighlightedItemId] = createSignal<string | null>(null);

  let hubScrollEl: HTMLDivElement | undefined;
  let subPageScrollEl: HTMLDivElement | undefined;
  let savedHubScrollTop = 0;

  const searchResults = createMemo(() => searchSettingsItems(searchQuery()));
  const isSearching = () => searchQuery().trim().length > 0;

  const pageDescription = createMemo(() => {
    const sub = mobileSubPage();
    if (useMobileLayout() && sub) {
      return getSettingsCategory(sub).description;
    }
    if (isSearching()) {
      const count = searchResults().length;
      return count > 0 ? `找到 ${count} 个匹配项` : '未找到匹配的设置项';
    }
    return SETTINGS_PAGE_DESCRIPTION;
  });

  const pageTitle = () => {
    const sub = mobileSubPage();
    if (useMobileLayout() && sub) {
      return getSettingsCategory(sub).label;
    }
    return SETTINGS_PAGE_TITLE;
  };

  function notifySubPageState() {
    const sub = mobileSubPage();
    const open = useMobileLayout() && sub != null;
    props.onSubPageOpenChange?.(open, open ? closeSubPage : undefined);
  }

  createEffect(() => {
    mobileSubPage();
    useMobileLayout();
    notifySubPageState();
  });

  createEffect(() => {
    const mobile = useMobileLayout();
    const sub = mobileSubPage();
    if (!mobile && sub) {
      setActiveTab(sub);
      setMobileSubPage(null);
      requestAnimationFrame(() => {
        if (hubScrollEl) hubScrollEl.scrollTop = savedHubScrollTop;
      });
    }
  });

  createEffect(() => {
    if (!useMobileLayout() && activeTab() === 'storage') {
      setStorageTabVisited(true);
    }
  });

  function openSubPage(categoryId: SettingsCategoryId) {
    if (hubScrollEl) {
      savedHubScrollTop = hubScrollEl.scrollTop;
    }
    setMountedMobileSubPages((prev) => {
      const next = new Set(prev);
      next.add(categoryId);
      return next;
    });
    setMobileSubPage(categoryId);
    setActiveTab(categoryId);
  }

  function closeSubPage() {
    setMobileSubPage(null);
    setHighlightedItemId(null);
    requestAnimationFrame(() => {
      if (hubScrollEl) hubScrollEl.scrollTop = savedHubScrollTop;
    });
  }

  let highlightTimer: number | undefined;
  function clearHighlightTimer() {
    if (highlightTimer != null) {
      window.clearTimeout(highlightTimer);
      highlightTimer = undefined;
    }
  }

  onCleanup(() => {
    clearHighlightTimer();
    props.onSubPageOpenChange?.(false);
  });

  function scrollToSettingItem(itemId: string, scrollRoot?: HTMLDivElement) {
    const el = document.getElementById(`setting-item-${itemId}`);
    if (!el) return;
    if (scrollRoot) {
      const rootRect = scrollRoot.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const offset = elRect.top - rootRect.top + scrollRoot.scrollTop - 16;
      scrollRoot.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function flashHighlight(itemId: string) {
    clearHighlightTimer();
    setHighlightedItemId(itemId);
    highlightTimer = window.setTimeout(() => {
      setHighlightedItemId(null);
      highlightTimer = undefined;
    }, 2400);
  }

  function readingRulePageForSettingItem(itemId: string): ReadingRulePageId | null {
    if (itemId === 'txt-toc-rules') return 'txt-toc';
    if (itemId === 'replace-rules') return 'replace';
    if (itemId === 'dict-rules') return 'dict';
    return null;
  }

  async function navigateToSettingItem(itemId: string, categoryId: SettingsCategoryId) {
    setSearchQuery('');
    const rulePage = readingRulePageForSettingItem(itemId);
    if (rulePage) {
      props.onOpenReadingRulePage?.(rulePage);
      if (useMobileLayout()) {
        openSubPage('reading');
      } else {
        setActiveTab('reading');
      }
      flashHighlight(itemId);
      return;
    }
    if (useMobileLayout()) {
      openSubPage(categoryId);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      scrollToSettingItem(itemId, subPageScrollEl);
    } else {
      setActiveTab(categoryId);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      scrollToSettingItem(itemId, hubScrollEl);
    }
    flashHighlight(itemId);
  }

  function handleCategoryCardClick(categoryId: SettingsCategoryId) {
    openSubPage(categoryId);
  }

  const showMobileHub = () => useMobileLayout() && mobileSubPage() == null;
  const showMobileSubPage = () => useMobileLayout() && mobileSubPage() != null;
  const showDesktopTabs = () => !useMobileLayout();

  const hubSearchResults = () => (
    <div class={settingsPageSearchResultsClass}>
      <Show
        when={searchResults().length > 0}
        fallback={
          <div class={settingsSearchEmptyStateClass}>
            <p>未找到匹配的设置项</p>
            <p class="mt-1">尝试其他关键词，如「主题」「缓存」「备份」</p>
          </div>
        }
      >
        <ul class={settingsPageListClass}>
          <For each={searchResults()}>
            {(item) => {
              const cat = () => getSettingsCategory(item.categoryId);
              return (
                <li class={settingsPageListItemClass}>
                  <button
                    type="button"
                    class={settingsMobileListCardClass}
                    onClick={() => navigateToSettingItem(item.id, item.categoryId)}
                  >
                    <div class={bookshelfCompactMainClass('px-2')}>
                      <span class="truncate font-medium text-foreground">{item.title}</span>
                      <span class="truncate text-xs text-muted-foreground">
                        {cat().label}
                        {item.description ? ` · ${item.description}` : ''}
                      </span>
                    </div>
                    <span class="flex shrink-0 items-center pr-1.5 text-muted-foreground">
                      <ChevronRightIcon class="h-4 w-4" />
                    </span>
                  </button>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>
    </div>
  );

  return (
    <div class={cn('@container', mainShellPageRoot)}>
      <div
        class={cn(
          'flex min-h-0 flex-1 flex-col',
          showMobileSubPage() && 'hidden pointer-events-none',
        )}
      >
        <Show
          when={showDesktopTabs()}
          fallback={
            <>
              <PageToolbar
                title={pageTitle()}
                description={pageDescription()}
                titleSlot={
                  <PageToolbarTitleDropdown
                    title={pageTitle()}
                    description={pageDescription()}
                    dropdownEnabled={false}
                  />
                }
              >
                <SettingsPageToolbar
                  searchQuery={searchQuery()}
                  onSearchQueryChange={setSearchQuery}
                />
              </PageToolbar>

              <div
                ref={hubScrollEl}
                class={cn(mainShellPageScroll, settingsPageScrollTrackClass)}
              >
                <Show when={isSearching()}>{hubSearchResults()}</Show>
                <Show when={showMobileHub() && !isSearching()}>
                  <ul class={settingsPageListClass}>
                    <For each={SETTINGS_MOBILE_QUICK_PAGES}>
                      {(entry) => (
                        <li class={settingsPageListItemClass}>
                          <button
                            type="button"
                            class={settingsMobileListCardClass}
                            onClick={() => props.onNavigateToPage?.(entry.page)}
                          >
                            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                              <entry.icon class="h-5 w-5" size={20} />
                            </span>
                            <div class={bookshelfCompactMainClass()}>
                              <span class="truncate font-medium text-foreground">{entry.label}</span>
                              <span class="truncate text-xs text-muted-foreground">
                                {entry.description}
                              </span>
                            </div>
                            <span class="flex shrink-0 items-center pr-1.5 text-muted-foreground">
                              <ChevronRightIcon class="h-4 w-4" />
                            </span>
                          </button>
                        </li>
                      )}
                    </For>
                    <For each={SETTINGS_CATEGORIES}>
                      {(cat) => (
                        <li class={settingsPageListItemClass}>
                          <button
                            type="button"
                            class={settingsMobileListCardClass}
                            onClick={() => handleCategoryCardClick(cat.id)}
                          >
                            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                              <SettingsCategoryIcon categoryId={cat.id} class="h-5 w-5" />
                            </span>
                            <div class={bookshelfCompactMainClass()}>
                              <span class="truncate font-medium text-foreground">{cat.label}</span>
                              <span class="truncate text-xs text-muted-foreground">
                                {cat.description}
                              </span>
                            </div>
                            <span class="flex shrink-0 items-center pr-1.5 text-muted-foreground">
                              <ChevronRightIcon class="h-4 w-4" />
                            </span>
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>
            </>
          }
        >
          <Tabs
            value={activeTab()}
            onChange={(v) => setActiveTab(v as SettingsCategoryId)}
            class="settings-page-tabs flex min-h-0 flex-1 flex-col"
          >
            <PageToolbar
              title={pageTitle()}
              description={pageDescription()}
              titleSlot={
                <PageToolbarTitleDropdown
                  title={pageTitle()}
                  description={pageDescription()}
                  dropdownEnabled={false}
                />
              }
              below={
                !isSearching() ? (
                  <TabsList class="flex h-auto w-full gap-1 p-1">
                    <For each={SETTINGS_CATEGORIES}>
                      {(cat) => (
                        <TabsTrigger
                          value={cat.id}
                          class="flex-1 text-sm hover:bg-background/60 hover:text-foreground"
                        >
                          {cat.label}
                        </TabsTrigger>
                      )}
                    </For>
                  </TabsList>
                ) : undefined
              }
              belowHorizontalWheel={!isSearching()}
            >
              <SettingsPageToolbar
                searchQuery={searchQuery()}
                onSearchQueryChange={setSearchQuery}
              />
            </PageToolbar>

            <div ref={hubScrollEl} class={cn(settingsPageScrollTrackClass, mainShellPageScroll)}>
              <Show when={isSearching()}>{hubSearchResults()}</Show>
              <Show when={!isSearching()}>
                <For each={SETTINGS_CATEGORIES}>
                  {(cat) => (
                    <TabsContent
                      value={cat.id}
                      forceMount={cat.id === 'storage' && storageTabVisited()}
                      class="mt-0 w-full min-w-0 overflow-visible focus-visible:outline-none"
                    >
                      <SettingsCategoryContent
                        categoryId={cat.id}
                        highlightedItemId={highlightedItemId()}
                        onOpenReadingRulePage={props.onOpenReadingRulePage}
                      />
                    </TabsContent>
                  )}
                </For>
              </Show>
            </div>
          </Tabs>
        </Show>
      </div>

      <Show when={showMobileSubPage()}>
        <div class="flex min-h-0 flex-1 flex-col">
          <PageToolbar
            title={pageTitle()}
            description={pageDescription()}
            titleSlot={
              <PageToolbarTitleDropdown
                title={pageTitle()}
                description={pageDescription()}
                dropdownEnabled={false}
              />
            }
            leading={<SettingsToolbarLeading onBack={closeSubPage} />}
          >
            <SettingsPageToolbar
              searchQuery={searchQuery()}
              onSearchQueryChange={setSearchQuery}
            />
          </PageToolbar>

          <div ref={subPageScrollEl} class={cn(settingsPageScrollTrackClass, mainShellPageScroll, 'pb-4')}>
            <Show when={isSearching()}>{hubSearchResults()}</Show>

            <Show when={!isSearching()}>
              <For each={SETTINGS_CATEGORIES}>
                {(cat) => (
                  <Show when={mountedMobileSubPages().has(cat.id)}>
                    <div class={cn(mobileSubPage() !== cat.id && 'hidden')}>
                      <SettingsCategoryContent
                        categoryId={cat.id}
                        highlightedItemId={highlightedItemId()}
                        onOpenReadingRulePage={props.onOpenReadingRulePage}
                      />
                    </div>
                  </Show>
                )}
              </For>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
