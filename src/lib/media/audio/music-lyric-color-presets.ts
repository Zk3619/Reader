/**
 * 歌词字体颜色风格预设（桌面歌词 / 播放详情共用）
 */

export type BuiltinMusicLyricColorPresetId =
  | 'system'
  | 'lx-classic'
  | 'aurora'
  | 'sunset'
  | 'neon-purple'
  | 'snow'
  | 'gold';

export type MusicLyricCustomPresetId = `custom:${string}`;
/** 临时自由编辑模式（不绑定已保存的个性预设） */
export type FreeEditLyricColorPresetId = 'custom';
export type MusicLyricColorPresetId =
  | BuiltinMusicLyricColorPresetId
  | FreeEditLyricColorPresetId
  | MusicLyricCustomPresetId;

export interface MusicLyricColorPreset {
  id: MusicLyricColorPresetId;
  name: string;
  playedColor: string;
  unplayedColor: string;
  unplayedShadowColor: string;
  playedShadowColor: string;
}

export interface MusicLyricCustomPreset extends MusicLyricColorPreset {
  id: MusicLyricCustomPresetId;
  unplayedShadow: boolean;
  playedShadow: boolean;
}

export type MusicLyricColorContext = 'play-detail' | 'desktop';

export interface MusicLyricResolvedColors {
  playedColor: string;
  unplayedColor: string;
  unplayedShadowColor: string;
  playedShadowColor: string;
  unplayedShadow: boolean;
  playedShadow: boolean;
}

/** @deprecated 历史桌面歌词经典白字默认，system 预设已统一为主题语义 */
export const DESKTOP_LYRIC_LEGACY_PLAYED = '#ffffff';
export const DESKTOP_LYRIC_LEGACY_UNPLAYED = 'rgba(255, 255, 255, 0.5)';

/** 播放详情系统默认：空字符串表示跟随主题 CSS 变量 */
export const PLAY_DETAIL_SYSTEM_PLAYED = '';
export const PLAY_DETAIL_SYSTEM_UNPLAYED = '';
export const PLAY_DETAIL_SYSTEM_UNPLAYED_SHADOW = 'rgba(0, 0, 0, 0.18)';
export const PLAY_DETAIL_SYSTEM_PLAYED_SHADOW = 'rgba(0, 0, 0, 0.28)';

/** 播放详情主题色预览/自定义初始值 */
export const PLAY_DETAIL_THEME_DISPLAY_PLAYED = 'hsl(var(--foreground))';
export const PLAY_DETAIL_THEME_DISPLAY_UNPLAYED = 'hsl(var(--muted-foreground) / 0.45)';

/** 桌面歌词 system 与播放详情 system 统一语义：跟随主题 */
export const DESKTOP_SYSTEM_PLAYED = PLAY_DETAIL_SYSTEM_PLAYED;
export const DESKTOP_SYSTEM_UNPLAYED = PLAY_DETAIL_SYSTEM_UNPLAYED;
export const DESKTOP_SYSTEM_UNPLAYED_SHADOW = PLAY_DETAIL_SYSTEM_UNPLAYED_SHADOW;
export const DESKTOP_SYSTEM_PLAYED_SHADOW = PLAY_DETAIL_SYSTEM_PLAYED_SHADOW;

