/**
 * 影视收藏分组管理（列表内覆盖页）
 */

import { For, Show, createResource, createSignal } from 'solid-js';
import { Button } from '@/components/ui/button';
import { ChevronLeftIcon, FolderPlusIcon, PencilIcon, TrashIcon } from '@/components/shared/icons';
import { TvHubPageShell } from '@/components/media/viewer/video/tv/hub/TvHubPageShell';
import { TvKeepGroupFormDialog } from '@/components/media/viewer/video/tv/hub/TvKeepGroupFormDialog';
import { showAppToast } from '@/components/shared/AppToasts';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import type { TvVideoGroupRow } from '@/lib/media/tv/types';
import { tvHubPageContentInsetClass } from '@/lib/media/tv/tv-hub-section-meta';
import { MediaGroupId } from '@/types/book-group';
import { cn } from '@/lib/utils';
import { getTvKeepUi, setTvKeepActiveGroupId } from '@/stores/tv-hub/tv-keep-ui';

export interface TvKeepGroupManagePaneProps {
  onClose: () => void;
  onChanged?: () => void;
}

export function TvKeepGroupManagePane(props: TvKeepGroupManagePaneProps) {
  const [tick, setTick] = createSignal(0);
  const [groups] = createResource(
    () => tick(),
    () => TvDao.listVideoGroups({ userOnly: true }),
  );
  const [formOpen, setFormOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<TvVideoGroupRow | null>(null);

  const refresh = () => {
    setTick((n) => n + 1);
    props.onChanged?.();
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (g: TvVideoGroupRow) => {
    setEditing(g);
    setFormOpen(true);
  };

  const remove = (g: TvVideoGroupRow) => {
    void TvDao.deleteVideoGroup(g.groupId).then(() => {
      if (getTvKeepUi().activeGroupId === g.groupId) {
        setTvKeepActiveGroupId(MediaGroupId.VideoAll);
      }
      refresh();
      void showAppToast({ title: '已删除分组', description: g.groupName, variant: 'success' });
    });
  };

  return (
    <>
      <TvHubPageShell
        section="keep"
        title="分组管理"
        description={groups.loading ? '加载中…' : `${groups()?.length ?? 0} 个自定义分组`}
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
          <Button
            variant="ghost"
            size="icon"
            class="h-9 w-9 shrink-0"
            onClick={openCreate}
            aria-label="新建分组"
          >
            <FolderPlusIcon class="h-4 w-4" />
          </Button>
        }
      >
        <div class={cn('min-h-0 flex-1 overflow-y-auto py-3', tvHubPageContentInsetClass)}>
          <Show
            when={(groups() ?? []).length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card py-12">
                <p class="mb-3 text-sm text-muted-foreground">还没有自定义分组</p>
                <Button type="button" onClick={openCreate}>
                  新建分组
                </Button>
              </div>
            }
          >
            <ul class="space-y-2">
              <For each={groups() ?? []}>
                {(g) => (
                  <li class="flex items-center gap-2 rounded-xl border border-border/50 bg-card px-3 py-2">
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium text-foreground">{g.groupName}</p>
                      <p class="text-xs text-muted-foreground">ID {g.groupId}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8 shrink-0"
                      onClick={() => openEdit(g)}
                      aria-label="编辑"
                    >
                      <PencilIcon class="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8 shrink-0 text-destructive"
                      onClick={() => remove(g)}
                      aria-label="删除"
                    >
                      <TrashIcon class="h-4 w-4" />
                    </Button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </TvHubPageShell>

      <TvKeepGroupFormDialog
        open={formOpen()}
        onOpenChange={setFormOpen}
        group={editing()}
        onSubmit={async ({ groupName }) => {
          const cur = editing();
          if (cur) {
            await TvDao.updateVideoGroup({ groupId: cur.groupId, groupName });
            void showAppToast({ title: '已更新分组', variant: 'success' });
          } else {
            await TvDao.insertVideoGroup({ groupName });
            void showAppToast({ title: '已创建分组', description: groupName, variant: 'success' });
          }
          refresh();
        }}
      />
    </>
  );
}
