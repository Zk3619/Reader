/**
 * EPG / XMLTV（含 .gz 择优、API 模板 {name}/{date}）
 */

import { tvRequest } from '../net/rules';
import type { LiveChannel } from '../types';

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

function parseEpgDateTime(date: string, time: string): number {
  const d = date.replace(/\D/g, '').slice(0, 8);
  const t = time.replace(/\D/g, '');
  if (d.length < 8) return 0;
  const hh = t.length >= 4 ? t.slice(0, 2) : '00';
  const mm = t.length >= 4 ? t.slice(2, 4) : t.slice(0, 2).padStart(2, '0');
  const ss = t.length >= 6 ? t.slice(4, 6) : '00';
  return Date.UTC(
    Number(d.slice(0, 4)),
    Number(d.slice(4, 6)) - 1,
    Number(d.slice(6, 8)),
    Number(hh),
    Number(mm),
    Number(ss),
  );
}

function parseJsonEpg(text: string, channelKey: string): EpgProgramme[] {
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const date = String(json.date ?? json.day ?? '').replace(/\D/g, '').slice(0, 8);
    const rows =
      (Array.isArray(json.epg_data) ? json.epg_data : null) ??
      (Array.isArray(json.epg) ? json.epg : null) ??
      (Array.isArray(json.data) ? json.data : null) ??
      [];
    const list: EpgProgramme[] = [];
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const item = row as Record<string, unknown>;
      const title = String(item.title ?? item.name ?? item.program ?? '').trim();
      if (!title) continue;
      const startRaw = String(item.start ?? item.starttime ?? item.begin ?? '');
      const stopRaw = String(item.end ?? item.endtime ?? item.stop ?? '');
      const start =
        /^\d{14}/.test(startRaw)
          ? parseXmlTvTime(startRaw)
          : parseEpgDateTime(date, startRaw);
      const stop =
        /^\d{14}/.test(stopRaw)
          ? parseXmlTvTime(stopRaw)
          : parseEpgDateTime(date, stopRaw);
      list.push({
        channelId: channelKey,
        title,
        start,
        stop,
        desc: String(item.desc ?? item.description ?? '').trim() || undefined,
      });
    }
    return list;
  } catch {
    return [];
  }
}

function parseEpgText(text: string, channelKey: string): EpgProgramme[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const jsonList = parseJsonEpg(trimmed, channelKey);
    if (jsonList.length) return jsonList;
  }
  if (trimmed.includes('<programme')) return parseXmlTv(trimmed);
  return [];
}

async function fetchTextViaBackend(url: string): Promise<string> {
  const res = await tvRequest(url, { timeout: 30000, method: 'GET' });
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('gzip');
      const stream = new Blob([bytes]).stream().pipeThrough(ds);
      return await new Response(stream).text();
    }
    throw new Error('不支持 gzip EPG 解压');
  }
  return new TextDecoder().decode(bytes);
}

const epgCache = new Map<string, EpgProgramme[]>();

