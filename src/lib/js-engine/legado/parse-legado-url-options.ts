/**
 * Legado 资源 URL 后缀选项：`https://cdn/1.webp,{"headers":{"User-Agent":"..."}}`
 * 用于正文图片、部分 ajax 封面等。
 */

import { readHtmlAttr } from '@/lib/reader/scan-img-tags';

export type LegadoUrlWithOptions = {
  url: string;
  headers?: Record<string, string>;
};

const IMAGE_EXT_RE = /\.(?:webp|jpe?g|png|gif|avif|bmp)/i;

function normalizeHeaderRecord(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) out[k] = s;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** 为 parse 补逗号：`url.webp{"headers":…}` → `url.webp,{"headers":…}` */
function ensureCommaBeforeHeadersJson(raw: string): string {
  return raw.replace(
    /(\.(?:webp|jpe?g|png|gif|avif|bmp))(\s*\{"headers"\s*:)/i,
    '$1,$2',
  );
}

/**
 * 从 Legado 图片/请求 URL 中拆出真实地址与可选 headers（逗号 + JSON 后缀）。
 */
export function parseLegadoUrlWithOptions(input: string): LegadoUrlWithOptions {
  const trimmed = ensureCommaBeforeHeadersJson((input ?? '').trim());
  if (!trimmed) return { url: '' };
  if (!/^https?:\/\//i.test(trimmed)) {
    return { url: trimmed };
  }

  let jsonStart = trimmed.search(/,\s*\{/);
  if (jsonStart < 0) {
    jsonStart = trimmed.search(/\{"headers"\s*:/);
  }
  if (jsonStart < 0) {
    return { url: trimmed.split(/[\s"'<>]/)[0] ?? trimmed };
  }

  const urlPart = trimmed.slice(0, jsonStart).replace(/,$/, '').trim();
  const jsonPart = trimmed.slice(jsonStart).replace(/^,/, '').trim();
  try {
    const opts = JSON.parse(jsonPart) as Record<string, unknown>;
    const headers = normalizeHeaderRecord(opts.headers);
    if (urlPart) {
      return headers ? { url: urlPart, headers } : { url: urlPart };
    }
  } catch {
    /* ignore */
  }
  return { url: urlPart || trimmed.split(/[\s"'<>]/)[0] || trimmed };
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function legadoImageSpanToImgTag(rawLegado: string): string {
  const { url, headers } = parseLegadoUrlWithOptions(rawLegado);
  if (!url) return '';
  let tag = `<img src="${escapeHtmlAttr(url)}"`;
  if (headers) {
    tag += ` data-legado-headers="${escapeHtmlAttr(JSON.stringify(headers))}"`;
  }
  tag += '>';
  return tag;
}

/** 从片段（含破损 HTML）提取 `url,{"headers":{…}}` 原始串 */
export function extractLegadoImageRawFromFragment(fragment: string): string | null {
  const http = fragment.search(/https?:\/\//i);
  if (http < 0) return null;

  const slice = fragment.slice(http);
  const extM = IMAGE_EXT_RE.exec(slice);
  if (!extM || extM.index === undefined) return null;

  const urlEnd = http + extM.index + extM[0].length;
  const url = fragment.slice(http, urlEnd);

  let jsonStart = fragment.indexOf(',{"headers"', urlEnd);
  if (jsonStart >= 0) {
    jsonStart += 1;
  } else {
    jsonStart = fragment.indexOf('{"headers"', urlEnd);
  }

  if (jsonStart < 0) {
    const broken = fragment.indexOf('"headers"', urlEnd);
    if (broken < 0) return null;
    const innerBrace = fragment.indexOf('{', broken);
    if (innerBrace < 0) return null;
    let depth = 0;
    let end = innerBrace;
    for (let j = innerBrace; j < fragment.length; j++) {
      const c = fragment[j];
      if (c === '{') depth += 1;
      else if (c === '}') {
        depth -= 1;
        if (depth === 0) {
          end = j + 1;
          break;
        }
      }
    }
    if (depth !== 0) return null;
    const inner = fragment.slice(innerBrace, end);
    return `${url},{"headers":${inner}}`;
  }

  let depth = 0;
  let end = jsonStart;
  for (let j = jsonStart; j < fragment.length; j++) {
    const c = fragment[j];
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        end = j + 1;
        break;
      }
    }
  }
  if (depth !== 0) return null;

  const jsonPart = fragment.slice(jsonStart, end);
  return `${url},${jsonPart}`;
}

function findNextLegadoImageSpan(
  text: string,
  from: number,
): { start: number; end: number; raw: string } | null {
  const http = text.indexOf('https://', from);
  if (http < 0) return null;

  const raw = extractLegadoImageRawFromFragment(text.slice(http));
  if (!raw) return null;

  const end = http + raw.length;
  const hasHeaders =
    raw.includes('{"headers"') || raw.includes('"headers"');
  if (!hasHeaders) return null;

  return { start: http, end, raw };
}

/**
 * 扫描正文全文，将 Legado 图链（含破损的 img 标签）替换为标准 img。
 */
export function normalizeLegadoContentImages(content: string): string {
  if (
    !content.includes('https://') ||
    (!content.includes('"headers"') && !content.includes("'headers'"))
  ) {
    return content;
  }

  let out = '';
  let pos = 0;

  while (pos < content.length) {
    const span = findNextLegadoImageSpan(content, pos);
    if (!span) {
      out += content.slice(pos);
      break;
    }

    let blockStart = span.start;
    const imgBefore = content.lastIndexOf('<img', span.start);
    if (imgBefore >= pos && imgBefore < span.start) {
      const gt = content.indexOf('>', span.end);
      if (gt >= 0 && gt - imgBefore < 4096) {
        blockStart = imgBefore;
        out += content.slice(pos, blockStart);
        out += legadoImageSpanToImgTag(span.raw);
        pos = gt + 1;
        continue;
      }
    }

    out += content.slice(pos, blockStart);
    out += legadoImageSpanToImgTag(span.raw);
    pos = span.end;
    if (content[pos] === '"') pos += 1;
    if (content[pos] === '>') pos += 1;
    while (pos < content.length && (content[pos] === '\n' || content[pos] === '\r')) {
      pos += 1;
    }
  }

  return out;
}

/** @deprecated 使用 normalizeLegadoContentImages */
export function normalizeLegadoImagesInHtml(html: string): string {
  return normalizeLegadoContentImages(html);
}

/** 从 img 标签属性读取 Legado 请求头（若存在） */
export function readLegadoHeadersFromImgTag(tag: string): Record<string, string> | undefined {
  const attr = readHtmlAttr(tag, 'data-legado-headers');
  if (!attr) return undefined;
  try {
    return normalizeHeaderRecord(JSON.parse(attr) as unknown);
  } catch {
    return undefined;
  }
}