export const BUILTIN_MUSIC_LYRIC_COLOR_PRESETS: MusicLyricColorPreset[] = [
  {
    id: 'system',
    name: '系统默认',
    playedColor: PLAY_DETAIL_THEME_DISPLAY_PLAYED,
    unplayedColor: PLAY_DETAIL_THEME_DISPLAY_UNPLAYED,
    unplayedShadowColor: DESKTOP_SYSTEM_UNPLAYED_SHADOW,
    playedShadowColor: DESKTOP_SYSTEM_PLAYED_SHADOW,
  },
  {
    id: 'lx-classic',
    name: '经典绿',
    playedColor: 'rgba(7, 197, 86, 1)',
    unplayedColor: 'rgba(255, 255, 255, 0.92)',
    unplayedShadowColor: 'rgba(0, 0, 0, 0.18)',
    playedShadowColor: 'rgba(0, 0, 0, 0.32)',
  },
  {
    id: 'aurora',
    name: '极光',
    playedColor: 'rgba(56, 232, 255, 1)',
    unplayedColor: 'rgba(220, 245, 255, 0.72)',
    unplayedShadowColor: 'rgba(12, 80, 120, 0.35)',
    playedShadowColor: 'rgba(0, 180, 220, 0.45)',
  },
  {
    id: 'sunset',
    name: '暮光',
    playedColor: 'rgba(255, 158, 92, 1)',
    unplayedColor: 'rgba(255, 236, 220, 0.75)',
    unplayedShadowColor: 'rgba(80, 32, 12, 0.32)',
    playedShadowColor: 'rgba(180, 60, 20, 0.42)',
  },
  {
    id: 'neon-purple',
    name: '霓虹紫',
    playedColor: 'rgba(232, 121, 249, 1)',
    unplayedColor: 'rgba(245, 230, 255, 0.7)',
    unplayedShadowColor: 'rgba(88, 28, 135, 0.38)',
    playedShadowColor: 'rgba(168, 85, 247, 0.48)',
  },
  {
    id: 'snow',
    name: '雪白',
    playedColor: 'rgba(255, 255, 255, 1)',
    unplayedColor: 'rgba(255, 255, 255, 0.55)',
    unplayedShadowColor: 'rgba(30, 41, 59, 0.42)',
    playedShadowColor: 'rgba(15, 23, 42, 0.55)',
  },
  {
    id: 'gold',
    name: '流金',
    playedColor: 'rgba(250, 204, 21, 1)',
    unplayedColor: 'rgba(254, 243, 199, 0.78)',
    unplayedShadowColor: 'rgba(92, 58, 8, 0.34)',
    playedShadowColor: 'rgba(146, 94, 12, 0.46)',
  },
];

export const MUSIC_LYRIC_COLOR_PRESETS = BUILTIN_MUSIC_LYRIC_COLOR_PRESETS;

export function isBuiltinLyricColorPresetId(
  id: string | undefined,
): id is BuiltinMusicLyricColorPresetId {
  return BUILTIN_MUSIC_LYRIC_COLOR_PRESETS.some((preset) => preset.id === id);
}

export function isCustomLyricColorPresetId(
  id: string | undefined,
): id is MusicLyricCustomPresetId {
  return typeof id === 'string' && id.startsWith('custom:');
}

export function isFreeEditLyricColorPresetId(
  id: string | undefined,
): id is FreeEditLyricColorPresetId {
  return id === 'custom';
}

export function getBuiltinLyricColorPreset(
  id: BuiltinMusicLyricColorPresetId | string | undefined,
): MusicLyricColorPreset {
  return (
    BUILTIN_MUSIC_LYRIC_COLOR_PRESETS.find((preset) => preset.id === id) ??
    BUILTIN_MUSIC_LYRIC_COLOR_PRESETS[0]!
  );
}

export function getMusicLyricColorPreset(
  id: MusicLyricColorPresetId | string | undefined,
  customPresets: readonly MusicLyricCustomPreset[] = [],
): MusicLyricColorPreset {
  if (isCustomLyricColorPresetId(id)) {
    const custom = customPresets.find((preset) => preset.id === id);
    if (custom) return custom;
  }
  return getBuiltinLyricColorPreset(id);
}

