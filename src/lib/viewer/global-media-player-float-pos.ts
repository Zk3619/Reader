/**
 * 全局播放窗 · 悬浮模式位置/贴边（纯计算，无 I/O）
 * 持久化由 settings.json → app_settings.mediaPlayerFloat 承担。
 */

export const GMP_FLOAT_MARGIN = 12;
/** 松手时判定贴边的阈值（px） */
export const GMP_FLOAT_EDGE_THRESHOLD = 32;
/** 收起后露出的窥视宽度（px） */
export const GMP_FLOAT_PEEK_PX = 28;

export type GmpFloatPos = { left: number; top: number };
export type GmpFloatEdge = 'none' | 'left' | 'right' | 'top' | 'bottom';

/** 写入 settings.json / app_settings 的快照 */
export type MediaPlayerFloatState = {
  left: number;
  top: number;
  edge: GmpFloatEdge;
};

const LEGACY_POS_KEY = 'reader.gmp.floatPos.v1';
const LEGACY_EDGE_KEY = 'reader.gmp.floatEdge.v1';

export function normalizeGmpFloatEdge(value: unknown): GmpFloatEdge {
  if (value === 'left' || value === 'right' || value === 'top' || value === 'bottom') {
    return value;
  }
  return 'none';
}

export function normalizeMediaPlayerFloat(value: unknown): MediaPlayerFloatState | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const left = Number(v.left);
  const top = Number(v.top);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return undefined;
  return {
    left,
    top,
    edge: normalizeGmpFloatEdge(v.edge),
  };
}

/** 一次性从旧 localStorage 迁移，并清除 LS 键 */
export function consumeLegacyGmpFloatLocalStorage(): MediaPlayerFloatState | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    const rawPos = localStorage.getItem(LEGACY_POS_KEY);
    const rawEdge = localStorage.getItem(LEGACY_EDGE_KEY);
    localStorage.removeItem(LEGACY_POS_KEY);
    localStorage.removeItem(LEGACY_EDGE_KEY);
    if (!rawPos) return undefined;
    const j = JSON.parse(rawPos) as Partial<GmpFloatPos>;
    const left = Number(j.left);
    const top = Number(j.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) return undefined;
    return {
      left,
      top,
      edge: normalizeGmpFloatEdge(rawEdge),
    };
  } catch {
    try {
      localStorage.removeItem(LEGACY_POS_KEY);
      localStorage.removeItem(LEGACY_EDGE_KEY);
    } catch {
      /* ignore */
    }
    return undefined;
  }
}

function viewportSize(fallbackW: number, fallbackH: number): { vw: number; vh: number } {
  if (typeof window === 'undefined') {
    return {
      vw: Math.max(fallbackW + GMP_FLOAT_MARGIN * 2, 1280),
      vh: Math.max(fallbackH + GMP_FLOAT_MARGIN * 2, 800),
    };
  }
  return { vw: window.innerWidth, vh: window.innerHeight };
}

export function clampGmpFloatPos(
  left: number,
  top: number,
  width: number,
  height: number,
): GmpFloatPos {
  const { vw, vh } = viewportSize(width, height);
  const maxL = Math.max(GMP_FLOAT_MARGIN, vw - width - GMP_FLOAT_MARGIN);
  const maxT = Math.max(GMP_FLOAT_MARGIN, vh - height - GMP_FLOAT_MARGIN);
  return {
    left: Math.min(maxL, Math.max(GMP_FLOAT_MARGIN, left)),
    top: Math.min(maxT, Math.max(GMP_FLOAT_MARGIN, top)),
  };
}

/** 默认：水平居中、靠顶但离开贴边阈值，避免一挂载就处于可收起区 */
export function defaultGmpFloatPos(width: number, height: number): GmpFloatPos {
  const { vw } = viewportSize(width, height);
  const top = GMP_FLOAT_EDGE_THRESHOLD + GMP_FLOAT_MARGIN + 16;
  return clampGmpFloatPos((vw - width) / 2, top, width, height);
}

