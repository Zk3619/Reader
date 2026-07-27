/**
 * 将弹弹 / B 站 / danmu_api / 已转换 Danmu 统一为 artplayer-plugin-danmuku 结构
 *
 * @see https://artplayer.org/document/plugin/danmuku.html
 *
 * 插件 emit 用 `if (danmu.time)`：time===0 / NaN 会变成 currentTime+0.5。
 * 另：不少源（如腾讯）时间只有整秒，同秒数十条会在 ±0.1s 窗内同时弹出 → 竖条批次。
 */

import type { Danmu } from 'artplayer-plugin-danmuku';

export type DanmuWithPlatform = Danmu & { platform?: string };

/** 从 danmu_api comment.p 尾部解析 [platform] */
export function parsePlatformFromDanmuP(p: string): string | undefined {
  const m = String(p).match(/\[([a-z0-9_]+)\]\s*$/i);
  return m?.[1]?.toLowerCase();
}

/** 解析弹幕时间（秒）；无效返回 null（勿用 0 兜底） */
export function parseDanmuTimeSeconds(
  raw: unknown,
  fallback?: unknown,
): number | null {
  const tryOne = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).trim());
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  };
  return tryOne(raw) ?? tryOne(fallback);
}

function mapBilibiliMode(modeRaw: number): 0 | 1 | 2 {
  // 弹弹 / B 站：1/2/3 滚动 4底部 5顶部 → artplayer 0/2/1
  if (modeRaw === 5) return 1;
  if (modeRaw === 4) return 2;
  return 0;
}

function asArtplayerMode(modeRaw: number): 0 | 1 | 2 {
  if (modeRaw === 0 || modeRaw === 1 || modeRaw === 2) return modeRaw;
  return mapBilibiliMode(modeRaw);
}

