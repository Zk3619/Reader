import { isTauri } from '@/lib/platform/detect';

export type SanitizeSubscribeHtmlOptions = {
  /** 用于把相对图片地址解析为绝对 URL（条目链接 / 站点 URL） */
  baseUrl?: string | null;
};

function hasDomParser(): boolean {
  return typeof DOMParser !== 'undefined';
}

export function stripSubscribeHtml(html: string | null | undefined): string {
  if (!html) return '';
  if (!hasDomParser()) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function sanitizeWithRegex(
  html: string,
  options?: SanitizeSubscribeHtmlOptions,
): string {
  let out = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(iframe|object|embed|form)[\s\S]*?<\/\1>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, ' $1="#"')
    .replace(/<a\b([^>]*)>/gi, (_m, attrs: string) => {
      const cleaned = String(attrs)
        .replace(/\starget\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/\srel\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
      return `<a${cleaned} target="_blank" rel="noreferrer noopener">`;
    });
  out = out.replace(/<img\b([^>]*)>/gi, (_m, rawAttrs: string) => {
    const attrs = String(rawAttrs);
    const pick = (name: string) => {
      const re = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
      const match = re.exec(attrs);
      return (match?.[2] ?? match?.[3] ?? match?.[4] ?? '').trim();
    };
    const src = pick('src');
    const dataSrc = pick('data-src') || pick('data-original') || pick('data-lazy-src');
    const fromSrcset = firstSrcsetCandidate(pick('srcset'));
    const placeholder =
      !src || /thumbnail\.gif|spacer\.gif|pixel\.gif|1x1\.|blank\./i.test(src);
    const chosen = placeholder
      ? dataSrc || fromSrcset || src
      : src || dataSrc || fromSrcset;
    const absolute = resolveMaybeUrl(chosen, options?.baseUrl);
    if (!absolute) return '<img alt="">';
    const display = rewriteSubscribeImageUrl(absolute);
    const originAttr =
      /^https?:\/\//i.test(absolute)
        ? ` ${SUBSCRIBE_IMG_ORIGIN_ATTR}="${absolute.replace(/"/g, '&quot;')}"`
        : '';
    const triedProxy = display.startsWith(SUBSCRIBE_IMAGE_PROXY)
      ? ` ${SUBSCRIBE_IMG_TRIED_PROXY_ATTR}="1"`
      : '';
    return `<img src="${display.replace(/"/g, '&quot;')}"${originAttr}${triedProxy} loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
  });
  return out;
}

function resolveMaybeUrl(raw: string, baseUrl?: string | null): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  const base = String(baseUrl ?? '').trim();
  if (!base) return trimmed;
  try {
    const normalizedBase = /^https?:\/\//i.test(base) ? base : `https://${base}`;
    return new URL(trimmed, normalizedBase).toString();
  } catch {
    return trimmed;
  }
}

/** 需要带 Referer 才能加载的图床（对齐 Folo imageRefererMatches）→ 走 img.folo.is */
const SUBSCRIBE_IMAGE_PROXY = 'https://img.folo.is';
const SUBSCRIBE_HOTLINK_RULES: Array<{ url: RegExp; force?: boolean }> = [
  { url: /^https:\/\/\w+\.sinaimg\.cn/ },
  { url: /^https:\/\/i\.pximg\.net/ },
  { url: /^https:\/\/cdnfile\.sspai\.com/ },
  { url: /^https:\/\/(?:\w|-)+\.cdninstagram\.com/ },
  { url: /^https:\/\/sp1\.piokok\.com/, force: true },
  { url: /^https?:\/\/[\w-]+\.xhscdn\.com/ },
];

function firstSrcsetCandidate(srcset: string | null | undefined): string {
  const raw = String(srcset ?? '').trim();
  if (!raw) return '';
  const first = raw.split(',')[0]?.trim() ?? '';
  return first.split(/\s+/)[0]?.trim() ?? '';
}

export function subscribeImageProxyUrl(absoluteUrl: string, width = 700): string {
  return `${SUBSCRIBE_IMAGE_PROXY}?url=${encodeURIComponent(absoluteUrl)}&width=${width}&height=`;
}

export function rewriteSubscribeImageUrl(
  rawUrl: string,
  options?: { baseUrl?: string | null; preferProxy?: boolean },
): string {
  const absolute = resolveMaybeUrl(rawUrl, options?.baseUrl);
  if (!absolute || !/^https?:\/\//i.test(absolute)) return absolute;
  // WebView2 Tracking Prevention / 防盗链：桌面壳优先走 Folo 图床（对齐 Folo Media）
  const preferProxy =
    options?.preferProxy === true ||
    (options?.preferProxy !== false && isTauri()) ||
    SUBSCRIBE_HOTLINK_RULES.some((rule) => rule.url.test(absolute));
  return preferProxy ? subscribeImageProxyUrl(absolute) : absolute;
}

const SUBSCRIBE_IMG_ORIGIN_ATTR = 'data-subscribe-origin-src';
const SUBSCRIBE_IMG_TRIED_PROXY_ATTR = 'data-subscribe-tried-proxy';

/** 文章区图片：原图失败 → Folo 图床代理 → lucide 风格占位 */
export function hydrateSubscribeArticleImages(root: ParentNode | null | undefined): void {
  if (!root || typeof document === 'undefined') return;
  const imgs = root.querySelectorAll<HTMLImageElement>('img');
  for (const img of imgs) {
    if (img.dataset.subscribeHydrated === '1') continue;
    img.dataset.subscribeHydrated = '1';
    const origin =
      img.getAttribute(SUBSCRIBE_IMG_ORIGIN_ATTR)?.trim() ||
      img.getAttribute('src')?.trim() ||
      '';
    if (origin && /^https?:\/\//i.test(origin)) {
      img.setAttribute(SUBSCRIBE_IMG_ORIGIN_ATTR, origin);
    }
    img.addEventListener('error', () => {
      const original = img.getAttribute(SUBSCRIBE_IMG_ORIGIN_ATTR)?.trim() || '';
      const current = img.getAttribute('src')?.trim() || '';
      // 代理失败时回退原图；原图失败时再试代理
      if (
        original &&
        /^https?:\/\//i.test(original) &&
        img.getAttribute(SUBSCRIBE_IMG_TRIED_PROXY_ATTR) === '1' &&
        current.startsWith(SUBSCRIBE_IMAGE_PROXY) &&
        current !== original
      ) {
        img.removeAttribute(SUBSCRIBE_IMG_TRIED_PROXY_ATTR);
        img.dataset.subscribeTriedOrigin = '1';
        img.src = original;
        return;
      }
      if (
        original &&
        /^https?:\/\//i.test(original) &&
        img.getAttribute(SUBSCRIBE_IMG_TRIED_PROXY_ATTR) !== '1' &&
        !current.startsWith(SUBSCRIBE_IMAGE_PROXY)
      ) {
        img.setAttribute(SUBSCRIBE_IMG_TRIED_PROXY_ATTR, '1');
        img.src = subscribeImageProxyUrl(original);
        return;
      }
      replaceBrokenSubscribeImage(img);
    });
  }
}

function replaceBrokenSubscribeImage(img: HTMLImageElement): void {
  if (img.dataset.subscribeBroken === '1') return;
  img.dataset.subscribeBroken = '1';
  const placeholder = document.createElement('span');
  placeholder.className =
    'subscribe-img-fallback inline-flex max-w-full items-center gap-2 rounded-md border border-dashed border-border/80 bg-muted/40 px-3 py-6 text-xs text-muted-foreground';
  placeholder.setAttribute('role', 'img');
  placeholder.setAttribute('aria-label', img.alt?.trim() || '图片加载失败');
  placeholder.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg><span>图片加载失败</span>';
  img.replaceWith(placeholder);
}

export function sanitizeSubscribeHtml(
  html: string | null | undefined,
  options?: SanitizeSubscribeHtmlOptions,
): string {
  if (!html) return '';
  if (!hasDomParser()) return sanitizeWithRegex(html, options);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const node of doc.querySelectorAll('script, style, iframe, object, embed, form')) {
    node.remove();
  }
  for (const element of doc.body.querySelectorAll('*')) {
    for (const attr of [...element.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (
        name.startsWith('on') ||
        (['href', 'src'].includes(name) && value.startsWith('javascript:'))
      ) {
        element.removeAttribute(attr.name);
      }
    }
    if (element.tagName === 'A' || element.localName === 'a') {
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noreferrer noopener');
    }
    if (element.tagName === 'IMG' || element.localName === 'img') {
      const img = element as HTMLImageElement;
      const dataSrc =
        img.getAttribute('data-src')?.trim() ||
        img.getAttribute('data-original')?.trim() ||
        img.getAttribute('data-lazy-src')?.trim() ||
        '';
      const src = img.getAttribute('src')?.trim() || '';
      const fromSrcset = firstSrcsetCandidate(img.getAttribute('srcset'));
      const placeholder =
        !src || /thumbnail\.gif|spacer\.gif|pixel\.gif|1x1\.|blank\./i.test(src);
      const chosen = placeholder
        ? dataSrc || fromSrcset || src
        : src || dataSrc || fromSrcset;
      const absolute = resolveMaybeUrl(chosen, options?.baseUrl);
      if (!absolute) {
        img.removeAttribute('src');
      } else {
        const display = rewriteSubscribeImageUrl(absolute);
        if (/^https?:\/\//i.test(absolute)) {
          img.setAttribute(SUBSCRIBE_IMG_ORIGIN_ATTR, absolute);
        }
        img.setAttribute('src', display);
        if (display.startsWith(SUBSCRIBE_IMAGE_PROXY)) {
          img.setAttribute(SUBSCRIBE_IMG_TRIED_PROXY_ATTR, '1');
        }
      }
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
      // 桌面壳页 origin 非文章站；空 Referer 多数 CDN 可过，部分防盗链走上方 proxy
      img.setAttribute('referrerpolicy', 'no-referrer');
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
    }
  }
  return doc.body.innerHTML;
}

export function formatSubscribeTime(value: number | null): string {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** 列表摘要：优先 meta.description（Folo），否则回退正文纯文本 */
export function entryListSummary(
  entry: { content?: string | null; metaJson?: string },
  maxLen = 160,
): string {
  try {
    const meta = JSON.parse(entry.metaJson || '{}') as { description?: string };
    const fromMeta = stripSubscribeHtml(meta.description);
    if (fromMeta) {
      return fromMeta.length > maxLen ? `${fromMeta.slice(0, maxLen)}…` : fromMeta;
    }
  } catch {
    /* ignore */
  }
  const fromContent = stripSubscribeHtml(entry.content);
  if (!fromContent) return '';
  return fromContent.length > maxLen ? `${fromContent.slice(0, maxLen)}…` : fromContent;
}

export type SubscribeSourceIconInput = {
  title?: string | null;
  url?: string | null;
  metaJson?: string | null;
  siteUrl?: string | null;
  iconUrl?: string | null;
};

export function parseSubscribeSourceMeta(metaJson: string | null | undefined): {
  iconUrl?: string;
  siteUrl?: string;
  foloFeedId?: string;
} {
  try {
    const raw = JSON.parse(metaJson || '{}') as Record<string, unknown>;
    return {
      iconUrl: typeof raw.iconUrl === 'string' ? raw.iconUrl : undefined,
      siteUrl: typeof raw.siteUrl === 'string' ? raw.siteUrl : undefined,
      foloFeedId: typeof raw.foloFeedId === 'string' ? raw.foloFeedId : undefined,
    };
  } catch {
    return {};
  }
}

function hostIconUrl(siteOrFeedUrl: string | null | undefined): string {
  const value = String(siteOrFeedUrl ?? '').trim();
  if (!value) return '';
  try {
    const normalized = /^https?:\/\//i.test(value)
      ? value
      : /^rsshub:\/\//i.test(value)
        ? `https://rsshub.app/${value.replace(/^rsshub:\/\//i, '')}`
        : `https://${value}`;
    const host = new URL(normalized).host;
    return host ? `https://icons.folo.is/${host}` : '';
  } catch {
    return '';
  }
}

function avatarFallbackUrl(siteOrFeedUrl: string | null | undefined): string {
  const value = String(siteOrFeedUrl ?? '').trim();
  if (!value) return '';
  try {
    const normalized = /^https?:\/\//i.test(value)
      ? value
      : /^rsshub:\/\//i.test(value)
        ? `https://rsshub.app/${value.replace(/^rsshub:\/\//i, '')}`
        : `https://${value}`;
    const host = new URL(normalized).hostname.replace(/^www\./i, '');
    const label = (host.split('.')[0] || host).slice(0, 2).toUpperCase() || 'S';
    return `https://avatar.vercel.sh/${encodeURIComponent(host)}.svg?text=${encodeURIComponent(label)}`;
  } catch {
    return '';
  }
}

/** 订阅源图标候选（按优先级） */
export function resolveSubscribeSourceIconCandidates(
  source: SubscribeSourceIconInput,
): string[] {
  const meta = parseSubscribeSourceMeta(source.metaJson);
  const icon = String(source.iconUrl || meta.iconUrl || '').trim();
  const site = String(source.siteUrl || meta.siteUrl || '').trim();
  const feed = String(source.url || '').trim();
  const list: string[] = [];
  if (icon && /^https?:\/\//i.test(icon)) list.push(icon);
  const foloFromSite = hostIconUrl(site || feed);
  if (foloFromSite) list.push(foloFromSite);
  const avatar = avatarFallbackUrl(site || feed);
  if (avatar) list.push(avatar);
  return [...new Set(list)];
}

export function resolveSubscribeSourceIcon(source: SubscribeSourceIconInput): string {
  return resolveSubscribeSourceIconCandidates(source)[0] ?? '';
}
