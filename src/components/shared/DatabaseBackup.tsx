/**
 * 数据库备份/恢复组件
 * 提供数据库导出和导入功能的 UI 界面
 */

import { createSignal, Show, onMount, createEffect } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
  DialogTrigger,
} from '@/components/shared/AppDialog';
import { createBackup, restoreBackup } from '@/lib/database/backup-manager';
import { getDatabaseLocation, checkDatabaseExists, openDatabaseDirectory } from '@/lib/database/db-location';
import { isTauri } from '@/lib/platform/detect';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { open } from '@tauri-apps/plugin-dialog';
import { getConfig, setDataDir } from '@/lib/platform/config-file';
import { DownloadIcon, UploadIcon } from '@/components/shared/icons';

export function DatabaseBackup() {
  const [isExporting, setIsExporting] = createSignal(false);
  const [isImporting, setIsImporting] = createSignal(false);
  const [exportSuccess, setExportSuccess] = createSignal(false);
  const [importSuccess, setImportSuccess] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [showDialog, setShowDialog] = createSignal(false);
  const [dbLocation, setDbLocation] = createSignal<string>('');
  const [dbExists, setDbExists] = createSignal<boolean>(false);
  const [dataDirRoot, setDataDirRoot] = createSignal<string>('');
  const [hasDataDirOverride, setHasDataDirOverride] = createSignal(false);
  const [isChangingDataDir, setIsChangingDataDir] = createSignal(false);

  async function loadDataDirInfo() {
    try {
      const location = await getDatabaseLocation();
      setDbLocation(location);
      const exists = await checkDatabaseExists();
      setDbExists(exists);
      if (isTauri()) {
        const root = await getAppDataDir();
        setDataDirRoot(root);
        const config = await getConfig();
        setHasDataDirOverride(config.dataDir != null && String(config.dataDir).trim() !== '');
      }
    } catch (err) {
      console.error('[数据库备份] 获取数据目录信息失败:', err);
    }
  }

  onMount(() => loadDataDirInfo());
  createEffect(() => {
    if (showDialog()) void loadDataDirInfo();
  });

  /**
   * 导出数据库
   */
  async function handleExport() {
    setIsExporting(true);
    setError(null);
    setExportSuccess(false);

    try {
      const backupInfo = await createBackup({
        filename: 'reader-backup',
        includeTimestamp: true,
        description: '数据库备份',
      });

      console.log('[数据库备份] 备份创建成功:', backupInfo);
      setExportSuccess(true);
      
      // 3秒后自动关闭成功提示
      setTimeout(() => {
        setExportSuccess(false);
      }, 3000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '导出失败';
      console.error('[数据库备份] 导出失败:', err);
      setError(errorMsg);
    } finally {
      setIsExporting(false);
    }
  }

  /**
   * 导入数据库
   */
  async function handleImport() {
    setIsImporting(true);
    setError(null);
    setImportSuccess(false);

    try {
      await restoreBackup(true); // 替换模式
      
      console.log('[数据库备份] 恢复成功');
      setImportSuccess(true);
      
      // 恢复成功后，提示用户刷新页面
      setTimeout(() => {
        if (confirm('数据库已恢复，是否刷新页面以应用更改？')) {
          window.location.reload();
        }
      }, 1000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '导入失败';
      console.error('[数据库备份] 导入失败:', err);
      setError(errorMsg);
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <AppDialog open={showDialog()} onOpenChange={setShowDialog}>
      <DialogTrigger as={Button} variant="outline" class="gap-2">
        <DownloadIcon class="h-4 w-4" />
        数据备份
      </DialogTrigger>
      
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>数据库备份与恢复</AppDialogTitle>
          <AppDialogDescription>
            导出数据库备份文件，或从备份文件恢复数据
          </AppDialogDescription>
        </AppDialogHeader>

        <div class="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-6 py-4 contain-layout">
          {/* 数据库位置信息 */}
          <div class="rounded-lg border border-border/50 bg-muted/50 p-3 text-sm">
            <div class="mb-2 font-semibold">数据库文件位置：</div>
            <div class="mb-2 break-all font-mono text-xs text-muted-foreground">
              {dbLocation() || '加载中...'}
            </div>
            <Show when={isTauri() && dbLocation()}>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                    await openDatabaseDirectory();
                  } catch (err) {
                    console.error('[数据库备份] 打开目录失败:', err);
                    setError('无法打开数据库目录');
                  }
                }}
                class="h-7 text-xs"
              >
                打开所在文件夹
              </Button>
            </Show>
            <Show when={dbExists()}>
              <div class="mt-2 text-xs text-green-600 dark:text-green-400">
                ✓ 数据库文件已存在
              </div>
            </Show>
          </div>

          {/* 数据目录（config.json 的 dataDir，数据库/本地书籍/缓存等均在此目录下） */}
          <Show when={isTauri() && dataDirRoot()}>
            <div class="rounded-lg border border-border/50 bg-muted/50 p-3 text-sm">
              <div class="mb-2 font-semibold">数据目录</div>
              <p class="mb-2 text-xs text-muted-foreground">
                数据库、设置、本地书籍、缓存等均保存在此目录。可在下方更改或恢复默认，修改后需重启应用生效。配置文件为 config.json，可随程序迁移或手动编辑。
              </p>
              <div class="mb-2 break-all font-mono text-xs text-muted-foreground">
                {dataDirRoot()}
              </div>
              <div class="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isChangingDataDir()}
                  onClick={async () => {
                    try {
                      setIsChangingDataDir(true);
                      setError(null);
                      const selected = await open({
                        directory: true,
                        multiple: false,
                        defaultPath: dataDirRoot(),
                      });
                      if (selected && typeof selected === 'string') {
                        await setDataDir(selected);
                        await loadDataDirInfo();
                        alert('数据目录已保存到 config.json。请重启应用后生效。');
                      }
                    } catch (err) {
                      console.error('[数据库备份] 设置数据目录失败:', err);
                      setError(err instanceof Error ? err.message : '设置失败');
                    } finally {
                      setIsChangingDataDir(false);
                    }
                  }}
                >
                  {isChangingDataDir() ? '处理中...' : '更改数据目录'}
                </Button>
                <Show when={hasDataDirOverride()}>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isChangingDataDir()}
                    onClick={async () => {
                      try {
                        setIsChangingDataDir(true);
                        setError(null);
                        await setDataDir(null);
                        await loadDataDirInfo();
                        alert('已恢复为默认数据目录。请重启应用后生效。');
                      } catch (err) {
                        console.error('[数据库备份] 恢复默认失败:', err);
                        setError(err instanceof Error ? err.message : '操作失败');
                      } finally {
                        setIsChangingDataDir(false);
                      }
                    }}
                  >
                    恢复默认
                  </Button>
                </Show>
              </div>
            </div>
          </Show>

          {/* 导出区域 */}
          <div class="space-y-2">
            <h3 class="text-sm font-semibold">导出备份</h3>
            <p class="text-sm text-muted-foreground">
              将当前数据库导出为备份文件
            </p>
            <Button
              onClick={handleExport}
              disabled={isExporting() || isImporting()}
              class="w-full gap-2"
              variant="outline"
            >
              <DownloadIcon class="h-4 w-4" />
              {isExporting() ? '导出中...' : '导出数据库'}
            </Button>
            <Show when={exportSuccess()}>
              <p class="text-sm text-green-600 dark:text-green-400">
                ✓ 备份已导出
              </p>
            </Show>
          </div>

          {/* 分隔线 */}
          <div class="border-t border-border" />

          {/* 导入区域 */}
          <div class="space-y-2">
            <h3 class="text-sm font-semibold">恢复备份</h3>
            <p class="text-sm text-muted-foreground">
              <span class="font-semibold text-destructive">警告：</span>
              恢复备份将替换当前数据库，此操作不可撤销！
            </p>
            <Button
              onClick={handleImport}
              disabled={isExporting() || isImporting()}
              class="w-full gap-2"
              variant="destructive"
            >
              <UploadIcon class="h-4 w-4" />
              {isImporting() ? '恢复中...' : '恢复数据库'}
            </Button>
            <Show when={importSuccess()}>
              <p class="text-sm text-green-600 dark:text-green-400">
                ✓ 备份已恢复，请刷新页面
              </p>
            </Show>
          </div>

          {/* 错误提示 */}
          <Show when={error()}>
            <div class="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error()}
            </div>
          </Show>
        </div>

        <AppDialogFooter>
          <Button variant="outline" onClick={() => setShowDialog(false)}>
            关闭
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
