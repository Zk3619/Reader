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
  FolderPlusIcon,
  MoreIcon,
  TrashIcon,
} from '@/components/shared/icons';
import { TvListCover } from '@/components/media/viewer/video/tv/cards/TvListCover';
import { TvLibraryItemActions } from '@/components/media/viewer/video/tv/cards/TvLibraryItemActions';
import { TvLibraryItemContextMenu } from '@/components/media/viewer/video/tv/cards/TvLibraryItemContextMenu';
import { TvHubPageShell } from '@/components/media/viewer/video/tv/hub/TvHubPageShell';
import { TvKeepExportDialog } from '@/components/media/viewer/video/tv/hub/TvKeepExportDialog';
import { TvKeepGroupFormDialog } from '@/components/media/viewer/video/tv/hub/TvKeepGroupFormDialog';
import {
  TvKeepGroupPickDialog,
  type TvKeepGroupPickMode,
} from '@/components/media/viewer/video/tv/hub/TvKeepGroupPickDialog';
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
import {
  beginTvPlaySession,
  applyTvPlaySessionUrl,
  enterTvPlayLoadingShell,
  failTvPlaySession,
  getTvDetailState,
  loadTvDetail,
  playCurrentEpisode,
  setTvPlaySessionLoading,
} from '@/stores/tv-hub/detail';
import { BANGUMI_SITE_KEY } from '@/lib/media/tv/types';
import {
  bangumiKeepKey,
  decodeBangumiFlag,
  purgeBangumiHistoryGhosts,
  removeBangumiKeep,
  upsertBangumiKeep,
  upsertBangumiPlayHistory,
} from '@/lib/media/video/bangumi/dao-bridge';
import type { TvHistoryRow } from '@/lib/media/tv/types';

function isBangumiHistoryItem(item: TvHistoryRow): boolean {
  return (
    item.siteKey === BANGUMI_SITE_KEY ||
    item.key.startsWith('bangumi$') ||
    /^bangumi:\d+$/i.test(item.vodId) ||
    item.kind === 'bangumi'
  );
}

function bangumiIdFromHistory(item: TvHistoryRow): number {
  const fromVod = Number(String(item.vodId).replace(/^bangumi:/i, '')) || 0;
  return Number(item.vodId) || fromVod || item.cid || 0;
}

/** 历史行对应的收藏 key（番剧 / 直播与历史 id 可能不同） */
function keepKeyFromHistory(item: TvHistoryRow): string {
  if (isBangumiHistoryItem(item)) {
    const id = bangumiIdFromHistory(item);
    return id ? bangumiKeepKey(id) : item.key;
  }
  if (item.kind === 'live') {
    return `live:${item.siteKey}:${item.vodName || item.vodId}`;
  }
  return item.key;
}

/** 查看详情：点播进详情页；番剧进番剧详情（返回落点=历史） */
async function openHistoryDetail(item: TvHistoryRow) {
  if (isBangumiHistoryItem(item)) {
    const id = bangumiIdFromHistory(item);
    if (!id) return;
    const meta = decodeBangumiFlag(item.flag);
    const { openBangumiById } = await import('@/stores/tv-hub/bangumi-ui');
    const { setTvSection } = await import('@/stores/tv-hub/section');
    setTvSection('bangumi');
    await openBangumiById(id, {
      resumeEpisodeUrl: meta?.episodeUrl,
      resumeRuleId: meta?.ruleId,
      from: 'history',
    });
    return;
  }
  if (item.kind === 'live') {
    const { setTvSection } = await import('@/stores/tv-hub/section');
    setTvSection('live');
    return;
  }
  if (item.kind === 'local') {
    const { playLocalKeepMedia } = await import('@/lib/media/tv/play-local-keep');
    await playLocalKeepMedia({
      pathOrUrl: item.vodId,
      title: item.vodName,
      startSec: item.position > 0 ? item.position : undefined,
    });
    return;
  }
  await loadTvDetail(item.siteKey, item.vodId);
}

