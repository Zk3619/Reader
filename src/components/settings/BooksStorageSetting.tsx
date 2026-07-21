import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  applyDefaultBooksStorageRoot,
  hasBooksStorageRoot,
  resolveBooksDirectoryPath,
  resolveDefaultBooksDirectoryPath,
  setBooksStorageRoot,
} from '@/lib/platform/fs/managed-storage';
import { pickDirectory } from '@/lib/platform/fs/pick-directory';
import { FsUnsupportedError, isUserCancelled } from '@/lib/platform/fs/errors';
import { getModuleSubdir } from '@/lib/media/media-root';
import { migrateBooksRoot } from '@/lib/media/media-root-migration';
import { open } from '@tauri-apps/plugin-dialog';
import { createEffect, createSignal, Show } from 'solid-js';
import { settingsStore } from '@/stores/settings';
import { isTauri } from '@/lib/platform/detect';
import { showAppToast } from '@/components/shared/AppToasts';

export function BooksStorageSetting() {
  const [resolvedPath, setResolvedPath] = createSignal('');
  const [defaultPath, setDefaultPath] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const followGlobal = () => settingsStore.state.app.booksUseGlobalMediaRoot !== false;
  const customPath = () => settingsStore.state.app.booksMediaRootDirectory?.trim() ?? '';

  const refreshPaths = async () => {
    setResolvedPath(await resolveBooksDirectoryPath());
    setDefaultPath(await resolveDefaultBooksDirectoryPath());
  };

  createEffect(() => {
    void settingsStore.state.app.booksUseGlobalMediaRoot;
    void settingsStore.state.app.booksMediaRootDirectory;
    void settingsStore.state.app.readingUseGlobalMediaRoot;
    void settingsStore.state.app.readingMediaRootDirectory;
    void settingsStore.state.app.mediaRootDirectory;
    void refreshPaths();
  });

  const migrateBooksIfNeeded = async (previousRoot: string, nextRoot: string) => {
    if (!isTauri() || !previousRoot || !nextRoot || previousRoot === nextRoot) return;
    if (!confirm('书籍库目录已变化，是否立即迁移旧书籍文件到新目录？')) return;
    const result = await migrateBooksRoot(previousRoot, nextRoot);
    showAppToast({
      title: result.movedEntries > 0 ? '书籍库迁移完成' : '无可迁移内容',
      description:
        result.movedEntries > 0
          ? `已迁移 ${result.movedEntries} 项`
          : '旧目录中未发现可迁移的书籍文件',
    });
  };

  const pickCustomPath = async () => {
    setBusy(true);
    try {
      const previousRoot = await resolveBooksDirectoryPath();
      if (isTauri()) {
        const selected = await open({
          directory: true,
          multiple: false,
          defaultPath: customPath() || resolvedPath() || defaultPath(),
        });
        if (selected && typeof selected === 'string') {
          await settingsStore.updateAppSettings({
            booksUseGlobalMediaRoot: false,
            booksMediaRootDirectory: selected.trim(),
            booksDirectorySet: true,
          });
        }
      } else {
        const result = await pickDirectory({ forBooksStorage: true });
        await setBooksStorageRoot(result.ref);
      }
      const nextRoot = await resolveBooksDirectoryPath();
      setResolvedPath(nextRoot);
      await migrateBooksIfNeeded(previousRoot, nextRoot);
    } catch (e) {
      if (isUserCancelled(e)) return;
      if (e instanceof FsUnsupportedError) {
        showAppToast({ title: '无法选择目录', description: e.message, variant: 'destructive' });
        return;
      }
      showAppToast({
        title: '选择目录失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <h3 class="mb-2 font-semibold text-foreground">书籍存储目录</h3>
      <p class="mb-3 text-sm text-muted-foreground">
        本地书籍导入与拷贝的目标位置。默认跟随 MediaRoot 的 {getModuleSubdir('reading')}/Books
        子目录；也可单独指定。
        {!isTauri() && ' 浏览器环境默认使用内置 OPFS，也可选择文件夹授予访问权限。'}
      </p>
      <div class="flex items-center gap-2">
        <Checkbox
          id="books-follow-global-input"
          checked={followGlobal()}
          onChange={(checked) => {
            void (async () => {
              const previousRoot = await resolveBooksDirectoryPath();
              if (checked) {
                await settingsStore.updateAppSettings({
                  booksUseGlobalMediaRoot: true,
                  booksMediaRootDirectory: undefined,
                  booksStorageRoot: undefined,
                  booksDirectory: undefined,
                  booksDirectorySet: false,
                });
              } else {
                await settingsStore.updateAppSettings({ booksUseGlobalMediaRoot: false });
              }
              const nextRoot = await resolveBooksDirectoryPath();
              setResolvedPath(nextRoot);
              await migrateBooksIfNeeded(previousRoot, nextRoot);
            })();
          }}
        />
        <Label for="books-follow-global-input">
          跟随 MediaRoot（{getModuleSubdir('reading')}/Books）
        </Label>
      </div>
      <p class="mt-2 break-all font-mono text-xs text-muted-foreground">{resolvedPath() || '—'}</p>
      <Show when={followGlobal()}>
        <p class="mt-1 text-xs text-muted-foreground">
          默认路径：{defaultPath() || '—'}（随全局 MediaRoot 与阅读模块目录解析）
        </p>
      </Show>
      <Show when={!followGlobal()}>
        <div class="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy()} onClick={() => void pickCustomPath()}>
            选择自定义目录
          </Button>
          <Show when={hasBooksStorageRoot()}>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy()}
              onClick={() => {
                void (async () => {
                  const previousRoot = await resolveBooksDirectoryPath();
                  await applyDefaultBooksStorageRoot();
                  const nextRoot = await resolveBooksDirectoryPath();
                  setResolvedPath(nextRoot);
                  await migrateBooksIfNeeded(previousRoot, nextRoot);
                })();
              }}
            >
              恢复跟随 MediaRoot
            </Button>
          </Show>
        </div>
      </Show>
    </div>
  );
}
