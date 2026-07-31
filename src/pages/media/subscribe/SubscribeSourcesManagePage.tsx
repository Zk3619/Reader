/**
 * 独立订阅模块 — 订阅管理页（参考阅读模块 RssSourcesManagePage 布局）
 * 添加订阅、OPML 导入导出、源列表启用/分类/删除。
 */

import { createMemo, createResource, createSignal, For, Show } from 'solid-js';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import { Button } from '@/components/ui/button';
import {
  AppSwitch,
  AppSwitchControl,
  AppSwitchThumb,
} from '@/components/shared/AppSwitch';
import { AppTextFieldBareInput, AppTextFieldInput } from '@/components/shared/AppTextField';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import {
  AppSelect,
  AppSelectContent,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import {
  MoreIcon,
  PlusIcon,
  SearchIcon,
} from '@/components/shared/icons';
import { showAppToast } from '@/components/shared/AppToasts';
import { cn } from '@/lib/utils';
import {
  mainShellPageRoot,
  mainShellPageScroll,
  mainShellTabEnterClass,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import { settingsStore } from '@/stores/settings';
import { listSubSources, setSubSourceEnabled } from '@/lib/database/subscribe';
import type { SubSourceRow } from '@/lib/database/subscribe';
import {
  createSubscribeSource,
  exportSubscribeOpml,
  importSubscribeOpml,
  refreshSubscribeSource,
  removeSubscribeSource,
  updateSubscribeSource,
} from '@/lib/subscribe/service';
import { formatSubscribeTime } from '@/lib/subscribe/presentation';
import { SubscribeSourceLogo } from '@/components/media/subscribe/SubscribeSourceLogo';
import {
  SUBSCRIBE_FEED_VIEW_LABELS,
  SUBSCRIBE_FEED_VIEW_STORED,
  defaultSubscribeFeedViewForWrite,
  subscribeFeedViewNumberToKind,
  type SubscribeFeedViewStored,
} from '@/lib/subscribe/feed-view';
import { getSubscribeHubState } from '@/stores/subscribe-hub/section';
import { pickFiles } from '@/lib/platform/fs/pick-file';
import type { PickResult } from '@/lib/platform/fs/pick-types';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { downloadTextFile } from '@/lib/shared/download-source-scripts';
import { readTextFile } from '@/lib/platform/filesystem';

async function textFromPickResult(p: PickResult): Promise<string> {
  if (p.legacyFile) return p.legacyFile.text();
  if (p.bytes) return new TextDecoder().decode(p.bytes);
  if (p.ref.kind === 'path') return readTextFile(p.ref.value);
  throw new Error('无法读取所选文件');
}

export function SubscribeSourcesManagePage() {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);
  const hubState = getSubscribeHubState();
  const [sources, { refetch }] = createResource(() => listSubSources());
  const [searchQuery, setSearchQuery] = createSignal('');
  const [busy, setBusy] = createSignal('');
  const [addOpen, setAddOpen] = createSignal(false);
  const [newSourceTitle, setNewSourceTitle] = createSignal('');
  const [newSourceUrl, setNewSourceUrl] = createSignal('');
  const [newSourceCategory, setNewSourceCategory] = createSignal('');
  const [newSourceView, setNewSourceView] = createSignal<SubscribeFeedViewStored>(
    subscribeFeedViewNumberToKind(defaultSubscribeFeedViewForWrite(hubState.feedView)),
  );

  const filteredSources = createMemo(() => {
    const q = searchQuery().trim().toLowerCase();
    const list = sources() ?? [];
    if (!q) return list;
    return list.filter((source) => {
      const hay = `${source.title} ${source.url} ${source.category ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  });

  const groupedSources = createMemo(() => {
    const groups = new Map<string, SubSourceRow[]>();
    for (const source of filteredSources()) {
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

  function openAddDialog() {
    setNewSourceView(
      subscribeFeedViewNumberToKind(defaultSubscribeFeedViewForWrite(hubState.feedView)),
    );
    setAddOpen(true);
  }

  async function doCreateSource() {
    const url = newSourceUrl().trim();
    if (!url || busy()) return;
    setBusy('正在添加订阅源...');
    try {
      const id = await createSubscribeSource({
        title: newSourceTitle().trim() || url,
        url,
        type: 'rss',
        category: newSourceCategory().trim(),
        view: defaultSubscribeFeedViewForWrite(newSourceView()),
      });
      setNewSourceTitle('');
      setNewSourceUrl('');
      setNewSourceCategory('');
      setNewSourceView(
        subscribeFeedViewNumberToKind(defaultSubscribeFeedViewForWrite(hubState.feedView)),
      );
      setAddOpen(false);
      await refetch();
      showAppToast({ title: '已添加订阅源', variant: 'success' });
      void refreshSubscribeSource(id).then(() => refetch());
    } catch (error) {
      showAppToast({
        title: '添加失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setBusy('');
    }
  }

  async function doImportOpml() {
    setBusy('正在导入 OPML...');
    try {
      const picked = await pickFiles({
        filters: [{ name: 'OPML', extensions: ['opml', 'xml'] }],
        multiple: false,
      });
      const file = picked[0];
      if (!file) {
        setBusy('');
        return;
      }
      const xml = await textFromPickResult(file);
      const result = await importSubscribeOpml(xml);
      showAppToast({
        title: 'OPML 导入完成',
        description: `新增 ${result.imported}，跳过 ${result.skipped}`,
      });
      await refetch();
    } catch (error) {
      if (!isUserCancelled(error)) {
        showAppToast({
          title: '导入失败',
          description: error instanceof Error ? error.message : String(error),
          variant: 'error',
        });
      }
    } finally {
      setBusy('');
    }
  }

  async function doExportOpml() {
    setBusy('正在导出 OPML...');
    try {
      const xml = await exportSubscribeOpml();
      await downloadTextFile(xml, `subscribe-${Date.now()}.opml`, 'text/xml');
      showAppToast({ title: '已导出 OPML' });
    } catch (error) {
      showAppToast({
        title: '导出失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setBusy('');
    }
  }

  return (
    <section class={cn(tabEnterClass(), mainShellPageRoot)}>
      <PageToolbar
        class={pageToolbarBottomBorder}
        title="订阅管理"
        description={`共 ${sources()?.length ?? 0} 个源 · 独立 sub_*`}
        titleSlot={
          <PageToolbarTitleDropdown
            title="订阅管理"
            description={`共 ${sources()?.length ?? 0} 个源 · 独立 sub_*`}
            dropdownEnabled={false}
          />
        }
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="h-9 w-9"
          aria-label="添加订阅源"
          disabled={!!busy()}
          onClick={openAddDialog}
        >
          <PlusIcon class="h-4 w-4" />
        </Button>
        <AppDropdownMenu>
          <AppDropdownMenuTrigger
            as={(triggerProps: Record<string, unknown>) => (
              <AppDropdownMenuIconTrigger
                triggerProps={triggerProps}
                aria-label="更多"
              >
                <MoreIcon class="h-4 w-4" />
              </AppDropdownMenuIconTrigger>
            )}
          />
          <AppDropdownMenuContent>
            <AppDropdownMenuItem
              onSelect={openAddDialog}
              disabled={!!busy()}
            >
              添加订阅源
            </AppDropdownMenuItem>
            <AppDropdownMenuItem
              onSelect={() => void doImportOpml()}
              disabled={!!busy()}
            >
              导入 OPML
            </AppDropdownMenuItem>
            <AppDropdownMenuItem
              onSelect={() => void doExportOpml()}
              disabled={!!busy()}
            >
              导出 OPML
            </AppDropdownMenuItem>
          </AppDropdownMenuContent>
        </AppDropdownMenu>
      </PageToolbar>

      <div class={cn(mainShellPageScroll, 'flex min-h-0 flex-1 flex-col')}>
        <div class="flex min-h-0 w-full flex-1 flex-col gap-3 pb-4">
          <div class="relative px-1">
            <SearchIcon class="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <AppTextFieldBareInput
              class="h-9 pl-8"
              fieldClass="w-full"
              placeholder="搜索标题、URL 或分类"
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
            />
          </div>

          <Show when={busy()}>
            <div class="px-1 text-xs text-muted-foreground">{busy()}</div>
          </Show>

          <Show
            when={filteredSources().length > 0}
            fallback={
              <div class="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
                <div class="text-sm text-muted-foreground">
                  {searchQuery().trim() ? '没有匹配的订阅源' : '还没有订阅源'}
                </div>
                <Show when={!searchQuery().trim()}>
                  <Button size="sm" onClick={openAddDialog}>
                    <PlusIcon class="mr-1 h-3.5 w-3.5" />
                    添加订阅源
                  </Button>
                </Show>
              </div>
            }
          >
            <div class="space-y-4">
              <For each={groupedSources()}>
                {([category, groupSources]) => (
                  <section class="rounded-2xl border border-border/50 bg-card">
                    <div class="border-b px-4 py-2 text-xs font-medium text-muted-foreground">
                      {category || '未分类'} · {groupSources.length}
                    </div>
                    <div class="divide-y">
                      <For each={groupSources}>
                        {(source) => (
                          <div class="px-4 py-3">
                            <div class="flex items-start gap-3">
                              <SubscribeSourceLogo
                                source={source}
                                class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted"
                                iconClass="h-4 w-4 text-muted-foreground"
                              />
                              <div class="min-w-0 flex-1">
                                <div class="truncate text-sm font-medium">
                                  {source.title || source.url}
                                </div>
                                <div class="truncate text-xs text-muted-foreground">
                                  {source.url}
                                </div>
                                <div class="mt-1 text-[11px] text-muted-foreground">
                                  {SUBSCRIBE_FEED_VIEW_LABELS[subscribeFeedViewNumberToKind(source.view)]}
                                  {' · '}
                                  上次刷新：
                                  {formatSubscribeTime(source.lastFetchAt) || '从未'}
                                </div>
                              </div>
                              <AppSwitch
                                checked={source.enabled}
                                onChange={(checked) =>
                                  void setSubSourceEnabled(source.id, checked).then(() =>
                                    refetch(),
                                  )
                                }
                                aria-label={source.enabled ? '停用订阅源' : '启用订阅源'}
                              >
                                <AppSwitchControl>
                                  <AppSwitchThumb />
                                </AppSwitchControl>
                              </AppSwitch>
                              <Button
                                size="sm"
                                variant="outline"
                                class="text-destructive"
                                disabled={!!busy()}
                                onClick={() =>
                                  void removeSubscribeSource(source.id).then(() => {
                                    showAppToast({ title: '已删除订阅源' });
                                    void refetch();
                                  })
                                }
                              >
                                删除
                              </Button>
                            </div>
                            <div class="mt-2 flex flex-wrap gap-2">
                              <AppTextFieldBareInput
                                layout="compact"
                                fieldClass="min-w-0 flex-1"
                                placeholder="分类/文件夹"
                                value={source.category ?? ''}
                                onBlur={(e: FocusEvent) => {
                                  const next = (e.currentTarget as HTMLInputElement).value.trim();
                                  if (next === (source.category ?? '').trim()) return;
                                  void updateSubscribeSource(source.id, { category: next }).then(
                                    () => refetch(),
                                  );
                                }}
                              />
                              <AppSelect
                                options={SUBSCRIBE_FEED_VIEW_STORED}
                                value={subscribeFeedViewNumberToKind(source.view)}
                                onChange={(next) => {
                                  if (!next) return;
                                  const view = defaultSubscribeFeedViewForWrite(next);
                                  if (view === source.view) return;
                                  void updateSubscribeSource(source.id, { view }).then(() =>
                                    refetch(),
                                  );
                                }}
                                itemComponent={(itemProps) => (
                                  <AppSelectItem item={itemProps.item}>
                                    {SUBSCRIBE_FEED_VIEW_LABELS[itemProps.item.rawValue]}
                                  </AppSelectItem>
                                )}
                              >
                                <AppSelectTrigger layout="compact" class="w-32" aria-label="内容频道">
                                  <AppSelectValue>
                                    {(state) =>
                                      SUBSCRIBE_FEED_VIEW_LABELS[
                                        state.selectedOption() as SubscribeFeedViewStored
                                      ]
                                    }
                                  </AppSelectValue>
                                  <AppSelectIcon />
                                </AppSelectTrigger>
                                <AppSelectContent>
                                  <AppSelectListbox />
                                </AppSelectContent>
                              </AppSelect>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </section>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>

      <Dialog open={addOpen()} onOpenChange={setAddOpen}>
        <DialogContent class="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加订阅源</DialogTitle>
            <DialogDescription>
              支持 RSS / Atom。数据写入独立 `sub_*` 表，不影响阅读模块 legado RSS。
            </DialogDescription>
          </DialogHeader>
          <div class="space-y-3 py-2">
            <AppTextFieldInput
              layout="bare"
              placeholder="标题（可选）"
              value={newSourceTitle()}
              onInput={(e) => setNewSourceTitle(e.currentTarget.value)}
            />
            <AppTextFieldInput
              layout="bare"
              placeholder="https://example.com/feed.xml"
              value={newSourceUrl()}
              onInput={(e) => setNewSourceUrl(e.currentTarget.value)}
            />
            <AppTextFieldInput
              layout="bare"
              placeholder="分类/文件夹（可选）"
              value={newSourceCategory()}
              onInput={(e) => setNewSourceCategory(e.currentTarget.value)}
            />
            <AppSelect
              options={SUBSCRIBE_FEED_VIEW_STORED}
              value={newSourceView()}
              onChange={(next) => {
                if (next) setNewSourceView(next);
              }}
              itemComponent={(itemProps) => (
                <AppSelectItem item={itemProps.item}>
                  {SUBSCRIBE_FEED_VIEW_LABELS[itemProps.item.rawValue]}
                </AppSelectItem>
              )}
            >
              <AppSelectTrigger layout="compact" class="w-full" aria-label="内容频道">
                <AppSelectValue>
                  {(state) =>
                    SUBSCRIBE_FEED_VIEW_LABELS[
                      state.selectedOption() as SubscribeFeedViewStored
                    ] || '文章'
                  }
                </AppSelectValue>
                <AppSelectIcon />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectListbox />
              </AppSelectContent>
            </AppSelect>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => void doCreateSource()}
              disabled={!newSourceUrl().trim() || !!busy()}
            >
              添加并刷新
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
