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

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;

export function displayName(s: Pick<BangumiSubject, 'name' | 'nameCn'>): string {
  return (s.nameCn || s.name || '').trim() || String((s as BangumiSubject).id ?? '');
}
