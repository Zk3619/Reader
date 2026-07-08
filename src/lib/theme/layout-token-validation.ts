/**
 * 布局 token 值校验与预览（Studio 用）
 */

import type { LayoutTokens } from '@/lib/theme/types';

export interface LayoutTokenValidation {
  valid: boolean;
  hint?: string;
  /** 近似 px 预览（用于标尺） */
  previewPx?: number;
}

const LENGTH_PATTERN = /^-?\d*\.?\d+(px|rem|em|vh|vw|%|svh|dvh)?$/;
const TIME_PATTERN = /^-?\d*\.?\d+(ms|s)?$/;
const EASING_PATTERN = /^(linear|ease|ease-in|ease-out|ease-in-out|cubic-bezier\([^)]+\)|steps\([^)]+\))$/;

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
  'searchLoopMinWidth',
]);

const TIME_KEYS = new Set<keyof LayoutTokens>([
  'readerBarDuration',
  'searchLoopDuration',
]);

const EASING_KEYS = new Set<keyof LayoutTokens>([
  'readerBarEasingEnter',
  'readerBarEasingExit',
]);

const DEFAULT_ROOT_PX = 16;

function parseLengthToPx(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const match = trimmed.match(/^(-?\d*\.?\d+)(px|rem|em|vh|vw|%|svh|dvh)?$/);
  if (!match) return undefined;
  const num = parseFloat(match[1] ?? '0');
  const unit = match[2] ?? 'px';
  switch (unit) {
    case 'px':
      return num;
    case 'rem':
    case 'em':
      return num * DEFAULT_ROOT_PX;
    case 'vh':
    case 'svh':
    case 'dvh':
      return num * (typeof window !== 'undefined' ? window.innerHeight / 100 : 8);
    case 'vw':
      return num * (typeof window !== 'undefined' ? window.innerWidth / 100 : 4);
    case '%':
      return num * (DEFAULT_ROOT_PX / 100);
    default:
      return num;
  }
}

export function validateLayoutToken(key: keyof LayoutTokens, value: string): LayoutTokenValidation {
  const trimmed = value.trim();
  if (!trimmed) return { valid: false, hint: '不能为空' };

  if (LENGTH_KEYS.has(key)) {
    if (!LENGTH_PATTERN.test(trimmed)) {
      return { valid: false, hint: '期望长度：如 3.5rem、56px、12%' };
    }
    const previewPx = parseLengthToPx(trimmed);
    return { valid: true, previewPx, hint: previewPx != null ? `≈ ${Math.round(previewPx)}px` : undefined };
  }

  if (TIME_KEYS.has(key)) {
    if (!TIME_PATTERN.test(trimmed)) {
      return { valid: false, hint: '期望时间：如 0.4s、400ms' };
    }
    return { valid: true };
  }

  if (EASING_KEYS.has(key)) {
    if (!EASING_PATTERN.test(trimmed)) {
      return { valid: false, hint: '期望缓动：cubic-bezier(...) 或 ease-in-out' };
    }
    return { valid: true };
  }

  return { valid: true };
}

/** 生成简易标尺宽度（px） */
export function layoutTokenRulerWidthPx(key: keyof LayoutTokens, value: string): number | undefined {
  if (!LENGTH_KEYS.has(key)) return undefined;
  const px = parseLengthToPx(value);
  if (px == null || !Number.isFinite(px)) return undefined;
  return Math.min(Math.max(Math.round(px), 4), 320);
}
