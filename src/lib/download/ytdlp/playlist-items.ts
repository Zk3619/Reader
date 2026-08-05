/**
 * playlist_items / playliststart / playlistend — yt-dlp PlaylistEntries subset.
 */

const ITEM_RE =
  /^(?<start>[+-]?\d+)?(?<range>[:-](?<end>[+-]?\d+|inf(?:inite)?)?(?::(?<step>[+-]?\d+))?)?$/i;

export type PlaylistSlice = { start: number; end: number; step: number };

export function parsePlaylistItems(spec: string): Array<number | PlaylistSlice> {
  const out: Array<number | PlaylistSlice> = [];
  for (const segment of spec.split(',')) {
    if (!segment) throw new Error('There are two or more consecutive commas');
    const m = ITEM_RE.exec(segment);
    if (!m?.groups) throw new Error(`${segment} is not a valid specification`);
    const { start, end, step, range } = m.groups;
    if (range) {
      const stepNum = step ? Number(step) : 1;
      if (stepNum === 0) throw new Error(`Step in ${segment} cannot be zero`);
      const startNum = start ? Number(start) : stepNum > 0 ? 1 : Number.MAX_SAFE_INTEGER;
      let endNum = Number.MAX_SAFE_INTEGER;
      if (end) {
        endNum = /^inf/i.test(end) ? Number.MAX_SAFE_INTEGER : Number(end);
      } else {
        endNum = stepNum > 0 ? Number.MAX_SAFE_INTEGER : 1;
      }
      out.push({ start: startNum, end: endNum, step: stepNum });
    } else if (!start) {
      throw new Error(`${segment} is not a valid specification`);
    } else {
      out.push(Number(start));
    }
  }
  return out;
}

function normalizeIndex(index: number, length: number): number {
  if (index >= 0) return index - 1;
  return length + index;
}

function expandSlice(slice: PlaylistSlice, length: number): number[] {
  const indices: number[] = [];
  const step = slice.step;
  let i =
    slice.start >= 0
      ? slice.start - 1
      : length + slice.start;
  const stop =
    slice.end >= 0
      ? slice.end - 1
      : length + slice.end;
  if (step > 0) {
    for (; i <= stop; i += step) {
      if (i >= 0 && i < length) indices.push(i);
    }
  } else {
    for (; i >= stop; i += step) {
      if (i >= 0 && i < length) indices.push(i);
    }
  }
  return indices;
}

export function resolvePlaylistIndices(
  length: number,
  opts?: {
    playlist_items?: string;
    playliststart?: number;
    playlistend?: number | null;
  },
): number[] {
  if (length <= 0) return [];
  if (opts?.playlist_items) {
    const indices: number[] = [];
    for (const item of parsePlaylistItems(opts.playlist_items)) {
      if (typeof item === 'number') {
        const idx = normalizeIndex(item, length);
        if (idx >= 0 && idx < length) indices.push(idx);
      } else {
        indices.push(...expandSlice(item, length));
      }
    }
    return [...new Set(indices)].sort((a, b) => a - b);
  }
  const start = Math.max(1, Number(opts?.playliststart ?? 1));
  let end = opts?.playlistend;
  if (end == null || end === -1) end = length;
  const from = normalizeIndex(start, length);
  const to = normalizeIndex(end, length);
  const out: number[] = [];
  for (let i = from; i <= to; i++) {
    if (i >= 0 && i < length) out.push(i);
  }
  return out;
}

export function selectPlaylistEntries<T>(
  entries: T[],
  opts?: {
    playlist_items?: string;
    playliststart?: number;
    playlistend?: number | null;
  },
): T[] {
  const indices = resolvePlaylistIndices(entries.length, opts);
  return indices.map((i) => entries[i]!);
}
