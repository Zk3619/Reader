/**
 * Web 服务说明与访问地址
 */

import { LEGADO_API_PATHS } from '@/lib/web-api/paths';
import { legadoOk } from '@/lib/web-api/return-data';

export function formatWebServiceBaseUrl(port: number, host = '127.0.0.1'): string {
  return `http://${host}:${port}`;
}

export function buildWebServiceAccessUrls(port: number, localAddresses: string[]): string[] {
  const hosts = localAddresses.length ? localAddresses : ['127.0.0.1'];
  return hosts.map((host) => formatWebServiceBaseUrl(port, host));
}

export function buildWebServiceRootPayload(port: number, localAddresses?: string[]) {
  const addresses = localAddresses?.length ? localAddresses : ['127.0.0.1'];
  const accessUrls = buildWebServiceAccessUrls(port, addresses);
  return legadoOk({
    name: 'Reader Web Service',
    description:
      'Legado 兼容 REST API 与浏览器 Web UI（书架、阅读、书源、备份）；根路径 `/` 为 Web 界面。',
    port,
    localAddresses: addresses,
    accessUrls,
    hint: '浏览器访问根路径打开 Web UI；本说明见 GET /api',
    endpoints: Array.from(LEGADO_API_PATHS).sort(),
  });
}

export function buildWebServiceRootJson(port: number, localAddresses?: string[]): string {
  return JSON.stringify(buildWebServiceRootPayload(port, localAddresses));
}

/** 设置页展示用：常用 API 示例（默认本机回环） */
export function formatWebServiceExampleUrls(port: number, host = '127.0.0.1'): string[] {
  const base = formatWebServiceBaseUrl(port, host);
  return [`${base}/`, `${base}/getBookshelf`, `${base}/getBookSources`, `${base}/api`];
}
