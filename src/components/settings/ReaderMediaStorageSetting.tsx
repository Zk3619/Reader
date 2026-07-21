import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { resolveModuleMediaRoot, getModuleSubdir } from '@/lib/media/media-root';
import { migrateModuleCaches } from '@/lib/media/media-root-migration';
import { open } from '@tauri-apps/plugin-dialog';
import { createEffect, createSignal, Show } from 'solid-js';
import { settingsStore } from '@/stores/settings';
import { showAppToast } from '@/components/shared/AppToasts';

export function ReaderMediaStorageSetting() {
  const [resolvedPath, setResolvedPath] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const useGlobal = () => settingsStore.state.app.readingUseGlobalMediaRoot !== false;
  const customPath = () => settingsStore.state.app.readingMediaRootDirectory?.trim() ?? '';

  createEffect(() => {
    void resolveModuleMediaRoot('reading').then(setResolvedPath);
  });

  const migrateIfNeeded = async (previousRoot: string, nextRoot: string) => {
    if (!previousRoot || !nextRoot || previousRoot === nextRoot) return;
    if (!confirm('阅读媒体目录已变化，是否立即迁移旧缓存到新目录？')) return;
    const result = await migrateModuleCaches('reading', previousRoot, nextRoot);
    showAppToast({
      title: result.movedDirs.length > 0 ? '阅读缓存迁移完成' : '无可迁移缓存',
      description:
        result.movedDirs.length > 0
          ? `已迁移：${result.movedDirs.join('、')}`
          : '旧目录中未发现可迁移缓存目录',
    });
  };

  const pickCustomPath = async () => {
    setBusy(true);
    try {
      const previousRoot = await resolveModuleMediaRoot('reading');
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: customPath() || resolvedPath(),
      });
      if (selected && typeof selected === 'string') {
        await settingsStore.updateAppSettings({
          readingUseGlobalMediaRoot: false,
          readingMediaRootDirectory: selected.trim(),
        });
        const nextRoot = await resolveModuleMediaRoot('reading');
        setResolvedPath(nextRoot);
        await migrateIfNeeded(previousRoot, nextRoot);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <h3 class="mb-2 font-semibold text-foreground">阅读媒体目录</h3>
      <p class="mb-3 text-sm text-muted-foreground">
        阅读缓存默认存放在 MediaRoot 的 {getModuleSubdir('reading')} 子目录下，可按模块覆盖。
      </p>
      <div class="flex items-center gap-2">
        <Checkbox
          id="reader-media-follow-global-input"
          checked={useGlobal()}
          onChange={(checked) => {
            void (async () => {
              const previousRoot = await resolveModuleMediaRoot('reading');
              await settingsStore.updateAppSettings({ readingUseGlobalMediaRoot: checked });
              const nextRoot = await resolveModuleMediaRoot('reading');
              setResolvedPath(nextRoot);
              await migrateIfNeeded(previousRoot, nextRoot);
            })();
          }}
        />
        <Label for="reader-media-follow-global-input">跟随全局 MediaRoot</Label>
      </div>
      <p class="mt-2 break-all font-mono text-xs text-muted-foreground">{resolvedPath() || '—'}</p>
      <Show when={!useGlobal()}>
        <div class="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy()} onClick={() => void pickCustomPath()}>
            选择自定义目录
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy()}
            onClick={() => {
              void (async () => {
                const previousRoot = await resolveModuleMediaRoot('reading');
                await settingsStore.updateAppSettings({ readingMediaRootDirectory: undefined });
                const nextRoot = await resolveModuleMediaRoot('reading');
                setResolvedPath(nextRoot);
                await migrateIfNeeded(previousRoot, nextRoot);
              })();
            }}
          >
            清除自定义目录
          </Button>
        </div>
      </Show>
    </div>
  );
}
