/**
 * 直播 catchup 回看 URL 展开（对齐 FongMi Catchup）
 */

import type { EpgProgramme } from './epg';

export type CatchupSpec = {
  type?: string;
  source?: string;
  regex?: string;
  replace?: string;
};

const TOKEN_PATTERN = /(\$?\{[^}]*\})/g;
const TAG_PATTERN = /\{([^}]+)\}/;

function formatTime(millis: number, fmt: string): string {
  if (fmt === 'timestamp') return String(Math.floor(millis / 1000));
  const d = new Date(millis);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const map: Record<string, string> = {
    yyyy: String(d.getFullYear()),
    MM: pad(d.getMonth() + 1),
    dd: pad(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds()),
  };
  let out = fmt;
  for (const [k, v] of Object.entries(map)) out = out.replace(k, v);
  return out;
}

function formatToken(group: string, start: number, end: number): string {
  const m = TAG_PATTERN.exec(group);
  if (!m) return '';
  const tag = m[1]!;
  const paren = tag.indexOf(')');
  if (tag.startsWith('(b') && paren >= 0) return formatTime(start, tag.slice(paren + 1));
  if (tag.startsWith('(e') && paren >= 0) return formatTime(end, tag.slice(paren + 1));
  if (tag.startsWith('utcend:')) return String(Math.floor(end / 1000));
  if (tag.startsWith('utc:')) return String(Math.floor(start / 1000));
  return '';
}

function append(url: string, result: string, replace: string): string {
  let u = url;
  const splits = replace.split(',');
  if (splits.length === 2) {
    try {
      u = u.replace(new RegExp(splits[0]!, 'g'), splits[1]!);
    } catch {
      u = u.split(splits[0]!).join(splits[1]!);
    }
  }
  let r = result;
  if (u.includes('?') && r.startsWith('?')) r = `&${r.slice(1)}`;
  return u + r;
}

/** 从 M3U 属性构造 CatchupSpec */
export function catchupFromChannelAttrs(
  catchup?: string,
  catchupSource?: string,
): CatchupSpec | null {
  if (!catchupSource && !catchup) return null;
  return {
    type: catchup || 'append',
    source: catchupSource || '',
  };
}

export function formatCatchupUrl(
  liveUrl: string,
  prog: EpgProgramme,
  spec: CatchupSpec,
): string {
  let result = spec.source || '';
  if (!result) return liveUrl;
  result = result.replace(TOKEN_PATTERN, (g) =>
    formatToken(g, prog.start, prog.stop || prog.start + 3600_000),
  );
  if ((spec.type || 'append') === 'default') return result;
  return append(liveUrl, result, spec.replace || '');
}
