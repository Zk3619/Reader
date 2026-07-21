/**
 * 影视收藏管理：多选取消收藏 / 分组 / 导出所选（底栏对齐书架管理）
 */

import { For, Show, createMemo, createResource, createSignal } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AppDropdownMenu,
  AppDropdownMenuButtonTrigger,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
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
  ChevronLeftIcon,
  FolderIcon,
  PencilIcon,
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
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import { buildTvKeepDisplayMeta } from '@/lib/media/tv/tv-keep-meta';
import { tvHubPageContentInsetClass } from '@/lib/media/tv/tv-hub-section-meta';
import type { TvKeepRow } from '@/lib/media/tv/types';
import { cn } from '@/lib/utils';

const BATCH_MENU_TRIGGER_CLASS = 'gap-1.5 group/trigger';
const BATCH_MENU_CHEVRON_CLASS =
  'h-4 w-4 shrink-0 opacity-50 transition-transform duration-200 group-data-expanded/trigger:rotate-180';

export interface TvKeepManagePaneProps {
  onClose: () => void;
  onChanged?: () => void;
}

export function TvKeepManagePane(props: TvKeepManagePaneProps) {
  const [tick, setTick] = createSignal(0);
  const [list] = createResource(
    () => tick(),
    () => TvDao.listKeep(),
  );
  const [groups] = createResource(
    () => tick(),
    () => TvDao.listVideoGroups({ userOnly: true }),
  );
  const [selected, setSelected] = createSignal<Record<string, true>>({});
  const [groupPickOpen, setGroupPickOpen] = createSignal(false);
  const [groupPickMode, setGroupPickMode] = createSignal<TvKeepGroupPickMode>('move');
  const [groupPickKeys, setGroupPickKeys] = createSignal<string[]>([]);
  const [createGroupOpen, setCreateGroupOpen] = createSignal(false);
  const [exportOpen, setExportOpen] = createSignal(false);
  const [removeGroupConfirmOpen, setRemoveGroupConfirmOpen] = createSignal(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = createSignal(false);
  const [editTarget, setEditTarget] = createSignal<TvKeepRow | null>(null);

  const refresh = () => {
    setTick((n) => n + 1);
    props.onChanged?.();
  };

  const selectedKeys = createMemo(() => Object.keys(selected()).filter((k) => selected()[k]));
  const selectedCount = () => selectedKeys().length;
  const allSelected = () => {
    const rows = list() ?? [];
    return rows.length > 0 && selectedCount() === rows.length;
  };
  const selectedRows = () => {
    const keys = new Set(selectedKeys());
    return (list() ?? []).filter((r) => keys.has(r.key));
  };

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

  function openGroupPick(mode: TvKeepGroupPickMode, keys?: string[]) {
    const target = keys ?? selectedKeys();
    if (!target.length) return;
    setGroupPickKeys(target);
    setGroupPickMode(mode);
    setGroupPickOpen(true);
  }

  async function applyGroupPick(groupIds: number[]) {
    const keys = groupPickKeys();
    if (!keys.length || !groupIds.length) return;
    try {
      if (groupPickMode() === 'move') {
        await TvDao.replaceKeepItemGroups(keys, groupIds);
      } else {
        await TvDao.addKeepItemsToGroups(keys, groupIds);
      }
      refresh();
      void showAppToast({
        title: groupPickMode() === 'move' ? '已移入分组' : '已加入分组',
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

  async function confirmRemoveGroup() {
    const keys = selectedKeys();
    if (!keys.length) return;
    try {
      await TvDao.removeKeepItemsFromUserGroups(keys);
      setRemoveGroupConfirmOpen(false);
      refresh();
      void showAppToast({
        title: '已移除分组',
        description: `${keys.length} 部仍保留在收藏`,
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

  async function confirmDeleteSelected() {
    const keys = selectedKeys();
    if (!keys.length) return;
    try {
      await TvDao.removeKeepItems(keys);
      clearSel();
      setDeleteConfirmOpen(false);
      refresh();
      void showAppToast({
        title: '已取消收藏',
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
                onSelect={() => openGroupPick('add')}
              >
                加入分组
              </AppDropdownMenuItem>
              <AppDropdownMenuItem
                disabled={selectedCount() === 0}
                onSelect={() => openGroupPick('move')}
              >
                移入分组
              </AppDropdownMenuItem>
              <AppDropdownMenuItem
                disabled={selectedCount() === 0}
                onSelect={() => setRemoveGroupConfirmOpen(true)}
              >
                移除分组
              </AppDropdownMenuItem>
              <AppDropdownMenuItem
                disabled={selectedCount() === 0}
                onSelect={() => setExportOpen(true)}
              >
                导出所选(作为片单)
              </AppDropdownMenuItem>
              <AppDropdownMenuItem
                disabled={selectedCount() === 0}
                class="text-destructive focus:text-destructive"
                onSelect={() => setDeleteConfirmOpen(true)}
              >
                取消收藏
              </AppDropdownMenuItem>
            </AppDropdownMenuContent>
          </AppDropdownMenu>
        </div>

        <div class="hidden min-[448px]:flex xl:hidden! items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={selectedCount() === 0}
            onClick={() => openGroupPick('move')}
          >
            移入分组
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
                取消收藏
              </AppDropdownMenuItem>
              <AppDropdownMenuItem
                disabled={selectedCount() === 0}
                onSelect={() => openGroupPick('add')}
              >
                加入分组
              </AppDropdownMenuItem>
              <AppDropdownMenuItem
                disabled={selectedCount() === 0}
                onSelect={() => setRemoveGroupConfirmOpen(true)}
              >
                移除分组
              </AppDropdownMenuItem>
              <AppDropdownMenuItem
                disabled={selectedCount() === 0}
                onSelect={() => setExportOpen(true)}
              >
                导出所选(作为片单)
              </AppDropdownMenuItem>
            </AppDropdownMenuContent>
          </AppDropdownMenu>
        </div>

        <div class="hidden xl:flex! flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={selectedCount() === 0}
            onClick={() => openGroupPick('add')}
          >
            加入分组
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={selectedCount() === 0}
            onClick={() => openGroupPick('move')}
          >
            移入分组
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={selectedCount() === 0}
            onClick={() => setRemoveGroupConfirmOpen(true)}
          >
            移除分组
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={selectedCount() === 0}
            onClick={() => setExportOpen(true)}
          >
            导出所选(作为片单)
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={selectedCount() === 0}
            onClick={() => setDeleteConfirmOpen(true)}
          >
            取消收藏
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <TvHubPageShell
      section="keep"
      title="收藏管理"
      description={
        list.loading
          ? '加载中…'
          : selectedCount()
            ? `已选 ${selectedCount()} / ${list()?.length ?? 0}`
            : `${list()?.length ?? 0} 部收藏`
      }
      leading={
        <Button
          variant="ghost"
          size="icon"
          class="h-9 w-9 shrink-0"
          onClick={() => props.onClose()}
          aria-label="返回"
        >
          <ChevronLeftIcon class="h-4 w-4" />
        </Button>
      }
      footer={batchBar()}
    >
      <div class={cn('flex min-h-0 flex-1 flex-col', tvHubPageContentInsetClass)}>
        <div class="min-h-0 flex-1 overflow-y-auto py-2">
          <Show
            when={!list.loading && (list()?.length ?? 0) > 0}
            fallback={
              <div class="rounded-xl border border-border/50 bg-card py-12 text-center text-sm text-muted-foreground">
                {list.loading ? '加载中…' : '暂无收藏'}
              </div>
            }
          >
            <ul class="space-y-1">
              <For each={list() ?? []}>
                {(row) => {
                  const meta = () => buildTvKeepDisplayMeta(row);
                  return (
                    <li class="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-accent/40">
                      <Checkbox
                        checked={!!selected()[row.key]}
                        onChange={() => toggle(row.key)}
                        aria-label={`选择 ${row.vodName || '未命名'}`}
                      />
                      <TvListCover coverUrl={row.vodPic} />
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-medium">{row.vodName || '未命名'}</p>
                        <Show when={meta().sourceLine}>
                          <p class="truncate text-xs text-muted-foreground">{meta().sourceLine}</p>
                        </Show>
                        <Show when={meta().playLine}>
                          <p class="truncate text-xs text-muted-foreground">{meta().playLine}</p>
                        </Show>
                      </div>
                      <div class="flex shrink-0 items-center gap-0.5">
                        <AppTooltip>
                          <AppTooltipTrigger
                            as={Button}
                            type="button"
                            variant="ghost"
                            size="icon"
                            class="h-8 w-8 shrink-0"
                            aria-label={`编辑 ${row.vodName || '未命名'}`}
                            onClick={() => setEditTarget(row)}
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
                            aria-label={`分组 ${row.vodName || '未命名'}`}
                            onClick={() => openGroupPick('move', [row.key])}
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

      <TvKeepGroupPickDialog
        open={groupPickOpen()}
        onOpenChange={setGroupPickOpen}
        mode={groupPickMode()}
        title={groupPickMode() === 'move' ? '移入分组' : '加入分组'}
        description={
          groupPickMode() === 'move'
            ? '将所选条目移入下列分组（替换原有自定义分组）'
            : '将所选条目加入下列分组（保留原有分组）'
        }
        groups={groups() ?? []}
        onConfirm={(ids) => void applyGroupPick(ids)}
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
          refresh();
          void showAppToast({
            title: '已创建分组',
            description: groupName,
            variant: 'success',
          });
          setGroupPickOpen(true);
        }}
      />

      <TvKeepExportDialog
        open={exportOpen()}
        onOpenChange={setExportOpen}
        rows={selectedRows}
        title="导出所选(作为片单)"
        description="导出当前勾选的收藏为片单文件"
      />

      <TvTrackEditDialog
        open={!!editTarget()}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        title="编辑收藏"
        initial={
          editTarget()
            ? { vodName: editTarget()!.vodName, vodPic: editTarget()!.vodPic }
            : null
        }
        onSubmit={async (fields) => {
          const cur = editTarget();
          if (!cur) return;
          try {
            await TvDao.updateKeepDisplay(cur.key, fields);
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

      <AppDialog open={removeGroupConfirmOpen()} onOpenChange={setRemoveGroupConfirmOpen}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>移除分组</AppDialogTitle>
            <AppDialogDescription>
              将已选的 {selectedCount()} 部从全部自定义分组中移除，仍保留在收藏中。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter>
            <Button variant="outline" type="button" onClick={() => setRemoveGroupConfirmOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => void confirmRemoveGroup()}>
              确定
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      <AppDialog open={deleteConfirmOpen()} onOpenChange={setDeleteConfirmOpen}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>取消收藏</AppDialogTitle>
            <AppDialogDescription>
              确定取消已选的 {selectedCount()} 部收藏吗？此操作不可撤销。
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
              取消收藏
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </TvHubPageShell>
  );
}
