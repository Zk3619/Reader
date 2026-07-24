/**
 * 番剧搜索筛选：对齐 Kazumi SearchFilterState / buildBangumiSearchParams
 */

export type BangumiSearchSort = 'heat' | 'rank' | 'score' | 'match';

export type BangumiSearchMatchMode = 'normal' | 'exact' | 'fuzzy';

export type BangumiSearchDateRange = { start: string; end: string };
export type BangumiSearchNumRange = { min?: number; max?: number };

export type BangumiSearchFilterState = {
  tags: string[];
  sort: BangumiSearchSort;
  /** YYYYQn，空=不限；与自定义日期互斥优先自定义 */
  season: string;
  dateRange: BangumiSearchDateRange | null;
  rankRange: BangumiSearchNumRange | null;
  scoreRange: BangumiSearchNumRange | null;
  weekdays: number[];
  /** 客户端：隐藏看过（需收藏分型；暂无效果） */
  hideWatched: boolean;
  /** 客户端：隐藏弃番（需收藏分型；暂无效果） */
  hideAbandoned: boolean;
};

export const DEFAULT_BANGUMI_SEARCH_FILTER: BangumiSearchFilterState = {
  tags: [],
  sort: 'heat',
  season: '',
  dateRange: null,
  rankRange: null,
  scoreRange: null,
  weekdays: [],
  hideWatched: false,
  hideAbandoned: false,
};

/** 对齐 Kazumi defaultAnimeTags（不含浏览页「热门」） */
export const BANGUMI_SEARCH_PRESET_TAGS = [
  '日常',
  '原创',
  '校园',
  '搞笑',
  '奇幻',
  '百合',
  '恋爱',
  '悬疑',
  '热血',
  '后宫',
  '机战',
  '轻改',
  '偶像',
  '治愈',
  '异世界',
] as const;

export const BANGUMI_SEARCH_SORT_OPTIONS: {
  value: BangumiSearchSort;
  label: string;
  hint: string;
}[] = [
  { value: 'heat', label: '热度', hint: '按热度排序' },
  { value: 'rank', label: '排名', hint: '按 Bangumi 排名' },
  { value: 'score', label: '评分', hint: '按评分排序' },
  { value: 'match', label: '匹配', hint: '按关键词相关度' },
];

