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

/** fetch / Headers 允许的 header 名（RFC 7230 token） */
const HTTP_HEADER_NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

function unquoteHeaderToken(token: string): string {
  let s = token.trim();
  while (s.length > 0 && (s.endsWith(',') || s.endsWith('}'))) {
    s = s.slice(0, -1).trim();
  }
  if (s.startsWith('{')) {
    s = s.slice(1).trim();
  }
  if (
    (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) ||
    (s.length >= 2 && s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1);
  }
  return s.trim();
}

function normalizeHeaderRecord(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const k = unquoteHeaderToken(String(key));
    const v = unquoteHeaderToken(String(value ?? ''));
    if (k && v) out[k] = v;
  }
  return out;
}

function tryParseHeaderObject(headerStr: string): Record<string, string> | null {
  const trimmed = headerStr.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return normalizeHeaderRecord(parsed as Record<string, unknown>);
    }
  } catch {
    /* Legado 常见单引号伪 JSON */
  }
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed.replace(/'/g, '"')) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return normalizeHeaderRecord(parsed as Record<string, unknown>);
      }
    } catch {
      /* fall through */
    }
  }
  return null;
}

/** 去掉非法 header 名/未展开模板，避免 fetch 报 Invalid name */
export function sanitizeHttpHeaders(headers: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(headers)) {
    const key = unquoteHeaderToken(rawKey);
    const value = unquoteHeaderToken(String(rawValue ?? ''));
    if (!key || !HTTP_HEADER_NAME_RE.test(key)) continue;
    if (key.includes('{{') || key.includes('}}') || key.includes('@')) continue;
    if (value.includes('{{') || value.includes('}}')) continue;
    if (value === 'null') continue;
    safe[key] = value;
  }
  return safe;
}

/**
 * 解析书源header
 */
export function parseHeaders(headerStr?: string): Record<string, string> {
  if (!headerStr) return {};

  const fromObject = tryParseHeaderObject(headerStr);
  if (fromObject) return sanitizeHttpHeaders(fromObject);

  const headers: Record<string, string> = {};
  headerStr.split('\n').forEach((line) => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = unquoteHeaderToken(line.substring(0, colonIndex));
      const value = unquoteHeaderToken(line.substring(colonIndex + 1));
      if (key && value) {
        headers[key] = value;
      }
    }
  });
  return sanitizeHttpHeaders(headers);
}

/**
 * 判断URL是否为绝对URL
 */
export function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * 去掉误粘在 http(s) URL 后的 Cookie 段（如 `https://v1.gyks.cf;deviceId=xxx/health`）。
 * Legado 聚合书源偶发把 qttoken/deviceId 写入 server/线路 字段，会导致 TLS Invalid Server Name。
 */
