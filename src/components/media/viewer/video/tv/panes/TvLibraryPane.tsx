/**
 * E4：本地库 + WebDAV 影视列表
 */

import { createSignal, For, Show, onMount } from 'solid-js';
import { Button } from '@/components/ui/button';
import { TvHubPageShell } from '@/components/media/viewer/video/tv/hub/TvHubPageShell';
import {
  loadLocalLibraryState,
  upsertLocalVideoPaths,
  type LocalVideoItem,
} from '@/lib/media/video/library/local-scan';
import {
  listWebDavVideos,
  type VideoWebDavItem,
} from '@/lib/media/video/library/webdav-video';
import { openInExternalPlayer, getPreferredExternalPlayer } from '@/lib/media/tv/play/external-player';
import { invoke } from '@tauri-apps/api/core';
import { showAppToast } from '@/components/shared/AppToasts';
import { pickFiles } from '@/lib/platform/fs/pick-file';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { formatStorageRef } from '@/lib/platform/fs/storage-ref';
import { getVideoPlaybackPrefs } from '@/lib/media/video/playback/prefs';
import {
  joinGlslShadersArg,
  resolveShaderPaths,
} from '@/lib/media/video/playback/anime4k';

async function playPath(url: string, title?: string) {
  const prefs = getVideoPlaybackPrefs();
  const paths = resolveShaderPaths(
    prefs.anime4kShadersDir,
    prefs.anime4kMode,
    prefs.anime4kQuality,
  );
  const glsl = joinGlslShadersArg(paths) || null;
  try {
    await invoke('video_libmpv_open_window', {
      url,
      title: title ?? null,
      startSec: null,
      subtitle: prefs.preferredSubtitlePath || null,
      glslShaders: glsl,
    });
    showAppToast({ title: '增强播放', description: title || url });
  } catch {
    await openInExternalPlayer(url, {
      kind: getPreferredExternalPlayer(),
      title,
      anime4k: { mode: prefs.anime4kMode, quality: prefs.anime4kQuality },
    });
    showAppToast({ title: '已交外置播放', description: title || url });
  }
}

export function TvLibraryPane() {
  const [localItems, setLocalItems] = createSignal<LocalVideoItem[]>([]);
  const [remote, setRemote] = createSignal<VideoWebDavItem[]>([]);
  const [busy, setBusy] = createSignal(false);

  onMount(() => {
    setLocalItems(loadLocalLibraryState().items);
  });

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

  const refreshWebDav = async () => {
    setBusy(true);
    try {
      setRemote(await listWebDavVideos());
    } catch (e) {
      showAppToast({
        title: 'WebDAV 列表失败',
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <TvHubPageShell section="library">
      <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        <div class="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => void pickLocal()}>
            添加本地视频
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy()}
            onClick={() => void refreshWebDav()}
          >
            刷新 WebDAV
          </Button>
        </div>
        <section class="space-y-2">
          <h3 class="text-sm font-semibold">本地</h3>
          <Show when={localItems().length === 0}>
            <p class="text-xs text-muted-foreground">尚无本地条目</p>
          </Show>
          <ul class="space-y-1">
            <For each={localItems()}>
              {(it) => (
                <li>
                  <button
                    type="button"
                    class="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => void playPath(it.path, it.name)}
                  >
                    {it.name}
                  </button>
                </li>
              )}
            </For>
          </ul>
        </section>
        <section class="space-y-2">
          <h3 class="text-sm font-semibold">WebDAV</h3>
          <Show when={remote().length === 0}>
            <p class="text-xs text-muted-foreground">点击刷新；需先在主程序配置 WebDAV</p>
          </Show>
          <ul class="space-y-1">
            <For each={remote()}>
              {(it) => (
                <li>
                  <button
                    type="button"
                    class="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => void playPath(it.href, it.name)}
                  >
                    {it.name}
                  </button>
                </li>
              )}
            </For>
          </ul>
        </section>
      </div>
    </TvHubPageShell>
  );
}
