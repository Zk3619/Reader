/**
 * 订阅模块侧栏：首页入口 + 发现/管理/设置 + 按 category 列源
 */

import { createEffect, createMemo, createResource, createSignal, For, on, Show } from 'solid-js';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
} from '@/components/shared/AppTooltip';
import { Separator } from '@/components/ui/separator';
import {
  ChevronRightIcon,
  ExportIcon,
  HomeIcon,
  LayoutIcon,
  PlusIcon,
  SearchIcon,
  Settings2Icon,
} from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import {
  sidebarNavButtonClass,
  sidebarNavMenuClass,
  sidebarNavMenuItemClass,
} from '@/lib/shell/sidebar-nav-button-class';
import { listSubscribeDashboard } from '@/lib/subscribe/service';
import { subscribeFeedDataRevision } from '@/lib/subscribe/feed-data-revision';
import type { SubSourceRow } from '@/lib/database/subscribe';
import { subscribeFeedViewKindToNumber } from '@/lib/subscribe/feed-view';
import { getSubscribeConfig, subscribeConfigRevision } from '@/lib/persistence/domains/subscribe-config';
import { SubscribeSourceLogo } from '@/components/media/subscribe/SubscribeSourceLogo';
import { SubscribeSourceAddDialog } from '@/components/media/subscribe/SubscribeSourceAddDialog';
import { SubscribeSourceContextMenu } from '@/components/media/subscribe/SubscribeSourceContextMenu';
import {
  AppContextMenu,
  AppContextMenuContent,
  AppContextMenuItem,
  AppContextMenuTrigger,
} from '@/components/shared/AppContextMenu';
import { downloadSubscribeOpmlFile } from '@/lib/subscribe/download-subscribe-opml';
import { showAppToast } from '@/components/shared/AppToasts';
import { settingsStore } from '@/stores/settings';
import {
  getSubscribeHubState,
  goSubscribeHome,
  setSubscribeActiveSource,
  setSubscribeFeedView,
  setSubscribeSection,
} from '@/stores/subscribe-hub/section';

const COLLAPSED_CATEGORIES_STORAGE_KEY =
  'reader_subscribe_sidebar_collapsed_categories_v1';

function isHomeFeedSection(section: string): boolean {
  return section !== 'discover' && section !== 'settings' && section !== 'manage';
}

function categoryStorageKey(category: string): string {
  return category.trim() || '__uncategorized__';
}

function readCollapsedCategories(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_CATEGORIES_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === 'string'));
  } catch {
    return new Set();
  }
}

function writeCollapsedCategories(keys: Set<string>) {
  try {
    localStorage.setItem(COLLAPSED_CATEGORIES_STORAGE_KEY, JSON.stringify([...keys]));
  } catch {
    /* ignore quota / private mode */
  }
}

export interface SubscribeModuleSidebarSectionProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function SubscribeModuleSidebarSection(props: SubscribeModuleSidebarSectionProps) {
  const hubState = getSubscribeHubState();
  const isCollapsed = () => props.collapsed ?? false;
  const reduceMotion = () => settingsStore.state.app.reduceMotion === true;
  const [addOpen, setAddOpen] = createSignal(false);
  const [collapsedCategories, setCollapsedCategories] = createSignal(readCollapsedCategories());

  const [dashboard] = createResource(
    () =>
      [hubState.feedView, hubState.activeSourceId, subscribeFeedDataRevision()] as const,
    () => listSubscribeDashboard({ pageSize: 1 }),
  );
  const [config] = createResource(subscribeConfigRevision, () => getSubscribeConfig());
  const discoverEnabled = () => config()?.foloDiscoverEnabled !== false;

  createEffect(() => {
    if (config.loading) return;
    if (!discoverEnabled() && hubState.section === 'discover') {
      setSubscribeSection('home');
    }
  });

