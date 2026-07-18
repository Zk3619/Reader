/**
 * type 0 / 1 / 4 HTTP 站点引擎（对齐 SiteApi 非 Spider 分支）
 */

import { tvGet, tvRequest } from '../net/rules';
import type { Result, Site, Vod } from '../types';
import type {
  CategoryArgs,
  PlayerArgs,
  SearchArgs,
  SpiderEngine,
} from './types';
import { emptyResult, parseResultJson } from './types';

function siteHeaders(site: Site): Record<string, string> {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ...(site.header ?? {}),
  };
}

function buildUrl(base: string, params: Record<string, string>): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') u.searchParams.set(k, v);
  }
  return u.toString();
}

/** type 0 XML 极简提取（列表项） */
function parseXmlList(xml: string): Result {
  const list: Vod[] = [];
  const videoRe = /<video>([\s\S]*?)<\/video>/gi;
  let m: RegExpExecArray | null;
  while ((m = videoRe.exec(xml))) {
    const block = m[1] ?? '';
    const pick = (tag: string) => {
      const r = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
      return r.exec(block)?.[1]?.trim() ?? '';
    };
    const id = pick('id') || pick('vod_id');
    const name = pick('name') || pick('vod_name');
    if (!id && !name) continue;
    list.push({
      vod_id: id || name,
      vod_name: name || id,
      vod_pic: pick('pic') || pick('vod_pic'),
      vod_remarks: pick('note') || pick('vod_remarks'),
      type_name: pick('type') || pick('type_name'),
      vod_play_from: pick('dl') ? undefined : undefined,
      vod_play_url: undefined,
      vod_year: pick('year'),
      vod_area: pick('area'),
      vod_director: pick('director'),
      vod_actor: pick('actor'),
      vod_content: pick('des') || pick('content'),
    });
  }
  // classes
  const classList: Result['class'] = [];
  const classRe = /<ty(?:\s[^>]*)?id="([^"]+)"[^>]*>([^<]+)<\/ty>/gi;
  let c: RegExpExecArray | null;
  while ((c = classRe.exec(xml))) {
    classList.push({ type_id: c[1]!, type_name: c[2]!.trim() });
  }
  return { list, class: classList };
}

function fromType(type: number, body: string): Result {
  if (type === 0) return parseXmlList(body);
  return parseResultJson(body);
}

async function callSite(
  site: Site,
  params: Record<string, string>,
): Promise<string> {
  const headers = siteHeaders(site);
  const ext = site.ext ?? '';
  const q = { ...params };
  if (ext && ext.length <= 1000) q.extend = ext;
  if (site.type === 4 && ext) {
    try {
      q.ext = btoa(unescape(encodeURIComponent(ext)));
    } catch {
      q.ext = ext;
    }
  }
  const url = buildUrl(site.api, q);
  const res = await tvRequest(url, {
    method: 'GET',
    headers,
    timeout: (site.timeout ?? 15) * 1000,
  });
  return res.text();
}

export const httpEngine: SpiderEngine = {
  kind: 'http',
  supports(site) {
    return site.type === 0 || site.type === 1 || site.type === 4;
  },
  async homeContent(site, filter) {
    if (site.type === 4) {
      const body = await callSite(site, { filter: filter ? 'true' : 'false' });
      return parseResultJson(body);
    }
    const body = await tvGet(site.api, {
      headers: siteHeaders(site),
      timeout: (site.timeout ?? 15) * 1000,
    });
    return fromType(site.type, body);
  },
  async homeVideoContent() {
    return emptyResult();
  },
  async categoryContent(site, args: CategoryArgs) {
    const params: Record<string, string> = {
      ac: site.type === 0 ? 'videolist' : 'detail',
      t: args.tid,
      pg: args.pg,
    };
    if (site.type === 1 && Object.keys(args.extend).length) {
      params.f = JSON.stringify(args.extend);
    }
    const body = await callSite(site, params);
    return fromType(site.type, body);
  },
  async detailContent(site, ids) {
    const id = ids[0] ?? '';
    if (site.type === 4) {
      const body = await callSite(site, { ids: id });
      return parseResultJson(body);
    }
    const params: Record<string, string> = {
      ac: site.type === 0 ? 'videolist' : 'detail',
      ids: id,
    };
    const body = await callSite(site, params);
    return fromType(site.type, body);
  },
  async searchContent(site, args: SearchArgs) {
    const params: Record<string, string> = {
      wd: args.key,
      pg: args.pg ?? '1',
    };
    if (site.type !== 0) params.ac = 'detail';
    const body = await callSite(site, params);
    return fromType(site.type, body);
  },
  async playerContent(site, args: PlayerArgs) {
    if (site.type === 4) {
      const body = await callSite(site, {
        play: args.id,
        flag: args.flag,
      });
      return parseResultJson(body);
    }
    // type 0/1 通常直链在 detail 的 play url 中；此处返回待解析 id
    return {
      url: args.id,
      parse: 1,
      flag: args.flag,
    };
  },
};
