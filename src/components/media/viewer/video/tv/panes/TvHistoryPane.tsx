/**
 * 影视观看历史：更多菜单（存为片单 / 导出）+ 底栏批量操作（对齐书架管理）
 */

import { For, Show, createMemo, createResource, createSignal } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  ChevronDownIcon,
  ExportIcon,
  FolderIcon,
  FolderPlusIcon,
  MoreIcon,
  PencilIcon,
  TrashIcon,
} from '@/components/shared/icons';
import { TvListCover } from '@/components/media/viewer/video/tv/cards/TvListCover';
import { TvHubPageShell } from '@/components/media/viewer/video/tv/hub/TvHubPageShell';
import { TvKeepExportDialog } from '@/components/media/viewer/video/tv/hub/TvKeepExportDialog';
import { TvKeepGroupFormDialog } from '@/components/media/viewer/video/tv/hub/TvKeepGroupFormDialog';
import {
  TvKeepGroupPickDialog,
  type TvKeepGroupPickMode,
} from '@/components/media/viewer/video/tv/hub/TvKeepGroupPickDialog';
import { TvTrackEditDialog } from '@/components/media/viewer/video/tv/hub/TvTrackEditDialog';
import { showAppToast } from '@/components/shared/AppToasts';
import { tvHubPageContentInsetClass } from '@/lib/media/tv/tv-hub-section-meta';
import { buildTvKeepDisplayMeta } from '@/lib/media/tv/tv-keep-meta';
import {
  exportTvHistoryJson,
  historyRowsToKeep,
  isTvKeepExportCancelled,
  saveHistoryAsPlaylistGroup,
} from '@/lib/media/tv/tv-keep-export';
import { cn } from '@/lib/utils';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import { loadTvDetail } from '@/stores/tv-hub/detail';
import { BANGUMI_SITE_KEY } from '@/lib/media/tv/types';
import { decodeBangumiFlag } from '@/lib/media/video/bangumi/dao-bridge';
import type { TvHistoryRow } from '@/lib/media/tv/types';

async function openHistoryItem(item: TvHistoryRow) {
  if (item.siteKey === BANGUMI_SITE_KEY || item.key.startsWith('bangumi$')) {
    const id = Number(item.vodId) || item.cid;
    if (!id) return;
    const meta = decodeBangumiFlag(item.flag);
    const { openBangumiById } = await import('@/stores/tv-hub/bangumi-ui');
    const { setTvSection } = await import('@/stores/tv-hub/section');
    setTvSection('bangumi');
    await openBangumiById(id, {
      resumeEpisodeUrl: meta?.episodeUrl,
      resumeRuleId: meta?.ruleId,
    });
    return;
  }
  await loadTvDetail(item.siteKey, item.vodId);
}

const BATCH_MENU_TRIGGER_CLASS = 'gap-1.5 group/trigger';
const BATCH_MENU_CHEVRON_CLASS =
  'h-4 w-4 shrink-0 opacity-50 transition-transform duration-200 group-data-expanded/trigger:rotate-180';

