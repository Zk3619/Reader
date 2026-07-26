/**
 * 弹幕后处理：可选完全去重 + 密度感知均匀采样（misaka sample_comments_evenly）
 */

import type { Danmu } from 'artplayer-plugin-danmuku';

const SEGMENT_DURATION = 180;

function danmuTime(d: Danmu): number {
  const t = Number((d as { time?: number }).time);
  return Number.isFinite(t) ? t : 0;
}

function danmuText(d: Danmu): string {
  return String((d as { text?: string }).text ?? '').trim();
}

/** 完全去重：键 = t(1 位小数) + m；默认由 prefs 控制是否启用 */
export function dedupeDanmakuByTimeText(list: Danmu[]): Danmu[] {
  const seen = new Set<string>();
  const out: Danmu[] = [];
  for (const d of list) {
    const key = `${danmuTime(d).toFixed(1)}\0${danmuText(d)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/**
 * 按 3 分钟段密度比例分配配额，段内等间隔采样。
 * targetCount <= 0 表示不限制。
 */
export function sampleDanmakuEvenly(
  comments: Danmu[],
  targetCount: number,
): Danmu[] {
  if (targetCount <= 0 || comments.length <= targetCount) return comments;
  if (comments.length === 0) return [];

  const timed = comments
    .map((c) => ({ t: danmuTime(c), c }))
    .sort((a, b) => a.t - b.t);

  const minTime = timed[0]!.t;
  const maxTime = timed[timed.length - 1]!.t;
  if (maxTime <= minTime) {
    return timed.slice(0, targetCount).map((x) => x.c);
  }

  const timeDuration = maxTime - minTime;
  const totalSegments = Math.max(1, Math.ceil(timeDuration / SEGMENT_DURATION));
  const segments: Danmu[][] = Array.from({ length: totalSegments }, () => []);

  for (const { t, c } of timed) {
    let idx = Math.floor((t - minTime) / SEGMENT_DURATION);
    if (idx >= totalSegments) idx = totalSegments - 1;
    if (idx < 0) idx = 0;
    segments[idx]!.push(c);
  }

  const weights = segments.map((s) => s.length);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) return comments.slice(0, targetCount);

  const quotas: number[] = [];
  let allocated = 0;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i]!;
    if (w === 0) {
      quotas.push(0);
      continue;
    }
    const q = Math.floor((targetCount * w) / totalWeight);
    quotas.push(q);
    allocated += q;
  }

  let remain = targetCount - allocated;
  while (remain > 0) {
    let best = -1;
    let bestDensity = -1;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const taken = quotas[i]!;
      if (taken >= seg.length) continue;
      const density = seg.length;
      if (density > bestDensity) {
        bestDensity = density;
        best = i;
      }
    }
    if (best < 0) break;
    quotas[best]! += 1;
    remain -= 1;
  }

  const picked: Danmu[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const q = Math.min(quotas[i]!, seg.length);
    if (q <= 0) continue;
    if (q >= seg.length) {
      picked.push(...seg);
      continue;
    }
    if (q === 1) {
      picked.push(seg[Math.floor(seg.length / 2)]!);
      continue;
    }
    const step = (seg.length - 1) / (q - 1);
    for (let j = 0; j < q; j++) {
      picked.push(seg[Math.round(j * step)]!);
    }
  }

  picked.sort((a, b) => danmuTime(a) - danmuTime(b));
  return picked.slice(0, targetCount);
}

/** 去重（可选）+ 采样，供 match 管线调用 */
export function postProcessDanmakuList(
  list: Danmu[],
  opts: { dedupe?: boolean; limit?: number },
): Danmu[] {
  let out = list;
  if (opts.dedupe) out = dedupeDanmakuByTimeText(out);
  const limit = opts.limit ?? 0;
  if (limit > 0) out = sampleDanmakuEvenly(out, limit);
  return out;
}
