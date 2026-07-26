/**
 * 弹幕 URL 模板（对齐 FongMi CONFIG danmaku：{name} / {episode}）
 *
 * 注意：本地 `/proxy?do=danmaku` 依赖 JAR Spider.Proxy，Reader 未实现该 do，
 * 直接交给 artplayer fetch 会 502；见 isLocalJarDanmakuProxy。
 */

import {
  fixLocalProxyUrl,
  isUsableHttpUrl,
  wrapMediaThroughProxy,
} from '../proxy/client';

/** 补全配置/爬虫返回的弹幕 URL（vodName / episode / vodUrl） */
export function fillDanmakuTemplate(
  template: string,
  vodName: string,
  episodeName: string,
  playUrl: string,
): string {
  if (!template.trim()) return template;
  const index = episodeName.match(/\d+/)?.[0] ?? episodeName;
  const replaceLiterals = (s: string) =>
    s
      .replace(/\{name\}/gi, encodeURIComponent(vodName))
      .replace(/\{episode\}/gi, encodeURIComponent(episodeName))
      .replace(/\{index\}/gi, encodeURIComponent(index))
      .replace(/\{url\}/gi, encodeURIComponent(playUrl));

  const filled = replaceLiterals(template);
  try {
    const u = new URL(filled);
    if (!u.searchParams.get('vodName')) u.searchParams.set('vodName', vodName);
    if (!u.searchParams.get('vodIndex')) u.searchParams.set('vodIndex', index);
    if (!u.searchParams.get('vodUrl') && playUrl) {
      u.searchParams.set('vodUrl', playUrl);
    }
    if (!u.searchParams.get('name')) u.searchParams.set('name', vodName);
    if (!u.searchParams.get('episode')) u.searchParams.set('episode', episodeName);
    return u.toString();
  } catch {
    return filled;
  }
}

export function hasUnresolvedDanmakuPlaceholders(url: string): boolean {
  return /\{(?:name|episode|index|url)\}/i.test(url);
}

/**
 * FongMi 风格本地弹幕代理：`/proxy?do=danmaku`
 * Reader 原生 proxy 仅支持 http|m3u8|raw，其余走 jar_proxy；无对应 Spider 时 502。
 */
export function isLocalJarDanmakuProxy(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') return false;
    if (!u.pathname.startsWith('/proxy')) return false;
    return (u.searchParams.get('do') || '').toLowerCase() === 'danmaku';
  } catch {
    return false;
  }
}

/** 解析并修正弹幕 URL，外链走本地 proxy 规避 CORS；跳过未实现的 jar danmaku */
export function resolveDanmakuPlayUrl(
  raw: string,
  proxyBase: string,
  ctx: { vodName: string; episodeName: string; playUrl: string },
): string {
  let url = fillDanmakuTemplate(raw.trim(), ctx.vodName, ctx.episodeName, ctx.playUrl);
  if (!url || hasUnresolvedDanmakuPlaceholders(url)) return '';
  url = fixLocalProxyUrl(url, proxyBase);
  if (!isUsableHttpUrl(url)) return '';
  if (isLocalJarDanmakuProxy(url)) return '';
  try {
    const u = new URL(url);
    const isLocalProxy =
      (u.hostname === '127.0.0.1' || u.hostname === 'localhost') &&
      u.pathname.startsWith('/proxy');
    if (isLocalProxy) return url;
  } catch {
    return '';
  }
  return wrapMediaThroughProxy(url, proxyBase);
}
