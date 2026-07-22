/**
 * 番剧规则执行引擎（E6.1）：HTTP GET + DOMParser CSS / 简易 XPath
 * 复杂站点 hardening 后续再做；验收以自建静态/简单页为准
 */

import type { BangumiRule } from '@/lib/media/video/bangumi/rules';

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

function joinUrl(base: string, pathOrUrl: string): string {
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
  return tpl.split('{keyword}').join(encodeURIComponent(keyword.trim()));
}

async function fetchHtml(url: string, userAgent?: string): Promise<string> {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': userAgent?.trim() || DEFAULT_UA,
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    },
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

/** 选择器：`a@href` / `img@src` 取属性；以 / 或 // 开头当 XPath；否则 CSS */
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
    const v = target.getAttribute(attr) || '';
    return v.trim();
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

export async function searchByRule(
  rule: BangumiRule,
  keyword: string,
): Promise<BangumiSearchHit[]> {
  const kw = keyword.trim();
  if (!kw) return [];
  if (!rule.enabled) return [];
  if (!rule.searchPath || !rule.searchList) {
    throw new Error(`规则「${rule.name}」缺少 searchPath / searchList`);
  }
  const path = fillKeyword(rule.searchPath, kw);
  const url = joinUrl(rule.baseUrl, path);
  const html = await fetchHtml(url, rule.userAgent);
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
  const html = await fetchHtml(pageUrl, rule.userAgent);
  const doc = parseDocument(html, pageUrl);
  const title =
    (doc.querySelector('title')?.textContent || '').trim() || pageUrl;
  const nodes = queryAll(doc, rule.chapterList);
  const episodes: BangumiEpisode[] = [];
  for (const node of nodes) {
    const name = readNode(node, rule.chapterName) || (node.textContent || '').trim();
    const epUrl = readHref(node, rule.chapterLink, pageUrl);
    if (!name || !epUrl) continue;
    episodes.push({ name, url: epUrl });
  }
  return { title, url: pageUrl, episodes };
}

export async function resolvePlayUrl(rule: BangumiRule, episodeUrl: string): Promise<string> {
  const pageUrl = joinUrl(rule.baseUrl, episodeUrl);
  if (!rule.playUrl) {
    // 无取链选择器时，直接把分集 URL 当媒体地址（静态验收页可用）
    return pageUrl;
  }
  const { query, attr } = parseSelector(rule.playUrl);
  // 模板直链：playUrl 不含选择器字符时当作模板
  if (rule.playUrl.includes('{url}')) {
    return rule.playUrl.split('{url}').join(encodeURIComponent(pageUrl));
  }
  const html = await fetchHtml(pageUrl, rule.userAgent);
  const doc = parseDocument(html, pageUrl);
  if (!query) {
    throw new Error('playUrl 选择器为空');
  }
  const el = queryOne(doc, query);
  if (!el) throw new Error('未匹配到播放地址节点');
  const raw = attr
    ? el.getAttribute(attr) || ''
    : el.getAttribute('src') || el.getAttribute('href') || (el.textContent || '').trim();
  if (!raw.trim()) throw new Error('播放地址为空');
  return joinUrl(pageUrl, raw.trim());
}