export function detectGmpFloatEdge(
  left: number,
  top: number,
  width: number,
  height: number,
): GmpFloatEdge {
  const { vw, vh } = viewportSize(width, height);
  const dist = {
    left,
    right: vw - (left + width),
    top,
    bottom: vh - (top + height),
  } as const;
  let best: GmpFloatEdge = 'none';
  let bestDist = GMP_FLOAT_EDGE_THRESHOLD;
  (['left', 'right', 'top', 'bottom'] as const).forEach((side) => {
    if (dist[side] <= bestDist) {
      bestDist = dist[side];
      best = side;
    }
  });
  return best;
}

/** 始终取最近边（收起按钮用，不要求进入贴边阈值） */
export function nearestGmpFloatEdge(
  left: number,
  top: number,
  width: number,
  height: number,
): Exclude<GmpFloatEdge, 'none'> {
  const { vw, vh } = viewportSize(width, height);
  const dist = {
    left,
    right: vw - (left + width),
    top,
    bottom: vh - (top + height),
  } as const;
  let best: Exclude<GmpFloatEdge, 'none'> = 'right';
  let bestDist = Number.POSITIVE_INFINITY;
  (['left', 'right', 'top', 'bottom'] as const).forEach((side) => {
    if (dist[side] < bestDist) {
      bestDist = dist[side];
      best = side;
    }
  });
  return best;
}

export function snapGmpFloatToEdge(
  pos: GmpFloatPos,
  edge: GmpFloatEdge,
  width: number,
  height: number,
): GmpFloatPos {
  const { vw, vh } = viewportSize(width, height);
  switch (edge) {
    case 'left':
      return clampGmpFloatPos(GMP_FLOAT_MARGIN, pos.top, width, height);
    case 'right':
      return clampGmpFloatPos(vw - width - GMP_FLOAT_MARGIN, pos.top, width, height);
    case 'top':
      return clampGmpFloatPos(pos.left, GMP_FLOAT_MARGIN, width, height);
    case 'bottom':
      return clampGmpFloatPos(pos.left, vh - height - GMP_FLOAT_MARGIN, width, height);
    default:
      return clampGmpFloatPos(pos.left, pos.top, width, height);
  }
}

/**
 * 将坐标推离贴边阈值，避免展开后仍停在可自动收起区（轻微拖动又收起 / 看起来像丢失）。
 */
export function nudgeGmpFloatOffEdge(
  pos: GmpFloatPos,
  width: number,
  height: number,
): GmpFloatPos {
  const detected = detectGmpFloatEdge(pos.left, pos.top, width, height);
  if (detected === 'none') {
    return clampGmpFloatPos(pos.left, pos.top, width, height);
  }
  const safe = GMP_FLOAT_EDGE_THRESHOLD + GMP_FLOAT_MARGIN + 8;
  const { vw, vh } = viewportSize(width, height);
  let left = pos.left;
  let top = pos.top;
  if (detected === 'left') left = safe;
  else if (detected === 'right') left = vw - width - safe;
  else if (detected === 'top') top = safe;
  else if (detected === 'bottom') top = vh - height - safe;
  return clampGmpFloatPos(left, top, width, height);
}

export function gmpFloatEdgeHiddenOffset(
  edge: GmpFloatEdge,
  width: number,
  height: number,
): { x: number; y: number } {
  const peek = GMP_FLOAT_PEEK_PX;
  switch (edge) {
    case 'left':
      return { x: -(Math.max(0, width - peek)), y: 0 };
    case 'right':
      return { x: Math.max(0, width - peek), y: 0 };
    case 'top':
      return { x: 0, y: -(Math.max(0, height - peek)) };
    case 'bottom':
      return { x: 0, y: Math.max(0, height - peek) };
    default:
      return { x: 0, y: 0 };
  }
}
