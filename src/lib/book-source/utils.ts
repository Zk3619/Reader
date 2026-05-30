/**
 * 书源引擎工具函数
 * 对应 legado 项目的 URL构建和变量处理
 */

import { isRuleExpression } from '@/lib/rule-engine/rule-expression';

/**
 * 构建URL（替换变量）
 * 支持 {{key}} 和 {key} 两种格式
 */
export function buildUrl(
  template: string,
  params: Record<string, string | number | undefined>
): string {
  let url = template;

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    const valueStr = String(value);
    // 替换 {{key}} 格式
    url = url.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), encodeURIComponent(valueStr));
    // 替换 {key} 格式
    url = url.replace(new RegExp(`\\{${key}\\}`, 'g'), encodeURIComponent(valueStr));
  }

  // 处理特殊变量 {{key}} 和 {key}（用于搜索关键词）
  if (params.key !== undefined) {
    const keyStr = String(params.key);
    url = url.replace(/\{\{key\}\}/g, encodeURIComponent(keyStr));
    url = url.replace(/\{key\}/g, encodeURIComponent(keyStr));
  }

  return url;
}

/**
 * 解析书源header
 */
export function parseHeaders(headerStr?: string): Record<string, string> {
  if (!headerStr) return {};

  try {
    return JSON.parse(headerStr);
  } catch {
    // 如果解析失败，尝试按行分割
    const headers: Record<string, string> = {};
    headerStr.split('\n').forEach(line => {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        if (key && value) {
          headers[key] = value;
        }
      }
    });
    return headers;
  }
}

/**
 * 判断URL是否为绝对URL
 */
export function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** 合并路径中重复斜杠（保留 https:// 中的 //） */
export function collapseUrlPathSlashes(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  try {
    const u = new URL(trimmed);
    u.pathname = u.pathname.replace(/\/{2,}/g, '/');
    return u.toString();
  } catch {
    return trimmed.replace(/(https?:\/\/[^/]+)\/+/gi, '$1/');
  }
}

/**
 * 规范化待解析的相对 URL（多行拼接、误粘连的绝对地址等）
 */
export function normalizeUrlRuleResult(relativeUrl: string): string {
  let rel = relativeUrl.trim();
  if (!rel) return rel;

  const firstLine = rel
    .split(/\r?\n+/)
    .map((s) => s.trim())
    .find(Boolean);
  if (firstLine) rel = firstLine;

  if (!isAbsoluteUrl(rel)) {
    const httpsIdx = rel.search(/https?:\/?\//i);
    if (httpsIdx > 0) {
      rel = rel.slice(0, httpsIdx).trim();
    }
  }

  return rel;
}

/** 规则未展开或仍为 Legado @ 链时，不应拼成可请求的 http URL */
export function isLikelyUnresolvedRuleResult(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  return isRuleExpression(t);
}

/**
 * 解析封面/媒体相对 URL；未命中规则或仍为规则字面量时返回 undefined
 * 对齐 Legado getString(..., isUrl = true) + getAbsoluteURL
 */
export function resolveMediaUrl(
  baseUrl: string,
  relativeUrl: string | undefined | null,
): string | undefined {
  const rel = normalizeUrlRuleResult(relativeUrl ?? '');
  if (!rel || isLikelyUnresolvedRuleResult(rel)) return undefined;
  if (rel.startsWith('data:')) return rel;
  return resolveUrl(baseUrl, rel);
}

/**
 * 解析相对URL为绝对URL（对齐 Legado NetworkUtils.getAbsoluteURL）
 */
export function resolveUrl(baseUrl: string, relativeUrl: string): string {
  const rel = normalizeUrlRuleResult(relativeUrl);
  if (rel.startsWith('data:')) {
    return rel;
  }
  if (isAbsoluteUrl(rel)) {
    return rel;
  }

  const base = (baseUrl || '').split(',')[0]?.trim() || baseUrl;

  try {
    return new URL(rel, base).toString();
  } catch {
    if (rel.startsWith('/')) {
      try {
        const baseObj = new URL(base);
        return `${baseObj.protocol}//${baseObj.host}${rel}`;
      } catch {
        return rel;
      }
    }
    const basePath = base.substring(0, base.lastIndexOf('/') + 1);
    return basePath + rel;
  }
}

/**
 * 检测内容类型
 */
export function detectContentType(content: string): 'html' | 'json' | 'text' {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // 不是有效的JSON
    }
  }
  if (trimmed.startsWith('<')) {
    return 'html';
  }
  return 'text';
}

