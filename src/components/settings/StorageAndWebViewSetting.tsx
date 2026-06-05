/**
 * 程序数据目录、WebView 数据目录、日志与 WebView 清理
 */

import { createEffect, createSignal, Show } from 'solid-js';
import { useSettingsPanelLoad } from '@/lib/settings/use-settings-panel-load';
import { Button } from '@/components/ui/button';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { getConfig, setDataDir, setWebviewDataDir } from '@/lib/platform/config-file';
import {
  clearWebviewCookies,
  clearWebviewDiskCache,
  formatBytes,
  getLogDirectory,
  getWebviewDataRoot,
  getWebviewStorageStats,
  isDesktopTauri,
} from '@/lib/platform/webview-storage';
import {
  clearDataDirMigrationBackup,
  formatMigrationBytes,
  getDataDirMigrationBackup,
  precheckDataDirMigration,
  runLegacyDataMigration,
  type MigrationBackupInfo,
} from '@/lib/platform/data-migration';
import { clearAppDataDirCache } from '@/lib/platform/app-data-dir';
import { reinitializeDatabaseAfterImport } from '@/lib/database';
import { showAppToast } from '@/components/shared/AppToasts';

type StorageWebViewSnapshot = {
  dataDir: string;
  webviewDir: string;
  logDir: string;
  webviewBytes: number;
  hasDataOverride: boolean;
  hasWebviewOverride: boolean;
  migrationBackup: MigrationBackupInfo | null;
};

