import { createSignal, onCleanup, onMount, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import { NumberField, NumberFieldInput } from '@/components/ui/number-field';
import { isTauri } from '@/lib/platform/detect';
import {
  getMusicOpenApiStatus,
  startMusicOpenApi,
  stopMusicOpenApi,
} from '@/lib/media/audio/platform/music-openapi-client';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import { showAppToast } from '@/components/shared/AppToasts';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';

export interface MusicSettingsOpenApiProps {
  embedded?: boolean;
}

export const MusicSettingsOpenApi: Component<MusicSettingsOpenApiProps> = (props) => {
  const initial = getMusicSettings();
  const [port, setPort] = createSignal(initial.openApiPort);
  const [bindAddress, setBindAddress] = createSignal(initial.openApiBindAddress);
  const [autoStart, setAutoStart] = createSignal(initial.openApiAutoStart);
  const [running, setRunning] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const allowsLanAccess = () =>
    bindAddress() !== '127.0.0.1' && bindAddress() !== 'localhost' && bindAddress() !== '::1';

  const refreshStatus = async () => setRunning((await getMusicOpenApiStatus()).running);

  onMount(() => {
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 2000);
    onCleanup(() => window.clearInterval(timer));
  });

  const toggle = async () => {
    setBusy(true);
    try {
      if (running()) {
        await stopMusicOpenApi();
        setMusicSettings({ openApiEnabled: false });
      } else {
        await startMusicOpenApi(port(), bindAddress());
        setMusicSettings({
          openApiEnabled: true,
          openApiPort: port(),
          openApiBindAddress: bindAddress(),
        });
      }
      await refreshStatus();
    } catch (error) {
      showAppToast({ title: 'OpenAPI 操作失败', description: toUserFacingMusicError(error), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (!isTauri()) {
    return (
      <div class={props.embedded ? 'text-sm text-muted-foreground' : 'p-4 text-sm text-muted-foreground'}>
        OpenAPI 服务仅桌面端可用。
      </div>
    );
  }

  return (
    <div class={props.embedded ? 'space-y-5 text-sm' : 'space-y-5 p-4 text-sm'}>
      {!props.embedded && (
        <div>
          <h2 class="font-medium">OpenAPI 服务</h2>
          <p class="mt-1 text-xs text-muted-foreground">
            允许同一设备上的自动化工具通过 HTTP 控制 Reader 音乐播放。
          </p>
        </div>
      )}
      <section class="space-y-3">
        <div class="flex items-center gap-2">
          <Checkbox
            id="music-open-api-lan-access-input"
            checked={allowsLanAccess()}
            onChange={(checked) => {
              const value = checked ? '0.0.0.0' : '127.0.0.1';
              setBindAddress(value);
              setMusicSettings({ openApiBindAddress: value });
            }}
          />
          <Label for="music-open-api-lan-access-input">允许来自局域网的访问</Label>
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
                setMusicSettings({ openApiPort: value });
              }}
            >
              <NumberFieldInput aria-label="OpenAPI 服务端口" />
            </NumberField>
          </label>
          <label class="space-y-1">
            <span class="block text-xs font-medium text-muted-foreground">
              自定义绑定地址
            </span>
            <AppTextFieldBareInput
              aria-label="OpenAPI 绑定地址"
              value={bindAddress()}
              onInput={(event) => {
                setBindAddress(event.currentTarget.value);
                setMusicSettings({ openApiBindAddress: event.currentTarget.value });
              }}
            />
          </label>
        </div>
        <p class="text-xs text-muted-foreground">
          使用 127.0.0.1 仅允许本机访问。改为局域网地址会扩大访问范围，请自行确保网络可信。
        </p>
        <div class="flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={busy()} onClick={() => void toggle()}>
            {running() ? '停止服务' : '启动服务'}
          </Button>
          <span class="text-xs text-muted-foreground">
            运行状态：{running() ? '运行中' : '已停止'}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <Checkbox
            id="music-open-api-auto-start-input"
            checked={autoStart()}
            onChange={(checked) => {
              setAutoStart(checked);
              setMusicSettings({ openApiAutoStart: checked });
            }}
          />
          <Label for="music-open-api-auto-start-input">进入音乐模块时自动启动</Label>
        </div>
      </section>
    </div>
  );
};
