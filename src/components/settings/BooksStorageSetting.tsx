/**
 * 设置页：本地书籍库根目录（与首次导入弹窗、StorageRef 托管一致）
 */

import { createSignal, onMount, Show } from 'solid-js';
import { pickDirectory } from '@/lib/platform/fs/pick-directory';
import { FsUnsupportedError, isUserCancelled } from '@/lib/platform/fs/errors';
import {
  applyDefaultBooksStorageRoot,
  hasBooksStorageRoot,
  resolveBooksDirectoryPath,
} from '@/lib/platform/fs/managed-storage';
import {
  parseStorageRef,
  refDisplayLabel,
  safTreeHumanLabel,
} from '@/lib/platform/fs/storage-ref';
import { resolveFsPlatform } from '@/lib/platform/fs/capabilities';
import { isTauri } from '@/lib/platform/detect';
import { settingsStore } from '@/stores/settings';
import { Button } from '@/components/ui/button';
import { showAppToast } from '@/components/shared/AppToasts';

export function BooksStorageSetting() {
  const [displayPath, setDisplayPath] = createSignal('');
  const [storageRefLabel, setStorageRefLabel] = createSignal('');
  const [loading, setLoading] = createSignal(true);
  const [picking, setPicking] = createSignal(false);

  const refreshDisplay = async () => {
    setLoading(true);
    try {
      const app = settingsStore.state.app;
      const formatted = app.booksStorageRoot?.trim();
      if (formatted) {
        setStorageRefLabel(formatted);
        const ref = parseStorageRef(formatted);
        if (ref.kind === 'path') {
          setDisplayPath(ref.value);
        } else if (ref.kind === 'opfs') {
          setDisplayPath('浏览器内置存储 (OPFS)');
        } else if (ref.kind === 'saf-tree') {
          setDisplayPath(safTreeHumanLabel(ref.value));
        } else {
          setDisplayPath(refDisplayLabel(ref));
        }
      } else {
        setStorageRefLabel('');
        setDisplayPath(await resolveBooksDirectoryPath());
      }
    } catch (e) {
      console.error('[BooksStorageSetting] refreshDisplay', e);
      setDisplayPath('');
      setStorageRefLabel('');
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void refreshDisplay();
  });

  const handlePickDirectory = async () => {
    setPicking(true);
    try {
      const result = await pickDirectory({ forBooksStorage: true });
      await refreshDisplay();
      showAppToast({
        title: '书籍目录已更新',
        description: refDisplayLabel(result.ref),
        variant: 'default',
      });
    } catch (e) {
      if (isUserCancelled(e)) return;
      if (e instanceof FsUnsupportedError) {
        const platform = resolveFsPlatform();
        showAppToast({
          title: '无法选择目录',
          description:
            platform === 'android'
              ? '请尝试更新 WebView，或使用下方「恢复默认目录」。'
              : e.message,
          variant: 'destructive',
        });
        return;
      }
      showAppToast({
        title: '选择目录失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setPicking(false);
    }
  };

  const handleResetDefault = async () => {
    setPicking(true);
    try {
      const root = await applyDefaultBooksStorageRoot();
      await refreshDisplay();
      showAppToast({
        title: '已恢复默认书籍目录',
        description: refDisplayLabel(root),
        variant: 'default',
      });
    } catch (e) {
      showAppToast({
        title: '恢复失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setPicking(false);
    }
  };

  const configured = () => hasBooksStorageRoot();

  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <div class="mb-4">
        <h3 class="mb-2 font-semibold text-foreground">书籍存储目录</h3>
        <p class="text-sm text-muted-foreground">
          本地书籍导入、拷贝与下载的目标位置。首次导入时会提示选择；也可在此修改。
          {!isTauri() && ' 浏览器环境默认使用内置 OPFS，也可选择文件夹授予访问权限。'}
        </p>
      </div>

      <Show
        when={!loading()}
        fallback={
          <p class="mb-4 text-sm text-muted-foreground">正在读取目录信息…</p>
        }
      >
        <div class="mb-4 rounded-lg border border-border/50 bg-muted/40 p-3 text-sm">
          <div class="mb-1 font-medium text-foreground">当前目录</div>
          <p class="mb-2 break-all font-mono text-xs text-muted-foreground">
            {displayPath() || '—'}
          </p>
          <Show when={storageRefLabel() && !storageRefLabel().startsWith('saf-tree:')}>
            <p class="mb-2 break-all font-mono text-xs text-muted-foreground/80">
              {storageRefLabel()}
            </p>
          </Show>
          <p class="text-xs text-muted-foreground">
            {configured()
              ? '已指定书籍库根目录。'
              : '尚未单独指定，将使用应用默认目录（与首次导入弹窗中的默认路径一致）。'}
          </p>
        </div>
      </Show>

      <div class="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={picking() || loading()}
          onClick={() => void handlePickDirectory()}
        >
          {picking() ? '处理中…' : '更改书籍目录'}
        </Button>
        <Show when={configured()}>
          <Button
            variant="ghost"
            size="sm"
            disabled={picking() || loading()}
            onClick={() => void handleResetDefault()}
          >
            恢复默认目录
          </Button>
        </Show>
        <Button
          variant="ghost"
          size="sm"
          disabled={loading()}
          onClick={() => void refreshDisplay()}
        >
          刷新
        </Button>
      </div>
    </div>
  );
}