export function TvHistoryPane() {
  const [tick, setTick] = createSignal(0);
  const [list] = createResource(
    () => tick(),
    () => TvDao.listHistory(80),
  );
  const [selected, setSelected] = createSignal<Record<string, true>>({});
  const [saveAsGroupOpen, setSaveAsGroupOpen] = createSignal(false);
  const [saveAsGroupSource, setSaveAsGroupSource] = createSignal<'all' | 'selected'>('all');
  const [exportPlaylistOpen, setExportPlaylistOpen] = createSignal(false);
  const [exportPlaylistSource, setExportPlaylistSource] = createSignal<'all' | 'selected'>(
    'selected',
  );
  const [clearConfirmOpen, setClearConfirmOpen] = createSignal(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = createSignal(false);
  const [editTarget, setEditTarget] = createSignal<TvHistoryRow | null>(null);
  const [groupPickOpen, setGroupPickOpen] = createSignal(false);
  const [groupPickMode, setGroupPickMode] = createSignal<TvKeepGroupPickMode>('move');
  const [groupPickKeys, setGroupPickKeys] = createSignal<string[]>([]);
  const [createGroupOpen, setCreateGroupOpen] = createSignal(false);
  const [groupsTick, setGroupsTick] = createSignal(0);
  const [groups] = createResource(
    () => groupsTick(),
    () => TvDao.listVideoGroups({ userOnly: true }),
  );

  const refresh = () => setTick((n) => n + 1);

  const selectedKeys = createMemo(() => Object.keys(selected()).filter((k) => selected()[k]));
  const selectedCount = () => selectedKeys().length;
  const allSelected = () => {
    const rows = list() ?? [];
    return rows.length > 0 && selectedCount() === rows.length;
  };

  const selectedRows = (): TvHistoryRow[] => {
    const keys = new Set(selectedKeys());
    return (list() ?? []).filter((r) => keys.has(r.key));
  };

  const rowsForSaveAsGroup = () =>
    saveAsGroupSource() === 'selected' ? selectedRows() : (list() ?? []);

  const rowsForPlaylistExport = () =>
    exportPlaylistSource() === 'selected' ? selectedRows() : (list() ?? []);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  };

  const selectAll = () => {
    const rows = list() ?? [];
    const next: Record<string, true> = {};
    for (const r of rows) next[r.key] = true;
    setSelected(next);
  };

  const clearSel = () => setSelected({});

  const invertSelection = () => {
    const rows = list() ?? [];
    const cur = selected();
    const next: Record<string, true> = {};
    for (const r of rows) {
      if (!cur[r.key]) next[r.key] = true;
    }
    setSelected(next);
  };

  const toggleSelectAll = () => {
    if (allSelected()) clearSel();
    else selectAll();
  };

  function openSaveAsGroup(source: 'all' | 'selected') {
    const rows = source === 'selected' ? selectedRows() : (list() ?? []);
    if (!rows.length) return;
    setSaveAsGroupSource(source);
    setSaveAsGroupOpen(true);
  }

  function openExportPlaylist(source: 'all' | 'selected') {
    const rows = source === 'selected' ? selectedRows() : (list() ?? []);
    if (!rows.length) return;
    setExportPlaylistSource(source);
    setExportPlaylistOpen(true);
  }

  async function exportHistoryJson(source: 'all' | 'selected') {
    const rows = source === 'selected' ? selectedRows() : (list() ?? []);
    if (!rows.length) return;
    try {
      const result = await exportTvHistoryJson(rows);
      void showAppToast({
        title: '导出完成',
        description: `${result.count} 条历史 · JSON`,
        variant: 'success',
      });
    } catch (e) {
      if (isTvKeepExportCancelled(e)) return;
      void showAppToast({
        title: '导出失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  }

  async function confirmDeleteSelected() {
    const keys = selectedKeys();
    if (!keys.length) return;
    try {
      for (const key of keys) {
        await TvDao.removeHistory(key);
      }
      clearSel();
      setDeleteConfirmOpen(false);
      refresh();
      void showAppToast({
        title: '已删除',
        description: `${keys.length} 条历史`,
        variant: 'success',
      });
    } catch (e) {
      void showAppToast({
        title: '删除失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  }

  async function confirmClearAll() {
    try {
      await TvDao.clearHistory();
      clearSel();
      setClearConfirmOpen(false);
      refresh();
      void showAppToast({ title: '已清空历史', variant: 'success' });
    } catch (e) {
      void showAppToast({
        title: '清空失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  }

  function openRowGroupPick(row: TvHistoryRow) {
    setGroupPickKeys([row.key]);
    setGroupPickMode('move');
    setGroupPickOpen(true);
  }

  async function applyRowGroupPick(groupIds: number[]) {
    const keys = groupPickKeys();
    if (!keys.length || !groupIds.length) return;
    const rows = (list() ?? []).filter((r) => keys.includes(r.key));
    if (!rows.length) return;
    try {
      const keepRows = historyRowsToKeep(rows);
      for (const row of keepRows) {
        await TvDao.upsertKeep(row);
      }
      if (groupPickMode() === 'move') {
        await TvDao.replaceKeepItemGroups(keys, groupIds);
      } else {
        await TvDao.addKeepItemsToGroups(keys, groupIds);
      }
      setGroupsTick((n) => n + 1);
      void showAppToast({
        title: '已加入收藏分组',
        description: `${keys.length} 部`,
        variant: 'success',
      });
    } catch (e) {
      void showAppToast({
        title: '操作失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  }

  const batchBar = () => (
    <div class="shrink-0 border-t border-border px-3 py-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleSelectAll}
            disabled={(list()?.length ?? 0) === 0}
          >
            {allSelected() ? '取消全选' : '全选'}({selectedCount()}/{list()?.length ?? 0})
          </Button>
          <Button variant="outline" size="sm" onClick={clearSel} disabled={selectedCount() === 0}>
            取消选中
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={invertSelection}
            disabled={(list()?.length ?? 0) === 0}
          >
            反选
          </Button>
        </div>

        <div class="flex min-[448px]:hidden! items-center gap-2">
          <AppDropdownMenu>
            <AppDropdownMenuTrigger
              as={(triggerProps: Record<string, unknown>) => (
                <AppDropdownMenuButtonTrigger
                  triggerProps={triggerProps}
                  variant="outline"
                  size="sm"
                  class={BATCH_MENU_TRIGGER_CLASS}
                >
                  操作
                  <ChevronDownIcon class={BATCH_MENU_CHEVRON_CLASS} />
                </AppDropdownMenuButtonTrigger>
              )}
            />
            <AppDropdownMenuContent layout="compact">
              <AppDropdownMenuItem
                disabled={selectedCount() === 0}
                onSelect={() => openSaveAsGroup('selected')}
              >
                存为片单分组
              </AppDropdownMenuItem>
              <AppDropdownMenuItem
                disabled={selectedCount() === 0}
                onSelect={() => openExportPlaylist('selected')}
              >
                导出所选(作为片单)
              </AppDropdownMenuItem>
              <AppDropdownMenuItem
                disabled={selectedCount() === 0}
                onSelect={() => void exportHistoryJson('selected')}
              >
                导出所选(历史 JSON)
              </AppDropdownMenuItem>
              <AppDropdownMenuItem
                disabled={selectedCount() === 0}
                class="text-destructive focus:text-destructive"
                onSelect={() => setDeleteConfirmOpen(true)}
              >
                删除所选
              </AppDropdownMenuItem>
            </AppDropdownMenuContent>
          </AppDropdownMenu>
        </div>

        <div class="hidden min-[448px]:flex xl:hidden! items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={selectedCount() === 0}
            onClick={() => openSaveAsGroup('selected')}
          >
            存为片单分组
          </Button>
          <AppDropdownMenu>
            <AppDropdownMenuTrigger
              as={(triggerProps: Record<string, unknown>) => (
                <AppDropdownMenuButtonTrigger
                  triggerProps={triggerProps}
                  variant="outline"
                  size="sm"
                  class={BATCH_MENU_TRIGGER_CLASS}
                >
                  更多
                  <ChevronDownIcon class={BATCH_MENU_CHEVRON_CLASS} />
                </AppDropdownMenuButtonTrigger>
              )}
            />
            <AppDropdownMenuContent layout="compact">
              <AppDropdownMenuItem
                disabled={selectedCount() === 0}
                class="text-destructive focus:text-destructive"
                onSelect={() => setDeleteConfirmOpen(true)}
              >
                删除所选
              </AppDropdownMenuItem>
              <AppDropdownMenuItem
                disabled={selectedCount() === 0}
                onSelect={() => openExportPlaylist('selected')}
              >
                导出所选(作为片单)
              </AppDropdownMenuItem>
              <AppDropdownMenuItem
                disabled={selectedCount() === 0}
                onSelect={() => void exportHistoryJson('selected')}
              >
                导出所选(历史 JSON)
              </AppDropdownMenuItem>
            </AppDropdownMenuContent>
          </AppDropdownMenu>
        </div>

        <div class="hidden xl:flex! flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={selectedCount() === 0}
            onClick={() => openSaveAsGroup('selected')}
          >
            存为片单分组
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={selectedCount() === 0}
            onClick={() => openExportPlaylist('selected')}
          >
            导出所选(作为片单)
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={selectedCount() === 0}
            onClick={() => void exportHistoryJson('selected')}
          >
            导出所选(历史 JSON)
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={selectedCount() === 0}
            onClick={() => setDeleteConfirmOpen(true)}
          >
            删除所选
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <TvHubPageShell
      section="history"
      description={
        list.loading
          ? '加载中…'
          : selectedCount()
            ? `已选 ${selectedCount()} / ${list()?.length ?? 0}`
            : `${list()?.length ?? 0} 条记录`
      }
      toolbar={
        <AppDropdownMenu>
          <AppTooltip>
            <AppTooltipTrigger as="div">
              <AppDropdownMenuTrigger
                as={(triggerProps: Record<string, unknown>) => (
                  <AppDropdownMenuIconTrigger
                    triggerProps={triggerProps}
                    disabled={list.loading || !(list()?.length ?? 0)}
                  >
                    <MoreIcon class="h-4 w-4" />
                    <span class="sr-only">更多</span>
                  </AppDropdownMenuIconTrigger>
                )}
              />
            </AppTooltipTrigger>
            <AppTooltipContent>更多</AppTooltipContent>
          </AppTooltip>
          <AppDropdownMenuContent layout="compact" class="min-w-48">
            <AppDropdownMenuItem onSelect={() => openSaveAsGroup('all')}>
              <FolderPlusIcon class="h-4 w-4" />
              <span>将历史记录保存为片单</span>
            </AppDropdownMenuItem>
            <AppDropdownMenuItem onSelect={() => void exportHistoryJson('all')}>
              <ExportIcon class="h-4 w-4" />
              <span>导出历史记录(JSON)</span>
            </AppDropdownMenuItem>
            <AppDropdownMenuItem onSelect={() => openExportPlaylist('all')}>
              <ExportIcon class="h-4 w-4" />
              <span>导出历史(作为片单)</span>
            </AppDropdownMenuItem>
            <AppDropdownMenuSeparator />
            <AppDropdownMenuItem
              class="text-destructive focus:text-destructive"
              onSelect={() => setClearConfirmOpen(true)}
            >
              <TrashIcon class="h-4 w-4" />
              <span>清空历史</span>
            </AppDropdownMenuItem>
          </AppDropdownMenuContent>
        </AppDropdownMenu>
      }
      footer={batchBar()}
    >
      <div class={cn('flex min-h-0 flex-1 flex-col', tvHubPageContentInsetClass)}>
        <div class="min-h-0 flex-1 overflow-y-auto py-2">
          <Show
            when={!list.loading && (list()?.length ?? 0) > 0}
            fallback={
              <div class="rounded-xl border border-border/50 bg-card py-12 text-center text-sm text-muted-foreground">
                {list.loading ? '加载中…' : '暂无观看记录'}
              </div>
            }
          >
            <ul class="space-y-1">
              <For each={list() ?? []}>
                {(item) => {
                  const meta = () => buildTvKeepDisplayMeta(item);
                  return (
                    <li class="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-accent/40">
                      <Checkbox
                        checked={!!selected()[item.key]}
                        onChange={() => toggle(item.key)}
                        aria-label={`选择 ${item.vodName || '未命名'}`}
                      />
                      <button
                        type="button"
                        class="flex min-w-0 flex-1 items-center gap-3 text-left"
                        onClick={() => void openHistoryItem(item)}
                      >
                        <TvListCover coverUrl={item.vodPic} />
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-sm font-medium">
                            {item.vodName || '未命名'}
                          </p>
                          <Show when={meta().sourceLine}>
                            <p class="truncate text-xs text-muted-foreground">
                              {meta().sourceLine}
                            </p>
                          </Show>
                          <Show when={meta().playLine}>
                            <p class="truncate text-xs text-muted-foreground">
                              {meta().playLine}
                            </p>
                          </Show>
                        </div>
                      </button>
                      <div class="flex shrink-0 items-center gap-0.5">
                        <AppTooltip>
                          <AppTooltipTrigger
                            as={Button}
                            type="button"
                            variant="ghost"
                            size="icon"
                            class="h-8 w-8 shrink-0"
                            aria-label={`编辑 ${item.vodName || '未命名'}`}
                            onClick={() => setEditTarget(item)}
                          >
                            <PencilIcon class="h-4 w-4" />
                          </AppTooltipTrigger>
                          <AppTooltipContent>编辑</AppTooltipContent>
                        </AppTooltip>
                        <AppTooltip>
                          <AppTooltipTrigger
                            as={Button}
                            type="button"
                            variant="ghost"
                            size="icon"
                            class="h-8 w-8 shrink-0"
                            aria-label={`分组 ${item.vodName || '未命名'}`}
                            onClick={() => openRowGroupPick(item)}
                          >
                            <FolderIcon class="h-4 w-4" />
                          </AppTooltipTrigger>
                          <AppTooltipContent>分组</AppTooltipContent>
                        </AppTooltip>
                      </div>
                    </li>
                  );
                }}
              </For>
            </ul>
          </Show>
        </div>
      </div>

      <TvKeepGroupFormDialog
        open={saveAsGroupOpen()}
        onOpenChange={setSaveAsGroupOpen}
        title="保存为片单分组"
        description={`将 ${rowsForSaveAsGroup().length} 条历史写入收藏，并新建自定义分组`}
        onSubmit={async ({ groupName }) => {
          try {
            const result = await saveHistoryAsPlaylistGroup(rowsForSaveAsGroup(), groupName);
            void showAppToast({
              title: '已保存为片单',
              description: `${result.count} 部 → ${result.groupName}`,
              variant: 'success',
            });
          } catch (e) {
            void showAppToast({
              title: '保存失败',
              description: e instanceof Error ? e.message : String(e),
              variant: 'error',
            });
            throw e;
          }
        }}
      />

      <TvKeepExportDialog
        open={exportPlaylistOpen()}
        onOpenChange={setExportPlaylistOpen}
        rows={() => historyRowsToKeep(rowsForPlaylistExport())}
        title="导出历史(作为片单)"
        description="按片单格式导出，可再导入到收藏"
      />

      <TvKeepGroupPickDialog
        open={groupPickOpen()}
        onOpenChange={setGroupPickOpen}
        mode={groupPickMode()}
        title="移入分组"
        description="将条目加入收藏并移入所选自定义分组"
        groups={groups() ?? []}
        onConfirm={(ids) => void applyRowGroupPick(ids)}
        onAddGroup={() => {
          setGroupPickOpen(false);
          setCreateGroupOpen(true);
        }}
      />

      <TvKeepGroupFormDialog
        open={createGroupOpen()}
        onOpenChange={setCreateGroupOpen}
        onSubmit={async ({ groupName }) => {
          await TvDao.insertVideoGroup({ groupName });
          setGroupsTick((n) => n + 1);
          void showAppToast({
            title: '已创建分组',
            description: groupName,
            variant: 'success',
          });
          setGroupPickOpen(true);
        }}
      />

      <TvTrackEditDialog
        open={!!editTarget()}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        title="编辑历史"
        initial={
          editTarget()
            ? { vodName: editTarget()!.vodName, vodPic: editTarget()!.vodPic }
            : null
        }
        onSubmit={async (fields) => {
          const cur = editTarget();
          if (!cur) return;
          try {
            await TvDao.upsertHistory({
              ...cur,
              vodName: fields.vodName,
              vodPic: fields.vodPic,
              updatedAt: Date.now(),
            });
            refresh();
            void showAppToast({ title: '已保存', description: fields.vodName, variant: 'success' });
          } catch (e) {
            void showAppToast({
              title: '保存失败',
              description: e instanceof Error ? e.message : String(e),
              variant: 'error',
            });
            throw e;
          }
        }}
      />

      <AppDialog open={clearConfirmOpen()} onOpenChange={setClearConfirmOpen}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>清空历史</AppDialogTitle>
            <AppDialogDescription>
              确定清空全部 {list()?.length ?? 0} 条观看记录吗？此操作不可撤销。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter>
            <Button variant="outline" type="button" onClick={() => setClearConfirmOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmClearAll()}
            >
              清空
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      <AppDialog open={deleteConfirmOpen()} onOpenChange={setDeleteConfirmOpen}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>删除所选</AppDialogTitle>
            <AppDialogDescription>
              确定删除已选的 {selectedCount()} 条历史吗？此操作不可撤销。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter>
            <Button variant="outline" type="button" onClick={() => setDeleteConfirmOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmDeleteSelected()}
            >
              删除
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </TvHubPageShell>
  );
}
