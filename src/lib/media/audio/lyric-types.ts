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

export function hasLyricContent(bundle: LyricBundle | null | undefined): boolean {
  if (!bundle) return false;
  return !!(bundle.lyric?.trim() || bundle.tlyric?.trim() || bundle.lxlyric?.trim());
}
