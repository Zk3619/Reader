/**
 * 平台账号：歌单预览与同步到「我的列表」。
 * 扫码 / Cookie / WebView 登录已迁至主设置 → 网络 → Cookie Hub。
 */

import {
  createResource,
  createSignal,
  For,
  Show,
  type Component,
} from 'solid-js';
import { Button } from '@/components/ui/button';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  checkAuthHealth,
  loadAuthSession,
  type PlatformId,
} from '@/lib/media/auth';
import {
  fetchNeteaseRecommendPlaylists,
  fetchPlatformRemoteLists,
  loadNeteasePlaylistTracks,
  syncPlatformPlaylistItemToMyList,
  syncPlatformPlaylistsToMyLists,
  type PlatformPlaylistSyncResult,
} from '@/lib/media/audio/platform/playlist-sync';
import {
  getMusicSettings,
  setMusicSettings,
} from '@/lib/media/audio/music-settings';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { playAsTemp } from '@/stores/viewer/media/audio';
import { AppDialogScrollBody } from '@/components/shared/AppDialog';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/media/viewer/viewer-app-overlay';
import {
  appDialogScrollBodySpaceY3,
  dialogScrollFrameFlex,
} from '@/lib/ui/viewport-classes';

export interface AudioAccountPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PLATFORMS: { id: PlatformId; label: string }[] = [
  { id: 'netease', label: '网易云音乐' },
  { id: 'bili', label: '哔哩哔哩' },
  { id: 'ytm', label: 'YouTube Music' },
];

type PlatformListItem = { id: string; remoteId: string; name: string; trackCount?: number };

function describeSyncResult(result: PlatformPlaylistSyncResult): string {
  const parts = [`新建 ${result.created}`, `更新 ${result.updated}`];
  if (result.failed > 0) parts.push(`失败 ${result.failed}`);
  return `${parts.join('，')}（共 ${result.total} 个）· 请到「我的列表」查看`;
}

