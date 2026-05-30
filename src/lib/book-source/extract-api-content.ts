/**
 * Legado 书源 /content 等 JSON API 响应解析
 */

/** /content 返回的服务端错误文案，不应当作正文 */
export function isApiErrorText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return (
    /正文处理异常/i.test(t) ||
    /nil pointer dereference/i.test(t) ||
    /invalid memory address/i.test(t)
  );
}

export function isApiSuccessCode(code: unknown): boolean {
  if (code === undefined || code === null) return true;
  return code === 0 || code === '0';
}

/** 图片 URL 列表 → HTML img 串 */
export function apiContentsToHtml(contents: unknown): string {
  if (!Array.isArray(contents) || contents.length === 0) return '';
  const tags: string[] = [];
  for (const item of contents) {
    if (typeof item === 'string' && item.trim()) {
      tags.push(`<img src="${item.trim()}">`);
      continue;
    }
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const row = item as Record<string, unknown>;
      const url = row.url ?? row.src ?? row.image ?? row.link;
      if (typeof url === 'string' && url.trim()) {
        tags.push(`<img src="${url.trim()}">`);
      }
    }
  }
  return tags.join('\n');
}

function pickSuccessfulContentBody(parsed: Record<string, unknown>): string {
  const data = parsed.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const nested = data as Record<string, unknown>;
    if (typeof nested.content === 'string' && nested.content.trim()) {
      return nested.content;
    }
    const fromNestedContents = apiContentsToHtml(nested.contents);
    if (fromNestedContents) return fromNestedContents;
  }
  if (typeof data === 'string' && data.trim()) {
    return data;
  }

  const fromTopContents = apiContentsToHtml(parsed.contents);
  if (fromTopContents) return fromTopContents;

  if (typeof parsed.content === 'string' && parsed.content.trim()) {
    return parsed.content;
  }
  return '';
}

/**
 * 从 /content 原始响应或 ruleContent JS 返回值中提取正文。
 * 失败响应（code != 0）的 content/msg 不作为正文。
 */
export function extractApiContent(raw: string | Record<string, unknown>): string {
  let parsed: Record<string, unknown> | null = null;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return '';
    if (!text.startsWith('{') && !text.startsWith('[')) {
      return isApiErrorText(text) ? '' : text;
    }
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return isApiErrorText(text) ? '' : text;
    }
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    parsed = raw;
  }
  if (!parsed) return '';

  if ('code' in parsed && !isApiSuccessCode(parsed.code)) {
    return '';
  }

  const body = pickSuccessfulContentBody(parsed);
  if (!body.trim() || isApiErrorText(body)) return '';
  return body;
}

/** 诊断 /content 响应结构（日志用，不含正文全文） */
export function summarizeApiContentResponse(
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  const data = parsed.data;
  const summary: Record<string, unknown> = {
    topKeys: Object.keys(parsed),
    code: parsed.code,
    msg: parsed.msg,
    contentLen: typeof parsed.content === 'string' ? parsed.content.length : undefined,
    contentsLen: Array.isArray(parsed.contents) ? parsed.contents.length : undefined,
  };
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const nested = data as Record<string, unknown>;
    summary.dataKeys = Object.keys(nested);
    summary.dataContentLen =
      typeof nested.content === 'string' ? nested.content.length : undefined;
    summary.dataContentsLen = Array.isArray(nested.contents)
      ? nested.contents.length
      : undefined;
  } else if (typeof data === 'string') {
    summary.dataStrLen = data.length;
  }
  return summary;
}

/** API 失败时的可读原因（用于日志/提示，不作正文） */
export function extractApiErrorMessage(raw: string | Record<string, unknown>): string {
  let parsed: Record<string, unknown> | null = null;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text.startsWith('{')) return text.slice(0, 200);
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return text.slice(0, 200);
    }
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    parsed = raw;
  }
  if (!parsed) return '';
  if (isApiSuccessCode(parsed.code)) return '';
  const msg = typeof parsed.msg === 'string' ? parsed.msg.trim() : '';
  if (msg) return msg;
  const content = typeof parsed.content === 'string' ? parsed.content.trim() : '';
  if (content && !isApiErrorText(content)) return content;
  return '';
}

/** 正文内相对图片 URL 补全（漫画 ident=/proxy 等） */
export function resolveApiImageContent(content: string, baseUrl: string): string {
  if (!content?.trim() || !baseUrl?.trim()) return content;
  const base = baseUrl.replace(/\/+$/, '');

  let out = content.replace(/ident="/g, `ident="${base}`);

  out = out.replace(
    /<img([^>]*)\ssrc\s*=\s*["']([^"']+)["']([^>]*)>/gi,
    (_match, before, src, after) => {
      let resolved = src.trim();
      if (
        resolved &&
        !/^https?:\/\//i.test(resolved) &&
        !resolved.startsWith('data:') &&
        !resolved.startsWith('blob:')
      ) {
        try {
          resolved = resolved.startsWith('/')
            ? `${base}${resolved}`
            : new URL(resolved, `${base}/`).toString();
        } catch {
          /* keep original */
        }
      }
      return `<img${before} src="${resolved}"${after}>`;
    },
  );

  return out;
}