export function normalizeMusicLyricCustomPresets(
  input: unknown,
): MusicLyricCustomPreset[] {
  if (!Array.isArray(input)) return [];
  const next: MusicLyricCustomPreset[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    if (!isCustomLyricColorPresetId(id)) continue;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const playedColor = typeof row.playedColor === 'string' ? row.playedColor.trim() : '';
    const unplayedColor = typeof row.unplayedColor === 'string' ? row.unplayedColor.trim() : '';
    const unplayedShadowColor =
      typeof row.unplayedShadowColor === 'string'
        ? row.unplayedShadowColor.trim()
        : '';
    const playedShadowColor =
      typeof row.playedShadowColor === 'string'
        ? row.playedShadowColor.trim()
        : '';
    if (!name || !playedColor || !unplayedColor || !unplayedShadowColor || !playedShadowColor) {
      continue;
    }
    next.push({
      id,
      name,
      playedColor,
      unplayedColor,
      unplayedShadowColor,
      playedShadowColor,
      unplayedShadow: row.unplayedShadow === true,
      playedShadow: row.playedShadow === true,
    });
  }
  return next;
}

function createCustomPresetId(): MusicLyricCustomPresetId {
  const random = Math.random().toString(36).slice(2, 8);
  return `custom:${Date.now().toString(36)}${random}`;
}

export function createMusicLyricCustomPreset(
  name: string,
  colors: MusicLyricResolvedColors,
): MusicLyricCustomPreset {
  const trimmed = name.trim();
  return {
    id: createCustomPresetId(),
    name: trimmed || '自定义预设',
    playedColor: colors.playedColor,
    unplayedColor: colors.unplayedColor,
    unplayedShadowColor: colors.unplayedShadowColor,
    playedShadowColor: colors.playedShadowColor,
    unplayedShadow: colors.unplayedShadow,
    playedShadow: colors.playedShadow,
  };
}

type DesktopLyricColorPatch = Pick<
  import('@/lib/media/audio/music-settings').MusicSettings,
  | 'desktopLyricColorPreset'
  | 'desktopLyricPlayedColor'
  | 'desktopLyricUnplayedColor'
  | 'desktopLyricUnplayedShadowColor'
  | 'desktopLyricPlayedShadowColor'
  | 'desktopLyricUnplayedShadow'
  | 'desktopLyricPlayedShadow'
>;

type PlayDetailLyricColorPatch = Pick<
  import('@/lib/media/audio/music-settings').MusicSettings,
  | 'playDetailLyricColorPreset'
  | 'playDetailLyricPlayedColor'
  | 'playDetailLyricUnplayedColor'
  | 'playDetailLyricUnplayedShadowColor'
  | 'playDetailLyricPlayedShadowColor'
  | 'playDetailLyricUnplayedShadow'
  | 'playDetailLyricPlayedShadow'
>;

function resolvePlayDetailStoredColors(
  current?: Partial<PlayDetailLyricColorPatch>,
): MusicLyricResolvedColors {
  const played = current?.playDetailLyricPlayedColor?.trim() ?? '';
  const unplayed = current?.playDetailLyricUnplayedColor?.trim() ?? '';
  return {
    playedColor: played || PLAY_DETAIL_THEME_DISPLAY_PLAYED,
    unplayedColor: unplayed || PLAY_DETAIL_THEME_DISPLAY_UNPLAYED,
    unplayedShadowColor:
      current?.playDetailLyricUnplayedShadowColor?.trim() ||
      PLAY_DETAIL_SYSTEM_UNPLAYED_SHADOW,
    playedShadowColor:
      current?.playDetailLyricPlayedShadowColor?.trim() ||
      PLAY_DETAIL_SYSTEM_PLAYED_SHADOW,
    unplayedShadow: current?.playDetailLyricUnplayedShadow ?? false,
    playedShadow: current?.playDetailLyricPlayedShadow ?? false,
  };
}

function resolveDesktopStoredColors(
  current?: Partial<DesktopLyricColorPatch>,
): MusicLyricResolvedColors {
  const played = current?.desktopLyricPlayedColor?.trim() ?? '';
  const unplayed = current?.desktopLyricUnplayedColor?.trim() ?? '';
  return {
    playedColor: played || PLAY_DETAIL_THEME_DISPLAY_PLAYED,
    unplayedColor: unplayed || PLAY_DETAIL_THEME_DISPLAY_UNPLAYED,
    unplayedShadowColor:
      current?.desktopLyricUnplayedShadowColor?.trim() ||
      DESKTOP_SYSTEM_UNPLAYED_SHADOW,
    playedShadowColor:
      current?.desktopLyricPlayedShadowColor?.trim() ||
      DESKTOP_SYSTEM_PLAYED_SHADOW,
    unplayedShadow: current?.desktopLyricUnplayedShadow ?? false,
    playedShadow: current?.desktopLyricPlayedShadow ?? false,
  };
}

