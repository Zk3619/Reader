import { createResource, For, Show } from 'solid-js';
import { Layout, Card, ErrorBox, Loading } from '@/components/Layout';
import { getBookSources } from '@/lib/api';

export function SourcesPage() {
  const [sources, { error }] = createResource(getBookSources);

  return (
    <Layout title="书源">
      <Show when={error()} fallback={null}>
        <ErrorBox message={(error() as Error).message} />
      </Show>
      <Show when={!sources.loading && !error()} fallback={<Loading />}>
        <Show when={sources()?.length} fallback={<Card>暂无书源</Card>}>
          <div class="space-y-2">
            <For each={sources()}>
              {(s) => (
                <Card class="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div class="min-w-0">
                    <p class="font-medium">{s.bookSourceName}</p>
                    <p class="truncate text-xs text-muted-foreground">{s.bookSourceUrl}</p>
                    <Show when={s.bookSourceGroup}>
                      <p class="text-xs text-muted-foreground">分组：{s.bookSourceGroup}</p>
                    </Show>
                  </div>
                  <span
                    class={`rounded-full px-2 py-0.5 text-xs ${s.enabled !== false ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-muted text-muted-foreground'}`}
                  >
                    {s.enabled !== false ? '启用' : '禁用'}
                  </span>
                </Card>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </Layout>
  );
}
