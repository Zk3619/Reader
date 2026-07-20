/**
 * SiteApi — 对齐 FongMi SiteApi
 */

import * as VodConfig from './config/vod-config';
import { pickEngine, initJarBackend } from './spider/facade';
import { jarEngine } from './spider/jar-engine';
import {
  resolveProxyBaseUrl,
  rewriteProxyUrl,
  fixLocalProxyUrl,
  wrapMediaThroughProxy,
  appendProxyHeaders,
} from './proxy/client';
import { ensureTvProxyBridge } from './proxy/bridge';
import { runParseJob } from './parse/parse-job';
import { extractPlayUrl } from './play/extractors';
import type { Result, Site, Vod } from './types';
import { jsEngine } from './spider/js-engine';

const JAR_INIT_TIMEOUT_MS = 25_000;
/** 冷启动含 JAR 下载 / dex2jar，需长于热路径 */
const HOME_SPIDER_TIMEOUT_MS = 60_000;

let jarInited = false;
/** 并发调用共用同一次初始化，避免重复拉起代理桥 / JAR */
let jarInitPromise: Promise<void> | null = null;

async function startJarHost(): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke<string>('tv_start_jar_host');
  } catch (e) {
    console.warn('[tv] tv_start_jar_host', e);
  }
}

async function prefetchJar(jar: string): Promise<void> {
  if (!jar.trim()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke<string>('tv_jar_prefetch', { jar });
  } catch (e) {
    console.warn('[tv] tv_jar_prefetch', e);
  }
}

/**
 * 初始化影视引擎（代理桥 + JAR 探测）。
 * 超时后立即放行：不再二次 await（挂起的 invoke 可能堵住 IPC，重试会卡死整页）。
 */
async function ensureJar(): Promise<void> {
  if (jarInited) return;
  if (jarInitPromise) return jarInitPromise;

  jarInitPromise = (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          await ensureTvProxyBridge();
          await initJarBackend();
          await startJarHost();
        })(),
        new Promise<void>((_, reject) => {
          timer = setTimeout(() => reject(new Error('初始化影视引擎超时')), JAR_INIT_TIMEOUT_MS);
        }),
      ]);
    } catch (e) {
      console.warn('[tv] ensureJar', e);
      // 保持 jarUnavailableEngine；后续站点调用会得到明确错误，不阻塞首页
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      jarInited = true;
      jarInitPromise = null;
    }
  })();

  return jarInitPromise;
}

/**
 * Hub 引导后预热：代理桥 + JVM + 首页站点 JAR（下载/dex2jar 与 homeContent 解耦）。
 */
export async function warmupTvSpiderEngines(site?: Site): Promise<void> {
  await ensureJar();
  const s = site ?? VodConfig.getHomeSite();
  if (s?.jar && jarEngine.supports(s)) {
    await prefetchJar(s.jar);
  }
}

function attachSite(site: Site, result: Result): Result {
  const list = (result.list ?? []).map((v) => ({
    ...v,
    siteKey: site.key,
    siteName: site.name,
  }));
  return { ...result, list };
}

function looksLikeDirectMedia(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes('.m3u8') ||
    u.includes('.mp4') ||
    u.includes('.flv') ||
    u.includes('.mkv') ||
    u.startsWith('magnet:') ||
    u.includes('video/') ||
    u.includes('mpvideo.qpic') ||
    u.includes('bilivideo') ||
    /[?&](?:type|format)=m3u8\b/i.test(u)
  );
}

