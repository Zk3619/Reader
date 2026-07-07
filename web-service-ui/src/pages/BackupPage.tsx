import { createResource, createSignal, For, Show } from 'solid-js';
import { Layout, Card, Button, ErrorBox, Loading } from '@/components/Layout';
import {
  getBackupPreview,
  downloadBackup,
  restoreBackup,
  getWebDavBackupList,
  uploadWebDavBackup,
  restoreWebDavBackup,
  syncWebDavAssets,
  type RemoteBackupEntry,
} from '@/lib/api';
import { formatResourceError, resourceError } from '@/lib/resource';
import {
  backupFileIcon,
  formatBackupSize,
  formatBackupTime,
  groupBackupCategories,
  type BackupOverview,
} from '@/lib/backup-overview';
import { showToast } from '@/lib/toast';

export function BackupPage() {
  const [downloading, setDownloading] = createSignal(false);
  const [restoring, setRestoring] = createSignal(false);
  const [downloadError, setDownloadError] = createSignal('');
  const [restoreError, setRestoreError] = createSignal('');
  const [restoreSummary, setRestoreSummary] = createSignal<string[]>([]);
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({});
  const [webDavUploading, setWebDavUploading] = createSignal(false);
  const [webDavRestoring, setWebDavRestoring] = createSignal(false);
  const [webDavSyncing, setWebDavSyncing] = createSignal(false);
  const [webDavError, setWebDavError] = createSignal('');
  const [webDavBackups, setWebDavBackups] = createSignal<RemoteBackupEntry[]>([]);
  const [webDavListOpen, setWebDavListOpen] = createSignal(false);

  const [preview, { refetch }] = createResource(getBackupPreview);

  const categories = () => {
    const data = preview() as BackupOverview | undefined;
    if (!data?.items?.length) return [];
    return groupBackupCategories(data.items);
  };

  const toggleCategory = (name: string) => {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  async function handleDownload() {
    setDownloading(true);
    setDownloadError('');
    try {
      const blob = await downloadBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'backup.zip';
      a.click();
      URL.revokeObjectURL(url);
      await refetch();
      const data = preview() as BackupOverview | undefined;
      if (data?.items?.length) {
        const expandedMap: Record<string, boolean> = {};
        groupBackupCategories(data.items).forEach((c) => {
          expandedMap[c.name] = true;
        });
        setExpanded(expandedMap);
      }
      showToast('备份已下载', 'success');
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  }

  async function handleRestoreFile(file: File) {
    if (
      !confirm(
        '恢复备份将写入当前 Reader 数据。\n\n' +
          '• SQLite / 整库备份：全量替换，不可撤销\n' +
          '• Legado ZIP：合并导入书源、书架等 JSON 项\n\n' +
          '确定继续？',
      )
    ) {
      return;
    }
    setRestoring(true);
    setRestoreError('');
    setRestoreSummary([]);
    try {
      const result = await restoreBackup(file, true);
      setRestoreSummary(result.summary);
      showToast(`还原完成：${result.summary.join('、')}`, 'success');
      await refetch();
      if (result.reloadRecommended) {
        setTimeout(() => {
          if (confirm('数据库已全量恢复，是否刷新页面以应用更改？')) {
            window.location.reload();
          }
        }, 500);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setRestoreError(msg);
      showToast(msg, 'error');
    } finally {
      setRestoring(false);
    }
  }

  function pickRestoreFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,.db,.sqlite,.sqlite3,application/zip,application/x-sqlite3,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void handleRestoreFile(file);
      input.value = '';
    };
    input.click();
  }

  async function handleWebDavUpload() {
    setWebDavUploading(true);
    setWebDavError('');
    try {
      const result = await uploadWebDavBackup();
      showToast(`已上传 ${result.fileName}`, 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setWebDavError(msg);
      showToast(msg, 'error');
    } finally {
      setWebDavUploading(false);
    }
  }

  async function openWebDavRestoreList() {
    setWebDavError('');
    try {
      const data = await getWebDavBackupList();
      setWebDavBackups(data.backups ?? []);
      setWebDavListOpen(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setWebDavError(msg);
      showToast(msg, 'error');
    }
  }

  async function handleWebDavRestore(entry: RemoteBackupEntry) {
    if (!confirm(`从 WebDAV 恢复：${entry.name}？\n\n数据库全量恢复不可撤销。`)) return;
    setWebDavRestoring(true);
    setWebDavError('');
    try {
      const result = await restoreWebDavBackup(entry.name);
      setRestoreSummary(result.summary);
      showToast(`还原完成：${result.summary.join('、')}`, 'success');
      setWebDavListOpen(false);
      await refetch();
      if (result.reloadRecommended) {
        setTimeout(() => {
          if (confirm('数据库已全量恢复，是否刷新页面？')) window.location.reload();
        }, 500);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setWebDavError(msg);
      showToast(msg, 'error');
    } finally {
      setWebDavRestoring(false);
    }
  }

  async function handleWebDavSync() {
    setWebDavSyncing(true);
    setWebDavError('');
    try {
      const result = await syncWebDavAssets();
      showToast(
        `同步完成：进度 ${result.progressUpdated} · 上传背景 ${result.bgUploaded} · 下载背景 ${result.bgDownloaded}`,
        'success',
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setWebDavError(msg);
      showToast(msg, 'error');
    } finally {
      setWebDavSyncing(false);
    }
  }

  return (
    <Layout title="数据备份">
      <Card class="mx-auto mb-6 max-w-2xl space-y-4">
        <div class="text-center">
          <h2 class="text-xl font-semibold">数据备份与还原</h2>
          <p class="mt-1 text-sm text-muted-foreground">下载或上传 Legado / Reader 兼容备份</p>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <Button class="w-full" onClick={handleDownload} disabled={downloading() || restoring()}>
            {downloading() ? '正在备份…' : '下载备份包'}
          </Button>
          <Button
            variant="secondary"
            class="w-full"
            onClick={pickRestoreFile}
            disabled={downloading() || restoring()}
          >
            {restoring() ? '正在还原…' : '上传并还原'}
          </Button>
        </div>

        <Show when={downloadError()}>
          <ErrorBox message={downloadError()} />
        </Show>
        <Show when={restoreError()}>
          <ErrorBox message={restoreError()} />
        </Show>
        <Show when={restoreSummary().length > 0}>
          <div class="web-alert-success rounded-lg border p-3 text-sm">
            <p class="font-medium">还原结果</p>
            <ul class="mt-1 list-inside list-disc">
              <For each={restoreSummary()}>{(line) => <li>{line}</li>}</For>
            </ul>
          </div>
        </Show>

        <p class="text-center text-xs text-muted-foreground">
          支持 Reader SQLite（.db / backup.zip）、Legado 备份 ZIP、旧版 myBook*.json。
          整库恢复后建议刷新页面。
        </p>
      </Card>

      <Card class="mx-auto mb-6 max-w-2xl space-y-4">
        <div class="text-center">
          <h2 class="text-lg font-semibold">WebDAV 云备份</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            需先在 Reader 主应用设置中配置 WebDAV；此处调用同一套 API
          </p>
        </div>
        <div class="grid gap-3 sm:grid-cols-3">
          <Button
            class="w-full"
            onClick={() => void handleWebDavUpload()}
            disabled={webDavUploading() || webDavRestoring() || webDavSyncing() || downloading() || restoring()}
          >
            {webDavUploading() ? '上传中…' : '上传到 WebDAV'}
          </Button>
          <Button
            variant="secondary"
            class="w-full"
            onClick={() => void openWebDavRestoreList()}
            disabled={webDavRestoring() || webDavUploading() || webDavSyncing()}
          >
            {webDavRestoring() ? '恢复中…' : '从 WebDAV 恢复'}
          </Button>
          <Button
            variant="outline"
            class="w-full"
            onClick={() => void handleWebDavSync()}
            disabled={webDavSyncing() || webDavUploading() || webDavRestoring()}
          >
            {webDavSyncing() ? '同步中…' : '同步进度/背景'}
          </Button>
        </div>
        <Show when={webDavError()}>
          <ErrorBox message={webDavError()} />
        </Show>
        <Show when={webDavListOpen()}>
          <div class="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
            <Show when={webDavBackups().length === 0}>
              <p class="text-sm text-muted-foreground">云端暂无 backup*.zip</p>
            </Show>
            <For each={webDavBackups()}>
              {(entry) => (
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => void handleWebDavRestore(entry)}
                >
                  <span class="truncate font-medium">{entry.name}</span>
                  <span class="shrink-0 text-xs text-muted-foreground">
                    {formatBackupSize(entry.size)}
                  </span>
                </button>
              )}
            </For>
          </div>
        </Show>
      </Card>

      <Card class="mx-auto max-w-2xl">
        <h2 class="mb-3 text-lg font-semibold">备份内容预览</h2>
        <Show when={resourceError(preview)}>
          <ErrorBox message={formatResourceError(resourceError(preview))} />
          <Button class="mt-2" variant="secondary" onClick={() => refetch()}>
            重试
          </Button>
        </Show>
        <Show when={!preview.loading && !resourceError(preview)} fallback={<Loading />}>
          <Show when={preview()}>
            {(data) => {
              const overview = data() as BackupOverview;
              return (
                <div class="space-y-4 text-left">
                  <div class="flex flex-wrap gap-6 border-b border-border pb-4 text-sm">
                    <div>
                      <p class="text-xs text-muted-foreground">文件名</p>
                      <p class="font-medium">{overview.fileName}</p>
                    </div>
                    <div>
                      <p class="text-xs text-muted-foreground">大小</p>
                      <p class="font-medium">{formatBackupSize(overview.totalSize)}</p>
                    </div>
                    <div>
                      <p class="text-xs text-muted-foreground">项目</p>
                      <p class="font-medium">{overview.items.length} 项</p>
                    </div>
                    <div>
                      <p class="text-xs text-muted-foreground">时间</p>
                      <p class="font-medium">{formatBackupTime(overview.createTime)}</p>
                    </div>
                  </div>

                  <div class="space-y-2">
                    <For each={categories()}>
                      {(cat) => (
                        <div class="overflow-hidden rounded-lg border border-border">
                          <button
                            type="button"
                            class="flex w-full items-center gap-2 bg-muted/50 px-3 py-2.5 text-left text-sm hover:bg-muted"
                            onClick={() => toggleCategory(cat.name)}
                          >
                            <span>{cat.icon}</span>
                            <span class="flex-1 font-medium">{cat.name}</span>
                            <span class="text-primary">{cat.items.length} 项</span>
                            <span class="text-muted-foreground">{formatBackupSize(cat.totalSize)}</span>
                            <span class={`transition ${expanded()[cat.name] ? 'rotate-90' : ''}`}>›</span>
                          </button>
                          <Show when={expanded()[cat.name]}>
                            <div class="divide-y divide-border">
                              <For each={cat.items}>
                                {(item) => (
                                  <div class="px-3 py-2">
                                    <div class="flex items-start gap-2">
                                      <span>{backupFileIcon(item.fileName)}</span>
                                      <div class="min-w-0 flex-1">
                                        <p class="truncate text-sm font-medium">{item.displayName}</p>
                                        <p class="truncate text-xs text-muted-foreground">{item.description}</p>
                                      </div>
                                      <div class="shrink-0 text-right text-xs">
                                        <Show when={item.count > 0}>
                                          <p class="text-primary">{item.count} 条</p>
                                        </Show>
                                        <p class="text-muted-foreground">{formatBackupSize(item.size)}</p>
                                      </div>
                                    </div>
                                    <div class="mt-1 flex justify-between rounded bg-muted/40 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                                      <span class="truncate">{item.fileName}</span>
                                      <span>{formatBackupSize(item.size)}</span>
                                    </div>
                                  </div>
                                )}
                              </For>
                            </div>
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              );
            }}
          </Show>
        </Show>
      </Card>
    </Layout>
  );
}
