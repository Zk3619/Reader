/**
 * 直播列表解析 — 对齐 TV-fongmi LiveParser（M3U / TXT / JSON + 行内标头）
 */

import type { LiveChannel, LiveGroup, LiveSource } from '../types';
import { tvGet } from '../net/rules';

const DEFAULT_LIVE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** 解析 `url|User-Agent=…&Referer=…` / `url$线路名`（先 | 后 $，对齐 fongmi） */
export function resolveLivePlayUrl(raw: string): {
  url: string;
  headers: Record<string, string>;
  lineName: string;
} {
  let s = String(raw ?? '').trim();
  const headers: Record<string, string> = {};
  let lineName = '';

  const pipe = s.indexOf('|');
  if (pipe > 0) {
    const qs = s.slice(pipe + 1);
    s = s.slice(0, pipe).trim();
    mergePipeHeaders(headers, qs);
  }

  const dollar = s.indexOf('$');
  if (dollar > 0) {
    lineName = s.slice(dollar + 1).trim();
    s = s.slice(0, dollar).trim();
  }

  return { url: s, headers, lineName };
}

function mergePipeHeaders(target: Record<string, string>, qs: string): void {
  const parts = qs.split(/[&|]/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim().replace(/^["']|["']$/g, '');
    let v = part.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    try {
      v = decodeURIComponent(v);
    } catch {
      /* keep */
    }
    if (!k || !v) continue;
    if (/^user-agent$/i.test(k) || k === 'ua') target['User-Agent'] = v;
    else if (/^referer$/i.test(k) || /^referrer$/i.test(k)) target.Referer = v;
    else if (/^origin$/i.test(k)) target.Origin = v;
    else if (/^cookie$/i.test(k)) target.Cookie = v;
    else target[k] = v;
  }
}

function tryParseJsonMap(raw: string): Record<string, string> {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj ?? {})) {
      if (v == null) continue;
      out[k] = String(v);
    }
    return out;
  } catch {
    return {};
  }
}

interface LineSetting {
  ua?: string;
  referer?: string;
  origin?: string;
  parse?: number;
  header: Record<string, string>;
}

function createSetting(): LineSetting {
  return { header: {} };
}

function isSettingLine(line: string): boolean {
  return (
    line.startsWith('ua') ||
    line.startsWith('parse') ||
    line.startsWith('header') ||
    line.startsWith('format') ||
    line.startsWith('origin') ||
    line.startsWith('referer') ||
    line.startsWith('#EXTHTTP:') ||
    line.startsWith('#EXTVLCOPT:') ||
    line.startsWith('#KODIPROP:')
  );
}