function colorFromNum(colorNum: number): string | undefined {
  if (!Number.isFinite(colorNum) || colorNum <= 0) return undefined;
  return `#${(colorNum & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** 解析 p 字段：兼容 4 字段短格式与 8/9 字段 B 站格式 */
export function parseDanmuPField(p: string): {
  time: number | null;
  mode: 0 | 1 | 2;
  color?: string;
  platform?: string;
} {
  const pStr = String(p ?? '');
  const parts = pStr.split(',');
  const time = parseDanmuTimeSeconds(parts[0]);
  const modeRaw = Number(parts[1]);
  let colorNum: number;
  if (parts.length >= 8) {
    colorNum = Number(parts[3]);
  } else {
    colorNum = Number(parts[2]);
  }
  return {
    time,
    mode: Number.isFinite(modeRaw) ? mapBilibiliMode(modeRaw) : 0,
    color: colorFromNum(colorNum),
    platform: parsePlatformFromDanmuP(pStr),
  };
}

/** 稳定 0~1 伪随机（同 seed 可复现，避免 seek 后位置乱跳） */
function hashUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * 同 time 的多条在 spreadSec 内随机错开，避免 ±0.1s 窗整批评出成竖条，
 * 也避免均匀错开 + 顺序占轨造成的左上→右下斜阶梯。
 * 偏移由 text/time/序号哈希决定，seek 可复现。
 */
export function spreadDuplicateDanmakuTimes(
  list: Danmu[],
  spreadSec = 0.9,
): Danmu[] {
  if (list.length <= 1) return list;
  const sorted = [...list].sort(
    (a, b) => Number((a as { time?: number }).time) - Number((b as { time?: number }).time),
  );
  const out: Danmu[] = [];
  const span = Math.max(0.05, Math.min(0.95, spreadSec));
  let i = 0;
  while (i < sorted.length) {
    const t0 = Number((sorted[i] as { time?: number }).time);
    let j = i + 1;
    while (j < sorted.length && Number((sorted[j] as { time?: number }).time) === t0) {
      j += 1;
    }
    const n = j - i;
    for (let k = 0; k < n; k++) {
      const d = sorted[i + k]!;
      if (n === 1 || !Number.isFinite(t0)) {
        out.push(d);
        continue;
      }
      const text = String((d as { text?: string }).text ?? '');
      const unit = hashUnit(`${t0}\0${text}\0${k}`);
      const time = Math.max(0.001, t0 + unit * span);
      out.push({ ...d, time });
    }
    i = j;
  }
  return out;
}

/**
 * 载入插件前规范化：
 * - 保证 time 为有限数字
 * - 0 改为极小正数，避开插件 falsy 改写
 * - 若整体像毫秒（大量 > 1e5），自动 /1000
 * - 同秒重复 time 错开
 */
export function normalizeDanmuForArtplayer(list: Danmu[]): Danmu[] {
  if (!list.length) return list;

  let msLike = 0;
  const sampleN = Math.min(list.length, 40);
  for (let i = 0; i < sampleN; i++) {
    const t = Number((list[i] as { time?: number }).time);
    if (Number.isFinite(t) && t > 100_000) msLike += 1;
  }
  const asMs = msLike >= sampleN * 0.5;

  const out: Danmu[] = [];
  for (const d of list) {
    const text = String((d as { text?: string }).text ?? '').trim();
    if (!text) continue;
    let time = parseDanmuTimeSeconds((d as { time?: unknown }).time);
    if (time == null) continue;
    if (asMs) time = time / 1000;
    if (time <= 0) time = 0.001;
    const modeRaw = Number((d as { mode?: number }).mode);
    out.push({
      ...d,
      text,
      time,
      mode: Number.isFinite(modeRaw) ? asArtplayerMode(modeRaw) : 0,
    });
  }
  return spreadDuplicateDanmakuTimes(out);
}

type LooseComment = {
  p?: string;
  m?: string;
  t?: number | string;
  text?: string;
  time?: number | string;
  timepoint?: number | string;
  content?: string;
  mode?: number;
  ct?: number;
  color?: number | string;
  platform?: string;
};

function looseCommentToDanmu(c: LooseComment): DanmuWithPlatform | null {
  // 已是插件结构
  if (c.text != null && (c.time != null || c.timepoint != null)) {
    const text = String(c.text).trim();
    if (!text) return null;
    const time = parseDanmuTimeSeconds(c.time, c.timepoint);
    if (time == null) return null;
    const modeRaw = Number(c.mode ?? c.ct);
    const color =
      typeof c.color === 'string' && c.color.startsWith('#')
        ? c.color
        : colorFromNum(Number(c.color));
    return {
      text,
      time,
      mode: Number.isFinite(modeRaw) ? asArtplayerMode(modeRaw) : 0,
      color,
      ...(c.platform ? { platform: String(c.platform) } : {}),
    };
  }

  // timepoint + content（formatComments 中间态）
  if (c.content != null && (c.timepoint != null || c.time != null)) {
    const text = String(c.content).trim();
    if (!text) return null;
    const time = parseDanmuTimeSeconds(c.timepoint, c.time);
    if (time == null) return null;
    const modeRaw = Number(c.ct ?? c.mode);
    return {
      text,
      time,
      mode: Number.isFinite(modeRaw) ? mapBilibiliMode(modeRaw) : 0,
      color: colorFromNum(Number(c.color)),
    };
  }

  // 弹弹 / danmu_api：p + m
  const text = String(c.m ?? '').trim();
  if (!text) return null;
  const parsed = parseDanmuPField(String(c.p ?? ''));
  const time = parsed.time ?? parseDanmuTimeSeconds(c.t);
  if (time == null) return null;
  return {
    text,
    time,
    mode: parsed.mode,
    color: parsed.color,
    ...(parsed.platform ? { platform: parsed.platform } : {}),
  };
}

/**
 * 任意常见源格式 → 插件 Danmu[]。
 * 支持：{comments}、[{p,m}]、[{text,time}]、[{timepoint,content}]、XML 字符串。
 */
export function coerceToArtplayerDanmu(raw: unknown): DanmuWithPlatform[] {
  if (raw == null) return [];
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return [];
    if (s.includes('<d ') || s.includes('<d\t') || s.includes('<i>')) {
      return biliXmlToDanmu(s);
    }
    try {
      return coerceToArtplayerDanmu(JSON.parse(s));
    } catch {
      return [];
    }
  }

  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'object') {
    const o = raw as { comments?: unknown; danmu?: unknown };
    if (Array.isArray(o.comments)) list = o.comments;
    else if (Array.isArray(o.danmu)) list = o.danmu;
    else return [];
  } else {
    return [];
  }

  const out: DanmuWithPlatform[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const d = looseCommentToDanmu(item as LooseComment);
    if (d) out.push(d);
  }
  return normalizeDanmuForArtplayer(out) as DanmuWithPlatform[];
}

/** @deprecated 使用 coerceToArtplayerDanmu；保留别名 */
export function danDanCommentsToDanmu(raw: unknown): DanmuWithPlatform[] {
  return coerceToArtplayerDanmu(raw);
}

/** B 站 XML：<d p="time,mode,size,color,...">text</d> */
export function biliXmlToDanmu(xml: string): DanmuWithPlatform[] {
  const out: DanmuWithPlatform[] = [];
  const re = /<d\s+p="([^"]*)"[^>]*>([^<]*)<\/d>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const parsed = parseDanmuPField(m[1]!);
    if (parsed.time == null) continue;
    const text = decodeXmlEntities(m[2]!).trim();
    if (!text) continue;
    out.push({
      text,
      time: parsed.time,
      mode: parsed.mode,
      color: parsed.color,
      platform: parsed.platform ?? 'bilibili',
    });
  }
  return normalizeDanmuForArtplayer(out) as DanmuWithPlatform[];
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
