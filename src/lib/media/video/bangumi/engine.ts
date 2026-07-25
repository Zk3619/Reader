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
import { CaptchaRequiredError } from '@/lib/media/video/bangumi/anti-crawler';

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

async function fetchHtml(
  url: string,
  userAgent?: string,
  referer?: string,
  opts?: { retry?: number; timeout?: number },
): Promise<string> {
  const res = await tvRequest(url, {
    method: 'GET',
    headers: {
      'User-Agent': userAgent?.trim() || DEFAULT_UA,
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      ...(referer ? { Referer: referer } : {}),
    },
    useBackendHttp: true,
    timeout: opts?.timeout ?? 30000,
    ...(opts?.retry !== undefined ? { retry: opts.retry } : {}),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${url}`);
  }
  return await res.text();
}

/** 对齐 Kazumi：检索阶段只标记验证码，不弹 WebView / 嗅探窗 */
function looksLikeChallengeHtml(html: string): boolean {
  const sample = html.slice(0, 8000).toLowerCase();
  return (
    sample.includes('cf-challenge') ||
    sample.includes('cf-browser-verification') ||
    sample.includes('just a moment') ||
    sample.includes('checking your browser') ||
    sample.includes('access denied') ||
    sample.includes('captcha') ||
    sample.includes('challenge-platform')
  );
}

function detectCaptchaChallenge(
  html: string,
  anti?: BangumiRule['antiCrawler'],
): boolean {
  if (anti?.enabled && anti.captchaDetectXPath) {
    try {
      const doc = parseDocument(html, 'https://local.invalid/');
      if (queryOne(doc, anti.captchaDetectXPath)) return true;
    } catch {
      /* */
    }
  }
  return looksLikeChallengeHtml(html);
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
      // 在元素上下文中，把 //foo 收成 .//foo，对齐 Kazumi 的「相对当前线路节点」语义
      // （浏览器 evaluate 对裸 // 会扫整个文档，导致分集合并/重复）
      let xpath = query;
      if (ctx.nodeType === Node.ELEMENT_NODE) {
        if (xpath.startsWith('//')) xpath = `.${xpath}`;
        else if (!xpath.startsWith('.') && !xpath.startsWith('/')) xpath = `.//${xpath}`;
      }
      const snap = doc.evaluate(
        xpath,
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
  // 搜索阶段不做底层重试：失败由「选源」页按规则单独重试，避免请求风暴 / 429
  const searchFetchOpts = { retry: 0, timeout: 15000 };
  // 对齐 Kazumi：检索阶段遇到反爬只抛 CaptchaRequiredError，绝不弹嗅探窗
  let html: string;
  try {
    html = await fetchHtml(url, rule.userAgent, rule.referer || rule.baseUrl, searchFetchOpts);
  } catch (e) {
    if (rule.antiCrawler?.enabled) {
      throw new CaptchaRequiredError(url);
    }
    throw e;
  }
  if (detectCaptchaChallenge(html, rule.antiCrawler)) {
    throw new CaptchaRequiredError(url);
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

/** 多关键词检索：语言名 + 原名；按 URL 去重合并 */
export async function searchByRuleKeywords(
  rule: BangumiRule,
  keywords: string[],
): Promise<BangumiSearchHit[]> {
  const kws = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))];
  if (!kws.length) return [];
  const seen = new Set<string>();
  const out: BangumiSearchHit[] = [];
  let lastError: unknown;
  let hadOk = false;
  for (const kw of kws) {
    try {
      const hits = await searchByRule(rule, kw);
      hadOk = true;
      for (const h of hits) {
        if (seen.has(h.url)) continue;
        seen.add(h.url);
        out.push(h);
      }
    } catch (e) {
      lastError = e;
    }
  }
  if (out.length) return out;
  if (!hadOk && lastError) throw lastError;
  return [];
}

/** 并发上限：规则数量常达数十条，全量并发会触发站点 429 / 握手失败 */
export const BANGUMI_SEARCH_CONCURRENCY = 6;

/**
 * 渐进式多规则搜索（对齐 Kazumi SourceSheet）：
 * 不等全部完成，每条规则出结果即回调；受并发上限约束。
 * keyword 可为单个或多个（语言名 + 原名）。
 */
export async function searchRulesProgressive(
  rules: BangumiRule[],
  keyword: string | string[],
  handlers: {
    onRuleDone: (
      rule: BangumiRule,
      result: { hits: BangumiSearchHit[] } | { error: string },
    ) => void;
    /** 返回 true 时中止后续规则（如用户已离开选源页） */
    isCancelled?: () => boolean;
    concurrency?: number;
  },
): Promise<void> {
  const enabled = rules.filter((r) => r.enabled);
  const keywords = Array.isArray(keyword) ? keyword : [keyword];
  const limit = Math.max(1, handlers.concurrency ?? BANGUMI_SEARCH_CONCURRENCY);
  let cursor = 0;

  const worker = async () => {
    for (;;) {
      if (handlers.isCancelled?.()) return;
      const index = cursor++;
      const rule = enabled[index];
      if (!rule) return;
      try {
        const hits =
          keywords.length > 1
            ? await searchByRuleKeywords(rule, keywords)
            : await searchByRule(rule, keywords[0] || '');
        if (handlers.isCancelled?.()) return;
        handlers.onRuleDone(rule, { hits });
      } catch (e) {
        if (handlers.isCancelled?.()) return;
        const msg =
          e instanceof CaptchaRequiredError
            ? '需要验证码（站点拦截，未打开嗅探窗）'
            : e instanceof Error
              ? e.message
              : String(e);
        handlers.onRuleDone(rule, { error: msg });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, enabled.length) }, worker));
}

