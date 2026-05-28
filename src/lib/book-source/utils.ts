/**
 * 书源引擎工具函数
 * 对应 legado 项目的 URL构建和变量处理
 */

/**
 * 构建URL（替换变量）
 * 支持 {{key}} 和 {key} 两种格式
 */
export function buildUrl(
  template: string,
  params: Record<string, string | number | undefined>
): string {
  let url = template;

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    const valueStr = String(value);
    // 替换 {{key}} 格式
    url = url.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), encodeURIComponent(valueStr));
    // 替换 {key} 格式
    url = url.replace(new RegExp(`\\{${key}\\}`, 'g'), encodeURIComponent(valueStr));
  }

  // 处理特殊变量 {{key}} 和 {key}（用于搜索关键词）
  if (params.key !== undefined) {
    const keyStr = String(params.key);
    url = url.replace(/\{\{key\}\}/g, encodeURIComponent(keyStr));
    url = url.replace(/\{key\}/g, encodeURIComponent(keyStr));
  }

  return url;
}

/**
 * 解析书源header
 */
export function parseHeaders(headerStr?: string): Record<string, string> {
  if (!headerStr) return {};

  try {
    return JSON.parse(headerStr);
  } catch {
    // 如果解析失败，尝试按行分割
    const headers: Record<string, string> = {};
    headerStr.split('\n').forEach(line => {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        if (key && value) {
          headers[key] = value;
        }
      }
    });
    return headers;
  }
}

/**
 * 判断URL是否为绝对URL
 */
export function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** 合并路径中重复斜杠（保留 https:// 中的 //） */
export function collapseUrlPathSlashes(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  try {
    const u = new URL(trimmed);
    u.pathname = u.pathname.replace(/\/{2,}/g, '/');
    return u.toString();
  } catch {
    return trimmed.replace(/(https?:\/\/[^/]+)\/+/gi, '$1/');
  }
}

/**
 * 规范化待解析的相对 URL（多行拼接、误粘连的绝对地址等）
 */
export function normalizeUrlRuleResult(relativeUrl: string): string {
  let rel = relativeUrl.trim();
  if (!rel) return rel;

  const firstLine = rel
    .split(/\r?\n+/)
    .map((s) => s.trim())
    .find(Boolean);
  if (firstLine) rel = firstLine;

  if (!isAbsoluteUrl(rel)) {
    const httpsIdx = rel.search(/https?:\/?\//i);
    if (httpsIdx > 0) {
      rel = rel.slice(0, httpsIdx).trim();
    }
  }

  return rel;
}

/**
 * 解析相对URL为绝对URL（对齐 Legado NetworkUtils.getAbsoluteURL）
 */
export function resolveUrl(baseUrl: string, relativeUrl: string): string {
  const rel = normalizeUrlRuleResult(relativeUrl);
  if (rel.startsWith('data:')) {
    return rel;
  }
  if (isAbsoluteUrl(rel)) {
    return rel;
  }

  const base = (baseUrl || '').split(',')[0]?.trim() || baseUrl;

  try {
    return new URL(rel, base).toString();
  } catch {
    if (rel.startsWith('/')) {
      try {
        const baseObj = new URL(base);
        return `${baseObj.protocol}//${baseObj.host}${rel}`;
      } catch {
        return rel;
      }
    }
    const basePath = base.substring(0, base.lastIndexOf('/') + 1);
    return basePath + rel;
  }
}

/**
 * 检测内容类型
 */
export function detectContentType(content: string): 'html' | 'json' | 'text' {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // 不是有效的JSON
    }
  }
  if (trimmed.startsWith('<')) {
    return 'html';
  }
  return 'text';
}

// ─── data: URL 工具（用于晴天聚合等书源） ───

/**
 * 解码 data: URL 中 base64 编码的 JSON 载荷
 * 格式：data:;base64,{base64json},{"type":"..."}
 * @returns 解析后的 JSON 对象，或 null
 */
export function decodeDataUrl(dataUrl: string): Record<string, string> | null {
  try {
    const match = dataUrl.match(/^data:[^,]*;base64,([A-Za-z0-9+/=]+)/);
    if (!match) return null;

    // base64 → UTF-8 字节 → 字符串
    const binaryStr = atob(match[1]);
    const bytes = Uint8Array.from(binaryStr, c => c.charCodeAt(0));
    let jsonStr = new TextDecoder('utf-8').decode(bytes);

    // 清理可能的控制字符
    jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, '');

    return JSON.parse(jsonStr);
  } catch (e) {
    console.warn('[utils] decodeDataUrl 失败:', e);
    return null;
  }
}

/**
 * 从书源的 jsLib 中解析 host 列表，取第一个作为 server 地址
 */
/** 从 jsLib 解析 `var host = ['https://...', ...]` */
export function extractHostListFromJsLib(source: Record<string, unknown>): string[] {
  const jsLib = source.jsLib as string | undefined;
  if (!jsLib) return [];

  const hostArrayMatch = jsLib.match(/var\s+host\s*=\s*\[([^\]]+)\]/);
  if (!hostArrayMatch) return [];

  const urls: string[] = [];
  const re = /['"](https?:\/\/[^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(hostArrayMatch[1])) !== null) {
    urls.push(m[1]);
  }
  return urls;
}

export function extractServerFromJsLib(source: Record<string, unknown>): string | null {
  return extractHostListFromJsLib(source)[0] ?? null;
}
