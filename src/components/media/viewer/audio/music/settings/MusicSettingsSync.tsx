import { createSignal, onCleanup, onMount, type Component } from 'solid-js';
import { AudioSyncSettings } from '@/components/media/viewer/audio/music/AudioSyncSettings';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import { MusicSettingsNumberInput } from '@/components/media/viewer/audio/music/settings/MusicSettingsNumberInput';
import { isTauri } from '@/lib/platform/detect';
import {
  getLxSyncServerStatus,
  startLxSyncServer,
  stopLxSyncServer,
} from '@/lib/media/audio/sync/lx-sync-server';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import { showAppToast } from '@/components/shared/AppToasts';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';

export interface MusicSettingsSyncProps {
  embedded?: boolean;
}

export const MusicSettingsSync: Component<MusicSettingsSyncProps> = (props) => {
  const initial = getMusicSettings();
  const [port, setPort] = createSignal(initial.localSyncPort);
  const [password, setPassword] = createSignal('');
  const [autoStart, setAutoStart] = createSignal(initial.localSyncAutoStart);
  const [running, setRunning] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [webdavPath, setWebdavPath] = createSignal(initial.webdavRemoteMusicPath || 'music');
  const [webdavCache, setWebdavCache] = createSignal(initial.webdavRemoteCacheEnabled === true);
  const [webdavBusy, setWebdavBusy] = createSignal(false);

  const refreshStatus = async () => {
    if (isTauri()) setRunning((await getLxSyncServerStatus()).running);
  };

  onMount(() => {
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 2000);
    onCleanup(() => window.clearInterval(timer));
  });

  const toggleServer = async () => {
    setBusy(true);
    try {
      if (running()) {
        await stopLxSyncServer();
        setMusicSettings({ localSyncEnabled: false });
      } else {
        await startLxSyncServer({ port: port(), password: password() || undefined });
        setMusicSettings({ localSyncEnabled: true, localSyncPort: port() });
      }
      await refreshStatus();
    } catch (error) {
      showAppToast({ title: '本机同步服务操作失败', description: toUserFacingMusicError(error), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const syncWebdavLibrary = async () => {
    setWebdavBusy(true);
    try {
      setMusicSettings({
        webdavRemoteMusicPath: webdavPath().trim() || 'music',
        webdavRemoteCacheEnabled: webdavCache(),
      });
      const { syncWebDavRemotePlaylist } = await import(
        '@/lib/media/audio/library/webdav-remote-list'
      );
      const result = await syncWebDavRemotePlaylist();
      showAppToast({
        title: `已同步 ${result.trackCount} 首到 WebDAV 曲库`,
        variant: 'success',
      });
    } catch (error) {
      showAppToast({
        title: 'WebDAV 曲库同步失败',
        description: toUserFacingMusicError(error),
        variant: 'destructive',
      });
    } finally {
      setWebdavBusy(false);
    }
  };

  const clearWebdavCache = async () => {
    setWebdavBusy(true);
    try {
      const { clearWebDavAudioCache } = await import(
        '@/lib/media/audio/library/webdav-remote-cache'
      );
      await clearWebDavAudioCache();
      showAppToast({ title: '已清理 WebDAV 音频缓存', variant: 'success' });
    } catch (error) {
      showAppToast({
        title: '清理失败',
        description: toUserFacingMusicError(error),
        variant: 'destructive',
      });
    } finally {
      setWebdavBusy(false);
    }
  };

  return (
    <div class={props.embedded ? 'space-y-5 text-sm' : 'space-y-5 p-4 text-sm'}>
      {!props.embedded && (
        <div>
          <h2 class="font-medium">数据同步</h2>
          <p class="mt-1 text-xs text-muted-foreground">
            在 Reader 与 LX Music、WebDAV 或 GitHub 快照之间同步音乐列表和曲库数据。
          </p>
        </div>
      )}
      {isTauri() && (
        <section class="space-y-3 rounded-lg border p-4">
          <div>
            <h3 class="font-medium">在本机提供 LX 同步服务</h3>
            <p class="mt-1 text-xs text-muted-foreground">
              让同一网络中的 LX Music 客户端连接到本机 Reader。
            </p>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="space-y-1">
              <span class="block text-xs font-medium text-muted-foreground">服务端口</span>
              <MusicSettingsNumberInput
                value={port()}
                min={1}
                max={65535}
                step={1}
                class="w-full"
                aria-label="本机同步服务端口"
                normalize={(n) => Math.round(n)}
                onCommit={(value) => {
                  setPort(value);
                  setMusicSettings({ localSyncPort: value });
                }}
              />
            </label>
            <label class="space-y-1">
              <span class="block text-xs font-medium text-muted-foreground">连接密码（可选）</span>
              <AppTextFieldBareInput
                type="password"
                value={password()}
                onInput={(event) => setPassword(event.currentTarget.value)}
              />
            </label>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <Button size="sm" disabled={busy()} onClick={() => void toggleServer()}>
              {running() ? '停止本机服务' : '启动本机服务'}
            </Button>
            <span class="text-xs text-muted-foreground">
              运行状态：{running() ? '运行中' : '已停止'}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-sync-auto-start-input"
              checked={autoStart()}
              onChange={(checked) => {
                setAutoStart(checked);
                setMusicSettings({ localSyncAutoStart: checked });
              }}
            />
            <Label for="music-sync-auto-start-input">进入音乐模块时自动启动</Label>
          </div>
        </section>
      )}
      <section class="space-y-3 rounded-lg border p-4">
        <div>
          <h3 class="font-medium">WebDAV 远程曲库</h3>
          <p class="mt-1 text-xs text-muted-foreground">
            扫描已配置 WebDAV 下的音乐目录，生成「WebDAV 曲库」歌单。与下方 JSON 快照备份相互独立。
          </p>
        </div>
        <label class="space-y-1 block">
          <span class="block text-xs font-medium text-muted-foreground">相对路径</span>
          <AppTextFieldBareInput
            value={webdavPath()}
            onInput={(e) => setWebdavPath(e.currentTarget.value)}
            onBlur={() =>
              setMusicSettings({ webdavRemoteMusicPath: webdavPath().trim() || 'music' })
            }
            placeholder="music"
          />
        </label>
        <div class="flex items-center gap-2">
          <Checkbox
            id="music-webdav-cache"
            checked={webdavCache()}
            onChange={(checked) => {
              setWebdavCache(checked);
              setMusicSettings({ webdavRemoteCacheEnabled: checked });
            }}
          />
          <Label for="music-webdav-cache">缓存远程音频到本地</Label>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={webdavBusy()}
            onClick={() => void syncWebdavLibrary()}
          >
            {webdavBusy() ? '同步中…' : '扫描并同步曲库'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={webdavBusy()}
            onClick={() => void clearWebdavCache()}
          >
            清理 WebDAV 音频缓存
          </Button>
        </div>
      </section>
      <section>
        <h3 class="mb-2 font-medium">连接与远程同步</h3>
        <p class="mb-3 text-xs text-muted-foreground">
          LX Sync 用于实时连接；下方可配置 WebDAV、GitHub 与 JSON 快照。
        </p>
        <AudioSyncSettings open inline embedded={props.embedded} />
      </section>
    </div>
  );
};
