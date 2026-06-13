import { createMemo, createResource, createSignal, For, Show } from 'solid-js';
import { Layout, Card, Button, ErrorBox, Loading, Input } from '@/components/Layout';
import { deleteRssStar, getRssStars, type WebRssStar } from '@/lib/api';
import { imageProxyUrl } from '@/lib/content-render';
import { formatResourceError, resourceError } from '@/lib/resource';
import { showToast } from '@/lib/toast';

function parseFavoritesRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [, qs = ''] = hash.split('?');
  const params = new URLSearchParams(qs);
  return {
    origin: params.get('origin') ?? params.get('url') ?? '',
  };
}

function formatStarTime(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildReadHref(star: WebRssStar) {
  const q = new URLSearchParams({
    origin: star.origin,
    link: star.link,
    title: star.title,
  });
  return `#/rss/read?${q}`;
}

export function RssFavoritesPage() {
  const route = parseFavoritesRoute();
  const [search, setSearch] = createSignal('');
  const [actionError, setActionError] = createSignal('');

  const [stars, { refetch }] = createResource(
    () => route.origin || '__all__',
    (key) => getRssStars(key === '__all__' ? undefined : key),
  );

  const filtered = createMemo(() => {
    const q = search().trim().toLowerCase();
    const list = stars() ?? [];
    if (!q) return list;
    return list.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.link.toLowerCase().includes(q) ||
        s.origin.toLowerCase().includes(q),
    );
  });

  async function handleUnstar(star: WebRssStar) {
    if (!confirm(`取消收藏「${star.title}」？`)) return;
    setActionError('');
    try {
      await deleteRssStar(star.origin, star.link);
      refetch();
      showToast('已取消收藏', 'success');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Layout title="RSS 收藏">
      <Show when={resourceError(stars) || actionError()}>
        <ErrorBox
          message={String(formatResourceError(resourceError(stars), '') || actionError())}
        />
      </Show>

      <div class="mb-4 flex flex-wrap gap-2">
        <Button variant="ghost" href="#/rss">
          ← 订阅源
        </Button>
        <Button variant="ghost" onClick={() => refetch()}>
          刷新
        </Button>
      </div>

      <Input
        class="mb-4 max-w-md"
        value={search()}
        onInput={setSearch}
        placeholder="搜索标题、链接或来源…"
      />

      <Show when={!stars.loading} fallback={<Loading />}>
        <Show
          when={filtered().length}
          fallback={<Card class="text-center text-muted-foreground">暂无收藏</Card>}
        >
          <div class="space-y-2">
            <For each={filtered()}>
              {(star) => {
                const cover = star.image
                  ? imageProxyUrl(star.image, star.origin, 96)
                  : '';
                return (
                  <Card class="flex flex-wrap items-center justify-between gap-3 py-3">
                    <a href={buildReadHref(star)} class="flex min-w-0 flex-1 gap-3">
                      <Show when={cover}>
                        <img
                          src={cover}
                          alt=""
                          class="rss-article-cover h-14 w-14 shrink-0 rounded-lg object-cover"
                          loading="lazy"
                        />
                      </Show>
                      <div class="min-w-0">
                        <p class="font-medium leading-snug">{star.title}</p>
                        <p class="mt-1 truncate text-xs text-muted-foreground">{star.origin}</p>
                        <p class="text-xs text-muted-foreground">收藏于 {formatStarTime(star.starTime)}</p>
                      </div>
                    </a>
                    <Button
                      variant="ghost"
                      class="px-3! py-1!"
                      onClick={() => handleUnstar(star)}
                    >
                      取消收藏
                    </Button>
                  </Card>
                );
              }}
            </For>
          </div>
        </Show>
      </Show>
    </Layout>
  );
}
