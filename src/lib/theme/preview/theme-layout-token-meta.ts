/**
 * 布局 Token 字段类型 — 驱动 Inspector 参数化控件
 */

import type { LayoutTokens } from '@/lib/theme/types';

export type LayoutTokenFieldKind = 'length' | 'time' | 'easing' | 'percent';

const LENGTH_KEYS = new Set<keyof LayoutTokens>([
  'radius',
  'appBarHeight',
  'readerTopBarHeight',
  'readerBottomBarHeight',
  'readerFooterMaxHeight',
  'readerScrollbarSize',
  'readerBrightnessChromeGap',
  'mobileSafeTop',
  'mobileSafeBottomGesture',
  'mobileSafeBottomButtons',
]);

const TIME_KEYS = new Set<keyof LayoutTokens>([
  'readerBarDuration',
  'searchLoopDuration',
]);

const EASING_KEYS = new Set<keyof LayoutTokens>([
  'readerBarEasingEnter',
  'readerBarEasingExit',
]);

const PERCENT_KEYS = new Set<keyof LayoutTokens>(['searchLoopMinWidth']);

export function layoutTokenFieldKind(key: keyof LayoutTokens): LayoutTokenFieldKind {
  if (LENGTH_KEYS.has(key)) return 'length';
  if (TIME_KEYS.has(key)) return 'time';
  if (EASING_KEYS.has(key)) return 'easing';
  if (PERCENT_KEYS.has(key)) return 'percent';
  return 'length';
}

export function isLayoutSizeToken(key: keyof LayoutTokens): boolean {
  return layoutTokenFieldKind(key) === 'length';
}

export function isLayoutMotionToken(key: keyof LayoutTokens): boolean {
  const kind = layoutTokenFieldKind(key);
  return kind === 'time' || kind === 'easing' || kind === 'percent';
}