  const allSources = createMemo(() => dashboard()?.sources ?? []);
  const unreadBySource = createMemo(() => dashboard()?.unreadBySource ?? {});

  /** 当前 feedView 无源时回退全部（保留已选源，避免点源后被清空） */
  createEffect(() => {
    const viewN = subscribeFeedViewKindToNumber(hubState.feedView);
    if (viewN == null) return;
    if (allSources().length === 0) return;
    const has = allSources().some((s) => s.view === viewN);
    if (!has) setSubscribeFeedView('all', { keepSource: true });
  });

  const sources = createMemo(() => {
    const viewN = subscribeFeedViewKindToNumber(hubState.feedView);
    if (viewN == null) return allSources();
    return allSources().filter((s) => s.view === viewN);
  });

  const sourceGroups = createMemo(() => {
    const groups = new Map<string, SubSourceRow[]>();
    for (const source of sources()) {
      const category = source.category?.trim() || '';
      const group = groups.get(category) ?? [];
      group.push(source);
      groups.set(category, group);
    }
    return [...groups.entries()].sort(([a], [b]) => {
      if (!a) return 1;
      if (!b) return -1;
      return a.localeCompare(b, 'zh-CN');
    });
  });

  function isCategoryExpanded(category: string) {
    return !collapsedCategories().has(categoryStorageKey(category));
  }

