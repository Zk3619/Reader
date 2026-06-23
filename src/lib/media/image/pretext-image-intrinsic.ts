/**
 * Pretext 块级图 intrinsic 缓存与异步 decode（占位 → 实测后单次重算）
 */

import { loadCoverImageObjectUrl } from '@/lib/http/cover-image-loader';
import { normalizeImageUrl } from '@/lib/http/resolve-cover-referer';
import { parseLegadoUrlWithOptions } from '@/lib/js-engine/legado/parse-legado-url-options';
import { MANGA_IMAGE_FETCH_TIMEOUT_MS } from '@/lib/media/image/image-fetch-config';
import { parseSvgDataUrlIntrinsicSize } from '@/lib/media/image/inline-text-image-size';

export type PretextImageIntrinsic = { width: number; height: number };

const intrinsicCache = new Map<string, PretextImageIntrinsic>();
const MAX_CONCURRENT_DECODE = 4;
let activeDecodes = 0;
const decodeWaiters: Array<() => void> = [];

export function normalizePretextImageUrl(url: string): string {
  const parsed = parseLegadoUrlWithOptions(url.trim());
  return normalizeImageUrl(parsed.url.trim()) ?? parsed.url.trim();
}

export function getPretextIntrinsicCache(): ReadonlyMap<string, PretextImageIntrinsic> {
  return intrinsicCache;
}

export function peekPretextImageIntrinsic(url: string): PretextImageIntrinsic | undefined {
  return intrinsicCache.get(normalizePretextImageUrl(url));
}

export function setPretextImageIntrinsic(
  url: string,
  intrinsic: PretextImageIntrinsic,
): void {
  const norm = normalizePretextImageUrl(url);
  if (intrinsic.width > 0 && intrinsic.height > 0) {
    intrinsicCache.set(norm, intrinsic);
  }
}

function acquireDecodeSlot(): Promise<void> {
  if (activeDecodes < MAX_CONCURRENT_DECODE) {
    activeDecodes += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    decodeWaiters.push(() => {
      activeDecodes += 1;
      resolve();
    });
  });
}

function releaseDecodeSlot(): void {
  activeDecodes = Math.max(0, activeDecodes - 1);
  const next = decodeWaiters.shift();
  next?.();
}

async function measureImageSrc(
  src: string,
  timeoutMs = MANGA_IMAGE_FETCH_TIMEOUT_MS,
): Promise<PretextImageIntrinsic | null> {
  if (typeof Image === 'undefined') return null;
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (value: PretextImageIntrinsic | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      finish(w > 0 && h > 0 ? { width: w, height: h } : null);
    };
    img.onerror = () => finish(null);
    img.src = src;
    void img.decode?.().catch(() => {});
  });
}

async function decodeWithObjectUrl(
  url: string,
  headers?: Record<string, string>,
): Promise<PretextImageIntrinsic | null> {
  try {
    const objectUrl = await loadCoverImageObjectUrl(url, {
      legadoImageHeaders: headers,
      timeoutMs: MANGA_IMAGE_FETCH_TIMEOUT_MS,
    });
    if (!objectUrl) return null;
    return measureImageSrc(objectUrl);
  } catch {
    return null;
  }
}

/** 单 URL intrinsic：SVG → 缓存 → blob decode → Image 直连 */
export async function resolvePretextImageIntrinsic(
  url: string,
  options?: { headers?: Record<string, string> },
): Promise<PretextImageIntrinsic | null> {
  const norm = normalizePretextImageUrl(url);
  const cached = intrinsicCache.get(norm);
  if (cached) return cached;

  const svg = parseSvgDataUrlIntrinsicSize(norm);
  if (svg) {
    intrinsicCache.set(norm, svg);
    return svg;
  }

  await acquireDecodeSlot();
  try {
    const again = intrinsicCache.get(norm);
    if (again) return again;

    const fromBlob = await decodeWithObjectUrl(norm, options?.headers);
    if (fromBlob) {
      intrinsicCache.set(norm, fromBlob);
      return fromBlob;
    }

    const direct = await measureImageSrc(norm);
    if (direct) {
      intrinsicCache.set(norm, direct);
      return direct;
    }
    return null;
  } finally {
    releaseDecodeSlot();
  }
}

/** 批量 decode；跳过已有缓存 */
export async function decodePretextChapterImages(
  urls: string[],
  options?: { headersByUrl?: Map<string, Record<string, string>> },
): Promise<Map<string, PretextImageIntrinsic>> {
  const unique = [...new Set(urls.map(normalizePretextImageUrl))];
  const pending = unique.filter((u) => !intrinsicCache.has(u));
  const out = new Map<string, PretextImageIntrinsic>();

  await Promise.all(
    pending.map(async (norm) => {
      const raw = urls.find((u) => normalizePretextImageUrl(u) === norm) ?? norm;
      const headers = options?.headersByUrl?.get(raw) ?? options?.headersByUrl?.get(norm);
      const size = await resolvePretextImageIntrinsic(norm, { headers });
      if (size) out.set(norm, size);
    }),
  );

  for (const norm of unique) {
    const cached = intrinsicCache.get(norm);
    if (cached) out.set(norm, cached);
  }
  return out;
}
