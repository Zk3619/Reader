/**
 * Legado 书源 /content 等 JSON API 响应解析
 */

import {
  parseLegadoUrlWithOptions,
  normalizeLegadoContentImages,
  readLegadoHeadersFromImgTag,
} from '@/lib/js-engine/legado/parse-legado-url-options';
import { hexToUtf8 } from '@/lib/book-source/utils';
import { scanImgTags, readHtmlAttr } from '@/lib/media/text/scan-img-tags';

const IMAGE_LIST_KEYS = [
  'contents',
  'images',
  'pics',
  'pic_list',
  'list',
  'urls',
] as const;

function countImagesInHtml(html: string): number {
  return scanImgTags(html).length;
}

/** 聚合 API 有时把 HTML 正文放在 hex 字符串里（Legado 日志可见） */
export function materializeAggregationContentBody(body: string): string {
  const trimmed = body.trim();
  if (!/^[0-9a-fA-F]+$/.test(trimmed) || trimmed.length < 40 || trimmed.length % 2 !== 0) {
    return body;
  }
  try {
    const decoded = hexToUtf8(trimmed);
    if (!decoded.includes('<')) return body;
    const decodedImgs = countImagesInHtml(decoded);
    const rawImgs = countImagesInHtml(body);
    return decodedImgs >= rawImgs ? decoded : body;
  } catch {
    return body;
  }
}

function pickSuccessfulContentBody(parsed: Record<string, unknown>): string {
  // 对齐 Legado ruleContent：`content = data.content`
  if (typeof parsed.content === 'string' && parsed.content.trim()) {
    return parsed.content;
  }

  const data = parsed.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const nested = data as Record<string, unknown>;
    if (typeof nested.content === 'string' && nested.content.trim()) {
      return nested.content;
    }
    for (const key of IMAGE_LIST_KEYS) {
      const list = nested[key];
      if (Array.isArray(list) && list.length > 0) {
        return apiContentsToHtml(list);
      }
    }
  }

  for (const key of IMAGE_LIST_KEYS) {
    const list = parsed[key];
    if (Array.isArray(list) && list.length > 0) {
      return apiContentsToHtml(list);
    }
  }

  if (typeof data === 'string' && data.trim()) {
    return data;
  }

  return '';
}

function legadoImageStringToImgTag(raw: string): string {
  const trimmed = raw.trim();
  if (/^<img[\s/>]/i.test(trimmed)) {
    return normalizeLegadoContentImages(trimmed);
  }
  const { url, headers } = parseLegadoUrlWithOptions(trimmed);
  if (!url) return '';
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  let attrs = `src="${esc(url)}"`;
  if (headers) {
    attrs += ` data-legado-headers="${esc(JSON.stringify(headers))}"`;
  }
  return `<img ${attrs}>`;
}

/** /content 返回的服务端错误文案，不应当作正文 */
export function isApiErrorText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return (
    /正文处理异常/i.test(t) ||
    /nil pointer dereference/i.test(t) ||
    /invalid memory address/i.test(t)
  );
}

export function isApiSuccessCode(code: unknown): boolean {
  if (code === undefined || code === null) return true;
  return code === 0 || code === '0';
}

/** /catalog、/content 等聚合 API 失败摘要（日志用） */
/** 业务/鉴权类错误换线路通常无效（如 catalog code is 400） */
export function isNonRetryableAggregationApiFailure(
  failure: { code: unknown; msg: string } | null | undefined,
): boolean {
  if (!failure) return false;
  const msg = (failure.msg || '').toLowerCase();
  if (/\bcode is (400|401|403)\b/.test(msg)) return true;
  if (/illegal base64/i.test(msg)) return true;
  const code = Number(failure.code);
  return code === 400 || code === 401 || code === 403;
}

export function readAggregationApiFailure(
  response: unknown,
): { code: unknown; msg: string } | null {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return null;
  }
  const root = response as Record<string, unknown>;
  if (!('code' in root) || isApiSuccessCode(root.code)) return null;
  const msg =
    (typeof root.msg === 'string' ? root.msg.trim() : '') ||
    (typeof root.content === 'string' && !isApiErrorText(root.content)
      ? root.content.trim()
      : '');
  return { code: root.code, msg: msg || `code=${String(root.code)}` };
}

/** 图片 URL 列表 → HTML img 串 */
export function apiContentsToHtml(contents: unknown): string {
  if (!Array.isArray(contents) || contents.length === 0) return '';
  const tags: string[] = [];
  for (const item of contents) {
    if (typeof item === 'string' && item.trim()) {
      tags.push(legadoImageStringToImgTag(item.trim()));
      continue;
    }
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const row = item as Record<string, unknown>;
      const url = row.url ?? row.src ?? row.image ?? row.link;
      if (typeof url === 'string' && url.trim()) {
        tags.push(legadoImageStringToImgTag(url.trim()));
      }
    }
  }
  return tags.join('\n');
}

/**
 * 从 /content 原始响应或 ruleContent JS 返回值中提取正文。
 * 失败响应（code != 0）的 content/msg 不作为正文。
 */
