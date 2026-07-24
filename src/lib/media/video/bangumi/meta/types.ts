/**
 * Bangumi.tv 元数据模型（与规则源解耦）
 */

export type BangumiSubject = {
  id: number;
  name: string;
  nameCn: string;
  summary: string;
  cover: string;
  score: number;
  rank: number;
  /** 评分人数（热度排序，对齐 Kazumi votes） */
  votes: number;
  airDate: string;
  airWeekday: number;
  tags: string[];
  nsfw: boolean;
  eps?: number;
};

export type BangumiComment = {
  id: string;
  userName: string;
  avatar?: string;
  comment: string;
  score?: number;
  updatedAt?: string;
};

export type BangumiCalendarDay = {
  weekday: number;
  label: string;
  items: BangumiSubject[];
};

export type BangumiSearchResult = {
  items: BangumiSubject[];
  total: number;
};

export type BangumiListFilter = {
  /** 空=不限 */
  tag?: string;
  /** 放送中 / 完结等文案筛选，客户端侧 */
  airing?: 'all' | 'airing' | 'finished';
  sort?: 'rank' | 'heat' | 'date';
  limit?: number;
  offset?: number;
};

/** 时间表排序：对齐 Kazumi timeline（3=热度 / 2=评分 / 1=时间） */
export type BangumiTimelineSort = 'heat' | 'score' | 'id';

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;

/** 应用语言是否优先中文译名（zh-CN / zh-TW 等） */
export function prefersBangumiChineseName(language?: string): boolean {
  const lang = (language || '').trim().toLowerCase();
  return lang === 'zh' || lang.startsWith('zh-') || lang.startsWith('zh_');
}

/**
 * 按应用语言选展示名：中文系优先 nameCn，其它语言优先原名 name。
 * 两侧均回退到另一字段，避免空标题。
 */
export function displayName(
  s: Pick<BangumiSubject, 'name' | 'nameCn'> & { id?: number },
  language?: string,
): string {
  const cn = (s.nameCn || '').trim();
  const raw = (s.name || '').trim();
  const fallback = String(s.id ?? '');
  if (prefersBangumiChineseName(language)) return cn || raw || fallback;
  return raw || cn || fallback;
}

/** 时间表条目排序 */
export function sortBangumiSubjects(
  items: BangumiSubject[],
  sort: BangumiTimelineSort,
): BangumiSubject[] {
  const next = items.slice();
  switch (sort) {
    case 'score':
      next.sort((a, b) => b.score - a.score || a.id - b.id);
      break;
    case 'id':
      next.sort((a, b) => a.id - b.id);
      break;
    case 'heat':
    default:
      next.sort((a, b) => b.votes - a.votes || b.score - a.score || a.id - b.id);
      break;
  }
  return next;
}
