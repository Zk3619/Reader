/**
 * 布局 token 值校验与预览（Studio 用）
 */

import type { LayoutTokens } from '@/lib/theme/types';
import { layoutTokenFieldKind } from '@/lib/theme/preview/theme-layout-token-meta';
import {
  parseThemeLength,
  parseThemePercent,
  themeLengthConversionHint,
  themeLengthToPreviewPx,
} from '@/lib/theme/preview/theme-size-units';
import { parseThemeDurationMs, resolveEasingPresetId } from '@/lib/theme/preview/theme-motion-presets';

export interface LayoutTokenValidation {
  valid: boolean;
  hint?: string;
  /** 近似 px 预览（用于标尺） */
  previewPx?: number;
}

const EASING_PATTERN = /^(linear|ease|ease-in|ease-out|ease-in-out|cubic-bezier\([^)]+\)|steps\([^)]+\))$/;

export function validateLayoutToken(key: keyof LayoutTokens, value: string): LayoutTokenValidation {
  const trimmed = value.trim();
  if (!trimmed) return { valid: false, hint: '不能为空' };

  const kind = layoutTokenFieldKind(key);

  if (kind === 'length') {
    const parsed = parseThemeLength(trimmed);
    if (!parsed) {
      return { valid: false, hint: '期望长度：输入数字并选择 rem 或 px' };
    }
    const previewPx = themeLengthToPreviewPx(trimmed);
    return {
      valid: true,
      previewPx,
      hint: themeLengthConversionHint(trimmed),
    };
  }

  if (kind === 'time') {
    if (parseThemeDurationMs(trimmed) == null) {
      return { valid: false, hint: '期望时间：输入毫秒数，如 400' };
    }
    return { valid: true };
  }

  if (kind === 'easing') {
    const presetId = resolveEasingPresetId(trimmed);
    if (presetId && presetId !== 'custom') return { valid: true };
    if (!EASING_PATTERN.test(trimmed)) {
      return { valid: false, hint: '期望缓动：从预设选择或填写 cubic-bezier(...)' };
    }
    return { valid: true };
  }

  if (kind === 'percent') {
    if (parseThemePercent(trimmed) == null) {
      return { valid: false, hint: '期望百分比：输入 0–100 之间的数字' };
    }
    return { valid: true };
  }

  return { valid: true };
}

/** 生成简易标尺宽度（px） */
export function layoutTokenRulerWidthPx(key: keyof LayoutTokens, value: string): number | undefined {
  if (layoutTokenFieldKind(key) !== 'length') return undefined;
  return themeLengthToPreviewPx(value);
}
