/**
 * 影视收藏管理：多选取消收藏 / 移入分组
 */

import { For, Show, createMemo, createResource, createSignal } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AppSelect,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { ViewerAppSelectContent } from '@/components/media/viewer/viewer-app-overlay';
import { ChevronLeftIcon, TrashIcon } from '@/components/shared/icons';
import { TvHubPageShell } from '@/components/media/viewer/video/tv/hub/TvHubPageShell';
import { showAppToast } from '@/components/shared/AppToasts';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import { buildTvKeepDisplayMeta } from '@/lib/media/tv/tv-keep-meta';
import { tvHubPageContentInsetClass } from '@/lib/media/tv/tv-hub-section-meta';
import { cn } from '@/lib/utils';

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
  const [targetGroup, setTargetGroup] = createSignal<number | null>(null);

  const refresh = () => {
    setTick((n) => n + 1);
    props.onChanged?.();
  };

  const selectedKeys = createMemo(() => Object.keys(selected()).filter((k) => selected()[k]));
  const selectedCount = () => selectedKeys().length;

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

  const removeSelected = () => {
    const keys = selectedKeys();
    if (!keys.length) return;
    void TvDao.removeKeepItems(keys).then(() => {
      clearSel();
      refresh();
      void showAppToast({
        title: '已取消收藏',
        description: `${keys.length} 部`,
        variant: 'success',
      });
    });
  };

  const moveSelected = () => {
    const keys = selectedKeys();
    const gid = targetGroup();
    if (!keys.length || gid == null) return;
    void TvDao.moveKeepItemsToGroup(keys, gid).then(() => {
      clearSel();
      refresh();
      const name = groups()?.find((g) => g.groupId === gid)?.groupName ?? '分组';
      void showAppToast({
        title: '已移入分组',
        description: `${keys.length} 部 → ${name}`,
        variant: 'success',
      });
    });
  };

  const groupOptions = () => (groups() ?? []).map((g) => g.groupId);

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
      toolbar={
        <>
          <Button variant="ghost" size="sm" class="h-9 shrink-0" onClick={selectAll}>
            全选
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="h-9 shrink-0"
            disabled={!selectedCount()}
            onClick={clearSel}
          >
            清除
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-9 w-9 shrink-0 text-destructive"
            disabled={!selectedCount()}
            onClick={removeSelected}
            aria-label="取消收藏"
          >
            <TrashIcon class="h-4 w-4" />
          </Button>
        </>
      }
    >
      <div class={cn('flex min-h-0 flex-1 flex-col', tvHubPageContentInsetClass)}>
        <Show when={(groups() ?? []).length > 0}>
          <div class="flex flex-wrap items-center gap-2 border-b border-border/40 px-1 py-2">
            <AppSelect
              value={targetGroup()}
              onChange={(value) => {
                if (value == null) return;
                setTargetGroup(value as number);
              }}
              options={groupOptions()}
              itemComponent={(itemProps) => {
                const id = itemProps.item.rawValue as number;
                const name = groups()?.find((g) => g.groupId === id)?.groupName ?? String(id);
                return <AppSelectItem item={itemProps.item}>{name}</AppSelectItem>;
              }}
            >
              <AppSelectTrigger layout="compact" class="h-9 w-40" aria-label="目标分组">
                <AppSelectValue>
                  {(sel) => {
                    const raw = sel.selectedOption();
                    if (raw == null) return '移入分组';
                    const id = Number(raw);
                    return groups()?.find((g) => g.groupId === id)?.groupName ?? String(id);
                  }}
                </AppSelectValue>
                <AppSelectIcon />
              </AppSelectTrigger>
              <ViewerAppSelectContent>
                <AppSelectListbox />
              </ViewerAppSelectContent>
            </AppSelect>
            <Button
              type="button"
              size="sm"
              class="h-9"
              disabled={!selectedCount() || targetGroup() == null}
              onClick={moveSelected}
            >
              移入
            </Button>
          </div>
        </Show>

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
                    <li>
                      <label class="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/40">
                        <Checkbox
                          checked={!!selected()[row.key]}
                          onChange={() => toggle(row.key)}
                          aria-label={`选择 ${row.vodName || '未命名'}`}
                        />
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-sm font-medium">{row.vodName || '未命名'}</p>
                          <p class="truncate text-xs text-muted-foreground">
                            {meta().subtitle ||
                              (row.kind === 'live'
                                ? '直播'
                                : row.kind === 'local'
                                  ? '本地'
                                  : '点播')}
                          </p>
                        </div>
                      </label>
                    </li>
                  );
                }}
              </For>
            </ul>
          </Show>
        </div>
      </div>
    </TvHubPageShell>
  );
}
