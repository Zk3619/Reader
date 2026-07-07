/**
 * WebDAV 云端备份恢复：选择远程 backup*.zip
 */

import { createSignal, For, createEffect, Show } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
  AppDialogScrollBody,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { listRemoteBackups, type RemoteBackupEntry } from '@/lib/backup/webdav-backup';
import { appDialogScrollBodySpaceY4 } from '@/lib/ui/viewport-classes';

export interface WebDavRestoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (entry: RemoteBackupEntry) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTime(ts: number): string {
  if (!ts) return '未知时间';
  return new Date(ts).toLocaleString();
}

export function WebDavRestoreDialog(props: WebDavRestoreDialogProps) {
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [entries, setEntries] = createSignal<RemoteBackupEntry[]>([]);
  const [selected, setSelected] = createSignal<RemoteBackupEntry | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const list = await listRemoteBackups();
      setEntries(list);
      setSelected(list[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEntries([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }

  createEffect(() => {
    if (props.open) void refresh();
  });

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class="max-w-lg">
        <AppDialogHeader>
          <AppDialogTitle>从 WebDAV 恢复</AppDialogTitle>
          <AppDialogDescription>
            选择云端 backup*.zip 或 reader-backup*.zip 备份文件
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogScrollBody class={appDialogScrollBodySpaceY4}>
          <div class="flex justify-end">
            <Button variant="ghost" size="sm" disabled={loading()} onClick={() => void refresh()}>
              刷新列表
            </Button>
          </div>
          <Show when={loading()}>
            <p class="text-sm text-muted-foreground">正在加载远程备份列表…</p>
          </Show>
          <Show when={error()}>
            <p class="text-sm text-destructive">{error()}</p>
          </Show>
          <Show when={!loading() && !error() && entries().length === 0}>
            <p class="text-sm text-muted-foreground">云端暂无备份文件</p>
          </Show>
          <Show when={entries().length > 0}>
            <div class="max-h-72 space-y-2 overflow-y-auto">
              <For each={entries()}>
                {(entry) => (
                  <button
                    type="button"
                    class={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      selected()?.name === entry.name
                        ? 'border-primary bg-primary/10'
                        : 'border-border/50 hover:bg-muted/50'
                    }`}
                    onClick={() => setSelected(entry)}
                  >
                    <div class="font-medium break-all">{entry.name}</div>
                    <div class="text-xs text-muted-foreground">
                      {formatBytes(entry.size)} · {formatTime(entry.lastModify)}
                    </div>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </AppDialogScrollBody>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={!selected()}
            onClick={() => {
              const entry = selected();
              if (!entry) return;
              props.onSelect(entry);
              props.onOpenChange(false);
            }}
          >
            恢复所选备份
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
