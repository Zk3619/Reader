import { createEffect, createResource, createSignal, Show } from 'solid-js';
import { Button, ErrorBox, Loading } from '@/components/Layout';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  deleteRssStar,
  getRssArticleRead,
  saveRssStar,
  type WebRssArticle,
} from '@/lib/api';
import { renderChapterContent } from '@/lib/content-render';
import { formatResourceError, resourceError } from '@/lib/resource';
import { showToast } from '@/lib/toast';

function parseRssReadRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [, qs = ''] = hash.split('?');
  const params = new URLSearchParams(qs);
  return {
    origin: params.get('origin') ?? params.get('url') ?? '',
    link: params.get('link') ?? '',
    title: params.get('title') ?? '',
    start: params.get('start') === '1' || params.get('startHtml') === '1',
    openUrl: params.get('openUrl') ?? '',
  };
}

function buildArticlesHref(origin: string) {
  return `#/rss/articles?url=${encodeURIComponent(origin)}`;
}

function articleToStar(article: WebRssArticle): Parameters<typeof saveRssStar>[0] {
  return {
    origin: article.origin,
    link: article.link,
    sort: article.sort,
    title: article.title,
    starTime: Date.now(),
    pubDate: article.pubDate,
    description: article.description,
    content: article.content,
    image: article.image,
    group: article.group,
    type: article.type,
    durPos: article.durPos,
  };
}

export function RssReadPage() {
  const route = parseRssReadRoute();
  const [iframeBlocked, setIframeBlocked] = createSignal(false);
  const [reloadKey, setReloadKey] = createSignal(0);
  const [starred, setStarred] = createSignal(false);
  const [starBusy, setStarBusy] = createSignal(false);

  const [session, { refetch }] = createResource(
    () => ({
      origin: route.origin,
      link: route.link,
      title: route.title,
      start: route.start,
      openUrl: route.openUrl,
      key: reloadKey(),
    }),
    (params) => {
      if (!params.origin) return Promise.reject(new Error('缺少 origin'));
      return getRssArticleRead({
        origin: params.origin,
        link: params.link || undefined,
        title: params.title || undefined,
        start: params.start,
        openUrl: params.openUrl || undefined,
      });
    },
  );

  createEffect(() => {
    setStarred(Boolean(session()?.starred));
  });

  const pageTitle = () => session()?.title ?? route.title ?? 'RSS 阅读';

  const handleRefresh = () => {
    setIframeBlocked(false);
    setReloadKey((k) => k + 1);
    refetch();
    showToast('已刷新');
  };

  const openExternal = (url?: string) => {
    const target = url ?? session()?.directUrl ?? session()?.pageUrl ?? route.link;
    if (target) window.open(target, '_blank', 'noopener,noreferrer');
  };

  const canStar = () => Boolean(route.link || session()?.article?.link);

  const toggleStar = async () => {
    const article = session()?.article;
    const origin = route.origin;
    const link = article?.link ?? route.link;
    const title = article?.title ?? route.title ?? pageTitle();
    if (!origin || !link) {
      showToast('当前页无法收藏', 'error');
      return;
    }
    setStarBusy(true);
    try {
      if (starred()) {
        await deleteRssStar(origin, link);
        setStarred(false);
        showToast('已取消收藏', 'success');
      } else {
        await saveRssStar(
          articleToStar(
            article ?? {
              origin,
              link,
              sort: '',
              title,
              order: 0,
              group: '默认分组',
              read: true,
              type: 0,
              durPos: 0,
            },
          ),
        );
        setStarred(true);
        showToast('已收藏', 'success');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败', 'error');
    } finally {
      setStarBusy(false);
    }
  };

  const renderHtml = (html: string, pageUrl: string) =>
    renderChapterContent(html, pageUrl, 720);

  return (
    <div class="rss-read-page min-h-screen bg-background text-foreground">
      <header class="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div class="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Button variant="ghost" class="px-3! py-1!" href={buildArticlesHref(route.origin)}>
            ← 列表
          </Button>
          <h1 class="min-w-0 flex-1 truncate text-base font-semibold">{pageTitle()}</h1>
          <Show when={canStar()}>
            <Button
              variant="ghost"
              class="px-3! py-1!"
              disabled={starBusy()}
              onClick={toggleStar}
            >
              {starred() ? '★ 已藏' : '☆ 收藏'}
            </Button>
          </Show>
          <Button variant="ghost" class="px-3! py-1!" onClick={handleRefresh} disabled={session.loading}>
            刷新
          </Button>
          <Button
            variant="ghost"
            class="px-3! py-1!"
            onClick={() => openExternal()}
            disabled={!session()?.directUrl && !session()?.pageUrl && !route.link}
          >
            外链
          </Button>
          <ThemeToggle compact />
        </div>
      </header>

      <Show when={resourceError(session)}>
        <div class="mx-auto max-w-3xl p-4">
          <ErrorBox message={String(formatResourceError(resourceError(session), '加载失败'))} />
          <div class="mt-4 flex gap-2">
            <Button onClick={handleRefresh}>重试</Button>
            <Show when={route.link}>
              <Button variant="secondary" onClick={() => openExternal(route.link)}>
                在浏览器打开
              </Button>
            </Show>
          </div>
        </div>
      </Show>

      <Show when={session.loading && !resourceError(session)}>
        <div class="flex min-h-[50vh] items-center justify-center">
          <Loading />
        </div>
      </Show>

      <Show when={!session.loading && !resourceError(session) && session()} keyed>
        {(data) => (
          <>
            <Show when={data.mode === 'content' || data.mode === 'startHtml'}>
              <article
                class="reader-content rss-read-content mx-auto max-w-3xl px-4 py-6"
                innerHTML={renderHtml(data.html ?? '', data.pageUrl)}
              />
            </Show>

            <Show when={data.mode === 'proxy' && data.html}>
              <div class="mx-auto max-w-3xl p-4">
                <p class="mb-2 text-xs text-muted-foreground">服务端代理模式</p>
                <iframe
                  class="rss-read-iframe min-h-[calc(100vh-5rem)] w-full rounded-lg border border-border bg-white"
                  title={data.title}
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                  srcdoc={data.html}
                />
              </div>
            </Show>

            <Show when={data.mode === 'url' && data.directUrl}>
              <div class="mx-auto max-w-3xl space-y-3 p-4">
                <Show when={iframeBlocked()}>
                  <div class="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                    <p>该页面无法在 Web 内嵌显示（可能被站点禁止 iframe）。</p>
                    <Button class="mt-3" onClick={() => openExternal(data.directUrl)}>
                      在浏览器中打开
                    </Button>
                  </div>
                </Show>
                <iframe
                  class="rss-read-iframe min-h-[calc(100vh-4rem)] w-full rounded-lg border border-border bg-white"
                  src={data.directUrl}
                  title={data.title}
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                  onLoad={(e) => {
                    try {
                      const doc = (e.currentTarget as HTMLIFrameElement).contentDocument;
                      if (!doc) setIframeBlocked(true);
                    } catch {
                      /* cross-origin is ok */
                    }
                  }}
                  onError={() => setIframeBlocked(true)}
                />
              </div>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}
