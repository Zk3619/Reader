/**
 * E6.2：番剧时间表（按追番列表的 updatedAt 分组；无外部日历 API）
 * 诚实空态：无追番时提示；有追番则按「最近更新日」展示
 */

import type { BangumiFollow } from '@/lib/media/video/bangumi/rules';

export type BangumiScheduleDay = {
  /** YYYY-MM-DD */
  date: string;
  label: string;
  items: BangumiFollow[];
};

function dayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const week = ['日', '一', '二', '三', '四', '五', '六'][dt.getDay()];
  const today = dayKey(Date.now());
  if (date === today) return `今天（周${week}）`;
  return `${m}/${d} 周${week}`;
}

/** 将追番按「最后更新日」归入时间表；无数据返回空数组 */
export function buildBangumiSchedule(follows: BangumiFollow[]): BangumiScheduleDay[] {
  if (!follows.length) return [];
  const map = new Map<string, BangumiFollow[]>();
  for (const f of follows) {
    const key = dayKey(f.updatedAt || Date.now());
    const list = map.get(key) ?? [];
    list.push(f);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({
      date,
      label: dayLabel(date),
      items: items.sort((a, b) => b.updatedAt - a.updatedAt),
    }));
}
