/**
 * 多轨歌词与音质类型（对齐 lx-music）
 */

export type MusicQuality = '128k' | '192k' | '320k' | 'flac' | 'flac24bit' | 'ape' | 'wav';

export const TRY_QUALITYS_LIST: MusicQuality[] = ['flac24bit', 'flac', '320k', '128k'];

export type LyricTrackKind = 'lyric' | 'tlyric' | 'rlyric' | 'lxlyric';

export interface LyricBundle {
  lyric?: string | null;
  tlyric?: string | null;
  rlyric?: string | null;
  lxlyric?: string | null;
}

export function pickLyricText(
  bundle: LyricBundle | null | undefined,
  kind: LyricTrackKind = 'lyric',
): string | null {
  if (!bundle) return null;
  const text = bundle[kind] ?? bundle.lyric;
  return text?.trim() ? text : null;
}

/** 是否含逐字时间标签 `<offset,duration>` */
export function hasLxWordTags(text?: string | null): boolean {
  return !!text && /<\d+(?:\.\d+)?,\d+(?:\.\d+)?>/.test(text);
}

/**
 * 对齐 lx `player.isPlayLxlrc`：开启卡拉 OK 且存在真实逐字轨时，
 * 原文/逐字主轨优先使用 lxlyric；翻译/罗马音主轨保持用户选择。
 * 无逐字轨时仍返回原文，由歌词面板按句时长均分逐字（降级扫光）。
 */
export function resolveEffectiveLyricTrack(
  bundle: LyricBundle | null | undefined,
  track: LyricTrackKind,
  useLxLyric: boolean,
): LyricTrackKind {
  if (track === 'tlyric' || track === 'rlyric') return track;
  if (useLxLyric && hasLxWordTags(bundle?.lxlyric)) return 'lxlyric';
  if (track === 'lxlyric') return 'lyric';
  return track;
}

export function hasLyricContent(bundle: LyricBundle | null | undefined): boolean {
  if (!bundle) return false;
  return !!(bundle.lyric?.trim() || bundle.tlyric?.trim() || bundle.lxlyric?.trim());
}
