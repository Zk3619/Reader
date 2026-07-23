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
  return {
    id,
    name: String(raw.name || ''),
    nameCn: String(raw.name_cn || raw.nameCn || ''),
    summary: String(raw.summary || ''),
    cover: coverFromImages(raw.images) || String(raw.image || ''),
    score: Number(rating.score ?? raw.score ?? 0) || 0,
    rank: Number(rating.rank ?? raw.rank ?? 0) || 0,
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
  const base = resolveBangumiApiBase();
  const data = await bgmJson(`${base}/v0/subjects/${id}`);
  const s = parseBangumiSubject(data);
  if (!s) throw new Error(`无效条目 ${id}`);
  return s;
}

export async function searchBangumiSubjects(
  keyword: string,
  opts?: { limit?: number; offset?: number },
): Promise<BangumiSearchResult> {
  const q = keyword.trim();
  if (!q) return { items: [], total: 0 };
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;
  const base = resolveBangumiApiBase();
  const url = `${base}/v0/search/subjects?limit=${limit}&offset=${offset}`;
  const body = JSON.stringify({
    keyword: q,
    filter: { type: [2] },
  });
  const data = await bgmJson(url, { method: 'POST', body });
  if (!isRecord(data)) return { items: [], total: 0 };
  const list = Array.isArray(data.data) ? data.data : [];
  const items = list
    .map((x) => parseBangumiSubject(x))
    .filter((x): x is BangumiSubject => x != null);
  return { items, total: Number(data.total ?? items.length) || items.length };
}

/** 热门/排行：按 rank 搜动画 */
export async function fetchBangumiRankedList(
  filter?: BangumiListFilter,
): Promise<BangumiSearchResult> {
  const limit = filter?.limit ?? 24;
  const offset = filter?.offset ?? 0;
  const base = resolveBangumiApiBase();
  const url = `${base}/v0/search/subjects?limit=${limit}&offset=${offset}`;
  const tag = filter?.tag?.trim();
  const body = JSON.stringify({
    keyword: '',
    sort: filter?.sort === 'date' ? 'date' : 'rank',
    filter: {
      type: [2],
      ...(tag ? { tag: [tag] } : { tag: ['日本'] }),
      rank: ['>0', '<=99999'],
      nsfw: true,
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

export async function fetchBangumiCalendar(): Promise<BangumiCalendarDay[]> {
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
      return days;
    }
  } catch (e) {
    console.warn('[bangumi-meta] calendar next failed', e);
  }
  // 回退：官方旧 calendar
  try {
    const base = resolveBangumiApiBase();
    const data = await bgmJson(`${base}/calendar`);
    if (!Array.isArray(data)) return emptyCalendar();
    return data.map((day, idx) => {
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
  } catch (e) {
    console.warn('[bangumi-meta] calendar fallback failed', e);
    return emptyCalendar();
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