// ─── data: URL 工具（Legado typed data URL 载荷） ───

/** UTF-8 JSON 字符串 → Legado AnalyzeUrl data: 响应用的 hex 载荷 */
export function jsonToHex(json: string): string {
  return Array.from(new TextEncoder().encode(json))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** hex 载荷 → UTF-8 字符串（对齐 java.hexDecodeToString） */
export function hexToUtf8(hex: string): string {
  const text = String(hex ?? '').trim();
  if (!text) return '';
  const bytes = new Uint8Array(
    (text.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16)),
  );
  return new TextDecoder('utf-8').decode(bytes);
}

/** 对齐 Legado AnalyzeUrl.paramPattern `\s*,\s*(?=\{)` */
export function splitLegadoUrlOptions(url: string): {
  urlNoOption: string;
  options: Record<string, unknown> | null;
} {
  const trimmed = url.trim();
  const match = trimmed.match(/\s*,\s*(?=\{)/);
  if (!match || match.index == null) {
    return { urlNoOption: trimmed, options: null };
  }
  const urlNoOption = trimmed.slice(0, match.index).trim();
  const jsonStart = trimmed.indexOf('{', match.index);
  if (jsonStart < 0) {
    return { urlNoOption: trimmed, options: null };
  }
  try {
    const options = JSON.parse(trimmed.slice(jsonStart)) as Record<string, unknown>;
    return { urlNoOption, options };
  } catch {
    return { urlNoOption: trimmed, options: null };
  }
}

/** 对齐 AppPattern.dataUriRegex，在 urlNoOption 上解码 base64 载荷 */
export function decodeDataUriBase64Payload(urlNoOption: string): Uint8Array | null {
  if (!/^data:/i.test(urlNoOption)) return null;
  const m = urlNoOption.match(/^data:.*?;base64,(.*)$/is);
  if (!m?.[1]) return null;
  try {
    const binaryStr = atob(m[1]);
    return Uint8Array.from(binaryStr, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** 对齐 Legado getByteArrayIfDataUri → JSON.parse，不修改原始字节/字符串 */
export function parseDataUriJsonPayload(urlNoOption: string): Record<string, string> | null {
  const bytes = decodeDataUriBase64Payload(urlNoOption);
  if (!bytes?.length) return null;
  try {
    const jsonStr = new TextDecoder('utf-8').decode(bytes);
    const parsed = JSON.parse(jsonStr) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, string>;
  } catch {
    return null;
  }
}

/** 对齐 Legado HexUtil.encodeHexStr(getByteArrayAwait()) */
export function legadoHexEncodeBytes(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 对齐 AnalyzeUrl.getStrResponseAwait：当 URL 选项含 type 时，正文规则入口为 hex(JSON 字节)
 */
export function legadoDataUrlRuleBody(absoluteUrl: string): string | null {
  const { urlNoOption, options } = splitLegadoUrlOptions(absoluteUrl);
  const type = options?.type;
  if (type == null || String(type).trim() === '') return null;
  const bytes = decodeDataUriBase64Payload(urlNoOption);
  if (!bytes?.length) return null;
  return legadoHexEncodeBytes(bytes);
}

/** data: URL 是否走 Legado type 选项分支（非书源特化） */
export function isLegadoTypedDataUrl(absoluteUrl: string): boolean {
  return legadoDataUrlRuleBody(absoluteUrl) != null;
}

/**
 * 将规则输出的章节 URL 规范为 Legado data: URL（仅真实晴天/hex/json 载荷）
 */
export function normalizeChapterDataUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:')) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return trimmed;

  const tryWrapBase64Payload = (payload: string): string | null => {
    const b64 = payload.trim();
    if (!b64 || /\s/.test(b64)) return null;
    if (!/^[A-Za-z0-9+/=]+$/.test(b64)) return null;
    try {
      const parsed = parseDataUriJsonPayload(`data:;base64,${b64}`);
      if (!parsed) return null;
      return `data:;base64,${b64},{"type":"qingtian3"}`;
    } catch {
      return null;
    }
  };

  if (/^[0-9a-f]+$/i.test(trimmed) && trimmed.length >= 20) {
    try {
      const decoded = hexToUtf8(trimmed);
      if (decoded.startsWith('{')) {
        const b64 =
          typeof btoa !== 'undefined'
            ? btoa(unescape(encodeURIComponent(decoded)))
            : '';
        if (b64) return `data:;base64,${b64},{"type":"qingtian3"}`;
      }
    } catch {
      /* fall through */
    }
  }

  if (trimmed.startsWith('{')) {
    try {
      const b64 =
        typeof btoa !== 'undefined'
          ? btoa(unescape(encodeURIComponent(trimmed)))
          : '';
      if (b64) return `data:;base64,${b64},{"type":"qingtian3"}`;
    } catch {
      /* fall through */
    }
  }

  const wrapped = tryWrapBase64Payload(trimmed);
  if (wrapped) return wrapped;

  return trimmed;
}

/**
 * catalog 行字段：item_id 等须为字符串 POST 到 /content。
 * API 若返回对象，须 JSON.stringify 一次；若已是字符串则原样保留。
 */
export function normalizeCatalogScalarField(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
}

/** 对齐 Legado：JSON 行/载荷里 source 与 sources 互为别名，取首个非空 */
export function coalesceSourceField(
  ...values: Array<string | undefined | null>
): string {
  for (const value of values) {
    const trimmed = (value ?? '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

/**
 * 详情 API 的 source 常为 catalog 短名的扩展（更长且以短名结尾时优先详情）。
 */
export function preferDetailContentSource(
  existing: string | undefined,
  detail: string | undefined,
): string | undefined {
  const fromDetail = detail?.trim();
  const fromExisting = existing?.trim();
  if (!fromDetail) return fromExisting;
  if (!fromExisting) return fromDetail;
  if (fromDetail === fromExisting) return fromDetail;
  if (fromDetail.length > fromExisting.length && fromDetail.endsWith(fromExisting)) {
    return fromDetail;
  }
  if (fromExisting.length > fromDetail.length && fromExisting.endsWith(fromDetail)) {
    return fromExisting;
  }
  return fromDetail;
}

/**
 * 正文 /content 用书级 source（仅存于 book.variable，对齐 Legado Book 实体）。
 */
export function readBookContentSource(
  book?: Pick<{ variable?: string }, 'variable'>,
): string {
  const raw = (book?.variable ?? '').trim();
  if (!raw.startsWith('{')) return '';
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    let fromDetail = '';
    const detail = parsed.book_detail;
    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
      const rawDetailSource = (detail as Record<string, unknown>).source;
      if (rawDetailSource != null && String(rawDetailSource).trim()) {
        fromDetail = String(rawDetailSource).trim();
      }
    }
    let fromVar = '';
    const rawVarSource = parsed.source;
    if (rawVarSource != null && String(rawVarSource).trim()) {
      fromVar = String(rawVarSource).trim();
    }
    return (
      preferDetailContentSource(fromVar, fromDetail) ??
      preferDetailContentSource(fromDetail, fromVar) ??
      ''
    );
  } catch {
    /* ignore */
  }
  return '';
}

/** 合并详情 source 到 book.variable（持久化到书架，供正文 /content 使用） */
export function mergeBookContentVariable(
  existing: string | undefined,
  patch: { source?: string },
): string | undefined {
  const existingSource = readBookContentSource({ variable: existing });
  const source = preferDetailContentSource(existingSource, patch.source);
  if (!source) return existing?.trim() || undefined;
  let obj: Record<string, unknown> = {};
  const raw = (existing ?? '').trim();
  if (raw.startsWith('{')) {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      obj = {};
    }
  }
  obj.source = source;
  return JSON.stringify(obj);
}

/** catalog 行 item_id 是否为 UTF-8 JSON 的 base64（聚合漫画常见 eyJ…） */
export function isBase64EncodedJsonItemId(itemId: string): boolean {
  const trimmed = (itemId ?? '').trim();
  if (!trimmed.startsWith('eyJ')) return false;
  try {
    const decoded = utf8FromBase64(trimmed);
    return decoded.trimStart().startsWith('{');
  } catch {
    return false;
  }
}

/** 从聚合 item_id 内层 JSON 的 baseUrl/bookurl 提取 comic_id */
export function extractComicIdFromAggregationItemIdInner(innerJson: string): string {
  try {
    const parsed = JSON.parse(innerJson) as Record<string, unknown>;
    for (const key of ['baseUrl', 'bookurl', 'url', 'tocUrl']) {
      const raw = String(parsed[key] ?? '');
      const m = raw.match(/comic_id=(\d+)/);
      if (m?.[1]) return m[1];
    }
  } catch {
    /* ignore */
  }
  return '';
}

/**
 * 聚合漫画 catalog 的 item_id 内层 JSON 常把 url/nexurl 的 comic_id 留空；
 * 服务端 /content 需要完整 comic_id，否则 code=0 但 content 为空。
 */
export function repairEmptyComicIdInAggregationItemId(itemId: string): string {
  const inner = isBase64EncodedJsonItemId(itemId) ? utf8FromBase64(itemId.trim()) : itemId;
  if (!inner.trimStart().startsWith('{')) return itemId;
  const comicId = extractComicIdFromAggregationItemIdInner(inner);
  if (!comicId) return inner;
  if (!/comic_id=&|comic_id=\u0026/.test(inner)) return inner;
  return inner
    .replace(/comic_id=&/g, `comic_id=${comicId}&`)
    .replace(/comic_id=\u0026/g, `comic_id=${comicId}\u0026`);
}

/**
 * 聚合 /content POST 的 item_id：
 * catalog 返回 base64 内层 JSON 时须解码后再 POST（否则已登录用户路径服务端 panic）；
 * 并修复内层 url 中空的 comic_id。
 */
export function resolveContentApiItemId(itemId: string): string {
  const trimmed = (itemId ?? '').trim();
  if (!trimmed) return '';
  if (isBase64EncodedJsonItemId(trimmed)) {
    return repairEmptyComicIdInAggregationItemId(trimmed);
  }
  if (trimmed.startsWith('{')) {
    return repairEmptyComicIdInAggregationItemId(trimmed);
  }
  return trimmed;
}

/** @deprecated 使用 resolveContentApiItemId */
export function normalizeContentApiItemId(itemId: string): string {
  return resolveContentApiItemId(itemId);
}

/** 章节 data URL 载荷缺 book_id 时，从书籍 data URL 补全（对齐 Legado book_id 上下文） */
export function mergeBookIdFromBookUrls(
  payload: Record<string, string>,
  bookUrls?: Array<string | undefined>,
): Record<string, string> {
  if (payload.book_id?.trim()) return payload;
  for (const url of bookUrls ?? []) {
    if (!url?.startsWith('data:')) continue;
    const decoded = decodeDataUrl(url);
    const bookId = decoded?.book_id?.trim();
    if (bookId) return { ...payload, book_id: bookId };
  }
  return payload;
}

/** 构建 Legado typed data: 章节 URL（ruleToc.chapterUrl 同结构） */
export function buildTypedChapterDataUrl(payload: Record<string, string>): string {
  const normalized = normalizeDataUrlPayload(payload);
  return `data:;base64,${utf8ToBase64(
    JSON.stringify({
      book_id: normalized.book_id,
      item_id: normalized.item_id,
      title: normalized.title ?? '',
      sources: normalized.sources,
      tab: normalized.tab,
      url: normalized.url ?? '',
    }),
  )},{"type":"qingtian3"}`;
}

/** 对齐 Legado data: URL 载荷字段（sources/source/tab/url/toc_url） */
export function normalizeDataUrlPayload(
  payload: Record<string, string>,
): Record<string, string> {
  const sources = (payload.sources || payload.source || '').trim();
  const tab = (payload.tab || '小说').trim();
  const url = (payload.url || payload.toc_url || '').trim();
  return {
    ...payload,
    book_id: (payload.book_id || '').trim(),
    item_id: normalizeCatalogScalarField(payload.item_id).trim(),
    sources,
    source: sources,
    tab,
    url,
    toc_url: url,
  };
}

/** @deprecated 使用 normalizeDataUrlPayload */
export const normalizeQingtianPayload = normalizeDataUrlPayload;
/** @deprecated 使用 normalizeDataUrlPayload */
export const normalizeQingtianTocPayload = normalizeDataUrlPayload;

/** 从书籍 data: URL 推断 tab（漫画/小说等） */
export function inferTabFromBook(
  book: Pick<{ bookUrl?: string; tocUrl?: string }, 'bookUrl' | 'tocUrl'>,
): string | undefined {
  for (const url of [book.tocUrl, book.bookUrl]) {
    if (!url?.startsWith('data:')) continue;
    const payload = decodeDataUrl(url);
    const tab = payload?.tab?.trim();
    if (tab) return tab;
  }
  return undefined;
}

/** 对齐 Legado java.base64Encode：UTF-8 安全 base64 */
export function utf8ToBase64(text: string): string {
  if (typeof btoa === 'undefined') return '';
  return btoa(unescape(encodeURIComponent(String(text ?? ''))));
}

/** 对齐 Legado java.base64Decode：UTF-8 安全 base64 解码 */
export function utf8FromBase64(b64: string): string {
  const normalized = String(b64 ?? '')
    .trim()
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  if (!normalized) return '';
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);
  try {
    if (typeof atob !== 'undefined') {
      const binary = atob(padded);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder('utf-8').decode(bytes);
    }
  } catch {
    /* fall through */
  }
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(padded, 'base64').toString('utf8');
    }
  } catch {
    /* keep original */
  }
  return normalized;
}

/**
 * 解码 data: URL 中 base64 编码的 JSON 载荷
 * 格式：data:;base64,{base64json},{"type":"..."}
 * @returns 解析后的 JSON 对象，或 null
 */
export function decodeDataUrl(dataUrl: string): Record<string, string> | null {
  try {
    const { urlNoOption } = splitLegadoUrlOptions(dataUrl);
    return parseDataUriJsonPayload(urlNoOption);
  } catch (e) {
    console.warn('[utils] decodeDataUrl 失败:', e);
    return null;
  }
}

/**
 * 从书源的 jsLib 中解析 host 列表，取第一个作为 server 地址
 */
/** 从 jsLib 解析 `var host = ['https://...', ...]` */
export function extractHostListFromJsLib(source: Record<string, unknown>): string[] {
  const jsLib = source.jsLib as string | undefined;
  if (!jsLib) return [];

  const hostArrayMatch = jsLib.match(/var\s+host\s*=\s*\[([^\]]+)\]/);
  if (!hostArrayMatch) return [];

  const urls: string[] = [];
  const re = /['"](https?:\/\/[^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(hostArrayMatch[1])) !== null) {
    urls.push(m[1]);
  }
  return urls;
}

export function extractServerFromJsLib(source: Record<string, unknown>): string | null {
  return extractHostListFromJsLib(source)[0] ?? null;
}
