import { createEffect, createResource, createSignal, For, Show } from 'solid-js';
import { Layout, Card, ErrorBox, Loading } from '@/components/Layout';
import { getBookContent, getChapterList, saveBookProgress } from '@/lib/api';

function parseReaderRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = hash.split('?');
  const params = new URLSearchParams(qs);
  return {
    path,
    bookUrl: params.get('url') ?? '',
    index: Number(params.get('index') ?? '0'),
    name: params.get('name') ?? '',
  };
}

export function ReaderPage() {
  const route = parseReaderRoute();
  const [chapterIndex, setChapterIndex] = createSignal(route.index);

  const [chapters, { error: tocError }] = createResource(
    () => route.bookUrl,
    (url) => (url ? getChapterList(url) : Promise.reject(new Error('缺少 bookUrl'))),
  );

  const [content, { error: contentError }] = createResource(
    () => ({ url: route.bookUrl, index: chapterIndex() }),
    ({ url, index }) => getBookContent(url, index),
  );

  createEffect(() => {
    const list = chapters();
    const idx = chapterIndex();
    const ch = list?.[idx];
    if (!ch || !route.name) return;
    void saveBookProgress({
      name: route.name,
      author: '',
      durChapterIndex: idx,
      durChapterTitle: ch.title,
    });
  });

  const goChapter = (index: number) => {
    setChapterIndex(index);
    const url = new URL(window.location.href);
    url.hash = `#/reader?url=${encodeURIComponent(route.bookUrl)}&index=${index}&name=${encodeURIComponent(route.name)}`;
    history.replaceState(null, '', url.toString());
  };

  return (
    <Layout title={route.name || '阅读'}>
      <Show when={tocError() || contentError()}>
        <ErrorBox message={String((tocError() ?? contentError())?.message ?? '加载失败')} />
      </Show>
      <div class="grid gap-4 lg:grid-cols-[240px_1fr]">
        <Card class="max-h-[70vh] overflow-y-auto p-2">
          <p class="mb-2 px-2 text-sm font-medium text-muted-foreground">目录</p>
          <Show when={!chapters.loading} fallback={<Loading />}>
            <ul class="space-y-0.5 text-sm">
              <For each={chapters()}>
                {(ch) => (
                  <li>
                    <button
                      type="button"
                      class={`w-full rounded-md px-2 py-1.5 text-left hover:bg-accent ${chapterIndex() === ch.index ? 'bg-accent font-medium' : ''}`}
                      onClick={() => goChapter(ch.index)}
                    >
                      {ch.title}
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Card>
        <Card class="min-h-[60vh]">
          <Show when={!content.loading} fallback={<Loading />}>
            <article class="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed dark:prose-invert">
              {content() ?? ''}
            </article>
          </Show>
          <div class="mt-6 flex justify-between gap-2 border-t border-border pt-4">
            <button
              type="button"
              class="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40"
              disabled={chapterIndex() <= 0}
              onClick={() => goChapter(chapterIndex() - 1)}
            >
              上一章
            </button>
            <button
              type="button"
              class="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40"
              disabled={chapterIndex() >= (chapters()?.length ?? 1) - 1}
              onClick={() => goChapter(chapterIndex() + 1)}
            >
              下一章
            </button>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
