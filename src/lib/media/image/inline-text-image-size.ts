import type { LegadoImageLayout } from '@/lib/js-engine/legado/legado-image-options';

/** 从 data:image/svg+xml;base64,... 解析 intrinsic 尺寸 */
export function parseSvgDataUrlIntrinsicSize(
  dataUrl: string,
): { width: number; height: number } | null {
  const trimmed = dataUrl.trim();
  if (!/^data:image\/svg\+xml/i.test(trimmed)) return null;
  const m = trimmed.match(/;base64,([A-Za-z0-9+/=]+)/i);
  if (!m?.[1]) return null;
  try {
    const svg = atob(m[1]);
    const widthAttr = svg.match(/\bwidth="([\d.]+)/i)?.[1];
    const heightAttr = svg.match(/\bheight="([\d.]+)/i)?.[1];
    if (widthAttr && heightAttr) {
      const w = parseFloat(widthAttr);
      const h = parseFloat(heightAttr);
      if (w > 0 && h > 0) return { width: w, height: h };
    }
    const viewBox = svg.match(/viewBox="\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/i);
    if (viewBox) {
      const w = parseFloat(viewBox[1]!);
      const h = parseFloat(viewBox[2]!);
      if (w > 0 && h > 0) return { width: w, height: h };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Legado TEXT 行内图：较长边对齐 fontSize（TEXT_WIDE ×1.5556），短边按比例缩放
 */
export function computeInlineTextImageSize(
  intrinsic: { width: number; height: number },
  fontSizePx: number,
  layout: LegadoImageLayout,
): { width: number; height: number } {
  const base =
    layout === 'TEXT_WIDE' ? fontSizePx * 1.5556 : fontSizePx;
  const { width: w, height: h } = intrinsic;
  if (w <= 0 || h <= 0) {
    return { width: base, height: base };
  }
  if (w >= h) {
    return { width: base, height: base * (h / w) };
  }
  return { width: base * (w / h), height: base };
}
