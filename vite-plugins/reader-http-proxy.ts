/**
 * 开发 / preview：纯 Web HTTP 代理 + 内嵌页文档代理（注入 Cookie / fetch 劫持）
 */
import type { Connect, Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { injectHtmlForInnerWeb } from './inner-web-inject-snippet';
import {
  decodeLegadoForwardHeaders,
  LEGADO_FORWARD_HEADERS_HEADER,
} from './legado-forward-headers';
import {
  normalizeProxyTarget,
  rewriteCssAssetUrls,
  rewriteHtmlAssetUrls,
  shouldRewriteProxiedBody,
} from './rewrite-origin-urls';
import { gunzipSync } from 'fflate';

const PROXY_PATH = '/__reader_http';
const COOKIE_HEADER = 'x-reader-cookie';
const LEGADO_HDR_LOWER = LEGADO_FORWARD_HEADERS_HEADER.toLowerCase();
const SESSION_TTL_MS = 30 * 60 * 1000;

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/** 浏览器发往 localhost 的头，转发书源时需替换或丢弃 */
const STRIP_REQUEST_HEADERS = new Set<string>(HOP_BY_HOP);
STRIP_REQUEST_HEADERS.add(COOKIE_HEADER);
STRIP_REQUEST_HEADERS.add(LEGADO_HDR_LOWER);
STRIP_REQUEST_HEADERS.add('host');
STRIP_REQUEST_HEADERS.add('origin');
STRIP_REQUEST_HEADERS.add('referer');
STRIP_REQUEST_HEADERS.add('content-length');

/** fetch 读 body 后已解压，勿再把 content-encoding 传给浏览器 */
const STRIP_RESPONSE_HEADERS = new Set<string>(HOP_BY_HOP);
STRIP_RESPONSE_HEADERS.add('content-encoding');
STRIP_RESPONSE_HEADERS.add('content-length');

/** 内嵌 iframe 经同源代理加载时，上游 framing 策略会误拦 localhost 父页 */
const STRIP_INNER_WEB_FRAMING_HEADERS = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'cross-origin-embedder-policy',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
]);

type InnerWebSession = {
  target: string;
  cookies: string;
  forwardHeaders?: Record<string, string>;
  /** 纯 Web CF 验证：子资源浏览器直连书源域 */
  cloudflareChallenge?: boolean;
  createdAt: number;
};

const innerWebSessions = new Map<string, InnerWebSession>();

function pruneSessions(): void {
  const now = Date.now();
  innerWebSessions.forEach((s, id) => {
    if (now - s.createdAt > SESSION_TTL_MS) innerWebSessions.delete(id);
  });
}

function newSessionId(): string {
  return `iw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function resolveProxyBase(req: IncomingMessage): string {
  const host = req.headers.host ?? '127.0.0.1';
  return `http://${host}${PROXY_PATH}`;
}

function parseCharsetFromContentType(contentType: string): string | null {
  const match = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i);
  if (!match?.[1]) return null;
  return match[1].trim().toLowerCase();
}

