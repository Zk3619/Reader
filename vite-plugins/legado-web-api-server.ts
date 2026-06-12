/**
 * 纯 Web dev/preview：Legado 兼容 HTTP 服务（默认 1122）
 * 业务逻辑在浏览器 dispatchLegadoWebApi，经 SSE 桥接执行。
 */
import type { Connect, Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  completeLegadoBridgeRequest,
  enqueueLegadoBridgeRequest,
  registerLegadoBridgeSseClient,
} from './legado-web-api-bridge';
import {
  buildApiInfoJson,
  buildNetAddressesJson,
  tryServeWebServiceStatic,
} from './web-service-static';

const LEGADO_API_PATHS = new Set([
  '/getBookSource', '/getBookSources', '/getBookshelf', '/getChapterList', '/refreshToc',
  '/getBookContent', '/cover', '/image', '/getReadConfig', '/getRssSource', '/getRssSources',
  '/getReplaceRules', '/backupPreview', '/backup', '/saveBookSource', '/saveBookSources',
  '/deleteBookSources', '/saveBook', '/deleteBook', '/saveBookProgress', '/addLocalBook',
  '/saveReadConfig', '/saveRssSource', '/saveRssSources', '/deleteRssSources',
  '/saveReplaceRule', '/deleteReplaceRule', '/testReplaceRule',
]);

function normalizeLegadoApiPath(path: string): string {
  const raw = path.split('?')[0] ?? path;
  return raw.endsWith('/') && raw.length > 1 ? raw.slice(0, -1) : raw;
}

function isLegadoWebApiPath(path: string): boolean {
  return LEGADO_API_PATHS.has(normalizeLegadoApiPath(path));
}

const BRIDGE_STREAM = '/__legado_bridge/stream';
const BRIDGE_COMPLETE = '/__legado_bridge/complete';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseQuery(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const q = url.indexOf('?');
  if (q < 0) return out;
  for (const part of url.slice(q + 1).split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = decodeURIComponent(eq >= 0 ? part.slice(0, eq) : part);
    const value = decodeURIComponent(eq >= 0 ? part.slice(eq + 1) : '');
    if (key && !(key in out)) out[key] = value;
  }
  return out;
}

function corsHeaders(origin?: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type,authorization,token',
  };
}

function writeJson(res: ServerResponse, status: number, body: unknown, origin?: string | null): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    ...corsHeaders(origin),
  });
  res.end(text);
}

function writeBridgeError(res: ServerResponse, msg: string, origin?: string | null): void {
  writeJson(
    res,
    503,
    { isSuccess: false, errorMsg: msg, data: null },
    origin,
  );
}

async function handleLegadoHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  rawUrl: string,
  port: number,
): Promise<void> {
  const origin = req.headers.origin ?? null;
  const method = (req.method ?? 'GET').toUpperCase();
  const pathOnly = normalizeLegadoApiPath(rawUrl.split('?')[0] ?? rawUrl);

  if (method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  if (method === 'GET' && pathOnly === '/__reader/net-addresses') {
    const text = buildNetAddressesJson();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(text),
      ...corsHeaders(origin),
    });
    res.end(text);
    return;
  }

  if (method === 'GET' && pathOnly === '/api') {
    const text = buildApiInfoJson(port);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(text),
      ...corsHeaders(origin),
    });
    res.end(text);
    return;
  }

  if (method === 'GET' && tryServeWebServiceStatic(res, rawUrl, corsHeaders(origin))) {
    return;
  }

  if (!isLegadoWebApiPath(pathOnly)) {
    writeJson(res, 404, { isSuccess: false, errorMsg: 'not found', data: null }, origin);
    return;
  }

  let body: string | null = null;
  if (method === 'POST') {
    const text = await readBody(req);
    body = text.trim() ? text : null;
  }

  const id = randomUUID();
  try {
    const serialized = await enqueueLegadoBridgeRequest({
      id,
      path: rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`,
      method,
      body,
      query: parseQuery(rawUrl),
    });
    const parsed = JSON.parse(serialized) as {
      kind?: string;
      body?: string;
      contentType?: string;
      filename?: string | null;
      base64?: string;
    };

    if (parsed.kind === 'binary' && parsed.base64) {
      const data = Buffer.from(parsed.base64, 'base64');
      const headers: Record<string, string> = {
        'Content-Type': parsed.contentType ?? 'application/octet-stream',
        'Content-Length': String(data.length),
        ...corsHeaders(origin),
      };
      if (parsed.filename) {
        headers['Content-Disposition'] = `attachment; filename="${parsed.filename}"`;
      }
      res.writeHead(200, headers);
      res.end(data);
      return;
    }

    const jsonBody = parsed.body ?? serialized;
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(jsonBody),
      ...corsHeaders(origin),
    });
    res.end(jsonBody);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeBridgeError(
      res,
      msg.includes('timeout')
        ? '浏览器未连接 Web 服务桥接，请打开 Reader 并启用 Web 服务'
        : msg,
      origin,
    );
  }
}

function createBridgeMiddleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = req.url ?? '';
    const origin = req.headers.origin ?? null;

    if (url === BRIDGE_STREAM && (req.method ?? 'GET') === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...corsHeaders(origin),
      });
      const send = (data: string) => {
        res.write(`data: ${data}\n\n`);
      };
      send(JSON.stringify({ type: 'hello' }));
      const unregister = registerLegadoBridgeSseClient(send);
      req.on('close', () => {
        unregister();
      });
      return;
    }

    if (url === BRIDGE_COMPLETE && (req.method ?? 'POST') === 'POST') {
      try {
        const text = await readBody(req);
        const parsed = JSON.parse(text) as { id?: string; response?: string };
        if (!parsed.id || typeof parsed.response !== 'string') {
          writeJson(res, 400, { ok: false }, origin);
          return;
        }
        const ok = completeLegadoBridgeRequest(parsed.id, parsed.response);
        writeJson(res, ok ? 200 : 404, { ok }, origin);
      } catch {
        writeJson(res, 400, { ok: false }, origin);
      }
      return;
    }

    next();
  };
}

let httpServer: http.Server | null = null;

function startLegadoHttpServer(port: number): void {
  if (httpServer) return;
  httpServer = http.createServer((req, res) => {
    const rawUrl = req.url ?? '/';
    void handleLegadoHttpRequest(req, res, rawUrl, port).catch((e) => {
      writeBridgeError(res, e instanceof Error ? e.message : String(e), req.headers.origin ?? null);
    });
  });
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`[legado-web-api] http://127.0.0.1:${port} (browser SSE bridge)`);
  });
  httpServer.on('error', (e) => {
    console.warn('[legado-web-api] 启动失败', e);
    httpServer = null;
  });
}

export function legadoWebApiServer(): Plugin {
  const isTauriDev = Boolean(process.env.TAURI_ENV_PLATFORM);
  const isVitest = process.env.VITEST === 'true';
  const port = Number(process.env.READER_WEB_API_PORT ?? 1122);

  const attachBridge = (middlewares: Connect.Server) => {
    if (!isTauriDev && !isVitest) {
      middlewares.use(createBridgeMiddleware());
    }
  };

  return {
    name: 'legado-web-api-server',
    configureServer(server) {
      attachBridge(server.middlewares);
      if (!isTauriDev && !isVitest) {
        startLegadoHttpServer(port);
      }
    },
    configurePreviewServer(server) {
      attachBridge(server.middlewares);
      if (!isTauriDev && !isVitest) {
        startLegadoHttpServer(port);
      }
    },
  };
}
