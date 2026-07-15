import { createResource, createSignal, For, Show, type Component } from 'solid-js';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider, SliderFill, SliderThumb, SliderTrack } from '@/components/ui/slider';
import { NumberField, NumberFieldInput } from '@/components/ui/number-field';
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';
import { EQ_PRESETS, WebAudioPlayerEngine } from '@/lib/media/audio/engine/web-audio-player';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';

const EQ_FREQUENCIES = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
const EQ_PRESET_LABELS: Record<string, string> = {
  flat: '平直（保持原声）',
  pop: '流行（突出人声与节奏）',
  rock: '摇滚（增强低频与高频）',
  jazz: '爵士（温暖通透）',
  classical: '古典（扩展动态与细节）',
};

export interface MusicSettingsAudioOutputProps {
  embedded?: boolean;
}

export const MusicSettingsAudioOutput: Component<MusicSettingsAudioOutputProps> = (props) => {
  const [settings, setLocal] = createSignal(getMusicSettings());
  const [devices, { refetch }] = createResource(() =>
    WebAudioPlayerEngine.enumerateOutputDevices().catch(() => []),
  );
  const apply = (patch: Parameters<typeof setMusicSettings>[0]) => {
    setMusicSettings(patch);
    setLocal(getMusicSettings());
  };
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
          when={WebAudioPlayerEngine.supportsOutputSelection()}
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
              options={['default', ...(devices() ?? []).filter((d) => d.deviceId !== 'default').map((d) => d.deviceId)]}
              optionLabel={(value) =>
                value === 'default'
                  ? '系统默认'
                  : devices()?.find((device) => device.deviceId === value)?.label ?? value
              }
              triggerClass="min-w-48"
              aria-label="音频输出设备"
            />
            <Button size="sm" variant="outline" onClick={() => void refetch()}>刷新设备</Button>
          </div>
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
              value === 'custom' ? '自定义' : (EQ_PRESET_LABELS[value] ?? value)
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
        <div class="grid grid-cols-5 gap-x-3 gap-y-5 lg:grid-cols-10">
          <For each={EQ_FREQUENCIES}>
            {(frequency, index) => (
              <label class="flex min-w-0 flex-col items-center gap-2 text-center text-xs text-muted-foreground">
                <span>{frequency}Hz</span>
                <Slider
                  orientation="vertical"
                  class="h-36 w-5 flex-col"
                  minValue={-12}
                  maxValue={12}
                  step={0.5}
                  value={[custom()[index()] ?? 0]}
                  onChange={(value) => updateBand(index(), value[0] ?? 0)}
                  aria-label={`${frequency}Hz 增益`}
                >
                  <SliderTrack class="h-full w-2">
                    <SliderFill class="h-auto w-full" />
                    <SliderThumb class="top-auto left-[-6px]" />
                  </SliderTrack>
                </Slider>
                <span class="tabular-nums">{(custom()[index()] ?? 0).toFixed(1)} dB</span>
              </label>
            )}
          </For>
        </div>
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
