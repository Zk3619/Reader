/**
 * Legado 单图 URL 后缀 JSON：`style` / `click` / `js`
 * 对齐 Legado_Max TextChapterLayout + ReadBookActivity.clickImg
 */

/** 书级 + 单图合成后的排版方式 */
export type LegadoImageLayout = 'DEFAULT' | 'FULL' | 'TEXT' | 'TEXT_WIDE' | 'SINGLE';

export function isInlineLegadoImageLayout(layout: LegadoImageLayout): boolean {
  return layout === 'TEXT' || layout === 'TEXT_WIDE';
}

/** 单图 JSON `style` + 书级 imageStyle → 最终 layout */
export function resolveLegadoImageLayout(
  bookStyle?: string | null,
  perImageStyle?: string | null,
): LegadoImageLayout {
  const per = (perImageStyle ?? '').trim();
  if (per) {
    if (per === 'TEXT') return 'TEXT_WIDE';
    const lower = per.toLowerCase();
    if (lower === 'text') return 'TEXT';
    if (lower === 'full') return 'FULL';
    if (lower === 'single') return 'SINGLE';
    if (lower === 'center' || lower === 'left' || lower === 'right') return 'DEFAULT';
  }

  const book = (bookStyle ?? 'DEFAULT').trim().toUpperCase();
  if (book === 'TEXT') return 'TEXT';
  if (book === 'FULL') return 'FULL';
  if (book === 'SINGLE') return 'SINGLE';
  return 'DEFAULT';
}

/** 解析 showCmt('url', 'sources', ydv) — ydv 可为数字或 true/false（晴天 islyc） */
export function parseShowCmtCall(
  click: string | undefined | null,
): { reviewUrl: string; sources: string; ydv: number } | null {
  let raw = normalizeShowCmtPayload(click);
  if (!raw) return null;

  if (/get_para_review/i.test(raw) && !/^showCmt/i.test(raw)) {
    const url = extractParaReviewPath(raw);
    if (url) return { reviewUrl: url, sources: '', ydv: 1 };
  }

  const showIdx = raw.search(/showCmt\s*\(/i);
  if (showIdx > 0) raw = raw.slice(showIdx);

  const parsed = parseShowCmtParenBody(raw);
  if (parsed) return parsed;

  console.warn('[parseShowCmtCall] failed', { click: raw.slice(0, 320) });
  return null;
}

function normalizeShowCmtPayload(click: string | undefined | null): string {
  return (click ?? '')
    .trim()
    .replace(/[\u2018\u2019\u201C\u201D]/g, (ch) => (ch === '\u2018' || ch === '\u2019' ? "'" : '"'))
    .replace(/;\s*$/, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<');
}

function extractParaReviewPath(raw: string): string | null {
  const m = raw.match(/(\/?get_para_review[^\s'")\]}>]*)/i);
  return m?.[1] ?? null;
}

function parseYdvToken(token: string | undefined): number {
  if (token == null || token === '') return 0;
  if (/^true$/i.test(token)) return 1;
  if (/^false$/i.test(token)) return 0;
  const n = parseInt(token, 10);
  return Number.isFinite(n) ? n : 0;
}

function parseShowCmtParenBody(
  raw: string,
): { reviewUrl: string; sources: string; ydv: number } | null {
  const open = raw.match(/^showCmt\s*\(/i);
  if (!open || open.index !== 0) return null;

  let i = open[0].length;
  while (i < raw.length && /\s/.test(raw[i]!)) i += 1;

  const readQuoted = (quote: "'" | '"'): string | null => {
    if (raw[i] !== quote) return null;
    i += 1;
    let value = '';
    while (i < raw.length) {
      const c = raw[i]!;
      if (c === '\\' && i + 1 < raw.length) {
        value += raw[i + 1]!;
        i += 2;
        continue;
      }
      if (c === quote) {
        i += 1;
        return value;
      }
      value += c;
      i += 1;
    }
    return null;
  };

  const reviewUrl = readQuoted("'");
  if (reviewUrl == null) {
    const alt = readQuoted('"');
    if (alt == null) return null;
    return parseShowCmtAfterUrl(raw, alt, i);
  }
  return parseShowCmtAfterUrl(raw, reviewUrl, i);
}

function parseShowCmtAfterUrl(
  raw: string,
  reviewUrl: string,
  afterUrlIdx: number,
): { reviewUrl: string; sources: string; ydv: number } | null {
  let i = afterUrlIdx;
  while (i < raw.length && /\s/.test(raw[i]!)) i += 1;
  if (raw[i] !== ',') return { reviewUrl, sources: '', ydv: 0 };
  i += 1;
  while (i < raw.length && /\s/.test(raw[i]!)) i += 1;

  const readSecond = (): string => {
    if (raw[i] === "'" || raw[i] === '"') {
      const quote = raw[i] as "'" | '"';
      i += 1;
      let value = '';
      while (i < raw.length) {
        const c = raw[i]!;
        if (c === quote) {
          i += 1;
          break;
        }
        value += c;
        i += 1;
      }
      return value;
    }
    return '';
  };

  const sources = readSecond();
  while (i < raw.length && /\s/.test(raw[i]!)) i += 1;

  let ydv = 0;
  if (raw[i] === ',') {
    i += 1;
    while (i < raw.length && /\s/.test(raw[i]!)) i += 1;
    const rest = raw.slice(i);
    const ydvMatch = rest.match(/^(true|false|\d+)/i);
    if (ydvMatch) ydv = parseYdvToken(ydvMatch[1]);
  }

  return { reviewUrl, sources, ydv };
}

/** 段评 URL `/get_para_review?...&para=0` → Reader segmentIndex（0=标题，1 起=段落） */
export function segmentIndexFromReviewUrl(url: string): number | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const para = new URL(trimmed, 'https://reader.local').searchParams.get('para');
    if (para != null && para !== '') {
      const n = parseInt(para, 10);
      return Number.isFinite(n) ? n + 1 : null;
    }
  } catch {
    /* fall through */
  }
  const m = trimmed.match(/[?&]para=(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  return Number.isFinite(n) ? n + 1 : null;
}

/** 迁移旧版阅读器 imageStyle 配置 */
export function migrateReaderImageStyle(value: unknown): 'DEFAULT' | 'FULL' | 'TEXT' | 'SINGLE' {
  const s = String(value ?? '').trim();
  if (!s || s === 'default' || s.toUpperCase() === 'DEFAULT' || s.toUpperCase() === 'CENTER') {
    return 'DEFAULT';
  }
  const upper = s.toUpperCase();
  if (upper === 'FULL') return 'FULL';
  if (upper === 'TEXT') return 'TEXT';
  if (upper === 'SINGLE') return 'SINGLE';
  return 'DEFAULT';
}

export const READER_IMAGE_STYLE_LABELS: Record<
  'DEFAULT' | 'FULL' | 'TEXT' | 'SINGLE',
  string
> = {
  DEFAULT: '默认',
  FULL: '全宽',
  TEXT: '文本',
  SINGLE: '单页',
};