function applySettingLine(setting: LineSetting, line: string): void {
  try {
    if (line.startsWith('#EXTHTTP:')) {
      Object.assign(setting.header, tryParseJsonMap(line.slice('#EXTHTTP:'.length).trim()));
      return;
    }
    if (line.startsWith('header=') || line.includes('header=')) {
      const raw = line.split(/header=/i)[1]?.trim() ?? '';
      Object.assign(setting.header, tryParseJsonMap(raw));
      return;
    }
    if (/user-agent=/i.test(line) || line.startsWith('ua=')) {
      const v =
        line.split(/user-agent=/i)[1]?.trim() ??
        line.split(/ua=/i)[1]?.trim() ??
        '';
      setting.ua = v.replace(/^["']|["']$/g, '');
      return;
    }
    if (/referer=/i.test(line)) {
      setting.referer = line.split(/referer=/i)[1]?.trim().replace(/^["']|["']$/g, '');
      return;
    }
    if (/referrer=/i.test(line)) {
      setting.referer = line.split(/referrer=/i)[1]?.trim().replace(/^["']|["']$/g, '');
      return;
    }
    if (/origin=/i.test(line)) {
      setting.origin = line.split(/origin=/i)[1]?.trim().replace(/^["']|["']$/g, '');
      return;
    }
    if (line.startsWith('#EXTVLCOPT:http-user-agent')) {
      setting.ua = line.split(/=(.*)$/)[1]?.trim().replace(/^["']|["']$/g, '');
      return;
    }
    if (line.startsWith('#EXTVLCOPT:http-referrer')) {
      setting.referer = line.split(/=(.*)$/)[1]?.trim().replace(/^["']|["']$/g, '');
      return;
    }
    if (line.startsWith('#EXTVLCOPT:http-origin')) {
      setting.origin = line.split(/=(.*)$/)[1]?.trim().replace(/^["']|["']$/g, '');
      return;
    }
    if (line.includes('stream_headers=') || line.includes('common_headers=')) {
      const raw =
        line.split(/stream_headers=/i)[1]?.trim() ??
        line.split(/common_headers=/i)[1]?.trim() ??
        '';
      mergePipeHeaders(setting.header, raw);
    }
  } catch {
    /* ignore malformed setting lines */
  }
}

function copySettingToChannel(ch: LiveChannel, setting: LineSetting): void {
  if (setting.ua) ch.ua = setting.ua;
  if (setting.referer) ch.referer = setting.referer;
  if (setting.origin) ch.origin = setting.origin;
  if (Object.keys(setting.header).length) {
    ch.header = { ...(ch.header ?? {}), ...setting.header };
  }
}

function extractAttr(line: string, key: string): string {
  const re = new RegExp(`${key}="([^"]*)"`, 'i');
  return re.exec(line)?.[1]?.trim() ?? '';
}

export function parseM3u(text: string): LiveGroup[] {
  const groups: LiveGroup[] = [];
  let current: LiveGroup = { name: '默认', channel: [] };
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let pendingName = '';
  let pendingLogo = '';
  let pendingCatchup = '';
  let pendingCatchupSource = '';
  let pendingTvgId = '';
  let pendingTvgName = '';
  let pendingUa = '';
  let setting = createSetting();
  let channel: LiveChannel | null = null;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (isSettingLine(t)) {
      applySettingLine(setting, t);
      continue;
    }
    if (t.startsWith('#EXTINF:')) {
      pendingName = t.split(',').pop()?.trim() ?? '频道';
      pendingLogo = extractAttr(t, 'tvg-logo');
      pendingCatchup = extractAttr(t, 'catchup');
      pendingCatchupSource = extractAttr(t, 'catchup-source');
      pendingTvgId = extractAttr(t, 'tvg-id');
      pendingTvgName = extractAttr(t, 'tvg-name');
      pendingUa = extractAttr(t, 'http-user-agent');
      const group = extractAttr(t, 'group-title');
      if (group && group !== current.name) {
        if (current.channel.length) groups.push(current);
        current = { name: group, channel: [] };
      }
      channel = {
        name: pendingName,
        urls: [],
        logo: pendingLogo || undefined,
        tvgId: pendingTvgId || undefined,
        tvgName: pendingTvgName || undefined,
        catchup: pendingCatchup || undefined,
        catchupSource: pendingCatchupSource || undefined,
        ua: pendingUa || undefined,
      };
    } else if (t.startsWith('#')) {
      continue;
    } else if (t.includes('://')) {
      const urlParts = t.split('#').map((u) => u.trim()).filter(Boolean);
      const cleaned: string[] = [];
      for (const part of urlParts) {
        const pipe = part.indexOf('|');
        if (pipe > 0) {
          mergePipeHeaders(setting.header, part.slice(pipe + 1));
          cleaned.push(part.slice(0, pipe).trim());
        } else {
          cleaned.push(part);
        }
      }
      if (!channel) {
        channel = {
          name: pendingName || cleaned[0] || t,
          urls: [],
        };
      }
      channel.urls.push(...(cleaned.length ? cleaned : [t]));
      copySettingToChannel(channel, setting);
      current.channel.push(channel);
      channel = null;
      setting = createSetting();
      pendingName = '';
      pendingLogo = '';
      pendingCatchup = '';
      pendingCatchupSource = '';
      pendingTvgId = '';
      pendingTvgName = '';
      pendingUa = '';
    }
  }
  if (current.channel.length) groups.push(current);
  return groups;
}

export function parseTxtGenre(text: string): LiveGroup[] {
  const groups: LiveGroup[] = [];
  let current: LiveGroup | null = null;
  let setting = createSetting();
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (isSettingLine(t)) {
      applySettingLine(setting, t);
      continue;
    }
    if (t.includes('#genre#')) {
      if (current) groups.push(current);
      current = {
        name: t.replace(',#genre#', '').replace('#genre#', '').trim(),
        channel: [],
      };
      setting = createSetting();
      continue;
    }
    if (!current) current = { name: '默认', channel: [] };
    const parts = t.split(',');
    if (parts.length >= 2) {
      const name = parts[0]!.trim();
      const urlField = parts.slice(1).join(',');
      const urls: string[] = [];
      const ch: LiveChannel = { name, urls };
      for (const raw of urlField.split('#').map((u) => u.trim()).filter(Boolean)) {
        const pipe = raw.indexOf('|');
        if (pipe > 0) {
          mergePipeHeaders(setting.header, raw.slice(pipe + 1));
          urls.push(raw.slice(0, pipe).trim());
        } else {
          urls.push(raw);
        }
        copySettingToChannel(ch, setting);
      }
      ch.urls = urls;
      current.channel.push(ch);
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

/**
 * 对齐 fongmi Channel.live(Live)：继承源级 header / logo 模板
 */
export function applyLiveSourceMeta(
  source: LiveSource,
  groups: LiveGroup[],
): LiveGroup[] {
  const logoTpl = (source.logo ?? '').trim();
  const sourceHeader = source.header ?? {};

  return groups.map((g) => ({
    ...g,
    channel: (g.channel ?? []).map((ch) => {
      let logo = (ch.logo ?? '').trim();
      if (logoTpl.includes('{') && !/^https?:\/\//i.test(logo)) {
        logo = logoTpl
          .replace(/\{id\}/gi, ch.tvgId ?? '')
          .replace(/\{name\}/gi, ch.tvgName || ch.name || '')
          .replace(/\{logo\}/gi, logo);
      }
      const header: Record<string, string> = {
        ...sourceHeader,
        ...(ch.header ?? {}),
      };
      if (ch.ua) header['User-Agent'] = ch.ua;
      if (ch.referer) header.Referer = ch.referer;
      if (ch.origin) header.Origin = ch.origin;
      return {
        ...ch,
        logo: logo || undefined,
        header: Object.keys(header).length ? header : undefined,
      };
    }),
  }));
}

/** 合并频道头 + 当前线路行内头；缺 UA 时补默认（对齐 PlaySpec.checkUa） */
export function buildLivePlayHeaders(
  channel: LiveChannel | undefined,
  rawUrl: string,
  sourceHeader?: Record<string, string>,
): Record<string, string> {
  const fromUrl = resolveLivePlayUrl(rawUrl).headers;
  const out: Record<string, string> = {
    ...(sourceHeader ?? {}),
    ...(channel?.header ?? {}),
    ...fromUrl,
  };
  if (channel?.ua) out['User-Agent'] = channel.ua;
  if (channel?.referer) out.Referer = channel.referer;
  if (channel?.origin) out.Origin = channel.origin;
  const hasUa = Object.keys(out).some((k) => /^user-agent$/i.test(k));
  if (!hasUa) out['User-Agent'] = DEFAULT_LIVE_UA;
  return out;
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
  let groups: LiveGroup[] = [];
  if (source.groups?.length) {
    groups = source.groups;
  } else if (source.api?.trim()) {
    const text = await fetchLiveTextViaSpider(source);
    if (text.trim()) groups = parseLiveBody(text);
  }
  if (!groups.length && source.url) {
    const body = await tvGet(source.url, {
      timeout: source.timeout ? source.timeout * 1000 : 30000,
      headers: source.header,
    });
    groups = parseLiveBody(body);
  }
  return applyLiveSourceMeta(source, groups);
}

export function flattenChannels(groups: LiveGroup[]): Array<LiveChannel & { group: string }> {
  const out: Array<LiveChannel & { group: string }> = [];
  for (const g of groups) {
    for (const c of g.channel) out.push({ ...c, group: g.name });
  }
  return out;
}
