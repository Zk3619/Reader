/**
 * 订阅模块侧栏：时间线与订阅源列表
 */

import { createEffect, createMemo, createResource, createSignal, For, Show, type Component } from 'solid-js';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { AppTextFieldInput } from '@/components/shared/AppTextField';
import {
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
} from '@/components/shared/AppTooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  BookmarkIcon,
  LayoutIcon,
  PlusIcon,
  RecordIcon,
  RssIcon,
  Settings2Icon,
  StarIcon,
} from '@/components/shared/icons';
import { showAppToast } from '@/components/shared/AppToasts';
import { cn } from '@/lib/utils';
import {
  sidebarNavButtonClass,
  sidebarNavMenuClass,
  sidebarNavMenuItemClass,
} from '@/lib/shell/sidebar-nav-button-class';
import {
  createSubscribeSource,
  listSubscribeDashboard,
  refreshSubscribeSource,
} from '@/lib/subscribe/service';
import type { SubSourceRow } from '@/lib/database/subscribe';
import type { SubscribeTimelineKind } from '@/lib/persistence/domains/subscribe-session';
import { getSubscribeConfig, subscribeConfigRevision } from '@/lib/persistence/domains/subscribe-config';
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

export interface SubscribeModuleSidebarSectionProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function SubscribeModuleSidebarSection(props: SubscribeModuleSidebarSectionProps) {
  const hubState = getSubscribeHubState();
  const isCollapsed = () => props.collapsed ?? false;
  const [addOpen, setAddOpen] = createSignal(false);
  const [newSourceTitle, setNewSourceTitle] = createSignal('');
  const [newSourceUrl, setNewSourceUrl] = createSignal('');
  const [newSourceCategory, setNewSourceCategory] = createSignal('');
  const [adding, setAdding] = createSignal(false);

  const [dashboard, { refetch }] = createResource(
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

  function openSettings() {
    setSubscribeSection('settings');
    props.onNavigate?.();
  }

  async function addSource() {
    const url = newSourceUrl().trim();
    if (!url || adding()) return;
    setAdding(true);
    try {
      const id = await createSubscribeSource({
        title: newSourceTitle().trim() || url,
        url,
        category: newSourceCategory().trim(),
      });
      setSubscribeActiveSource(id);
      setNewSourceTitle('');
      setNewSourceUrl('');
      setNewSourceCategory('');
      setAddOpen(false);
      await refetch();
      showAppToast({ title: '已添加订阅源', variant: 'success' });
      void refreshSubscribeSource(id).then(refetch);
    } catch (error) {
      showAppToast({
        title: '添加失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <SidebarGroup class={isCollapsed() ? 'px-0' : undefined}>
        <SidebarGroupContent>
          <SidebarMenu class={sidebarNavMenuClass(isCollapsed())}>
            <For each={SUBSCRIBE_TIMELINE_TABS}>
              {(tab) => {
                const active = () =>
                  hubState.section !== 'discover' &&
                  hubState.section !== 'settings' &&
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
                    <LayoutIcon class="h-5 w-5" />
                  </span>
                  <span class={cn('min-w-0 flex-1 truncate font-medium', isCollapsed() && 'hidden')}>
                    发现
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </Show>
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
            onClick={() => setAddOpen(true)}
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
                            hubState.section !== 'discover' &&
                            hubState.section !== 'settings' &&
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
                              <RssIcon class={cn('h-5 w-5 shrink-0', isCollapsed() && 'mx-auto')} />
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
            aria-label="添加订阅源"
            onClick={() => setAddOpen(true)}
          >
            <PlusIcon class="h-4 w-4" />
          </AppTooltipTrigger>
          <AppTooltipContent>添加订阅源</AppTooltipContent>
        </AppTooltip>
      </Show>

      <Dialog open={addOpen()} onOpenChange={setAddOpen}>
        <DialogContent class="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加订阅源</DialogTitle>
            <DialogDescription>支持 RSS / Atom 订阅地址。</DialogDescription>
          </DialogHeader>
          <div class="space-y-3 py-2">
            <AppTextFieldInput
              layout="bare"
              placeholder="标题（可选）"
              value={newSourceTitle()}
              onInput={(event) => setNewSourceTitle(event.currentTarget.value)}
            />
            <AppTextFieldInput
              layout="bare"
              placeholder="https://example.com/feed.xml"
              value={newSourceUrl()}
              onInput={(event) => setNewSourceUrl(event.currentTarget.value)}
            />
            <AppTextFieldInput
              layout="bare"
              placeholder="分类/文件夹（可选）"
              value={newSourceCategory()}
              onInput={(event) => setNewSourceCategory(event.currentTarget.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void addSource()} disabled={!newSourceUrl().trim() || adding()}>
              {adding() ? '添加中…' : '添加并刷新'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
