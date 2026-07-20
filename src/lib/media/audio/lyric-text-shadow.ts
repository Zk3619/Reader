/**
 * 歌词 text-shadow：对齐 LX Music 桌面歌词描边（layout.less stroke / stroke3 / stroke4）。
 */

import { parseColor } from '@/lib/color-utils';

/** 相对亮度 0–1；透明色按中性灰底估算 */
export function lyricColorLuminance(input: string | undefined, fallback = 0.5): number {
  if (!input?.trim()) return fallback;
  const rgba = parseColor(input);
  if (!rgba) return fallback;
  const a = rgba.a;
  const r = rgba.r * a + 128 * (1 - a);
  const g = rgba.g * a + 128 * (1 - a);
  const b = rgba.b * a + 128 * (1 - a);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

const DEFAULT_SHADOW = 'rgba(0, 0, 0, 0.18)';

const shadowCache = new Map<string, string | undefined>();

function cacheKey(opts: Parameters<typeof buildLyricTextShadow>[0]): string {
  return [
    opts.enabled ? 1 : 0,
    opts.shadowColor ?? '',
    opts.transparentBackdrop ? 1 : 0,
    opts.mode ?? 'line',
    opts.direction ?? 'horizontal',
  ].join('|');
}

/** 对齐 LX RGB_Alpha_Shade(0.49, color) → alpha × 0.51 */
export function shadowFontModeColor(shadowColor: string | undefined): string {
  const rgba = parseColor(shadowColor?.trim() || DEFAULT_SHADOW);
  if (!rgba) return 'rgba(0,0,0,0.09)';
  const a = Math.max(0, Math.min(1, rgba.a - rgba.a * 0.49));
  return `rgba(${rgba.r},${rgba.g},${rgba.b},${a.toFixed(2)})`;
}

function normalizeUserShadow(shadowColor: string | undefined): string {
  const color = shadowColor?.trim();
  if (!color) return '0 1px 4px rgba(0,0,0,.35)';
  if (/^\d/.test(color) || color.includes('px')) return color;
  return `0 1px 4px ${color}`;
}

function joinStroke(offsets: readonly (readonly [string, string])[], color: string): string {
  return offsets.map(([x, y]) => `${x} ${y} 0 ${color}`).join(', ');
}

/** 对齐 LX .stroke(1px) — 逐字 shadow 层 */
function buildStroke1px(color: string): string {
  const parts: string[] = [];
  const radius = 1;
  for (let i = 0; i <= radius; i++) {
    for (let j = 0; j <= radius; j++) {
      const x = `${i}px`;
      const y = `${j}px`;
      parts.push(`${x} ${y} 0 ${color}`);
      parts.push(`${x} ${-j}px 0 ${color}`);
      parts.push(`${-i}px ${-j}px 0 ${color}`);
      parts.push(`${-i}px ${y} 0 ${color}`);
    }
  }
  parts.push(`0 0 0 ${color}`);
  return parts.join(', ');
}

/** 对齐 LX .stroke3 — 横排逐行（使用 font-mode 淡化色） */
const STROKE3_OFFSETS = [
  ['0.04em', '0.04em'],
  ['0.04em', '-0.03em'],
  ['-0.04em', '-0.03em'],
  ['-0.04em', '0.04em'],
  ['0.04em', '0.01em'],
  ['0.04em', '-0.01em'],
  ['-0.04em', '-0.01em'],
  ['-0.04em', '0.01em'],
  ['0.04em', '0px'],
  ['0.04em', '0px'],
  ['-0.04em', '0px'],
  ['-0.04em', '0px'],
  ['0.01em', '0.04em'],
  ['0.01em', '-0.03em'],
  ['-0.01em', '-0.03em'],
  ['-0.01em', '0.04em'],
  ['0.01em', '0.01em'],
  ['0.01em', '-0.01em'],
  ['-0.01em', '-0.01em'],
  ['-0.01em', '0.01em'],
  ['0.01em', '0px'],
  ['0.01em', '0px'],
  ['-0.01em', '0px'],
  ['-0.01em', '0px'],
  ['0px', '0.04em'],
  ['0px', '-0.03em'],
  ['0px', '-0.03em'],
  ['0px', '0.04em'],
  ['0px', '0.01em'],
  ['0px', '-0.01em'],
  ['0px', '-0.01em'],
  ['0px', '0.01em'],
] as const;

/** 对齐 LX .stroke4 — 竖排逐行 */
const STROKE4_OFFSETS = [
  ['0.02em', '-0.02em'],
  ['-0.02em', '-1px'],
  ['-0.02em', '1px'],
  ['0.02em', '1px'],
  ['0.02em', '-1px'],
  ['-0.02em', '0px'],
  ['-0.02em', '0px'],
  ['0.02em', '0px'],
  ['0.02em', '0px'],
  ['-1px', '-1px'],
  ['-1px', '1px'],
  ['1px', '1px'],
  ['1px', '-1px'],
  ['-1px', '0px'],
  ['-1px', '0px'],
  ['1px', '0px'],
  ['1px', '0px'],
] as const;

function buildStroke3(color: string): string {
  return joinStroke(STROKE3_OFFSETS, color);
}

function buildStroke4(color: string): string {
  return joinStroke(STROKE4_OFFSETS, color);
}

export function buildLyricTextShadow(opts: {
  enabled?: boolean;
  shadowColor?: string;
  /** 桌面歌词等透明底场景 */
  transparentBackdrop?: boolean;
  /** line: 整句；font: 卡拉 OK shadow 层 */
  mode?: 'line' | 'font';
  direction?: 'horizontal' | 'vertical';
}): string | undefined {
  const key = cacheKey(opts);
  if (shadowCache.has(key)) return shadowCache.get(key);

  let result: string | undefined;
  if (!opts.enabled) {
    result = undefined;
  } else {
    const shadow = opts.shadowColor?.trim() || DEFAULT_SHADOW;
    if (!opts.transparentBackdrop) {
      result = normalizeUserShadow(shadow);
    } else if (opts.mode === 'font') {
      result = buildStroke1px(shadowFontModeColor(shadow));
    } else if (opts.direction === 'vertical') {
      result = buildStroke4(shadow);
    } else {
      result = buildStroke3(shadowFontModeColor(shadow));
    }
  }

  shadowCache.set(key, result);
  return result;
}

const strokeStyleCache = new Map<string, Record<string, string> | undefined>();

function strokeStyleCacheKey(opts: Parameters<typeof buildLyricTextStrokeStyle>[0]): string {
  return [
    opts.enabled ? 1 : 0,
    opts.shadowColor ?? '',
    opts.mode ?? 'line',
    opts.direction ?? 'horizontal',
  ].join('|');
}

/**
 * 透明底桌面歌词：用单描边替代多层 text-shadow，避免 WebView 叠色产生重影。
 * 非透明场景仍用 buildLyricTextShadow。
 */
export function buildLyricTextStrokeStyle(opts: {
  enabled?: boolean;
  shadowColor?: string;
  mode?: 'line' | 'font';
  direction?: 'horizontal' | 'vertical';
}): Record<string, string> | undefined {
  const key = strokeStyleCacheKey(opts);
  if (strokeStyleCache.has(key)) return strokeStyleCache.get(key);

  let result: Record<string, string> | undefined;
  if (!opts.enabled) {
    result = undefined;
  } else {
    const shadow = opts.shadowColor?.trim() || DEFAULT_SHADOW;
    const strokeColor =
      opts.mode === 'font' || opts.direction !== 'vertical'
        ? shadowFontModeColor(shadow)
        : shadow;
    const strokeWidth =
      opts.mode === 'font' ? '1px' : opts.direction === 'vertical' ? '0.02em' : '0.04em';
    result = {
      '-webkit-text-stroke': `${strokeWidth} ${strokeColor}`,
      'paint-order': 'stroke fill',
    };
  }

  strokeStyleCache.set(key, result);
  return result;
}

/** 字体外发光（对齐阅读器胶囊 capsuleGlow，强度减轻） */
export function buildLyricTextGlow(shadowColor: string | undefined): string {
  const rgba = parseColor(shadowColor?.trim() || DEFAULT_SHADOW);
  if (!rgba) return '0 0 6px rgba(0,0,0,0.12)';
  const ringA = Math.min(1, rgba.a * 0.38);
  const glowA = Math.min(1, rgba.a * 0.24);
  const haloA = Math.min(1, rgba.a * 0.11);
  const ring = `rgba(${rgba.r},${rgba.g},${rgba.b},${ringA.toFixed(2)})`;
  const glow = `rgba(${rgba.r},${rgba.g},${rgba.b},${glowA.toFixed(2)})`;
  const halo = `rgba(${rgba.r},${rgba.g},${rgba.b},${haloA.toFixed(2)})`;
  return `0 0 0 0.5px ${ring}, 0 0 8px ${glow}, 0 0 3px ${halo}`;
}

const effectStyleCache = new Map<string, Record<string, string> | undefined>();

function effectStyleCacheKey(opts: Parameters<typeof buildLyricTextEffectStyle>[0]): string {
  return [
    opts.enabled ? 1 : 0,
    opts.shadowColor ?? '',
    opts.transparentBackdrop ? 1 : 0,
    opts.mode ?? 'line',
    opts.direction ?? 'horizontal',
  ].join('|');
}

/** 描边 + 外发光（透明底）；非透明底为 soft shadow + 轻外发光 */
export function buildLyricTextEffectStyle(opts: {
  enabled?: boolean;
  shadowColor?: string;
  transparentBackdrop?: boolean;
  mode?: 'line' | 'font';
  direction?: 'horizontal' | 'vertical';
}): Record<string, string> | undefined {
  const key = effectStyleCacheKey(opts);
  if (effectStyleCache.has(key)) return effectStyleCache.get(key);

  let result: Record<string, string> | undefined;
  if (!opts.enabled) {
    result = undefined;
  } else if (opts.transparentBackdrop) {
    const stroke = buildLyricTextStrokeStyle(opts);
    const glow = buildLyricTextGlow(opts.shadowColor);
    result = { ...(stroke ?? {}), 'text-shadow': glow };
  } else {
    const soft = buildLyricTextShadow({ ...opts, transparentBackdrop: false });
    const glow = buildLyricTextGlow(opts.shadowColor);
    const parts = [soft, glow].filter(Boolean);
    result = parts.length > 0 ? { 'text-shadow': parts.join(', ') } : undefined;
  }

  effectStyleCache.set(key, result);
  return result;
}
