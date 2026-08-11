/**
 * 跨域图片拉取：响应校验、CF 挑战页识别（不按图床域名特化）。
 */

export type BrowserFetchedImageBytes = { bytes: ArrayBuffer; mime: string };

/**
 * 仅过滤明显非图片的空响应（截断/HTML 片段）。
 * 漫画纯色块 webp 可小到数百字节，不能按 MIME 设 KB 级阈值。
 */
export function isLikelyMangaAntiHotlinkPlaceholder(
  bytes: ArrayBuffer,
  _mime: string,
): boolean {
  return bytes.byteLength < 64;
}

/** 能解码但仅为 1～2px 的条带，常见于空占位 */
const MAX_ANTIHOTLINK_PLACEHOLDER_EDGE_PX = 2;

/**
 * 校验是否为可解码位图（不按站点/尺寸猜防盗图）。
 * 仅拒绝空包、1～2px 条带。
 */
export async function verifyFetchedImageBytes(
  bytes: ArrayBuffer,
  mime: string,
): Promise<boolean> {
  if (isLikelyMangaAntiHotlinkPlaceholder(bytes, mime)) return false;
  if (typeof createImageBitmap === 'undefined') {
    return bytes.byteLength >= 64;
  }
  try {
    const blob = new Blob([bytes], { type: mime || 'image/webp' });
    const bmp = await createImageBitmap(blob);
    const ok =
      bmp.width > MAX_ANTIHOTLINK_PLACEHOLDER_EDGE_PX &&
      bmp.height > MAX_ANTIHOTLINK_PLACEHOLDER_EDGE_PX;
    bmp.close();
    return ok;
  } catch {
    return bytes.byteLength >= 64;
  }
}

/**
 * 响应体是否为 Cloudflare 人机挑战页（非图片）。
 * 禁止仅凭正文出现 “cloudflare” 判定：普通站点（含 YouTube）常引用 CF CDN/文案，
 * 误判会打开 InnerWeb 并把目标站盖满主窗口。
 */
export function looksLikeCloudflareChallengeHtml(
  snippet: string,
): boolean {
  const s = snippet.slice(0, 4096).toLowerCase();
  return (
    s.includes('just a moment') ||
    s.includes('cf-chl') ||
    s.includes('__cf_chl') ||
    s.includes('challenge-platform') ||
    s.includes('/cdn-cgi/challenge-platform') ||
    s.includes('cf-spinner') ||
    (s.includes('attention required') && s.includes('cloudflare')) ||
    (s.includes('checking your browser') &&
      (s.includes('cloudflare') || s.includes('cf-')))
  );
}