export function stripMisplacedCookieFromHttpUrl(url: string): string {
  const s = url.trim();
  if (!/^https?:\/\//i.test(s)) return s;
  const semi = s.indexOf(';');
  if (semi === -1) return s;
  const head = s.slice(0, semi);
  const afterSemi = s.slice(semi + 1);
  // 仅处理「origin 后紧跟 ;cookie」；已有正常路径的 URL 不动
  if (!/^https?:\/\/[^/]+$/i.test(head)) return s;
  const slashInCookie = afterSemi.indexOf('/');
  const pathSuffix = slashInCookie >= 0 ? afterSemi.slice(slashInCookie) : '';
  try {
    const u = new URL(head);
    return `${u.origin}${pathSuffix}`.replace(/([^:]\/)\/+/g, '$1');
  } catch {
    return head.replace(/\/+$/, '');
  }
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
    return stripMisplacedCookieFromHttpUrl(rel);
  }

  const base = stripMisplacedCookieFromHttpUrl(
    (baseUrl || '').split(',')[0]?.trim() || baseUrl,
  );

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

/** 从聚合 item_id 内层 JSON 的 URL 字段提取 comic_id（递归扫描所有字符串） */
export function extractComicIdFromAggregationItemIdInner(innerJson: string): string {
  try {
    const parsed = JSON.parse(innerJson) as unknown;
    const stack: unknown[] = [parsed];
    while (stack.length > 0) {
      const cur = stack.pop();
      if (typeof cur === 'string') {
        const m = cur.match(/comic_id=(\d+)/);
        if (m?.[1]) return m[1];
      } else if (Array.isArray(cur)) {
        for (const item of cur) stack.push(item);
      } else if (cur && typeof cur === 'object' && !Array.isArray(cur)) {
        const rec = cur as Record<string, unknown>;
        const direct = rec.comic_id ?? rec.comicId;
        if (typeof direct === 'number' && direct > 0) return String(direct);
        if (typeof direct === 'string' && /^\d+$/.test(direct.trim())) {
          return direct.trim();
        }
        for (const v of Object.values(rec)) {
          stack.push(v);
        }
      }
    }
  } catch {
    /* ignore */
  }
  return '';
}

/** 从书籍 data URL / catalog 的 book_id 载荷提取 comic_id（章节 item_id 常无 comic_id） */
export function extractComicIdFromAggregationBookId(bookId: string): string {
  const trimmed = (bookId ?? '').trim();
  if (!trimmed) return '';
  if (isBase64EncodedJsonItemId(trimmed)) {
    try {
      return extractComicIdFromAggregationItemIdInner(utf8FromBase64(trimmed));
    } catch {
      return '';
    }
  }
  if (trimmed.startsWith('{')) {
    return extractComicIdFromAggregationItemIdInner(trimmed);
  }
  const m = trimmed.match(/comic_id=(\d+)/);
  return m?.[1] ?? '';
}

/**
 * 聚合漫画 catalog 的 item_id 内层 JSON 常把 url/nexurl 的 comic_id 留空；
 * 服务端 /content 需要完整 comic_id，否则 panic 或正文为空。
 */
export function repairEmptyComicIdInAggregationItemId(
  itemId: string,
  comicIdHint = '',
): string {
  const inner = isBase64EncodedJsonItemId(itemId) ? utf8FromBase64(itemId.trim()) : itemId;
  if (!inner.trimStart().startsWith('{')) return itemId;
  let comicId = extractComicIdFromAggregationItemIdInner(inner);
  if (!comicId && comicIdHint.trim()) comicId = comicIdHint.trim();
  if (!comicId) return inner;
  if (!/comic_id=(?=&|"|'|$)|comic_id=""|comic_id=''/.test(inner)) return inner;
  return inner
    .replace(/comic_id=(?=&)/g, `comic_id=${comicId}`)
    .replace(/comic_id=&/g, `comic_id=${comicId}&`)
    .replace(/comic_id=\u0026/g, `comic_id=${comicId}\u0026`)
    .replace(/comic_id=""/g, `comic_id="${comicId}"`)
    .replace(/comic_id=''/g, `comic_id='${comicId}'`);
}

const AGGREGATION_URL_FIELD_RE = /^(url|nexurl|baseUrl|baseurl)$/i;
const AGGREGATION_API_URL_RE = /https?:\/\/|chapter|comic|getchapter|getcomic/i;

function appendComicIdQueryParam(url: string, comicId: string): string {
  const trimmed = url.trim();
  if (!trimmed || /comic_id=\d+/.test(trimmed)) return trimmed;
  const sep = trimmed.includes('?') ? '&' : '?';
  return `${trimmed}${sep}comic_id=${comicId}`;
}

/** 章节 item_id 的 url 字段完全缺少 comic_id 时，用书籍 comic_id 注入（晴天 catalog 常见） */
export function injectMissingComicIdInAggregationItemIdInner(
  inner: string,
  comicIdHint: string,
): string {
  const hint = comicIdHint.trim();
  if (!hint || !inner.trimStart().startsWith('{')) return inner;

  const afterEmpty = repairEmptyComicIdInAggregationItemId(inner, hint);
  if (afterEmpty !== inner) return afterEmpty;

  try {
    const parsed = JSON.parse(inner) as unknown;
    let changed = false;
    const visit = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const item of node) visit(item);
        return;
      }
      const record = node as Record<string, unknown>;
      for (const [key, value] of Object.entries(record)) {
        if (typeof value === 'string' && AGGREGATION_URL_FIELD_RE.test(key)) {
          if (AGGREGATION_API_URL_RE.test(value)) {
            const next = appendComicIdQueryParam(value, hint);
            if (next !== value) {
              record[key] = next;
              changed = true;
            }
          }
        } else if (value && typeof value === 'object') {
          visit(value);
        }
      }
    };
    visit(parsed);
    if (changed) return JSON.stringify(parsed);
  } catch {
    /* regex fallback */
  }

  return inner.replace(
    /"(url|nexurl|baseUrl)"\s*:\s*"(https?:[^"\\]*(?:\\.[^"\\]*)*)"/gi,
    (match, key: string, url: string) => {
      const decoded = url.replace(/\\u0026/g, '&');
      if (!AGGREGATION_API_URL_RE.test(decoded) || /comic_id=\d+/.test(decoded)) {
        return match;
      }
      const next = appendComicIdQueryParam(decoded, hint);
      if (next === decoded) return match;
      const encoded = next.replace(/&/g, '\\u0026');
      return `"${key}":"${encoded}"`;
    },
  );
}

function repairAggregationItemIdInner(inner: string, comicIdHint = ''): string {
  const hint = (comicIdHint ?? '').trim();
  const afterInject = injectMissingComicIdInAggregationItemIdInner(inner, hint);
  if (afterInject !== inner) return afterInject;
  return repairEmptyComicIdInAggregationItemId(inner, hint);
}

/**
 * 聚合 /content POST 的 item_id（对齐 Legado：POST 体为 catalog 原始 base64 字符串）。
 * 仅在内层 JSON 存在空 comic_id 且可推断 comic_id 时重新 base64，避免 JSON.stringify 规范化改变字节导致服务端 panic。
 */
/** catalog item_id 内是否仍有空 comic_id 占位（章节 url 常见，即便 baseUrl 已有 comic_id） */
export function needsContentApiItemIdRepair(itemId: string): boolean {
  const trimmed = (itemId ?? '').trim();
  if (!trimmed) return false;
  let inner = trimmed;
  if (isBase64EncodedJsonItemId(trimmed)) {
    try {
      inner = utf8FromBase64(trimmed);
    } catch {
      return false;
    }
  }
  if (!inner.trimStart().startsWith('{')) return false;
  return /comic_id=(?=&|"|'|$|\)|,)|comic_id=""|comic_id=''|comic_id=\\u0026/i.test(
    inner,
  );
}

export function resolveContentApiItemId(itemId: string, comicIdHint = ''): string {
  const trimmed = (itemId ?? '').trim();
  const hint = (comicIdHint ?? '').trim();
  if (!trimmed) return '';
  if (isBase64EncodedJsonItemId(trimmed)) {
    const inner = utf8FromBase64(trimmed);
    const repaired = repairAggregationItemIdInner(inner, hint);
    if (repaired === inner) return trimmed;
    return utf8ToBase64(repaired);
  }
  if (trimmed.startsWith('{')) {
    const repaired = repairAggregationItemIdInner(trimmed, hint);
    if (repaired === trimmed) return trimmed;
    return utf8ToBase64(repaired);
  }
  return trimmed;
}

/** /content 回退：修复后 base64、原始 base64、内层 JSON 字符串（部分聚合服二选一） */
/** 调试 /content 失败：是否需补 comic_id、章节 id 等（不记录 token） */
export function summarizeAggregationItemIdForDebug(
  itemId: string,
  bookIdHint = '',
): Record<string, unknown> {
  const comicHint = bookIdHint ? extractComicIdFromAggregationBookId(bookIdHint) : '';
  const needsRepair = needsContentApiItemIdRepair(itemId);
  let innerComic = '';
  let chapterId = '';
  try {
    const inner = isBase64EncodedJsonItemId(itemId.trim())
      ? utf8FromBase64(itemId.trim())
      : itemId;
    innerComic = extractComicIdFromAggregationItemIdInner(inner);
    const cm = inner.match(/chapter_id=(\d+)/);
    chapterId = cm?.[1] ?? '';
  } catch {
    /* ignore */
  }
  return {
    needsRepair,
    comicHint: comicHint || undefined,
    innerComic: innerComic || undefined,
    chapterId: chapterId || undefined,
  };
}

export function buildContentApiItemIdCandidates(
  itemId: string,
  comicIdHint = '',
): string[] {
  const trimmed = (itemId ?? '').trim();
  if (!trimmed) return [];
  const hint = (comicIdHint ?? '').trim();
  const out: string[] = [];
  const push = (v: string) => {
    const t = v.trim();
    if (t && !out.includes(t)) out.push(t);
  };

  push(trimmed);

  const resolved = resolveContentApiItemId(trimmed, hint);
  if (resolved !== trimmed) push(resolved);

  if (isBase64EncodedJsonItemId(trimmed)) {
    try {
      const inner = utf8FromBase64(trimmed);
      const repairedInner = repairAggregationItemIdInner(inner, hint);
      if (repairedInner !== inner) push(repairedInner);
    } catch {
      /* ignore */
    }
  }

  return out;
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

/**
 * /catalog 请求的 book_id（gyks 期望与 /detail 相同的编码，勿把 base64 解码成明文 URL 再提交）
 */
export function buildCatalogBookIdCandidates(bookId: string): string[] {
  const trimmed = (bookId ?? '').trim();
  return trimmed ? [trimmed] : [];
}

/**
 * 对齐 Legado ruleBookInfo.tocUrl JS：由详情 API data 生成 qingtian2 目录 data URL
 */
export function buildQingtian2TocDataUrl(
  detail: Record<string, unknown>,
): string | null {
  const book_id = String(detail.book_id ?? '').trim();
  const sources = coalesceSourceField(
    typeof detail.source === 'string' ? detail.source : undefined,
    typeof detail.sources === 'string' ? detail.sources : undefined,
  );
  const tab = String(detail.tab || '小说').trim();
  const url = String(detail.toc_url ?? detail.url ?? '').trim();
  if (!book_id || !sources) return null;
  const b64 = utf8ToBase64(
    JSON.stringify({ book_id, sources, tab, url }),
  );
  if (!b64) return null;
  return `data:;base64,${b64},{"type":"qingtian2"}`;
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

  const hostArrayMatch = jsLib.match(
    /(?:var|let)\s+hosts?\s*=\s*\[([^\]]+)\]/,
  );
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
