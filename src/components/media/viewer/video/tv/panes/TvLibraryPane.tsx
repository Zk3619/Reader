/**
 * E4 / E2.1c / E2.3：本地库递归扫描 + WebDAV 目录树 + 列表/网格 + 封面
 */

import { createSignal, For, Show, onMount, createEffect } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import { Label } from '@/components/ui/label';
import { TvHubPageShell } from '@/components/media/viewer/video/tv/hub/TvHubPageShell';
import {
  addLocalLibraryRoot,
  loadLocalLibraryState,
  rescanLocalLibraryRoots,
  scanAndroidMediaStoreLibrary,
  upsertLocalVideoPaths,
  type LocalVideoItem,
} from '@/lib/media/video/library/local-scan';
import { warmupLocalCovers } from '@/lib/media/video/library/cover-cache';
import { warmupWebDavCovers } from '@/lib/media/video/library/webdav-cover';
import {
  getVideoWebDavRoot,
  listWebDavDir,
  parentWebDavPath,
  setVideoWebDavRoot,
  type VideoWebDavItem,
} from '@/lib/media/video/library/webdav-video';
import { isAndroid } from '@/lib/platform/detect';
import {
  getActiveVideoWebDavAccountId,
  loadVideoWebDavAccounts,
  setActiveVideoWebDavAccountId,
  upsertVideoWebDavAccount,
} from '@/lib/media/video/library/webdav-accounts';
import { openRoutedPlayback } from '@/lib/media/video/playback/open-routed';
import { getVideoPlaybackPrefs } from '@/lib/media/video/playback/prefs';
import { formatPlaybackToastDescription } from '@/lib/media/video/playback/mpv-launch';
import { showAppToast } from '@/components/shared/AppToasts';
import { pickFiles } from '@/lib/platform/fs/pick-file';
import { pickDirectory } from '@/lib/platform/fs/pick-directory';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { formatStorageRef } from '@/lib/platform/fs/storage-ref';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '@/lib/utils';

const VIEW_KEY = 'reader.video.library.view';

function loadViewPref(): 'list' | 'grid' {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}

function saveViewPref(v: 'list' | 'grid') {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* */
  }
}

async function playPath(
  url: string,
  title?: string,
  sourceKind: 'file' | 'webdav' = 'file',
) {
  try {
    if (sourceKind === 'file') {
      try {
        await invoke('video_allow_local_media_asset', { path: url });
      } catch {
        /* */
      }
    }
    const kind = await openRoutedPlayback(url, {
      title,
      sourceKind,
    });
    const prefs = getVideoPlaybackPrefs();
    const a4k =
      prefs.anime4kMode !== 'off' &&
      (kind === 'libmpv' || kind === 'external') &&
      !(prefs.libmpvVideoOutput === 'gpu-next' && !prefs.anime4kForceGpuVo)
        ? ` · Anime4K ${prefs.anime4kMode}`
        : kind === 'artplayer' && prefs.anime4kMode !== 'off'
          ? ' · Upscale: Libmpv / MPV only'
          : '';
    showAppToast({
      title: '已开始播放' + a4k,
      description: formatPlaybackToastDescription(kind, title || url),
    });
  } catch (e) {
    showAppToast({
      title: '播放失败',
      description: e instanceof Error ? e.message : String(e),
    });
  }
}