function collapseEpisodeName(raw: string, fallbackIndex: number): string {
  const name = raw.replace(/\s+/g, '').trim();
  return name || `第${fallbackIndex + 1}集`;
}

/**
 * 解析分集：
 * - Kazumi：chapterRoads(线路容器) + chapterResult(容器内 a) —— 必须先按链路拆分
 * - Reader 自有：chapterList 直接指向分集节点，可选 chapterName/chapterLink
 *
 * 旧逻辑先把线路容器整段 textContent 当成集名，会把整组分集压成一个按钮。
 */
export async function loadDetail(rule: BangumiRule, url: string): Promise<BangumiDetail> {
  if (!rule.chapterList) {
    throw new Error(`规则「${rule.name}」缺少 chapterList`);
  }
  const pageUrl = joinUrl(rule.baseUrl, url);
  const html = await fetchHtml(pageUrl, rule.userAgent, rule.referer || rule.baseUrl);
  const doc = parseDocument(html, pageUrl);
  const title = (doc.querySelector('title')?.textContent || '').trim() || pageUrl;
  const roads = queryAll(doc, rule.chapterList);
  const episodes: BangumiEpisode[] = [];
  const seen = new Set<string>();

  const pushEp = (name: string, epUrl: string) => {
    const u = epUrl.trim();
    if (!u || seen.has(u)) return;
    seen.add(u);
    episodes.push({ name, url: u });
  };

  // 1) Kazumi / 带 chapterLink：在每个线路容器内取分集链接
  if (rule.chapterLink) {
    for (const road of roads) {
      const links = queryAll(road, rule.chapterLink);
      links.forEach((a, i) => {
        const href =
          a.getAttribute('href') ||
          readHref(a, undefined, pageUrl) ||
          '';
        if (!href) return;
        const nameSel = rule.chapterName
          ? readNode(a, rule.chapterName)
          : (a.textContent || '').trim();
        pushEp(collapseEpisodeName(nameSel, episodes.length || i), joinUrl(pageUrl, href));
      });
    }
  }

  // 2) 无 chapterLink，或线路解析为空：把 chapterList 节点本身当分集
  if (!episodes.length) {
    roads.forEach((node, i) => {
      const name = rule.chapterName
        ? readNode(node, rule.chapterName)
        : '';
      // 无 chapterName 时不要用整段 textContent（线路容器会把所有集名拼成一坨）
      const epName = name.trim()
        ? collapseEpisodeName(name, i)
        : collapseEpisodeName(
            (node.querySelector('a')?.textContent || node.textContent || '').trim(),
            i,
          );
      const epUrl = readHref(node, rule.chapterLink, pageUrl);
      if (!epUrl) return;
      // 若名称仍像「多集合并」（过长且含多个数字间隔），跳过，避免单按钮假成功
      if (!rule.chapterName && epName.length > 24 && /集.*集|第\d+.*第\d+/.test(epName)) {
        return;
      }
      pushEp(epName, epUrl);
    });
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
 * 对齐 Kazumi：最多走一次无头 WebView，失败不再连环弹窗。
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

  const preferWebviewFirst =
    mode === 'webview' || (mode === 'auto' && rule.useWebview !== false && !rule.playUrl);

  if (preferWebviewFirst) {
    const wv = await resolveViaWebViewSniff(pageUrl);
    if (wv) return { url: wv, headers };
  }

  const staticUrl = await tryStatic();
  if (staticUrl && /\.(m3u8|mp4|flv|mpd)(\?|$)/i.test(staticUrl)) {
    return { url: staticUrl, headers };
  }

  // auto/webview 且尚未嗅探过：补一次无头抽流；已嗅探过则不再重开
  if (!preferWebviewFirst && (mode === 'auto' || mode === 'webview')) {
    const wv = await resolveViaWebViewSniff(pageUrl);
    if (wv) return { url: wv, headers };
  }

  if (staticUrl) return { url: staticUrl, headers };
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
