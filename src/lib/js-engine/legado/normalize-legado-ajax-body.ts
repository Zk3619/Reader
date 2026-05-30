/**
 * Legado 登录脚本 ajax 请求体 / Cookie 修正（login_api / user_api 等）
 */

import {
  coalesceSourceField,
  needsContentApiItemIdRepair,
  resolveContentApiItemId,
} from '@/lib/book-source/utils';

/**
 * 书源 cookie 串规范为 WebView / HTTP Cookie 头（`qttoken=…;deviceId=…`）。
 * 晴天等书源用 `;` 无空格，须保证 deviceId 存在。
 */
export function normalizeLegadoCookieHeader(
  cookieStr: string,
  deviceId?: string
): string {
  const raw = String(cookieStr ?? '').trim();
  if (!raw) return '';
  const token = extractQttokenKey(raw);
  if (!token) return raw;
  const dev = String(deviceId ?? '').trim();
  // 显式 deviceId（含书源变量固定值）须覆盖规则脚本 cookie 里已有的 androidId
  // 对齐 Legado ruleContent：`qttoken=…; deviceId=…;`（分号后空格 + 末尾分号）
  if (dev) {
    return `qttoken=${token}; deviceId=${dev};`;
  }
  const fallbackDev = 'web_reader';
  if (/qttoken=/i.test(raw) && /deviceId=/i.test(raw)) return raw;
  if (/qttoken=/i.test(raw)) return `${raw};deviceId=${fallbackDev}`;
  return `qttoken=${token};deviceId=${fallbackDev}`;
}

/** 书源脚本未拿到 key 时可能写入字面量 undefined/null，不能当作有效 token */
export function isInvalidLegadoToken(token: string): boolean {
  const t = String(token ?? '').trim().toLowerCase();
  return !t || t === 'undefined' || t === 'null' || t === 'true' || t === 'false';
}

/** 从 cookie 串或裸 token 提取 qttoken / key */
export function extractQttokenKey(cookieOrToken: string): string {
  const s = String(cookieOrToken ?? '').trim();
  if (!s) return '';
  const m = s.match(/(?:^|;)\s*qttoken=([^;]+)/i);
  if (m) {
    const token = m[1].trim();
    return isInvalidLegadoToken(token) ? '' : token;
  }
  if (!s.includes('=') && !s.includes(';')) {
    return isInvalidLegadoToken(s) ? '' : s;
  }
  for (const part of s.split(';')) {
    const trimmed = part.trim();
    if (/qttoken/i.test(trimmed)) {
      const eq = trimmed.indexOf('=');
      const token = eq >= 0 ? trimmed.slice(eq + 1).trim() : '';
      return isInvalidLegadoToken(token) ? '' : token;
    }
  }
  return '';
}

/** 从 Cookie 串取指定键（对齐 Legado cookie.getKey；device 匹配 deviceId） */
export function extractLegadoCookieValue(cookieStr: string, keyName: string): string {
  const s = String(cookieStr ?? '').trim();
  if (!s) return '';
  const key = String(keyName ?? '').trim();
  if (!key || key === 'qttoken') {
    const token = extractQttokenKey(s);
    if (token) return token;
    if (!key) return '';
  }
  if (key === 'device' || key === 'deviceId') {
    const m = s.match(/(?:^|;)\s*deviceId=([^;]+)/i);
    if (m?.[1]?.trim()) return m[1].trim();
    const legacy = s.match(/(?:^|;)\s*device=([^;]+)/i);
    if (legacy?.[1]?.trim()) return legacy[1].trim();
  }
  for (const part of s.split(';')) {
    const trimmed = part.trim();
    if (trimmed.includes(key)) {
      const eq = trimmed.indexOf('=');
      return eq >= 0 ? trimmed.slice(eq + 1).trim() : '';
    }
  }
  return '';
}

/**
 * 合并脚本 headers.cookie 与存储 Cookie，统一为 HTTP Cookie 头。
 * 对齐 Legado：库 Cookie 先合并，规则 ajax 里的 cookie 同名键覆盖前者。
 */
export function mergeAjaxCookieHeaders(
  headers: Record<string, string>,
  cookieFromStore: string
): Record<string, string> {
  const hdrs = { ...headers };
  const fromHeader = mergeLegadoCookieHeaderStrings(
    String(hdrs.Cookie ?? '').trim(),
    String(hdrs.cookie ?? '').trim(),
  );
  delete hdrs.cookie;
  const fromStore = String(cookieFromStore ?? '').trim();
  const merged =
    fromStore && fromHeader
      ? mergeLegadoCookieHeaderStrings(fromStore, fromHeader)
      : fromStore || fromHeader;
  if (merged) hdrs.Cookie = merged;
  return hdrs;
}

