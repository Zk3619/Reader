/**
 * yt-dlp-compatible format selector.
 * Supports: best/worst(+video|+audio), format_id, bv* / ba / b aliases,
 * filters [height<=720], + merge, / fallback, * extension.
 */

import type { Format } from './types';

export type FormatSelectorKind = 'SINGLE' | 'MERGE' | 'PICKFIRST' | 'GROUP';

export interface ParsedFormatSelector {
  type: FormatSelectorKind;
  /** format_id / best / bestvideo / … for SINGLE */
  selector?: string;
  filters: FormatFilter[];
  children?: ParsedFormatSelector[];
}

export interface FormatFilter {
  raw: string;
  key: string;
  op: '<' | '<=' | '>' | '>=' | '=' | '!=' | '^=' | '$=' | '*=' | '~=';
  value: string;
  negate?: boolean;
}

const ALIASES: Record<string, string> = {
  bv: 'bestvideo',
  'bv*': 'bestvideo*',
  ba: 'bestaudio',
  'ba*': 'bestaudio*',
  b: 'best',
  w: 'worst',
  wv: 'worstvideo',
  'wv*': 'worstvideo*',
  wa: 'worstaudio',
  'wa*': 'worstaudio*',
};

function expandAlias(token: string): string {
  const t = token.trim();
  if (ALIASES[t]) return ALIASES[t];
  // bv*[height<=720] style — alias only the prefix before [
  const m = t.match(/^([a-zA-Z*]+)(\[.*\])?$/);
  if (m && ALIASES[m[1]]) return ALIASES[m[1]] + (m[2] || '');
  return t;
}

