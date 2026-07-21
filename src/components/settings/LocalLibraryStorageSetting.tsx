/**
 * 本地音频/视频库目录设置（对齐 BooksStorageSetting）
 */

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  applyDefaultLocalLibraryPath,
  hasCustomLocalLibraryPath,
  resolveDefaultLocalLibraryPath,
  resolveLocalLibraryPath,
  setLocalLibraryStorageRoot,
  type LocalLibraryModule,
} from '@/lib/platform/fs/managed-local-library';
import { getModuleSubdir } from '@/lib/media/media-root';
import { migrateBooksRoot } from '@/lib/media/media-root-migration';
import { pickDirectory } from '@/lib/platform/fs/pick-directory';
import { FsUnsupportedError, isUserCancelled } from '@/lib/platform/fs/errors';
import { refDisplayLabel } from '@/lib/platform/fs/storage-ref';
import { open } from '@tauri-apps/plugin-dialog';
import { createEffect, createSignal, Show } from 'solid-js';
import { settingsStore } from '@/stores/settings';
import { isTauri } from '@/lib/platform/detect';
import { mayUseAndroidFsLayer } from '@/lib/platform/fs/capabilities';
import { showAppToast } from '@/components/shared/AppToasts';

const LABELS: Record<
  LocalLibraryModule,
  { title: string; noun: string; followKey: 'audioLocalUseGlobalMediaRoot' | 'videoLocalUseGlobalMediaRoot' }
> = {
  music: {
    title: '本地音频库',
    noun: '音频',
    followKey: 'audioLocalUseGlobalMediaRoot',
  },
  video: {
    title: '本地视频库',
    noun: '视频',
    followKey: 'videoLocalUseGlobalMediaRoot',
  },
};

export function LocalLibraryStorageSetting(props: { moduleKey: LocalLibraryModule }) {
  const label = () => LABELS[props.moduleKey];
  const moduleSubdir = () => getModuleSubdir(props.moduleKey);
  const [resolvedPath, setResolvedPath] = createSignal('');
  const [defaultPath, setDefaultPath] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  const followGlobal = () => {
    if (props.moduleKey === 'music') {
      return settingsStore.state.app.audioLocalUseGlobalMediaRoot !== false;
    }
    return settingsStore.state.app.videoLocalUseGlobalMediaRoot !== false;
  };

  const refreshPaths = async () => {
    setResolvedPath(await resolveLocalLibraryPath(props.moduleKey));
    setDefaultPath(await resolveDefaultLocalLibraryPath(props.moduleKey));
  };

  createEffect(() => {
    void props.moduleKey;
    void settingsStore.state.app.audioLocalUseGlobalMediaRoot;
    void settingsStore.state.app.audioLocalMediaRootDirectory;
    void settingsStore.state.app.audioLocalStorageRoot;
    void settingsStore.state.app.videoLocalUseGlobalMediaRoot;
    void settingsStore.state.app.videoLocalMediaRootDirectory;
    void settingsStore.state.app.videoLocalStorageRoot;
    void settingsStore.state.app.musicUseGlobalMediaRoot;
    void settingsStore.state.app.musicMediaRootDirectory;
    void settingsStore.state.app.videoUseGlobalMediaRoot;
    void settingsStore.state.app.videoMediaRootDirectory;
    void settingsStore.state.app.mediaRootDirectory;
    void refreshPaths();
  });

  const migrateIfNeeded = async (previousRoot: string, nextRoot: string) => {
    if (!isTauri() || !previousRoot || !nextRoot || previousRoot === nextRoot) return;
    if (previousRoot.includes(':') || nextRoot.includes(':')) return;
    if (!confirm(`${label().title}目录已变化，是否立即迁移旧文件到新目录？`)) return;
    const result = await migrateBooksRoot(previousRoot, nextRoot);
    showAppToast({
      title: result.movedEntries > 0 ? `${label().title}迁移完成` : '无可迁移内容',
      description:
        result.movedEntries > 0
          ? `已迁移 ${result.movedEntries} 项`
          : '旧目录中未发现可迁移文件',
    });
  };

  const pickCustomPath = async () => {
    setBusy(true);
    try {
      const previousRoot = await resolveLocalLibraryPath(props.moduleKey);
      if (isTauri() && !mayUseAndroidFsLayer()) {
        const selected = await open({
          directory: true,
          multiple: false,
          defaultPath: previousRoot || defaultPath(),
        });
        if (selected && typeof selected === 'string') {
          await setLocalLibraryStorageRoot(props.moduleKey, {
            kind: 'path',
            value: selected.trim(),
          });
        }
      } else {
        const result = await pickDirectory();
        await setLocalLibraryStorageRoot(props.moduleKey, result.ref);
        showAppToast({
          title: `${label().title}已设置`,
          description: refDisplayLabel(result.ref),
        });
      }
      const nextRoot = await resolveLocalLibraryPath(props.moduleKey);
      setResolvedPath(nextRoot);
      await migrateIfNeeded(previousRoot, nextRoot);
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
    <div class="space-y-3">
      <div>
        <h3 class="text-sm font-semibold">{label().title}</h3>
        <p class="mt-1 text-xs text-muted-foreground">
          本地{label().noun}导入（复制/移动）的目标位置。默认跟随 MediaRoot 的 {moduleSubdir()}/Local
          子目录；也可单独指定。
          {!isTauri() && ' 浏览器环境默认使用内置 OPFS，也可选择文件夹授予访问权限。'}
          {mayUseAndroidFsLayer() && ' Android 可选择系统目录（SAF）作为本地库。'}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Checkbox
          id={`${props.moduleKey}-local-follow-input`}
          checked={followGlobal()}
          onChange={(checked) => {
            void (async () => {
              const previousRoot = await resolveLocalLibraryPath(props.moduleKey);
              if (checked) {
                await applyDefaultLocalLibraryPath(props.moduleKey);
              } else {
                await settingsStore.updateAppSettings({
                  [label().followKey]: false,
                });
              }
              const nextRoot = await resolveLocalLibraryPath(props.moduleKey);
              setResolvedPath(nextRoot);
              await migrateIfNeeded(previousRoot, nextRoot);
            })();
          }}
        />
        <Label for={`${props.moduleKey}-local-follow-input`}>
          跟随 MediaRoot（{moduleSubdir()}/Local）
        </Label>
      </div>
      <p class="break-all font-mono text-xs text-muted-foreground">{resolvedPath() || '—'}</p>
      <Show when={followGlobal()}>
        <p class="text-xs text-muted-foreground">
          默认路径：{defaultPath() || '—'}
          {!isTauri() ? '（浏览器实际写入内置 OPFS）' : '（随全局 MediaRoot 与模块目录解析）'}
        </p>
      </Show>
      <Show when={!followGlobal()}>
        <div class="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy()} onClick={() => void pickCustomPath()}>
            选择自定义目录
          </Button>
          <Show when={hasCustomLocalLibraryPath(props.moduleKey)}>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy()}
              onClick={() => {
                void (async () => {
                  const previousRoot = await resolveLocalLibraryPath(props.moduleKey);
                  await applyDefaultLocalLibraryPath(props.moduleKey);
                  const nextRoot = await resolveLocalLibraryPath(props.moduleKey);
                  setResolvedPath(nextRoot);
                  await migrateIfNeeded(previousRoot, nextRoot);
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
