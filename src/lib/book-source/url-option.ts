/**
 * 解析书籍 URL 尾部的 UrlOption JSON（对齐 legado AnalyzeUrl.paramPattern）
 * 例：https://example.com/book/1, {"origin":"https://example.com"}
 */

/** legado: Pattern.compile("\\s*,\\s*(?=\\{)") */
const URL_OPTION_SPLIT = /\s*,\s*(?=\{)/;

export function getNetworkBaseUrl(url: string): string | null {
  const lower = url.toLowerCase();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
    return null;
  }
  const index = url.indexOf('/', lower.startsWith('https://') ? 8 : 7);
  return index === -1 ? url : url.slice(0, index);
}

export function parseBookUrlWithOption(rawUrl: string): {
  bookUrl: string;
  specifiedOrigin?: string;
} {
  const trimmed = rawUrl.trim();
  const match = trimmed.match(URL_OPTION_SPLIT);
  if (!match || match.index === undefined) {
    return { bookUrl: trimmed };
  }
  const bookUrl = trimmed.slice(0, match.index).trim();
  const jsonPart = trimmed.slice(match.index + match[0].length).trim();
  if (!jsonPart) {
    return { bookUrl };
  }
  try {
    const opt = JSON.parse(jsonPart) as Record<string, unknown>;
    const origin =
      (typeof opt.origin === 'string' && opt.origin) ||
      (typeof opt.bookSourceUrl === 'string' && opt.bookSourceUrl) ||
      undefined;
    return { bookUrl, specifiedOrigin: origin };
  } catch {
    return { bookUrl: trimmed };
  }
}
