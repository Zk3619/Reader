/**
 * Lightweight XML helpers for InfoExtractor (yt-dlp ElementTree subset).
 */

import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

/** @xmldom uses DOM lib Document/Element (not re-exported from the package). */
export type XmlDoc = Document;
export type XmlEl = Element;

export function parseXmlString(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) {
    throw new Error(err.textContent || 'XML parse error');
  }
  return doc;
}

export function xpathNs(path: string, namespace?: string | null): string {
  if (!namespace) return path;
  return path
    .split('/')
    .map((p) => {
      if (!p || p === '.' || p === '..' || p.startsWith('@') || p.includes(':') || p === '*') {
        return p;
      }
      if (p.startsWith('.//')) return `.//{${namespace}}${p.slice(3)}`;
      if (p.startsWith('//')) return `//{${namespace}}${p.slice(2)}`;
      return `{${namespace}}${p}`;
    })
    .join('/');
}

/** Find direct/descendant elements matching local name (namespace-agnostic). */
export function findAll(root: Element | Document, localName: string, deep = true): Element[] {
  const out: Element[] = [];
  const walk = (el: Element, onlyDirect: boolean) => {
    const children = el.childNodes;
    for (let i = 0; i < children.length; i++) {
      const n = children.item(i);
      if (!n || n.nodeType !== 1) continue;
      const child = n as Element;
      const ln = child.localName || child.nodeName?.replace(/^.*:/, '') || '';
      if (ln.toLowerCase() === localName.toLowerCase()) out.push(child);
      if (!onlyDirect) walk(child, false);
    }
  };
  const start =
    (root as Document).documentElement != null
      ? ((root as Document).documentElement as Element)
      : (root as Element);
  if (deep) walk(start, false);
  else walk(start, true);
  return out;
}

export function findOne(root: Element | Document, localName: string, deep = true): Element | null {
  return findAll(root, localName, deep)[0] || null;
}

export function attr(el: Element | null | undefined, name: string): string | null {
  if (!el) return null;
  const v = el.getAttribute(name);
  return v == null || v === '' ? null : v;
}

export function text(el: Element | null | undefined): string {
  return (el?.textContent || '').trim();
}

export function tagLocal(el: Element): string {
  return (el.localName || el.nodeName || '').replace(/^.*:/, '');
}

export function detectNs(rootTag: string): string | null {
  const m = /^\{([^}]+)\}/i.exec(rootTag);
  return m?.[1] || null;
}

export function serializeXml(doc: Document): string {
  return new XMLSerializer().serializeToString(doc);
}