export function resolveLyricColorPresetPreview(
  context: MusicLyricColorContext,
  presetId: MusicLyricColorPresetId | string | undefined,
  current: Partial<DesktopLyricColorPatch & PlayDetailLyricColorPatch> | undefined,
  customPresets: readonly MusicLyricCustomPreset[] = [],
): MusicLyricResolvedColors {
  const id = presetId ?? 'system';

  if (id === 'system') {
    return {
      playedColor: PLAY_DETAIL_THEME_DISPLAY_PLAYED,
      unplayedColor: PLAY_DETAIL_THEME_DISPLAY_UNPLAYED,
      unplayedShadowColor: context === 'play-detail' ? PLAY_DETAIL_SYSTEM_UNPLAYED_SHADOW : DESKTOP_SYSTEM_UNPLAYED_SHADOW,
      playedShadowColor: context === 'play-detail' ? PLAY_DETAIL_SYSTEM_PLAYED_SHADOW : DESKTOP_SYSTEM_PLAYED_SHADOW,
      unplayedShadow: false,
      playedShadow: false,
    };
  }

  if (id === 'custom') {
    return context === 'play-detail'
      ? resolvePlayDetailStoredColors(current)
      : resolveDesktopStoredColors(current);
  }

  if (isCustomLyricColorPresetId(id)) {
    const custom = customPresets.find((preset) => preset.id === id);
    if (custom) {
      return {
        playedColor: custom.playedColor,
        unplayedColor: custom.unplayedColor,
        unplayedShadowColor: custom.unplayedShadowColor,
        playedShadowColor: custom.playedShadowColor,
        unplayedShadow: custom.unplayedShadow,
        playedShadow: custom.playedShadow,
      };
    }
    return context === 'play-detail'
      ? resolvePlayDetailStoredColors(current)
      : resolveDesktopStoredColors(current);
  }

  const preset = getBuiltinLyricColorPreset(id);
  return {
    playedColor: preset.playedColor,
    unplayedColor: preset.unplayedColor,
    unplayedShadowColor: preset.unplayedShadowColor,
    playedShadowColor: preset.playedShadowColor,
    unplayedShadow: true,
    playedShadow: true,
  };
}

export function desktopLyricColorPatchFromPreset(
  presetId: MusicLyricColorPresetId,
  current?: Partial<DesktopLyricColorPatch>,
  customPresets: readonly MusicLyricCustomPreset[] = [],
): DesktopLyricColorPatch {
  if (presetId === 'system') {
    return {
      desktopLyricColorPreset: 'system',
      desktopLyricPlayedColor: DESKTOP_SYSTEM_PLAYED,
      desktopLyricUnplayedColor: DESKTOP_SYSTEM_UNPLAYED,
      desktopLyricUnplayedShadowColor: DESKTOP_SYSTEM_UNPLAYED_SHADOW,
      desktopLyricPlayedShadowColor: DESKTOP_SYSTEM_PLAYED_SHADOW,
      desktopLyricUnplayedShadow: false,
      desktopLyricPlayedShadow: false,
    };
  }
  if (presetId === 'custom') {
    const resolved = resolveDesktopStoredColors(current);
    return {
      desktopLyricColorPreset: 'custom',
      desktopLyricPlayedColor: resolved.playedColor,
      desktopLyricUnplayedColor: resolved.unplayedColor,
      desktopLyricUnplayedShadowColor: resolved.unplayedShadowColor,
      desktopLyricPlayedShadowColor: resolved.playedShadowColor,
      desktopLyricUnplayedShadow: resolved.unplayedShadow,
      desktopLyricPlayedShadow: resolved.playedShadow,
    };
  }
  if (isCustomLyricColorPresetId(presetId)) {
    const custom = customPresets.find((preset) => preset.id === presetId);
    if (custom) {
      return {
        desktopLyricColorPreset: custom.id,
        desktopLyricPlayedColor: custom.playedColor,
        desktopLyricUnplayedColor: custom.unplayedColor,
        desktopLyricUnplayedShadowColor: custom.unplayedShadowColor,
        desktopLyricPlayedShadowColor: custom.playedShadowColor,
        desktopLyricUnplayedShadow: custom.unplayedShadow,
        desktopLyricPlayedShadow: custom.playedShadow,
      };
    }
    return desktopLyricColorPatchFromPreset('system', current, customPresets);
  }
  const preset = getBuiltinLyricColorPreset(presetId);
  return {
    desktopLyricColorPreset: preset.id,
    desktopLyricPlayedColor: preset.playedColor,
    desktopLyricUnplayedColor: preset.unplayedColor,
    desktopLyricUnplayedShadowColor: preset.unplayedShadowColor,
    desktopLyricPlayedShadowColor: preset.playedShadowColor,
    desktopLyricUnplayedShadow: true,
    desktopLyricPlayedShadow: true,
  };
}