async function raceTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} 超时（${Math.round(ms / 1000)}s）`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function homeContent(site?: Site): Promise<Result> {
  await ensureJar();
  const s = site ?? VodConfig.getHomeSite();
  if (!s) return { list: [], class: [], msg: '未加载配置或无可用来源' };
  const engine = pickEngine(s);
  const home = await raceTimeout(
    engine.homeContent(s, true),
    HOME_SPIDER_TIMEOUT_MS,
    `站点「${s.name}」homeContent`,
  );
  try {
    const video = await raceTimeout(
      engine.homeVideoContent(s),
      15_000,
      `站点「${s.name}」homeVideoContent`,
    );
    if (video.list?.length) home.list = video.list;
  } catch {
    /* optional：推荐视频失败不影响分类 */
  }
  if (s.categories?.length && home.class) {
    home.class = home.class.filter((c) => s.categories!.includes(c.type_name));
  }
  // JAR 未就绪时 jarUnavailableEngine 会返回 msg，透传给 UI
  if (!home.list?.length && !home.class?.length && home.msg) {
    return attachSite(s, home);
  }
  return attachSite(s, home);
}

export async function categoryContent(
  key: string,
  tid: string,
  page: string,
  filter: boolean,
  extend: Record<string, string>,
): Promise<Result> {
  await ensureJar();
  const site = VodConfig.getSite(key);
  if (!site) throw new Error(`站点不存在: ${key}`);
  const engine = pickEngine(site);
  return attachSite(
    site,
    await engine.categoryContent(site, { tid, pg: page, filter, extend }),
  );
}

export async function detailContent(key: string, id: string): Promise<Result> {
  await ensureJar();
  const site = VodConfig.getSite(key);
  if (!site) throw new Error(`站点不存在: ${key}`);
  const engine = pickEngine(site);
  return attachSite(site, await engine.detailContent(site, [id]));
}

export async function searchContent(
  key: string,
  keyword: string,
  quick = false,
  page = '1',
): Promise<Result> {
  await ensureJar();
  const site = VodConfig.getSite(key);
  if (!site || site.searchable === 0) return { list: [] };
  const engine = pickEngine(site);
  return attachSite(
    site,
    await engine.searchContent(site, { key: keyword, quick, pg: page }),
  );
}

/** 多站并行搜索 */
export async function searchAll(
  keyword: string,
  quick = false,
  onHit?: (site: Site, list: Vod[]) => void,
): Promise<Vod[]> {
  await ensureJar();
  const sites = VodConfig.getSites().filter((s) => s.searchable !== 0);
  const merged: Vod[] = [];
  await Promise.all(
    sites.map(async (site) => {
      try {
        const r = await searchContent(site.key, keyword, quick, '1');
        const list = r.list ?? [];
        if (list.length) onHit?.(site, list);
        merged.push(...list);
      } catch (e) {
        console.warn('[tv-search]', site.key, e);
      }
    }),
  );
  return merged;
}

export async function playerContent(
  key: string,
  flag: string,
  id: string,
): Promise<Result> {
  await ensureJar();
  const site = VodConfig.getSite(key);
  if (!site) throw new Error(`站点不存在: ${key}`);

  // push_agent：推送播放地址
  if (site.key === 'push_agent' || site.api === 'push_agent' || flag === 'push') {
    const extracted = await extractPlayUrl(id);
    return { url: extracted.url, parse: 0, header: extracted.header, danmaku: VodConfig.getDanmaku() };
  }

  const engine = pickEngine(site);
  let result = await engine.playerContent(site, {
    flag,
    id,
    vipFlags: VodConfig.getFlags(),
  });

  const proxyBase = await resolveProxyBaseUrl();
  const normalizeUrl = (u: string) => {
    let out = rewriteProxyUrl(u, proxyBase);
    out = fixLocalProxyUrl(out, proxyBase);
    if (site.playUrl && !out.startsWith('http') && !out.startsWith('proxy://')) {
      out = site.playUrl + out;
    }
    return out;
  };
  const finalizePlayUrl = (u: string) => {
    const n = normalizeUrl(u);
    if (/^https?:\/\//i.test(n) && !n.includes('/proxy?')) {
      return wrapMediaThroughProxy(n, proxyBase, result.header);
    }
    return appendProxyHeaders(n, result.header);
  };

  if (typeof result.url === 'string') {
    result = { ...result, url: normalizeUrl(result.url) };
  } else if (Array.isArray(result.url)) {
    result = { ...result, url: result.url.map(normalizeUrl) };
  }

  // 抽取器：对非直链再尝试
  const playUrl0 = Array.isArray(result.url) ? result.url[0] : result.url;
  if (playUrl0 && looksLikeDirectMedia(String(playUrl0))) {
    result = { ...result, parse: 0, jx: 0 };
  } else if (playUrl0 && !looksLikeDirectMedia(String(playUrl0)) && result.parse !== 1) {
    try {
      const extracted = await extractPlayUrl(String(playUrl0));
      if (extracted.url && extracted.url !== playUrl0) {
        result = {
          ...result,
          url: normalizeUrl(extracted.url),
          header: { ...(result.header ?? {}), ...(extracted.header ?? {}) },
          parse: 0,
        };
      }
    } catch {
      /* */
    }
  }

  const needParse =
    (result.parse === 1 || result.jx === 1) &&
    (() => {
      const u = Array.isArray(result.url) ? result.url[0] : result.url;
      return !!u && !looksLikeDirectMedia(String(u));
    })();
  if (needParse) {
    const playUrl = Array.isArray(result.url) ? result.url[0] : result.url;
    if (playUrl) {
      const parsed = await runParseJob(String(playUrl), flag, result.header);
      const anyOk = parsed.parseAttempts?.some((a) => a.ok) ?? false;
      let nextUrl = parsed.url ?? result.url;
      if (typeof nextUrl === 'string') nextUrl = normalizeUrl(nextUrl);
      else if (Array.isArray(nextUrl)) nextUrl = nextUrl.map((u) => normalizeUrl(String(u)));
      result = {
        ...result,
        ...parsed,
        url: nextUrl,
        parse: anyOk ? 0 : 1,
        msg: anyOk ? undefined : parsed.msg || result.msg,
      };
    }
  }

  // 最终播放地址再套 CORS 代理（抽取/解析完成之后）
  if (typeof result.url === 'string') {
    result = { ...result, url: finalizePlayUrl(result.url) };
  } else if (Array.isArray(result.url)) {
    result = { ...result, url: result.url.map((u) => finalizePlayUrl(String(u))) };
  }

  {
    const finalUrl = Array.isArray(result.url) ? result.url[0] : result.url;
    if (finalUrl) {
      const { logTvPlayRequest } = await import('./play/play-debug');
      logTvPlayRequest('playerContent', String(finalUrl), result.header);
    }
  }

  if (!result.danmaku && VodConfig.getDanmaku()) {
    result = { ...result, danmaku: VodConfig.getDanmaku() };
  }
  if (typeof result.danmaku === 'string') {
    result = { ...result, danmaku: fixLocalProxyUrl(result.danmaku, proxyBase) };
  } else if (Array.isArray(result.danmaku)) {
    result = {
      ...result,
      danmaku: result.danmaku.map((d) =>
        typeof d === 'string'
          ? fixLocalProxyUrl(d, proxyBase)
          : d && typeof d === 'object' && 'url' in d && typeof (d as { url?: string }).url === 'string'
            ? { ...d, url: fixLocalProxyUrl((d as { url: string }).url, proxyBase) }
            : d,
      ) as Result['danmaku'],
    };
  }

  return result;
}

/** 换源：在其它 changeable 站点上按同名搜索后取第一条详情播放 */
export async function playWithAlternateSite(
  currentSiteKey: string,
  vodName: string,
  flag: string,
  episodeUrl: string,
): Promise<Result> {
  await ensureJar();
  const candidates = VodConfig.getSites().filter(
    (s) => s.key !== currentSiteKey && s.changeable !== 0 && s.searchable !== 0,
  );
  for (const site of candidates) {
    try {
      const r = await searchContent(site.key, vodName, true, '1');
      const hit = (r.list ?? []).find((v) => v.vod_name === vodName) ?? r.list?.[0];
      if (!hit) continue;
      const detail = await detailContent(site.key, hit.vod_id);
      const vod = detail.list?.[0];
      if (!vod) continue;
      // 尝试同 flag 播放；失败则用原 episodeUrl 当 id
      try {
        return await playerContent(site.key, flag, episodeUrl);
      } catch {
        return await playerContent(site.key, flag, hit.vod_id);
      }
    } catch (e) {
      console.warn('[tv-switch]', site.key, e);
    }
  }
  throw new Error('无可用换源站点');
}

/** Spider action（对齐 FongMi SiteApi.action：Toast msg / 可选打开 url） */
export async function siteAction(
  key: string,
  action: string,
  value = '',
): Promise<Result> {
  await ensureJar();
  const site = VodConfig.getSite(key);
  if (!site) throw new Error(`站点不存在: ${key}`);

  // FongMi type=4：直接请求 action 字符串为 URL
  if (site.type === 4) {
    try {
      const res = await fetch(action);
      const text = await res.text();
      return text.trim().startsWith('{')
        ? (JSON.parse(text) as Result)
        : { msg: text };
    } catch (e) {
      return { msg: e instanceof Error ? e.message : String(e) };
    }
  }

  if (jsEngine.supports(site) && jsEngine.action) {
    return jsEngine.action(site, action, value);
  }

  const { pyEngine } = await import('./spider/py-engine');
  if (pyEngine.supports(site) && pyEngine.action) {
    return pyEngine.action(site, action, value);
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const ext =
      typeof site.ext === 'string'
        ? site.ext
        : site.ext == null
          ? ''
          : JSON.stringify(site.ext);
    const raw = await invoke<string>('tv_jar_invoke', {
      siteKey: site.key,
      api: site.api,
      ext,
      jar: site.jar ?? '',
      method: 'action',
      // FongMi JAR Spider.action(String) 只收一个参数
      argsJson: JSON.stringify([action]),
    });
    return typeof raw === 'string' && raw.startsWith('{')
      ? (JSON.parse(raw) as Result)
      : { msg: raw };
  } catch (e) {
    return { msg: e instanceof Error ? e.message : String(e) };
  }
}