/**
 * user_api：服务端从 Cookie 读取 qttoken（非 JSON body）。
 * 带 JSON body 时部分聚合服会返回「请求参数中未找到密钥」。
 */
export function resolveUserApiCookieHeader(
  cookieStr: string,
  options?: { argToken?: string; deviceId?: string; formKey?: string }
): string {
  const token =
    extractQttokenKey(cookieStr) ||
    String(options?.formKey ?? '').trim() ||
    String(options?.argToken ?? '').trim();
  const raw = String(cookieStr ?? '').trim();
  if (!token) return raw;

  const deviceId = String(options?.deviceId ?? '').trim() || 'web_reader';
  if (/qttoken=/i.test(raw) && /deviceId=/i.test(raw)) return raw;
  if (/qttoken=/i.test(raw)) {
    return /deviceId=/i.test(raw) ? raw : `${raw};deviceId=${deviceId}`;
  }
  return `qttoken=${token};deviceId=${deviceId}`;
}

/** user_api POST：不注入 JSON body，与 Legado checkStatus 一致（仅 Cookie） */
export function normalizeUserApiPostBody(
  resolvedUrl: string,
  method: 'GET' | 'POST',
  body: string | undefined,
  _options?: {
    cookieStr?: string;
    formKey?: string;
    argToken?: string;
  }
): string | undefined {
  if (method !== 'POST' || !/\/user_api\b/.test(resolvedUrl)) return body;
  return undefined;
}

export function isUserApiPost(resolvedUrl: string, method: string): boolean {
  return method.toUpperCase() === 'POST' && /\/user_api\b/.test(resolvedUrl);
}

/** WebView 读出 `a=1;b=2` → 书源 applyCookieSettings 使用的 `; ` 分隔 */
export function normalizeControlSettingsCookieHeader(raw: string): string {
  return String(raw ?? '')
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .join('; ');
}

function parseCookieHeaderParts(cookieStr: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of String(cookieStr ?? '').split(';')) {
    const t = part.trim();
    const i = t.indexOf('=');
    if (i > 0) map.set(t.slice(0, i).trim(), t.slice(i + 1).trim());
  }
  return map;
}

/** 合并两段 `name=value; …` Cookie 串（后者同名覆盖前者） */
export function mergeLegadoCookieHeaderStrings(existing: string, incoming: string): string {
  const map = parseCookieHeaderParts(existing);
  for (const [key, value] of parseCookieHeaderParts(incoming)) {
    if (/^qttoken$/i.test(key) && isInvalidLegadoToken(value)) continue;
    if ((key === 'deviceId' || key === 'device') && !value.trim()) continue;
    map.set(key, value);
  }
  return Array.from(map.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

/** Legado 正文 POST 用 catalog 短名（全面漫画），不用详情 svip_ 前缀 */
function catalogSourceForContentPost(name: string): string {
  const t = name.trim();
  if (!t) return t;
  return /^svip_(.+)$/i.test(t) ? t.replace(/^svip_/i, '') : t;
}

/** 对齐 Legado ruleContent params：仅 source（catalog 短名），不带 sources 字段 */
export function applyContentApiPostEnrichment(parsed: Record<string, unknown>): void {
  const raw = coalesceSourceField(
    typeof parsed.sources === 'string' ? parsed.sources : undefined,
    typeof parsed.source === 'string' ? parsed.source : undefined,
  );
  const catalog = catalogSourceForContentPost(raw);
  if (catalog) {
    parsed.source = catalog;
  }
  delete parsed.sources;
}

/**
 * ruleContent ajax：默认保持 catalog 原始 item_id（对齐 Legado）；
 * repairItemId: true 时仅在显式开启且有空 comic_id 时修复。
 */
export function normalizeContentApiPostBody(
  resolvedUrl: string,
  method: string,
  body: string | undefined,
  options?: { comicIdHint?: string; repairItemId?: boolean },
): string | undefined {
  if (method !== 'POST' || !/\/content\b/.test(resolvedUrl) || !body?.trim()) {
    return body;
  }
  const trimmed = body.trim();
  if (!trimmed.startsWith('{')) return body;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    applyContentApiPostEnrichment(parsed);
    if (
      options?.repairItemId === true &&
      typeof parsed.item_id === 'string' &&
      needsContentApiItemIdRepair(parsed.item_id)
    ) {
      parsed.item_id = resolveContentApiItemId(
        parsed.item_id,
        options?.comicIdHint ?? '',
      );
    }
    return JSON.stringify(parsed);
  } catch {
    return body;
  }
}