export function playDetailLyricColorPatchFromPreset(
  presetId: MusicLyricColorPresetId,
  current?: Partial<PlayDetailLyricColorPatch>,
  customPresets: readonly MusicLyricCustomPreset[] = [],
): PlayDetailLyricColorPatch {
  if (presetId === 'system') {
    return {
      playDetailLyricColorPreset: 'system',
      playDetailLyricPlayedColor: PLAY_DETAIL_SYSTEM_PLAYED,
      playDetailLyricUnplayedColor: PLAY_DETAIL_SYSTEM_UNPLAYED,
      playDetailLyricUnplayedShadowColor: PLAY_DETAIL_SYSTEM_UNPLAYED_SHADOW,
      playDetailLyricPlayedShadowColor: PLAY_DETAIL_SYSTEM_PLAYED_SHADOW,
      playDetailLyricUnplayedShadow: false,
      playDetailLyricPlayedShadow: false,
    };
  }
  if (presetId === 'custom') {
    const resolved = resolvePlayDetailStoredColors(current);
    return {
      playDetailLyricColorPreset: 'custom',
      playDetailLyricPlayedColor: resolved.playedColor,
      playDetailLyricUnplayedColor: resolved.unplayedColor,
      playDetailLyricUnplayedShadowColor: resolved.unplayedShadowColor,
      playDetailLyricPlayedShadowColor: resolved.playedShadowColor,
      playDetailLyricUnplayedShadow: resolved.unplayedShadow,
      playDetailLyricPlayedShadow: resolved.playedShadow,
    };
  }
  if (isCustomLyricColorPresetId(presetId)) {
    const custom = customPresets.find((preset) => preset.id === presetId);
    if (custom) {
      return {
        playDetailLyricColorPreset: custom.id,
        playDetailLyricPlayedColor: custom.playedColor,
        playDetailLyricUnplayedColor: custom.unplayedColor,
        playDetailLyricUnplayedShadowColor: custom.unplayedShadowColor,
        playDetailLyricPlayedShadowColor: custom.playedShadowColor,
        playDetailLyricUnplayedShadow: custom.unplayedShadow,
        playDetailLyricPlayedShadow: custom.playedShadow,
      };
    }
    return playDetailLyricColorPatchFromPreset('system', current, customPresets);
  }
  const preset = getBuiltinLyricColorPreset(presetId);
  return {
    playDetailLyricColorPreset: preset.id,
    playDetailLyricPlayedColor: preset.playedColor,
    playDetailLyricUnplayedColor: preset.unplayedColor,
    playDetailLyricUnplayedShadowColor: preset.unplayedShadowColor,
    playDetailLyricPlayedShadowColor: preset.playedShadowColor,
    playDetailLyricUnplayedShadow: true,
    playDetailLyricPlayedShadow: true,
  };
}
