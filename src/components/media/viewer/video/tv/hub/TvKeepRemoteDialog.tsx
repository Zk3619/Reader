/**
 * 远程影视（WebDAV）：账户/根路径 + 浏览导入片单 JSON 或加入视频直链
 */

import { For, Show, createMemo, createSignal } from 'solid-js';
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
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import { Label } from '@/components/ui/label';
import {
  AppSelect,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { ViewerAppSelectContent } from '@/components/media/viewer/viewer-app-overlay';
import { showAppToast } from '@/components/shared/AppToasts';
import { WebDavClient, type WebDavFileInfo } from '@/lib/remote-book/webdav-client';
import { buildRootWebDavUrl, loadWebDavConfig } from '@/lib/remote-book/webdav-config-storage';
import {
  addLocalKeepFromPath,
  importTvKeepPlaylist,
} from '@/lib/media/tv/tv-keep-export';
import {
  getActiveVideoWebDavAccountId,
  getVideoWebDavRoot,
  loadVideoWebDavAccounts,
  setActiveVideoWebDavAccountId,
  setVideoWebDavRoot,
  upsertVideoWebDavAccount,
  type VideoWebDavAccount,
} from '@/lib/media/tv/webdav-video-config';
import { isVideoFileName } from '@/lib/media/video/video-file-ext';
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

const JSON_EXT = /\.json$/i;
const DEFAULT_ACCOUNT_ID = '__default__';

function joinWebDavUrl(root: string, path: string): string {
  const base = root.replace(/\/$/, '');
  const rel = path.replace(/^\//, '');
  return `${base}/${rel}`;
}

function parentPath(path: string, root: string): string {
  const cur = path.replace(/\/+$/, '');
  const r = root.replace(/\/+$/, '');
  if (!cur || cur === r) return r;
  const parent = cur.includes('/') ? cur.replace(/\/[^/]+$/, '') : '';
  if (!parent || parent.length < r.length) return r;
  return parent;
}

export function TvKeepRemoteDialog(props: TvKeepRemoteDialogProps) {
  const [accounts, setAccounts] = createSignal<VideoWebDavAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = createSignal<string>(DEFAULT_ACCOUNT_ID);
  const [rootDraft, setRootDraft] = createSignal('video');
  const [path, setPath] = createSignal('');
  const [files, setFiles] = createSignal<WebDavFileInfo[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [busyPath, setBusyPath] = createSignal('');
  const [error, setError] = createSignal('');

  const accountOptions = createMemo(() => [
    DEFAULT_ACCOUNT_ID,
    ...accounts().map((a) => a.id),
  ]);

  const accountLabel = (id: string) => {
    if (id === DEFAULT_ACCOUNT_ID) return '默认（主程序 WebDAV）';
    return accounts().find((a) => a.id === id)?.name || id;
  };

  const refreshAccounts = () => {
    const list = loadVideoWebDavAccounts();
    setAccounts(list);
    const active = getActiveVideoWebDavAccountId();
    if (active && list.some((a) => a.id === active)) {
      setActiveAccountId(active);
    } else {
      setActiveAccountId(DEFAULT_ACCOUNT_ID);
    }
    setRootDraft(getVideoWebDavRoot() || 'video');
  };

  const applyRoot = () => {
    const root = rootDraft().trim().replace(/^\/+|\/+$/g, '') || 'video';
    setRootDraft(root);
    const accId = activeAccountId();
    if (accId !== DEFAULT_ACCOUNT_ID) {
      const prev = accounts().find((a) => a.id === accId);
      if (prev) {
        upsertVideoWebDavAccount({ ...prev, rootPath: root });
        setAccounts(loadVideoWebDavAccounts());
      }
    } else {
      setVideoWebDavRoot(root);
    }
    return root;
  };

  const loadDir = async (dir?: string) => {
    setLoading(true);
    setError('');
    try {
      const cfg = await loadWebDavConfig();
      if (!cfg) {
        setError('尚未配置 WebDAV，请先在「远程书籍」中设置');
        setFiles([]);
        return;
      }
      const root = applyRoot();
      const target = (dir ?? root).replace(/\/+$/, '') || root || '/';
      const client = new WebDavClient(buildRootWebDavUrl(cfg), cfg.username, cfg.password);
      const list = await client.listFiles(target);
      setPath(target);
      setFiles(
        list.filter((f) => f.isDir || isVideoFileName(f.displayName || f.path) || JSON_EXT.test(f.displayName || f.path)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    props.onOpenChange(open);
    if (open) {
      refreshAccounts();
      void loadDir();
    }
  };

  const handleAccountChange = (id: string | null | undefined) => {
    if (id == null) return;
    setActiveAccountId(id);
    if (id === DEFAULT_ACCOUNT_ID) {
      setActiveVideoWebDavAccountId(null);
      setRootDraft(getVideoWebDavRoot() || 'video');
    } else {
      setActiveVideoWebDavAccountId(id);
      const acc = accounts().find((a) => a.id === id);
      setRootDraft(acc?.rootPath || 'video');
    }
    void loadDir();
  };

  const handleAddAccount = () => {
    const root = rootDraft().trim().replace(/^\/+|\/+$/g, '') || 'video';
    const acc = upsertVideoWebDavAccount({
      name: `影视根 /${root}`,
      rootPath: root,
    });
    setAccounts(loadVideoWebDavAccounts());
    setActiveAccountId(acc.id);
    setActiveVideoWebDavAccountId(acc.id);
    void showAppToast({
      title: '已添加账户配置',
      description: acc.name,
      variant: 'success',
    });
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
      } else if (isVideoFileName(name)) {
        const url = joinWebDavUrl(root, file.path);
        await addLocalKeepFromPath(url, name.replace(/\.[^.]+$/, ''));
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

  const currentRoot = () => rootDraft().trim().replace(/^\/+|\/+$/g, '') || 'video';

  const goUp = () => {
    const root = applyRoot();
    void loadDir(parentPath(path(), root));
  };

  return (
    <AppDialog open={props.open} onOpenChange={handleOpenChange}>
      <AppDialogContent class={appDialogSettingsShell}>
        <AppDialogHeader>
          <AppDialogTitle>远程影视</AppDialogTitle>
          <AppDialogDescription>
            通过 WebDAV 浏览目录：点选 JSON 导入片单，视频文件加入收藏
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class={appDialogSettingsScrollTrack}>
          <div class="mb-3 space-y-2">
            <div class="space-y-1">
              <Label class="text-xs text-muted-foreground">账户配置</Label>
              <div class="flex flex-wrap items-center gap-2">
                <AppSelect
                  value={activeAccountId()}
                  onChange={handleAccountChange}
                  options={accountOptions()}
                  itemComponent={(itemProps) => (
                    <AppSelectItem item={itemProps.item}>
                      {accountLabel(String(itemProps.item.rawValue))}
                    </AppSelectItem>
                  )}
                >
                  <AppSelectTrigger layout="compact" class="h-9 min-w-44 flex-1">
                    <AppSelectValue>
                      {(sel) => {
                        const raw = sel.selectedOption();
                        return raw == null ? '账户' : accountLabel(String(raw));
                      }}
                    </AppSelectValue>
                    <AppSelectIcon />
                  </AppSelectTrigger>
                  <ViewerAppSelectContent>
                    <AppSelectListbox />
                  </ViewerAppSelectContent>
                </AppSelect>
                <Button type="button" size="sm" variant="outline" onClick={handleAddAccount}>
                  保存为账户
                </Button>
              </div>
            </div>
            <div class="space-y-1">
              <Label class="text-xs text-muted-foreground">影视根路径</Label>
              <div class="flex items-center gap-2">
                <AppTextField layout="bare" class="min-w-0 flex-1">
                  <AppTextFieldInput
                    value={rootDraft()}
                    onInput={(e) => setRootDraft(e.currentTarget.value)}
                    placeholder="video"
                  />
                </AppTextField>
                <Button type="button" size="sm" variant="secondary" onClick={() => void loadDir()}>
                  打开根
                </Button>
              </div>
            </div>
          </div>

          <div class="mb-2 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={goUp}
              disabled={!path() || path().replace(/\/+$/, '') === currentRoot()}
            >
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
