/**
 * 远程影视（WebDAV）：浏览并导入片单 JSON 或加入视频直链
 */

import { For, Show, createSignal } from 'solid-js';
import {
  AppDialogScrollBody,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { showAppToast } from '@/components/shared/AppToasts';
import { WebDavClient, type WebDavFileInfo } from '@/lib/remote-book/webdav-client';
import { buildRootWebDavUrl, loadWebDavConfig } from '@/lib/remote-book/webdav-config-storage';
import {
  addLocalKeepFromPath,
  importTvKeepPlaylist,
} from '@/lib/media/tv/tv-keep-export';
import {
  appDialogSettingsShell,
  dialogScrollFrameFlex,
  appDialogSettingsScrollTrack,
} from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';

export interface TvKeepRemoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}

const VIDEO_EXT = /\.(mp4|mkv|webm|avi|mov|m3u8)$/i;
const JSON_EXT = /\.json$/i;

export function TvKeepRemoteDialog(props: TvKeepRemoteDialogProps) {
  const [path, setPath] = createSignal('');
  const [files, setFiles] = createSignal<WebDavFileInfo[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [busyPath, setBusyPath] = createSignal('');
  const [error, setError] = createSignal('');

  const loadDir = async (dir: string) => {
    setLoading(true);
    setError('');
    try {
      const cfg = await loadWebDavConfig();
      if (!cfg) {
        setError('尚未配置 WebDAV，请先在「远程书籍」中设置');
        setFiles([]);
        return;
      }
      const client = new WebDavClient(buildRootWebDavUrl(cfg), cfg.username, cfg.password);
      const list = await client.listFiles(dir);
      setPath(dir);
      setFiles(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    props.onOpenChange(open);
    if (open) void loadDir('');
  };

  const handlePick = async (file: WebDavFileInfo) => {
    if (file.isDir) {
      void loadDir(file.path);
      return;
    }
    setBusyPath(file.path);
    try {
      const cfg = await loadWebDavConfig();
      if (!cfg) throw new Error('未配置 WebDAV');
      const root = buildRootWebDavUrl(cfg).replace(/\/$/, '');
      const client = new WebDavClient(root, cfg.username, cfg.password);
      const name = file.displayName || file.path;

      if (JSON_EXT.test(name)) {
        const buf = await client.downloadFile(file.path);
        const text = new TextDecoder('utf-8').decode(new Uint8Array(buf));
        const result = await importTvKeepPlaylist(text);
        void showAppToast({
          title: '已导入片单',
          description: `新增 ${result.added}，跳过 ${result.skipped}`,
          variant: 'success',
        });
      } else if (VIDEO_EXT.test(name)) {
        const url = `${root}/${file.path.replace(/^\//, '')}`;
        await addLocalKeepFromPath(url, name.replace(VIDEO_EXT, ''));
        void showAppToast({ title: '已加入收藏', description: name, variant: 'success' });
      } else {
        void showAppToast({ title: '不支持的文件类型', description: name, variant: 'warning' });
        return;
      }
      props.onDone?.();
    } catch (e) {
      void showAppToast({
        title: '操作失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBusyPath('');
    }
  };

  const goUp = () => {
    const cur = path().replace(/\/+$/, '');
    if (!cur) return;
    const parent = cur.includes('/') ? cur.replace(/\/[^/]+$/, '') : '';
    void loadDir(parent);
  };

  return (
    <AppDialog open={props.open} onOpenChange={handleOpenChange}>
      <AppDialogContent class={appDialogSettingsShell}>
        <AppDialogHeader>
          <AppDialogTitle>远程影视</AppDialogTitle>
          <AppDialogDescription>
            通过已配置的 WebDAV 浏览目录：点选 JSON 导入片单，视频文件加入本地收藏
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class={appDialogSettingsScrollTrack}>
          <div class="mb-2 flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={goUp} disabled={!path()}>
              上级
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => void loadDir(path())}>
              刷新
            </Button>
            <span class="truncate text-xs text-muted-foreground">/{path() || ''}</span>
          </div>
          <Show when={error()}>
            <p class="mb-2 text-sm text-destructive">{error()}</p>
          </Show>
          <Show when={loading()}>
            <p class="text-sm text-muted-foreground">加载中…</p>
          </Show>
          <ul class="space-y-1">
            <For each={files()}>
              {(f) => (
                <li>
                  <button
                    type="button"
                    class={cn(
                      'flex w-full items-center rounded-md px-2 py-2 text-left text-sm hover:bg-accent/50',
                      busyPath() === f.path && 'opacity-60',
                    )}
                    disabled={!!busyPath()}
                    onClick={() => void handlePick(f)}
                  >
                    <span class="min-w-0 flex-1 truncate">
                      {f.isDir ? `${f.displayName}/` : f.displayName}
                    </span>
                  </button>
                </li>
              )}
            </For>
          </ul>
          <Show when={!loading() && !error() && files().length === 0}>
            <p class="py-6 text-center text-sm text-muted-foreground">目录为空</p>
          </Show>
        </AppDialogScrollBody>
        <AppDialogFooter>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            关闭
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
