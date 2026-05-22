import { normalizeImageUrl } from '@/lib/http/resolve-cover-referer';

/** 番茄等 CDN 签名图（带 x-expires） */
export function isSignedCoverUrl(url: string): boolean {
  try {
    return new URL(normalizeImageUrl(url)).searchParams.has('x-expires');
  } catch {
    return false;
  }
}

export function getSignedImageExpiryEpoch(url: string): number | null {
  try {
    const raw = new URL(normalizeImageUrl(url)).searchParams.get('x-expires');
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function isSignedImageUrlExpired(url: string): boolean {
  const exp = getSignedImageExpiryEpoch(url);
  if (exp == null) return false;
  return Math.floor(Date.now() / 1000) > exp;
}