export const AudioAccountPanel: Component<AudioAccountPanelProps> = (props) => {
  const active = () => props.open;
  const [platform, setPlatform] = createSignal<PlatformId>('netease');
  const [autoSyncAfterLogin, setAutoSyncAfterLogin] = createSignal(
    getMusicSettings().platformPlaylistSyncAfterLogin,
  );
  const [syncBusy, setSyncBusy] = createSignal(false);
  const [syncStatus, setSyncStatus] = createSignal('');
  const [itemSyncingId, setItemSyncingId] = createSignal<string | null>(null);

  const [auth, { refetch: refetchAuth }] = createResource(
    () => (active() ? platform() : null),
    async (p) => {
      if (!p) return null;
      const session = await loadAuthSession(p);
      const healthy = await checkAuthHealth(p);
      return { session, healthy };
    },
  );

  const [playlists, { refetch: refetchPlaylists }] = createResource(
    () => (active() && auth()?.healthy ? platform() : null),
    async (p): Promise<{ title: string; items: PlatformListItem[] }> => {
      if (!p) return { title: '', items: [] };
      const remote = await fetchPlatformRemoteLists(p);
      if (remote.items.length > 0) {
        return {
          title: remote.title,
          items: remote.items.map((pl) => ({
            id: pl.remoteId,
            remoteId: pl.remoteId,
            name: pl.name,
            trackCount: pl.trackCount,
          })),
        };
      }
      if (p === 'netease') {
        const list = await fetchNeteaseRecommendPlaylists();
        return {
          title: '推荐歌单',
          items: list.map((pl) => ({
            id: pl.id,
            remoteId: pl.id,
            name: pl.name,
            trackCount: pl.trackCount,
          })),
        };
      }
      return { title: remote.title, items: [] };
    },
  );

  function applyAutoSyncSetting(checked: boolean): void {
    setAutoSyncAfterLogin(checked);
    setMusicSettings({ platformPlaylistSyncAfterLogin: checked });
  }

  async function runManualSync(): Promise<void> {
    if (syncBusy() || itemSyncingId()) return;
    const p = platform();
    setSyncBusy(true);
    setSyncStatus('准备同步…');
    try {
      const result = await syncPlatformPlaylistsToMyLists(p, {
        onProgress: (done, total, name) => {
          setSyncStatus(`同步中 ${done}/${total}：${name}`);
        },
      });
      setSyncStatus('');
      if (result.total === 0) {
        showAppToast({
          title: '没有可同步的列表',
          description:
            p === 'netease'
              ? '未能解析账号 uid 或拉取「我的歌单」。请确认 Cookie Hub 中已登录网易云'
              : '未获取到该账号的歌单/收藏夹',
          variant: 'warning',
        });
      } else {
        showAppToast({
          title: '已同步到「我的列表」',
          description: describeSyncResult(result),
          variant: result.failed > 0 ? 'warning' : 'success',
        });
      }
      void refetchPlaylists();
    } catch (e) {
      setSyncStatus('');
      showAppToast({
        title: '同步失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSyncBusy(false);
    }
  }

  async function syncOneItem(item: PlatformListItem): Promise<void> {
    if (syncBusy() || itemSyncingId()) return;
    const p = platform();
    setItemSyncingId(item.remoteId);
    try {
      const result = await syncPlatformPlaylistItemToMyList(p, {
        remoteId: item.remoteId,
        name: item.name,
      });
      showAppToast({
        title: result.kind === 'created' ? '已新建到「我的列表」' : '已更新「我的列表」',
        description: `${item.name}（${result.trackCount} 首）`,
        variant: 'success',
      });
    } catch (e) {
      showAppToast({
        title: '同步失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setItemSyncingId(null);
    }
  }

  async function playList(item: PlatformListItem): Promise<void> {
    const p = platform();
    if (p === 'netease') {
      const tracks = await loadNeteasePlaylistTracks(item.remoteId);
      playAsTemp(tracks, 0, { listName: item.name, listKind: 'online-playlist' });
      return;
    }
    if (p === 'bili') {
      const { getBiliFavoriteTracks } = await import('@/lib/media/audio/platform/api/bili');
      const { tracks } = await getBiliFavoriteTracks(item.remoteId, 1, 80);
      if (tracks.length) {
        playAsTemp(tracks, 0, { listName: item.name, listKind: 'online-playlist' });
      }
      return;
    }
    const { getYtmPlaylistTracks } = await import('@/lib/media/audio/platform/api/ytm');
    const tracks = await getYtmPlaylistTracks(item.remoteId);
    if (tracks.length) {
      playAsTemp(tracks, 0, { listName: item.name, listKind: 'online-playlist' });
    }
  }

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <ViewerAppDialogContent layout="app" class="w-[calc(100dvw-2rem)] max-w-md sm:max-w-lg">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>平台账号 · 歌单同步</ViewerAppDialogTitle>
          <ViewerAppDialogDescription>
            登录请前往「设置 → 网络 → Cookie Hub」。此处预览远端歌单并同步到「我的列表」。
          </ViewerAppDialogDescription>
        </ViewerAppDialogHeader>
        <AppDialogScrollBody
          frameClass={dialogScrollFrameFlex}
          class={appDialogScrollBodySpaceY3}
        >
          <div class="flex flex-wrap gap-2">
            <For each={PLATFORMS}>
              {(p) => (
                <Button
                  size="sm"
                  variant={platform() === p.id ? 'default' : 'outline'}
                  onClick={() => setPlatform(p.id)}
                >
                  {p.label}
                </Button>
              )}
            </For>
          </div>

          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span>
              登录状态：
              <span class={auth()?.healthy ? 'text-primary' : 'text-muted-foreground'}>
                {auth()?.healthy ? '已登录' : '未登录'}
              </span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              class="h-7 px-2"
              onClick={() => {
                void refetchAuth();
                void refetchPlaylists();
              }}
            >
              刷新状态
            </Button>
          </div>

          <Show when={!auth()?.healthy}>
            <p class="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              当前平台未登录。请打开主程序「设置 → 网络 → Cookie Hub」，使用扫码、Cookie 或
              WebView 登录后再回来同步。
            </p>
          </Show>

          <div class="space-y-2 rounded-lg border border-border/60 p-3">
            <div class="flex items-center gap-2 text-sm">
              <Checkbox
                id="platform-playlist-auto-sync-input"
                checked={autoSyncAfterLogin()}
                onChange={(checked) => applyAutoSyncSetting(checked)}
              />
              <Label for="platform-playlist-auto-sync-input">
                登录后自动同步我的歌单至我的列表（B站为我的收藏）
              </Label>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={syncBusy() || Boolean(itemSyncingId()) || !auth()?.healthy}
                onClick={() => void runManualSync()}
              >
                {syncBusy() ? '同步中…' : '全部同步至我的列表'}
              </Button>
              <Show when={!auth()?.healthy}>
                <span class="text-xs text-muted-foreground">需先登录</span>
              </Show>
            </div>
            <Show when={syncStatus()}>
              <p class="text-xs text-muted-foreground">{syncStatus()}</p>
            </Show>
            <p class="text-xs text-muted-foreground">
              下方可预览远端歌单；点「同步」写入「我的列表」，点名称可临时播放。
            </p>
          </div>

          <Show when={auth()?.healthy && (playlists()?.items.length ?? 0) > 0}>
            <div>
              <p class="mb-2 text-xs font-medium text-muted-foreground">
                {playlists()?.title ?? '歌单'}
              </p>
              <ul class="h-48 space-y-1 overflow-y-auto overscroll-contain rounded-md border border-border/50 p-1">
                <For each={playlists()?.items ?? []}>
                  {(pl) => (
                    <li class="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        class="h-auto min-w-0 flex-1 justify-start rounded-lg px-3 py-2 text-left text-sm font-normal hover:bg-muted/60"
                        onClick={() => void playList(pl)}
                      >
                        <span class="min-w-0 truncate">{pl.name}</span>
                        <Show when={pl.trackCount != null}>
                          <span class="ml-2 shrink-0 text-xs text-muted-foreground">
                            {pl.trackCount} 首
                          </span>
                        </Show>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        class="shrink-0"
                        disabled={
                          syncBusy() ||
                          (itemSyncingId() != null && itemSyncingId() !== pl.remoteId)
                        }
                        onClick={() => void syncOneItem(pl)}
                      >
                        {itemSyncingId() === pl.remoteId ? '同步中…' : '同步'}
                      </Button>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </Show>
        </AppDialogScrollBody>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
};
