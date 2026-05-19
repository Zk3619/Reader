/**
 * 解析 Legado java.startBrowser 常用的 data:text/html URL
 */

/** 从 data:text/html[;base64],... 提取 HTML 文本 */
export function parseDataHtmlUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed.toLowerCase().startsWith('data:')) return null;

  const comma = trimmed.indexOf(',');
  if (comma < 0) return null;

  const meta = trimmed.slice(5, comma).toLowerCase();
  const payload = trimmed.slice(comma + 1);
  if (!meta.includes('text/html')) return null;

  if (meta.includes(';base64') || meta.includes('base64')) {
    try {
      const binary = atob(payload.replace(/\s/g, ''));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    } catch {
      return null;
    }
  }

  try {
    return decodeURIComponent(payload);
  } catch {
    return payload;
  }
}