function inferHtmlCharsetFromMeta(buffer: Buffer): string | null {
  const asciiHead = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('latin1');
  const match = asciiHead.match(
    /<meta[^>]+(?:charset\s*=\s*["']?\s*([^"'\s/>]+)|content=["'][^"']*charset\s*=\s*([^"';\s>]+))/i,
  );
  const raw = (match?.[1] || match?.[2] || '').trim();
  return raw ? raw.toLowerCase() : null;
}

/** 书源常返回 gzip 但未标 Content-Encoding；Node fetch 不会自动解压 */
function maybeGunzipProxyBuffer(buf: Buffer, contentEncoding?: string | null): Buffer {
  const enc = contentEncoding?.trim().toLowerCase() ?? '';
  const u8 = new Uint8Array(buf);
  const isGzip = u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b;
  if (!enc.includes('gzip') && !isGzip) return buf;
  try {
    const out = gunzipSync(u8);
    const head = Buffer.from(out.subarray(0, Math.min(64, out.length))).toString('utf8').trimStart();
    if (head.startsWith('<') || head.startsWith('{') || head.startsWith('[')) {
      return Buffer.from(out);
    }
  } catch {
    /* keep original */
  }
  return buf;
}

function decodeBufferWithCharset(buffer: Buffer, contentType: string): string {
  const preferredCharset = parseCharsetFromContentType(contentType) || inferHtmlCharsetFromMeta(buffer) || 'utf-8';
  try {
    // Node TextDecoder supports WHATWG labels (including gbk/gb18030 in modern runtimes).
    return new TextDecoder(preferredCharset as string, { fatal: false }).decode(buffer);
  } catch {
    return buffer.toString('utf8');
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

/** 合并两段 `name=value; …`（后者同名覆盖前者） */
function mergeSemicolonCookieStrings(existing: string, incoming: string): string {
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

/** 合并 Set-Cookie / 现有 Cookie 串为 `name=value; …`（供内嵌书源设置页） */
function mergeCookieHeader(existing: string, setCookieLines: string[]): string {
  const map = new Map<string, string>();
  for (const part of existing.split(';')) {
    const t = part.trim();
    const i = t.indexOf('=');
    if (i > 0) map.set(t.slice(0, i).trim(), t.slice(i + 1).trim());
  }
  for (const line of setCookieLines) {
    const first = line.split(';')[0]?.trim() ?? '';
    const i = first.indexOf('=');
    if (i > 0) map.set(first.slice(0, i).trim(), first.slice(i + 1).trim());
  }
  return Array.from(map.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function collectUpstreamSetCookies(headers: Headers): string[] {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

const DEFAULT_BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MAX_UPSTREAM_REDIRECTS = 10;

function isLikelyImageTarget(target: string): boolean {
  return /\.(?:webp|jpe?g|png|gif|avif|bmp|svg)(?:\?|#|$)/i.test(target);
}

function resolveRedirectLocation(location: string, baseUrl: string): string {
  return new URL(location.trim(), baseUrl).href;
}

function looksLikeCloudflareChallenge(buf: Buffer, contentType: string): boolean {
  if (!contentType.toLowerCase().includes('text/html') && buf.length > 0) {
    const head = buf.subarray(0, Math.min(buf.length, 2048)).toString('utf8');
    if (!/just a moment|cf-chl|challenge-platform/i.test(head)) {
      return false;
    }
  }
  const text = buf.subarray(0, Math.min(buf.length, 4096)).toString('utf8').toLowerCase();
  return (
    text.includes('just a moment') ||
    text.includes('cf-chl') ||
    text.includes('challenge-platform')
  );
}

/** 服务端自行跟随重定向，避免把相对 Location（/kk/…）原样交给浏览器变成 localhost/kk */
async function fetchUpstreamFollowingRedirects(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_UPSTREAM_REDIRECTS; hop++) {
    const res = await fetch(current, { ...init, redirect: 'manual' });
    if (res.status < 300 || res.status >= 400) {
      return res;
    }
    const location = res.headers.get('location');
    if (!location?.trim() || hop === MAX_UPSTREAM_REDIRECTS) {
      return res;
    }
    current = resolveRedirectLocation(location, current);
  }
  throw new Error('upstream redirect limit exceeded');
}

function resolveUpstreamReferer(
  targetUrl: URL,
  session: InnerWebSession | undefined,
  refererOverride?: string,
): string | undefined {
  if (refererOverride === 'none') {
    return undefined;
  }
  if (refererOverride && /^https?:\/\//i.test(refererOverride)) {
    return refererOverride;
  }
  if (session?.target) {
    return session.target;
  }
  return `${targetUrl.origin}/`;
}

async function forwardToTarget(
  target: string,
  req: IncomingMessage,
  res: ServerResponse,
  sessionId?: string,
  refererOverride?: string,
  userAgentOverride?: string,
): Promise<void> {
  target = normalizeProxyTarget(target);

  const session = sessionId ? innerWebSessions.get(sessionId) : undefined;
  const targetUrl = new URL(target);

  // 勿把浏览器 sec-ch-ua / sec-fetch-* 等转发到上游（易触发 Cloudflare 挑战）
  // 勿把浏览器 sec-ch-ua / sec-fetch-* 等转发到上游（易触发 Cloudflare 挑战）
  const upstreamHeaders = new Headers();

  const legadoExtra = decodeLegadoForwardHeaders(req.headers[LEGADO_HDR_LOWER]);
  const reservedLegado = new Set([
    'referer',
    'user-agent',
    'cookie',
    'host',
    'origin',
    'connection',
    'content-length',
  ]);
  for (const [key, value] of Object.entries(legadoExtra)) {
    if (reservedLegado.has(key.toLowerCase())) continue;
    upstreamHeaders.set(key, value);
  }
  // iframe 导航无 Legado 头：用创建 session 时写入的书源 UA 等
  // iframe 导航无 Legado 头：用创建 session 时写入的书源 UA 等
  for (const [key, value] of Object.entries(session?.forwardHeaders ?? {})) {
    if (reservedLegado.has(key.toLowerCase())) continue;
    const lower = key.toLowerCase();
    if (upstreamHeaders.has(key) || upstreamHeaders.has(lower)) continue;
    upstreamHeaders.set(key, value);
  }

  let referer = resolveUpstreamReferer(targetUrl, session, refererOverride);
  const legadoRef =
    legadoExtra.Referer ??
    legadoExtra.referer ??
    legadoExtra.REFERER;
  if (!referer && refererOverride === 'none' && legadoRef?.trim()) {
    referer = legadoRef.trim();
  }
  if (
    isLikelyImageTarget(target) &&
    legadoRef?.trim() &&
    referer === `${targetUrl.origin}/`
  ) {
    referer = legadoRef.trim();
  }
  if (referer) {
    let origin = targetUrl.origin;
    try {
      origin = new URL(referer).origin;
    } catch {
      /* keep target origin */
    }
    upstreamHeaders.set('Origin', origin);
    upstreamHeaders.set('Referer', referer);
  }

  const legadoUa =
    legadoExtra['User-Agent'] ??
    legadoExtra['user-agent'] ??
    session?.forwardHeaders?.['User-Agent'] ??
    session?.forwardHeaders?.['user-agent'];
  const userAgent =
    userAgentOverride?.trim() ||
    legadoUa?.trim() ||
    DEFAULT_BROWSER_UA;
  upstreamHeaders.set('User-Agent', userAgent);
  upstreamHeaders.set('Host', targetUrl.host);
  upstreamHeaders.set('Accept-Language', 'zh-CN,zh;q=0.9,en;q=0.8');

  if (isLikelyImageTarget(target)) {
    upstreamHeaders.set(
      'Accept',
      'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    );
  } else {
    upstreamHeaders.set('Accept', '*/*');
  }

  const legadoCookie =
    legadoExtra.Cookie ?? legadoExtra.cookie ?? '';
  const proxyCookie = req.headers[COOKIE_HEADER];
  const proxyCookieStr = proxyCookie
    ? Array.isArray(proxyCookie)
      ? proxyCookie.join('; ')
      : String(proxyCookie)
    : '';
  let mergedCookie = '';
  if (legadoCookie.trim() && proxyCookieStr.trim()) {
    mergedCookie = mergeSemicolonCookieStrings(legadoCookie.trim(), proxyCookieStr.trim());
  } else if (legadoCookie.trim()) {
    mergedCookie = legadoCookie.trim();
  } else if (proxyCookieStr.trim()) {
    mergedCookie = proxyCookieStr.trim();
  } else if (session?.cookies) {
    mergedCookie = session.cookies;
  }
  if (mergedCookie) {
    upstreamHeaders.set('Cookie', mergedCookie);
  }

  const method = (req.method ?? 'GET').toUpperCase();
  let body: Buffer | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    body = await readBody(req);
    // 晴天 user_api：仅认 Cookie，带 JSON body 会 400
    if (method === 'POST' && /\/user_api\b/i.test(target)) {
      body = undefined;
      upstreamHeaders.delete('content-type');
      upstreamHeaders.delete('Content-Type');
    }
  } else {
    // 段评等 GET 带 Content-Type: application/json 会被部分上游拒绝
    upstreamHeaders.delete('content-type');
    upstreamHeaders.delete('Content-Type');
  }

  const upstream = await fetchUpstreamFollowingRedirects(target, {
    method,
    headers: upstreamHeaders,
    body: body?.length ? new Uint8Array(body) : undefined,
  });

  if (session && sessionId) {
    const setLines = collectUpstreamSetCookies(upstream.headers);
    if (setLines.length > 0) {
      session.cookies = mergeCookieHeader(session.cookies, setLines);
      innerWebSessions.set(sessionId, session);
    }
  }

  let statusCode = upstream.status;
  const ctHeader = upstream.headers.get('content-type') ?? '';
  let buf: Buffer = Buffer.from(await upstream.arrayBuffer());
  buf = maybeGunzipProxyBuffer(buf, upstream.headers.get('content-encoding'));

  let cfChallenge = false;
  if (looksLikeCloudflareChallenge(buf, ctHeader)) {
    cfChallenge = true;
    if (isLikelyImageTarget(target)) {
      statusCode = 403;
      buf = Buffer.from('Cloudflare challenge (use Tauri or browser direct img)', 'utf8');
    }
  }

  res.statusCode = statusCode;
  if (cfChallenge) {
    res.setHeader('X-Reader-Cf-Challenge', '1');
    if (isLikelyImageTarget(target)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }
  }
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (STRIP_RESPONSE_HEADERS.has(lower)) return;
    if (sessionId && lower === 'set-cookie') return;
    if (STRIP_INNER_WEB_FRAMING_HEADERS.has(lower)) return;
    res.setHeader(key, value);
  });
  if (sessionId && session?.cookies) {
    res.setHeader('X-Reader-Session-Cookie', session.cookies);
  }

  const ct = ctHeader;
  const rewriteBase = upstream.url || target;
  const shouldRewriteBody =
    buf.length > 0 &&
    (shouldRewriteProxiedBody(ct) || /\.css(?:\?|#|$)/i.test(rewriteBase));

  if (shouldRewriteBody) {
    const proxyBase = resolveProxyBase(req);
    const text = decodeBufferWithCharset(buf, ct);
    const isCss =
      ct.toLowerCase().includes('text/css') || /\.css(?:\?|#|$)/i.test(rewriteBase);
    let rewritten = isCss
      ? rewriteCssAssetUrls(text, rewriteBase, proxyBase, sessionId)
      : rewriteHtmlAssetUrls(text, rewriteBase, proxyBase, sessionId);

    if (
      !isCss &&
      sessionId &&
      session &&
      (ct.toLowerCase().includes('text/html') || rewritten.trimStart().startsWith('<'))
    ) {
      rewritten = injectHtmlForInnerWeb(
        rewritten,
        rewriteBase,
        session.cookies ?? '',
        sessionId,
        PROXY_PATH,
        session?.target ?? target,
        session.cloudflareChallenge === true,
      );
    }

    buf = Buffer.from(rewritten, 'utf8');
    res.setHeader('Cache-Control', 'no-store');
  }

  res.setHeader('Content-Length', String(buf.length));
  res.end(buf);
}

function createProxyMiddleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const rawUrl = req.url ?? '';
    if (!rawUrl.startsWith(PROXY_PATH)) {
      next();
      return;
    }

    pruneSessions();

    let parsed: URL;
    try {
      parsed = new URL(rawUrl, 'http://127.0.0.1');
    } catch {
      res.statusCode = 400;
      res.end('invalid proxy url');
      return;
    }

    const pathname = parsed.pathname;
    const method = (req.method ?? 'GET').toUpperCase();

    const sessionCookiesMatch = pathname.match(
      new RegExp(`^${PROXY_PATH}/session/([^/]+)/cookies$`)
    );
    if (sessionCookiesMatch && method === 'GET') {
      const session = innerWebSessions.get(sessionCookiesMatch[1]!);
      res.statusCode = session ? 200 : 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(session?.cookies ?? '');
      return;
    }

    const sessionIdMatch = pathname.match(new RegExp(`^${PROXY_PATH}/session/([^/]+)$`));
    if (sessionIdMatch) {
      const id = sessionIdMatch[1]!;
      if (method === 'PATCH') {
        try {
          const body = JSON.parse((await readBody(req)).toString('utf8')) as {
            cookies?: string;
          };
          const session = innerWebSessions.get(id);
          if (!session) {
            res.statusCode = 404;
            res.end('session not found');
            return;
          }
          if (typeof body.cookies === 'string' && body.cookies.trim()) {
            session.cookies = mergeSemicolonCookieStrings(session.cookies, body.cookies.trim());
            innerWebSessions.set(id, session);
          }
          res.statusCode = 204;
          res.end();
        } catch {
          res.statusCode = 400;
          res.end('invalid body');
        }
        return;
      }
      if (method === 'DELETE') {
        innerWebSessions.delete(id);
        res.statusCode = 204;
        res.end();
        return;
      }
    }

    if (pathname === `${PROXY_PATH}/session` && method === 'POST') {
      try {
        const body = JSON.parse((await readBody(req)).toString('utf8')) as {
          target?: string;
          cookies?: string;
          forwardHeaders?: string;
          cloudflareChallenge?: boolean;
        };
        const target = String(body.target ?? '').trim();
        const cookies = String(body.cookies ?? '').trim();
        if (!target.startsWith('http')) {
          sendJson(res, 400, { error: 'invalid target' });
          return;
        }
        const sessionId = newSessionId();
        innerWebSessions.set(sessionId, {
          target,
          cookies,
          forwardHeaders: decodeLegadoForwardHeaders(body.forwardHeaders),
          cloudflareChallenge: body.cloudflareChallenge === true,
          createdAt: Date.now(),
        });
        sendJson(res, 200, { sessionId });
      } catch {
        sendJson(res, 400, { error: 'invalid json' });
      }
      return;
    }

    if (pathname === `${PROXY_PATH}/doc` && method === 'GET') {
      const sessionId = parsed.searchParams.get('session') ?? '';
      const session = innerWebSessions.get(sessionId);
      if (!session) {
        res.statusCode = 404;
        res.end('session not found');
        return;
      }
      try {
        await forwardToTarget(session.target, req, res, sessionId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.statusCode = 502;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(`doc proxy error: ${msg}`);
      }
      return;
    }

    const proxySessionId = parsed.searchParams.get('session') ?? undefined;
    const session = proxySessionId ? innerWebSessions.get(proxySessionId) : undefined;
    let target = parsed.searchParams.get('target') ?? '';
    if (session?.target?.startsWith('http')) {
      try {
        const sessionPath = new URL(session.target).pathname;
        const reqPath = target ? new URL(target).pathname : '';
        if (sessionPath.includes('get_para_review') && reqPath.includes('get_para_review')) {
          target = session.target;
        }
      } catch {
        if (!/^https?:\/\//i.test(target)) target = session.target;
      }
    }
    if (!target || !/^https?:\/\//i.test(target)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(
        target?.trim().startsWith('data:')
          ? 'data: URLs cannot be proxied; decode locally'
          : 'missing or invalid target',
      );
      return;
    }

    const refererParam = parsed.searchParams.get('referer') ?? undefined;
    const refererOverride =
      refererParam === 'none'
        ? 'none'
        : refererParam && /^https?:\/\//i.test(refererParam)
          ? refererParam
          : undefined;
    const userAgentOverride = parsed.searchParams.get('userAgent') ?? undefined;

    try {
      await forwardToTarget(
        target,
        req,
        res,
        proxySessionId,
        refererOverride,
        userAgentOverride ?? undefined,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[reader-http-proxy]', target, msg);
      res.statusCode = 502;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(`proxy error: ${msg}`);
    }
  };
}

export function readerHttpProxy(): Plugin {
  const attach = (middlewares: Connect.Server) => {
    middlewares.use(createProxyMiddleware());
  };

  return {
    name: 'reader-http-proxy',
    configureServer(server) {
      attach(server.middlewares);
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
    },
  };
}

