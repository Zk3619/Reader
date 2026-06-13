/** 正文内容渲染：图片 URL 代理（对齐 Legado image?path=&url=&width=） */

import { resolveApiUrl } from '@/lib/api-config';

export function imageProxyUrl(src: string, bookUrl?: string, width = 640): string {
  const trimmed = src.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/image?') || trimmed.includes('image?path=')) {
    return resolveApiUrl(trimmed.startsWith('/') ? trimmed : `/${trimmed}`);
  }
  if (trimmed.startsWith('data:')) return trimmed;
  const params = new URLSearchParams();
  params.set('path', trimmed);
  if (bookUrl) params.set('url', bookUrl);
  params.set('width', String(width));
  return resolveApiUrl(`/image?${params.toString()}`);
}

export function rewriteContentImages(html: string, bookUrl?: string, width = 640): string {
  if (!html.includes('<img') && !html.includes('src=')) return html;
  return html.replace(
    /<img([^>]*?)src=["']([^"']+)["']([^>]*)>/gi,
    (_match, before, src, after) =>
      `<img${before}src="${imageProxyUrl(src, bookUrl, width)}"${after} onerror="this.dataset.retry=1;this.src=this.src">`,
  );
}

export function looksLikeHtml(text: string): boolean {
  const t = text.trim();
  return t.startsWith('<') && (t.includes('</') || t.includes('/>'));
}

export function formatPlainText(text: string): string {
  return text.replace(/\n/g, '<br/>');
}

export function renderChapterContent(raw: string, bookUrl?: string, width = 640): string {
  if (!raw) return '';
  const withImages = rewriteContentImages(raw, bookUrl, width);
  if (looksLikeHtml(withImages)) return withImages;
  return `<div class="plain-text">${formatPlainText(withImages)}</div>`;
}
