/**
 * EPG / XMLTV（含 .gz 择优）
 */

import { tvGet } from '../net/rules';

export type EpgProgramme = {
  channelId: string;
  title: string;
  start: number;
  stop: number;
  desc?: string;
};

function parseXmlTvTime(s: string): number {
  // 20240101120000 +0000
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(s.trim());
  if (!m) return 0;
  return Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  );
}

function parseXmlTv(xml: string): EpgProgramme[] {
  const list: EpgProgramme[] = [];
  const re =
    /<programme\s+([^>]+)>([\s\S]*?)<\/programme>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs = m[1]!;
    const body = m[2]!;
    const channelId = /channel="([^"]+)"/i.exec(attrs)?.[1] ?? '';
    const start = parseXmlTvTime(/start="([^"]+)"/i.exec(attrs)?.[1] ?? '');
    const stop = parseXmlTvTime(/stop="([^"]+)"/i.exec(attrs)?.[1] ?? '');
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(body)?.[1]?.trim() ?? '';
    const desc = /<desc[^>]*>([^<]*)<\/desc>/i.exec(body)?.[1]?.trim();
    if (channelId && title) {
      list.push({ channelId, title, start, stop, desc });
    }
  }
  return list;
}

async function fetchMaybeGzip(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // gzip magic
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('gzip');
      const stream = new Blob([bytes]).stream().pipeThrough(ds);
      return await new Response(stream).text();
    }
    throw new Error('浏览器不支持 gzip EPG 解压');
  }
  return new TextDecoder().decode(bytes);
}

const epgCache = new Map<string, EpgProgramme[]>();

export async function loadEpg(url: string): Promise<EpgProgramme[]> {
  if (!url) return [];
  const cached = epgCache.get(url);
  if (cached) return cached;
  try {
    let text: string;
    if (url.endsWith('.gz') || url.includes('.gz?')) {
      text = await fetchMaybeGzip(url);
    } else {
      try {
        text = await tvGet(url, { timeout: 30000 });
      } catch {
        text = await fetchMaybeGzip(url);
      }
    }
    const list = parseXmlTv(text);
    epgCache.set(url, list);
    return list;
  } catch (e) {
    console.warn('[tv-epg]', e);
    return [];
  }
}

export function currentProgramme(
  list: EpgProgramme[],
  channelId: string,
  now = Date.now(),
): EpgProgramme | undefined {
  const id = channelId.toLowerCase();
  return list.find(
    (p) =>
      (p.channelId.toLowerCase() === id || p.channelId.toLowerCase().includes(id)) &&
      p.start <= now &&
      (p.stop === 0 || p.stop >= now),
  );
}

export function formatProgramme(p: EpgProgramme | undefined): string {
  if (!p) return '暂无节目信息';
  const t = new Date(p.start);
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  return `${hh}:${mm} ${p.title}`;
}
