/**
 * 设置页：数据本地备份、WebDAV 云备份与恢复
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
import { WebDavConfigDialog } from '@/components/remote-book/WebDavConfigDialog';
import { WebDavRestoreDialog } from '@/components/settings/WebDavRestoreDialog';
import {
  findNewerRemoteBackup,
  maybeAutoBackupToWebDav,
  restoreReaderBackupFromWebDav,
  syncWebDavAssets,
  uploadReaderBackupToWebDav,
} from '@/lib/backup/webdav-backup';
import { loadBackupConfig, saveBackupConfig } from '@/lib/backup/backup-config-storage';
import { BackupSelectorDialog } from '@/components/settings/BackupSelectorDialog';
import { detectLegacyImportKind, importLegacyBackupFile } from '@/lib/backup/import-old-data';
import { pickFile } from '@/lib/platform/fs/pick-file';
import { readBytes } from '@/lib/platform/fs/read-write';
import { buildRootWebDavUrl, loadWebDavConfig } from '@/lib/remote-book/webdav-config-storage';
import type { WebDavConfig } from '@/types/remote-book';
import type { RemoteBackupEntry } from '@/lib/backup/webdav-backup';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTime(ts?: number): string {
  if (!ts) return '从未';
  return new Date(ts).toLocaleString();
}

export function DataBackupSetting() {
  const [overview, setOverview] = createSignal<BackupOverview | null>(null);
  const [webDavConfig, setWebDavConfig] = createSignal<WebDavConfig | null>(null);
  const [dbLocation, setDbLocation] = createSignal('');
  const [dbExists, setDbExists] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [exporting, setExporting] = createSignal(false);
  const [restoring, setRestoring] = createSignal(false);
  const [webDavUploading, setWebDavUploading] = createSignal(false);
  const [webDavConfigOpen, setWebDavConfigOpen] = createSignal(false);
  const [webDavRestoreOpen, setWebDavRestoreOpen] = createSignal(false);
  const [selectorOpen, setSelectorOpen] = createSignal(false);
  const [backupPassword, setBackupPassword] = createSignal('');
  const [syncProgress, setSyncProgress] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [preview, location, exists, wdConfig, backupCfg] = await Promise.all([
        getBackupOverview(),
        getDatabaseLocation(),
        checkDatabaseExists(),
        loadWebDavConfig(),
        loadBackupConfig(),
      ]);
      setOverview(preview);
      setDbLocation(location);
      setDbExists(exists);
      setWebDavConfig(wdConfig);
      setBackupPassword(backupCfg.backupPassword ?? '');
      setSyncProgress(backupCfg.syncBookProgress !== false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function runWebDavStartupTasks(config: WebDavConfig | null) {
    if (!config) return;
    try {
      const syncResult = await syncWebDavAssets();
      if (syncResult.progressUpdated > 0) {
        showAppToast({
          title: '已同步云端阅读进度',
          description: `${syncResult.progressUpdated} 本书`,
          variant: 'default',
        });
      }
      const autoName = await maybeAutoBackupToWebDav();
      if (autoName) {
        showAppToast({
          title: '已自动云备份',
          description: autoName,
          variant: 'default',
        });
        await refresh();
      }
      const newer = await findNewerRemoteBackup();
      if (newer) {
        const ok = confirm(
          `检测到云端有更新备份：${newer.name}\n\n是否立即从 WebDAV 恢复？`,
        );
        if (ok) await handleWebDavRestore(newer);
      }
    } catch (err) {
      console.warn('[DataBackupSetting] webdav startup tasks failed', err);
    }
  }

  onMount(() => {
    void refresh().then(() => runWebDavStartupTasks(webDavConfig()));
  });

  async function handleSaveBackupConfig() {
    await saveBackupConfig({
      backupPassword: backupPassword(),
      syncBookProgress: syncProgress(),
    });
    showAppToast({ title: '备份设置已保存', variant: 'default' });
    await refresh();
  }

  async function handleLegacyImport() {
    try {
      const picked = await pickFile({
        filters: [{ name: 'Legado 旧版 JSON', extensions: ['json'] }],
      });
      let bytes: Uint8Array;
      if (picked.bytes) bytes = new Uint8Array(picked.bytes);
      else bytes = new Uint8Array(await readBytes(picked.ref));
      const kind = detectLegacyImportKind(picked.fileName);
      if (!kind) {
        showAppToast({ title: '无法识别旧版文件类型', variant: 'destructive' });
        return;
      }
      const text = new TextDecoder().decode(bytes);
      const n = await importLegacyBackupFile(kind, text);
      showAppToast({
        title: '旧版数据已导入',
        description: `${kind}：${n} 条`,
        variant: 'default',
      });
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('取消')) {
        showAppToast({ title: '导入失败', description: msg, variant: 'destructive' });
      }
    }
  }

  async function handleWebDavSyncAssets() {
    if (!webDavReady()) {
      setWebDavConfigOpen(true);
      return;
    }
    try {
      const result = await syncWebDavAssets();
      showAppToast({
        title: 'WebDAV 同步完成',
        description: `进度 ${result.progressUpdated} · 上传背景 ${result.bgUploaded} · 下载背景 ${result.bgDownloaded}`,
        variant: 'default',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showAppToast({ title: '同步失败', description: msg, variant: 'destructive' });
    }
  }

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
      '恢复备份将替换当前数据（数据库全量恢复时不可撤销）。\n\n支持 Reader / Legado ZIP 备份或 .db 文件。\n\n是否继续？',
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
      await afterRestore(reloadRecommended);
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

  async function afterRestore(reloadRecommended: boolean) {
    if (reloadRecommended) {
      setTimeout(() => {
        if (confirm('数据库已全量恢复，是否刷新页面以应用更改？')) {
          window.location.reload();
        }
      }, 600);
      return;
    }
    window.dispatchEvent(new CustomEvent('sources-refresh'));
    window.dispatchEvent(new CustomEvent('bookshelf-refresh'));
    window.dispatchEvent(new CustomEvent('replace-rules-refresh'));
    await refresh();
  }

  async function handleWebDavUpload() {
    if (!webDavConfig()) {
      setWebDavConfigOpen(true);
      return;
    }
    setWebDavUploading(true);
    setError(null);
    try {
      const result = await uploadReaderBackupToWebDav();
      showAppToast({
        title: '已上传 WebDAV',
        description: `${result.fileName}（${formatBytes(result.size)}）`,
        variant: 'default',
      });
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      showAppToast({ title: '上传失败', description: msg, variant: 'destructive' });
    } finally {
      setWebDavUploading(false);
    }
  }

  async function handleWebDavRestore(entry: RemoteBackupEntry) {
    const ok = confirm(
      `将从 WebDAV 恢复：${entry.name}\n\n数据库全量恢复时不可撤销，是否继续？`,
    );
    if (!ok) return;

    setRestoring(true);
    setError(null);
    try {
      const { summary, reloadRecommended } = await restoreReaderBackupFromWebDav(entry.name);
      showAppToast({
        title: '云端备份已恢复',
        description: summary.join('；'),
        variant: 'default',
      });
      await afterRestore(reloadRecommended);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      showAppToast({ title: '恢复失败', description: msg, variant: 'destructive' });
    } finally {
      setRestoring(false);
    }
  }

  const itemRows = () => overview()?.items ?? [];
  const webDavReady = () => Boolean(webDavConfig()?.url && webDavConfig()?.username);

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
              ZIP 含完整 reader.db、Legado 兼容 JSON 与阅读器配置
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading()}>
            刷新
          </Button>
        </div>

        <Show when={!loading()} fallback={<p class="text-sm text-muted-foreground">正在统计…</p>}>
          <Show when={itemRows().length > 0} fallback={<p class="text-sm text-muted-foreground">暂无可备份数据</p>}>
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
                  预计约 {formatBytes(overview()!.totalSize)}，文件名 {overview()!.fileName}
                </p>
              </Show>
            </div>
          </Show>
        </Show>
      </div>

      <div class="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
        <div>
          <h4 class="text-sm font-semibold">备份选项</h4>
          <p class="text-xs text-muted-foreground">BackupAES 加密、选择性备份、旧版 Legado 数据</p>
        </div>
        <div class="grid gap-2 sm:grid-cols-2">
          <label class="space-y-1 text-sm">
            <span class="text-xs text-muted-foreground">备份密码（加密 servers.json 等）</span>
            <input
              type="password"
              class="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              value={backupPassword()}
              onInput={(e) => setBackupPassword(e.currentTarget.value)}
              placeholder="留空则不加密"
            />
          </label>
          <label class="flex items-center gap-2 pt-5 text-sm">
            <input
              type="checkbox"
              checked={syncProgress()}
              onChange={(e) => setSyncProgress(e.currentTarget.checked)}
            />
            阅读进度 WebDAV 云同步
          </label>
        </div>
        <div class="grid gap-2 sm:grid-cols-3">
          <Button variant="outline" size="sm" onClick={() => void handleSaveBackupConfig()}>
            保存备份设置
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelectorOpen(true)}>
            选择性备份项
          </Button>
          <Button variant="outline" size="sm" onClick={() => void handleLegacyImport()}>
            导入旧版 JSON
          </Button>
        </div>
      </div>

      <div class="grid gap-2 sm:grid-cols-2">
        <Button
          onClick={() => void handleExport()}
          disabled={exporting() || restoring() || webDavUploading() || loading()}
          variant="outline"
          class="gap-2"
        >
          <DownloadIcon class="h-4 w-4" />
          {exporting() ? '正在备份…' : '导出 ZIP 备份'}
        </Button>
        <Button
          onClick={() => void handleRestore()}
          disabled={exporting() || restoring() || webDavUploading() || loading()}
          variant="destructive"
          class="gap-2"
        >
          <UploadIcon class="h-4 w-4" />
          {restoring() ? '正在恢复…' : '从本地恢复'}
        </Button>
      </div>

      <div class="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
        <div>
          <h4 class="text-sm font-semibold">WebDAV 云备份</h4>
          <p class="text-xs text-muted-foreground">
            对齐 Legado AppWebDav：上传 backup*.zip 至 {webDavReady() ? buildRootWebDavUrl(webDavConfig()!) : '{url}/{dir}/'}
          </p>
        </div>
        <Show when={webDavReady()}>
          <div class="text-xs text-muted-foreground space-y-1">
            <div>上次云备份：{formatTime(webDavConfig()?.lastBackupTime)}</div>
            <Show when={webDavConfig()?.lastRemoteBackupName}>
              <div class="break-all">文件：{webDavConfig()?.lastRemoteBackupName}</div>
            </Show>
          </div>
        </Show>
        <div class="grid gap-2 sm:grid-cols-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!webDavReady()}
            onClick={() => void handleWebDavSyncAssets()}
          >
            同步进度与背景
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!webDavReady() || restoring()}
            onClick={() => setWebDavRestoreOpen(true)}
          >
            从 WebDAV 恢复
          </Button>
        </div>
        <div class="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" size="sm" onClick={() => setWebDavConfigOpen(true)}>
            {webDavReady() ? 'WebDAV 设置' : '配置 WebDAV'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={webDavUploading() || restoring() || exporting()}
            onClick={() => void handleWebDavUpload()}
          >
            {webDavUploading() ? '上传中…' : '上传到 WebDAV'}
          </Button>
        </div>
      </div>

      <Show when={error()}>
        <div class="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error()}
        </div>
      </Show>

      <BackupSelectorDialog
        open={selectorOpen()}
        onOpenChange={setSelectorOpen}
        onSaved={() => void refresh()}
      />
      <WebDavConfigDialog
        open={webDavConfigOpen()}
        onOpenChange={setWebDavConfigOpen}
        onConfigSaved={(config) => {
          setWebDavConfig(config);
        }}
      />
      <WebDavRestoreDialog
        open={webDavRestoreOpen()}
        onOpenChange={setWebDavRestoreOpen}
        onSelect={(entry) => void handleWebDavRestore(entry)}
      />
    </div>
  );
}
