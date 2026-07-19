/**
 * 直播 M3U / TXT(#genre#) / 内嵌 groups / spider liveContent 解析
 */

import type { LiveChannel, LiveGroup, LiveSource } from '../types';
import { tvGet } from '../net/rules';

export function parseM3u(text: string): LiveGroup[] {
  const groups: LiveGroup[] = [];
  let current: LiveGroup = { name: '默认', channel: [] };
  const lines = text.split(/\r?\n/);
  let pendingName = '';
  let pendingLogo = '';
  let pendingCatchup = '';
  let pendingCatchupSource = '';
  let pendingTvgId = '';

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#EXTINF:')) {
      const nameMatch = t.split(',').pop()?.trim() ?? '频道';
      pendingName = nameMatch;
      const logo = /tvg-logo="([^"]+)"/i.exec(t)?.[1];
      const group = /group-title="([^"]+)"/i.exec(t)?.[1];
      pendingLogo = logo ?? '';
      pendingCatchup = /catchup="([^"]+)"/i.exec(t)?.[1] ?? '';
      pendingCatchupSource = /catchup-source="([^"]+)"/i.exec(t)?.[1] ?? '';
      pendingTvgId = /tvg-id="([^"]+)"/i.exec(t)?.[1] ?? '';
      if (group && group !== current.name) {
        if (current.channel.length) groups.push(current);
        current = { name: group, channel: [] };
      }
    } else if (t.startsWith('#')) {
      continue;
    } else if (t.startsWith('http') || t.includes('://')) {
      const urls = t.split('#').map((u) => u.trim()).filter(Boolean);
      current.channel.push({
        name: pendingName || urls[0] || t,
        urls: urls.length ? urls : [t],
        logo: pendingLogo || undefined,
        tvgId: pendingTvgId || undefined,
        catchup: pendingCatchup || undefined,
        catchupSource: pendingCatchupSource || undefined,
      });
      pendingName = '';
      pendingLogo = '';
      pendingCatchup = '';
      pendingCatchupSource = '';
      pendingTvgId = '';
    }
  }
  if (current.channel.length) groups.push(current);
  return groups;
}

export function parseTxtGenre(text: string): LiveGroup[] {
  const groups: LiveGroup[] = [];
  let current: LiveGroup | null = null;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (t.includes('#genre#')) {
      if (current) groups.push(current);
      current = { name: t.replace(',#genre#', '').replace('#genre#', '').trim(), channel: [] };
      continue;
    }
    if (!current) current = { name: '默认', channel: [] };
    const parts = t.split(',');
    if (parts.length >= 2) {
      const name = parts[0]!.trim();
      const urls = parts.slice(1).join(',').split('#').map((u) => u.trim()).filter(Boolean);
      current.channel.push({ name, urls });
    }
  }
  if (current?.channel.length) groups.push(current);
  return groups;
}

function parseLiveBody(body: string): LiveGroup[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('#EXTM3U') || trimmed.includes('#EXTINF:')) {
    return parseM3u(trimmed);
  }
  if (trimmed.includes('#genre#')) {
    return parseTxtGenre(trimmed);
  }
  try {
    const json = JSON.parse(trimmed) as LiveSource | LiveGroup[];
    if (Array.isArray(json)) return json as LiveGroup[];
    if ((json as LiveSource).groups) return (json as LiveSource).groups!;
  } catch {
    /* fallthrough */
  }
  return parseM3u(trimmed);
}

/** 对齐 fongmi LiveParser.getText：有 api 则走 spider.liveContent */
async function fetchLiveTextViaSpider(source: LiveSource): Promise<string> {
  const api = source.api?.trim();
  if (!api) return '';
  if (api.startsWith('csp_')) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const raw = await invoke<string>('tv_jar_invoke', {
        siteKey: source.name || 'live',
        api,
        ext: source.ext ?? '',
        jar: source.jar ?? '',
        method: 'liveContent',
        argsJson: JSON.stringify([source.url ?? '']),
      });
      return raw ?? '';
    } catch (e) {
      console.warn('[tv-live] spider liveContent', e);
      return '';
    }
  }
  // JS/Py spider liveContent 后续按需接入；无 api 时走 url 拉取
  return '';
}

export async function loadLiveGroups(source: LiveSource): Promise<LiveGroup[]> {
  if (source.groups?.length) return source.groups;
  if (source.api?.trim()) {
    const text = await fetchLiveTextViaSpider(source);
    if (text.trim()) return parseLiveBody(text);
  }
  if (!source.url) return [];
  const body = await tvGet(source.url, {
    timeout: source.timeout ? source.timeout * 1000 : 30000,
    headers: source.header,
  });
  return parseLiveBody(body);
}

export function flattenChannels(groups: LiveGroup[]): Array<LiveChannel & { group: string }> {
  const out: Array<LiveChannel & { group: string }> = [];
  for (const g of groups) {
    for (const c of g.channel) out.push({ ...c, group: g.name });
  }
  return out;
}
