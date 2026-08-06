/**
 * 播放详情「前景色跟随封面」：从封面采样主色，派生同色相前景与浅色蒙层。
 */

import { rgbToHsl } from '@/lib/color-utils';

export interface PlayDetailAdaptivePalette {
  /** CSS 分量：`H S% L%`，供 hsl(var(--token)) */
  foreground: string;
  mutedForeground: string;
  background: string;
  muted: string;
  border: string;
  primary: string;
  primaryForeground: string;
  /** 叠在模糊封面上的蒙层（完整 CSS 色） */
  overlay: string;
}

function hslComponents(h: number, s: number, l: number): string {
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('blob:') && !src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('cover image load failed'));
    img.src = src;
  });
}

/**
 * 从封面图提取主色相，并按明暗模式生成与参考图类似的单色自适应配色。
 */
export async function extractPlayDetailAdaptivePalette(
  imageSrc: string,
  dark: boolean,
): Promise<PlayDetailAdaptivePalette | null> {
  if (!imageSrc.trim()) return null;

  let img: HTMLImageElement;
  try {
    img = await loadImage(imageSrc);
  } catch {
    return null;
  }

  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  try {
    ctx.drawImage(img, 0, 0, size, size);
  } catch {
    return null;
  }

  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, size, size);
  } catch {
    return null;
  }

  const buckets = new Map<number, { w: number; h: number; s: number; l: number }>();
  const pixels = data.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3] ?? 0;
    if (a < 128) continue;
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    const { h, s, l } = rgbToHsl(r, g, b);
    // 跳过近灰 / 过亮 / 过暗，优先彩色主调
    if (s < 12) continue;
    if (l < 8 || l > 92) continue;
    const key = Math.round(h / 12) * 12;
    const weight = (s / 100) * (1 - Math.abs(l - 45) / 55);
    const prev = buckets.get(key);
    if (prev) {
      prev.w += weight;
      prev.h += h * weight;
      prev.s += s * weight;
      prev.l += l * weight;
    } else {
      buckets.set(key, { w: weight, h: h * weight, s: s * weight, l: l * weight });
    }
  }

  let best: { w: number; h: number; s: number; l: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.w > best.w) best = bucket;
  }

  let h: number;
  let s: number;
  let l: number;
  if (best && best.w > 0) {
    h = best.h / best.w;
    s = best.s / best.w;
    l = best.l / best.w;
  } else {
    // 回退：全图平均（含灰）
    let tr = 0;
    let tg = 0;
    let tb = 0;
    let n = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if ((pixels[i + 3] ?? 0) < 128) continue;
      tr += pixels[i] ?? 0;
      tg += pixels[i + 1] ?? 0;
      tb += pixels[i + 2] ?? 0;
      n += 1;
    }
    if (n === 0) return null;
    const avg = rgbToHsl(tr / n, tg / n, tb / n);
    h = avg.h;
    s = Math.max(avg.s, 18);
    l = avg.l;
  }

  if (dark) {
    const fgS = clamp(s * 0.55, 22, 48);
    const fgL = clamp(72 + (50 - l) * 0.08, 68, 82);
    const mutedL = clamp(fgL - 10, 55, 72);
    const bgS = clamp(s * 0.35, 12, 32);
    const bgL = clamp(14 + s * 0.04, 10, 22);
    return {
      foreground: hslComponents(h, fgS, fgL),
      mutedForeground: hslComponents(h, fgS * 0.85, mutedL),
      background: hslComponents(h, bgS, bgL),
      muted: hslComponents(h, bgS * 0.9, clamp(bgL + 10, 16, 30)),
      border: hslComponents(h, fgS * 0.5, clamp(fgL - 25, 28, 45)),
      primary: hslComponents(h, fgS, fgL),
      primaryForeground: hslComponents(h, bgS, bgL),
      overlay: `hsl(${Math.round(h)} ${Math.round(bgS)}% ${Math.round(bgL)}% / 0.55)`,
    };
  }

  // 浅色：淡色洗底 + 同色相深前景（对齐参考图）
  const fgS = clamp(s * 0.75, 28, 58);
  const fgL = clamp(28 + (l - 50) * 0.12, 22, 38);
  const mutedL = clamp(fgL + 12, 34, 48);
  const bgS = clamp(s * 0.42, 16, 40);
  const bgL = clamp(90 - s * 0.05, 86, 94);
  return {
    foreground: hslComponents(h, fgS, fgL),
    mutedForeground: hslComponents(h, fgS * 0.8, mutedL),
    background: hslComponents(h, bgS, bgL),
    muted: hslComponents(h, bgS * 0.7, clamp(bgL - 8, 78, 90)),
    border: hslComponents(h, fgS * 0.45, clamp(fgL + 28, 55, 72)),
    primary: hslComponents(h, fgS, fgL),
    primaryForeground: hslComponents(h, bgS, bgL),
    overlay: `hsl(${Math.round(h)} ${Math.round(bgS)}% ${Math.round(bgL)}% / 0.42)`,
  };
}

