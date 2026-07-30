/** 订阅源 URL 规范化；rsshub://route 映射到可请求的 RSSHub 实例。 */

const DEFAULT_RSSHUB_BASE_URL = 'https://rsshub.app';

function rsshubBaseUrl(): string {
  const configured = String(import.meta.env.VITE_RSSHUB_BASE_URL ?? '').trim();
  return (configured || DEFAULT_RSSHUB_BASE_URL).replace(/\/+$/, '');
}

export function resolveSubscribeFeedUrl(input: string): string {
  const url = input.trim();
  if (!url) throw new Error('订阅源 URL 为空');

  if (/^rsshub:\/\//i.test(url)) {
    const route = url.replace(/^rsshub:\/\//i, '').replace(/^\/+/, '');
    if (!route) throw new Error('RSSHub 路由为空');
    return `${rsshubBaseUrl()}/${route}`;
  }

  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`不支持的订阅源协议: ${url.split(':', 1)[0] || '未知'}`);
  }
  return url;
}
