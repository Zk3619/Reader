import { createEffect, createResource, createSignal, For, Show } from 'solid-js';
import { Layout, Card, Button, ErrorBox, Loading } from '@/components/Layout';
import {
  clearRssArticles,
  getRssArticles,
  getRssArticleRead,
  getRssSorts,
  getRssSource,
  refreshRssArticles,
  type WebRssArticle,
} from '@/lib/api';
import { imageProxyUrl } from '@/lib/content-render';
import { showToast } from '@/lib/toast';
import { formatResourceError, resourceError } from '@/lib/resource';

function parseArticlesRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [, qs = ''] = hash.split('?');
  const params = new URLSearchParams(qs);
  return {
    sourceUrl: params.get('url') ?? params.get('origin') ?? '',
    sort: params.get('sort') ?? '',
  };
}

function buildReadHref(origin: string, article: WebRssArticle) {
  const q = new URLSearchParams({
    origin,
    link: article.link,
    title: article.title,
  });
  return `#/rss/read?${q}`;
}

function buildSourceReadHref(origin: string) {
  return `#/rss/read?${new URLSearchParams({ origin, start: '1' })}`;
}

export function RssArticlesPage() {
  const route = parseArticlesRoute();
  const [activeSort, setActiveSort] = createSignal(route.sort);
  const [articles, setArticles] = createSignal<WebRssArticle[]>([]);
  const [refreshing, setRefreshing] = createSignal(false);
  const [actionError, setActionError] = createSignal('');

  const [source] = createResource(
    () => route.sourceUrl,
    (url) => (url ? getRssSource(url) : Promise.reject(new Error('缺少订阅源 url'))),
  );

  const [sorts] = createResource(
    () => route.sourceUrl,
    (url) => (url ? getRssSorts(url) : Promise.resolve([])),
  );

  const [cachedArticles, { refetch: refetchCached }] = createResource(
    () => ({ origin: route.sourceUrl, sort: activeSort() }),
    ({ origin, sort }) => (origin ? getRssArticles(origin, sort) : Promise.resolve([])),
  );

  createEffect(() => {
    const list = cachedArticles();
    if (list) setArticles(list);
  });

  const sourceName = () => source()?.sourceName ?? route.sourceUrl;

  async function handleRefresh() {
    const origin = route.sourceUrl;
    if (!origin || refreshing()) return;
    setRefreshing(true);
    setActionError('');
    try {
      const result = await refreshRssArticles(origin, activeSort() || undefined);
      setActiveSort(result.sort);
      setArticles(result.articles);
      showToast(`刷新完成，${result.count} 篇文章`, 'success');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
      showToast('刷新失败', 'error');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleClear() {
    const origin = route.sourceUrl;
    if (!origin || !confirm(`清除「${sourceName()}」的本地文章缓存？`)) return;
    setActionError('');
    try {
      await clearRssArticles(origin, activeSort() || undefined);
      setArticles([]);
      refetchCached();
      showToast('已清除', 'success');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Layout title={`订阅 · ${sourceName()}`}>
      <Show when={resourceError(source) || actionError()}>
        <ErrorBox
          message={String(
            formatResourceError(resourceError(source), '') || actionError(),
          )}
        />
      </Show>

      <div class="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" href="#/rss">
          ← 订阅源
        </Button>
        <Button variant="ghost" href={`#/rss/edit?url=${encodeURIComponent(route.sourceUrl)}`}>
          编辑源
        </Button>
        <Button onClick={handleRefresh} disabled={refreshing() || source.loading}>
          {refreshing() ? '刷新中…' : '刷新文章'}
        </Button>
        <Button variant="secondary" href={buildSourceReadHref(route.sourceUrl)} disabled={!route.sourceUrl}>
          打开订阅
        </Button>
        <Button variant="ghost" href={`#/rss/history?origin=${encodeURIComponent(route.sourceUrl)}`}>
          阅读记录
        </Button>
        <Button variant="ghost" onClick={handleClear} disabled={!articles().length}>
          清除缓存
        </Button>
      </div>

      <Show when={!sorts.loading && (sorts()?.length ?? 0) > 1}>
        <div class="mb-4 flex flex-wrap gap-2">
          <For each={sorts() ?? []}>
            {(entry) => (
              <Button
                variant={activeSort() === entry.name ? 'primary' : 'secondary'}
                class="px-3! py-1!"
                onClick={() => {
                  setActiveSort(entry.name);
                  refetchCached();
                }}
              >
                {entry.name || '默认'}
              </Button>
            )}
          </For>
        </div>
      </Show>

      <Show when={!source.loading && !cachedArticles.loading} fallback={<Loading />}>
        <Show
          when={articles().length}
          fallback={
            <Card class="space-y-3 text-center text-muted-foreground">
              <p>暂无文章，点击「刷新文章」从订阅源拉取。</p>
              <Button onClick={handleRefresh} disabled={refreshing()}>
                刷新文章
              </Button>
            </Card>
          }
        >
          <div class="space-y-2">
            <For each={articles()}>
              {(article) => {
                const cover = article.image
                  ? imageProxyUrl(article.image, article.origin, 120)
                  : '';
                return (
                  <a
                    href={buildReadHref(route.sourceUrl, article)}
                    class="rss-article-card block rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-accent/40"
                  >
                    <div class="flex gap-3">
                      <Show when={cover}>
                        <img
                          src={cover}
                          alt=""
                          class="rss-article-cover h-20 w-20 shrink-0 rounded-lg object-cover"
                          loading="lazy"
                        />
                      </Show>
                      <div class="min-w-0 flex-1">
                        <p
                          class="font-medium leading-snug"
                          classList={{ 'text-muted-foreground': article.read }}
                        >
                          {article.title}
                        </p>
                        <Show when={article.pubDate || article.description}>
                          <p class="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {article.pubDate}
                            {article.pubDate && article.description ? ' · ' : ''}
                            {article.description}
                          </p>
                        </Show>
                        <Show when={article.read}>
                          <span class="mt-1 inline-block text-xs text-muted-foreground">已读</span>
                        </Show>
                      </div>
                    </div>
                  </a>
                );
              }}
            </For>
          </div>
        </Show>
      </Show>
    </Layout>
  );
}
