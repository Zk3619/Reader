/**
 * 片名 / 季集解析（移植自 misaka filename_parser 子集）
 */

export type SearchKeywordParse = {
  title: string;
  season: number | null;
  episode: number | null;
  originalKeyword: string;
};

const CHINESE_NUM_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  壹: 1,
  贰: 2,
  叁: 3,
  肆: 4,
  伍: 5,
  陆: 6,
  柒: 7,
  捌: 8,
  玖: 9,
  拾: 10,
};

const ROMAN_NUM_MAP: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  ⅰ: 1,
  ⅱ: 2,
  ⅲ: 3,
  ⅳ: 4,
  ⅴ: 5,
  ⅵ: 6,
  ⅶ: 7,
  ⅷ: 8,
  ⅸ: 9,
  ⅹ: 10,
};

const FULLWIDTH_ROMAN_MAP: Record<string, number> = {
  Ⅰ: 1,
  Ⅱ: 2,
  Ⅲ: 3,
  Ⅳ: 4,
  Ⅴ: 5,
  Ⅵ: 6,
  Ⅶ: 7,
  Ⅷ: 8,
  Ⅸ: 9,
  Ⅹ: 10,
  Ⅺ: 11,
  Ⅻ: 12,
};

const SEASON_SUFFIX_PATTERNS = [
  /\s*第[一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾\d]+季.*$/u,
  /\s*第[一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾\d]+期.*$/u,
  /\s*第[一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾\d]+部.*$/u,
  /\s*第[一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾\d]+章.*$/u,
  /\s*第[一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾\d]+篇.*$/u,
  /\s*第[一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾\d]+幕.*$/u,
  /\s*[一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾]\s*之\s*章.*$/u,
  /\s*Season\s*\d+.*$/i,
  /\s*S\d+.*$/i,
  /\s*Part\s*\d+.*$/i,
  /\s*[：:]\s*\S+篇\s*$/u,
  /\s+\S+篇\s*$/u,
  /\s+[Ⅰ-Ⅻ]+\s*$/u,
  /\s+[IVX]+\s*$/i,
];

function chineseNumToInt(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s);
  if (s.length === 1) return CHINESE_NUM_MAP[s] ?? null;
  if (s.includes('十') || s.includes('拾')) {
    const sep = s.includes('十') ? '十' : '拾';
    const [tensPart, onesPart = ''] = s.split(sep, 2);
    const tens = tensPart ? (CHINESE_NUM_MAP[tensPart] ?? null) : 1;
    const ones = onesPart ? (CHINESE_NUM_MAP[onesPart] ?? 0) : 0;
    if (tens == null) return null;
    return tens * 10 + ones;
  }
  return null;
}

function romanToInt(s: string): number {
  const map: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  };
  const u = s.toUpperCase();
  let result = 0;
  let i = 0;
  while (i < u.length) {
    const cur = map[u[i]!] ?? 0;
    const next = map[u[i + 1]!] ?? 0;
    if (next > cur) {
      result += next - cur;
      i += 2;
    } else {
      result += cur;
      i += 1;
    }
  }
  return result;
}

/** 从标题提取明确季度 */
export function extractSeasonFromTitle(title: string): number | null {
  const t = title.trim();
  if (!t) return null;

  let m = t.match(/第([一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾]+|\d+)季/u);
  if (m?.[1]) {
    const n = chineseNumToInt(m[1]);
    if (n != null && n > 0) return n;
  }

  m = t.match(/Season\s*(\d+)/i);
  if (m?.[1]) return Number(m[1]);

  m = t.match(/(?:^|\s)S(\d+)(?:\s|$)/i);
  if (m?.[1]) return Number(m[1]);

  m = t.match(
    /\s+(I{1,3}|IV|VI{0,3}|IX|X|[ⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹ])\s*$/iu,
  );
  if (m?.[1]) {
    const key = m[1].toLowerCase();
    if (key in ROMAN_NUM_MAP) return ROMAN_NUM_MAP[key]!;
  }

  m = t.match(/[^\d](\d{1,2})\s*$/);
  if (m?.[1]) {
    const num = Number(m[1]);
    if (num >= 1 && num <= 20) return num;
  }

  return null;
}

/** 去掉季度后缀，得到基础剧名 */
export function normalizeTitleSeason(title: string): string {
  if (!title.trim()) return title;
  let result = title.trim();
  for (const pattern of SEASON_SUFFIX_PATTERNS) {
    result = result.replace(pattern, '');
  }
  result = result.replace(/[\s\-_：:]+$/u, '').trim();
  return result || title.trim();
}

/**
 * 解析搜索关键词：Title S01E01 / Title 第二季 / Title Ⅲ / Title 2
 */
export function parseSearchKeyword(keyword: string): SearchKeywordParse {
  const raw = keyword.trim();
  const empty: SearchKeywordParse = {
    title: raw,
    season: null,
    episode: null,
    originalKeyword: raw,
  };
  if (!raw) return empty;

  let m = raw.match(
    /^(?<title>.+?)\s*S(?<season>\d{1,2})E(?<episode>\d{1,4})$/i,
  );
  if (m?.groups) {
    return {
      title: m.groups.title!.trim(),
      season: Number(m.groups.season),
      episode: Number(m.groups.episode),
      originalKeyword: raw,
    };
  }

  const seasonPatterns: Array<{
    re: RegExp;
    season: (mm: RegExpMatchArray) => number | null;
  }> = [
    {
      re: /^(.*?)\s*(?:S|Season)\s*(\d{1,2})$/i,
      season: (mm) => Number(mm[2]),
    },
    {
      re: /^(.*?)\s*第\s*([一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾\d]+)\s*[季部]$/iu,
      season: (mm) => chineseNumToInt(mm[2]!),
    },
    {
      re: /^(.*?)\s*([Ⅰ-Ⅻ])$/u,
      season: (mm) => FULLWIDTH_ROMAN_MAP[mm[2]!] ?? null,
    },
    {
      re: /^(.*?)\s+([IVXLCDM]+)$/i,
      season: (mm) => romanToInt(mm[2]!),
    },
    {
      re: /^(.*?)\s+(\d{1,2})$/,
      season: (mm) => Number(mm[2]),
    },
  ];

  for (const { re, season } of seasonPatterns) {
    const mm = raw.match(re);
    if (!mm) continue;
    try {
      const title = mm[1]!.trim();
      const s = season(mm);
      if (s != null && s > 0 && !(title.length > 4 && /\d{4}$/.test(title))) {
        return { title, season: s, episode: null, originalKeyword: raw };
      }
    } catch {
      /* continue */
    }
  }

  const fromTitle = extractSeasonFromTitle(raw);
  if (fromTitle != null) {
    return {
      title: normalizeTitleSeason(raw),
      season: fromTitle,
      episode: null,
      originalKeyword: raw,
    };
  }

  return empty;
}

/** 生成 danmu_api 文件名提示：`剧名 S01E02` */
export function formatSeasonEpisodeCode(
  season: number,
  episode: number,
): string {
  const s = Math.max(1, Math.floor(season) || 1);
  const e = Math.max(1, Math.floor(episode) || 1);
  return `S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}`;
}