function splitTopLevel(spec: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < spec.length; i++) {
    const c = spec[i];
    if (c === '[') depth++;
    else if (c === ']') depth = Math.max(0, depth - 1);
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    if (c === sep && depth === 0) {
      parts.push(buf.trim());
      buf = '';
      continue;
    }
    buf += c;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

function parseFilters(filterText: string): FormatFilter[] {
  const filters: FormatFilter[] = [];
  const re =
    /(!?)(?:(\w+)\s*(<=|>=|!=|\^=|\$=|\*=|~=|=|<|>)\s*([^[\]]+)|(\w+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(filterText))) {
    if (m[5]) {
      filters.push({
        raw: m[0],
        key: m[5],
        op: '=',
        value: 'true',
        negate: m[1] === '!',
      });
    } else {
      filters.push({
        raw: m[0],
        key: m[2],
        op: m[3] as FormatFilter['op'],
        value: m[4].trim().replace(/^["']|["']$/g, ''),
        negate: m[1] === '!',
      });
    }
  }
  return filters;
}

/** Peel trailing [filters] from a selector token */
function peelFilters(token: string): { core: string; filters: FormatFilter[] } {
  const filters: FormatFilter[] = [];
  let core = token.trim();
  const filterRe = /\[([^\]]*)\]$/;
  while (filterRe.test(core)) {
    const m = core.match(filterRe)!;
    filters.unshift(...parseFilters(m[1]));
    core = core.slice(0, -m[0].length).trim();
  }
  return { core, filters };
}

export function parseFormatSelector(spec: string): ParsedFormatSelector {
  const trimmed = (spec || 'best').trim();
  if (!trimmed) return { type: 'SINGLE', selector: 'best', filters: [] };

  // PICKFIRST: a/b/c
  const slashParts = splitTopLevel(trimmed, '/');
  if (slashParts.length > 1) {
    return {
      type: 'PICKFIRST',
      filters: [],
      children: slashParts.map(parseFormatSelector),
    };
  }

  // MERGE: a+b+c
  const plusParts = splitTopLevel(trimmed, '+');
  if (plusParts.length > 1) {
    return {
      type: 'MERGE',
      filters: [],
      children: plusParts.map(parseFormatSelector),
    };
  }

  // GROUP: (a/b)
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    const inner = trimmed.slice(1, -1);
    const { core, filters } = peelFilters(inner.includes('[') && !inner.startsWith('(')
      ? trimmed
      : trimmed);
    // If whole thing is (expr)[filters]
    const groupMatch = trimmed.match(/^\((.*)\)((?:\[[^\]]*\])*)$/);
    if (groupMatch) {
      const groupFilters = peelFilters('x' + groupMatch[2]).filters;
      return {
        type: 'GROUP',
        filters: groupFilters,
        children: [parseFormatSelector(groupMatch[1])],
      };
    }
    void core;
    void filters;
  }

  const expanded = expandAlias(trimmed);
  const { core, filters } = peelFilters(expanded);
  return { type: 'SINGLE', selector: core || 'best', filters };
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

function hasVideo(f: Format): boolean {
  const vc = f.vcodec;
  if (vc && vc !== 'none') return true;
  if (f.height || f.width) return true;
  if (f.video_ext && f.video_ext !== 'none') return true;
  return false;
}

function hasAudio(f: Format): boolean {
  const ac = f.acodec;
  if (ac && ac !== 'none') return true;
  if (f.abr || f.asr) return true;
  if (f.audio_ext && f.audio_ext !== 'none') return true;
  return false;
}

function isComplete(f: Format): boolean {
  return hasVideo(f) && hasAudio(f);
}

function formatField(f: Format, key: string): unknown {
  switch (key) {
    case 'filesize':
      return f.filesize ?? f.filesize_approx ?? null;
    case 'size':
      return f.filesize ?? f.filesize_approx ?? null;
    case 'res':
    case 'resolution':
      return f.height ?? (f.width ? 0 : null);
    case 'height':
      return f.height;
    case 'width':
      return f.width;
    case 'fps':
      return f.fps;
    case 'tbr':
    case 'br':
      return f.tbr ?? ((num(f.vbr) ?? 0) + (num(f.abr) ?? 0) || null);
    case 'vbr':
      return f.vbr;
    case 'abr':
      return f.abr;
    case 'asr':
      return f.asr;
    case 'quality':
      return f.quality;
    case 'ext':
      return f.ext;
    case 'acodec':
      return f.acodec;
    case 'vcodec':
      return f.vcodec;
    case 'proto':
    case 'protocol':
      return f.protocol;
    case 'format_id':
      return f.format_id;
    case 'lang':
    case 'language':
      return f.language;
    case 'hasvid':
      return hasVideo(f);
    case 'hasaud':
      return hasAudio(f);
    default:
      return (f as Record<string, unknown>)[key];
  }
}

function compareOp(actual: unknown, op: FormatFilter['op'], expected: string): boolean {
  if (op === '~=') {
    try {
      return new RegExp(expected).test(str(actual));
    } catch {
      return false;
    }
  }
  if (op === '^=') return str(actual).startsWith(expected);
  if (op === '$=') return str(actual).endsWith(expected);
  if (op === '*=') return str(actual).includes(expected);

  const aNum = num(actual);
  const eNum = num(expected);
  const bothNum = aNum != null && eNum != null && /^-?\d+(\.\d+)?$/.test(expected);

  if (bothNum) {
    switch (op) {
      case '<':
        return aNum! < eNum!;
      case '<=':
        return aNum! <= eNum!;
      case '>':
        return aNum! > eNum!;
      case '>=':
        return aNum! >= eNum!;
      case '=':
        return aNum === eNum;
      case '!=':
        return aNum !== eNum;
    }
  }

  const aStr = str(actual);
  switch (op) {
    case '=':
      if (expected === 'true') return !!actual && actual !== 'none' && actual !== 'false';
      if (expected === 'false') return !actual || actual === 'none' || actual === 'false';
      return aStr === expected;
    case '!=':
      return aStr !== expected;
    case '<':
      return aStr < expected;
    case '<=':
      return aStr <= expected;
    case '>':
      return aStr > expected;
    case '>=':
      return aStr >= expected;
    default:
      return false;
  }
}

export function matchesFilters(f: Format, filters: FormatFilter[]): boolean {
  for (const filter of filters) {
    const actual = formatField(f, filter.key);
    let ok = compareOp(actual, filter.op, filter.value);
    if (filter.negate) ok = !ok;
    if (!ok) return false;
  }
  return true;
}

function scoreFormat(f: Format, preferVideo: boolean, preferAudio: boolean): number {
  let score = 0;
  const h = num(f.height) ?? 0;
  const tbr = num(f.tbr) ?? (num(f.vbr) ?? 0) + (num(f.abr) ?? 0);
  const fps = num(f.fps) ?? 0;
  const q = num(f.quality) ?? 0;
  const pref = num(f.preference) ?? 0;
  score += pref * 1e12;
  score += q * 1e9;
  if (preferVideo) {
    score += h * 1e6;
    score += fps * 1e3;
    score += (num(f.vbr) ?? tbr) * 10;
    if (hasAudio(f)) score += 50;
  } else if (preferAudio) {
    score += (num(f.abr) ?? tbr) * 1e3;
    score += (num(f.asr) ?? 0);
    if (!hasVideo(f)) score += 1e5;
  } else {
    score += h * 1e6;
    score += tbr * 10;
    if (isComplete(f)) score += 1e8;
  }
  if (f.has_drm) score -= 1e15;
  return score;
}

function pickBest(
  formats: Format[],
  mode: 'best' | 'worst' | 'bestvideo' | 'worstvideo' | 'bestaudio' | 'worstaudio',
  allowIncompleteExt = false,
): Format | null {
  let pool = formats.filter((f) => !f.has_drm);
  switch (mode) {
    case 'bestvideo':
    case 'worstvideo':
      pool = pool.filter(hasVideo);
      if (!allowIncompleteExt) {
        // yt-dlp: `bestvideo` (no *) is video-only; empty → selector fails (e.g. /b fallback)
        pool = pool.filter((f) => !hasAudio(f));
      }
      break;
    case 'bestaudio':
    case 'worstaudio':
      pool = pool.filter(hasAudio);
      if (!allowIncompleteExt) {
        // yt-dlp: `bestaudio` (no *) is audio-only — critical for bv*+ba/b on muxed HLS
        // (AcFun etc.): without this, ba picks another complete copy → dual identical files
        pool = pool.filter((f) => !hasVideo(f));
      }
      break;
    case 'best':
    case 'worst': {
      const complete = pool.filter(isComplete);
      if (complete.length) pool = complete;
      break;
    }
  }
  if (!pool.length) return null;
  const preferVideo = mode.includes('video') || mode === 'best' || mode === 'worst';
  const preferAudio = mode.includes('audio');
  const ranked = [...pool].sort(
    (a, b) => scoreFormat(b, preferVideo && !preferAudio, preferAudio) -
      scoreFormat(a, preferVideo && !preferAudio, preferAudio),
  );
  if (mode.startsWith('worst')) return ranked[ranked.length - 1] ?? null;
  return ranked[0] ?? null;
}

function selectSingle(
  formats: Format[],
  selector: string,
  filters: FormatFilter[],
): Format[] {
  const filtered = formats.filter((f) => matchesFilters(f, filters));
  const s = selector.trim();
  const star = s.endsWith('*');
  const base = star ? s.slice(0, -1) : s;

  if (
    base === 'best' ||
    base === 'worst' ||
    base === 'bestvideo' ||
    base === 'worstvideo' ||
    base === 'bestaudio' ||
    base === 'worstaudio'
  ) {
    const picked = pickBest(
      filtered,
      base as 'best' | 'worst' | 'bestvideo' | 'worstvideo' | 'bestaudio' | 'worstaudio',
      star,
    );
    return picked ? [picked] : [];
  }

  // exact format_id (and optional prefix*)
  if (star) {
    return filtered.filter(
      (f) => f.format_id === base || (f.format_id?.startsWith(base) ?? false),
    );
  }
  const exact = filtered.filter((f) => f.format_id === s);
  if (exact.length) return exact;

  // ext match e.g. mp4
  const byExt = filtered.filter((f) => f.ext === s);
  if (byExt.length) {
    const best = pickBest(byExt, 'best', true);
    return best ? [best] : [];
  }

  return [];
}

function applySelector(formats: Format[], sel: ParsedFormatSelector): Format[] {
  switch (sel.type) {
    case 'PICKFIRST': {
      for (const child of sel.children || []) {
        const got = applySelector(formats, child);
        if (got.length) return got;
      }
      return [];
    }
    case 'MERGE': {
      const parts: Format[] = [];
      for (const child of sel.children || []) {
        const got = applySelector(formats, child);
        if (!got.length) return [];
        parts.push(got[0]!);
      }
      if (!parts.length) return [];
      const merged = mergeFormats(parts);
      return [merged];
    }
    case 'GROUP': {
      const inner = sel.children?.[0];
      if (!inner) return [];
      let got = applySelector(formats, inner);
      got = got.filter((f) => matchesFilters(f, sel.filters));
      return got;
    }
    case 'SINGLE':
    default:
      return selectSingle(formats, sel.selector || 'best', sel.filters);
  }
}

export function mergeFormats(parts: Format[]): Format {
  if (parts.length === 1) return { ...parts[0]! };
  // bv*+ba 可能对同一条渐进式双轨各选一次 → 去重，避免重复下载同一 URL
  const unique: Format[] = [];
  for (const p of parts) {
    const url = p.url ? String(p.url) : '';
    if (url && unique.some((u) => u.url === url)) continue;
    unique.push(p);
  }
  if (unique.length === 1) return { ...unique[0]! };

  const video = unique.find(hasVideo) ?? unique[0]!;
  const audio = unique.find((f) => hasAudio(f) && f !== video) ?? unique[1] ?? unique[0]!;
  const format_id = unique.map((p) => p.format_id).join('+');
  return {
    ...video,
    format_id,
    format: unique.map((p) => p.format || p.format_id).join('+'),
    requested_formats: unique,
    acodec: audio.acodec ?? video.acodec,
    abr: audio.abr ?? video.abr,
    asr: audio.asr ?? video.asr,
    audio_ext: audio.ext ?? audio.audio_ext ?? video.audio_ext,
    tbr: (num(video.tbr) ?? num(video.vbr) ?? 0) + (num(audio.tbr) ?? num(audio.abr) ?? 0) || null,
    protocol: video.protocol,
    ext: video.ext || 'mp4',
  };
}

/**
 * Select formats according to a yt-dlp format string.
 * Returns selected format(s); for merges, a single synthetic format with requested_formats.
 */
export function selectFormats(formats: Format[], formatSpec = 'best'): Format[] {
  if (!formats?.length) return [];
  const sel = parseFormatSelector(formatSpec);
  return applySelector(formats, sel);
}

export function selectBestFormat(formats: Format[], formatSpec = 'bv*+ba/b'): Format | null {
  const selected = selectFormats(formats, formatSpec);
  return selected[0] ?? null;
}
