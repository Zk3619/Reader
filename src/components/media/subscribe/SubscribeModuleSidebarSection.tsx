/**
 * 订阅模块侧栏：时间线与订阅源列表
 */

import { createEffect, createMemo, createResource, For, Show, type Component } from 'solid-js';
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
  BookmarkIcon,
  LayoutIcon,
  PlusIcon,
  RecordIcon,
  RssIcon,
  SearchIcon,
  Settings2Icon,
  StarIcon,
} from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import {
  sidebarNavButtonClass,
  sidebarNavMenuClass,
  sidebarNavMenuItemClass,
} from '@/lib/shell/sidebar-nav-button-class';
import { listSubscribeDashboard } from '@/lib/subscribe/service';
import type { SubSourceRow } from '@/lib/database/subscribe';
import type { SubscribeTimelineKind } from '@/lib/persistence/domains/subscribe-session';
import { getSubscribeConfig, subscribeConfigRevision } from '@/lib/persistence/domains/subscribe-config';
import { SubscribeSourceLogo } from '@/components/media/subscribe/SubscribeSourceLogo';
import {
  getSubscribeHubState,
  setSubscribeActiveSource,
  setSubscribeSection,
  setSubscribeTimeline,
} from '@/stores/subscribe-hub/section';

type TimelineTabIcon = Component<{ class?: string }>;

export const SUBSCRIBE_TIMELINE_TABS: Array<{
  id: SubscribeTimelineKind;
  label: string;
  Icon: TimelineTabIcon;
}> = [
  { id: 'all', label: '全部', Icon: RssIcon },
  { id: 'today', label: '今日', Icon: RecordIcon },
  { id: 'unread', label: '未读', Icon: BookmarkIcon },
  { id: 'starred', label: '收藏', Icon: StarIcon },
];

function isHomeFeedSection(section: string): boolean {
  return section !== 'discover' && section !== 'settings' && section !== 'manage';
}

export interface SubscribeModuleSidebarSectionProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function SubscribeModuleSidebarSection(props: SubscribeModuleSidebarSectionProps) {
  const hubState = getSubscribeHubState();
  const isCollapsed = () => props.collapsed ?? false;

  const [dashboard] = createResource(
    () => [hubState.timeline, hubState.activeSourceId] as const,
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

  const sources = createMemo(() => dashboard()?.sources ?? []);
  const unreadBySource = createMemo(() => dashboard()?.unreadBySource ?? {});
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

  function selectTimeline(timeline: SubscribeTimelineKind) {
    setSubscribeSection('home');
    setSubscribeTimeline(timeline);
    props.onNavigate?.();
  }

  function selectSource(sourceId: string) {
    setSubscribeSection('home');
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

  function openSettings() {
    setSubscribeSection('settings');
    props.onNavigate?.();
  }

  return (
    <>
      <SidebarGroup class={isCollapsed() ? 'px-0' : undefined}>
        <SidebarGroupContent>
          <SidebarMenu class={sidebarNavMenuClass(isCollapsed())}>
            <For each={SUBSCRIBE_TIMELINE_TABS}>
              {(tab) => {
                const active = () =>
                  isHomeFeedSection(hubState.section) &&
                  hubState.timeline === tab.id &&
                  !hubState.activeSourceId;
                return (
                  <SidebarMenuItem class={sidebarNavMenuItemClass(isCollapsed())}>
                    <SidebarMenuButton
                      isActive={active()}
                      onClick={() => selectTimeline(tab.id)}
                      tooltip={tab.label}
                      class={sidebarNavButtonClass(active(), {
                        collapsed: isCollapsed(),
                        extra: 'group/menu-button',
                      })}
                    >
                      <span class={cn('shrink-0', isCollapsed() && 'mx-auto')}>
                        <tab.Icon class="h-5 w-5" />
                      </span>
                      <span class={cn('min-w-0 flex-1 truncate font-medium', isCollapsed() && 'hidden')}>
                        {tab.label}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              }}
            </For>
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
                tooltip="订阅管理"
                class={sidebarNavButtonClass(hubState.section === 'manage', {
                  collapsed: isCollapsed(),
                  extra: 'group/menu-button',
                })}
              >
                <span class={cn('shrink-0', isCollapsed() && 'mx-auto')}>
                  <LayoutIcon class="h-5 w-5" />
                </span>
                <span class={cn('min-w-0 flex-1 truncate font-medium', isCollapsed() && 'hidden')}>
                  订阅管理
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
            aria-label="订阅管理"
            onClick={openManage}
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
                  还没有订阅源
                </div>
              </Show>
            }
          >
            <For each={sourceGroups()}>
              {([category, groupSources]) => (
                <div class="mb-2">
                  <Show when={!isCollapsed()}>
                    <div class="px-3 py-1 text-[11px] font-medium text-sidebar-foreground/60">
                      {category || '未分类'}
                    </div>
                  </Show>
                  <SidebarMenu class={sidebarNavMenuClass(isCollapsed())}>
                    <For each={groupSources}>
                      {(source) => {
                        const active = () =>
                          isHomeFeedSection(hubState.section) &&
                          hubState.activeSourceId === source.id;
                        return (
                          <SidebarMenuItem class={sidebarNavMenuItemClass(isCollapsed())}>
                            <SidebarMenuButton
                              isActive={active()}
                              onClick={() => selectSource(source.id)}
                              tooltip={source.title || source.url}
                              class={sidebarNavButtonClass(active(), {
                                collapsed: isCollapsed(),
                                extra: cn('group/menu-button', !source.enabled && 'opacity-60'),
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
                              <span class={cn('min-w-0 flex-1 truncate', isCollapsed() && 'hidden')}>
                                {source.title || source.url}
                              </span>
                              <Show when={!isCollapsed() && (unreadBySource()[source.id] ?? 0) > 0}>
                                <span class="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                  {unreadBySource()[source.id]}
                                </span>
                              </Show>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      }}
                    </For>
                  </SidebarMenu>
                </div>
              )}
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
            aria-label="订阅管理"
            onClick={openManage}
          >
            <PlusIcon class="h-4 w-4" />
          </AppTooltipTrigger>
          <AppTooltipContent>订阅管理</AppTooltipContent>
        </AppTooltip>
      </Show>
    </>
  );
}
