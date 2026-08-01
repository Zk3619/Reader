/**
 * OPML 导入/导出（仅服务订阅模块 sub_*，不触碰 legado RSS）
 */

import { DOMParser as XmlDomParser } from '@xmldom/xmldom';

export interface OpmlOutlineItem {
  title: string;
  xmlUrl: string;
  htmlUrl?: string;
  category: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function elementChildren(parent: Element): Element[] {
  const out: Element[] = [];
  const nodes = parent.childNodes;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes.item(i);
    if (node && node.nodeType === 1) out.push(node as Element);
  }
  return out;
}

function outlineAttrs(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  const attrs = el.attributes;
  if (!attrs) return out;
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs.item(i);
    if (!attr) continue;
    out[attr.name.toLowerCase()] = attr.value.trim();
  }
  return out;
}

function walkOutlines(
  parent: Element,
  category: string,
  out: OpmlOutlineItem[],
): void {
  for (const child of elementChildren(parent)) {
    if (child.tagName.toLowerCase() !== 'outline') continue;
    const attrs = outlineAttrs(child);
    const text = attrs.text || attrs.title || '';
    const xmlUrl = attrs.xmlurl || attrs.xml_url || '';
    const htmlUrl = attrs.htmlurl || attrs.html_url || '';
    const type = (attrs.type || '').toLowerCase();
    const hasFeedChildren = elementChildren(child).some(
      (n) => n.tagName.toLowerCase() === 'outline',
    );

    if (xmlUrl) {
      out.push({
        title: text || xmlUrl,
        xmlUrl,
        htmlUrl: htmlUrl || undefined,
        category,
      });
    } else if (hasFeedChildren || (!type && text)) {
      walkOutlines(child, text || category, out);
      continue;
    }

    if (hasFeedChildren) {
      walkOutlines(child, category, out);
    }
  }
}

function parseXmlDocument(xml: string): Document {
  const trimmed = xml.trim();
  if (!trimmed) throw new Error('OPML 解析失败');

  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(trimmed, 'application/xml');
    if (doc.querySelector?.('parsererror')) throw new Error('OPML 解析失败');
    return doc;
  }

  const doc = new XmlDomParser({
    errorHandler: {
      warning: () => undefined,
      error: () => {
        throw new Error('OPML 解析失败');
      },
      fatalError: () => {
        throw new Error('OPML 解析失败');
      },
    },
  }).parseFromString(trimmed, 'application/xml');

  const errors = doc.getElementsByTagName('parsererror');
  if (errors.length > 0) throw new Error('OPML 解析失败');
  return doc as unknown as Document;
}

function findOpmlBody(doc: Document): Element | null {
  const opmls = doc.getElementsByTagName('opml');
  const root = (opmls.item(0) as Element | null) ?? doc.documentElement;
  if (!root) return null;
  const bodies = root.getElementsByTagName('body');
  return (bodies.item(0) as Element | null) ?? root;
}

/** 解析 OPML / 常见订阅导出 XML，提取 feed 列表 */
export function parseOpml(xml: string): OpmlOutlineItem[] {
  const doc = parseXmlDocument(xml);
  const body = findOpmlBody(doc);
  if (!body) throw new Error('无效的 OPML 文档');

  const items: OpmlOutlineItem[] = [];
  walkOutlines(body, '', items);

  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.xmlUrl.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 将订阅源导出为 OPML 2.0 文本 */
export function buildOpml(
  sources: Array<{
    title: string;
    url: string;
    category?: string;
    siteUrl?: string | null;
  }>,
  options?: { title?: string },
): string {
  const groups = new Map<string, typeof sources>();
  for (const source of sources) {
    const cat = (source.category ?? '').trim();
    const list = groups.get(cat) ?? [];
    list.push(source);
    groups.set(cat, list);
  }

  const headTitle = escapeXml((options?.title ?? '').trim() || 'Reader Subscribe');
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    `    <title>${headTitle}</title>`,
    `    <dateCreated>${new Date().toUTCString()}</dateCreated>`,
    '  </head>',
    '  <body>',
  ];

  const writeFeed = (source: (typeof sources)[number], indent: string) => {
    const title = escapeXml(source.title || source.url);
    const xmlUrl = escapeXml(source.url);
    const html = source.siteUrl ? ` htmlUrl="${escapeXml(source.siteUrl)}"` : '';
    lines.push(
      `${indent}<outline type="rss" text="${title}" title="${title}" xmlUrl="${xmlUrl}"${html} />`,
    );
  };

  for (const [category, list] of groups) {
    if (category) {
      lines.push(`    <outline text="${escapeXml(category)}" title="${escapeXml(category)}">`);
      for (const source of list) writeFeed(source, '      ');
      lines.push('    </outline>');
    } else {
      for (const source of list) writeFeed(source, '    ');
    }
  }

  lines.push('  </body>', '</opml>', '');
  return lines.join('\n');
}

/** 导出文件名片段：全量 / 分类名 / 未分类 */
export function subscribeOpmlExportSlug(category?: string): string {
  if (category === undefined) return 'all';
  const name = category.trim();
  if (!name) return 'uncategorized';
  return name.replace(/[^\w\u4e00-\u9fff-]+/g, '_').slice(0, 40) || 'category';
}
