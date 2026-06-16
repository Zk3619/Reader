/**
 * 设置页：数据本地备份与恢复（对齐 Legado 备份与恢复，不含 WebDav）
 */

import { createSignal, For, onMount, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  exportReaderBackup,
  getBackupOverview,
  restoreReaderBackupFromFile,
  type BackupItemInfo,
  type BackupOverview,
} from '@/lib/database/reader-backup';
import { getDatabaseLocation, checkDatabaseExists, openDatabaseDirectory } from '@/lib/database/db-location';
import { isTauri } from '@/lib/platform/detect';
import { showAppToast } from '@/components/shared/AppToasts';
import { DownloadIcon, UploadIcon } from '@/components/shared/icons';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function DataBackupSetting() {
  const [overview, setOverview] = createSignal<BackupOverview | null>(null);
  const [dbLocation, setDbLocation] = createSignal('');
  const [dbExists, setDbExists] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [exporting, setExporting] = createSignal(false);
  const [restoring, setRestoring] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [preview, location, exists] = await Promise.all([
        getBackupOverview(),
        getDatabaseLocation(),
        checkDatabaseExists(),
      ]);
      setOverview(preview);
      setDbLocation(location);
      setDbExists(exists);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  onMount(() => {
    void refresh();
  });

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const result = await exportReaderBackup();
      showAppToast({
        title: '备份已导出',
        description: `${result.filename}（${formatBytes(result.size)}）`,
        variant: 'default',
      });
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('取消')) {
        setError(msg);
        showAppToast({ title: '备份失败', description: msg, variant: 'destructive' });
      }
    } finally {
      setExporting(false);
    }
  }

  async function handleRestore() {
    const ok = confirm(
      '恢复备份将替换当前数据（数据库全量恢复时不可撤销）。\n\n支持 Reader ZIP 备份、Legado ZIP 备份或 .db 文件。\n\n是否继续？',
    );
    if (!ok) return;

    setRestoring(true);
    setError(null);
    try {
      const { summary, reloadRecommended } = await restoreReaderBackupFromFile();
      showAppToast({
        title: '备份已恢复',
        description: summary.join('；'),
        variant: 'default',
      });
      if (reloadRecommended) {
        setTimeout(() => {
          if (confirm('数据库已全量恢复，是否刷新页面以应用更改？')) {
            window.location.reload();
          }
        }, 600);
      } else {
        window.dispatchEvent(new CustomEvent('sources-refresh'));
        window.dispatchEvent(new CustomEvent('bookshelf-refresh'));
        window.dispatchEvent(new CustomEvent('replace-rules-refresh'));
        await refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('取消')) {
        setError(msg);
        showAppToast({ title: '恢复失败', description: msg, variant: 'destructive' });
      }
    } finally {
      setRestoring(false);
    }
  }

  const itemRows = () => overview()?.items ?? [];

  return (
    <div class="space-y-4">
      <div class="rounded-lg border border-border/50 bg-muted/50 p-3 text-sm">
        <div class="mb-2 font-semibold">数据库文件位置</div>
        <div class="mb-2 break-all font-mono text-xs text-muted-foreground">
          {dbLocation() || (loading() ? '加载中…' : '未知')}
        </div>
        <Show when={isTauri() && dbLocation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              try {
                await openDatabaseDirectory();
              } catch {
                setError('无法打开数据库目录');
              }
            }}
            class="h-7 text-xs"
          >
            打开所在文件夹
          </Button>
        </Show>
        <Show when={dbExists()}>
          <div class="mt-2 text-xs text-green-600 dark:text-green-400">数据库文件已存在</div>
        </Show>
      </div>

      <div class="rounded-lg border border-border/50 bg-muted/20 p-3">
        <div class="mb-3 flex items-center justify-between gap-2">
          <div>
            <h4 class="text-sm font-semibold">备份内容预览</h4>
            <p class="text-xs text-muted-foreground">
              ZIP 包含完整数据库及 Legado 兼容 JSON，便于跨设备迁移
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading()}>
            刷新
          </Button>
        </div>

        <Show
          when={!loading()}
          fallback={<p class="text-sm text-muted-foreground">正在统计备份内容…</p>}
        >
          <Show
            when={itemRows().length > 0}
            fallback={<p class="text-sm text-muted-foreground">暂无可备份数据</p>}
          >
            <div class="space-y-2">
              <For each={itemRows()}>
                {(item: BackupItemInfo) => (
                  <div class="flex items-center justify-between gap-3 rounded-md border border-border/40 bg-card/60 px-3 py-2 text-sm">
                    <div class="min-w-0">
                      <div class="font-medium">{item.displayName}</div>
                      <div class="truncate text-xs text-muted-foreground">{item.description}</div>
                    </div>
                    <div class="shrink-0 text-right text-xs text-muted-foreground">
                      <div>{item.count > 1 || item.fileName.endsWith('.json') ? `${item.count} 项` : '1 项'}</div>
                      <div>{formatBytes(item.size)}</div>
                    </div>
                  </div>
                )}
              </For>
              <Show when={overview()}>
                <p class="pt-1 text-xs text-muted-foreground">
                  预计备份大小约 {formatBytes(overview()!.totalSize)}，文件名 {overview()!.fileName}
                </p>
              </Show>
            </div>
          </Show>
        </Show>
      </div>

      <div class="grid gap-2 sm:grid-cols-2">
        <Button
          onClick={() => void handleExport()}
          disabled={exporting() || restoring() || loading()}
          variant="outline"
          class="gap-2"
        >
          <DownloadIcon class="h-4 w-4" />
          {exporting() ? '正在备份…' : '导出 ZIP 备份'}
        </Button>
        <Button
          onClick={() => void handleRestore()}
          disabled={exporting() || restoring() || loading()}
          variant="destructive"
          class="gap-2"
        >
          <UploadIcon class="h-4 w-4" />
          {restoring() ? '正在恢复…' : '从备份恢复'}
        </Button>
      </div>

      <p class="text-xs text-muted-foreground">
        本地书源导入不再支持 ZIP 压缩包；请在此恢复 Legado / Reader 备份。暂不支持 WebDav 云备份。
      </p>

      <Show when={error()}>
        <div class="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error()}
        </div>
      </Show>
    </div>
  );
}
