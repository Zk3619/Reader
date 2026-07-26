/**
 * 平台账号登录（网易 / B 站 / YTM）
 * 网易云 / B 站：扫码为主（对齐 NeriPlayer），WebView / Cookie 兜底。
 * 预览远端歌单；单项/全部同步写入 Hub「我的列表」自定义列表（pl_*）。
 */

import {
  createEffect,
  createResource,
  createSignal,
  For,
  onCleanup,
  Show,
  type Component,
} from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextFieldBareTextArea } from '@/components/shared/AppTextField';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  checkAuthHealth,
  cookiesFromManualInput,
  loadAuthSession,
  openPlatformLogin,
  persistBiliQrCookies,
  persistNeteaseQrCookies,
  type PlatformId,
} from '@/lib/media/auth';
import { setPlatformCredential } from '@/lib/media/auth/platform-credentials';
import {
  checkNeteaseQrLogin,
  createNeteaseQrLoginSession,
  describeNeteaseQrStatus,
  type NeteaseQrLoginSession,
} from '@/lib/media/audio/platform/auth/netease-qr-login';
import {
  checkBiliQrLogin,
  createBiliQrLoginSession,
  describeBiliQrStatus,
  type BiliQrLoginSession,
} from '@/lib/media/audio/platform/auth/bili-qr-login';
import {
  fetchNeteaseRecommendPlaylists,
  fetchPlatformRemoteLists,
  loadNeteasePlaylistTracks,
  maybeSyncPlatformPlaylistsAfterLogin,
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
import { renderQrDataUrl } from '@/lib/qr/render-qrcode';
import { playAsTemp } from '@/stores/viewer/media/audio';
import { AudioPanelShell } from '@/components/media/viewer/audio/music/AudioPanelShell';

export interface AudioAccountPanelProps {
  open: boolean;
  onClose?: () => void;
  inline?: boolean;
}

const PLATFORMS: { id: PlatformId; label: string }[] = [
  { id: 'netease', label: '网易云音乐' },
  { id: 'bili', label: '哔哩哔哩' },
  { id: 'ytm', label: 'YouTube Music' },
];

const QR_PLATFORMS = new Set<PlatformId>(['netease', 'bili']);
const QR_POLL_MS = 2000;

type QrLoginSession =
  | { platform: 'netease'; session: NeteaseQrLoginSession }
  | { platform: 'bili'; session: BiliQrLoginSession };

type PlatformListItem = { id: string; remoteId: string; name: string; trackCount?: number };

function describeSyncResult(result: PlatformPlaylistSyncResult): string {
  const parts = [`新建 ${result.created}`, `更新 ${result.updated}`];
  if (result.failed > 0) parts.push(`失败 ${result.failed}`);
  return `${parts.join('，')}（共 ${result.total} 个）· 请到「我的列表」查看`;
}

function qrPlatformLabel(p: PlatformId): string {
  if (p === 'bili') return '哔哩哔哩';
  if (p === 'netease') return '网易云';
  return p;
}

export const AudioAccountPanel: Component<AudioAccountPanelProps> = (props) => {
  const active = () => props.inline || props.open;
  const [platform, setPlatform] = createSignal<PlatformId>('netease');
  const [cookieInput, setCookieInput] = createSignal('');
  const [qrDataUrl, setQrDataUrl] = createSignal<string | null>(null);
  const [qrStatus, setQrStatus] = createSignal('');
  const [qrBusy, setQrBusy] = createSignal(false);
  const [loginBusy, setLoginBusy] = createSignal(false);
  const [autoSyncAfterLogin, setAutoSyncAfterLogin] = createSignal(
    getMusicSettings().platformPlaylistSyncAfterLogin,
  );
  const [syncBusy, setSyncBusy] = createSignal(false);
  const [syncStatus, setSyncStatus] = createSignal('');
  const [itemSyncingId, setItemSyncingId] = createSignal<string | null>(null);

  let qrSession: QrLoginSession | null = null;
  let qrPollTimer: ReturnType<typeof setTimeout> | null = null;
  let qrStopped = false;

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
              ? '未能解析账号 uid 或拉取「我的歌单」。请确认 Cookie 含 MUSIC_U 后重试'
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

  async function autoSyncAfterLoginIfEnabled(p: PlatformId): Promise<void> {
    if (!getMusicSettings().platformPlaylistSyncAfterLogin) return;
    setSyncBusy(true);
    setSyncStatus('登录后自动同步中…');
    try {
      const result = await maybeSyncPlatformPlaylistsAfterLogin(p);
      setSyncStatus('');
      if (result && result.total > 0) {
        showAppToast({
          title: '已自动同步到「我的列表」',
          description: describeSyncResult(result),
          variant: result.failed > 0 ? 'warning' : 'success',
        });
      }
    } catch (e) {
      setSyncStatus('');
      showAppToast({
        title: '自动同步失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSyncBusy(false);
    }
  }

  function stopQrPoll(): void {
    qrStopped = true;
    if (qrPollTimer != null) {
      clearTimeout(qrPollTimer);
      qrPollTimer = null;
    }
    qrSession = null;
  }

  function scheduleQrPoll(): void {
    if (qrStopped || !qrSession) return;
    qrPollTimer = setTimeout(() => {
      void pollQrOnce();
    }, QR_POLL_MS);
  }

  async function pollQrOnce(): Promise<void> {
    const wrapped = qrSession;
    if (!wrapped || qrStopped) return;
    try {
      if (wrapped.platform === 'netease') {
        const result = await checkNeteaseQrLogin(wrapped.session);
        if (qrStopped || qrSession !== wrapped) return;
        setQrStatus(describeNeteaseQrStatus(result.code) || result.message);

        if (result.code === 803 && result.cookies) {
          stopQrPoll();
          await persistNeteaseQrCookies(result.cookies);
          setQrBusy(false);
          setQrDataUrl(null);
          showAppToast({ title: '网易云登录成功', variant: 'success' });
          void refetchAuth();
          void refetchPlaylists();
          void autoSyncAfterLoginIfEnabled('netease');
          return;
        }
        if (result.code === 800) {
          stopQrPoll();
          setQrBusy(false);
          setQrStatus('二维码已过期，请刷新');
          return;
        }
        scheduleQrPoll();
        return;
      }

      const result = await checkBiliQrLogin(wrapped.session);
      if (qrStopped || qrSession !== wrapped) return;
      setQrStatus(describeBiliQrStatus(result.code) || result.message);

      if (result.code === 0 && result.cookies) {
        stopQrPoll();
        await persistBiliQrCookies(result.cookies);
        setQrBusy(false);
        setQrDataUrl(null);
        showAppToast({ title: '哔哩哔哩登录成功', variant: 'success' });
        void refetchAuth();
        void refetchPlaylists();
        void autoSyncAfterLoginIfEnabled('bili');
        return;
      }
      if (result.code === 86038) {
        stopQrPoll();
        setQrBusy(false);
        setQrStatus('二维码已过期，请刷新');
        return;
      }
      if (result.code !== 86101 && result.code !== 86090) {
        stopQrPoll();
        setQrBusy(false);
        setQrStatus(result.message || `扫码失败 (code=${result.code})`);
        return;
      }
      scheduleQrPoll();
    } catch (e) {
      if (qrStopped) return;
      setQrStatus(e instanceof Error ? e.message : String(e));
      scheduleQrPoll();
    }
  }

  async function startQrLogin(): Promise<void> {
    const p = platform();
    if (!QR_PLATFORMS.has(p)) return;
    stopQrPoll();
    qrStopped = false;
    setQrBusy(true);
    setQrStatus('正在生成二维码…');
    setQrDataUrl(null);
    try {
      if (p === 'netease') {
        const session = await createNeteaseQrLoginSession();
        if (qrStopped) return;
        qrSession = { platform: 'netease', session };
        const dataUrl = await renderQrDataUrl(session.qrContent, 240);
        if (qrStopped) return;
        setQrDataUrl(dataUrl);
        setQrStatus(describeNeteaseQrStatus(801));
      } else {
        const session = await createBiliQrLoginSession();
        if (qrStopped) return;
        qrSession = { platform: 'bili', session };
        const dataUrl = await renderQrDataUrl(session.qrContent, 240);
        if (qrStopped) return;
        setQrDataUrl(dataUrl);
        setQrStatus(describeBiliQrStatus(86101));
      }
      scheduleQrPoll();
    } catch (e) {
      stopQrPoll();
      setQrBusy(false);
      setQrDataUrl(null);
      const msg = e instanceof Error ? e.message : String(e);
      setQrStatus(msg);
      showAppToast({
        title: '扫码登录失败',
        description: msg,
        variant: 'destructive',
      });
    }
  }

  async function handleWebViewLogin(): Promise<void> {
    setLoginBusy(true);
    stopQrPoll();
    setQrBusy(false);
    setQrDataUrl(null);
    try {
      const cookies = await openPlatformLogin(platform());
      if (cookies?.trim()) {
        showAppToast({ title: '登录 Cookie 已同步', variant: 'success' });
        void refetchAuth();
        void refetchPlaylists();
        void autoSyncAfterLoginIfEnabled(platform());
      }
    } catch (e) {
      showAppToast({
        title: 'WebView 登录失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleSaveCookie(): Promise<void> {
    try {
      await setPlatformCredential({
        platform: platform(),
        cookies: cookiesFromManualInput(cookieInput()),
        healthy: true,
      });
      showAppToast({ title: 'Cookie 已保存', variant: 'success' });
      void refetchAuth();
      void refetchPlaylists();
      void autoSyncAfterLoginIfEnabled(platform());
    } catch (e) {
      showAppToast({
        title: '保存失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
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

  createEffect(() => {
    const p = platform();
    active();
    if (!active() || !QR_PLATFORMS.has(p)) {
      stopQrPoll();
      setQrBusy(false);
      setQrDataUrl(null);
      setQrStatus('');
    }
  });

  createEffect(() => {
    const session = auth()?.session;
    setCookieInput(session?.cookies ?? '');
  });

  onCleanup(() => {
    stopQrPoll();
  });

  return (
    <AudioPanelShell
      open={props.open}
      inline={props.inline}
      hideHeader={props.inline}
      title="平台账号"
      onClose={props.onClose}
    >
      <div class={`flex flex-wrap gap-2 border-b ${props.inline ? 'pb-3 pt-2' : 'p-4'}`}>
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
      <div class={`space-y-3 border-b ${props.inline ? 'py-3' : 'p-4'}`}>
        <p class="text-sm text-muted-foreground">
          登录后可搜播平台源；单项或全部同步写入 Hub「我的列表」自定义列表。
        </p>
        <p class="text-sm">
          登录状态：
          <span class={auth()?.healthy ? 'text-primary' : 'text-muted-foreground'}>
            {auth()?.healthy ? '已登录' : '未登录'}
          </span>
        </p>

        <Show when={QR_PLATFORMS.has(platform())}>
          <div class="space-y-2 rounded-lg border border-border/60 p-3">
            <div class="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={qrBusy() && Boolean(qrDataUrl())}
                onClick={() => void startQrLogin()}
              >
                {qrDataUrl() ? '刷新二维码' : '扫码登录'}
              </Button>
              <Show when={qrBusy() && qrDataUrl()}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    stopQrPoll();
                    setQrBusy(false);
                    setQrDataUrl(null);
                    setQrStatus('');
                  }}
                >
                  取消
                </Button>
              </Show>
            </div>
            <Show when={qrDataUrl()}>
              {(url) => (
                <div class="flex flex-col items-center gap-2 py-1">
                  <img
                    src={url()}
                    alt={`${qrPlatformLabel(platform())}扫码登录`}
                    class="h-auto w-[min(240px,70vw)] rounded-md border border-border bg-white p-2"
                  />
                  <p class="text-xs text-muted-foreground">{qrStatus()}</p>
                </div>
              )}
            </Show>
            <Show when={!qrDataUrl() && qrStatus()}>
              <p class="text-xs text-muted-foreground">{qrStatus()}</p>
            </Show>
            <p class="text-[11px] text-muted-foreground">
              {platform() === 'bili'
                ? '请使用哔哩哔哩 App 扫码；也可改用下方 WebView / Cookie'
                : '请使用网易云 App 扫码；也可改用下方 WebView / Cookie'}
            </p>
          </div>
        </Show>

        <div class="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={loginBusy()}
            onClick={() => void handleWebViewLogin()}
          >
            WebView 登录
          </Button>
        </div>
        {/* Root 留 px-0.5：focus 环（ring-2）画在控件外侧，贴边会被外层裁切 */}
        <AppTextFieldBareTextArea
          fieldClass="px-0.5"
          class="text-xs"
          rows={3}
          placeholder="或粘贴 Cookie"
          value={cookieInput()}
          onInput={(e) => setCookieInput(e.currentTarget.value)}
        />
        <Button size="sm" variant="outline" onClick={() => void handleSaveCookie()}>
          保存 Cookie
        </Button>

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
      </div>

      <Show when={auth()?.healthy && (playlists()?.items.length ?? 0) > 0}>
        <div class={`shrink-0 ${props.inline ? 'pt-3' : 'p-4 pt-0'}`}>
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
    </AudioPanelShell>
  );
};
