import { createResource, For, Show } from 'solid-js';
import { Layout, Card, ErrorBox, Loading } from '@/components/Layout';
import { coverUrl, getBookshelf, type WebBook } from '@/lib/api';

function BookCard(props: { book: WebBook }) {
  const b = () => props.book;
  const href = () => {
    const idx = b().durChapterIndex ?? 0;
    return `#/reader?url=${encodeURIComponent(b().bookUrl)}&index=${idx}&name=${encodeURIComponent(b().name)}`;
  };
  const cover = () => coverUrl(b());

  return (
    <a
      href={href()}
      class="group flex gap-3 rounded-xl border border-border bg-card p-3 transition hover:border-primary/40 hover:shadow-md"
    >
      <div class="h-24 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
        <Show when={cover()} fallback={<div class="flex h-full items-center justify-center text-xs text-muted-foreground">无封面</div>}>
          <img src={cover()} alt="" class="h-full w-full object-cover" loading="lazy" />
        </Show>
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate font-medium group-hover:text-primary">{b().name}</p>
        <p class="truncate text-sm text-muted-foreground">{b().author || '未知作者'}</p>
        <p class="mt-1 truncate text-xs text-muted-foreground">{b().originName}</p>
        <Show when={b().durChapterTitle}>
          <p class="mt-2 truncate text-xs">读到：{b().durChapterTitle}</p>
        </Show>
      </div>
    </a>
  );
}

export function BookshelfPage() {
  const [books, { error }] = createResource(getBookshelf);

  return (
    <Layout title="书架">
      <Show when={error()} fallback={null}>
        <ErrorBox message={(error() as Error).message} />
      </Show>
      <Show when={!books.loading && !error()} fallback={<Loading />}>
        <Show
          when={books()?.length}
          fallback={<Card>书架为空，请在 Reader 中添加书籍。</Card>}
        >
          <div class="grid gap-3 sm:grid-cols-2">
            <For each={books()}>{(book) => <BookCard book={book} />}</For>
          </div>
        </Show>
      </Show>
    </Layout>
  );
}
