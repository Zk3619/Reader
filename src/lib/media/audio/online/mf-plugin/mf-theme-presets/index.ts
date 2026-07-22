import { SAKURA_THEME_PRESET } from '@/lib/media/audio/online/mf-plugin/mf-theme-presets/sakura';
import type { MfThemePreset } from '@/lib/media/audio/online/mf-plugin/mf-theme-presets/types';

export type { MfThemeEffect, MfThemePreset, MfThemeIframeMap, MfThemeIframeSlot } from '@/lib/media/audio/online/mf-plugin/mf-theme-presets/types';

const BUILTIN: readonly MfThemePreset[] = [SAKURA_THEME_PRESET];

const presetMap = new Map(BUILTIN.map((p) => [p.id, p]));

export function listMfBuiltinThemePresets(): readonly MfThemePreset[] {
  return BUILTIN;
}

export function getMfBuiltinThemePreset(id: string): MfThemePreset | null {
  return presetMap.get(id) ?? null;
}