/** 立即播放：后台拉详情后直达播放页并续播（不经详情页） */
async function playHistoryItem(item: TvHistoryRow) {
  if (isBangumiHistoryItem(item)) {
    await playBangumiHistoryItem(item);
    return;
  }
  if (item.kind === 'live') {
    const { setTvSection } = await import('@/stores/tv-hub/section');
    setTvSection('live');
    return;
  }
  if (item.kind === 'local') {
    const { playLocalKeepMedia } = await import('@/lib/media/tv/play-local-keep');
    await playLocalKeepMedia({
      pathOrUrl: item.vodId,
      title: item.vodName,
      startSec: item.position > 0 ? item.position : undefined,
    });
    return;
  }
  enterTvPlayLoadingShell({
    siteKey: item.siteKey,
    vod: {
      vod_id: item.vodId,
      vod_name: item.vodName || '播放',
      vod_pic: item.vodPic || '',
      siteKey: item.siteKey,
    },
  });
  await loadTvDetail(item.siteKey, item.vodId, {
    navigate: false,
    retainPlayShell: true,
  });
  const detail = getTvDetailState();
  if (detail.episodeIndex < 0 || !detail.flags[detail.flagIndex]?.episodes.length) {
    const { openTvDetail } = await import('@/stores/tv-hub/section');
    openTvDetail(item.siteKey, item.vodId);
    void showAppToast({
      title: '无法立即播放',
      description: '未找到历史集数，已打开详情页',
      variant: 'warning',
    });
    return;
  }
  await playCurrentEpisode();
}

async function playBangumiHistoryItem(item: TvHistoryRow) {
  const id = bangumiIdFromHistory(item);
  const meta = decodeBangumiFlag(item.flag);
  const episodeUrl = (meta?.episodeUrl || '').trim();
  const ruleId = (meta?.ruleId || '').trim();
  if (!id || !episodeUrl || !ruleId) {
    await openHistoryDetail(item);
    void showAppToast({
      title: '无法立即播放',
      description: '缺少番剧集信息，已打开详情',
      variant: 'warning',
    });
    return;
  }

  const { loadBangumiRules } = await import('@/lib/media/video/bangumi/rules');
  const { resolvePlayUrl } = await import('@/lib/media/video/bangumi/engine');
  const { ensureBangumiDaoMigrated } = await import(
    '@/lib/media/video/bangumi/dao-bridge'
  );
  await ensureBangumiDaoMigrated();

  const rule = loadBangumiRules().find((r) => r.id === ruleId);
  if (!rule) {
    await openHistoryDetail(item);
    void showAppToast({
      title: '无法立即播放',
      description: '规则不存在或未启用，已打开详情',
      variant: 'warning',
    });
    return;
  }

  let title = item.vodName || '番剧';
  let cover = item.vodPic || '';
  const episodeName = item.episode || '播放';
  const ruleName = rule.name || '番剧源';
  const startSec = item.position > 0 ? item.position : 0;

  beginTvPlaySession({
    vod: {
      vod_id: `bangumi:${id}`,
      vod_name: title,
      vod_pic: cover,
      siteKey: BANGUMI_SITE_KEY,
    },
    flags: [{ flag: ruleName, episodes: [{ name: episodeName, url: episodeUrl }] }],
    flagIndex: 0,
    episodeIndex: 0,
    resolver: async () => {
      setTvPlaySessionLoading();
      try {
        const resolved = await resolvePlayUrl(rule, episodeUrl);
        applyTvPlaySessionUrl({
          url: resolved.url,
          headers: resolved.headers,
          startSec,
        });
        await upsertBangumiPlayHistory({
          bgmId: id,
          title,
          cover,
          episodeName,
          ruleId,
          detailUrl: meta?.detailUrl,
          episodeUrl,
          positionSec: startSec,
          durationSec: item.duration || 0,
        });
      } catch (e) {
        failTvPlaySession(e instanceof Error ? e.message : String(e));
      }
    },
  });
  await playCurrentEpisode();
}

const BATCH_MENU_TRIGGER_CLASS = 'gap-1.5 group/trigger';
const BATCH_MENU_CHEVRON_CLASS =
  'h-4 w-4 shrink-0 opacity-50 transition-transform duration-200 group-data-expanded/trigger:rotate-180';

