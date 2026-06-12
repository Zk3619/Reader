/**
 * Web 服务 UI 静态资源（Node 侧，与 Rust web_static 对齐）
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ServerResponse } from 'node:http';

const WEB_UI_ROOT = path.resolve(process.cwd(), 'web-service-dist');

export function collectLocalIPv4Addresses(): string[] {
  const out = new Set<string>(['127.0.0.1']);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        out.add(net.address);
      }
    }
  }
  return [...out].sort();
}

function mimeForExt(ext: string): string {
  switch (ext) {
    case 'html':
    case 'htm':
      return 'text/html; charset=utf-8';
    case 'js':
    case 'mjs':
      return 'application/javascript; charset=utf-8';
    case 'css':
      return 'text/css; charset=utf-8';
    case 'json':
      return 'application/json; charset=utf-8';
    case 'svg':
      return 'image/svg+xml';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'ico':
      return 'image/x-icon';
    case 'woff':
      return 'font/woff';
    case 'woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

function resolveStaticFile(requestPath: string): { file: string; contentType: string } | null {
  const pathOnly = requestPath.split('?')[0] ?? requestPath;
  let rel = pathOnly.replace(/^\//, '');
  if (!rel || rel.endsWith('/')) rel = 'index.html';
  if (rel.includes('..')) return null;

  const file = path.join(WEB_UI_ROOT, rel);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    return { file, contentType: mimeForExt(path.extname(file).slice(1).toLowerCase()) };
  }

  if (!rel.includes('.')) {
    const index = path.join(WEB_UI_ROOT, 'index.html');
    if (fs.existsSync(index)) {
      return { file: index, contentType: 'text/html; charset=utf-8' };
    }
  }

  return null;
}

export function tryServeWebServiceStatic(
  res: ServerResponse,
  rawUrl: string,
  cors: Record<string, string>,
): boolean {
  const resolved = resolveStaticFile(rawUrl);
  if (!resolved) return false;
  try {
    const data = fs.readFileSync(resolved.file);
    res.writeHead(200, {
      'Content-Type': resolved.contentType,
      'Content-Length': data.length,
      ...cors,
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

export function buildNetAddressesJson(): string {
  return JSON.stringify({
    isSuccess: true,
    errorMsg: '',
    data: collectLocalIPv4Addresses(),
  });
}

export function buildApiInfoJson(port: number): string {
  const addrs = collectLocalIPv4Addresses();
  const accessUrls = addrs.map((ip) => `http://${ip}:${port}`);
  return JSON.stringify({
    isSuccess: true,
    errorMsg: '',
    data: {
      name: 'Reader Web Service',
      description: 'Legado 兼容 REST API 与浏览器 Web UI（书架、阅读、书源、备份）',
      port,
      localAddresses: addrs,
      accessUrls,
      hint: '浏览器访问根路径打开 Web UI；本接口为 API 说明',
      endpoints: [
        '/getBookshelf',
        '/getBookSources',
        '/getChapterList',
        '/getBookContent',
        '/getReplaceRules',
        '/backup',
        '/saveBookProgress',
      ],
    },
  });
}
