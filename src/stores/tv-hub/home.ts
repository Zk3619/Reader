/**
 * 影视首页 / 配置 store
 */

import { createStore } from 'solid-js/store';
import * as SiteApi from '@/lib/media/tv/site-api';
import * as VodConfig from '@/lib/media/tv/config/vod-config';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import type { Result, Site, Vod, VodClass, Filter, FilterValue } from '@/lib/media/tv/types';
import { getJarEngineKind } from '@/lib/media/tv/spider/jar-engine';
import { getPyEngineDetail, probePyBackend } from '@/lib/media/tv/spider/py-engine';
import type { JarEngineKind, PyEngineKind } from '@/lib/media/tv/types';

/** 首页 Spider 调用超时（JAR 下载/初始化可能较慢，但不可无限挂起） */
const HOME_CONTENT_TIMEOUT_MS = 35_000;

function isFilterValue(x: unknown): x is FilterValue {
  return !!x && typeof x === 'object' && 'n' in x && 'v' in x;
}

function isFilter(x: unknown): x is Filter {
  return !!x && typeof x === 'object' && 'value' in x;
}

function normalizeFilters(
  raw?: Result['filters'] | Record<string, FilterValue[] | Filter[]>,
): Record<string, FilterValue[]> {
  if (!raw) return {};
  const out: Record<string, FilterValue[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!Array.isArray(v) || !v.length) continue;
    const first = v[0];
    if (isFilterValue(first)) {
      out[k] = v.filter(isFilterValue);
    } else if (isFilter(first)) {
      out[k] = v.filter(isFilter).flatMap((f) => f.value ?? []);
    }
  }
  return out;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
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

const [homeState, setHomeState] = createStore({
  loading: false,
  error: '' as string,
  notice: '' as string,
  classes: [] as VodClass[],
  list: [] as Vod[],
  sites: [] as Site[],
  siteKey: '' as string,
  tid: '' as string,
  page: 1,
  pagecount: 1,
  configUrl: '' as string,
  jarKind: 'unavailable' as JarEngineKind,
  pyKind: 'unavailable' as PyEngineKind,
  pyDetail: '' as string,
  filters: {} as Record<string, FilterValue[]>,
  extend: {} as Record<string, string>,
  /** 防止空列表 + createEffect 重复拉取 */
  homeLoaded: false,
});

let homeLoadSeq = 0;

function applyConfigToHomeState(configUrl: string): Site[] {
  const sites = VodConfig.getSites();
  const home = VodConfig.getHomeSite();
  setHomeState({
    configUrl,
    sites,
    siteKey: home?.key ?? '',
    notice: VodConfig.getVodConfig()?.notice ?? '',
    list: [],
    classes: [],
    filters: {},
    extend: {},
    tid: '',
    page: 1,
    pagecount: 1,
    error: '',
    homeLoaded: false,
  });
  return sites;
}

export function getTvHomeState() {
  return homeState;
}

export async function refreshJarKind(): Promise<void> {
  const kind = await getJarEngineKind();
  setHomeState('jarKind', kind);
}

export async function refreshPyKind(force = false): Promise<void> {
  const { kind, detail } = await probePyBackend(force);
  setHomeState({
    pyKind: kind,
    pyDetail: detail || getPyEngineDetail(),
  });
}

export async function bootstrapTvConfig(): Promise<void> {
  await refreshJarKind();
  void refreshPyKind(false);
  const latest = await TvDao.getLatestTvConfig();
  if (latest?.json) {
    try {
      VodConfig.loadVodConfigFromText(latest.json, latest.url || latest.name);
      applyConfigToHomeState(latest.url || latest.name);
      await loadHome();
      return;
    } catch (e) {
      console.warn('[tv] restore config failed', e);
    }
  }
}

export async function importTvConfigUrl(url: string): Promise<void> {
  setHomeState({ loading: true, error: '', homeLoaded: false });
  try {
    const cfg = await VodConfig.loadVodConfigFromUrl(url);
    await TvDao.upsertTvConfig({
      url,
      name: url,
      type: 0,
      json: JSON.stringify(cfg),
      updatedAt: Date.now(),
    });
    applyConfigToHomeState(url);
    await loadHome();
  } catch (e) {
    setHomeState({
      error: e instanceof Error ? e.message : String(e),
      loading: false,
      homeLoaded: true,
    });
  }
}

export async function importTvConfigText(text: string, name = 'pasted'): Promise<void> {
  setHomeState({ loading: true, error: '', homeLoaded: false });
  try {
    const cfg = VodConfig.loadVodConfigFromText(text, name);
    await TvDao.upsertTvConfig({
      url: name,
      name,
      type: 0,
      json: JSON.stringify(cfg),
      updatedAt: Date.now(),
    });
    applyConfigToHomeState(name);
    await loadHome();
  } catch (e) {
    setHomeState({
      error: e instanceof Error ? e.message : String(e),
      loading: false,
      homeLoaded: true,
    });
  }
}

export async function loadHome(siteKey?: string): Promise<void> {
  const seq = ++homeLoadSeq;
  const sites = VodConfig.getSites();
  const key = siteKey || homeState.siteKey || VodConfig.getHomeSite()?.key || '';
  if (key) VodConfig.setHomeSiteKey(key);
  const site = VodConfig.getSite(key) ?? VodConfig.getHomeSite();

  // 先刷站点栏，避免 JAR home 挂起时整页只剩「加载中」
  setHomeState({
    loading: true,
    error: '',
    sites,
    siteKey: site?.key ?? '',
    homeLoaded: false,
  });

  try {
    const result: Result = await withTimeout(
      SiteApi.homeContent(site),
      HOME_CONTENT_TIMEOUT_MS,
      site ? `站点「${site.name}」首页` : '首页',
    );
    if (seq !== homeLoadSeq) return;
    const list = result.list ?? [];
    const softMsg = (result.msg ?? '').trim();
    setHomeState({
      sites,
      siteKey: site?.key ?? '',
      classes: result.class ?? [],
      list,
      tid: result.class?.[0]?.type_id ?? '',
      page: 1,
      pagecount: result.pagecount ?? 1,
      notice: VodConfig.getVodConfig()?.notice ?? '',
      filters: normalizeFilters(result.filters),
      extend: {},
      loading: false,
      homeLoaded: true,
      error: !list.length && softMsg ? softMsg : '',
    });
  } catch (e) {
    if (seq !== homeLoadSeq) return;
    setHomeState({
      loading: false,
      homeLoaded: true,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function loadCategory(tid: string, page = 1): Promise<void> {
  const key = homeState.siteKey;
  if (!key) return;
  setHomeState({ loading: true, error: '', tid, page });
  try {
    const result = await SiteApi.categoryContent(
      key,
      tid,
      String(page),
      true,
      { ...homeState.extend },
    );
    const nf = normalizeFilters(result.filters);
    setHomeState({
      list: result.list ?? [],
      pagecount: result.pagecount ?? page,
      filters: Object.keys(nf).length ? nf : homeState.filters,
      loading: false,
    });
  } catch (e) {
    setHomeState({
      loading: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export function setFilterValue(filterKey: string, value: string): void {
  const next = { ...homeState.extend };
  if (!value) delete next[filterKey];
  else next[filterKey] = value;
  setHomeState('extend', next);
  void loadCategory(homeState.tid || homeState.classes[0]?.type_id || '', 1);
}

export function switchSite(siteKey: string): void {
  void loadHome(siteKey);
}
