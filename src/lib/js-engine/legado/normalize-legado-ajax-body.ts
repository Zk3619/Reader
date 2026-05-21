/**
 * Legado 登录脚本 ajax 请求体 / Cookie 修正（晴天聚合 login_api / user_api）
 */

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
  const dev = String(deviceId ?? '').trim() || 'web_reader';
  if (!token) return raw;
  if (/qttoken=/i.test(raw) && /deviceId=/i.test(raw)) return raw;
  if (/qttoken=/i.test(raw)) return `${raw};deviceId=${dev}`;
  return `qttoken=${token};deviceId=${dev}`;
}

/** 从 cookie 串或裸 token 提取 qttoken / key */
export function extractQttokenKey(cookieOrToken: string): string {
  const s = String(cookieOrToken ?? '').trim();
  if (!s) return '';
  const m = s.match(/(?:^|;)\s*qttoken=([^;]+)/i);
  if (m) return m[1].trim();
  if (!s.includes('=') && !s.includes(';')) return s;
  for (const part of s.split(';')) {
    const trimmed = part.trim();
    if (/qttoken/i.test(trimmed)) {
      const eq = trimmed.indexOf('=');
      return eq >= 0 ? trimmed.slice(eq + 1).trim() : '';
    }
  }
  return '';
}

/** 合并脚本 headers.cookie 与存储 Cookie，统一为 HTTP Cookie 头 */
export function mergeAjaxCookieHeaders(
  headers: Record<string, string>,
  cookieFromStore: string
): Record<string, string> {
  const hdrs = { ...headers };
  const fromHeader = String(hdrs.Cookie ?? hdrs.cookie ?? '').trim();
  delete hdrs.cookie;
  const merged = String(cookieFromStore ?? '').trim() || fromHeader;
  if (merged) hdrs.Cookie = merged;
  return hdrs;
}

/**
 * 晴天 user_api：服务端从 Cookie 读取 qttoken（非 JSON body）。
 * 实测带 `{"key":...}` 会返回「请求参数中未找到密钥」。
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

/** 合并两段 `name=value; …` Cookie 串（后者同名覆盖前者） */
export function mergeLegadoCookieHeaderStrings(existing: string, incoming: string): string {
  const map = new Map<string, string>();
  for (const part of `${existing};${incoming}`.split(';')) {
    const t = part.trim();
    const i = t.indexOf('=');
    if (i > 0) map.set(t.slice(0, i).trim(), t.slice(i + 1).trim());
  }
  return Array.from(map.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}