export function extractApiContent(raw: string | Record<string, unknown>): string {
  let parsed: Record<string, unknown> | null = null;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return '';
    if (!text.startsWith('{') && !text.startsWith('[')) {
      return isApiErrorText(text) ? '' : text;
    }
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return isApiErrorText(text) ? '' : text;
    }
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    parsed = raw;
  }
  if (!parsed) return '';

  if ('code' in parsed && !isApiSuccessCode(parsed.code)) {
    return '';
  }

  const body = pickSuccessfulContentBody(parsed);
  if (!body.trim() || isApiErrorText(body)) {
    const msg = typeof parsed.msg === 'string' ? parsed.msg.trim() : '';
    if (msg && !isApiErrorText(msg)) return msg;
    return '';
  }
  return materializeAggregationContentBody(body);
}

/** 诊断 /content 响应结构（日志用，不含正文全文） */
export function summarizeApiContentResponse(
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  const data = parsed.data;
  const summary: Record<string, unknown> = {
    topKeys: Object.keys(parsed),
    code: parsed.code,
    msg: parsed.msg,
    contentLen: typeof parsed.content === 'string' ? parsed.content.length : undefined,
    contentImgCount:
      typeof parsed.content === 'string'
        ? countImagesInHtml(parsed.content)
        : undefined,
    contentsLen: Array.isArray(parsed.contents) ? parsed.contents.length : undefined,
  };
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const nested = data as Record<string, unknown>;
    summary.dataKeys = Object.keys(nested);
    summary.dataContentLen =
      typeof nested.content === 'string' ? nested.content.length : undefined;
    summary.dataContentImgCount =
      typeof nested.content === 'string'
        ? countImagesInHtml(nested.content)
        : undefined;
    summary.dataContentsLen = Array.isArray(nested.contents)
      ? nested.contents.length
      : undefined;
  } else if (typeof data === 'string') {
    summary.dataStrLen = data.length;
  }
  return summary;
}

/** API 失败时的可读原因（用于日志/提示，不作正文） */
export function extractApiErrorMessage(raw: string | Record<string, unknown>): string {
  let parsed: Record<string, unknown> | null = null;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text.startsWith('{')) return text.slice(0, 200);
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return text.slice(0, 200);
    }
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    parsed = raw;
  }
  if (!parsed) return '';
  const msg = typeof parsed.msg === 'string' ? parsed.msg.trim() : '';
  const contentField =
    typeof parsed.content === 'string' ? parsed.content.trim() : '';
  if (isApiSuccessCode(parsed.code)) {
    if (msg && isApiErrorText(msg)) return msg;
    if (contentField && isApiErrorText(contentField)) return contentField;
    if (!pickSuccessfulContentBody(parsed).trim()) {
      return '响应成功但无 content/contents';
    }
    return '';
  }
  if (msg) return msg;
  if (contentField && !isApiErrorText(contentField)) return contentField;
  if (parsed.code !== undefined && parsed.code !== null) {
    return `API code=${String(parsed.code)}`;
  }
  return '';
}

/** 正文内相对图片 URL 补全（漫画 ident=/proxy 等） */
function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function buildResolvedImgTag(
  url: string,
  headers?: Record<string, string>,
  click?: string,
  legadoStyle?: string,
): string {
  let tag = `<img src="${escapeHtmlAttr(url)}"`;
  if (headers && Object.keys(headers).length > 0) {
    tag += ` data-legado-headers="${escapeHtmlAttr(JSON.stringify(headers))}"`;
  }
  if (click) {
    tag += ` data-legado-click="${escapeHtmlAttr(click)}"`;
  }
  if (legadoStyle) {
    tag += ` data-legado-style="${escapeHtmlAttr(legadoStyle)}"`;
  }
  tag += '>';
  return tag;
}

export function resolveApiImageContent(content: string, baseUrl: string): string {
  if (!content?.trim() || !baseUrl?.trim()) return content;
  const base = baseUrl.replace(/\/+$/, '');

  let out = content.replace(/ident="/g, `ident="${base}`);

  if (
    out.includes('"headers"') ||
    out.includes("'headers'") ||
    out.includes('data-legado-headers')
  ) {
    out = normalizeLegadoContentImages(out);
  }

  for (const tag of scanImgTags(out)) {
    const fromTag = readLegadoHeadersFromImgTag(tag);
    const rawSrc =
      readHtmlAttr(tag, 'src') ||
      readHtmlAttr(tag, 'data-src') ||
      readHtmlAttr(tag, 'data-original') ||
      '';
    if (!rawSrc.trim()) continue;

    const parsed = parseLegadoUrlWithOptions(rawSrc.trim());
    let url = (parsed.url || rawSrc.trim()).trim();
    if (
      url &&
      !/^https?:\/\//i.test(url) &&
      !url.startsWith('data:') &&
      !url.startsWith('blob:')
    ) {
      try {
        url = url.startsWith('/')
          ? `${base}${url}`
          : new URL(url, `${base}/`).toString();
      } catch {
        /* keep original */
      }
    }

    const headers = fromTag ?? parsed.headers;
    const click = parsed.click;
    const nextTag = buildResolvedImgTag(
      url,
      headers,
      click,
      parsed.legadoStyle,
    );
    if (nextTag !== tag) {
      out = out.replace(tag, nextTag);
    }
  }

  if (out.includes('"headers"') || out.includes("'headers'")) {
    out = normalizeLegadoContentImages(out);
  }

  return out;
}
