/**
 * 影视首页 / 配置 store
 */

import { createStore } from 'solid-js/store';
import * as SiteApi from '@/lib/media/tv/site-api';
import * as VodConfig from '@/lib/media/tv/config/vod-config';
import * as LiveConfig from '@/lib/media/tv/config/live-config';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import type { Result, Vod, VodClass, Filter, FilterValue } from '@/lib/media/tv/types';
import { resolveConfigAssetUrl } from '@/lib/media/tv/config/decoder';
import { getJarEngineKind } from '@/lib/media/tv/spider/jar-engine';
import { getPyEngineDetail, probePyBackend } from '@/lib/media/tv/spider/py-engine';
import type { JarEngineKind, PyEngineKind } from '@/lib/media/tv/types';
import {
  getTvHomeSiteLastTid,
  getTvHomeUi,
  setTvHomeSiteLastTid,
} from '@/stores/tv-hub/tv-home-ui';
import {
  normalizeTvPageCount,
  tvCategoryHasNextPage,
} from '@/lib/media/tv/tv-pagecount';
import {
  TV_CONFIG_TYPE_VOD,
} from '@/lib/media/tv/config/tv-config-kind';
import {
  deriveTvConfigDisplayName,
  type IdentifiedTvConfig,
} from '@/lib/media/tv/config/tv-config-import-identify';
import type { VodConfigJson } from '@/lib/media/tv/types';
import { reportTvError, reportTvResultMsg } from '@/lib/media/tv/tv-user-error';
import {
  getTvActiveSources,
  setTvActiveLiveUrl,
  setTvActiveVodUrl,
} from '@/lib/media/tv/config/tv-active-sources';

/** 首页 Spider 调用超时（JAR 冷启动已在 warmup 中完成，此处主要等 Spider 网络） */
const HOME_CONTENT_TIMEOUT_MS = 75_000;

/**
 * 对齐 TV-fongmi TypeAdapter：homeVideoContent 推荐流的虚拟分类 id。
 * 真实分类列表走 categoryContent（每页通常远多于推荐条数）。
 */
export const TV_HOME_RECOMMEND_TID = 'home';

/** 工具栏用轻量站点项（勿把完整 Site 深代理进 store，配置站点数多时会炸栈） */
export interface TvHomeSiteOption {
  key: string;
  name: string;
}

function toSiteOptions(): TvHomeSiteOption[] {
  return VodConfig.getSites().map((s) => ({ key: s.key, name: s.name }));
}

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
  /** CONFIG 顶层 logo（已 resolve 的绝对 URL，空=无） */
  logoUrl: '' as string,
  classes: [] as VodClass[],
  list: [] as Vod[],
  /** homeVideoContent 推荐流（选择「推荐」时展示；默认进站用首个真实分类） */
  recommendList: [] as Vod[],
  sites: [] as TvHomeSiteOption[],
  siteKey: '' as string,
  tid: '' as string,
  page: 1,
  pagecount: 1,
  /** 滚动追加中 */
  loadingMore: false,
  /** 是否还有下一页（滚动/分页共用） */
  hasMore: false,
  configUrl: '' as string,
  jarKind: 'unavailable' as JarEngineKind,
  pyKind: 'unavailable' as PyEngineKind,
  pyDetail: '' as string,
  filters: {} as Record<string, FilterValue[]>,
  extend: {} as Record<string, string>,
  /** 防止空列表 + createEffect 重复拉取 */
  homeLoaded: false,
  /**
   * Hub 正在等 DB / 恢复配置（框架已挂载，列表区显示骨架）。
   * 与 loading（Spider 请求中）区分。
   */
  preparing: false,
  /** 配置变更序号：Live / Settings 订阅后重载 */
  configRevision: 0,
  /** 当前配置摘要（导入后即时可见） */
  siteCount: 0,
  liveCount: 0,
  liveNote: '' as string,
  /** 独立直播配置 URL（可与影视不同） */
  liveConfigUrl: '' as string,
  liveSyncedFromVod: false,
});

/**
 * 分类列表：真实分类在前，「推荐」置末（有 homeVideo 时）。
 * 避免推荐插在首位时，默认进真实分类却显示成「选中第二项」。
 */
