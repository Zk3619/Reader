/**
 * 列表更新管理（对齐 lx ListUpdateModal）
 */

import { For, Show, createResource, createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AppDialogScrollBody } from '@/components/shared/AppDialog';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/viewer/viewer-app-overlay';
import { getMusicGroupByListId } from '@/lib/database/media-groups';
import {
  listSourceBindings,
  setBindingAutoUpdate,
  syncSourceList,
  type SourceListBinding,
} from '@/lib/media/audio/list/sync-source-list';
import { showAppToast } from '@/components/shared/AppToasts';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import { dialogScrollFrameFlex } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';

export interface MusicListUpdateManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}

type Row = SourceListBinding & { name: string };

async function loadRows(): Promise<Row[]> {
  const bindings = listSourceBindings();
  const rows: Row[] = [];
  for (const b of bindings) {
    const group = await getMusicGroupByListId(b.playlistId);
    rows.push({ ...b, name: group?.groupName ?? b.playlistId });
  }
  return rows;
}

function formatTime(ts?: number): string {
  if (!ts) return '尚未更新';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}

export const MusicListUpdateManageDialog: Component<MusicListUpdateManageDialogProps> = (
  props,
) => {
  const [rows, { refetch }] = createResource(
    () => (props.open ? Date.now() : 0),
    (key) => (key ? loadRows() : Promise.resolve([])),
  );
  const [syncingId, setSyncingId] = createSignal<string | null>(null);

  const handleSync = async (playlistId: string) => {
    setSyncingId(playlistId);
    try {
      await syncSourceList(playlistId);
      showAppToast({ title: '列表已更新', variant: 'success' });
      void refetch();
      props.onUpdated?.();
    } catch (e) {
      showAppToast({ title: '更新失败', description: toUserFacingMusicError(e), variant: 'destructive' });
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <ViewerAppDialogContent layout="app" class="w-[calc(100dvw-2rem)] max-w-md">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>列表更新管理</ViewerAppDialogTitle>
          <ViewerAppDialogDescription>
            管理已绑定在线源的列表，可手动更新或开启自动更新。
          </ViewerAppDialogDescription>
        </ViewerAppDialogHeader>
        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class="max-h-[min(50dvh,22rem)] px-6">
          <Show
            when={(rows() ?? []).length > 0}
            fallback={
              <p class="py-8 text-center text-sm text-muted-foreground">暂无绑定源的列表</p>
            }
          >
            <ul class="divide-y">
              <For each={rows() ?? []}>
                {(row) => (
                  <li
                    class={cn(
                      'flex items-center gap-3 py-3',
                      syncingId() === row.playlistId && 'opacity-60',
                    )}
                  >
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium">
                        {row.name}{' '}
                        <span class="text-xs font-normal text-muted-foreground">
                          {row.source}
                        </span>
                      </p>
                      <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <label class="flex cursor-pointer items-center gap-1.5">
                          <Checkbox
                            checked={row.isAutoUpdate !== false}
                            onChange={(checked) => {
                              setBindingAutoUpdate(row.playlistId, checked === true);
                              void refetch();
                            }}
                          />
                          自动更新
                        </label>
                        <span>{formatTime(row.lastSyncAt)}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={syncingId() === row.playlistId}
                      onClick={() => void handleSync(row.playlistId)}
                    >
                      更新
                    </Button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </AppDialogScrollBody>
        <ViewerAppDialogFooter>
          <p class="mr-auto text-xs text-muted-foreground">
            仅显示已绑定歌单/排行榜源的列表
          </p>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            关闭
          </Button>
        </ViewerAppDialogFooter>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
};
