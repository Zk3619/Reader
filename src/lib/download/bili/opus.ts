/**
 * 图文 Opus：Markdown + 图片
 */

import { request } from '@/lib/http';
import { isTauri } from '@/lib/platform/detect';
import { BiliError } from './error';
import { getBiliRequestHeaders } from './session';

export type OpusDetails = {
  stat: { like?: number; reply?: number; favorite?: number; share?: number };
  author: { name: string; mid: number; avatar: string };
};

function extractInitialState(html: string): Record<string, unknown> | null {
  const m =
    html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});?\s*\(function/) ||
    html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
  if (!m?.[1]) return null;
  try {
    return JSON.parse(m[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function fetchOpusHtml(opid: string): Promise<string> {
  const url = `https://www.bilibili.com/opus/${opid}`;
  const res = await request(url, {
    method: 'GET',
    headers: getBiliRequestHeaders(),
    useBackendHttp: isTauri(),
    timeout: 30000,
    retry: 1,
  });
  return res.text();
}

export async function getOpusDetails(id: string): Promise<OpusDetails> {
  const html = await fetchOpusHtml(id.replace(/^cv/i, ''));
  const state = extractInitialState(html);
  const detail =
    (state?.detail as Record<string, unknown> | undefined) ||
    (state?.readInfo as Record<string, unknown> | undefined) ||
    {};
  const author =
    (detail.author as Record<string, unknown> | undefined) ||
    (state?.user as Record<string, unknown> | undefined) ||
    {};
  const stats =
    (detail.stats as Record<string, unknown> | undefined) ||
    (detail.stat as Record<string, unknown> | undefined) ||
    {};
  return {
    stat: {
      like: Number(stats.like ?? stats.likes ?? 0) || undefined,
      reply: Number(stats.reply ?? stats.comment ?? 0) || undefined,
      favorite: Number(stats.favorite ?? stats.fav ?? 0) || undefined,
      share: Number(stats.share ?? 0) || undefined,
    },
    author: {
      name: String(author.name ?? author.uname ?? ''),
      mid: Number(author.mid ?? author.uid ?? 0),
      avatar: String(author.face ?? author.avatar ?? ''),
    },
  };
}

function nodesToMarkdown(nodes: unknown[]): string {
  const parts: string[] = [];
  for (const n of nodes) {
    const node = n as Record<string, unknown>;
    const type = String(node.type ?? '');
    if (type.includes('TEXT') || node.text) {
      parts.push(String(node.text ?? node.words ?? ''));
    } else if (type.includes('EMOJI')) {
      parts.push(String((node.emoji as { text?: string })?.text ?? ''));
    } else if (type.includes('AT')) {
      parts.push(`@${String(node.text ?? '')}`);
    } else if (type.includes('TOPIC')) {
      parts.push(`#${String(node.text ?? '')}#`);
    } else if (type.includes('BV') || type.includes('AV')) {
      parts.push(String(node.text ?? node.uri ?? ''));
    } else if (node.ops) {
      parts.push(nodesToMarkdown(node.ops as unknown[]));
    } else if (Array.isArray(node.children)) {
      parts.push(nodesToMarkdown(node.children));
    }
  }
  return parts.join('');
}

export async function getOpusMarkdown(opid: string): Promise<string> {
  const html = await fetchOpusHtml(opid);
  const state = extractInitialState(html);
  if (!state) throw new BiliError('无法解析图文内容');
  const detail =
    (state.detail as Record<string, unknown> | undefined) ||
    (state.readInfo as Record<string, unknown> | undefined) ||
    {};
  const title = String(detail.title ?? state.title ?? opid);
  const content =
    (detail.content as Record<string, unknown> | undefined) ||
    (detail.opus as Record<string, unknown> | undefined) ||
    {};
  const paragraphs =
    (content.paragraphs as unknown[]) ||
    (detail.paragraphs as unknown[]) ||
    [];
  const lines: string[] = [`# ${title}`, ''];
  for (const p of paragraphs) {
    const para = p as Record<string, unknown>;
    if (para.pic || para.pics) {
      const pics = (para.pic ? [para.pic] : para.pics) as Array<{
        url?: string;
      }>;
      for (const pic of pics) {
        if (pic?.url) lines.push(`![](${pic.url})`, '');
      }
      continue;
    }
    const textObj =
      para.text && typeof para.text === 'object'
        ? (para.text as Record<string, unknown>)
        : null;
    const textNodes =
      (textObj?.nodes as unknown[]) ||
      (para.nodes as unknown[]) ||
      (Array.isArray(para.text) ? (para.text as unknown[]) : null);
    if (textNodes) {
      lines.push(nodesToMarkdown(textNodes), '');
    } else if (typeof para.text === 'string') {
      lines.push(para.text, '');
    }
  }
  if (lines.length <= 2) {
    const raw = String(detail.summary ?? detail.content ?? '');
    if (raw) lines.push(raw);
  }
  return lines.join('\n');
}

export async function getOpusImages(opid: string): Promise<string[]> {
  const html = await fetchOpusHtml(opid);
  const state = extractInitialState(html);
  const urls = new Set<string>();
  const walk = (v: unknown): void => {
    if (!v) return;
    if (typeof v === 'string') {
      if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(v) && /hdslb\.com|bili/.test(v)) {
        urls.add(v.startsWith('//') ? `https:${v}` : v);
      }
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    if (typeof v === 'object') {
      for (const x of Object.values(v as object)) walk(x);
    }
  };
  walk(state);
  return [...urls];
}
