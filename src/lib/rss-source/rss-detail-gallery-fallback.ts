/**
 * 当 ruleContent @js 模板未匹配到图片时，从详情页 HTML 回退提取组图 URL
 *（常见于站点改版后书源选择器未更新）
 */

const IMG_TAG_RE = /<img\b[^>]*>/gi;
const ATTR_RE = (name: string) => new RegExp(`${name}=["']([^"']+)["']`, 'i');

const LAZY_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-lazyload', 'src'] as const;

function isUsableGalleryUrl(url: string): boolean {
  const s = url.trim();
  if (!s.startsWith('http')) return false;
  if (s.startsWith('data:')) return false;
  const lower = s.toLowerCase();
  if (lower.includes('.svg')) return false;
  if (s.includes('100x100')) return false;
  if (/\.gif(?:\?|#|$)/i.test(s) && !/wp-content\/uploads/i.test(s)) return false;
  return /\.(?:webp|jpe?g|png|avif)(?:\?|#|$)/i.test(s) || /wp-content\/uploads/i.test(s);
}

/** 从详情页 HTML 提取产品组图 URL（去重、保序） */
export function extractDetailGalleryImageUrls(html: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  let tagMatch: RegExpExecArray | null;
  IMG_TAG_RE.lastIndex = 0;
  while ((tagMatch = IMG_TAG_RE.exec(html)) !== null) {
    const tag = tagMatch[0]!;
    for (const attr of LAZY_ATTRS) {
      const m = tag.match(ATTR_RE(attr));
      const url = m?.[1]?.trim();
      if (!url || !isUsableGalleryUrl(url) || seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
      break;
    }
  }
  return urls;
}

function countImgTags(html: string): number {
  return (html.match(/<img\b/gi) ?? []).length;
}

function buildGalleryItems(images: string[]): string {
  return images
    .map(
      (url, i) =>
        `<div class='img-item'><img src='${url}'><span class='img-count'>${i + 1} / ${images.length}</span></div>`,
    )
    .join('');
}

/**
 * 规则产出模板但无图时，向 `img-wrap` 注入回退图片；否则原样返回
 */
export function supplementEmptyRssGallery(
  ruleHtml: string,
  rawPageHtml: string,
): { html: string; supplemented: boolean; imageCount: number } {
  if (countImgTags(ruleHtml) > 0) {
    return { html: ruleHtml, supplemented: false, imageCount: countImgTags(ruleHtml) };
  }
  const images = extractDetailGalleryImageUrls(rawPageHtml);
  if (images.length === 0) {
    return { html: ruleHtml, supplemented: false, imageCount: 0 };
  }
  const items = buildGalleryItems(images);
  const imgWrapRe = /(<div class=['"]img-wrap['"]>)(\s*)(<\/div>)/i;
  if (imgWrapRe.test(ruleHtml)) {
    return {
      html: ruleHtml.replace(imgWrapRe, `$1${items}$3`),
      supplemented: true,
      imageCount: images.length,
    };
  }
  return {
    html: `${ruleHtml}<div class='img-wrap'>${items}</div>`,
    supplemented: true,
    imageCount: images.length,
  };
}