const ADAPTIVE_CSS_VARS = [
  '--background',
  '--foreground',
  '--muted',
  '--muted-foreground',
  '--border',
  '--input',
  '--ring',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--accent',
  '--accent-foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--color-background',
  '--color-foreground',
  '--color-muted',
  '--color-muted-foreground',
  '--color-border',
  '--color-input',
  '--color-ring',
  '--color-primary',
  '--color-primary-foreground',
  '--color-secondary',
  '--color-secondary-foreground',
  '--color-accent',
  '--color-accent-foreground',
  '--color-card',
  '--color-card-foreground',
  '--color-popover',
  '--color-popover-foreground',
] as const;

/** 将自适应配色写入元素（覆盖主题 token，供子树 Tailwind 语义色使用） */
export function applyPlayDetailAdaptivePalette(
  el: HTMLElement,
  palette: PlayDetailAdaptivePalette,
): void {
  const {
    foreground,
    mutedForeground,
    background,
    muted,
    border,
    primary,
    primaryForeground,
  } = palette;

  el.style.setProperty('--background', background);
  el.style.setProperty('--foreground', foreground);
  el.style.setProperty('--muted', muted);
  el.style.setProperty('--muted-foreground', mutedForeground);
  el.style.setProperty('--border', border);
  el.style.setProperty('--input', border);
  el.style.setProperty('--ring', primary);
  el.style.setProperty('--primary', primary);
  el.style.setProperty('--primary-foreground', primaryForeground);
  el.style.setProperty('--secondary', muted);
  el.style.setProperty('--secondary-foreground', foreground);
  el.style.setProperty('--accent', muted);
  el.style.setProperty('--accent-foreground', foreground);
  el.style.setProperty('--card', background);
  el.style.setProperty('--card-foreground', foreground);
  el.style.setProperty('--popover', background);
  el.style.setProperty('--popover-foreground', foreground);

  // Tailwind v4 桥接色：保证 text-*/bg-* 跟局部 token
  el.style.setProperty('--color-background', `hsl(${background})`);
  el.style.setProperty('--color-foreground', `hsl(${foreground})`);
  el.style.setProperty('--color-muted', `hsl(${muted})`);
  el.style.setProperty('--color-muted-foreground', `hsl(${mutedForeground})`);
  el.style.setProperty('--color-border', `hsl(${border})`);
  el.style.setProperty('--color-input', `hsl(${border})`);
  el.style.setProperty('--color-ring', `hsl(${primary})`);
  el.style.setProperty('--color-primary', `hsl(${primary})`);
  el.style.setProperty('--color-primary-foreground', `hsl(${primaryForeground})`);
  el.style.setProperty('--color-secondary', `hsl(${muted})`);
  el.style.setProperty('--color-secondary-foreground', `hsl(${foreground})`);
  el.style.setProperty('--color-accent', `hsl(${muted})`);
  el.style.setProperty('--color-accent-foreground', `hsl(${foreground})`);
  el.style.setProperty('--color-card', `hsl(${background})`);
  el.style.setProperty('--color-card-foreground', `hsl(${foreground})`);
  el.style.setProperty('--color-popover', `hsl(${background})`);
  el.style.setProperty('--color-popover-foreground', `hsl(${foreground})`);

  // ghost 按钮 / lucide 无 text-* 时继承此 color，避免落到主题宿主的灰色
  el.style.color = `hsl(${foreground})`;

  el.dataset.playDetailAdaptiveFg = '1';
}

export function clearPlayDetailAdaptivePalette(el: HTMLElement): void {
  for (const key of ADAPTIVE_CSS_VARS) {
    el.style.removeProperty(key);
  }
  el.style.removeProperty('color');
  delete el.dataset.playDetailAdaptiveFg;
}
