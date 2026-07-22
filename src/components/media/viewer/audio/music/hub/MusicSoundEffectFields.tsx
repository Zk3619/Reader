/**
 * 环境音 / 环绕调节字段（设置页与播放详情弹窗共用）
 * 数值仅在失焦/提交时做 min/max 校验。
 */

import { Show, type Component } from 'solid-js';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { MusicAppSelect } from '@/components/media/viewer/audio/music/MusicAppSelect';
import { MusicSettingsNumberInput } from '@/components/media/viewer/audio/music/settings/MusicSettingsNumberInput';
import {
  SOUND_CONVOLUTION_PRESETS,
  SOUND_CONVOLUTION_PRESET_LABELS,
  type SoundConvolutionPreset,
} from '@/lib/media/audio/engine/web-audio-player';
import { defaultGainsForConvolutionPreset } from '@/lib/media/audio/engine/convolution-presets';
import { getMusicSettings } from '@/lib/media/audio/music-settings';

export type MusicSoundEffectDraft = {
  soundConvolutionPreset: SoundConvolutionPreset;
  soundConvolutionMainGain: number;
  soundConvolutionSendGain: number;
  soundPannerEnabled: boolean;
  soundPannerSpeed: number;
};

export function readMusicSoundEffectDraft(): MusicSoundEffectDraft {
  const s = getMusicSettings();
  return {
    soundConvolutionPreset: s.soundConvolutionPreset ?? 'off',
    soundConvolutionMainGain: s.soundConvolutionMainGain ?? 0.75,
    soundConvolutionSendGain: s.soundConvolutionSendGain ?? 0.35,
    soundPannerEnabled: s.soundPannerEnabled === true,
    soundPannerSpeed: s.soundPannerSpeed ?? 1,
  };
}

export interface MusicSoundEffectFieldsProps {
  value: MusicSoundEffectDraft;
  onChange: (next: MusicSoundEffectDraft) => void;
  /** Checkbox / Label id 前缀，避免同页多实例冲突 */
  idPrefix?: string;
}

export const MusicSoundEffectFields: Component<MusicSoundEffectFieldsProps> = (props) => {
  const idPrefix = () => props.idPrefix ?? 'music-sound-effect';
  const patch = (partial: Partial<MusicSoundEffectDraft>) => {
    props.onChange({ ...props.value, ...partial });
  };

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap items-center gap-2">
        <span class="shrink-0 text-sm text-muted-foreground">环境混响：</span>
        <MusicAppSelect
          value={props.value.soundConvolutionPreset}
          onChange={(value) => {
            const preset = value as SoundConvolutionPreset;
            if (preset === 'off') {
              patch({ soundConvolutionPreset: 'off' });
              return;
            }
            const gains = defaultGainsForConvolutionPreset(preset);
            patch({
              soundConvolutionPreset: preset,
              soundConvolutionMainGain: gains.mainGain,
              soundConvolutionSendGain: gains.sendGain,
            });
          }}
          options={[...SOUND_CONVOLUTION_PRESETS]}
          optionLabel={(value) =>
            value === 'off'
              ? '关闭'
              : SOUND_CONVOLUTION_PRESET_LABELS[
                  value as Exclude<SoundConvolutionPreset, 'off'>
                ]
          }
          triggerClass="w-48"
          aria-label="环境混响"
        />
      </div>
      <Show when={props.value.soundConvolutionPreset !== 'off'}>
        <div class="flex flex-wrap items-center gap-4">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm text-muted-foreground">原始增益：</span>
            <MusicSettingsNumberInput
              value={props.value.soundConvolutionMainGain}
              min={0}
              max={5}
              step={0.1}
              aria-label="原始音频增益"
              onCommit={(value) => patch({ soundConvolutionMainGain: value })}
            />
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm text-muted-foreground">环境增益：</span>
            <MusicSettingsNumberInput
              value={props.value.soundConvolutionSendGain}
              min={0}
              max={5}
              step={0.1}
              aria-label="环境音效增益"
              onCommit={(value) => patch({ soundConvolutionSendGain: value })}
            />
          </div>
        </div>
      </Show>
      <p class="text-xs text-muted-foreground">
        增益对齐 LX convolutions 表；优先加载 public/music-ir 下 WAV，否则程序化 IR。
      </p>
      <div class="flex items-center gap-2">
        <Checkbox
          id={`${idPrefix()}-panner`}
          checked={props.value.soundPannerEnabled}
          onChange={(checked) => patch({ soundPannerEnabled: checked })}
        />
        <Label for={`${idPrefix()}-panner`}>环绕声像</Label>
      </div>
      <Show when={props.value.soundPannerEnabled}>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm text-muted-foreground">环绕速度：</span>
          <MusicSettingsNumberInput
            value={props.value.soundPannerSpeed}
            min={0.5}
            max={2}
            step={0.1}
            aria-label="环绕速度"
            onCommit={(value) => patch({ soundPannerSpeed: value })}
          />
        </div>
      </Show>
    </div>
  );
};
