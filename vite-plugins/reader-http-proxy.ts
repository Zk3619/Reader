/**
 * 开发 / preview：纯 Web HTTP 代理 + 内嵌页文档代理（注入 Cookie / fetch 劫持）
 */
import type { Connect, Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { injectHtmlForInnerWeb } from './inner-web-inject-snippet';
import {
  normalizeProxyTarget,
  rewriteCssAssetUrls,
  rewriteHtmlAssetUrls,
  shouldRewriteProxiedBody,
} from './rewrite-origin-urls';

const PROXY_PATH = '/__reader_http';
const COOKIE_HEADER = 'x-reader-cookie';
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
STRIP_REQUEST_HEADERS.add('host');
STRIP_REQUEST_HEADERS.add('origin');
STRIP_REQUEST_HEADERS.add('referer');
STRIP_REQUEST_HEADERS.add('content-length');

/** fetch 读 body 后已解压，勿再把 content-encoding 传给浏览器 */
const STRIP_RESPONSE_HEADERS = new Set<string>(HOP_BY_HOP);
STRIP_RESPONSE_HEADERS.add('content-encoding');
STRIP_RESPONSE_HEADERS.add('content-length');

type InnerWebSession = {
  target: string;
  cookies: string;
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

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function forwardToTarget(
  target: string,
  req: IncomingMessage,
  res: ServerResponse,
  sessionId?: string
): Promise<void> {
  target = normalizeProxyTarget(target);

  const session = sessionId ? innerWebSessions.get(sessionId) : undefined;
  const targetUrl = new URL(target);

  const upstreamHeaders = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    const lower = key.toLowerCase();
    if (STRIP_REQUEST_HEADERS.has(lower)) continue;
    if (Array.isArray(value)) {
      value.forEach((v) => upstreamHeaders.append(key, v));
    } else {
      upstreamHeaders.set(key, value);
    }
  }

  upstreamHeaders.set('Host', targetUrl.host);
  upstreamHeaders.set('Origin', targetUrl.origin);
  upstreamHeaders.set('Referer', session?.target ?? `${targetUrl.origin}/`);

  const cookie = req.headers[COOKIE_HEADER];
  if (cookie) {
    upstreamHeaders.set('Cookie', Array.isArray(cookie) ? cookie.join('; ') : cookie);
  } else if (session?.cookies) {
    upstreamHeaders.set('Cookie', session.cookies);
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
  }

  const upstream = await fetch(target, {
    method,
    headers: upstreamHeaders,
    body: body?.length ? new Uint8Array(body) : undefined,
    redirect: 'follow',
  });

  res.statusCode = upstream.status;
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (STRIP_RESPONSE_HEADERS.has(lower)) return;
    res.setHeader(key, value);
  });

  const ct = upstream.headers.get('content-type') ?? '';
  let buf = Buffer.from(await upstream.arrayBuffer());

  const rewriteBase = upstream.url || target;
  const shouldRewriteBody =
    buf.length > 0 &&
    (shouldRewriteProxiedBody(ct) || /\.css(?:\?|#|$)/i.test(rewriteBase));

  if (shouldRewriteBody) {
    const proxyBase = resolveProxyBase(req);
    const text = buf.toString('utf8');
    const isCss =
      ct.toLowerCase().includes('text/css') || /\.css(?:\?|#|$)/i.test(rewriteBase);
    let rewritten = isCss
      ? rewriteCssAssetUrls(text, rewriteBase, proxyBase, sessionId)
      : rewriteHtmlAssetUrls(text, rewriteBase, proxyBase, sessionId);

    if (
      !isCss &&
      sessionId &&
      session?.cookies &&
      (ct.toLowerCase().includes('text/html') || rewritten.trimStart().startsWith('<'))
    ) {
      rewritten = injectHtmlForInnerWeb(
        rewritten,
        rewriteBase,
        session.cookies,
        sessionId,
        PROXY_PATH
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
          if (typeof body.cookies === 'string') {
            session.cookies = body.cookies;
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
        };
        const target = String(body.target ?? '').trim();
        const cookies = String(body.cookies ?? '').trim();
        if (!target.startsWith('http') || !cookies) {
          sendJson(res, 400, { error: 'invalid target or cookies' });
          return;
        }
        const sessionId = newSessionId();
        innerWebSessions.set(sessionId, {
          target,
          cookies,
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
        const upstream = await fetch(session.target, {
          method: 'GET',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            Cookie: session.cookies,
          },
          redirect: 'follow',
        });
        const ct = upstream.headers.get('content-type') ?? '';
        const raw = await upstream.text();
        if (!ct.includes('text/html') && !raw.trimStart().startsWith('<')) {
          res.statusCode = upstream.status;
          res.setHeader('Content-Type', ct || 'text/plain');
          res.end(raw);
          return;
        }
        const proxyBase = resolveProxyBase(req);
        const rewritten = rewriteHtmlAssetUrls(raw, session.target, proxyBase, sessionId);
        const injected = injectHtmlForInnerWeb(
          rewritten,
          session.target,
          session.cookies,
          sessionId,
          PROXY_PATH
        );
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(injected);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.statusCode = 502;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(`doc proxy error: ${msg}`);
      }
      return;
    }

    const target = parsed.searchParams.get('target');
    if (!target || !/^https?:\/\//i.test(target)) {
      res.statusCode = 400;
      res.end('missing or invalid target');
      return;
    }

    const proxySessionId = parsed.searchParams.get('session') ?? undefined;

    try {
      await forwardToTarget(target, req, res, proxySessionId);
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