export function StorageAndWebViewSetting() {
  const [dataDir, setDataDirDisplay] = createSignal('');
  const [webviewDir, setWebviewDirDisplay] = createSignal('');
  const [logDir, setLogDir] = createSignal('');
  const [webviewBytes, setWebviewBytes] = createSignal(0);
  const [hasDataOverride, setHasDataOverride] = createSignal(false);
  const [hasWebviewOverride, setHasWebviewOverride] = createSignal(false);
  const [migrationBackup, setMigrationBackup] = createSignal<MigrationBackupInfo | null>(null);
  const [busy, setBusy] = createSignal(false);

  const panel = useSettingsPanelLoad('storage-webview', async (): Promise<StorageWebViewSnapshot> => {
    const [root, webRoot, logs, bytes, config, backup] = await Promise.all([
      getAppDataDir(),
      getWebviewDataRoot(),
      getLogDirectory(),
      getWebviewStorageStats(),
      getConfig(),
      getDataDirMigrationBackup(),
    ]);
    return {
      dataDir: root,
      webviewDir: webRoot,
      logDir: logs,
      webviewBytes: bytes,
      migrationBackup: backup,
      hasDataOverride: config.dataDir != null && String(config.dataDir).trim() !== '',
      hasWebviewOverride:
        config.webviewDataDir != null && String(config.webviewDataDir).trim() !== '',
    };
  });

  createEffect(() => {
    const snap = panel.data();
    if (!snap) return;
    setDataDirDisplay(snap.dataDir);
    setWebviewDirDisplay(snap.webviewDir);
    setLogDir(snap.logDir);
    setWebviewBytes(snap.webviewBytes);
    setMigrationBackup(snap.migrationBackup);
    setHasDataOverride(snap.hasDataOverride);
    setHasWebviewOverride(snap.hasWebviewOverride);
  });

  const loading = () => panel.loading();
  const refresh = () => panel.refresh({ silent: true });

  const confirmDataDirChange = async (sourcePath: string, targetPath: string) => {
    if (pathsEqualApprox(sourcePath, targetPath)) return true;
    const precheck = await precheckDataDirMigration(sourcePath, targetPath);
    if (!precheck.canProceed) {
      showAppToast({
        title: '磁盘空间不足',
        description: precheck.message,
        variant: 'destructive',
      });
      return false;
    }
    return confirm(
      `${precheck.message}\n\n重启后将显示迁移进度窗口，请勿强制结束进程。是否继续？`,
    );
  };

  const pathsEqualApprox = (a: string, b: string) =>
    a.replace(/[/\\]+$/, '').toLowerCase() === b.replace(/[/\\]+$/, '').toLowerCase();

  const pickDataDir = async () => {
    setBusy(true);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: dataDir(),
      });
      if (selected && typeof selected === 'string') {
        const ok = await confirmDataDirChange(dataDir(), selected);
        if (!ok) return;
        await setDataDir(selected);
        await refresh();
        showAppToast({
          title: '已保存到 config.json',
          description: '请重启应用；重启时将安全迁移数据库与缓存（原目录保留为备份）',
        });
      }
    } catch (e) {
      showAppToast({ title: '设置失败', description: String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (!isDesktopTauri()) {
    return null;
  }

  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <h3 class="mb-2 font-semibold text-foreground">存储与 WebView</h3>
      <p class="mb-4 text-sm text-muted-foreground">
        程序数据（数据库、封面/章节缓存）与 WebView2 浏览数据物理隔离。更改程序数据目录后请重启：重启时会先显示迁移进度窗口，安全复制数据（不删除原目录）。WebView
        目录变更不迁移缓存，书源需重新登录。
      </p>

      <Show when={!loading()} fallback={<p class="text-sm text-muted-foreground">加载中…</p>}>
        <div class="space-y-4 text-sm">
          <div>
            <div class="mb-1 font-medium">程序数据目录</div>
            <p class="mb-1 break-all font-mono text-xs text-muted-foreground">{dataDir()}</p>
            <div class="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={busy()} onClick={() => void pickDataDir()}>
                更改
              </Button>
              <Show when={hasDataOverride()}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy()}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const defaultBase = await invoke<string>('get_default_app_data_base');
                      const ok = await confirmDataDirChange(dataDir(), defaultBase);
                      if (!ok) return;
                      await setDataDir(null);
                      await refresh();
                      showAppToast({
                        title: '已恢复默认数据目录',
                        description: '请重启应用；重启时将安全迁回默认目录',
                      });
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  恢复默认
                </Button>
              </Show>
            </div>
          </div>

          <Show when={migrationBackup()}>
            {(backup) => (
              <div class="rounded-lg border border-border/60 bg-muted/30 p-3">
                <div class="mb-1 font-medium">迁移备份</div>
                <p class="mb-2 break-all font-mono text-xs text-muted-foreground">
                  {backup().path}（约 {formatMigrationBytes(backup().bytes)}）
                </p>
                <p class="mb-2 text-xs text-muted-foreground">
                  上次更改目录后保留的原数据，确认新目录正常后可手动删除。
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy()}
                  onClick={async () => {
                    if (
                      !confirm(
                        `确定删除备份目录？\n${backup().path}\n此操作不可恢复。`,
                      )
                    ) {
                      return;
                    }
                    setBusy(true);
                    try {
                      await clearDataDirMigrationBackup();
                      await refresh();
                      showAppToast({ title: '已删除迁移备份' });
                    } catch (e) {
                      showAppToast({
                        title: '删除失败',
                        description: String(e),
                        variant: 'destructive',
                      });
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  清理迁移备份
                </Button>
              </div>
            )}
          </Show>

          <div>
            <div class="mb-1 font-medium">WebView 数据目录</div>
            <p class="mb-1 text-xs text-muted-foreground">
              占用约 {formatBytes(webviewBytes())}（exe 旁 EBWebView 目录）
            </p>
            <p class="mb-1 break-all font-mono text-xs text-muted-foreground">{webviewDir()}</p>
            <div class="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy()}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const selected = await open({
                      directory: true,
                      multiple: false,
                      defaultPath: webviewDir(),
                    });
                    if (selected && typeof selected === 'string') {
                      await setWebviewDataDir(selected);
                      await refresh();
                      showAppToast({
                        title: '已保存 WebView 目录',
                        description: '请重启应用；WebView 缓存将重新生成，书源可能需重新登录',
                      });
                    }
                  } catch (e) {
                    showAppToast({
                      title: '设置失败',
                      description: String(e),
                      variant: 'destructive',
                    });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                更改
              </Button>
              <Show when={hasWebviewOverride()}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy()}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await setWebviewDataDir(null);
                      await refresh();
                      showAppToast({
                        title: '已恢复默认 WebView 目录',
                        description: '请重启应用；WebView 缓存将重新生成',
                      });
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  恢复默认
                </Button>
              </Show>
            </div>
          </div>

          <div>
            <div class="mb-1 font-medium">运行日志</div>
            <p class="mb-1 text-xs text-muted-foreground">
              Rust 端日志写入 exe 旁 logs/，按天轮转保留 7 份；前端 console 仍输出到开发者工具。
            </p>
            <p class="break-all font-mono text-xs text-muted-foreground">{logDir()}</p>
          </div>

          <div class="flex flex-wrap gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              disabled={busy()}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await runLegacyDataMigration();
                  if (result.migrated) {
                    clearAppDataDirCache();
                    await reinitializeDatabaseAfterImport();
                    showAppToast({
                      title: '已从旧安装目录迁移数据',
                      description: result.message,
                    });
                    await refresh();
                  } else {
                    showAppToast({ title: result.message });
                  }
                } catch (e) {
                  showAppToast({
                    title: '迁移失败',
                    description: String(e),
                    variant: 'destructive',
                  });
                } finally {
                  setBusy(false);
                }
              }}
            >
              从旧版目录迁移
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy()}
              onClick={async () => {
                if (!confirm('清除 WebView 磁盘缓存（Cache/Code Cache 等）？不会删除 Cookie。')) {
                  return;
                }
                setBusy(true);
                try {
                  const n = await clearWebviewDiskCache();
                  await refresh();
                  showAppToast({ title: `已清理 ${n} 个缓存目录` });
                } catch (e) {
                  showAppToast({ title: '清理失败', description: String(e), variant: 'destructive' });
                } finally {
                  setBusy(false);
                }
              }}
            >
              清理 WebView 缓存
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy()}
              onClick={async () => {
                if (!confirm('清除所有 WebView 的 Cookie？书源登录状态可能丢失。')) return;
                setBusy(true);
                try {
                  const n = await clearWebviewCookies();
                  showAppToast({ title: `已清除 ${n} 条 Cookie` });
                } catch (e) {
                  showAppToast({ title: '清理失败', description: String(e), variant: 'destructive' });
                } finally {
                  setBusy(false);
                }
              }}
            >
              清理 WebView Cookies
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void refresh()}>
              刷新
            </Button>
          </div>
        </div>
      </Show>
    </div>
  );
}
