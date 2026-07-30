/**
 * 订阅发现广场 —— Folo 免登录趋势与 RSSHub 分类
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
import { AppTabs } from '@/components/shared/AppTabs';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import {
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
} from '@/components/shared/AppTooltip';
import { LayoutIcon, PlusIcon, RefreshIcon, RssIcon, SearchIcon } from '@/components/shared/icons';
import { showAppToast } from '@/components/shared/AppToasts';
import { cn } from '@/lib/utils';
import {
  mainShellPageHost,
  mainShellPageRoot,
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
  fetchFoloRsshubAnalytics,
  fetchFoloRsshubIndex,
  fetchFoloTrendingFeeds,
  foloAvatarFallbackUrl,
  foloFeedToSubscribeUrl,
  foloRouteExampleToSubscribeUrl,
  foloSiteIconUrl,
  type FoloRsshubCategory,
  type FoloRsshubNamespace,
  type FoloRsshubRoute,
  type FoloTrendingItem,
  type FoloTrendingLanguage,
} from '@/lib/subscribe/folo-cloud';
import {
  createSubscribeSource,
  refreshSubscribeSource,
} from '@/lib/subscribe/service';

export interface SubscribeDiscoverPageProps {
  onOpenHome?: () => void;
}

type DiscoverTab = 'trending' | 'categories';
type DiscoverLanguage = 'all' | FoloTrendingLanguage;
const DISCOVER_TABS = ['trending', 'categories'] as const;
const DISCOVER_TAB_LABELS: Record<DiscoverTab, string> = {
  trending: '趋势',
  categories: '分类',
};
const DISCOVER_LANGUAGES = ['all', 'cmn', 'eng'] as const;
const DISCOVER_LANGUAGE_LABELS: Record<DiscoverLanguage, string> = {
  all: '全部',
  cmn: '中文',
  eng: '英文',
};

export function SubscribeDiscoverPage(props: SubscribeDiscoverPageProps) {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);
  const [tab, setTab] = createSignal<DiscoverTab>('trending');
  const [language, setLanguage] = createSignal<DiscoverLanguage>('cmn');
  const [category, setCategory] = createSignal<FoloRsshubCategory>('all');
  const [routeQuery, setRouteQuery] = createSignal('');
  const [busyId, setBusyId] = createSignal('');

  const [trending, { refetch: refetchTrending }] = createResource(
    () => ({ language: language(), tab: tab() }),
    async (opts) => {
      if (opts.tab !== 'trending') return [] as FoloTrendingItem[];
      return fetchFoloTrendingFeeds({
        language: opts.language,
        range: '7d',
        limit: 24,
      });
    },
  );

  const [rsshub, { refetch: refetchRsshub }] = createResource(
    () => ({ category: category(), tab: tab() }),
    async (opts) => {
      if (opts.tab !== 'categories') return {} as Record<string, FoloRsshubNamespace>;
      return fetchFoloRsshubIndex({ category: opts.category });
    },
  );

  const [analytics] = createResource(
    () => tab() === 'categories',
    async (enabled) => {
      if (!enabled) return {} as Record<string, { subscriptionCount: number }>;
      try {
        return await fetchFoloRsshubAnalytics();
      } catch {
        return {};
      }
    },
  );

  const flatRoutes = createMemo(() => {
    const index = rsshub() ?? {};
    const q = routeQuery().trim().toLowerCase();
    const rows: Array<{
      key: string;
      namespace: string;
      namespaceName: string;
      namespaceUrl: string;
      route: FoloRsshubRoute;
      heat: number;
    }> = [];
    for (const [namespace, meta] of Object.entries(index)) {
      for (const [routeKey, route] of Object.entries(meta.routes ?? {})) {
        const hay = `${meta.name} ${route.name} ${route.example} ${namespace}`.toLowerCase();
        if (q && !hay.includes(q)) continue;
        const analyticsKey = `/${namespace}${route.path.startsWith('/') ? route.path : `/${route.path}`}`;
        const heat =
          analytics()?.[analyticsKey]?.subscriptionCount ??
          analytics()?.[`/${namespace}${routeKey}`]?.subscriptionCount ??
          0;
        rows.push({
          key: `${namespace}:${routeKey}`,
          namespace,
          namespaceName: meta.name || namespace,
          namespaceUrl: meta.url,
          route,
          heat,
        });
      }
    }
    return rows.sort((a, b) => b.heat - a.heat || a.route.name.localeCompare(b.route.name, 'zh-CN'));
  });

  async function subscribeUrl(opts: {
    id: string;
    title: string;
    url: string;
    category?: string;
    foloFeedId?: string;
  }) {
    if (busyId()) return;
    setBusyId(opts.id);
    try {
      const sourceId = await createSubscribeSource({
        title: opts.title,
        url: opts.url,
        category: opts.category ?? '发现',
        foloFeedId: opts.foloFeedId,
      });
      setSubscribeActiveSource(sourceId);
      showAppToast({ title: '已添加订阅源', variant: 'success' });
      void refreshSubscribeSource(sourceId).catch(() => undefined);
      setSubscribeSection('home');
      props.onOpenHome?.();
    } catch (error) {
      showAppToast({
        title: '添加失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setBusyId('');
    }
  }

  async function subscribeTrending(item: FoloTrendingItem) {
    await subscribeUrl({
      id: item.feedId,
      title: item.feed.title || item.feed.url,
      url: foloFeedToSubscribeUrl(item.feed),
      category: '趋势',
      foloFeedId: item.feed.id || item.feedId,
    });
  }

  async function subscribeRoute(namespace: string, route: FoloRsshubRoute) {
    await subscribeUrl({
      id: `${namespace}:${route.path}`,
      title: route.name || route.example,
      url: foloRouteExampleToSubscribeUrl(route.example),
      category: FOLO_RSSHUB_CATEGORY_LABELS[category()] || 'RSSHub',
    });
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="h-9 w-9"
          aria-label="刷新"
          disabled={trending.loading || rsshub.loading}
          onClick={() => {
            if (tab() === 'trending') void refetchTrending();
            else void refetchRsshub();
          }}
        >
          <RefreshIcon
            class={cn('h-4 w-4', (trending.loading || rsshub.loading) && 'animate-spin')}
          />
        </Button>
      </PageToolbar>

      <div class={cn(mainShellPageHost, 'overflow-hidden')}>
        <div class="flex h-0 min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden pb-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <AppTabs
              value={tab()}
              onChange={setTab}
              options={DISCOVER_TABS}
              labels={DISCOVER_TAB_LABELS}
              ariaLabel="发现类型"
              variant="drawer-inline"
              layout="inline"
            />
            <Show when={tab() === 'trending'}>
              <div class="flex items-center gap-2 text-xs text-muted-foreground">
                <span>语言</span>
                <AppSelect
                  value={language()}
                  onChange={(value) => value && setLanguage(value as DiscoverLanguage)}
                  options={[...DISCOVER_LANGUAGES]}
                  itemComponent={(itemProps) => (
                    <AppSelectItem item={itemProps.item}>
                      {DISCOVER_LANGUAGE_LABELS[itemProps.item.rawValue as DiscoverLanguage]}
                    </AppSelectItem>
                  )}
                >
                  <AppSelectTrigger layout="compact" class="w-28" aria-label="发现语言">
                    <AppSelectValue>
                      {(state) =>
                        DISCOVER_LANGUAGE_LABELS[
                          String(state.selectedOption() ?? 'cmn') as DiscoverLanguage
                        ]
                      }
                    </AppSelectValue>
                    <AppSelectIcon />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    <AppSelectListbox />
                  </AppSelectContent>
                </AppSelect>
              </div>
            </Show>
          </div>

          <Show when={tab() === 'trending'}>
            <div class="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
              <Show when={trending.error}>
                <ErrorBox message={String(trending.error)} onRetry={() => void refetchTrending()} />
              </Show>
              <Show when={trending.loading && !trending()}>
                <LoadingBox />
              </Show>
              <Show when={!trending.loading && (trending()?.length ?? 0) === 0 && !trending.error}>
                <EmptyBox text="暂无趋势数据" />
              </Show>
              <For each={trending() ?? []}>
                {(item) => (
                  <article class="flex items-start gap-3 rounded-xl border bg-card/40 px-3 py-3">
                    <DiscoverLogo
                      src={item.feed.image}
                      siteUrl={item.feed.siteUrl}
                      alt={item.feed.title || item.feed.url}
                    />
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-sm font-medium">
                        {item.feed.title || item.feed.url}
                      </div>
                      <div class="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {item.feed.description || item.feed.url}
                      </div>
                      <div class="mt-1 text-[11px] text-muted-foreground">
                        订阅 {item.analytics.subscriptionCount ?? 0} · 周更{' '}
                        {item.analytics.updatesPerWeek ?? 0}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      class="shrink-0"
                      disabled={!!busyId()}
                      onClick={() => void subscribeTrending(item)}
                    >
                      <PlusIcon class="mr-1 h-3.5 w-3.5" />
                      {busyId() === item.feedId ? '添加中' : '订阅'}
                    </Button>
                  </article>
                )}
              </For>
            </div>
          </Show>

          <Show when={tab() === 'categories'}>
            <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              <div class="overflow-x-auto pb-1">
                <AppTabs
                  value={category()}
                  onChange={setCategory}
                  options={FOLO_RSSHUB_CATEGORIES}
                  labels={FOLO_RSSHUB_CATEGORY_LABELS}
                  ariaLabel="RSSHub 分类"
                  variant="drawer-inline"
                  layout="inline"
                  tabsClass="min-w-max"
                />
              </div>
              <div class="relative">
                <SearchIcon class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <AppTextFieldBareInput
                  class="h-9 pl-8"
                  fieldClass="w-full"
                  placeholder="筛选路由名称 / 站点"
                  value={routeQuery()}
                  onInput={(e) => setRouteQuery(e.currentTarget.value)}
                />
              </div>
              <div class="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
                <Show when={rsshub.error}>
                  <ErrorBox message={String(rsshub.error)} onRetry={() => void refetchRsshub()} />
                </Show>
                <Show when={rsshub.loading && !rsshub()}>
                  <LoadingBox />
                </Show>
                <Show
                  when={!rsshub.loading && flatRoutes().length === 0 && !rsshub.error}
                >
                  <EmptyBox text="此分类下暂无路由" />
                </Show>
                <For each={flatRoutes().slice(0, 80)}>
                  {(row) => (
                    <article class="flex items-start gap-3 rounded-xl border bg-card/40 px-3 py-3">
                      <DiscoverLogo
                        siteUrl={row.namespaceUrl}
                        alt={row.namespaceName}
                        fallback="layout"
                      />
                      <div class="min-w-0 flex-1">
                        <div class="truncate text-sm font-medium">{row.route.name}</div>
                        <div class="mt-0.5 truncate text-xs text-muted-foreground">
                          {row.namespaceName} · {row.route.example}
                        </div>
                        <Show when={row.heat > 0}>
                          <div class="mt-1 text-[11px] text-muted-foreground">
                            热度订阅 {row.heat}
                          </div>
                        </Show>
                      </div>
                      <AppTooltip
                        disabled={Object.keys(row.route.parameters ?? {}).length === 0}
                      >
                        <AppTooltipTrigger
                          as={Button}
                          size="sm"
                          variant="outline"
                          class="shrink-0"
                          disabled={!!busyId()}
                          onClick={() => void subscribeRoute(row.namespace, row.route)}
                        >
                          <PlusIcon class="mr-1 h-3.5 w-3.5" />
                          订阅
                        </AppTooltipTrigger>
                        <AppTooltipContent>
                          将按官方示例路径订阅，参数可之后在源 URL 中调整
                        </AppTooltipContent>
                      </AppTooltip>
                    </article>
                  )}
                </For>
                <Show when={flatRoutes().length > 80}>
                  <div class="py-2 text-center text-xs text-muted-foreground">
                    仅展示前 80 条，请用搜索缩小范围
                  </div>
                </Show>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </section>
  );
}

function DiscoverLogo(props: {
  src?: string | null;
  siteUrl?: string | null;
  alt: string;
  fallback?: 'rss' | 'layout';
}) {
  const candidates = createMemo(() => {
    const list: string[] = [];
    // 优先 Folo 图标服务，避免第三方 CDN（如 pbs.twimg.com）404 / Tracking Prevention
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
    <div class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
      <Show
        when={current()}
        fallback={<FallbackIcon class="h-4 w-4 text-muted-foreground" />}
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

function LoadingBox() {
  return (
    <div class="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
      正在加载…
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
