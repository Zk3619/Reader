/**
 * 配置 rules[]：嗅探 host/regex/exclude（对齐 FongMi Sniffer.getRule）
 */

import * as VodConfig from '../config/vod-config';

export type SniffRule = {
  name?: string;
  hosts?: string[];
  regex?: string[];
  exclude?: string[];
  script?: string[];
};

function hostMatch(hosts: string[] | undefined, hostname: string): boolean {
  if (!hosts?.length) return true;
  const h = hostname.toLowerCase();
  return hosts.some((raw) => {
    const pat = raw.toLowerCase().trim();
    if (!pat || pat === '*') return true;
    if (pat.startsWith('*.')) return h.endsWith(pat.slice(1)) || h === pat.slice(2);
    return h === pat || h.endsWith(`.${pat}`);
  });
}

export function getSniffRules(): SniffRule[] {
  const raw = VodConfig.getVodConfig()?.rules;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): SniffRule | null => {
      if (!item || typeof item !== 'object') return null;
      const o = item as Record<string, unknown>;
      const rule: SniffRule = {};
      if (typeof o.name === 'string') rule.name = o.name;
      if (Array.isArray(o.hosts)) rule.hosts = o.hosts.map(String);
      if (Array.isArray(o.regex)) rule.regex = o.regex.map(String);
      if (Array.isArray(o.exclude)) rule.exclude = o.exclude.map(String);
      if (Array.isArray(o.script)) rule.script = o.script.map(String);
      return rule;
    })
    .filter((x): x is SniffRule => x != null);
}

export function findSniffRuleForUrl(pageUrl: string): SniffRule | null {
  try {
    const host = new URL(pageUrl).hostname;
    for (const rule of getSniffRules()) {
      if (hostMatch(rule.hosts, host)) return rule;
    }
  } catch {
    /* */
  }
  return null;
}

const DEFAULT_MEDIA_RE =
  /https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|flv|mkv|ts|mpd)[^\s"'<>]*/gi;

/** 用 rules.regex / exclude 从文本里抽媒体 URL */
export function extractMediaUrlsByRule(text: string, rule: SniffRule | null): string[] {
  const out: string[] = [];
  const patterns =
    rule?.regex?.length && rule.regex.some((r) => r.trim())
      ? rule.regex
          .map((r) => {
            try {
              return new RegExp(r, 'gi');
            } catch {
              return null;
            }
          })
          .filter((x): x is RegExp => !!x)
      : [DEFAULT_MEDIA_RE];

  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const url = m[0];
      if (!url) continue;
      if (isExcluded(url, rule?.exclude)) continue;
      out.push(url);
    }
  }
  return [...new Set(out)];
}

function isExcluded(url: string, exclude?: string[]): boolean {
  if (!exclude?.length) return false;
  return exclude.some((ex) => {
    try {
      return new RegExp(ex, 'i').test(url);
    } catch {
      return url.includes(ex);
    }
  });
}

/** 配置 headers[]：按 host 注入请求头 */
export function headersForUrl(url: string): Record<string, string> {
  const list = VodConfig.getVodConfig()?.headers;
  if (!Array.isArray(list) || !list.length) return {};
  try {
    const host = new URL(url).hostname.toLowerCase();
    const out: Record<string, string> = {};
    for (const item of list) {
      if (!item?.host || !item.header) continue;
      const h = String(item.host).toLowerCase();
      if (h === '*' || host === h || host.endsWith(`.${h}`)) {
        Object.assign(out, item.header);
      }
    }
    return out;
  } catch {
    return {};
  }
}
