import { createMemo, createResource, createSignal, For, Show, onCleanup } from 'solid-js';
import { Card, ErrorBox, Loading, Input, Button } from '@/components/Layout';
import { ApiConnectionPanel } from '@/components/ApiConnectionPanel';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  coverUrl,
  deleteBook,
  getBookshelf,
  proxyCoverUrl,
  runSearchBookWs,
  saveBook,
  type WebBook,
  type WebSearchBook,
} from '@/lib/api';
import { buildReaderHref } from '@/lib/reader-route';
import { loadRecentReading, recentReadingHref, saveRecentReading } from '@/lib/recent-reading';
import { formatResourceError, resourceError } from '@/lib/resource';

type ViewMode = 'list' | 'grid';

function formatShelfTime(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function kindTags(kind?: string): string[] {
  if (!kind?.trim()) return [];
  return kind.split(/[,，、|/]/).map((s) => s.trim()).filter(Boolean).slice(0, 2);
}

function BookCover(props: { book: WebBook | WebSearchBook; class?: string }) {
  const [src, setSrc] = createSignal(coverUrl(props.book as WebBook));
  const [failed, setFailed] = createSignal(false);

  return (
    <Show
      when={src() && !failed()}
      fallback={
        <div class={`flex items-center justify-center bg-muted text-xs text-muted-foreground ${props.class ?? ''}`}>
          无封面
        </div>
      }
    >
      <img
        src={src()}
        alt=""
        class={props.class}
        loading="lazy"
        onError={() => {
          const book = props.book as WebBook;
          const proxied = proxyCoverUrl(book.customCoverUrl || book.coverUrl || book.bookUrl);
          if (proxied && proxied !== src()) setSrc(proxied);
          else setFailed(true);
        }}
      />
    </Show>
  );
}

function BookListItem(props: { book: WebBook; onDelete: () => void }) {
  const href = () =>
    buildReaderHref({
      bookUrl: props.book.bookUrl,
      name: props.book.name,
      author: props.book.author,
      index: props.book.durChapterIndex ?? 0,
      pos: props.book.durChapterPos,
    });

  return (
    <div class="group flex gap-3 rounded-xl border border-border bg-card p-3 transition hover:border-primary/40 hover:shadow-md">
      <a
        href={href()}
        class="flex min-w-0 flex-1 gap-3"
        onClick={() => saveRecentReading(props.book)}
      >
        <BookCover book={props.book} class="h-24 w-16 shrink-0 rounded-md object-cover" />
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium group-hover:text-primary">{props.book.name}</p>
          <p class="truncate text-sm text-muted-foreground">{props.book.author || '未知作者'}</p>
          <p class="mt-1 truncate text-xs text-muted-foreground">{props.book.originName}</p>
          <Show when={props.book.durChapterTitle}>
            <p class="mt-1 truncate text-xs">读到：{props.book.durChapterTitle}</p>
          </Show>
          <Show when={props.book.totalChapterNum}>
            <p class="mt-0.5 text-xs text-muted-foreground">共 {props.book.totalChapterNum} 章</p>
          </Show>
          <Show when={props.book.lastCheckTime}>
            <p class="text-xs text-muted-foreground">更新 {formatShelfTime(props.book.lastCheckTime)}</p>
          </Show>
        </div>
      </a>
      <Button variant="danger" class="self-start px-2! py-1! text-xs" onClick={props.onDelete}>
        删除
      </Button>
    </div>
  );
}

function BookGridItem(props: { book: WebBook; onDelete: () => void }) {
  const href = () =>
    buildReaderHref({
      bookUrl: props.book.bookUrl,
      name: props.book.name,
      author: props.book.author,
      index: props.book.durChapterIndex ?? 0,
      pos: props.book.durChapterPos,
    });

  return (
    <div class="group relative rounded-xl border border-border bg-card p-3 transition hover:border-primary/40 hover:shadow-md">
      <a href={href()} class="block" onClick={() => saveRecentReading(props.book)}>
        <BookCover book={props.book} class="mx-auto mb-2 h-36 w-24 rounded-md object-cover" />
        <p class="truncate text-center text-sm font-medium group-hover:text-primary">{props.book.name}</p>
        <p class="truncate text-center text-xs text-muted-foreground">{props.book.author || '未知作者'}</p>
      </a>
      <Button
        variant="danger"
        class="absolute right-2 top-2 px-2! py-0.5! text-xs opacity-0 transition group-hover:opacity-100"
        onClick={props.onDelete}
      >
        删
      </Button>
    </div>
  );
}

export function BookshelfPage() {
  const VIEW_KEY = 'reader_web_bookshelf_view';
  const [search, setSearch] = createSignal('');
  const [viewMode, setViewMode] = createSignal<ViewMode>(
    (localStorage.getItem(VIEW_KEY) as ViewMode) || 'list',
  );
  const [actionError, setActionError] = createSignal('');
  const [onlineMode, setOnlineMode] = createSignal(false);
  const [searching, setSearching] = createSignal(false);
  const [searchResults, setSearchResults] = createSignal<WebSearchBook[]>([]);
  const [books, { refetch }] = createResource(getBookshelf);
  const recent = () => loadRecentReading();

  let searchWs: WebSocket | null = null;

  const sortedBooks = createMemo(() => {
    const list = [...(books() ?? [])];
    list.sort((a, b) => (b.durChapterTime ?? b.lastCheckTime ?? 0) - (a.durChapterTime ?? a.lastCheckTime ?? 0));
    return list;
  });

  const filtered = createMemo(() => {
    const q = search().trim().toLowerCase();
    const list = sortedBooks();
    if (!q) return list;
    return list.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.author ?? '').toLowerCase().includes(q) ||
        (b.originName ?? '').toLowerCase().includes(q),
    );
  });

  function switchView(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem(VIEW_KEY, mode);
  }

  function stopOnlineSearch() {
    searchWs?.close();
    searchWs = null;
    setSearching(false);
    setOnlineMode(false);
    setSearchResults([]);
  }

  function runOnlineSearch() {
    const key = search().trim();
    if (!key) return;
    searchWs?.close();
    setOnlineMode(true);
    setSearching(true);
    setSearchResults([]);
    setActionError('');
    searchWs = runSearchBookWs(
      key,
      (results) => setSearchResults(results),
      () => setSearching(false),
      (msg) => setActionError(msg),
    );
  }

  async function openSearchBook(book: WebSearchBook) {
    setActionError('');
    try {
      await saveBook({
        name: book.name,
        author: book.author,
        bookUrl: book.bookUrl,
        coverUrl: book.coverUrl,
        originName: book.originName,
        latestChapterTitle: book.latestChapterTitle,
      });
      refetch();
      saveRecentReading(
        { name: book.name, author: book.author, bookUrl: book.bookUrl, originName: book.originName },
        0,
        book.latestChapterTitle,
        0,
      );
      window.location.hash = buildReaderHref({
        bookUrl: book.bookUrl,
        name: book.name,
        author: book.author,
        index: 0,
        pos: 0,
        searchBook: true,
      });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  function openRecent() {
    const r = recent();
    if (!r) return;
    const onShelf = (books() ?? []).some((b) => b.bookUrl === r.bookUrl);
    if (!onShelf) {
      setSearch(r.name);
      runOnlineSearch();
      return;
    }
    window.location.hash = recentReadingHref(r);
  }

  async function handleDelete(book: WebBook) {
    if (!confirm(`确定从书架删除「${book.name}」？`)) return;
    setActionError('');
    try {
      await deleteBook(book);
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  onCleanup(() => searchWs?.close());

  return (
    <div class="bookshelf-page">
      <aside class="bookshelf-nav">
        <div class="mb-6">
          <a href="#/" class="text-lg font-bold hover:text-primary">Reader Web</a>
          <p class="mt-1 text-xs text-muted-foreground">昨日邻家乞新火，晓窗分与读书灯</p>
        </div>

        <div class="mb-4 space-y-2">
          <Input
            value={search()}
            onInput={(v) => {
              setSearch(v);
              if (!v.trim()) stopOnlineSearch();
            }}
            placeholder="搜索书名、作者…（Enter 在线搜书）"
            onKeyDown={(e) => {
              if (e.key === 'Enter') runOnlineSearch();
            }}
          />
          <Button class="w-full" onClick={runOnlineSearch} disabled={searching() || !search().trim()}>
            {searching() ? '搜索中…' : '在线搜书'}
          </Button>
          <Show when={onlineMode()}>
            <Button variant="ghost" class="w-full" onClick={stopOnlineSearch}>
              返回书架
            </Button>
          </Show>
        </div>

        <Show when={recent()}>
          <button
            type="button"
            class="mb-4 w-full rounded-lg border border-border bg-card p-3 text-left text-sm hover:border-primary/40"
            onClick={openRecent}
          >
            <p class="text-xs text-muted-foreground">最近阅读</p>
            <p class="truncate font-medium">{recent()!.name}</p>
            <Show when={recent()!.chapterTitle}>
              <p class="truncate text-xs opacity-70">{recent()!.chapterTitle}</p>
            </Show>
          </button>
        </Show>

        <nav class="space-y-1 text-sm">
          <a href="#/bookshelf" class="block rounded-md px-2 py-1.5 font-medium bg-accent">书架</a>
          <a href="#/sources" class="block rounded-md px-2 py-1.5 hover:bg-accent">书源</a>
          <a href="#/upload" class="block rounded-md px-2 py-1.5 hover:bg-accent">WiFi 传书</a>
          <a href="#/backup" class="block rounded-md px-2 py-1.5 hover:bg-accent" target="_blank">备份</a>
          <a href="#/help" class="block rounded-md px-2 py-1.5 hover:bg-accent">帮助</a>
        </nav>

        <div class="mt-6 space-y-4">
          <ThemeToggle compact />
          <ApiConnectionPanel compact />
        </div>
      </aside>

      <main class="bookshelf-main">
        <Show when={resourceError(books) || actionError()}>
          <ErrorBox message={String(formatResourceError(resourceError(books), '') || actionError())} />
        </Show>

        <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 class="text-xl font-semibold">{onlineMode() ? '搜索结果' : '我的书架'}</h1>
          <Show when={!onlineMode()}>
            <div class="flex rounded-lg border border-border p-0.5 text-sm">
              <button
                type="button"
                class={`rounded-md px-3 py-1 ${viewMode() === 'list' ? 'bg-accent font-medium' : ''}`}
                onClick={() => switchView('list')}
              >
                列表
              </button>
              <button
                type="button"
                class={`rounded-md px-3 py-1 ${viewMode() === 'grid' ? 'bg-accent font-medium' : ''}`}
                onClick={() => switchView('grid')}
              >
                网格
              </button>
            </div>
          </Show>
        </div>

        <Show when={onlineMode()}>
          <Show when={searching() && searchResults().length === 0} fallback={null}>
            <Loading />
          </Show>
          <Show when={!searching() && searchResults().length === 0}>
            <Card>未找到相关书籍</Card>
          </Show>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <For each={searchResults()}>
              {(book) => (
                <button
                  type="button"
                  class="flex gap-3 rounded-xl border border-border bg-card p-3 text-left transition hover:border-primary/40 hover:shadow-md"
                  onClick={() => void openSearchBook(book)}
                >
                  <BookCover book={book} class="h-24 w-16 shrink-0 rounded-md object-cover" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-medium">{book.name}</p>
                    <p class="truncate text-sm text-muted-foreground">{book.author || '未知作者'}</p>
                    <p class="mt-1 truncate text-xs text-muted-foreground">{book.originName}</p>
                    <Show when={kindTags(book.kind).length}>
                      <div class="mt-1 flex flex-wrap gap-1">
                        <For each={kindTags(book.kind)}>
                          {(tag) => (
                            <span class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                          )}
                        </For>
                      </div>
                    </Show>
                    <Show when={book.intro}>
                      <p class="mt-1 line-clamp-2 text-xs opacity-70">{book.intro}</p>
                    </Show>
                    <Show when={book.latestChapterTitle}>
                      <p class="mt-1 truncate text-xs opacity-60">最新：{book.latestChapterTitle}</p>
                    </Show>
                  </div>
                </button>
              )}
            </For>
          </div>
        </Show>

        <Show when={!onlineMode()}>
          <Show when={!books.loading && !resourceError(books)} fallback={<Loading />}>
            <Show when={filtered().length} fallback={<Card>书架为空，请在线搜书或在本机 Reader 中添加书籍。</Card>}>
              <Show
                when={viewMode() === 'list'}
                fallback={
                  <div class="grid gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    <For each={filtered()}>
                      {(book) => <BookGridItem book={book} onDelete={() => handleDelete(book)} />}
                    </For>
                  </div>
                }
              >
                <div class="grid gap-3 sm:grid-cols-2">
                  <For each={filtered()}>
                    {(book) => <BookListItem book={book} onDelete={() => handleDelete(book)} />}
                  </For>
                </div>
              </Show>
            </Show>
          </Show>
        </Show>
      </main>
    </div>
  );
}