function buildHomeClasses(siteClasses: VodClass[], recommendCount: number): VodClass[] {
  const classes = [...siteClasses];
  if (
    recommendCount > 0 &&
    !classes.some((c) => c.type_id === TV_HOME_RECOMMEND_TID)
  ) {
    classes.push({ type_id: TV_HOME_RECOMMEND_TID, type_name: '推荐' });
  }
  return classes;
}

/** 进站默认分类：优先恢复该源上次选择；否则跳过「猜你喜欢」等需历史的占位类 */
function resolveDefaultTid(
  siteKey: string,
  siteClasses: VodClass[],
  classes: VodClass[],
): string {
  const remembered = getTvHomeSiteLastTid(siteKey);
  if (remembered && classes.some((c) => c.type_id === remembered)) {
    return remembered;
  }
  const skipDefault = new Set(['guess_you_like']);
  const preferred =
    siteClasses.find((c) => c.type_id && !skipDefault.has(c.type_id)) ??
    classes.find(
      (c) =>
        c.type_id &&
        c.type_id !== TV_HOME_RECOMMEND_TID &&
        !skipDefault.has(c.type_id),
    );
  return preferred?.type_id ?? siteClasses[0]?.type_id ?? classes[0]?.type_id ?? '';
}

function rememberSiteTid(siteKey: string, tid: string): void {
  if (!siteKey || !tid) return;
  setTvHomeSiteLastTid(siteKey, tid);
}

let homeLoadSeq = 0;

function applyConfigToHomeState(configUrl: string): void {
  const sites = toSiteOptions();
  const home = VodConfig.getHomeSite();
  const cfg = VodConfig.getVodConfig();
  const rawLogo = (cfg?.logo ?? '').trim();
  const logoUrl = rawLogo
    ? resolveConfigAssetUrl(rawLogo, VodConfig.getConfigUrl() || configUrl)
    : '';
  // 直播文案 / 条数只看 LiveConfig，勿回退到 Vod 的 lives 提示——
  // 否则「影视用 A、直播用 B」时会把 A 的占位 lives 警告贴到 B 上。
  setHomeState({
    configUrl,
    sites,
    siteKey: home?.key ?? '',
    notice: cfg?.notice ?? '',
    logoUrl,
    list: [],
    recommendList: [],
    classes: [],
    filters: {},
    extend: {},
    tid: '',
    page: 1,
    pagecount: 1,
    loadingMore: false,
    hasMore: false,
    error: '',
    homeLoaded: false,
    siteCount: sites.length,
    liveCount: LiveConfig.getLiveSources().length,
    liveNote: LiveConfig.getLiveConfigNote(),
    liveConfigUrl: LiveConfig.getLiveConfigUrl(),
    liveSyncedFromVod: LiveConfig.isLiveSyncedFromVod(),
    configRevision: homeState.configRevision + 1,
  });
  void import('@/stores/tv-hub/detail').then((m) => m.clearTvDetailCache());
}

function bumpLiveStateOnly(): void {
  setHomeState({
    liveCount: LiveConfig.getLiveSources().length,
    liveNote: LiveConfig.getLiveConfigNote(),
    liveConfigUrl: LiveConfig.getLiveConfigUrl(),
    liveSyncedFromVod: LiveConfig.isLiveSyncedFromVod(),
    configRevision: homeState.configRevision + 1,
  });
}

async function maybeSyncLiveFromVod(
  cfg: VodConfigJson,
  vodUrl: string,
): Promise<void> {
  const synced = await LiveConfig.syncLivesFromVodConfig(cfg, vodUrl);
  if (!synced) return;
  setTvActiveLiveUrl(vodUrl);
}

async function resolveLibraryRow(url: string): Promise<Awaited<
  ReturnType<typeof TvDao.findTvConfigLibraryByUrl>
