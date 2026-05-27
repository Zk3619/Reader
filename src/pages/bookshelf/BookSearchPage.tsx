/**
 * 书籍搜索页（对齐 Legado SearchActivity）
 * 输入：本地书架匹配 + 历史；回车：多书源全网搜索
 */

import {
  createSignal,
  createEffect,
  createMemo,
  onMount,
  onCleanup,
  Show,
  For,
} from 'solid-js';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { SearchBookResultRow } from '@/components/bookshelf/SearchBookResultRow';
import { BookSearchScopeDialog } from '@/components/bookshelf/BookSearchScopeDialog';
import { filterBookshelfBooks } from '@/lib/search/search-filters';
import {
  loadBookshelfSearchSubPageMode,
  saveBookshelfSearchSubPageMode,
  type SearchMode,
  isPrecisionSearchMode,
} from '@/lib/search/search-prefs';
import { buildShelfMembershipKeys, isSearchBookOnShelf } from '@/lib/bookshelf/shelf-membership';
import {
  collectSourceGroupNames,
  loadSearchScope,
  resolveSearchScopeSources,
  saveSearchScope,
  scopeDisplayLabel,
  formatSourceScope,
} from '@/lib/book-source/search-scope';
import { MultiSourceSearchSession } from '@/lib/book-source/multi-source-search';
import { searchBooks } from '@/lib/database/books';
import {
  clearSearchKeywords,
  deleteSearchKeyword,
  searchSearchKeywords,
  upsertSearchKeyword,
} from '@/lib/database/search-keywords';
import { getAllBooks } from '@/lib/database/books';
import { getEnabledSources } from '@/lib/database/sources';
import { addSearchBookToShelf } from '@/lib/bookshelf/save-book-to-shelf';
import { showAppToast } from '@/components/shared/AppToasts';
import { mainShellPageRoot, mainShellPageScroll } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';
import type { Book, BookSource, SearchBook, SearchKeyword } from '@/types';
import type { MergedSearchBook } from '@/lib/book-source/multi-source-search';
import { MoreIcon, SearchIcon } from '@/components/shared/icons';

export interface BookSearchPageProps {
  initialQuery?: string;
  /** 初始搜索范围（空=全部；分组逗号分隔；name::url=单书源） */
  initialScope?: string;
  onBack: () => void;
  onOpenBook: (book: Book) => void;
  onOpenBookInfo: (source: BookSource, book: SearchBook) => void;
  onAddedToShelf?: () => void;
}

function MenuRadioIndicator(props: { selected: boolean }) {
  return (
    <span class="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>
      <span class="relative flex size-4 items-center justify-center">
        <span class="size-4 rounded-full border border-primary" />
        <Show when={props.selected}>
          <span class="absolute size-2 rounded-full bg-primary" />
        </Show>
      </span>
    </span>
  );
}

