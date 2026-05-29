/**
 * 阅读器九宫格点击动作（对齐 Legado AppConfig.clickAction*）
 */

export type ReaderClickZone =
  | 'tl'
  | 'tc'
  | 'tr'
  | 'ml'
  | 'mc'
  | 'mr'
  | 'bl'
  | 'bc'
  | 'br';

/** Legado 动作编号子集 */
export type ReaderClickActionId =
  | 'menu'
  | 'nextPage'
  | 'prevPage'
  | 'nextChapter'
  | 'prevChapter'
  | 'none';

export type ReaderClickActions = Record<ReaderClickZone, ReaderClickActionId>;

/** 九宫格展示顺序（行优先） */
export const READER_CLICK_ZONES: ReaderClickZone[] = [
  'tl',
  'tc',
  'tr',
  'ml',
  'mc',
  'mr',
  'bl',
  'bc',
  'br',
];

export const CLICK_ACTION_LABELS: Record<ReaderClickActionId, string> = {
  menu: '菜单',
  nextPage: '下一页',
  prevPage: '上一页',
  nextChapter: '下一章',
  prevChapter: '上一章',
  none: '无',
};

export const CLICK_ZONE_LABELS: Record<ReaderClickZone, string> = {
  tl: '左上',
  tc: '上中',
  tr: '右上',
  ml: '左中',
  mc: '正中',
  mr: '右中',
  bl: '左下',
  bc: '下中',
  br: '右下',
};

export const CLICK_ACTION_OPTIONS = Object.keys(
  CLICK_ACTION_LABELS,
) as ReaderClickActionId[];

export const DEFAULT_CLICK_ACTIONS: ReaderClickActions = {
  tl: 'prevPage',
  tc: 'prevPage',
  tr: 'nextPage',
  ml: 'prevPage',
  mc: 'menu',
  mr: 'nextPage',
  bl: 'prevChapter',
  bc: 'nextChapter',
  br: 'nextChapter',
};

export function getClickActionForZone(
  actions: ReaderClickActions,
  zone: ReaderClickZone,
): ReaderClickActionId {
  return actions[zone] ?? DEFAULT_CLICK_ACTIONS[zone];
}

export { resolveClickZone } from '@/lib/reader/reader-click-region';
