/**
 * 番剧规则执行引擎：XPath/CSS + API/JSONPath + 抽流链
 */

import { JSONPath } from 'jsonpath-plus';
import { tvRequest } from '@/lib/media/tv/net/rules';
import type { BangumiRule } from '@/lib/media/video/bangumi/rules';
import { getBangumiModulePrefs } from '@/lib/media/video/bangumi/prefs';
import {
  pickBestSniffFromHtml,
  resolveViaWebViewSniff,
} from '@/lib/media/video/bangumi/webview-resolve';
import { openAntiCrawlerSession } from '@/lib/media/video/bangumi/anti-crawler';

export type BangumiSearchHit = {
  ruleId: string;
  ruleName: string;
  title: string;
  cover?: string;
  url: string;
};

export type BangumiEpisode = {
  name: string;
  url: string;
};

export type BangumiDetail = {
  title: string;
  cover?: string;
  url: string;
  episodes: BangumiEpisode[];
};

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export function joinUrl(base: string, pathOrUrl: string): string {
  const p = pathOrUrl.trim();
  if (!p) return base;
  if (/^https?:\/\//i.test(p)) return p;
  try {
    return new URL(p, base.endsWith('/') ? base : `${base}/`).href;
  } catch {
    return p;
  }
}

function fillKeyword(tpl: string, keyword: string): string {
  return tpl
    .split('{keyword}')
    .join(encodeURIComponent(keyword.trim()))
    .replace(/@keyword/gi, encodeURIComponent(keyword.trim()));
}

async function fetchHtml(url: string, userAgent?: string, referer?: string): Promise<string> {
  const res = await tvRequest(url, {
    method: 'GET',
    headers: {
      'User-Agent': userAgent?.trim() || DEFAULT_UA,
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      ...(referer ? { Referer: referer } : {}),
    },
    useBackendHttp: true,
    timeout: 30000,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${url}`);
  }
  return await res.text();
}

function parseDocument(html: string, baseUrl: string): Document {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = doc.createElement('base');
  base.href = baseUrl;
  doc.head.prepend(base);
  return doc;
}

function parseSelector(sel: string): { query: string; attr?: string } {
  const s = sel.trim();
  const at = s.lastIndexOf('@');
  if (at > 0 && !s.slice(at + 1).includes(' ') && !s.slice(at + 1).includes('/')) {
    return { query: s.slice(0, at).trim(), attr: s.slice(at + 1).trim() };
  }
  return { query: s };
}

function isXPath(query: string): boolean {
  return query.startsWith('/') || query.startsWith('(');
}

function queryAll(root: Document | Element, selector: string): Element[] {
  const { query } = parseSelector(selector);
  if (!query) return [];
  if (isXPath(query)) {
    try {
      const doc = root.ownerDocument ?? (root as Document);
      const ctx = root.nodeType === Node.DOCUMENT_NODE ? (root as Document) : root;
      const snap = doc.evaluate(
        query,
        ctx,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null,
      );
      const out: Element[] = [];
      for (let i = 0; i < snap.snapshotLength; i++) {
        const n = snap.snapshotItem(i);
        if (n && n.nodeType === Node.ELEMENT_NODE) out.push(n as Element);
      }
      return out;
    } catch {
      return [];
    }
  }
  try {
    return Array.from(root.querySelectorAll(query));
  } catch {
    return [];
  }
}

function queryOne(root: Document | Element, selector: string): Element | null {
  return queryAll(root, selector)[0] ?? null;
}

function readNode(el: Element | null, selector?: string): string {
  if (!el) return '';
  if (!selector) return (el.textContent || '').trim();
  const { query, attr } = parseSelector(selector);
  const target = query ? queryOne(el, query) : el;
  if (!target) return '';
  if (attr) {
    return (target.getAttribute(attr) || '').trim();
  }
  return (target.textContent || '').trim();
}

function readHref(el: Element | null, selector: string | undefined, baseUrl: string): string {
  if (!el) return '';
  if (!selector) {
    const a = el.closest('a') || (el.tagName === 'A' ? el : null);
    const href = a?.getAttribute('href') || '';
    return href ? joinUrl(baseUrl, href) : '';
  }
  const { query, attr } = parseSelector(selector);
  const target = query ? queryOne(el, query) : el;
  if (!target) return '';
  const raw = attr
    ? target.getAttribute(attr) || ''
    : target.getAttribute('href') || (target.textContent || '').trim();
  return raw ? joinUrl(baseUrl, raw.trim()) : '';
}

function jp(data: unknown, path: string): unknown[] {
  try {
    const r = JSONPath({ path, json: data as object, wrap: true });
    return Array.isArray(r) ? r : [];
  } catch {
    return [];
  }
}

async function searchByApi(rule: BangumiRule, keyword: string): Promise<BangumiSearchHit[]> {
  const cfg = rule.searchApi;
  if (!cfg?.request?.url) throw new Error(`规则「${rule.name}」缺少 searchApi`);
  const urlTpl = fillKeyword(cfg.request.url, keyword);
  const url = joinUrl(rule.baseUrl, urlTpl);
  const method = (cfg.request.method || 'GET').toUpperCase();
  let body: string | undefined;
  if (method !== 'GET' && cfg.request.body != null) {
    body =
      typeof cfg.request.body === 'string'
        ? fillKeyword(cfg.request.body, keyword)
        : fillKeyword(JSON.stringify(cfg.request.body), keyword);
  }
  const res = await tvRequest(url, {
    method: method as 'GET' | 'POST',
    body,
    headers: {
      'User-Agent': rule.userAgent || DEFAULT_UA,
      Accept: 'application/json',
      ...(cfg.request.headers || {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    useBackendHttp: true,
    timeout: 30000,
  });
  if (!res.ok) throw new Error(`API HTTP ${res.status}`);
  const data = JSON.parse(await res.text()) as unknown;
  const nodes = jp(data, cfg.listPath || '$.data[*]');
  const hits: BangumiSearchHit[] = [];
  for (const node of nodes) {
    const title = String(jp(node, cfg.namePath || '$.name')[0] ?? '').trim();
    const linkRaw = String(jp(node, cfg.sourcePath || '$.url')[0] ?? '').trim();
    if (!title || !linkRaw) continue;
    hits.push({
      ruleId: rule.id,
      ruleName: rule.name,
      title,
      url: joinUrl(rule.baseUrl, linkRaw),
    });
  }
  return hits;
}

export async function searchByRule(
  rule: BangumiRule,
  keyword: string,
): Promise<BangumiSearchHit[]> {
  const kw = keyword.trim();
  if (!kw || !rule.enabled) return [];
  if (rule.searchMode === 'api' || rule.searchApi?.request?.url) {
    return searchByApi(rule, kw);
  }
  if (!rule.searchPath || !rule.searchList) {
    throw new Error(`规则「${rule.name}」缺少 searchPath / searchList`);
  }
  const path = fillKeyword(rule.searchPath, kw);
  const url = joinUrl(rule.baseUrl, path);
  let html: string;
  try {
    html = await fetchHtml(url, rule.userAgent, rule.referer || rule.baseUrl);
  } catch (e) {
    if (rule.antiCrawler?.enabled) {
      await openAntiCrawlerSession(url, rule.antiCrawler);
      html = await fetchHtml(url, rule.userAgent, rule.referer || rule.baseUrl);
    } else {
      throw e;
    }
  }
  const doc = parseDocument(html, url);
  const nodes = queryAll(doc, rule.searchList);
  const hits: BangumiSearchHit[] = [];
  for (const node of nodes) {
    const title = readNode(node, rule.searchName) || (node.textContent || '').trim();
    const link = readHref(node, rule.searchLink, url);
    if (!title || !link) continue;
    const coverRaw = rule.searchCover ? readNode(node, rule.searchCover) : '';
    hits.push({
      ruleId: rule.id,
      ruleName: rule.name,
      title,
      cover: coverRaw ? joinUrl(url, coverRaw) : undefined,
      url: link,
    });
  }
  return hits;
}

export async function searchAllRules(
  rules: BangumiRule[],
  keyword: string,
): Promise<{ hits: BangumiSearchHit[]; errors: string[] }> {
  const enabled = rules.filter((r) => r.enabled);
  const errors: string[] = [];
  const settled = await Promise.allSettled(enabled.map((r) => searchByRule(r, keyword)));
  const hits: BangumiSearchHit[] = [];
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') hits.push(...s.value);
    else {
      const msg = s.reason instanceof Error ? s.reason.message : String(s.reason);
      errors.push(`${enabled[i]?.name || '?'}: ${msg}`);
    }
  });
  return { hits, errors };
}

export async function loadDetail(rule: BangumiRule, url: string): Promise<BangumiDetail> {
  if (!rule.chapterList) {
    throw new Error(`规则「${rule.name}」缺少 chapterList`);
  }
  const pageUrl = joinUrl(rule.baseUrl, url);
  const html = await fetchHtml(pageUrl, rule.userAgent, rule.referer || rule.baseUrl);
  const doc = parseDocument(html, pageUrl);
  const title = (doc.querySelector('title')?.textContent || '').trim() || pageUrl;
  const nodes = queryAll(doc, rule.chapterList);
  const episodes: BangumiEpisode[] = [];
  for (const node of nodes) {
    const name = readNode(node, rule.chapterName) || (node.textContent || '').trim();
    const epUrl = readHref(node, rule.chapterLink, pageUrl);
    if (!name || !epUrl) continue;
    episodes.push({ name, url: epUrl });
  }
  // Kazumi 式：chapterRoads 为线路容器，chapterResult 为容器内 a
  if (!episodes.length && rule.chapterLink) {
    for (const road of nodes) {
      const links = queryAll(road, rule.chapterLink);
      for (const a of links) {
        const name = (a.textContent || '').trim();
        const href = a.getAttribute('href') || '';
        if (!name || !href) continue;
        episodes.push({ name, url: joinUrl(pageUrl, href) });
      }
    }
  }
  return { title, url: pageUrl, episodes };
}

async function resolveStaticPlayUrl(rule: BangumiRule, pageUrl: string): Promise<string | null> {
  if (!rule.playUrl) return null;
  if (rule.playUrl.includes('{url}')) {
    return rule.playUrl.split('{url}').join(encodeURIComponent(pageUrl));
  }
  const html = await fetchHtml(pageUrl, rule.userAgent, rule.referer || rule.baseUrl);
  const sniffed = pickBestSniffFromHtml(html);
  if (sniffed) return sniffed;
  const { query, attr } = parseSelector(rule.playUrl);
  if (!query) return null;
  const doc = parseDocument(html, pageUrl);
  const el = queryOne(doc, query);
  if (!el) return null;
  const raw = attr
    ? el.getAttribute(attr) || ''
    : el.getAttribute('src') || el.getAttribute('href') || (el.textContent || '').trim();
  if (!raw.trim()) return null;
  return joinUrl(pageUrl, raw.trim());
}

export type ResolvePlayResult = {
  url: string;
  headers?: Record<string, string>;
};

/**
 * 抽流：静态选择器 → HTML 文本嗅探 → WebView（按偏好/规则）
 */
export async function resolvePlayUrl(
  rule: BangumiRule,
  episodeUrl: string,
): Promise<ResolvePlayResult> {
  const pageUrl = joinUrl(rule.baseUrl, episodeUrl);
  const mode = getBangumiModulePrefs().resolveMode;
  const headers: Record<string, string> = {
    'User-Agent': rule.userAgent || DEFAULT_UA,
    ...(rule.referer ? { Referer: rule.referer } : { Referer: rule.baseUrl }),
  };

  const tryStatic = async (): Promise<string | null> => {
    try {
      if (rule.playUrl) return await resolveStaticPlayUrl(rule, pageUrl);
      const html = await fetchHtml(pageUrl, rule.userAgent, rule.referer || rule.baseUrl);
      return pickBestSniffFromHtml(html);
    } catch {
      return null;
    }
  };

  if (mode === 'static') {
    const u = (await tryStatic()) || pageUrl;
    return { url: u, headers };
  }

  if (mode === 'webview' || (mode === 'auto' && rule.useWebview !== false && !rule.playUrl)) {
    const wv = await resolveViaWebViewSniff(pageUrl);
    if (wv) return { url: wv, headers };
  }

  const staticUrl = await tryStatic();
  if (staticUrl && /\.(m3u8|mp4|flv|mpd)(\?|$)/i.test(staticUrl)) {
    return { url: staticUrl, headers };
  }

  if (mode === 'auto') {
    const wv = await resolveViaWebViewSniff(pageUrl);
    if (wv) return { url: wv, headers };
  }

  if (staticUrl) return { url: staticUrl, headers };
  // 无选择器时：Kazumi 默认走 WebView；失败则返回页面 URL（由播放器再失败）
  const wv2 = await resolveViaWebViewSniff(pageUrl);
  if (wv2) return { url: wv2, headers };
  throw new Error('未能解析到媒体地址（可尝试设置中强制 WebView 抽流）');
}

/** @deprecated 兼容旧调用：仅返回 URL 字符串 */
export async function resolvePlayUrlString(
  rule: BangumiRule,
  episodeUrl: string,
): Promise<string> {
  const r = await resolvePlayUrl(rule, episodeUrl);
  return r.url;
}
