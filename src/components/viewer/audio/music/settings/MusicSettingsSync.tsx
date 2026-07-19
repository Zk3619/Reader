import { createSignal, onCleanup, onMount, type Component } from 'solid-js';
import { AudioSyncSettings } from '@/components/viewer/audio/music/AudioSyncSettings';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import { NumberField, NumberFieldInput } from '@/components/ui/number-field';
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
              <NumberField
                rawValue={port()}
                minValue={1}
                maxValue={65535}
                onRawValueChange={(value) => {
                  setPort(value);
                  setMusicSettings({ localSyncPort: value });
                }}
              >
                <NumberFieldInput aria-label="本机同步服务端口" />
              </NumberField>
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
          <label class="flex items-center gap-2">
            <Checkbox
              checked={autoStart()}
              onChange={(checked) => {
                setAutoStart(checked);
                setMusicSettings({ localSyncAutoStart: checked });
              }}
            />
            <Label>进入音乐模块时自动启动</Label>
          </label>
        </section>
      )}
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