export function TvHistoryPane() {
  const [tick, setTick] = createSignal(0);
  const [list] = createResource(
    () => tick(),
    async () => {
      await purgeBangumiHistoryGhosts(200).catch(() => 0);
      return TvDao.listHistory(80);
    },
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
  const [groupPickOpen, setGroupPickOpen] = createSignal(false);
  const [groupPickMode, setGroupPickMode] = createSignal<TvKeepGroupPickMode>('move');
  const [groupPickKeys, setGroupPickKeys] = createSignal<string[]>([]);
  const [createGroupOpen, setCreateGroupOpen] = createSignal(false);
  const [groupsTick, setGroupsTick] = createSignal(0);
  const [keepTick, setKeepTick] = createSignal(0);
  const [groups] = createResource(
    () => groupsTick(),
    () => TvDao.listVideoGroups({ userOnly: true }),
  );
  const [keepKeySet] = createResource(
    () => keepTick(),
    async () => {
      const rows = await TvDao.listKeep();
      return new Set(rows.map((r) => r.key));
    },
  );

  const refresh = () => setTick((n) => n + 1);
  const refreshKeep = () => setKeepTick((n) => n + 1);

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

  function removeHistoryItem(row: TvHistoryRow) {
    void TvDao.removeHistory(row.key).then(() => {
      refresh();
      void showAppToast({
        title: '已删除',
        description: row.vodName,
        variant: 'success',
      });
    });
  }

  function isHistoryKept(row: TvHistoryRow): boolean {
    return !!keepKeySet()?.has(keepKeyFromHistory(row));
  }

  async function toggleHistoryKeep(row: TvHistoryRow) {
    try {
      if (isBangumiHistoryItem(row)) {
        const id = bangumiIdFromHistory(row);
        if (!id) {
          void showAppToast({ title: '无效番剧条目', variant: 'warning' });
          return;
        }
        if (isHistoryKept(row)) {
          await removeBangumiKeep(id);
          refreshKeep();
          void showAppToast({
            title: '已取消收藏',
            description: row.vodName,
            variant: 'success',
          });
        } else {
          await upsertBangumiKeep({
            bgmId: id,
            title: row.vodName || '番剧',
            cover: row.vodPic,
          });
          refreshKeep();
          void showAppToast({
            title: '已收藏',
            description: row.vodName,
            variant: 'success',
          });
        }
        return;
      }

      const key = keepKeyFromHistory(row);
      if (isHistoryKept(row)) {
        await TvDao.removeKeep(key);
        refreshKeep();
        void showAppToast({
          title: '已取消收藏',
          description: row.vodName,
          variant: 'success',
        });
        return;
      }

      await TvDao.upsertKeep({
        key,
        siteKey: row.siteKey,
        vodId: row.vodId,
        vodName: row.vodName,
        vodPic: row.vodPic,
        kind: row.kind === 'live' ? 'live' : row.kind === 'local' ? 'local' : 'vod',
        cid: row.cid,
        createdAt: Date.now(),
        flag: row.flag,
        episode: row.episode,
        position: row.position,
        duration: row.duration,
        updatedAt: row.updatedAt,
      });
      refreshKeep();
      void showAppToast({
        title: '已收藏',
        description: row.vodName,
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
      refreshKeep();
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
                  const detail = () => void openHistoryDetail(item);
                  const play = () => void playHistoryItem(item);
                  const group = () => openRowGroupPick(item);
                  const remove = () => removeHistoryItem(item);
                  return (
                    <li>
                      <TvLibraryItemContextMenu
                        onDetail={detail}
                        onPlay={play}
                        onGroup={group}
                        onRemove={remove}
                      >
                        <div class="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-accent/40">
                          <Checkbox
                            checked={!!selected()[item.key]}
                            onChange={() => toggle(item.key)}
                            aria-label={`选择 ${item.vodName || '未命名'}`}
                          />
                          <button
                            type="button"
                            class="flex min-w-0 flex-1 items-center gap-3 text-left"
                            onClick={detail}
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
                          <TvLibraryItemActions
                            itemName={item.vodName}
                            kept={isHistoryKept(item)}
                            onToggleKeep={() => void toggleHistoryKeep(item)}
                            onDetail={detail}
                            onPlay={play}
                            onGroup={group}
                            onRemove={remove}
                          />
                        </div>
                      </TvLibraryItemContextMenu>
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