const SORT_SET = new Set<string>(['heat', 'rank', 'score', 'match']);

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function formatYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 日式季度窗：Q1 从上年 12 月起（对齐 Kazumi seasonToDateRange） */
export function seasonToDateRange(season: string): BangumiSearchDateRange | null {
  const m = /^(\d{4})Q([1-4])$/i.exec(season.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const quarter = Number(m[2]);
  const startMonth = (quarter - 1) * 3 + 1; // 1,4,7,10
  const start = new Date(year, startMonth - 2, 1); // month index: startMonth-1-1
  const end = new Date(year, startMonth + 1, 1); // exclusive end = startMonth+2 as 1-based → index startMonth+1
  return { start: formatYmd(start), end: formatYmd(end) };
}

export function buildSeasonOptions(yearsBack = 20): { value: string; label: string }[] {
  const now = new Date();
  const y = now.getFullYear();
  const labels = ['冬季', '春季', '夏季', '秋季'] as const;
  const out: { value: string; label: string }[] = [];
  for (let yi = 0; yi <= yearsBack; yi++) {
    const year = y - yi;
    for (let q = 4; q >= 1; q--) {
      out.push({ value: `${year}Q${q}`, label: `${year} ${labels[q - 1]}` });
    }
  }
  return out;
}

export function isNumRangeValid(r: BangumiSearchNumRange | null | undefined): boolean {
  if (!r) return false;
  return r.min != null || r.max != null;
}

export function isDateRangeValid(r: BangumiSearchDateRange | null | undefined): boolean {
  return !!r && !!r.start.trim() && !!r.end.trim();
}

export function effectiveSearchDateRange(
  f: BangumiSearchFilterState,
): BangumiSearchDateRange | null {
  if (isDateRangeValid(f.dateRange)) return f.dateRange;
  if (f.season.trim()) return seasonToDateRange(f.season);
  return null;
}

export function hasAdvancedSearchFilters(f: BangumiSearchFilterState): boolean {
  return (
    f.tags.length > 0 ||
    f.sort !== 'heat' ||
    !!f.season.trim() ||
    isDateRangeValid(f.dateRange) ||
    isNumRangeValid(f.rankRange) ||
    isNumRangeValid(f.scoreRange) ||
    f.weekdays.length > 0
  );
}

function buildNumberFilter(min?: number, max?: number): string[] {
  const out: string[] = [];
  if (min != null) out.push(`>=${min}`);
  if (max != null) out.push(`<=${max}`);
  return out;
}

/** 对齐 Kazumi BangumiApi.buildBangumiSearchParams */
export function buildBangumiSearchParams(
  keyword: string,
  filter: BangumiSearchFilterState,
): {
  keyword: string;
  sort: string;
  filter: Record<string, unknown>;
} {
  const sort = SORT_SET.has(filter.sort) ? filter.sort : 'heat';
  const rankFilter = isNumRangeValid(filter.rankRange)
    ? buildNumberFilter(filter.rankRange!.min, filter.rankRange!.max)
    : sort === 'rank'
      ? ['>0', '<=99999']
      : ['>=0', '<=99999'];

  const bodyFilter: Record<string, unknown> = {
    type: [2],
    tag: filter.tags.slice(),
    rank: rankFilter,
    nsfw: false,
  };

  const date = effectiveSearchDateRange(filter);
  if (date) {
    bodyFilter.air_date = [`>=${date.start}`, `<${date.end}`];
  }
  if (isNumRangeValid(filter.scoreRange)) {
    bodyFilter.rating = buildNumberFilter(filter.scoreRange!.min, filter.scoreRange!.max);
  }
  if (filter.weekdays.length) {
    bodyFilter.air_weekday = [...new Set(filter.weekdays)]
      .filter((d) => d >= 1 && d <= 7)
      .sort((a, b) => a - b);
  }

  return {
    keyword: keyword.trim(),
    sort,
    filter: bodyFilter,
  };
}

/** 从输入解析 id:123 / tag: / sort: 等（对齐 SearchParser 精简版） */
export function parseBangumiSearchQuery(query: string): {
  id: number | null;
  keyword: string;
  patch: Partial<BangumiSearchFilterState>;
} {
  const q = query.trim();
  const idM = /\bid:(\d+)\b/i.exec(q);
  const id = idM ? Number(idM[1]) : null;

  const tags = [
    ...q.matchAll(
      /(?:^|\s)tag:([^\s]+?)(?=(?:id|tag|sort|season|date|rank|score|weekday|nsfw):|\s|$)/gi,
    ),
  ]
    .map((m) => (m[1] || '').trim())
    .filter(Boolean);

  const sortM = /\bsort:([\w-]+)\b/i.exec(q);
  const sortRaw = sortM?.[1]?.toLowerCase();
  const sort =
    sortRaw && SORT_SET.has(sortRaw) ? (sortRaw as BangumiSearchSort) : undefined;

  const seasonM = /\bseason:(\d{4}Q[1-4])\b/i.exec(q);
  const season = seasonM?.[1]?.toUpperCase();

  const dateM = /\bdate:(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})\b/i.exec(q);
  const dateRange = dateM
    ? { start: dateM[1]!, end: dateM[2]! }
    : undefined;

  const rankM = /\brank:(\d*)\.\.(\d*)\b/i.exec(q);
  let rankRange: BangumiSearchNumRange | null | undefined;
  if (rankM) {
    const min = rankM[1] ? Number(rankM[1]) : undefined;
    const max = rankM[2] ? Number(rankM[2]) : undefined;
    if (min != null || max != null) rankRange = { min, max };
  }

  const scoreM = /\bscore:(\d+(?:\.\d+)?)?\.\.(\d+(?:\.\d+)?)?\b/i.exec(q);
  let scoreRange: BangumiSearchNumRange | null | undefined;
  if (scoreM) {
    const min = scoreM[1] ? Number(scoreM[1]) : undefined;
    const max = scoreM[2] ? Number(scoreM[2]) : undefined;
    if (min != null || max != null) scoreRange = { min, max };
  }

  const wdM = /\bweekday:([1-7](?:,[1-7])*)\b/i.exec(q);
  const weekdays = wdM
    ? [
        ...new Set(
          wdM[1]!
            .split(',')
            .map((x) => Number(x))
            .filter((n) => n >= 1 && n <= 7),
        ),
      ].sort((a, b) => a - b)
    : undefined;

  const keyword = q
    .replace(/\b(?:id|tag|sort|season|date|rank|score|weekday|nsfw):[^\s]*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const patch: Partial<BangumiSearchFilterState> = {};
  if (tags.length) patch.tags = tags;
  if (sort) patch.sort = sort;
  if (season) patch.season = season;
  if (dateRange) {
    patch.dateRange = dateRange;
    patch.season = '';
  }
  if (rankRange) patch.rankRange = rankRange;
  if (scoreRange) patch.scoreRange = scoreRange;
  if (weekdays?.length) patch.weekdays = weekdays;

  return { id: id && id > 0 ? id : null, keyword, patch };
}

export function filterBangumiSearchByMatchMode<
  T extends { name: string; nameCn: string },
>(list: T[], keyword: string, mode: BangumiSearchMatchMode): T[] {
  const q = keyword.trim().toLowerCase();
  if (!q || mode === 'normal') return list;
  return list.filter((s) => {
    const name = `${s.nameCn || ''} ${s.name || ''}`.trim().toLowerCase();
    if (!name) return false;
    if (mode === 'exact') return name.includes(q);
    let i = 0;
    for (const ch of name) {
      if (ch === q[i]) {
        i += 1;
        if (i >= q.length) return true;
      }
    }
    return false;
  });
}

export function normalizeBangumiSearchFilter(
  partial?: Partial<BangumiSearchFilterState>,
): BangumiSearchFilterState {
  const p = partial ?? {};
  const sort = SORT_SET.has(String(p.sort))
    ? (p.sort as BangumiSearchSort)
    : DEFAULT_BANGUMI_SEARCH_FILTER.sort;
  return {
    tags: Array.isArray(p.tags)
      ? [...new Set(p.tags.map((t) => String(t).trim()).filter(Boolean))]
      : [],
    sort,
    season: typeof p.season === 'string' ? p.season.trim().toUpperCase() : '',
    dateRange: isDateRangeValid(p.dateRange) ? p.dateRange! : null,
    rankRange: isNumRangeValid(p.rankRange) ? { ...p.rankRange! } : null,
    scoreRange: isNumRangeValid(p.scoreRange) ? { ...p.scoreRange! } : null,
    weekdays: Array.isArray(p.weekdays)
      ? [...new Set(p.weekdays.map(Number).filter((d) => d >= 1 && d <= 7))].sort(
          (a, b) => a - b,
        )
      : [],
    hideWatched: p.hideWatched === true,
    hideAbandoned: p.hideAbandoned === true,
  };
}
