/**
 * 影视迷你窗位置：viewport 左上角坐标，持久化到 localStorage
 */

const STORAGE_KEY = 'reader.tv.miniPlayerPos.v1';
const MARGIN = 8;

export type TvMiniPlayerPos = { left: number; top: number };

export function loadTvMiniPlayerPos(): TvMiniPlayerPos | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<TvMiniPlayerPos>;
    const left = Number(j.left);
    const top = Number(j.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
    return { left, top };
  } catch {
    return null;
  }
}

export function saveTvMiniPlayerPos(pos: TvMiniPlayerPos): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch {
    /* */
  }
}

/** 将窗口矩形钳在可视区内 */
export function clampTvMiniPlayerPos(
  left: number,
  top: number,
  width: number,
  height: number,
): TvMiniPlayerPos {
  const vw = typeof window !== 'undefined' ? window.innerWidth : width;
  const vh = typeof window !== 'undefined' ? window.innerHeight : height;
  const maxL = Math.max(MARGIN, vw - width - MARGIN);
  const maxT = Math.max(MARGIN, vh - height - MARGIN);
  return {
    left: Math.min(maxL, Math.max(MARGIN, left)),
    top: Math.min(maxT, Math.max(MARGIN, top)),
  };
}
