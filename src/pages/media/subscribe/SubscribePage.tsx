import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import { Button } from '@/components/ui/button';
import { Settings2Icon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import {
  mainShellPageRoot,
  mainShellPageScroll,
  mainShellTabEnterClass,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import { settingsStore } from '@/stores/settings';
import {
  getSubscribeHubState,
  setSubscribeActiveSource,
  setSubscribeEntryQuery,
  setSubscribeSection,
  setSubscribeStarredOnly,
  setSubscribeUnreadOnly,
} from '@/stores/subscribe-hub/section';
import { createEffect, createMemo, createResource, createSignal, For, Show } from 'solid-js';
import {
  createSubscribeSource,
  listSubscribeDashboard,
  refreshSubscribeSource,
  removeSubscribeSource,
  updateSubscribeEntryRead,
  updateSubscribeEntryStarred,
  updateSubscribeSourceEnabled,
} from '@/lib/subscribe/service';
import { getSubscribeConfig } from '@/lib/persistence/domains/subscribe-config';

export interface SubscribePageProps {
  onOpenSubscribeSettings?: () => void;
}

export function SubscribePage(props: SubscribePageProps) {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);
  const hubState = getSubscribeHubState();
  const [newSourceTitle, setNewSourceTitle] = createSignal('');
  const [newSourceUrl, setNewSourceUrl] = createSignal('');
  const [busyText, setBusyText] = createSignal('');

  const [dashboard, { refetch }] = createResource(
    () => ({
      sourceId: hubState.activeSourceId || undefined,
      unreadOnly: hubState.unreadOnly,
      starredOnly: hubState.starredOnly,
      query: hubState.entryQuery,
    }),
    (opts) => listSubscribeDashboard(opts),
  );

  const entries = createMemo(() => dashboard()?.entries ?? []);
  const sources = createMemo(() => dashboard()?.sources ?? []);

  async function doCreateSource() {
    if (!newSourceUrl().trim()) return;
    setBusyText('正在添加订阅源...');
    try {
      const id = await createSubscribeSource({
        title: newSourceTitle().trim() || newSourceUrl().trim(),
        url: newSourceUrl().trim(),
      });
      setSubscribeActiveSource(id);
      setNewSourceTitle('');
      setNewSourceUrl('');
      await refetch();
    } finally {
      setBusyText('');
    }
  }

  async function doRefresh(sourceId?: string) {
    const id = sourceId || hubState.activeSourceId;
    if (!id) return;
    setBusyText('正在刷新订阅...');
    try {
      await refreshSubscribeSource(id);
      await refetch();
    } finally {
      setBusyText('');
    }
  }

  createEffect(() => {
    const sourceId = hubState.activeSourceId;
    if (!sourceId) return;
    void getSubscribeConfig().then((cfg) => {
      if (cfg.autoRefreshOnOpen) void doRefresh(sourceId);
    });
  });

  return (
    <section class={cn(tabEnterClass(), mainShellPageRoot)}>
      <PageToolbar
        class={pageToolbarBottomBorder}
        title="订阅"
        description="Folo 信息流（开发中）"
        titleSlot={
          <PageToolbarTitleDropdown
            title="订阅"
            description="Folo 信息流（开发中）"
            dropdownEnabled={false}
          />
        }
      >
        {props.onOpenSubscribeSettings ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="h-9 w-9"
            aria-label="订阅设置"
            onClick={() => {
              setSubscribeSection('settings');
              props.onOpenSubscribeSettings?.();
            }}
          >
            <Settings2Icon class="h-4 w-4" />
          </Button>
        ) : undefined}
      </PageToolbar>
      <div class={cn(mainShellPageScroll, 'flex min-h-0 flex-1 flex-col')}>
        <div class="flex min-h-0 flex-1 gap-3 p-3">
          <aside class="flex w-72 shrink-0 flex-col gap-2 rounded-md border bg-card p-2">
            <div class="text-sm font-medium">订阅源</div>
            <input
              class="h-9 rounded-md border bg-background px-2 text-sm"
              placeholder="订阅标题（可选）"
              value={newSourceTitle()}
              onInput={(e) => setNewSourceTitle(e.currentTarget.value)}
            />
            <input
              class="h-9 rounded-md border bg-background px-2 text-sm"
              placeholder="输入 RSS/Atom URL"
              value={newSourceUrl()}
              onInput={(e) => setNewSourceUrl(e.currentTarget.value)}
            />
            <Button size="sm" onClick={doCreateSource}>添加订阅源</Button>
            <div class="mt-2 text-xs text-muted-foreground">{busyText()}</div>
            <div class="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
              <For each={sources()}>
                {(source) => (
                  <div
                    class={cn(
                      'rounded-md border p-2 text-xs',
                      hubState.activeSourceId === source.id ? 'border-primary bg-primary/5' : '',
                    )}
                  >
                    <button
                      class="w-full text-left font-medium"
                      onClick={() => setSubscribeActiveSource(source.id)}
                    >
                      {source.title || source.url}
                    </button>
                    <div class="mt-1 text-muted-foreground">{source.url}</div>
                    <div class="mt-2 flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => void doRefresh(source.id)}>
                        刷新
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void updateSubscribeSourceEnabled(source.id, !source.enabled).then(refetch)}
                      >
                        {source.enabled ? '停用' : '启用'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void removeSubscribeSource(source.id).then(refetch)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </aside>

          <main class="flex min-h-0 flex-1 flex-col rounded-md border bg-card p-3">
            <div class="mb-2 flex items-center gap-2">
              <input
                class="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
                placeholder="搜索标题/内容"
                value={hubState.entryQuery}
                onInput={(e) => setSubscribeEntryQuery(e.currentTarget.value)}
              />
              <Button size="sm" variant={hubState.unreadOnly ? 'default' : 'outline'} onClick={() => setSubscribeUnreadOnly(!hubState.unreadOnly)}>
                未读
              </Button>
              <Button size="sm" variant={hubState.starredOnly ? 'default' : 'outline'} onClick={() => setSubscribeStarredOnly(!hubState.starredOnly)}>
                收藏
              </Button>
              <Button size="sm" variant="outline" onClick={() => void doRefresh()}>
                刷新当前源
              </Button>
            </div>
            <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
              <Show
                when={entries().length > 0}
                fallback={<div class="py-12 text-center text-sm text-muted-foreground">暂无条目，先添加并刷新订阅源。</div>}
              >
                <For each={entries()}>
                  {(entry) => (
                    <div class="rounded-md border p-2">
                      <div class="flex items-center justify-between gap-3">
                        <div class="truncate text-sm font-medium">{entry.title}</div>
                        <div class="flex items-center gap-1">
                          <Button size="sm" variant="outline" onClick={() => void updateSubscribeEntryRead(entry.id, !entry.read).then(refetch)}>
                            {entry.read ? '标未读' : '标已读'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => void updateSubscribeEntryStarred(entry.id, !entry.starred).then(refetch)}>
                            {entry.starred ? '取消收藏' : '收藏'}
                          </Button>
                        </div>
                      </div>
                      <div class="mt-1 text-xs text-muted-foreground">{entry.author || '未知作者'}</div>
                      <Show when={entry.url}>
                        <a class="mt-1 block truncate text-xs text-primary hover:underline" href={entry.url ?? '#'} target="_blank" rel="noreferrer">
                          {entry.url}
                        </a>
                      </Show>
                      <Show when={entry.content}>
                        <p class="mt-2 line-clamp-3 text-xs text-muted-foreground">{entry.content}</p>
                      </Show>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </main>
        </div>
      </div>
    </section>
  );
}