  function toggleCategory(category: string) {
    const key = categoryStorageKey(category);
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeCollapsedCategories(next);
      return next;
    });
  }

  function expandCategory(category: string) {
    const key = categoryStorageKey(category);
    setCollapsedCategories((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      writeCollapsedCategories(next);
      return next;
    });
  }

  /** 切换到某源时展开其所在分类；不强制保持展开，便于手动收起 */
  createEffect(
    on(
      () => hubState.activeSourceId,
      (activeId) => {
        if (!activeId || !isHomeFeedSection(hubState.section)) return;
        for (const [category, groupSources] of sourceGroups()) {
          if (groupSources.some((source) => source.id === activeId)) {
            expandCategory(category);
            break;
          }
        }
      },
    ),
  );

  function groupUnreadCount(groupSources: SubSourceRow[]) {
    const map = unreadBySource();
    let total = 0;
    for (const source of groupSources) {
      total += map[source.id] ?? 0;
    }
    return total;
  }

  function selectHome() {
    goSubscribeHome();
    props.onNavigate?.();
  }

  function selectSource(sourceId: string) {
    setSubscribeActiveSource(sourceId);
    props.onNavigate?.();
  }

  function openDiscover() {
    setSubscribeSection('discover');
    props.onNavigate?.();
  }

  function openManage() {
    setSubscribeSection('manage');
    props.onNavigate?.();
  }

  function openAddSource() {
    setAddOpen(true);
  }

  async function exportCategoryOpml(category: string) {
    const label = category.trim() || '未分类';
    try {
      await downloadSubscribeOpmlFile({ category });
      showAppToast({
        title: '已导出精选合集',
        description: `「${label}」可分享给他人导入`,
      });
    } catch (error) {
      showAppToast({
        title: '导出失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    }
  }

  function openSettings() {
    setSubscribeSection('settings');
    props.onNavigate?.();
  }

  const homeActive = () =>
    isHomeFeedSection(hubState.section) && !hubState.activeSourceId;

  return (
    <>
      <SidebarGroup class={isCollapsed() ? 'px-0' : undefined}>
        <SidebarGroupContent>
          <SidebarMenu class={sidebarNavMenuClass(isCollapsed())}>
            <SidebarMenuItem class={sidebarNavMenuItemClass(isCollapsed())}>
              <SidebarMenuButton
                isActive={homeActive()}
                onClick={selectHome}
                tooltip="首页"
                class={sidebarNavButtonClass(homeActive(), {
                  collapsed: isCollapsed(),
                  extra: 'group/menu-button',
                })}
              >
                <span class={cn('shrink-0', isCollapsed() && 'mx-auto')}>
                  <HomeIcon class="h-5 w-5" />
                </span>
                <span class={cn('min-w-0 flex-1 truncate font-medium', isCollapsed() && 'hidden')}>
                  首页
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <Show when={discoverEnabled()}>
              <SidebarMenuItem class={sidebarNavMenuItemClass(isCollapsed())}>
                <SidebarMenuButton
                  isActive={hubState.section === 'discover'}
                  onClick={openDiscover}
                  tooltip="发现"
                  class={sidebarNavButtonClass(hubState.section === 'discover', {
                    collapsed: isCollapsed(),
                    extra: 'group/menu-button',
                  })}
                >
                  <span class={cn('shrink-0', isCollapsed() && 'mx-auto')}>
                    <SearchIcon class="h-5 w-5" />
                  </span>
                  <span class={cn('min-w-0 flex-1 truncate font-medium', isCollapsed() && 'hidden')}>
                    发现
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </Show>
            <SidebarMenuItem class={sidebarNavMenuItemClass(isCollapsed())}>
              <SidebarMenuButton
                isActive={hubState.section === 'manage'}
                onClick={openManage}
                tooltip="管理"
                class={sidebarNavButtonClass(hubState.section === 'manage', {
                  collapsed: isCollapsed(),
                  extra: 'group/menu-button',
                })}
              >
                <span class={cn('shrink-0', isCollapsed() && 'mx-auto')}>
                  <LayoutIcon class="h-5 w-5" />
                </span>
                <span class={cn('min-w-0 flex-1 truncate font-medium', isCollapsed() && 'hidden')}>
                  管理
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem class={sidebarNavMenuItemClass(isCollapsed())}>
              <SidebarMenuButton
                isActive={hubState.section === 'settings'}
                onClick={openSettings}
                tooltip="设置"
                class={sidebarNavButtonClass(hubState.section === 'settings', {
                  collapsed: isCollapsed(),
                  extra: 'group/menu-button',
                })}
              >
                <span class={cn('shrink-0', isCollapsed() && 'mx-auto')}>
                  <Settings2Icon class="h-5 w-5" />
                </span>
                <span class={cn('min-w-0 flex-1 truncate font-medium', isCollapsed() && 'hidden')}>
                  设置
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <Separator />

      <SidebarGroup class={isCollapsed() ? 'px-0' : undefined}>
        <SidebarGroupLabel class={cn('flex items-center justify-between', isCollapsed() && 'sr-only')}>
          <span>订阅源</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="h-6 w-6"
            aria-label="添加订阅源"
            onClick={openAddSource}
          >
            <PlusIcon class="h-3.5 w-3.5" />
          </Button>
        </SidebarGroupLabel>
        <SidebarGroupContent class={cn(!isCollapsed() && 'mt-2')}>
          <Show
            when={sources().length > 0}
            fallback={
              <Show when={!isCollapsed()}>
                <div class="mx-2 rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                  {allSources().length === 0 ? '还没有订阅源' : '当前频道暂无订阅源'}
                </div>
              </Show>
            }
          >
            <For each={sourceGroups()}>
              {([category, groupSources]) => {
                const expanded = () => isCollapsed() || isCategoryExpanded(category);
                const unreadTotal = () => groupUnreadCount(groupSources);
                return (
                  <div class="mb-1 [overflow-anchor:none]">
                    <Show when={!isCollapsed()}>
                      <AppContextMenu>
                        <AppContextMenuTrigger as="div" class="w-full min-w-0">
                          <button
                            type="button"
                            class="flex h-6 w-full shrink-0 items-center gap-1 rounded-md px-2 text-left text-[11px] font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                            aria-expanded={expanded()}
                            onClick={() => toggleCategory(category)}
                          >
                            <ChevronRightIcon
                              class={cn(
                                'h-3 w-3 shrink-0',
                                !reduceMotion() && 'transition-transform duration-200 ease-out',
                                expanded() && 'rotate-90',
                              )}
                            />
                            <span class="min-w-0 flex-1 truncate">
                              {category || '未分类'}
                            </span>
                            <span class="shrink-0 tabular-nums text-[10px] opacity-70">
                              {groupSources.length}
                            </span>
                            <Show when={unreadTotal() > 0}>
                              <span class="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-primary">
                                {unreadTotal()}
                              </span>
                            </Show>
                          </button>
                        </AppContextMenuTrigger>
                        <AppContextMenuContent layout="compact">
                          <AppContextMenuItem
                            onSelect={() => void exportCategoryOpml(category)}
                          >
                            <ExportIcon class="mr-2 h-4 w-4" />
                            导出本分类 OPML
                          </AppContextMenuItem>
                        </AppContextMenuContent>
                      </AppContextMenu>
                    </Show>
                    <div
                      class={cn(
                        'grid',
                        expanded() ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                        !reduceMotion() &&
                          'transition-[grid-template-rows] duration-200 ease-out',
                      )}
                      aria-hidden={!expanded()}
                    >
                      <div class="min-h-0 overflow-hidden">
                        <SidebarMenu
                          class={cn(
                            sidebarNavMenuClass(isCollapsed()),
                            !expanded() && 'pointer-events-none',
                          )}
                        >
                          <For each={groupSources}>
                            {(source) => {
                              const active = () =>
                                isHomeFeedSection(hubState.section) &&
                                hubState.activeSourceId === source.id;
                              return (
                                <SidebarMenuItem
                                  class={sidebarNavMenuItemClass(isCollapsed())}
                                >
                                  <SubscribeSourceContextMenu source={source}>
                                    <SidebarMenuButton
                                      isActive={active()}
                                      onClick={() => selectSource(source.id)}
                                      tooltip={source.title || source.url}
                                      tabindex={expanded() ? undefined : -1}
                                      class={sidebarNavButtonClass(active(), {
                                        collapsed: isCollapsed(),
                                        extra: cn(
                                          'group/menu-button',
                                          !source.enabled && 'opacity-60',
                                        ),
                                      })}
                                    >
                                      <SubscribeSourceLogo
                                        source={source}
                                        class={cn(
                                          'flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded bg-muted',
                                          isCollapsed() && 'mx-auto',
                                        )}
                                        iconClass="h-3.5 w-3.5 text-muted-foreground"
                                      />
                                      <span
                                        class={cn(
                                          'min-w-0 flex-1 truncate',
                                          isCollapsed() && 'hidden',
                                        )}
                                      >
                                        {source.title || source.url}
                                      </span>
                                      <Show
                                        when={
                                          !isCollapsed() &&
                                          (unreadBySource()[source.id] ?? 0) > 0
                                        }
                                      >
                                        <span class="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                          {unreadBySource()[source.id]}
                                        </span>
                                      </Show>
                                    </SidebarMenuButton>
                                  </SubscribeSourceContextMenu>
                                </SidebarMenuItem>
                              );
                            }}
                          </For>
                        </SidebarMenu>
                      </div>
                    </div>
                  </div>
                );
              }}
            </For>
          </Show>
        </SidebarGroupContent>
      </SidebarGroup>

      <Show when={isCollapsed()}>
        <AppTooltip>
          <AppTooltipTrigger
            as={Button}
            type="button"
            variant="ghost"
            size="icon"
            class="mx-auto h-8 w-8"
            aria-label="添加订阅源"
            onClick={openAddSource}
          >
            <PlusIcon class="h-4 w-4" />
          </AppTooltipTrigger>
          <AppTooltipContent>添加订阅源</AppTooltipContent>
        </AppTooltip>
      </Show>

      <SubscribeSourceAddDialog open={addOpen()} onOpenChange={setAddOpen} />
    </>
  );
}
