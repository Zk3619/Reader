/**
 * 每曲播放进度（legacy localStorage，与 music.session 双写兼容）
 */

export const MUSIC_TRACK_PROGRESS_STORAGE_KEY = 'reader_music_track_progress';

export function musicTrackProgressKey(source: string, id: string): string {
  return `${source}:${id}`;
}

export function readMusicTrackProgress(trackKey: string): number {
  if (typeof localStorage === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(MUSIC_TRACK_PROGRESS_STORAGE_KEY);
    const value = raw
      ? Number((JSON.parse(raw) as Record<string, number>)[trackKey])
      : 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function saveMusicTrackProgress(trackKey: string, positionSec: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(MUSIC_TRACK_PROGRESS_STORAGE_KEY);
    const progress = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    progress[trackKey] = Math.max(0, positionSec);
    localStorage.setItem(MUSIC_TRACK_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // ignore
  }
}

export function clearMusicTrackProgress(trackKey: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(MUSIC_TRACK_PROGRESS_STORAGE_KEY);
    if (!raw) return;
    const progress = JSON.parse(raw) as Record<string, number>;
    if (!(trackKey in progress)) return;
    delete progress[trackKey];
    localStorage.setItem(MUSIC_TRACK_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // ignore
  }
}

/**
 * 切到新曲时的起播秒数：不得沿用上一曲进度（否则列表循环会在曲末无限切歌）。
 * - 同曲重取链：保留当前进度（但若已在曲末则归零，避免立刻再 ended）
 * - 新曲：记忆进度开启则读该曲 LS，否则 0
 */
export function resolveMusicTrackStartPositionSec(options: {
  sameTrack: boolean;
  rememberProgress: boolean;
  trackKey: string;
  currentPositionSec: number;
  /** 已知时长时，贴近曲末的记忆进度视为已播完 */
  durationSec?: number;
}): number {
  let pos = 0;
  if (options.sameTrack) {
    pos = Math.max(0, options.currentPositionSec || 0);
  } else if (options.rememberProgress) {
    pos = readMusicTrackProgress(options.trackKey);
  }
  const dur = options.durationSec;
  if (dur != null && Number.isFinite(dur) && dur > 1 && pos >= Math.max(0, dur - 2)) {
    return 0;
  }
  return pos;
}
