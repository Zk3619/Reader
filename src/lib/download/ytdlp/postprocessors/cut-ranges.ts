/**
 * Convert remove/sponsor ranges into keep ranges for ffmpeg concat demuxer.
 */

export type TimeRange = { start: number; end: number };

/** Merge overlapping [start,end) remove intervals. */
export function mergeRanges(ranges: Array<[number, number] | TimeRange>): TimeRange[] {
  const cuts = ranges
    .map((r) => (Array.isArray(r) ? { start: r[0], end: r[1] } : { start: r.start, end: r.end }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);
  const merged: TimeRange[] = [];
  for (const r of cuts) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ start: r.start, end: r.end });
    }
  }
  return merged;
}

/** Invert remove ranges into keep ranges within [0, duration]. */
export function removeRangesToKeepRanges(
  remove: Array<[number, number] | TimeRange>,
  duration: number,
): TimeRange[] {
  if (!(duration > 0)) return [];
  const merged = mergeRanges(remove)
    .map((r) => ({
      start: Math.max(0, r.start),
      end: Math.min(duration, r.end),
    }))
    .filter((r) => r.end > r.start);

  const keep: TimeRange[] = [];
  let cursor = 0;
  for (const r of merged) {
    if (r.start > cursor) keep.push({ start: cursor, end: r.start });
    cursor = Math.max(cursor, r.end);
  }
  if (duration > cursor) keep.push({ start: cursor, end: duration });
  return keep.filter((r) => r.end > r.start + 0.01);
}

/** Chapter list → per-chapter keep ranges (for split). */
export function chaptersToSplitRanges(
  chapters: Array<{ start_time: number; end_time?: number; title?: string }>,
  duration?: number | null,
): TimeRange[] {
  if (!chapters.length) return [];
  const sorted = [...chapters].sort((a, b) => a.start_time - b.start_time);
  const out: TimeRange[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]!.start_time;
    const end =
      sorted[i]!.end_time ??
      sorted[i + 1]?.start_time ??
      (typeof duration === 'number' && duration > start ? duration : start + 1);
    if (end > start) out.push({ start, end });
  }
  return out;
}