>> {
  if (!url) return null;
  return TvDao.findTvConfigLibraryByUrl(url);
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

let homeWarmupTimer: ReturnType<typeof setTimeout> | undefined;
let homeWarmupIdle: number | undefined;

/**
 * 对齐 TV-fongmi BaseConfig.load → Task.submit：
 * 配置恢复后，首页 Spider / JAR 探测放到空闲任务，不堵挂载与开屏。
 */
function scheduleTvHomeWarmup(): void {
  if (homeWarmupTimer !== undefined) {
    clearTimeout(homeWarmupTimer);
    homeWarmupTimer = undefined;
  }
  if (homeWarmupIdle !== undefined && typeof cancelIdleCallback === 'function') {
    cancelIdleCallback(homeWarmupIdle);
    homeWarmupIdle = undefined;
  }

  const run = async () => {
    homeWarmupTimer = undefined;
    homeWarmupIdle = undefined;
    void refreshJarKind().catch((e) => console.warn('[tv] refreshJarKind', e));
    void refreshPyKind(false).catch((e) => console.warn('[tv] refreshPyKind', e));
    if (homeState.configUrl && !homeState.homeLoaded && !homeState.loading) {
      try {
        await SiteApi.warmupTvSpiderEngines();
      } catch (e) {
        console.warn('[tv] warmupTvSpiderEngines', e);
      }
      void loadHome();
    }
  };

  if (typeof requestIdleCallback === 'function') {
    homeWarmupIdle = requestIdleCallback(() => run(), { timeout: 2500 });
  } else {
    homeWarmupTimer = setTimeout(run, 0);
  }
}

/**
 * 标记 Hub 开始引导（等 DB）。框架可先渲染，列表走骨架屏。
 */
export function beginTvHubPrepare(): void {
  setHomeState({ preparing: true, error: '' });
}

export function endTvHubPrepare(): void {
  setHomeState('preparing', false);
}

/**
 * 仅恢复 Vod 配置到内存（需 DB 已就绪）。
 * 不在此处探测 JAR / 拉首页，避免开屏或 Hub 挂载被引擎初始化堵住。
 */
export async function bootstrapTvConfig(): Promise<void> {
  setHomeState('preparing', true);
  try {
    const active = getTvActiveSources();
    const library = await TvDao.listTvConfigLibrary();
    const enabledLib = library.filter((r) => r.enabled);
    const fallbackLib = enabledLib.length ? enabledLib : library;
    const vodRow =
      (active.vodUrl
        ? library.find((r) => r.url === active.vodUrl)
        : undefined) ?? fallbackLib[0];

    if (!vodRow?.json) {
      setHomeState({ preparing: false, homeLoaded: true });
      const liveRow =
        (active.liveUrl
          ? library.find((r) => r.url === active.liveUrl)
          : undefined) ?? null;
      if (liveRow?.json) {
        await LiveConfig.loadLiveConfigFromText(
          liveRow.json,
          liveRow.url || liveRow.name,
        );
        setTvActiveLiveUrl(liveRow.url);
        bumpLiveStateOnly();
      }
      return;
    }
    try {
      const cfg = await VodConfig.loadVodConfigFromText(
        vodRow.json,
        vodRow.url || vodRow.name,
      );
      setTvActiveVodUrl(vodRow.url);

      const liveRow =
        (active.liveUrl
          ? library.find((r) => r.url === active.liveUrl)
          : undefined) ?? null;
      if (liveRow?.json && liveRow.url !== vodRow.url) {
        await LiveConfig.loadLiveConfigFromText(
          liveRow.json,
          liveRow.url || liveRow.name,
        );
        setTvActiveLiveUrl(liveRow.url);
      } else if (liveRow?.json && liveRow.url === vodRow.url) {
        await LiveConfig.loadLiveConfigFromText(
          liveRow.json,
          liveRow.url || liveRow.name,
        );
        setTvActiveLiveUrl(liveRow.url);
      } else {
        await maybeSyncLiveFromVod(cfg, vodRow.url || vodRow.name);
      }
      applyConfigToHomeState(vodRow.url || vodRow.name);
      scheduleTvHomeWarmup();
    } catch (e) {
      console.warn('[tv] restore config failed', e);
      setHomeState({
        preparing: false,
        homeLoaded: true,
        error: reportTvError('恢复影视配置失败', e),
      });
    }
  } catch (e) {
    console.warn('[tv] bootstrap failed', e);
    setHomeState({
      preparing: false,
      homeLoaded: true,
      error: reportTvError('恢复影视配置失败', e),
    });
  } finally {
    setHomeState('preparing', false);
  }
}

export async function importTvConfigUrl(url: string): Promise<void> {
  setHomeState({ error: '', homeLoaded: false });
  try {
    const cfg = await VodConfig.loadVodConfigFromUrl(url);
    await TvDao.upsertTvConfig({
      url,
      name: deriveTvConfigDisplayName(url, cfg),
      type: TV_CONFIG_TYPE_VOD,
      json: JSON.stringify(cfg),
      updatedAt: Date.now(),
    });
    setTvActiveVodUrl(url);
    await maybeSyncLiveFromVod(cfg, url);
    applyConfigToHomeState(url);
    void loadHome(undefined, { force: true });
    void import('@/stores/tv-hub/live').then((m) => m.bootstrapTvLive());
  } catch (e) {
    setHomeState({
      error: reportTvError('导入配置失败', e),
      loading: false,
      homeLoaded: true,
    });
  }
}

export async function importTvConfigText(text: string, name = 'pasted'): Promise<void> {
  setHomeState({ error: '', homeLoaded: false });
  try {
    const cfg = await VodConfig.loadVodConfigFromText(text, name);
    await TvDao.upsertTvConfig({
      url: name,
      name: deriveTvConfigDisplayName(name, cfg),
      type: TV_CONFIG_TYPE_VOD,
      json: JSON.stringify(cfg),
      updatedAt: Date.now(),
    });
    setTvActiveVodUrl(name);
    await maybeSyncLiveFromVod(cfg, name);
    applyConfigToHomeState(name);
    void loadHome(undefined, { force: true });
    void import('@/stores/tv-hub/live').then((m) => m.bootstrapTvLive());
  } catch (e) {
    setHomeState({
      error: reportTvError('导入配置失败', e),
      loading: false,
      homeLoaded: true,
    });
  }
}

/** 批量写入源库；默认将最后一项设为当前影视源，并按 needSync 同步直播。
 * 首页拉取异步进行，不阻塞设置页源列表刷新。
 */
export async function commitIdentifiedTvConfigs(
  sources: IdentifiedTvConfig[],
): Promise<number> {
  let last: IdentifiedTvConfig | null = null;
  for (const source of sources) {
    await TvDao.upsertTvConfig({
      url: source.url,
      name: source.name,
      type: TV_CONFIG_TYPE_VOD,
      json: source.json,
      updatedAt: Date.now(),
    });
    last = source;
  }
  if (last) {
    try {
      const cfg = await VodConfig.loadVodConfigFromText(last.json, last.url);
      setTvActiveVodUrl(last.url);
      await maybeSyncLiveFromVod(cfg, last.url);
      applyConfigToHomeState(last.url);
      // 不阻塞导入完成：站点超时不应拖住设置页库列表
      void loadHome(undefined, { force: true });
      void import('@/stores/tv-hub/live').then((m) => m.bootstrapTvLive());
    } catch (e) {
      setHomeState({
        error: reportTvError('启用影视源失败', e),
        loading: false,
        homeLoaded: true,
      });
    }
  }
  return sources.length;
}

/** 下拉：选择影视使用的源 */
export async function setActiveVodSource(url: string): Promise<void> {
  if (!url || url === homeState.configUrl) return;
  const prevVodUrl = homeState.configUrl;
  setHomeState({ error: '', homeLoaded: false });
  try {
    const row = await resolveLibraryRow(url);
    if (!row?.json) throw new Error('源不存在');
    const cfg = await VodConfig.loadVodConfigFromText(row.json, row.url);
    setTvActiveVodUrl(row.url);
    await TvDao.upsertTvConfig({
      id: row.id,
      url: row.url,
      name: row.name,
      type: TV_CONFIG_TYPE_VOD,
      json: row.json,
      updatedAt: Date.now(),
    });
    // 直播未配置、仍指向旧影视 URL、或标记为随影视同步 → 跟随新影视
    const active = getTvActiveSources();
    if (
      !active.liveUrl ||
      active.liveUrl === prevVodUrl ||
      LiveConfig.isLiveSyncedFromVod()
    ) {
      await maybeSyncLiveFromVod(cfg, row.url);
    }
    applyConfigToHomeState(row.url);
    void loadHome(undefined, { force: true });
    void import('@/stores/tv-hub/live').then((m) => m.bootstrapTvLive());
  } catch (e) {
    setHomeState({
      error: reportTvError('切换影视源失败', e),
      loading: false,
      homeLoaded: true,
    });
  }
}

/** 下拉：选择直播使用的源（可与影视不同） */
export async function setActiveLiveSource(url: string): Promise<void> {
  if (!url || url === homeState.liveConfigUrl) return;
  try {
    const row = await resolveLibraryRow(url);
    if (!row?.json) throw new Error('源不存在');
    await LiveConfig.loadLiveConfigFromText(row.json, row.url);
    setTvActiveLiveUrl(row.url);
    bumpLiveStateOnly();
    void import('@/stores/tv-hub/live').then((m) => m.bootstrapTvLive());
  } catch (e) {
    setHomeState({
      error: reportTvError('切换直播源失败', e),
    });
  }
}

export async function activateSavedTvConfig(id: string): Promise<void> {
  const list = await TvDao.listTvConfigLibrary();
  const row = list.find((c) => c.id === id) ?? (await TvDao.activateTvConfig(id));
  if (!row) {
    setHomeState({ error: reportTvError('启用配置失败', '配置不存在') });
    return;
  }
  await setActiveVodSource(row.url);
}

export async function removeSavedTvConfig(id: string): Promise<void> {
  await TvDao.deleteTvConfig(id);
}

export async function setSavedTvConfigEnabled(id: string, enabled: boolean): Promise<void> {
  await TvDao.setVideoSourceEnabled(id, enabled);
}

export async function loadHome(
  siteKey?: string,
  opts?: { force?: boolean },
): Promise<void> {
  const key = siteKey || homeState.siteKey || VodConfig.getHomeSite()?.key || '';
  // 同站且已在加载：避免 AppSelect options 抖动触发 onChange → switchSite 同步死循环
  if (!opts?.force && homeState.loading && key && key === homeState.siteKey) return;

  const seq = ++homeLoadSeq;
  if (key) VodConfig.setHomeSiteKey(key);
  const site = VodConfig.getSite(key) ?? VodConfig.getHomeSite();
  const sites = toSiteOptions();

  // 先刷站点栏，避免 JAR home 挂起时整页只剩「加载中」
  setHomeState({
    loading: true,
    error: '',
    sites,
    siteKey: site?.key ?? '',
    homeLoaded: false,
    list: [],
    recommendList: [],
    classes: [],
    tid: '',
    extend: {},
    loadingMore: false,
    hasMore: false,
  });

  try {
    const result: Result = await withTimeout(
      SiteApi.homeContent(site),
      HOME_CONTENT_TIMEOUT_MS,
      site ? `站点「${site.name}」首页` : '首页',
    );
    if (seq !== homeLoadSeq) return;

    const recommendList = result.list ?? [];
    const siteClasses = result.class ?? [];
    const classes = buildHomeClasses(siteClasses, recommendList.length);
    const softMsg = (result.msg ?? '').trim();
    const siteKeyResolved = site?.key ?? '';
    const defaultTid = resolveDefaultTid(siteKeyResolved, siteClasses, classes);

    setHomeState({
      sites: toSiteOptions(),
      siteKey: siteKeyResolved,
      classes,
      recommendList,
      notice: VodConfig.getVodConfig()?.notice ?? '',
      logoUrl: (() => {
        const raw = (VodConfig.getVodConfig()?.logo ?? '').trim();
        return raw
          ? resolveConfigAssetUrl(raw, VodConfig.getConfigUrl() || homeState.configUrl)
          : '';
      })(),
      filters: normalizeFilters(result.filters),
      extend: {},
      homeLoaded: true,
      error: '',
    });

    if (defaultTid) {
      await loadCategory(defaultTid, 1, { force: true, loadSeq: seq });
      return;
    }

    setHomeState({
      list: [],
      tid: '',
      page: 1,
      pagecount: 1,
      loading: false,
      error: softMsg ? reportTvResultMsg('加载首页失败', softMsg) : '',
    });
  } catch (e) {
    if (seq !== homeLoadSeq) return;
    setHomeState({
      loading: false,
      homeLoaded: true,
      error: reportTvError('加载首页失败', e),
    });
  }
}

export async function loadCategory(
  tid: string,
  page = 1,
  opts?: { force?: boolean; loadSeq?: number; append?: boolean },
): Promise<void> {
  const key = homeState.siteKey;
  if (!key) return;
  const append = opts?.append === true;
  if (
    !opts?.force &&
    !append &&
    homeState.loading &&
    homeState.tid === tid &&
    homeState.page === page
  ) {
    return;
  }
  if (append && (homeState.loading || homeState.loadingMore || !homeState.hasMore)) {
    return;
  }

  // 推荐流：不走 categoryContent
  if (tid === TV_HOME_RECOMMEND_TID) {
    rememberSiteTid(key, tid);
    setHomeState({
      tid,
      page: 1,
      pagecount: 1,
      list: homeState.recommendList,
      loading: false,
      loadingMore: false,
      hasMore: false,
      error: homeState.recommendList.length ? '' : '暂无推荐内容',
    });
    return;
  }

  if (append) {
    setHomeState({ loadingMore: true, error: '', tid, page });
  } else {
    setHomeState({ loading: true, loadingMore: false, error: '', tid, page });
  }

  try {
    const result = await SiteApi.categoryContent(
      key,
      tid,
      String(page),
      true,
      { ...homeState.extend },
    );
    if (opts?.loadSeq != null && opts.loadSeq !== homeLoadSeq) return;
    const pageList = result.list ?? [];
    const pagecount = normalizeTvPageCount(result.pagecount);
    // 对齐 fongmi：空页回退；滚动追加时标记没有更多
    if (pageList.length === 0 && page > 1) {
      setHomeState({
        page: page - 1,
        pagecount,
        loading: false,
        loadingMore: false,
        hasMore: false,
        error: '',
      });
      return;
    }
    const nf = normalizeFilters(result.filters);
    const list = append ? [...homeState.list, ...pageList] : pageList;
    const hasMore = tvCategoryHasNextPage(page, pagecount, pageList.length);
    rememberSiteTid(key, tid);
    setHomeState({
      list,
      pagecount,
      filters: Object.keys(nf).length ? nf : homeState.filters,
      loading: false,
      loadingMore: false,
      hasMore,
      error: '',
    });
  } catch (e) {
    if (opts?.loadSeq != null && opts.loadSeq !== homeLoadSeq) return;
    setHomeState({
      loading: false,
      loadingMore: false,
      page: page > 1 && !append ? page - 1 : homeState.page,
      error: reportTvError(append ? '加载更多失败' : '加载分类失败', e),
    });
  }
}

/** 分页模式：跳转到指定页（替换列表） */
export async function goToCategoryPage(page: number): Promise<void> {
  if (homeState.loading || homeState.loadingMore) return;
  const tid = homeState.tid;
  if (!tid || tid === TV_HOME_RECOMMEND_TID) return;
  const next = Math.max(1, Math.floor(page));
  if (next === homeState.page && homeState.list.length > 0) return;
  await loadCategory(tid, next, { force: true, append: false });
}

/** 滚动模式：追加下一页 */
export async function loadMoreCategory(): Promise<void> {
  if (
    homeState.loading ||
    homeState.loadingMore ||
    !homeState.hasMore
  ) {
    return;
  }
  if (getTvHomeUi().paginationPreference !== 'scroll') return;
  const tid = homeState.tid;
  if (!tid || tid === TV_HOME_RECOMMEND_TID) return;
  await loadCategory(tid, homeState.page + 1, { force: true, append: true });
}

export function setFilterValue(filterKey: string, value: string): void {
  const next = { ...homeState.extend };
  if (!value) delete next[filterKey];
  else next[filterKey] = value;
  setHomeState('extend', next);
  void loadCategory(homeState.tid || homeState.classes[0]?.type_id || '', 1, {
    force: true,
  });
}

export function switchSite(siteKey: string): void {
  if (!siteKey || siteKey === homeState.siteKey) return;
  void loadHome(siteKey);
}
