/**
 * 订阅发现广场 —— Folo 免登录趋势与 RSSHub 分类（含归类预览）
 */

import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import { Button } from '@/components/ui/button';
import {
  AppSelect,
  AppSelectContent,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { ExpandableIconSearch } from '@/components/shared/ExpandableIconSearch';
import {
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
} from '@/components/shared/AppTooltip';
import { LayoutIcon, PlusIcon, RefreshIcon, RssIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import {
  mainShellPageRoot,
  mainShellPageScroll,
  mainShellTabEnterClass,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import { settingsStore } from '@/stores/settings';
import {
  setSubscribeActiveSource,
  setSubscribeSection,
} from '@/stores/subscribe-hub/section';
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Show,
} from 'solid-js';
import {
  FOLO_RSSHUB_CATEGORIES,
  FOLO_RSSHUB_CATEGORY_LABELS,
  appLanguageToFoloRsshubLang,
  appLanguageToFoloTrendingLanguage,
  fetchFoloRsshubAnalytics,
  fetchFoloRsshubIndex,
  fetchFoloTrendingFeeds,
  formatFoloHeatCount,
  foloAvatarFallbackUrl,
  foloFeedToSubscribeUrl,
  foloRsshubAnalyticsKey,
  foloRouteExampleToSubscribeUrl,
  foloSiteIconUrl,
  normalizeFoloRsshubRoutePath,
  type FoloRsshubCategory,
  type FoloRsshubIndex,
  type FoloRsshubNamespace,
  type FoloRsshubRoute,
  type FoloRsshubTopFeed,
  type FoloTrendingItem,
} from '@/lib/subscribe/folo-cloud';
import {
  getOrFetchRsshubAnalytics,
  getOrFetchRsshubDiscover,
  getOrFetchTrendingDiscover,
  invalidateRsshubDiscoverCache,
  invalidateTrendingDiscoverCache,
  makeRsshubDiscoverCacheKey,
  makeTrendingDiscoverCacheKey,
  peekRsshubAnalyticsCache,
  peekRsshubDiscoverCache,
  peekTrendingDiscoverCache,
} from '@/lib/subscribe/folo-discover-cache';
import {
  SubscribeSourceFormDialog,
  type SubscribeSourceFormDraft,
} from '@/components/media/subscribe/SubscribeSourceFormDialog';
import {
  SubscribeDiscoverCategoriesSkeleton,
  SubscribeDiscoverTrendingSkeleton,
} from '@/components/media/subscribe/SubscribeSkeletons';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import { isAbortError } from '@/lib/http';
import { getPageNavigationRevision } from '@/lib/navigation/page-navigation-scope';
import {
  SUBSCRIBE_FEED_VIEW_LABELS,
  SUBSCRIBE_FEED_VIEW_TABS,
  rsshubCategoryToFeedView,
  subscribeFeedViewKindToNumber,
  type SubscribeFeedViewKind,
} from '@/lib/subscribe/feed-view';

export interface SubscribeDiscoverPageProps {
  onOpenHome?: () => void;
}

type DiscoverTab = 'trending' | 'categories';
const DISCOVER_TABS = ['trending', 'categories'] as const;
const DISCOVER_TAB_LABELS: Record<DiscoverTab, string> = {
  trending: '趋势',
  categories: '分类',
};

const DISCOVER_SELECT_TRIGGER_CLASS =
  'h-9 w-[7.5rem] shrink-0 justify-between gap-1 px-2.5 text-sm sm:w-36';

type DiscoverRouteRow = {
  routeKey: string;
  path: string;
  route: FoloRsshubRoute & { path: string };
  heat: number;
  topFeeds: FoloRsshubTopFeed[];
};

type DiscoverNamespaceCard = {
  key: string;
  name: string;
  url: string;
  tags: string[];
  heat: number;
  routes: DiscoverRouteRow[];
};

export function SubscribeDiscoverPage(props: SubscribeDiscoverPageProps) {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);
  const [tab, setTab] = createSignal<DiscoverTab>('trending');
  const [trendingView, setTrendingView] = createSignal<SubscribeFeedViewKind>('all');
  const [category, setCategory] = createSignal<FoloRsshubCategory>('all');
  const [searchQuery, setSearchQuery] = createSignal('');
  const [formOpen, setFormOpen] = createSignal(false);
  const [formDraft, setFormDraft] = createSignal<SubscribeSourceFormDraft | null>(null);

  /** 趋势接口用 cmn/eng；分类接口用 zh-CN/en（对齐 Folo LanguageMap） */
  const foloTrendingLanguage = createMemo(() =>
    appLanguageToFoloTrendingLanguage(settingsStore.state.app.language),
  );
  const foloRsshubLang = createMemo(() =>
    appLanguageToFoloRsshubLang(settingsStore.state.app.language),
  );

  const trendingCacheKey = createMemo(() =>
    makeTrendingDiscoverCacheKey({
      language: foloTrendingLanguage(),
      view: trendingView(),
      range: '7d',
      limit: 24,
    }),
  );

  const rsshubCacheKey = createMemo(() =>
    makeRsshubDiscoverCacheKey({
      category: category(),
      lang: foloRsshubLang(),
    }),
  );

  /** source 绑定导航 revision：切页回来自动重拉；AbortError 不对外展示 */
  const [trending, { refetch: refetchTrending }] = createResource(
    () =>
      tab() === 'trending'
        ? { cacheKey: trendingCacheKey(), nav: getPageNavigationRevision() }
        : false,
    async (opts) => {
      const view = trendingView();
      const language = foloTrendingLanguage();
      const viewN = subscribeFeedViewKindToNumber(view);
      return getOrFetchTrendingDiscover(opts.cacheKey, () =>
        fetchFoloTrendingFeeds({
          language,
          range: '7d',
          limit: 24,
          view: viewN ?? undefined,
        }),
      );
    },
  );

  const [rsshub, { refetch: refetchRsshub }] = createResource(
    () =>
      tab() === 'categories'
        ? { cacheKey: rsshubCacheKey(), nav: getPageNavigationRevision() }
        : false,
    async (opts) =>
      getOrFetchRsshubDiscover(opts.cacheKey, () =>
        fetchFoloRsshubIndex({
          category: category(),
          lang: foloRsshubLang(),
        }),
      ),
  );

  const [analytics] = createResource(
    () =>
      tab() === 'categories'
        ? { id: 'analytics' as const, nav: getPageNavigationRevision() }
        : false,
    async () => {
      try {
        return await getOrFetchRsshubAnalytics(() => fetchFoloRsshubAnalytics());
      } catch (error) {
        if (isAbortError(error)) {
          console.warn('[subscribe-discover] analytics 请求已取消，忽略', error);
          return peekRsshubAnalyticsCache() ?? {};
        }
        return {};
      }
    },
  );

  const trendingVisibleError = createMemo(() => {
    const err = trending.error;
    if (!err || isAbortError(err)) return undefined;
    return err;
  });
  const rsshubVisibleError = createMemo(() => {
    const err = rsshub.error;
    if (!err || isAbortError(err)) return undefined;
    return err;
  });

  /** 导航取消后若仍停在本页，自动重试（不把 AbortError 留给 ErrorBox） */
  let trendingAbortRetryScheduled = false;
  let rsshubAbortRetryScheduled = false;
  createEffect(() => {
    if (tab() !== 'trending') {
      trendingAbortRetryScheduled = false;
      return;
    }
    if (!isAbortError(trending.error) || trending.loading) return;
    if (trendingAbortRetryScheduled) return;
    trendingAbortRetryScheduled = true;
    console.warn('[subscribe-discover] 趋势请求被导航取消，自动重试', trending.error);
    void Promise.resolve()
      .then(() => refetchTrending())
      .finally(() => {
        trendingAbortRetryScheduled = false;
      });
  });
  createEffect(() => {
    if (tab() !== 'categories') {
      rsshubAbortRetryScheduled = false;
      return;
    }
    if (!isAbortError(rsshub.error) || rsshub.loading) return;
    if (rsshubAbortRetryScheduled) return;
    rsshubAbortRetryScheduled = true;
    console.warn('[subscribe-discover] 分类请求被导航取消，自动重试', rsshub.error);
    void Promise.resolve()
      .then(() => refetchRsshub())
      .finally(() => {
        rsshubAbortRetryScheduled = false;
      });
  });

  /**
   * 仅展示「当前 key」的缓存或已完成结果，避免切换中途闪出上一分类/频道内容。
   */
  const displayTrending = createMemo((): FoloTrendingItem[] | undefined => {
    if (tab() !== 'trending') return undefined;
    const key = trendingCacheKey();
    const cached = peekTrendingDiscoverCache(key);
    if (cached) return cached;
    if (trending.loading || isAbortError(trending.error)) return undefined;
    if (trendingVisibleError()) return undefined;
    return trending() ?? undefined;
  });

  const displayRsshub = createMemo((): FoloRsshubIndex | undefined => {
    if (tab() !== 'categories') return undefined;
    const key = rsshubCacheKey();
    const cached = peekRsshubDiscoverCache(key);
    if (cached) return cached;
    if (rsshub.loading || isAbortError(rsshub.error)) return undefined;
    if (rsshubVisibleError()) return undefined;
    return rsshub() ?? undefined;
  });

  const displayAnalytics = createMemo(() => {
    if (tab() !== 'categories') return {};
    return peekRsshubAnalyticsCache() ?? analytics() ?? {};
  });

  const showTrendingSkeleton = useSkeletonLoading(
    () =>
      tab() === 'trending' &&
      displayTrending() === undefined &&
      !trendingVisibleError(),
  );
  const showCategoriesSkeleton = useSkeletonLoading(
    () =>
      tab() === 'categories' &&
      displayRsshub() === undefined &&
      !rsshubVisibleError(),
  );

  async function refreshCurrentTab() {
    if (tab() === 'trending') {
      invalidateTrendingDiscoverCache(trendingCacheKey());
      void refetchTrending();
      return;
    }
    invalidateRsshubDiscoverCache(rsshubCacheKey());
    void refetchRsshub();
  }

  /** 按命名空间归类（对齐 Folo RecommendationListItem） */
  const namespaceCards = createMemo((): DiscoverNamespaceCard[] => {
    const index = displayRsshub();
    if (!index) return [];
    const stats = displayAnalytics();
    const q = searchQuery().trim().toLowerCase();
    const cards: DiscoverNamespaceCard[] = [];

    for (const [namespace, meta] of Object.entries(index) as [string, FoloRsshubNamespace][]) {
      if (!meta || typeof meta !== 'object') continue;
      const routeEntries = Object.entries(meta.routes ?? {}) as [string, FoloRsshubRoute][];
      if (routeEntries.length === 0) continue;

      const tags = new Set<string>();
      const routes: DiscoverRouteRow[] = [];

      for (const [routeKey, route] of routeEntries) {
        if (!route || typeof route !== 'object') continue;
        const path = normalizeFoloRsshubRoutePath(route.path, routeKey);
        if (!path) continue;
        const name = String(route.name ?? '').trim() || path;
        const example =
          String(route.example ?? '').trim() ||
          `/${namespace}${path.startsWith('/') ? path : `/${path}`}`;
        const hay = `${meta.name} ${name} ${example} ${namespace} ${path}`.toLowerCase();
        if (q && !hay.includes(q)) continue;

        for (const c of route.categories ?? []) {
          const tag = String(c).trim();
          if (tag && tag !== 'popular') tags.add(tag);
        }

        const analyticsKey = foloRsshubAnalyticsKey(namespace, path, routeKey);
        const byKey = stats[`/${namespace}${routeKey}`];
        const byPath = stats[analyticsKey];
        const rowStats = byPath ?? byKey;
        routes.push({
          routeKey,
          path,
          route: { ...route, path, name, example },
          heat: rowStats?.subscriptionCount ?? 0,
          topFeeds: (rowStats?.topFeeds ?? []).slice(0, 2),
        });
      }

      if (routes.length === 0) continue;

      routes.sort((a, b) => b.heat - a.heat || a.route.name.localeCompare(b.route.name, 'zh-CN'));
      const heat = routes.reduce((sum, r) => sum + r.heat, 0);
      cards.push({
        key: namespace,
        name: meta.name || namespace,
        url: meta.url || '',
        tags: [...tags]
          .map((t) => FOLO_RSSHUB_CATEGORY_LABELS[t as FoloRsshubCategory] || t)
          .slice(0, 4),
        heat,
        routes,
      });
    }

    return cards.sort((a, b) => b.heat - a.heat || a.name.localeCompare(b.name, 'zh-CN'));
  });

  const filteredTrending = createMemo(() => {
    const list = displayTrending() ?? [];
    const q = searchQuery().trim().toLowerCase();
    if (!q) return list;
    return list.filter((item) => {
      const hay =
        `${item.feed.title ?? ''} ${item.feed.url ?? ''} ${item.feed.description ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  });

  function openSubscribeForm(opts: {
    title: string;
    url: string;
    category?: string;
    view?: number;
    foloFeedId?: string;
    siteUrl?: string | null;
    iconUrl?: string | null;
    description?: string | null;
    badge?: string;
    subscriptionCount?: number | null;
    updatesPerWeek?: number | null;
  }) {
    setFormDraft({
      mode: 'create',
      url: opts.url,
      defaultTitle: opts.title,
      title: '',
      // 发现页默认未分类，由用户在弹窗内自行选择
      category: opts.category ?? '',
      view: opts.view,
      foloFeedId: opts.foloFeedId,
      siteUrl: opts.siteUrl,
      iconUrl: opts.iconUrl,
      description: opts.description,
      badge: opts.badge,
      subscriptionCount: opts.subscriptionCount,
      updatesPerWeek: opts.updatesPerWeek,
    });
    setFormOpen(true);
  }

  function openTrendingSubscribe(item: FoloTrendingItem) {
    openSubscribeForm({
      title: item.feed.title || item.feed.url,
      url: foloFeedToSubscribeUrl(item.feed),
      view: item.view ?? 0,
      foloFeedId: item.feed.id || item.feedId,
      siteUrl: item.feed.siteUrl,
      iconUrl: foloSiteIconUrl(item.feed.siteUrl) || item.feed.image,
      description: item.feed.description,
      subscriptionCount: item.analytics.subscriptionCount,
      updatesPerWeek: item.analytics.updatesPerWeek,
    });
  }

  function openRouteSubscribe(namespace: string, route: FoloRsshubRoute & { path: string }) {
    const example =
      String(route.example ?? '').trim() ||
      `/${namespace}${route.path.startsWith('/') ? route.path : `/${route.path}`}`;
    openSubscribeForm({
      title: route.name || example,
      url: foloRouteExampleToSubscribeUrl(example),
      view: rsshubCategoryToFeedView(category()),
      description: route.description,
      badge: 'RSSHub',
    });
  }

  function openTopFeedSubscribe(feed: FoloRsshubTopFeed) {
    openSubscribeForm({
      title: feed.title || feed.url,
      url: foloFeedToSubscribeUrl({ url: feed.url }),
      view: rsshubCategoryToFeedView(category()),
      foloFeedId: feed.id,
      siteUrl: feed.siteUrl,
      iconUrl: foloSiteIconUrl(feed.siteUrl) || feed.image,
      description: feed.description,
      badge: 'RSSHub',
    });
  }

  function handleFormCreated(sourceId: string) {
    setSubscribeActiveSource(sourceId);
    setSubscribeSection('home');
    props.onOpenHome?.();
  }

  return (
    <section class={cn(tabEnterClass(), mainShellPageRoot, 'subscribe-discover-page')}>
      <PageToolbar
        class={pageToolbarBottomBorder}
        title="发现"
        description="Folo 公开广场（免登录）"
        titleSlot={
          <PageToolbarTitleDropdown
            title="发现"
            description="Folo 公开广场（免登录）"
            dropdownEnabled={false}
          />
        }
      >
        <AppSelect
          options={[...DISCOVER_TABS]}
          value={tab()}
          onChange={(next) => {
            if (next) setTab(next);
          }}
          itemComponent={(itemProps) => (
            <AppSelectItem item={itemProps.item}>
              {DISCOVER_TAB_LABELS[itemProps.item.rawValue as DiscoverTab]}
            </AppSelectItem>
          )}
        >
          <AppSelectTrigger
            layout="compact"
            class={DISCOVER_SELECT_TRIGGER_CLASS}
            aria-label="发现类型"
          >
            <AppSelectValue>
              {(state) =>
                DISCOVER_TAB_LABELS[(state.selectedOption() as DiscoverTab) ?? 'trending']
              }
            </AppSelectValue>
            <AppSelectIcon />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectListbox />
          </AppSelectContent>
        </AppSelect>

        <Show
          when={tab() === 'trending'}
          fallback={
            <AppSelect
              options={[...FOLO_RSSHUB_CATEGORIES]}
              value={category()}
              onChange={(next) => {
                if (next) setCategory(next);
              }}
              itemComponent={(itemProps) => (
                <AppSelectItem item={itemProps.item}>
                  {FOLO_RSSHUB_CATEGORY_LABELS[itemProps.item.rawValue as FoloRsshubCategory]}
                </AppSelectItem>
              )}
            >
              <AppSelectTrigger
                layout="compact"
                class={DISCOVER_SELECT_TRIGGER_CLASS}
                aria-label="RSSHub 分类"
              >
                <AppSelectValue>
                  {(state) =>
                    FOLO_RSSHUB_CATEGORY_LABELS[
                      (state.selectedOption() as FoloRsshubCategory) ?? 'all'
                    ]
                  }
                </AppSelectValue>
                <AppSelectIcon />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectListbox />
              </AppSelectContent>
            </AppSelect>
          }
        >
          <AppSelect
            options={[...SUBSCRIBE_FEED_VIEW_TABS]}
            value={trendingView()}
            onChange={(next) => {
              if (next) setTrendingView(next);
            }}
            itemComponent={(itemProps) => (
              <AppSelectItem item={itemProps.item}>
                {SUBSCRIBE_FEED_VIEW_LABELS[itemProps.item.rawValue as SubscribeFeedViewKind]}
              </AppSelectItem>
            )}
          >
            <AppSelectTrigger
              layout="compact"
              class={DISCOVER_SELECT_TRIGGER_CLASS}
              aria-label="趋势频道"
            >
              <AppSelectValue>
                {(state) =>
                  SUBSCRIBE_FEED_VIEW_LABELS[
                    (state.selectedOption() as SubscribeFeedViewKind) ?? 'all'
                  ]
                }
              </AppSelectValue>
              <AppSelectIcon />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectListbox />
            </AppSelectContent>
          </AppSelect>
        </Show>

        <ExpandableIconSearch
          value={searchQuery()}
          onValueChange={setSearchQuery}
          placeholder={tab() === 'trending' ? '搜索趋势源' : '筛选站点 / 路由'}
          tooltip="搜索"
          aria-label="搜索发现内容"
        />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="h-9 w-9"
          aria-label="刷新"
          disabled={trending.loading || rsshub.loading}
          onClick={() => void refreshCurrentTab()}
        >
          <RefreshIcon
            class={cn('h-4 w-4', (trending.loading || rsshub.loading) && 'animate-spin')}
          />
        </Button>
      </PageToolbar>

      <div class={cn(mainShellPageScroll, 'flex min-h-0 flex-1 flex-col')}>
        <div class="flex min-h-0 w-full flex-1 flex-col gap-3 pb-4">
          <Show when={tab() === 'trending'}>
            <div class="space-y-2">
              <Show when={trendingVisibleError()}>
                <ErrorBox
                  message={String(trendingVisibleError())}
                  onRetry={() => void refreshCurrentTab()}
                />
              </Show>
              <Show when={showTrendingSkeleton()}>
                <SubscribeDiscoverTrendingSkeleton />
              </Show>
              <Show
                when={
                  !showTrendingSkeleton() &&
                  displayTrending() !== undefined &&
                  filteredTrending().length === 0 &&
                  !trendingVisibleError()
                }
              >
                <EmptyBox
                  text={searchQuery().trim() ? '没有匹配的趋势源' : '暂无趋势数据'}
                />
              </Show>
              <Show when={!showTrendingSkeleton() && filteredTrending().length > 0}>
                <For each={filteredTrending()}>
                  {(item) => (
                    <article class="flex h-18 items-center gap-3 rounded-xl border bg-card/40 px-3">
                      <DiscoverLogo
                        src={item.feed.image}
                        siteUrl={item.feed.siteUrl}
                        alt={item.feed.title || item.feed.url}
                        size="lg"
                      />
                      <div class="min-w-0 flex-1">
                        <div class="truncate text-sm font-medium">
                          {item.feed.title || item.feed.url}
                        </div>
                        <div class="mt-0.5 truncate text-xs text-muted-foreground">
                          {item.feed.description || item.feed.url}
                        </div>
                        <div class="mt-0.5 truncate text-[11px] text-muted-foreground">
                          订阅 {item.analytics.subscriptionCount ?? 0} · 周更{' '}
                          {item.analytics.updatesPerWeek ?? 0}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        class="shrink-0"
                        onClick={() => openTrendingSubscribe(item)}
                      >
                        <PlusIcon class="mr-1 h-3.5 w-3.5" />
                        订阅
                      </Button>
                    </article>
                  )}
                </For>
              </Show>
            </div>
          </Show>

          <Show when={tab() === 'categories'}>
            <div class="space-y-3">
              <Show when={rsshubVisibleError()}>
                <ErrorBox
                  message={String(rsshubVisibleError())}
                  onRetry={() => void refreshCurrentTab()}
                />
              </Show>
              <Show when={showCategoriesSkeleton()}>
                <SubscribeDiscoverCategoriesSkeleton />
              </Show>
              <Show
                when={
                  !showCategoriesSkeleton() &&
                  displayRsshub() !== undefined &&
                  namespaceCards().length === 0 &&
                  !rsshubVisibleError()
                }
              >
                <EmptyBox
                  text={searchQuery().trim() ? '没有匹配的内容' : '此分类下暂无路由'}
                />
              </Show>
              <Show when={!showCategoriesSkeleton() && namespaceCards().length > 0}>
                <For each={namespaceCards()}>
                {(card) => (
                  <section class="overflow-hidden rounded-xl border border-border/60 bg-card">
                    <div class="flex items-center gap-3 border-b border-border/50 px-4 py-3">
                      <DiscoverLogo
                        siteUrl={card.url ? `https://${card.url}` : null}
                        alt={card.name}
                        fallback="layout"
                        size="md"
                      />
                      <div class="min-w-0 flex-1">
                        <div class="truncate text-sm font-semibold">{card.name}</div>
                        <Show when={card.url}>
                          <div class="truncate text-[11px] text-muted-foreground">{card.url}</div>
                        </Show>
                      </div>
                      <Show when={card.tags.length > 0}>
                        <div class="hidden max-w-[40%] flex-wrap justify-end gap-1 sm:flex">
                          <For each={card.tags}>
                            {(tag) => (
                              <span class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {tag}
                              </span>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                    <ul class="divide-y divide-border/40">
                      <For each={card.routes}>
                        {(row) => (
                          <li class="px-4 py-3 hover:bg-muted/30">
                            <div class="flex items-start gap-3">
                              <div class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                              <div class="min-w-0 flex-1">
                                <div class="flex items-center gap-2">
                                  <div class="min-w-0 flex-1 truncate text-sm font-medium">
                                    {row.route.name}
                                  </div>
                                  <Show when={formatFoloHeatCount(row.heat)}>
                                    {(heat) => (
                                      <span class="shrink-0 text-[11px] text-orange-500">
                                        🔥 {heat()}
                                      </span>
                                    )}
                                  </Show>
                                  <AppTooltip
                                    disabled={
                                      Object.keys(row.route.parameters ?? {}).length === 0
                                    }
                                  >
                                    <AppTooltipTrigger
                                      as={Button}
                                      size="sm"
                                      variant="outline"
                                      class="h-7 shrink-0 px-2"
                                      onClick={() => openRouteSubscribe(card.key, row.route)}
                                    >
                                      <PlusIcon class="mr-1 h-3.5 w-3.5" />
                                      订阅
                                    </AppTooltipTrigger>
                                    <AppTooltipContent>
                                      将按官方示例路径订阅，参数可之后在源 URL 中调整
                                    </AppTooltipContent>
                                  </AppTooltip>
                                </div>
                                <div class="mt-0.5 truncate text-[11px] text-muted-foreground">
                                  rsshub://{card.key}
                                  {row.path.startsWith('/') ? row.path : `/${row.path}`}
                                </div>
                                <Show when={row.topFeeds.length > 0}>
                                  <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <For each={row.topFeeds}>
                                      {(feed) => (
                                        <button
                                          type="button"
                                          class="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted/60"
                                          onClick={() => openTopFeedSubscribe(feed)}
                                        >
                                          <DiscoverLogo
                                            src={feed.image}
                                            siteUrl={feed.siteUrl}
                                            alt={feed.title || feed.url}
                                            size="sm"
                                            round
                                          />
                                          <span class="min-w-0 truncate text-xs">
                                            {feed.title || feed.url}
                                          </span>
                                        </button>
                                      )}
                                    </For>
                                  </div>
                                </Show>
                              </div>
                            </div>
                          </li>
                        )}
                      </For>
                    </ul>
                  </section>
                )}
              </For>
              </Show>
            </div>
          </Show>
        </div>
      </div>

      <SubscribeSourceFormDialog
        open={formOpen()}
        draft={formDraft()}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setFormDraft(null);
        }}
        onCreated={handleFormCreated}
      />
    </section>
  );
}

function DiscoverLogo(props: {
  src?: string | null;
  siteUrl?: string | null;
  alt: string;
  fallback?: 'rss' | 'layout';
  size?: 'sm' | 'md' | 'lg';
  round?: boolean;
}) {
  const boxClass = () => {
    const size =
      props.size === 'sm' ? 'h-4 w-4' : props.size === 'lg' ? 'h-9 w-9' : 'h-8 w-8';
    const radius = props.round ? 'rounded-full' : 'rounded-md';
    return cn(
      'flex shrink-0 items-center justify-center overflow-hidden bg-muted',
      size,
      radius,
    );
  };
  const iconClass = () => (props.size === 'sm' ? 'h-2.5 w-2.5' : 'h-4 w-4');
  const candidates = createMemo(() => {
    const list: string[] = [];
    const foloIcon = foloSiteIconUrl(props.siteUrl);
    if (foloIcon) list.push(foloIcon);
    const image = String(props.src ?? '').trim();
    if (image && !/pbs\.twimg\.com|abs\.twimg\.com/i.test(image)) list.push(image);
    const avatar = foloAvatarFallbackUrl(props.siteUrl);
    if (avatar) list.push(avatar);
    return [...new Set(list)];
  });
  const [index, setIndex] = createSignal(0);
  createEffect(() => {
    candidates();
    setIndex(0);
  });
  const current = () => candidates()[index()] ?? '';
  const FallbackIcon = props.fallback === 'layout' ? LayoutIcon : RssIcon;
  return (
    <div class={boxClass()}>
      <Show
        when={current()}
        fallback={<FallbackIcon class={cn(iconClass(), 'text-muted-foreground')} />}
      >
        <img
          src={current()}
          alt={props.alt}
          class="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => {
            if (index() + 1 < candidates().length) setIndex(index() + 1);
            else setIndex(candidates().length);
          }}
        />
      </Show>
    </div>
  );
}

function EmptyBox(props: { text: string }) {
  return (
    <div class="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
      {props.text}
    </div>
  );
}

function ErrorBox(props: { message: string; onRetry: () => void }) {
  return (
    <div class="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-center">
      <div class="text-sm text-destructive">加载失败</div>
      <div class="mt-1 text-xs text-muted-foreground">{props.message}</div>
      <Button size="sm" variant="outline" class="mt-3" onClick={props.onRetry}>
        重试
      </Button>
    </div>
  );
}
