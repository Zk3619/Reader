/**
 * 将书源站点绝对/根路径资源 URL 改写为同源 __reader_http 代理，避免内嵌页 CORS（字体/CSS 等）。
 */

/** 修正站点根 /webfonts → /static/webfonts（Font Awesome 等） */
export function normalizeSiteAssetUrl(absolute: string): string {
  try {
    const u = new URL(absolute);
    if (/\/webfonts\//i.test(u.pathname) && !/\/static\/webfonts\//i.test(u.pathname)) {
      u.pathname = u.pathname.replace(/^\/webfonts\//i, '/static/webfonts/');
      return u.href;
    }
  } catch {
    /* ignore */
  }
  return absolute;
}

/** 代理请求前修正 target（CSS 未改写或浏览器按 &lt;base&gt; 解析相对路径时的兜底） */
export function normalizeProxyTarget(target: string): string {
  return normalizeSiteAssetUrl(target);
}

/**
 * @param resolveBaseUrl 当前被改写的文档 URL（如 CSS 文件地址），用于解析 ../webfonts 等相对路径
 */
export function toProxiedAssetUrl(
  rawUrl: string,
  resolveBaseUrl: string,
  proxyBase: string,
  sessionId?: string
): string {
  const trimmed = rawUrl.trim();
  if (
    !trimmed ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('#') ||
    trimmed.includes('__reader_http')
  ) {
    return trimmed;
  }

  try {
    const origin = new URL(resolveBaseUrl).origin;
    let absolute: string;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      absolute = trimmed;
    } else if (trimmed.startsWith('//')) {
      absolute = `https:${trimmed}`;
    } else {
      absolute = new URL(trimmed, resolveBaseUrl).href;
    }

    absolute = normalizeSiteAssetUrl(absolute);

    if (!absolute.startsWith(origin)) {
      return trimmed;
    }

    let out = `${proxyBase}?target=${encodeURIComponent(absolute)}`;
    if (sessionId) {
      out += `&session=${encodeURIComponent(sessionId)}`;
    }
    return out;
  } catch {
    return trimmed;
  }
}

/** 跳过 script/style 块，避免破坏内联 JS/CSS */
function rewriteHtmlOutsideProtectedBlocks(
  html: string,
  rewrite: (chunk: string) => string
): string {
  const blockRe =
    /<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi;
  let last = 0;
  let out = '';
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html)) !== null) {
    out += rewrite(html.slice(last, match.index));
    out += match[0];
    last = match.index + match[0].length;
  }
  out += rewrite(html.slice(last));
  return out;
}

/** @param cssFileUrl 被代理的 CSS 完整 URL（相对 url() 以此为基准） */
export function rewriteCssAssetUrls(
  css: string,
  cssFileUrl: string,
  proxyBase: string,
  sessionId?: string
): string {
  // 先处理 ../webfonts/，避免通用正则与 format("woff2") 组合时漏匹配
  let out = css.replace(
    /url\(\s*\.\.\/webfonts\/([^'")]+)\)/gi,
    (_match, file: string) =>
      `url(${toProxiedAssetUrl(`../webfonts/${file}`, cssFileUrl, proxyBase, sessionId)})`
  );

  out = out.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (_match, quote: string, path: string) => {
      const proxied = toProxiedAssetUrl(path, cssFileUrl, proxyBase, sessionId);
      const q = quote || '';
      return `url(${q}${proxied}${q})`;
    }
  );

  return out;
}

/** @param pageUrl 被代理的 HTML 完整 URL */
export function rewriteHtmlAssetUrls(
  html: string,
  pageUrl: string,
  proxyBase: string,
  sessionId?: string
): string {
  return rewriteHtmlOutsideProtectedBlocks(html, (chunk) => {
    let out = chunk.replace(
      /\s(href|src|action|poster)=(['"])([^'"]+)\2/gi,
      (_match, attr: string, quote: string, url: string) =>
        ` ${attr}=${quote}${toProxiedAssetUrl(url, pageUrl, proxyBase, sessionId)}${quote}`
    );

    out = out.replace(
      /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
      (_match, quote: string, path: string) => {
        const proxied = toProxiedAssetUrl(path, pageUrl, proxyBase, sessionId);
        const q = quote || '';
        return `url(${q}${proxied}${q})`;
      }
    );

    return out;
  });
}

export function shouldRewriteProxiedBody(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return ct.includes('text/css') || ct.includes('text/html');
}