export function TvLibraryPane() {
  const [localItems, setLocalItems] = createSignal<LocalVideoItem[]>([]);
  const [roots, setRoots] = createSignal<string[]>([]);
  const [remote, setRemote] = createSignal<VideoWebDavItem[]>([]);
  const [davPath, setDavPath] = createSignal(getVideoWebDavRoot());
  const [davRootInput, setDavRootInput] = createSignal(getVideoWebDavRoot());
  const [busy, setBusy] = createSignal(false);
  const [scanProgress, setScanProgress] = createSignal('');
  const [view, setView] = createSignal<'list' | 'grid'>(loadViewPref());
  const [covers, setCovers] = createSignal<Record<string, string>>({});
  const [davCovers, setDavCovers] = createSignal<Record<string, string>>({});
  const [coverBusy, setCoverBusy] = createSignal(false);

  onMount(() => {
    const st = loadLocalLibraryState();
    setLocalItems(st.items);
    setRoots(st.roots);
  });

  createEffect(() => {
    const items = localItems();
    if (!items.length) return;
    void warmupLocalCovers(items, {
      onOne: (path, url) => {
        if (!url) return;
        setCovers((prev) => (prev[path] === url ? prev : { ...prev, [path]: url }));
      },
    });
  });

  const setViewMode = (v: 'list' | 'grid') => {
    setView(v);
    saveViewPref(v);
  };

  const runRescan = async (rootsHint?: string) => {
    setBusy(true);
    setScanProgress('扫描中…');
    try {
      const st = await rescanLocalLibraryRoots({
        onProgress: (info) => {
          setScanProgress(
            `根 ${info.rootIndex + 1}/${info.rootCount} · 已发现 ${info.found} · ${info.currentDir}`,
          );
        },
      });
      setLocalItems(st.items);
      setRoots(st.roots);
      showAppToast({
        title: rootsHint ? '已扫描目录' : '已重新扫描',
        description: rootsHint
          ? `${rootsHint} · ${st.items.length} 个视频`
          : `${st.items.length} 个视频`,
      });
    } catch (e) {
      showAppToast({
        title: '扫描失败',
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
      setScanProgress('');
    }
  };

  const runMediaStoreScan = async () => {
    setBusy(true);
    setScanProgress('MediaStore…');
    try {
      const st = await scanAndroidMediaStoreLibrary();
      setLocalItems(st.items);
      setRoots(st.roots);
      showAppToast({
        title: 'MediaStore 扫描完成',
        description: `${st.items.length} 个视频`,
      });
    } catch (e) {
      showAppToast({
        title: 'MediaStore 扫描失败',
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
      setScanProgress('');
    }
  };

  const pickLocal = async () => {
    try {
      const files = await pickFiles({
        multiple: true,
        filters: [{ name: 'Video', extensions: ['mp4', 'mkv', 'avi', 'mov', 'ts', 'm2ts'] }],
      });
      const paths = files
        .map((f) => formatStorageRef(f.ref) || f.fileName)
        .filter(Boolean);
      const st = upsertLocalVideoPaths(paths);
      setLocalItems(st.items);
    } catch (e) {
      if (!isUserCancelled(e)) {
        showAppToast({
          title: '选择失败',
          description: e instanceof Error ? e.message : String(e),
        });
      }
    }
  };

  const pickRoot = async () => {
    try {
      const picked = await pickDirectory();
      const path = formatStorageRef(picked.ref);
      if (!path) return;
      try {
        await invoke('video_allow_local_media_asset', { path });
      } catch {
        /* */
      }
      addLocalLibraryRoot(path);
      await runRescan(path);
    } catch (e) {
      if (!isUserCancelled(e)) {
        showAppToast({
          title: '扫描失败',
          description: e instanceof Error ? e.message : String(e),
        });
      }
    }
  };

  const regenCovers = async () => {
    const items = localItems();
    if (!items.length) return;
    setCoverBusy(true);
    try {
      await warmupLocalCovers(items, {
        force: true,
        concurrency: 2,
        onOne: (path, url) => {
          if (!url) return;
          setCovers((prev) => ({ ...prev, [path]: url }));
        },
      });
      showAppToast({ title: '封面已重生', description: `${items.length} 条` });
    } catch (e) {
      showAppToast({
        title: '封面重生失败',
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setCoverBusy(false);
    }
  };

  const loadDav = async (path?: string) => {
    setBusy(true);
    try {
      const target = path ?? davPath();
      const list = await listWebDavDir(target);
      setRemote(list);
      setDavPath(target);
      setDavCovers({});
    } catch (e) {
      showAppToast({
        title: 'WebDAV 列表失败',
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const warmupDav = async () => {
    const items = remote().filter((i) => !i.isDir);
    if (!items.length) {
      showAppToast({ title: '无视频可生成封面', description: '当前层为空' });
      return;
    }
    setCoverBusy(true);
    try {
      await warmupWebDavCovers(items, {
        limit: 8,
        onOne: (path, url) => {
          if (!url) return;
          setDavCovers((prev) => ({ ...prev, [path]: url }));
        },
      });
      showAppToast({
        title: 'WebDAV 封面',
        description: `已尝试当前层前 ${Math.min(8, items.length)} 个`,
      });
    } catch (e) {
      showAppToast({
        title: 'WebDAV 封面失败',
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setCoverBusy(false);
    }
  };

  const saveDavRoot = () => {
    setVideoWebDavRoot(davRootInput());
    setDavPath(getVideoWebDavRoot());
    void loadDav(getVideoWebDavRoot());
  };

  return (
    <TvHubPageShell section="library">
      <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        <div class="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => void pickLocal()}>
            添加本地视频
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy()}
            onClick={() => void pickRoot()}
          >
            扫描文件夹
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy() || roots().length === 0}
            onClick={() => void runRescan()}
          >
            重新扫描
          </Button>
          <Show when={isAndroid()}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy()}
              onClick={() => void runMediaStoreScan()}
            >
              MediaStore 扫描
            </Button>
          </Show>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={coverBusy() || localItems().length === 0}
            onClick={() => void regenCovers()}
          >
            重生封面
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view() === 'list' ? 'default' : 'outline'}
            class="h-8"
            onClick={() => setViewMode('list')}
          >
            列表
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view() === 'grid' ? 'default' : 'outline'}
            class="h-8"
            onClick={() => setViewMode('grid')}
          >
            网格
          </Button>
        </div>

        <Show when={scanProgress()}>
          <p class="truncate text-[11px] text-muted-foreground">{scanProgress()}</p>
        </Show>

        <Show when={roots().length > 0}>
          <p class="text-[11px] text-muted-foreground">
            根目录：{roots().join(' · ')}
          </p>
        </Show>

        <section class="space-y-2">
          <h3 class="text-sm font-semibold">本地</h3>
          <Show when={localItems().length === 0}>
            <p class="text-xs text-muted-foreground">尚无本地条目；可添加文件或扫描文件夹</p>
          </Show>
          <div
            class={cn(
              view() === 'grid'
                ? 'grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4'
                : 'space-y-1',
            )}
          >
            <For each={localItems()}>
              {(it) => (
                <button
                  type="button"
                  class={cn(
                    'rounded-md text-left text-sm hover:bg-muted',
                    view() === 'grid'
                      ? 'flex flex-col overflow-hidden border border-border/60'
                      : 'flex w-full items-center gap-2 px-2 py-1.5',
                  )}
                  onClick={() => void playPath(it.path, it.name)}
                  title={it.path}
                >
                  <Show when={covers()[it.path]}>
                    {(src) => (
                      <img
                        src={src()}
                        alt=""
                        class={cn(
                          'bg-muted object-cover',
                          view() === 'grid'
                            ? 'aspect-video w-full'
                            : 'h-10 w-16 shrink-0 rounded',
                        )}
                        loading="lazy"
                      />
                    )}
                  </Show>
                  <Show when={view() === 'grid' && !covers()[it.path]}>
                    <div class="aspect-video w-full bg-muted/60" />
                  </Show>
                  <div class={cn(view() === 'grid' ? 'space-y-1 p-2' : 'min-w-0 flex-1')}>
                    <span class="line-clamp-2 font-medium">{it.name}</span>
                    <Show when={view() === 'grid'}>
                      <span class="block truncate text-[10px] text-muted-foreground">
                        {it.path}
                      </span>
                    </Show>
                  </div>
                </button>
              )}
            </For>
          </div>
        </section>

        <section class="space-y-2">
          <h3 class="text-sm font-semibold">WebDAV</h3>
          <div class="flex flex-wrap items-end gap-2">
            <AppTextField class="min-w-[12rem] flex-1">
              <Label class="text-xs text-muted-foreground">影视根路径（记忆）</Label>
              <AppTextFieldInput
                value={davRootInput()}
                onInput={(e: Event) =>
                  setDavRootInput((e.currentTarget as HTMLInputElement).value)
                }
                placeholder="video"
              />
            </AppTextField>
            <Button type="button" size="sm" variant="outline" onClick={saveDavRoot}>
              保存根并浏览
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const acc = upsertVideoWebDavAccount({
                  name: davRootInput() || 'video',
                  rootPath: davRootInput() || 'video',
                });
                setActiveVideoWebDavAccountId(acc.id);
                setVideoWebDavRoot(acc.rootPath);
                setDavPath(acc.rootPath);
                showAppToast({ title: '已保存 WebDAV 账户', description: acc.name });
                void loadDav(acc.rootPath);
              }}
            >
              存为账户
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy()}
              onClick={() => void loadDav()}
            >
              刷新当前层
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={coverBusy() || remote().every((i) => i.isDir)}
              onClick={() => void warmupDav()}
            >
              生成封面（当前层）
            </Button>
          </div>
          <Show when={loadVideoWebDavAccounts().length > 0}>
            <div class="flex flex-wrap gap-2">
              <For each={loadVideoWebDavAccounts()}>
                {(acc) => (
                  <Button
                    type="button"
                    size="sm"
                    variant={getActiveVideoWebDavAccountId() === acc.id ? 'default' : 'outline'}
                    class="h-7 text-xs"
                    onClick={() => {
                      setActiveVideoWebDavAccountId(acc.id);
                      setVideoWebDavRoot(acc.rootPath);
                      setDavRootInput(acc.rootPath);
                      setDavPath(acc.rootPath);
                      void loadDav(acc.rootPath);
                    }}
                  >
                    {acc.name}
                  </Button>
                )}
              </For>
            </div>
          </Show>
          <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>当前：{davPath() || '/'}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              class="h-7 px-2"
              disabled={!parentWebDavPath(davPath(), getVideoWebDavRoot())}
              onClick={() => {
                const p = parentWebDavPath(davPath(), getVideoWebDavRoot());
                if (p) void loadDav(p);
              }}
            >
              上级
            </Button>
          </div>
          <Show when={remote().length === 0}>
            <p class="text-xs text-muted-foreground">
              点击刷新；需先在主程序配置 WebDAV
            </p>
          </Show>
          <div
            class={cn(
              view() === 'grid'
                ? 'grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4'
                : 'space-y-1',
            )}
          >
            <For each={remote()}>
              {(it) => (
                <button
                  type="button"
                  class={cn(
                    'rounded-md text-left text-sm hover:bg-muted',
                    view() === 'grid' && !it.isDir
                      ? 'flex flex-col overflow-hidden border border-border/60'
                      : 'flex w-full items-center gap-2 px-2 py-1.5',
                  )}
                  onClick={() => {
                    if (it.isDir) void loadDav(it.path);
                    else void playPath(it.href, it.name, 'webdav');
                  }}
                >
                  <Show when={!it.isDir && davCovers()[it.path]}>
                    {(src) => (
                      <img
                        src={src()}
                        alt=""
                        class={cn(
                          'bg-muted object-cover',
                          view() === 'grid'
                            ? 'aspect-video w-full'
                            : 'h-10 w-16 shrink-0 rounded',
                        )}
                        loading="lazy"
                      />
                    )}
                  </Show>
                  <Show when={view() === 'grid' && !it.isDir && !davCovers()[it.path]}>
                    <div class="aspect-video w-full bg-muted/60" />
                  </Show>
                  <span
                    class={cn(
                      'line-clamp-2 font-medium',
                      view() === 'grid' && !it.isDir ? 'p-2' : '',
                    )}
                  >
                    {it.isDir ? `[DIR] ${it.name}` : it.name}
                  </span>
                </button>
              )}
            </For>
          </div>
        </section>
      </div>
    </TvHubPageShell>
  );
}
