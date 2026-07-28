/**
 * 弹幕轨道选择
 *
 * 1) 优先：空隙 / 可复用行中随机取轨，不偏移（对齐防重叠占轨）
 * 2) 仅当无空轨且允许重叠（antiOverlap=false）时：叠到已有轨道，并轻微上下偏移
 *
 * 较少/正常/较多通过行距与水平复用松紧拉开同屏密度；重叠关闭防重叠。
 */

export type DanmuTopVisible = {
  top: number;
  left?: number;
  right: number;
  height: number;
  width?: number;
  speed: number;
  distance: number;
  time?: number;
  mode: number;
};

/** 与 prefs.danmakuDensity 对齐 */
export type DanmuTopDensity = 'less' | 'normal' | 'more';

export type DensityPacking = {
  /** 行距倍数：越大同屏行越少 */
  laneScale: number;
  /** 水平复用宽松度：越大越容易跟轨 */
  reuseSlack: number;
};

export function densityPacking(density: DanmuTopDensity = 'normal'): DensityPacking {
  switch (density) {
    case 'less':
      return { laneScale: 1.55, reuseSlack: 0.45 };
    case 'more':
      return { laneScale: 0.82, reuseSlack: 1.55 };
    case 'normal':
    default:
      return { laneScale: 1.12, reuseSlack: 1 };
  }
}

export type PickDanmuTopInput = {
  target: { mode: number; height: number; speed: number };
  visibles: DanmuTopVisible[];
  clientWidth: number;
  clientHeight: number;
  marginBottom: number;
  marginTop: number;
  /** true=严格防重叠；false=无空轨时允许叠轨+微偏（密度「重叠」） */
  antiOverlap: boolean;
  /** 影响行距 / 水平复用；默认 normal */
  density?: DanmuTopDensity;
};

function canReuseTrack(
  list: DanmuTopVisible[],
  target: { speed: number },
  clientWidth: number,
  reuseSlack: number,
): boolean {
  const slack = Math.max(0.2, reuseSlack);
  return list.every((danmu) => {
    if (clientWidth < danmu.distance) return false;
    if (target.speed < danmu.speed) return true;
    const denom = target.speed - danmu.speed;
    if (denom <= 0) return true;
    const overlapTime = danmu.right / denom;
    const rest = danmu.time ?? 0;
    // slack 越小越难复用（较少）；越大越易跟轨（较多）
    return overlapTime > rest / slack;
  });
}

function collectGapTops(
  occupied: Array<{ top: number; height: number }>,
  laneStep: number,
  mode: number,
): number[] {
  const gaps: number[] = [];
  const pushLanes = (from: number, to: number) => {
    const h = Math.max(1, laneStep);
    for (let y = from; y + h <= to + 0.5; y += h) {
      gaps.push(y);
    }
  };
  if (mode === 2) {
    for (let index = occupied.length - 2; index >= 0; index -= 1) {
      const item = occupied[index]!;
      const prev = occupied[index + 1]!;
      const itemBottom = item.top + item.height;
      if (prev.top - itemBottom >= laneStep) {
        pushLanes(itemBottom, prev.top);
      }
    }
  } else {
    for (let index = 1; index < occupied.length; index += 1) {
      const item = occupied[index]!;
      const prev = occupied[index - 1]!;
      const prevBottom = prev.top + prev.height;
      if (item.top - prevBottom >= laneStep) {
        pushLanes(prevBottom, item.top);
      }
    }
  }
  return gaps;
}

function laneGridTops(
  marginTop: number,
  maxTop: number,
  laneStep: number,
): number[] {
  const h = Math.max(8, laneStep);
  const out: number[] = [];
  for (let y = marginTop; y + h <= maxTop + 0.5; y += h) {
    out.push(y);
  }
  if (!out.length) out.push(marginTop);
  return out;
}

function uniqNear(values: number[], eps = 0.5): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    if (!out.length || Math.abs(out[out.length - 1]! - v) > eps) out.push(v);
  }
  return out;
}

function pickOne(values: number[], rand: () => number): number | undefined {
  if (!values.length) return undefined;
  return values[Math.floor(rand() * values.length)]!;
}

/** 无空轨被迫重叠时的轻微上下偏移（约 ±0.35 行高） */
export function applyOverlapTrackJitter(
  top: number,
  targetHeight: number,
  marginTop: number,
  maxTop: number,
  rand: () => number = Math.random,
): number {
  const amp = Math.max(3, targetHeight * 0.35);
  const jittered = top + (rand() * 2 - 1) * amp;
  const lo = marginTop;
  const hi = Math.max(lo, maxTop - targetHeight);
  return Math.min(hi, Math.max(lo, jittered));
}

/**
 * @returns 轨道 top（px）；严格防重叠且无空位时返回 undefined
 */
export function pickDanmuTop(
  data: PickDanmuTopInput,
  rand: () => number = Math.random,
): number | undefined {
  const {
    target,
    visibles,
    clientWidth,
    clientHeight,
    marginBottom,
    marginTop,
    antiOverlap,
    density = 'normal',
  } = data;
  const packing = densityPacking(density);
  const maxTop = clientHeight - marginBottom;
  const mode = target.mode;
  const height = Math.max(1, target.height);
  const laneStep = Math.max(8, height * packing.laneScale);

  const peers = visibles
    .filter((item) => item.mode === mode && item.top <= maxTop)
    .sort((a, b) => a.top - b.top);

  // —— 阶段 1：空轨 / 可复用行（不偏移）——
  let free: number[] = [];

  if (peers.length === 0) {
    free = laneGridTops(marginTop, maxTop, laneStep);
    if (mode === 2 && !free.length) {
      free = [Math.max(marginTop, maxTop - height)];
    }
  } else {
    const occupied = [
      { top: 0, height: marginTop },
      ...peers.map((p) => ({ top: p.top, height: p.height })),
      { top: maxTop, height: marginBottom },
    ];
    free = collectGapTops(occupied, laneStep, mode);

    // 滚动弹幕：水平空隙够则可复用同行（仍不算「重叠偏移」）
    if (mode === 0) {
      const topMap: DanmuTopVisible[][] = [];
      for (const item of peers) {
        const last = topMap[topMap.length - 1];
        if (last && last[0]!.top === item.top) last.push(item);
        else topMap.push([item]);
      }
      for (const list of topMap) {
        if (canReuseTrack(list, target, clientWidth, packing.reuseSlack)) {
          free.push(list[0]!.top);
        }
      }
    }
  }

  const freeUniq = uniqNear(free);
  if (freeUniq.length) {
    return pickOne(freeUniq, rand);
  }

  // —— 阶段 2：无空轨 ——
  // 严格防重叠：进 ready，等待
  if (antiOverlap) return undefined;

  // 允许重叠：叠到已有轨道（或整片网格）+ 轻微上下微偏
  const overlapCandidates: number[] = [];
  for (const p of peers) overlapCandidates.push(p.top);
  overlapCandidates.push(...laneGridTops(marginTop, maxTop, laneStep));
  const base =
    pickOne(uniqNear(overlapCandidates), rand) ??
    (mode === 2 ? Math.max(marginTop, maxTop - height) : marginTop);
  return applyOverlapTrackJitter(base, height, marginTop, maxTop, rand);
}
