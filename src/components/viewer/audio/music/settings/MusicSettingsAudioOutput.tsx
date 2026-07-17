import {
  createResource,
  createSignal,
  createEffect,
  Show,
  onCleanup,
  onMount,
  type Component,
} from 'solid-js';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { NumberField, NumberFieldInput } from '@/components/ui/number-field';
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';
import { EQ_PRESETS, WebAudioPlayerEngine } from '@/lib/media/audio/engine/web-audio-player';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import {
  MusicEqualizerEditor,
  MUSIC_EQ_PRESET_LABELS,
} from '@/components/viewer/audio/music/hub/MusicEqualizerEditor';

export interface MusicSettingsAudioOutputProps {
  embedded?: boolean;
}

export const MusicSettingsAudioOutput: Component<MusicSettingsAudioOutputProps> = (props) => {
  const [settings, setLocal] = createSignal(getMusicSettings());
  const [devices, { refetch }] = createResource(() =>
    WebAudioPlayerEngine.enumerateOutputDevices().catch(() => []),
  );
  const [labelsReadable, setLabelsReadable] = createSignal(true);
  const [requestingPermission, setRequestingPermission] = createSignal(false);
  const apply = (patch: Parameters<typeof setMusicSettings>[0]) => {
    setMusicSettings(patch);
    setLocal(getMusicSettings());
  };

  const supportsSelection = WebAudioPlayerEngine.supportsOutputSelection();
  const supportsEnumeration = WebAudioPlayerEngine.supportsDeviceEnumeration();

  const refreshLabelState = () => {
    void WebAudioPlayerEngine.hasReadableDeviceLabels()
      .then(setLabelsReadable)
      .catch(() => setLabelsReadable(true));
  };

  const requestLabels = async () => {
    if (requestingPermission()) return;
    setRequestingPermission(true);
    try {
      await WebAudioPlayerEngine.requestDeviceLabelPermission();
      await refetch();
      refreshLabelState();
    } finally {
      setRequestingPermission(false);
    }
  };

  const refreshDevices = async () => {
    // 若枚举受权限限制（拿不到真实设备 id），刷新时顺带尝试解锁一次
    const restricted = await WebAudioPlayerEngine.isEnumerationRestricted().catch(() => false);
    if (restricted) await WebAudioPlayerEngine.requestDeviceLabelPermission();
    await refetch();
    refreshLabelState();
  };

  // 校验已保存的设备：若不存在则回退默认并持久化（对齐 LX getMediaDevice）
  const validateSavedDevice = () => {
    if (!supportsSelection) return;
    void WebAudioPlayerEngine.resolveOutputDevice(settings().audioOutputDeviceId).then(
      (resolved) => {
        if (resolved.missing) {
          apply({ audioOutputDeviceId: resolved.deviceId === 'default' ? '' : resolved.deviceId });
        }
      },
    );
  };

  onMount(() => {
    refreshLabelState();
    validateSavedDevice();
    const onDeviceChange = () => {
      void refetch();
      refreshLabelState();
      validateSavedDevice();
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    onCleanup(() =>
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange),
    );
  });

  // 设备列表刷新后再次确认标签可读性
  createEffect(() => {
    devices();
    refreshLabelState();
  });
  const custom = () => settings().eqCustomGains ?? EQ_PRESETS[settings().eqPreset];
  const updateBand = (index: number, value: number) => {
    const next = [...custom()];
    next[index] = value;
    apply({ eqCustomGains: next });
  };

  return (
    <div class={`space-y-5 text-sm ${props.embedded ? '' : 'p-4'}`}>
      <section class="space-y-3">
        <h2 class="text-base font-semibold">音频输出</h2>
        <p class="text-xs text-muted-foreground">选择声音输出的媒体设备。</p>
        <Show
          when={supportsSelection}
          fallback={<p class="text-muted-foreground">当前浏览器/WebView 不支持选择音频输出设备，将使用系统默认设备。</p>}
        >
          <div class="flex flex-wrap items-center gap-2">
            <MusicAppSelect
              value={settings().audioOutputDeviceId || 'default'}
              onChange={(value) =>
                apply({
                  audioOutputDeviceId: value === 'default' ? '' : value,
                  ...(value === 'default' ? {} : { audioUseMaxChannels: false }),
                })
              }
              options={[
                'default',
                ...(devices() ?? [])
                  .filter((d) => d.deviceId !== 'default')
                  .map((d) => d.deviceId),
              ]}
              optionLabel={(value) =>
                value === 'default'
                  ? '系统默认'
                  : devices()?.find((device) => device.deviceId === value)?.label ?? value
              }
              triggerClass="min-w-48"
              aria-label="音频输出设备"
            />
            <Button size="sm" variant="outline" onClick={() => void refreshDevices()}>刷新设备</Button>
          </div>
          <Show when={supportsEnumeration && (devices()?.length ?? 0) === 0}>
            <p class="text-xs text-warning-foreground">
              音频输出设备为空，若出现无法播放的情况，请检查声卡驱动是否已安装。将使用系统默认设备。
            </p>
          </Show>
          <Show when={supportsEnumeration && !labelsReadable() && (devices()?.length ?? 0) > 0}>
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-xs text-muted-foreground">
                浏览器未授权读取设备名称，当前仅显示占位名。授权后可显示真实设备名称以便识别。
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={requestingPermission()}
                onClick={() => void requestLabels()}
              >
                {requestingPermission() ? '授权中…' : '授权显示设备名称'}
              </Button>
            </div>
          </Show>
        </Show>
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="text-muted-foreground">自定义输出声道上限：</span>
            <NumberField
              rawValue={settings().audioMaxChannels}
              minValue={1}
              maxValue={32}
              disabled={settings().audioUseMaxChannels}
              onRawValueChange={(value) => apply({ audioMaxChannels: value })}
            >
              <NumberFieldInput class="w-20" aria-label="自定义输出声道上限" />
            </NumberField>
          </div>
          <p class="text-xs text-muted-foreground">
            启用上方“使用设备能处理的最大声道数”时由设备决定；关闭时使用此上限。
          </p>
        </div>
      </section>

      <section class="space-y-3 border-t pt-4">
        <h2 class="text-base font-semibold">Reader 扩展 · 音效与可视化</h2>
        <p class="text-xs text-muted-foreground">
          以下十段均衡器与播放详情频谱是 Reader 高级音频能力，不是 LX Music 2.12.2
          播放设置原项。
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-muted-foreground">均衡器：</span>
          <MusicAppSelect
            value={settings().eqCustomGains ? 'custom' : settings().eqPreset}
            onChange={(value) =>
              value === 'custom'
                ? apply({ eqCustomGains: [...EQ_PRESETS[settings().eqPreset]] })
                : apply({ eqPreset: value as keyof typeof EQ_PRESETS, eqCustomGains: null })
            }
            options={[...Object.keys(EQ_PRESETS), 'custom']}
            optionLabel={(value) =>
              value === 'custom' ? '自定义' : (MUSIC_EQ_PRESET_LABELS[value] ?? value)
            }
            triggerClass="w-56"
            aria-label="均衡器模式"
          />
          <Show when={settings().eqCustomGains}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => apply({ eqCustomGains: [...EQ_PRESETS.flat] })}
            >
              重置
            </Button>
          </Show>
        </div>
        <MusicEqualizerEditor gains={custom()} onChange={updateBand} />
        <div class="flex items-center gap-2">
          <Checkbox
            id="music-audio-visualization"
            checked={settings().audioVisualizationEnabled}
            onChange={(checked) => apply({ audioVisualizationEnabled: checked })}
          />
          <Label for="music-audio-visualization">在播放详情显示频谱可视化</Label>
        </div>
      </section>
    </div>
  );
};
