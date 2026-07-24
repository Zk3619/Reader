/** Kazumi 对齐的番剧风格分类（热门 = 无风格标签排行） */
export const BANGUMI_STYLE_TAGS = [
  '热门',
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

export type BangumiStyleTag = (typeof BANGUMI_STYLE_TAGS)[number];

/** 周一…周日（1–7），与 BGM calendar 一致 */
export const BANGUMI_WEEKDAYS = [
  { weekday: 1, label: '一' },
  { weekday: 2, label: '二' },
  { weekday: 3, label: '三' },
  { weekday: 4, label: '四' },
  { weekday: 5, label: '五' },
  { weekday: 6, label: '六' },
  { weekday: 7, label: '日' },
] as const;

export function currentBangumiWeekday(): number {
  const js = new Date().getDay();
  return js === 0 ? 7 : js;
}
