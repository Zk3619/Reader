/**
 * 逐曲歌词偏移（对齐 LX lyrics_edited 按曲持久化）
 * 有效偏移 = 全局 lyricOffset + 曲目偏移
 */

export const MUSIC_LYRIC_OFFSET_STORAGE_KEY = 'reader_music_lyric_offset_by_track';

type TrackLyricOffsetListener = () => void;
const listeners = new Set<TrackLyricOffsetListener>();

export function musicLyricOffsetTrackKey(source: string, id: string): string {
  return `${source}:${id}`;
}

function notifyListeners(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

/** 曲目偏移变更时通知（同窗 UI 重算有效偏移） */
export function subscribeTrackLyricOffset(listener: TrackLyricOffsetListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readMap(): Record<string, number> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(MUSIC_LYRIC_OFFSET_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = Number(v);
      if (Number.isFinite(n) && n !== 0) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, number>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MUSIC_LYRIC_OFFSET_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
  notifyListeners();
}

export function getTrackLyricOffsetSec(trackKey: string): number {
  const n = readMap()[trackKey];
  return Number.isFinite(n) ? n : 0;
}

export function setTrackLyricOffsetSec(trackKey: string, offsetSec: number): void {
  const map = readMap();
  const next = Math.round(offsetSec * 100) / 100;
  if (!Number.isFinite(next) || next === 0) {
    delete map[trackKey];
  } else {
    map[trackKey] = Math.max(-30, Math.min(30, next));
  }
  writeMap(map);
}

export function clearTrackLyricOffsetSec(trackKey: string): void {
  const map = readMap();
  if (!(trackKey in map)) return;
  delete map[trackKey];
  writeMap(map);
}

/** 全局偏移 + 曲目偏移 */
export function resolveEffectiveLyricOffsetSec(
  globalOffsetSec: number,
  trackKey: string | null | undefined,
): number {
  const global = Number.isFinite(globalOffsetSec) ? globalOffsetSec : 0;
  if (!trackKey) return global;
  return global + getTrackLyricOffsetSec(trackKey);
}
