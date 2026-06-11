/**
 * RSS 正文图片：占位图绝对化、加载中样式（绅士会所 thumbnail.gif 等）
 */

import { resolveUrl } from '@/lib/book-source/utils';
import { readHtmlAttr, scanImgTags } from '@/lib/media/text/scan-img-tags';

function upsertImgTagAttr(tag: string, name: string, value: string): string {
  const escaped = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const attr = `${name}="${escaped}"`;
  const re = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
  if (re.test(tag)) {
    return tag.replace(re, ` ${attr}`);
  }
  if (/\/>$/.test(tag.trim())) {
    return tag.replace(/\/>\s*$/, ` ${attr} />`);
  }
  return tag.replace(/>\s*$/, ` ${attr}>`);
}

/** 源站懒加载占位图（如绅士会所 /static/thumbnail.gif）勿被 width:100% 拉成竖条 */
export const RSS_IMG_LOADING_PLACEHOLDER_STYLE =
  'img[data-reader-img-loading],img[data-reader-ph]{' +
  'width:auto !important;max-width:100%;height:auto;display:block;margin:0 auto;}' +
  'img[src*="thumbnail.gif"],img[src*="/static/thumbnail"]{' +
  'width:auto !important;max-width:100%;height:auto;display:block;margin:0 auto;}';

/**
 * 画廊书源常在 ul#box 上设 height:100%;overflow-y:scroll，与 iframe 文档滚动叠加成双滚动条。
 * 阅读器内统一由文档滚动，禁用内层列表滚动槽。
 */
export const RSS_GALLERY_SINGLE_SCROLL_STYLE =
  'html,body{height:auto!important;min-height:100%;overflow-x:hidden!important;overflow-y:auto!important;}' +
  'ul#box,ul#imgList,#box,#imgList{height:auto!important;max-height:none!important;' +
  'overflow:visible!important;overflow-y:visible!important;}';

/** 注入 WebView 正文的阅读器侧样式覆盖（占位图 + 单滚动条） */
export const RSS_CONTENT_READER_OVERRIDE_STYLE =
  RSS_IMG_LOADING_PLACEHOLDER_STYLE + RSS_GALLERY_SINGLE_SCROLL_STYLE;

const LOADING_PLACEHOLDER_RE = /thumbnail\.gif|\/static\/thumbnail/i;

function isLoadingPlaceholderUrl(url: string): boolean {
  return LOADING_PLACEHOLDER_RE.test(url.trim());
}

function absolutizeImageAttr(tag: string, attr: 'src' | 'data-src', baseUrl: string): string {
  const raw = readHtmlAttr(tag, attr);
  if (!raw?.trim()) return tag;
  const trimmed = raw.trim();
  if (
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return tag;
  }
  try {
    return upsertImgTagAttr(tag, attr, resolveUrl(baseUrl, trimmed));
  } catch {
    return tag;
  }
}

/** 将正文 img 的相对 src / data-src 转为绝对地址（blob 文档内依赖 <base> 不稳定） */
export function absolutizeRssContentImageUrls(content: string, baseUrl: string): string {
  if (!content.includes('<img') || !baseUrl.trim()) return content;
  let out = content;
  for (const tag of scanImgTags(content)) {
    let next = absolutizeImageAttr(tag, 'src', baseUrl);
    next = absolutizeImageAttr(next, 'data-src', baseUrl);
    if (next !== tag) {
      out = out.replace(tag, next);
    }
  }
  return out;
}

/**
 * 为懒加载占位图写入 data-reader-ph，供图片桥在拉 CDN 图期间保持动态占位。
 */
export function annotateRssLoadingPlaceholders(content: string, baseUrl: string): string {
  if (!content.includes('<img') || !baseUrl.trim()) return content;
  let out = content;
  for (const tag of scanImgTags(content)) {
    const src = readHtmlAttr(tag, 'src')?.trim() ?? '';
    const ds = readHtmlAttr(tag, 'data-src')?.trim() ?? '';
    if (!src || !ds || !isLoadingPlaceholderUrl(src)) continue;
    let placeholder = src;
    if (!/^https?:\/\//i.test(placeholder)) {
      try {
        placeholder = resolveUrl(baseUrl, placeholder);
      } catch {
        continue;
      }
    }
    if (readHtmlAttr(tag, 'data-reader-ph') === placeholder) continue;
    const next = upsertImgTagAttr(tag, 'data-reader-ph', placeholder);
    if (next !== tag) {
      out = out.replace(tag, next);
    }
  }
  return out;
}

function buildRssLazyImgPatchCall(varName: string, observerName?: string): string {
  const unobserve = observerName
    ? `;try{${observerName}.unobserve(el)}catch(_){}`
    : '';
  return (
    `(function(n${observerName ? ',obs' : ''}){var el=n&&n.tagName?n:(n&&n.target);` +
    `if(!el||!el.getAttribute)return;` +
    `if(window.__READER_RSS_PATCH_IMG__)window.__READER_RSS_PATCH_IMG__(el);` +
    `else el.src=el.getAttribute("data-src")${unobserve}})` +
    `(${varName}${observerName ? `,${observerName}` : ''})`
  );
}

/**
 * 书源懒加载常写 `item.src = item.getAttribute('data-src')`，会在图片桥拦截前触发裂图。
 * IO 回调里 `item=item.target` 对箭头参数赋值常无效，须显式取 entry.target。
 */
export function neutralizeRssLazyLoadDirectSrc(content: string): string {
  if (!content.includes('data-src')) return content;

  const withTargetAssignAndUnobserve =
    /(\w+)\s*=\s*\1\.target\s*[\r\n]+\s*\1\.src\s*=\s*\1\.getAttribute\(\s*['"]data-src['"]\s*\)\s*[\r\n]+\s*(\w+)\.unobserve\(\1\)/g;
  let out = content.replace(withTargetAssignAndUnobserve, (_, varName, observerName) =>
    buildRssLazyImgPatchCall(varName, observerName),
  );

  const withTargetAssign =
    /(\w+)\s*=\s*\1\.target\s*[\r\n]+\s*\1\.src\s*=\s*\1\.getAttribute\(\s*['"]data-src['"]\s*\)/g;
  out = out.replace(withTargetAssign, (_, varName) => buildRssLazyImgPatchCall(varName));

  out = out.replace(
    /(\w+)\.src\s*=\s*\1\.getAttribute\(\s*['"]data-src['"]\s*\)/g,
    (_, varName) => buildRssLazyImgPatchCall(varName),
  );
  return out;
}

/** 文档级滚动时 IntersectionObserver 应以视口为 root，而非 #box */
export function alignGalleryLazyRootToViewport(content: string): string {
  if (!content.includes('IntersectionObserver')) return content;
  if (!content.includes('box') && !content.includes('imgList')) return content;
  return content.replace(/\broot:\s*root\b/g, 'root: null');
}

export function prepareRssContentImages(content: string, baseUrl: string): string {
  const base = baseUrl.trim();
  if (!base) return content;
  let out = absolutizeRssContentImageUrls(content, base);
  out = annotateRssLoadingPlaceholders(out, base);
  out = neutralizeRssLazyLoadDirectSrc(out);
  out = alignGalleryLazyRootToViewport(out);
  return out;
}