/** 拆分直播源 epg 字段（逗号分隔） */
export function splitLiveEpgUrls(epg?: string): string[] {
  if (!epg?.trim()) return [];
  return epg
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isEpgXmlSource(url: string): boolean {
  if (!url || url.includes('{')) return false;
  const lower = url.toLowerCase();
  return lower.includes('xml') || lower.includes('.gz');
}

export function isEpgApiTemplate(url: string): boolean {
  return !!url && url.includes('{');
}

export function pickEpgApiTemplate(epg?: string): string {
  return splitLiveEpgUrls(epg).find(isEpgApiTemplate) ?? '';
}

export function pickEpgXmlSources(epg?: string): string[] {
  return splitLiveEpgUrls(epg).filter(isEpgXmlSource);
}

/** YYYYMMDD */
export function formatEpgDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/** 解析频道 EPG API 模板（对齐 FongMi Channel.live） */
export function resolveChannelEpgUrl(
  liveEpg: string | undefined,
  channel: Pick<LiveChannel, 'name' | 'tvgId' | 'epg'>,
): string {
  const template = pickEpgApiTemplate(liveEpg);
  if (!template) return '';
  const channelEpg = channel.epg?.trim() ?? '';
  const id = channel.tvgId?.trim() || channel.name;
  const name = channel.name;
  let url = template
    .replace(/\{id\}/gi, encodeURIComponent(id))
    .replace(/\{name\}/gi, encodeURIComponent(name))
    .replace(/\{epg\}/gi, encodeURIComponent(channelEpg));
  if (channelEpg.startsWith('http') && !url.startsWith('http')) {
    url = channelEpg;
  }
  return url;
}

export async function loadEpg(url: string): Promise<EpgProgramme[]> {
  if (!url || isEpgApiTemplate(url)) return [];
  const cached = epgCache.get(url);
  if (cached) return cached;
  try {
    const text = await fetchTextViaBackend(url);
    const list = parseEpgText(text, '');
    epgCache.set(url, list);
    return list;
  } catch (e) {
    console.warn('[tv-epg]', e);
    return [];
  }
}

/** 加载 XML/GZ 批量 EPG */
export async function loadBulkEpg(epg?: string): Promise<EpgProgramme[]> {
  const urls = pickEpgXmlSources(epg);
  if (!urls.length) return [];
  const merged: EpgProgramme[] = [];
  for (const url of urls) {
    merged.push(...(await loadEpg(url)));
  }
  return merged;
}

/** 按频道拉取 API 模板 EPG（含 {date}） */
export async function loadChannelEpg(
  liveEpg: string | undefined,
  channel: Pick<LiveChannel, 'name' | 'tvgId' | 'epg'>,
): Promise<EpgProgramme[]> {
  const base = resolveChannelEpgUrl(liveEpg, channel);
  if (!base) return [];
  const channelKey = channel.tvgId?.trim() || channel.name;
  const merged: EpgProgramme[] = [];
  for (const offset of [-1, 0, 1]) {
    const date = formatEpgDate(offset);
    const url = base.replace(/\{date\}/gi, date);
    if (!/^https?:\/\//i.test(url)) continue;
    const cacheKey = url;
    const cached = epgCache.get(cacheKey);
    if (cached?.length) {
      merged.push(...cached);
      continue;
    }
    try {
      const text = await fetchTextViaBackend(url);
      const list = parseEpgText(text, channelKey);
      epgCache.set(cacheKey, list);
      merged.push(...list);
    } catch (e) {
      console.warn('[tv-epg] channel', channel.name, e);
    }
  }
  return merged;
}

export function mergeEpgProgrammes(
  base: EpgProgramme[],
  extra: EpgProgramme[],
): EpgProgramme[] {
  if (!extra.length) return base;
  const seen = new Set(base.map((p) => `${p.channelId}|${p.start}|${p.title}`));
  const out = [...base];
  for (const p of extra) {
    const key = `${p.channelId}|${p.start}|${p.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
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

/** 某频道今日起附近的节目单（按开始时间排序） */
export function programmesForChannel(
  list: EpgProgramme[],
  channelId: string,
  limit = 48,
): EpgProgramme[] {
  const id = channelId.toLowerCase();
  const matched = list
    .filter(
      (p) =>
        p.channelId.toLowerCase() === id || p.channelId.toLowerCase().includes(id),
    )
    .sort((a, b) => a.start - b.start);
  const now = Date.now();
  const startIdx = Math.max(
    0,
    matched.findIndex((p) => p.stop === 0 || p.stop >= now) - 2,
  );
  return matched.slice(startIdx, startIdx + limit);
}

export function formatProgramme(p: EpgProgramme | undefined): string {
  if (!p) return '暂无节目信息';
  const t = new Date(p.start);
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  return `${hh}:${mm} ${p.title}`;
}

export function formatProgrammeRange(p: EpgProgramme): string {
  const s = new Date(p.start);
  const e = p.stop ? new Date(p.stop) : null;
  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return e ? `${fmt(s)}-${fmt(e)}` : fmt(s);
}
