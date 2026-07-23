/**
 * 桌面 libmpv / 外置 mpv 简易均衡器预置（E2.5）
 */

export type AudioEqPreset = 'off' | 'bass' | 'treble' | 'voice';

export const AUDIO_EQ_PRESET_OPTIONS: AudioEqPreset[] = [
  'off',
  'bass',
  'treble',
  'voice',
];

export const AUDIO_EQ_PRESET_LABELS: Record<AudioEqPreset, string> = {
  off: 'Off',
  bass: 'Bass',
  treble: 'Treble',
  voice: 'Voice',
};

const AF_BY_PRESET: Record<Exclude<AudioEqPreset, 'off'>, string> = {
  bass: 'lavfi=[equalizer=f=100:width_type=h:width=200:g=6]',
  treble: 'lavfi=[equalizer=f=3000:width_type=h:width=2000:g=4]',
  voice: 'lavfi=[equalizer=f=1000:width_type=h:width=800:g=5]',
};

export function coerceAudioEqPreset(v: unknown): AudioEqPreset {
  if (v === 'off' || v === 'bass' || v === 'treble' || v === 'voice') return v;
  return 'off';
}

/** 返回 mpv `af` 字符串；off → null（清空） */
export function audioEqPresetToAf(preset: AudioEqPreset): string | null {
  if (preset === 'off') return null;
  return AF_BY_PRESET[preset];
}
