import { createMemo, createResource, createSignal, For, Show } from 'solid-js';
import { Layout, Card, Button, ErrorBox, Loading, Input } from '@/components/Layout';
import { deleteRssReadRecord, getRssReadRecords, type WebRssReadRecord } from '@/lib/api';
import { imageProxyUrl } from '@/lib/content-render';
import { formatResourceError, resourceError } from '@/lib/resource';
import { showToast } from '@/lib/toast';

function parseHistoryRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [, qs = ''] = hash.split('?');
  const params = new URLSearchParams(qs);
  return {
    origin: params.get('origin') ?? params.get('url') ?? '',
  };
}

function formatReadTime(ts?: number) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildReadHref(record: WebRssReadRecord) {
  const q = new URLSearchParams({
    origin: record.origin,
    link: record.record,
    title: record.title ?? record.record,
  });
  return `#/rss/read?${q}`;
}

export function RssHistoryPage() {
  const route = parseHistoryRoute();
  const [search, setSearch] = createSignal('');
  const [actionError, setActionError] = createSignal('');

  const [records, { refetch }] = createResource(
    () => route.origin || '__all__',
    (key) => getRssReadRecords(key === '__all__' ? undefined : key),
  );

  const filtered = createMemo(() => {
    const q = search().trim().toLowerCase();
    const list = records() ?? [];
    if (!q) return list;
    return list.filter(
      (r) =>
        (r.title?.toLowerCase().includes(q) ?? false) ||
        r.record.toLowerCase().includes(q) ||
        r.origin.toLowerCase().includes(q),
    );
  });

  async function handleDelete(record: WebRssReadRecord) {
    if (!confirm(`删除阅读记录「${record.title ?? record.record}」？`)) return;
    setActionError('');
    try {
      await deleteRssReadRecord(record.record);
      refetch();
      showToast('已删除', 'success');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Layout title="RSS 阅读记录">
      <Show when={resourceError(records) || actionError()}>
        <ErrorBox
          message={String(
            formatResourceError(resourceError(records), '') || actionError(),
          )}
        />
      </Show>

      <div class="mb-4 flex flex-wrap gap-2">
        <Button variant="ghost" href="#/rss">
          ← 订阅源
        </Button>
        <Show when={route.origin}>
          <Button variant="ghost" href={`#/rss/articles?url=${encodeURIComponent(route.origin)}`}>
            返回文章列表
          </Button>
        </Show>
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

      <Show when={!records.loading} fallback={<Loading />}>
        <Show
          when={filtered().length}
          fallback={<Card class="text-center text-muted-foreground">暂无阅读记录</Card>}
        >
          <div class="space-y-2">
            <For each={filtered()}>
              {(record) => {
                const cover = record.image
                  ? imageProxyUrl(record.image, record.origin, 96)
                  : '';
                return (
                  <Card class="flex flex-wrap items-center justify-between gap-3 py-3">
                    <a href={buildReadHref(record)} class="flex min-w-0 flex-1 gap-3">
                      <Show when={cover}>
                        <img
                          src={cover}
                          alt=""
                          class="rss-article-cover h-14 w-14 shrink-0 rounded-lg object-cover"
                          loading="lazy"
                        />
                      </Show>
                      <div class="min-w-0">
                        <p class="font-medium leading-snug">{record.title ?? record.record}</p>
                        <p class="mt-1 truncate text-xs text-muted-foreground">{record.origin}</p>
                        <p class="text-xs text-muted-foreground">{formatReadTime(record.readTime)}</p>
                      </div>
                    </a>
                    <Button
                      variant="danger"
                      class="px-3! py-1!"
                      onClick={() => handleDelete(record)}
                    >
                      删除
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