export function BookSearchPage(props: BookSearchPageProps) {
  const [query, setQuery] = createSignal(props.initialQuery?.trim() ?? '');
  const [searchMode, setSearchMode] = createSignal<SearchMode>('name');
  const [scope, setScope] = createSignal(props.initialScope ?? '');
  const [helpVisible, setHelpVisible] = createSignal(true);
  const [submitted, setSubmitted] = createSignal(false);
  const [localBooks, setLocalBooks] = createSignal<Book[]>([]);
  const [history, setHistory] = createSignal<SearchKeyword[]>([]);
  const [onlineResults, setOnlineResults] = createSignal<MergedSearchBook[]>([]);
  const [searching, setSearching] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(false);
  const [manualStop, setManualStop] = createSignal(false);
  const [shelfKeys, setShelfKeys] = createSignal<Set<string>>(new Set());
  const [sourceGroups, setSourceGroups] = createSignal<string[]>([]);
  const [scopeDialogOpen, setScopeDialogOpen] = createSignal(false);
  const [addingUrl, setAddingUrl] = createSignal<string | null>(null);
  const session = new MultiSourceSearchSession();

  onMount(async () => {
    const mode = await loadBookshelfSearchSubPageMode();
    setSearchMode(mode);
    const savedScope = props.initialScope ?? (await loadSearchScope());
    setScope(savedScope);
    const all = await getAllBooks();
    setShelfKeys(buildShelfMembershipKeys(all));
    const sources = await getEnabledSources();
    setSourceGroups(collectSourceGroupNames(sources));
    if (props.initialQuery?.trim()) {
      void submitSearch(props.initialQuery.trim());
    }
  });

  onCleanup(() => {
    session.close();
  });

  const filteredLocal = createMemo(() => {
    const q = query().trim();
    if (!q) return [];
    return filterBookshelfBooks(localBooks(), q, searchMode());
  });

  createEffect(() => {
    const q = query().trim();
    if (!helpVisible()) return;
    void (async () => {
      if (q) {
        const list = await searchBooks(q);
        setLocalBooks(list);
      } else {
        setLocalBooks([]);
      }
      const hist = await searchSearchKeywords(q);
      setHistory(hist);
    })();
  });

  const persistMode = async (mode: SearchMode) => {
    setSearchMode(mode);
    await saveBookshelfSearchSubPageMode(mode);
    session.setSearchMode(mode);
    if (submitted() && query().trim()) {
      void submitSearch(query().trim(), true);
    }
  };

  const submitSearch = async (key: string, reRun = false) => {
    const trimmed = key.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setHelpVisible(false);
    setSubmitted(true);
    setManualStop(false);
    if (!reRun) {
      await upsertSearchKeyword(trimmed);
      const hist = await searchSearchKeywords(query().trim());
      setHistory(hist);
    }
    session.setSearchMode(searchMode());
    const sources = await resolveSearchScopeSources(scope());
    if (sources.length === 0) {
      showAppToast({
        title: '无法搜索',
        description: '当前范围内没有启用的书源',
        variant: 'destructive',
      });
      return;
    }
    session.setCallbacks({
      onStart: () => {
        setSearching(true);
        setOnlineResults([]);
      },
      onResults: (books) => setOnlineResults(books),
      onFinish: (empty, more) => {
        setSearching(false);
        setHasMore(more);
        if (empty && !isPrecisionSearchMode(searchMode()) && !scope().trim()) {
          showAppToast({
            title: '搜索结果为空',
            description: '可尝试切换为模糊或扩展搜索模式',
            variant: 'default',
          });
        } else if (empty && scope().trim()) {
          showAppToast({
            title: '搜索结果为空',
            description: `${scopeDisplayLabel(scope())} 内无结果，可扩大搜索范围`,
            variant: 'default',
          });
        }
      },
      onError: (msg) => {
        setSearching(false);
        showAppToast({ title: '搜索失败', description: msg, variant: 'destructive' });
      },
    });
    await session.search(trimmed, sources);
  };

  const handleSubmit = () => {
    void submitSearch(query());
  };

  const handleStopOrResume = async () => {
    if (searching()) {
      setManualStop(true);
      session.stop();
      setSearching(false);
      return;
    }
    if (hasMore() && submitted()) {
      const sources = await resolveSearchScopeSources(scope());
      void session.search('', sources);
    }
  };

  const loadMore = () => {
    if (manualStop() || searching() || !hasMore()) return;
    void session.search('', []);
  };

  const handleScroll = (e: Event) => {
    const el = e.currentTarget as HTMLDivElement;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 80) return;
    loadMore();
  };

  const openScope = async (newScope: string) => {
    setScope(newScope);
    await saveSearchScope(newScope);
    if (submitted() && query().trim()) {
      void submitSearch(query().trim(), true);
    }
  };

  const resolveSourceForBook = async (book: MergedSearchBook): Promise<BookSource | null> => {
    const url = book.mergedOriginUrls[0] ?? book.origin;
    if (!url) return null;
    const sources = await resolveSearchScopeSources(scope());
    return sources.find((s) => s.sourceUrl === url) ?? null;
  };

  return (
    <div class={cn(mainShellPageRoot, 'bg-background')}>
      <PageHeader title="搜索" onBack={props.onBack} showThemeToggle showWindowControls />
      <div class="shrink-0 border-b border-border/50 px-4 pb-3 space-y-2">
        <div class="flex items-center gap-2">
          <div class="relative flex h-10 flex-1 items-center rounded-lg border border-input bg-transparent pl-9 pr-3">
            <SearchIcon class="absolute left-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              enterkeyhint="search"
              placeholder="搜索书籍"
              value={query()}
              onInput={(e) => {
                setQuery(e.currentTarget.value);
                if (!submitted()) setHelpVisible(true);
              }}
              onFocus={() => {
                if (!submitted() || onlineResults().length === 0) setHelpVisible(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              class="h-full w-full bg-transparent text-sm focus-visible:outline-none"
              aria-label="搜索关键词"
            />
          </div>
          <Button size="sm" onClick={handleSubmit} disabled={!query().trim() || searching()}>
            搜索
          </Button>
          <AppDropdownMenu>
            <AppDropdownMenuTrigger
              as={(p: Record<string, unknown>) => (
                <AppDropdownMenuIconTrigger triggerProps={p}>
                  <MoreIcon class="h-4 w-4" />
                  <span class="sr-only">更多</span>
                </AppDropdownMenuIconTrigger>
              )}
            />
            <AppDropdownMenuContent align="end" layout="compact">
              <AppDropdownMenuItem onSelect={() => setScopeDialogOpen(true)}>
                搜索范围：{scopeDisplayLabel(scope())}
              </AppDropdownMenuItem>
              <AppDropdownMenuSeparator />
              <AppDropdownMenuItem onSelect={() => persistMode('name')}>
                <MenuRadioIndicator selected={searchMode() === 'name'} />
                <span>常规搜索（精准）</span>
              </AppDropdownMenuItem>
              <AppDropdownMenuItem onSelect={() => persistMode('fuzzy')}>
                <MenuRadioIndicator selected={searchMode() === 'fuzzy'} />
                <span>模糊搜索</span>
              </AppDropdownMenuItem>
              <AppDropdownMenuItem onSelect={() => persistMode('extended')}>
                <MenuRadioIndicator selected={searchMode() === 'extended'} />
                <span>扩展搜索</span>
              </AppDropdownMenuItem>
            </AppDropdownMenuContent>
          </AppDropdownMenu>
        </div>
        <Show when={searching()}>
          <div class="h-0.5 w-full overflow-hidden rounded-full bg-muted">
            <div class="h-full w-1/3 animate-pulse rounded-full bg-primary" />
          </div>
        </Show>
        <Show when={submitted() && !searching() && (hasMore() || manualStop())}>
          <div class="flex justify-end">
            <Button variant="outline" size="sm" onClick={handleStopOrResume}>
              {searching() ? '停止' : hasMore() ? '继续搜索' : null}
            </Button>
          </div>
        </Show>
      </div>

      <div class={mainShellPageScroll} onScroll={handleScroll}>
        <Show when={helpVisible() && !submitted()}>
          <section class="px-4 pt-3">
            <Show when={filteredLocal().length > 0}>
              <h3 class="mb-2 text-xs font-medium text-muted-foreground">书架</h3>
              <div class="mb-4 flex flex-wrap gap-2">
                <For each={filteredLocal()}>
                  {(book) => (
                    <button
                      type="button"
                      class="rounded-full border border-border/60 bg-muted/30 px-3 py-1.5 text-sm hover:bg-accent/50"
                      onClick={() => props.onOpenBook(book)}
                    >
                      {book.name}
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <div class="mb-2 flex items-center justify-between">
              <h3 class="text-xs font-medium text-muted-foreground">搜索历史</h3>
              <Show when={history().length > 0}>
                <button
                  type="button"
                  class="text-xs text-muted-foreground hover:text-foreground"
                  onClick={async () => {
                    await clearSearchKeywords();
                    setHistory([]);
                  }}
                >
                  清空
                </button>
              </Show>
            </div>
            <div class="flex flex-wrap gap-2 pb-4">
              <For each={history()}>
                {(item) => (
                  <span class="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/20 pl-3 pr-1 py-1 text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setQuery(item.word);
                        void submitSearch(item.word);
                      }}
                    >
                      {item.word}
                    </button>
                    <button
                      type="button"
                      class="rounded-full px-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`删除 ${item.word}`}
                      onClick={async () => {
                        await deleteSearchKeyword(item.word);
                        setHistory((h) => h.filter((x) => x.word !== item.word));
                      }}
                    >
                      ×
                    </button>
                  </span>
                )}
              </For>
              <Show when={history().length === 0}>
                <p class="text-sm text-muted-foreground py-2">暂无搜索历史</p>
              </Show>
            </div>
          </section>
        </Show>

        <Show when={submitted()}>
          <section class="pb-8">
            <Show when={!searching() && onlineResults().length === 0}>
              <p class="px-4 py-12 text-center text-sm text-muted-foreground">
                {manualStop() ? '搜索已停止' : '暂无搜索结果'}
              </p>
            </Show>
            <ul>
              <For each={onlineResults()}>
                {(book) => (
                  <SearchBookResultRow
                    book={book}
                    onShelf={isSearchBookOnShelf(book, shelfKeys())}
                    adding={addingUrl() === book.bookUrl}
                    onOpen={async () => {
                      const source = await resolveSourceForBook(book);
                      if (!source) {
                        showAppToast({
                          title: '无法打开详情',
                          description: '未找到对应书源',
                          variant: 'destructive',
                        });
                        return;
                      }
                      props.onOpenBookInfo(source, book);
                    }}
                    onAddToShelf={
                      isSearchBookOnShelf(book, shelfKeys())
                        ? undefined
                        : async () => {
                            setAddingUrl(book.bookUrl);
                            try {
                              const added = await addSearchBookToShelf(book);
                              if (added) {
                                setShelfKeys((k) => {
                                  const next = new Set(k);
                                  const name = book.name.trim();
                                  const author = book.author?.trim() ?? '';
                                  if (name && author) next.add(`${name}-${author}`);
                                  if (name) next.add(name);
                                  next.add(book.bookUrl);
                                  return next;
                                });
                                props.onAddedToShelf?.();
                                showAppToast({ title: '已加入书架', description: book.name });
                              }
                            } finally {
                              setAddingUrl(null);
                            }
                          }
                    }
                  />
                )}
              </For>
            </ul>
            <Show when={searching()}>
              <p class="py-6 text-center text-sm text-muted-foreground">正在从各书源搜索…</p>
            </Show>
          </section>
        </Show>
      </div>

      <BookSearchScopeDialog
        open={scopeDialogOpen()}
        onOpenChange={setScopeDialogOpen}
        scope={scope()}
        groupNames={sourceGroups()}
        onConfirm={(s) => void openScope(s)}
      />
    </div>
  );
}

// re-export for single-source entry
export { formatSourceScope };
