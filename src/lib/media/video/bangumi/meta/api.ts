/**
 * Bangumi.tv HTTP（经 tvRequest，避免 WebView CORS）
 */

import { tvRequest } from '@/lib/media/tv/net/rules';
import {
  resolveBangumiApiBase,
  resolveBangumiNextBase,
} from '@/lib/media/video/bangumi/meta/prefs';
import type {
  BangumiCalendarDay,
  BangumiComment,
  BangumiListFilter,
  BangumiSearchResult,
  BangumiSubject,
} from '@/lib/media/video/bangumi/meta/types';
import { WEEKDAY_LABELS } from '@/lib/media/video/bangumi/meta/types';

const UA = 'ReaderBangumi/1.0 (https://github.com/local/reader)';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function coverFromImages(images: unknown): string {
  if (!isRecord(images)) return '';
  return String(
    images.large || images.common || images.medium || images.small || images.grid || '',
  );
}

export function parseBangumiSubject(raw: unknown): BangumiSubject | null {
  if (!isRecord(raw)) return null;
  const id = Number(raw.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const rating = isRecord(raw.rating) ? raw.rating : {};
  const tagsRaw = Array.isArray(raw.tags) ? raw.tags : [];
  const tags = tagsRaw
    .map((t) => (isRecord(t) ? String(t.name || '') : String(t || '')))
    .filter(Boolean);
  const date = String(raw.date || raw.air_date || '');
  let airWeekday = Number(raw.air_weekday ?? 0);
  if (!airWeekday && date) {
    try {
      const d = new Date(date);
      if (!Number.isNaN(d.getTime())) {
        const js = d.getDay();
        airWeekday = js === 0 ? 7 : js;
      }
    } catch {
      /* */
    }
  }
  const name = String(raw.name || '').trim();
  // 保留真实中文名；空则留空，由 displayName 按语言回退，避免 nameCn===name 导致无法跟语言切换
  const nameCn = String(raw.name_cn ?? raw.nameCn ?? raw.nameCN ?? '').trim();
  return {
    id,
    name,
    nameCn,
    summary: String(raw.summary || ''),
    cover: coverFromImages(raw.images) || String(raw.image || ''),
    score: Number(rating.score ?? raw.score ?? 0) || 0,
    rank: Number(rating.rank ?? raw.rank ?? 0) || 0,
    votes: Number(rating.total ?? raw.votes ?? 0) || 0,
    airDate: date,
    airWeekday: airWeekday >= 1 && airWeekday <= 7 ? airWeekday : 0,
    tags,
    nsfw: raw.nsfw === true,
    eps: Number(raw.eps ?? raw.total_episodes ?? 0) || undefined,
  };
}

async function bgmJson(
  url: string,
  init?: { method?: string; body?: string },
): Promise<unknown> {
  const res = await tvRequest(url, {
    method: (init?.method as 'GET' | 'POST') || 'GET',
    body: init?.body,
    headers: {
      Accept: 'application/json',
      'User-Agent': UA,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    useBackendHttp: true,
    timeout: 30000,
  });
  if (!res.ok) {
    throw new Error(`Bangumi HTTP ${res.status}`);
  }
  const text = await res.text();
  if (!text.trim()) return null;
  return JSON.parse(text) as unknown;
}

export async function fetchBangumiSubject(id: number): Promise<BangumiSubject> {
  const { getBangumiSubjectCached, upsertBangumiSubjectCache } = await import(
    '@/lib/media/video/bangumi/db/subjects-dao'
  );
  const cached = await getBangumiSubjectCached(id, 6 * 60 * 60 * 1000);
  if (cached) return cached;
  const base = resolveBangumiApiBase();
  const data = await bgmJson(`${base}/v0/subjects/${id}`);
  const s = parseBangumiSubject(data);
  if (!s) throw new Error(`无效条目 ${id}`);
  void upsertBangumiSubjectCache(s, data).catch((e) =>
    console.warn('[bangumi] subject cache failed', e),
  );
  return s;
}

export async function searchBangumiSubjects(
  keyword: string,
  opts?: {
    limit?: number;
    offset?: number;
    filter?: import('./search-filter').BangumiSearchFilterState;
  },
): Promise<BangumiSearchResult & { rawCount: number }> {
  const {
    buildBangumiSearchParams,
    normalizeBangumiSearchFilter,
    parseBangumiSearchQuery,
  } = await import('./search-filter');

  const parsed = parseBangumiSearchQuery(keyword);
  if (parsed.id) {
    try {
      const s = await fetchBangumiSubject(parsed.id);
      return { items: [s], total: 1, rawCount: 1 };
    } catch {
      return { items: [], total: 0, rawCount: 0 };
    }
  }

  const baseFilter = normalizeBangumiSearchFilter({
    ...opts?.filter,
    ...parsed.patch,
    tags: [
      ...new Set([...(opts?.filter?.tags ?? []), ...(parsed.patch.tags ?? [])]),
    ],
  });
  const q = parsed.keyword;
  // Kazumi 允许空关键词 + 高级筛选；无词且无筛选则空
  const { hasAdvancedSearchFilters } = await import('./search-filter');
  if (!q && !hasAdvancedSearchFilters(baseFilter)) {
    return { items: [], total: 0, rawCount: 0 };
  }

  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;
  const params = buildBangumiSearchParams(q, baseFilter);
  const base = resolveBangumiApiBase();
  const url = `${base}/v0/search/subjects?limit=${limit}&offset=${offset}`;
  const data = await bgmJson(url, { method: 'POST', body: JSON.stringify(params) });
  if (!isRecord(data)) return { items: [], total: 0, rawCount: 0 };
  const list = Array.isArray(data.data) ? data.data : [];
  const rawCount = list.length;
  // 对齐 Kazumi「丢弃无标题」：其 fromJson 会把空 name_cn 回填为 name，等价于无 nameCn 且无 name
  const items = list
    .map((x) => parseBangumiSubject(x))
    .filter((x): x is BangumiSubject => x != null && !!(x.nameCn || x.name).trim());
  return {
    items,
    total: Number(data.total ?? items.length) || items.length,
    rawCount,
  };
}

/** 热门/排行：对齐 Kazumi Popular
 * - 热门 → next.bgm.tv `/p1/trending/subjects`（非规则源）
 * - 风格标签 → `/v0/search/subjects` + tag，nsfw=false
 */
export async function fetchBangumiRankedList(
  filter?: BangumiListFilter,
): Promise<BangumiSearchResult> {
  const limit = filter?.limit ?? 24;
  const offset = filter?.offset ?? 0;
  const tag = filter?.tag?.trim();
  const isHot = !tag || tag === '热门';
  if (isHot) {
    return fetchBangumiTrendsList({ limit, offset });
  }

  const base = resolveBangumiApiBase();
  const url = `${base}/v0/search/subjects?limit=${limit}&offset=${offset}`;
  const body = JSON.stringify({
    keyword: '',
    sort: filter?.sort === 'date' ? 'date' : 'rank',
    filter: {
      type: [2],
      tag: [tag],
      rank: ['>0', '<=99999'],
      nsfw: false,
    },
  });
  const data = await bgmJson(url, { method: 'POST', body });
  if (!isRecord(data)) return { items: [], total: 0 };
  const list = Array.isArray(data.data) ? data.data : [];
  let items = list
    .map((x) => parseBangumiSubject(x))
    .filter((x): x is BangumiSubject => x != null);
  if (filter?.airing === 'airing') {
    items = items.filter((s) => !s.airDate || new Date(s.airDate).getTime() <= Date.now() + 86400000);
  } else if (filter?.airing === 'finished') {
    items = items.filter((s) => s.eps != null && s.eps > 0);
  }
  return { items, total: Number(data.total ?? items.length) || items.length };
}

/** 对齐 Kazumi getBangumiTrendsList */
export async function fetchBangumiTrendsList(opts?: {
  limit?: number;
  offset?: number;
  type?: number;
}): Promise<BangumiSearchResult> {
  const limit = opts?.limit ?? 24;
  const offset = opts?.offset ?? 0;
  const type = opts?.type ?? 2;
  const next = resolveBangumiNextBase();
  const data = await bgmJson(
    `${next}/p1/trending/subjects?type=${type}&limit=${limit}&offset=${offset}`,
  );
  if (!isRecord(data)) return { items: [], total: 0 };
  const list = Array.isArray(data.data) ? data.data : [];
  const items = list
    .map((row) => {
      if (!isRecord(row)) return null;
      return parseBangumiSubject(row.subject ?? row);
    })
    .filter((x): x is BangumiSubject => x != null);
  return { items, total: Number(data.total ?? items.length) || items.length };
}


const CALENDAR_CACHE_TTL_MS = 30 * 60 * 1000;
let calendarCache: { at: number; data: BangumiCalendarDay[] } | null = null;
let calendarInflight: Promise<BangumiCalendarDay[]> | null = null;

export function invalidateBangumiCalendarCache(): void {
  calendarCache = null;
  calendarInflight = null;
}

export async function fetchBangumiCalendar(opts?: {
  force?: boolean;
}): Promise<BangumiCalendarDay[]> {
  if (
    !opts?.force &&
    calendarCache &&
    Date.now() - calendarCache.at < CALENDAR_CACHE_TTL_MS
  ) {
    return calendarCache.data;
  }
  if (!opts?.force && calendarInflight) return calendarInflight;

  const run = (async (): Promise<BangumiCalendarDay[]> => {
    const next = resolveBangumiNextBase();
    try {
      const data = await bgmJson(`${next}/p1/calendar`);
      if (isRecord(data)) {
        const days: BangumiCalendarDay[] = [];
        for (let i = 1; i <= 7; i++) {
          const arr = data[String(i)];
          const items: BangumiSubject[] = [];
          if (Array.isArray(arr)) {
            for (const row of arr) {
              const sub = isRecord(row) ? row.subject ?? row : row;
              const s = parseBangumiSubject(sub);
              if (s) {
                if (!s.airWeekday) s.airWeekday = i;
                items.push(s);
              }
            }
          }
          days.push({
            weekday: i,
            label: WEEKDAY_LABELS[i - 1] || String(i),
            items,
          });
        }
        calendarCache = { at: Date.now(), data: days };
        return days;
      }
    } catch (e) {
      console.warn('[bangumi-meta] calendar next failed', e);
    }
    // 回退：官方旧 calendar
    try {
      const base = resolveBangumiApiBase();
      const data = await bgmJson(`${base}/calendar`);
      if (!Array.isArray(data)) {
        const empty = emptyCalendar();
        calendarCache = { at: Date.now(), data: empty };
        return empty;
      }
      const days = data.map((day, idx) => {
        const weekday = idx + 1;
        const items: BangumiSubject[] = [];
        if (isRecord(day) && Array.isArray(day.items)) {
          for (const it of day.items) {
            const s = parseBangumiSubject(isRecord(it) ? it.subject ?? it : it);
            if (s) {
              s.airWeekday = weekday;
              items.push(s);
            }
          }
        }
        return {
          weekday,
          label: WEEKDAY_LABELS[idx] || String(weekday),
          items,
        };
      });
      calendarCache = { at: Date.now(), data: days };
      return days;
    } catch (e) {
      console.warn('[bangumi-meta] calendar fallback failed', e);
      return emptyCalendar();
    }
  })();

  calendarInflight = run;
  try {
    return await run;
  } finally {
    if (calendarInflight === run) calendarInflight = null;
  }
}

function emptyCalendar(): BangumiCalendarDay[] {
  return WEEKDAY_LABELS.map((label, i) => ({
    weekday: i + 1,
    label,
    items: [],
  }));
}

export async function fetchBangumiComments(
  subjectId: number,
  opts?: { limit?: number; offset?: number },
): Promise<BangumiComment[]> {
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;
  const next = resolveBangumiNextBase();
  try {
    const data = await bgmJson(
      `${next}/p1/subjects/${subjectId}/comments?limit=${limit}&offset=${offset}`,
    );
    const list = isRecord(data) && Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
    return list
      .map((row, i): BangumiComment | null => {
        if (!isRecord(row)) return null;
        const user = isRecord(row.user) ? row.user : {};
        return {
          id: String(row.id ?? `${subjectId}-${i}`),
          userName: String(user.nickname || user.username || row.user_name || '匿名'),
          avatar: String(user.avatar || ''),
          comment: String(row.comment || row.content || ''),
          score: Number(row.rate ?? row.score ?? 0) || undefined,
          updatedAt: String(row.updated_at || row.created_at || ''),
        };
      })
      .filter((x): x is BangumiComment => x != null && !!x.comment);
  } catch (e) {
    console.warn('[bangumi-meta] comments failed', e);
    return [];
  }
}
