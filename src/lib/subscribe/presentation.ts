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

function sanitizeWithRegex(html: string): string {
  return html
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
}

export function sanitizeSubscribeHtml(html: string | null | undefined): string {
  if (!html) return '';
  if (!hasDomParser()) return sanitizeWithRegex(html);
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
    if (element.tagName === 'A') {
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noreferrer noopener');
    }
    if (element.tagName === 'IMG') {
      element.setAttribute('loading', 'lazy');
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
