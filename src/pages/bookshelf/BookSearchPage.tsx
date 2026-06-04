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
import { SearchBookGridProvider,
  renderSearchBookGridCell,
} from '@/components/bookshelf/SearchBookGridContext';
import { createSearchBooksStore } from '@/components/bookshelf/search-books-store';
import { clearCoverSession } from '@/lib/http/cover-session';
import { SearchHistoryChip } from '@/components/bookshelf/SearchHistoryChip';
import { BookSearchScopeDialog } from '@/components/bookshelf/BookSearchScopeDialog';
import { BookCoverImg } from '@/components/books/BookCoverImg';
import { filterBookshelfBooks } from '@/lib/search/search-filters';
import {
  loadBookshelfSearchSubPageMode,
  saveBookshelfSearchSubPageMode,
  type SearchMode,
} from '@/lib/search/search-prefs';
import { buildShelfMembershipKeys, isSearchBookOnShelf } from '@/lib/bookshelf/shelf-membership';
import {
  loadSearchScope,
  resolveSearchScopeSources,
  saveSearchScope,
  sanitizeSearchScope,
  scopeDisplayLabel,
  scopeMenuItemLabel,
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
import { getSource } from '@/lib/database/sources';
import { bookToSearchBook } from '@/lib/bookshelf/book-to-search-book';
import { showAppToast } from '@/components/shared/AppToasts';
import { appBottomChromePadding, standalonePageScroll } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';
import type { Book, BookSource, SearchBook, SearchKeyword } from '@/types';
import type { MergedSearchBook } from '@/lib/book-source/multi-source-search';
import { BookCoverIcon, MoreIcon, PlayIcon, SearchIcon, SquareIcon, XIcon } from '@/components/shared/icons';
import {
  exploreBookListBodyClass,
  exploreBookListCardClass,
  exploreBookListCoverClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { ExploreBookListIntro } from '@/components/explore/ExploreBookListIntro';
import { tryFormatDisplayUpdateTime } from '@/lib/format/display-time';
import {
  EXPLORE_BOOK_GRID_CLASS,
  EXPLORE_BOOK_GRID_ROW_HEIGHT_PX,
} from '@/components/explore/ExploreBookCardSkeleton';
import { VirtualExploreBookGrid } from '@/components/explore/VirtualExploreBookGrid';

/** 结果少于一屏时自动翻页（对齐 Legado #5251：不够高则滚不到底） */
const SEARCH_AUTO_LOAD_MIN_COUNT = 18;
/** 单次搜索自动连翻页上限，避免结果过少时反复请求全部书源 */
const SEARCH_AUTO_LOAD_MAX_ROUNDS = 4;

export interface BookSearchPageProps {
  initialQuery?: string;
  /** 初始搜索范围（空=全部；分组逗号分隔；name::url=单书源） */
  initialScope?: string;
  /** 导航栈条目是否为栈顶（非栈顶时暂停后台搜索） */
  active?: () => boolean;
  /** 由 App 导航栈包裹时设为 true，避免内层 fixed+z-50 盖住阅读器 */
  overlayStack?: boolean;
  onBack: () => void;
  onOpenBook: (book: Book) => void;
  onOpenBookInfo: (source: BookSource, book: SearchBook) => void;
  className?: string;
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
  const searchBooksStore = createSearchBooksStore();
  const onlineBooks = searchBooksStore.orderedBooks;
  const [searching, setSearching] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(false);
  const [manualStop, setManualStop] = createSignal(false);
  const [shelfKeys, setShelfKeys] = createSignal<Set<string>>(new Set());
  const [sourceMap, setSourceMap] = createSignal<Record<string, BookSource>>({});
  const [scopeDialogOpen, setScopeDialogOpen] = createSignal(false);
  const session = new MultiSourceSearchSession();
  let autoLoadRounds = 0;
  let loadingNextPage = false;

  const loadNextSearchPage = async () => {
    if (loadingNextPage || manualStop() || !session.getHasMore()) {
      setSearching(false);
      return;
    }
    loadingNextPage = true;
    setSearching(true);
    try {
      const sources = await resolveSearchScopeSources(scope());
      await session.search('', sources);
    } finally {
      loadingNextPage = false;
    }
  };

  const maybeAutoLoadNextSearchPage = (resultCount: number, more: boolean) => {
    if (!more || manualStop()) {
      setSearching(false);
      return;
    }
    if (
      resultCount < SEARCH_AUTO_LOAD_MIN_COUNT &&
      autoLoadRounds < SEARCH_AUTO_LOAD_MAX_ROUNDS
    ) {
      autoLoadRounds += 1;
      void loadNextSearchPage();
      return;
    }
    setSearching(false);
  };

  const reloadShelfMembership = async () => {
    const all = await getAllBooks();
    setShelfKeys(buildShelfMembershipKeys(all));
  };

  onMount(() => {
    const onBookshelfRefresh = () => {
      void reloadShelfMembership();
    };
    window.addEventListener('bookshelf-refresh', onBookshelfRefresh);
    onCleanup(() => window.removeEventListener('bookshelf-refresh', onBookshelfRefresh));

    void (async () => {
      const mode = await loadBookshelfSearchSubPageMode();
      setSearchMode(mode);
      const rawScope = props.initialScope ?? (await loadSearchScope());
      const nextScope = props.initialScope?.trim()
        ? rawScope
        : await sanitizeSearchScope(rawScope);
      setScope(nextScope);
      if (!props.initialScope?.trim() && nextScope !== rawScope) {
        void saveSearchScope(nextScope);
      }
      await reloadShelfMembership();
      const sources = await getEnabledSources();
      setSourceMap(Object.fromEntries(sources.map((s) => [s.sourceUrl, s])));
      if (props.initialQuery?.trim()) {
        void submitSearch(props.initialQuery.trim());
      }
    })();
  });

  onCleanup(() => {
    session.close();
  });

  createEffect(() => {
    const visible = props.active?.() ?? true;
    if (visible) {
      session.resume();
      return;
    }
    session.pause();
    setSearching(false);
  });

  createEffect(() => {
    const nextScope = props.initialScope ?? '';
    if (nextScope && nextScope !== scope()) {
      setScope(nextScope);
      void saveSearchScope(nextScope, { transient: true });
      if (submitted() && query().trim() && (props.active?.() ?? true)) {
        void submitSearch(query().trim(), true);
      }
    }
  });

  createEffect(() => {
    const nextQuery = props.initialQuery?.trim() ?? '';
    if (!nextQuery || nextQuery === query()) return;
    setQuery(nextQuery);
    if (props.active?.() ?? true) {
      void submitSearch(nextQuery);
    }
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
        setHistory([]);
      } else {
        setLocalBooks([]);
        const hist = await searchSearchKeywords('');
        setHistory(hist);
      }
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
    session.resume();
    if (!reRun) {
      await upsertSearchKeyword(trimmed);
      const hist = await searchSearchKeywords('');
      setHistory(hist);
    }
    session.setSearchMode(searchMode());
    const sources = await resolveSearchScopeSources(scope());
    setSourceMap((prev) => ({
      ...prev,
      ...Object.fromEntries(sources.map((s) => [s.sourceUrl, s])),
    }));
    if (sources.length === 0) {
      showAppToast({
        title: '无法搜索',
        description: '当前范围内没有启用的书源',
        variant: 'destructive',
      });
      return;
    }
    session.setCallbacks({
      onStart: (isNewSearch) => {
        setSearching(true);
        if (isNewSearch) {
          autoLoadRounds = 0;
          searchBooksStore.clear();
          clearCoverSession();
        }
      },
      onResults: (books) => searchBooksStore.replaceAll(books),
      onFinish: (empty, more) => {
        setHasMore(more);
        maybeAutoLoadNextSearchPage(searchBooksStore.orderedBooks().length, more);
        if (empty && searchMode() === 'name' && !scope().trim()) {
          showAppToast({
            title: '搜索结果为空',
            description: '可尝试切换为模糊或扩展搜索模式',
            variant: 'default',
          });
        } else if (empty && searchMode() === 'fuzzy' && !scope().trim()) {
          showAppToast({
            title: '搜索结果为空',
            description: '可尝试切换为扩展搜索（含分类、简介）',
            variant: 'default',
          });
        } else if (empty && searchMode() === 'extended' && !scope().trim()) {
          showAppToast({
            title: '搜索结果为空',
            description: '可尝试切换为不过滤搜索（展示书源返回的全部结果）',
            variant: 'default',
          });
        } else if (empty && searchMode() === 'unfiltered' && !scope().trim()) {
          showAppToast({
            title: '搜索结果为空',
            description: '书源未返回结果，可更换关键词或扩大书源范围',
            variant: 'default',
          });
        } else if (empty && !scope().trim()) {
          showAppToast({
            title: '搜索结果为空',
            description: '可尝试更换关键词或扩大书源范围',
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
      session.pause();
      setSearching(false);
      return;
    }
    if (manualStop()) {
      setManualStop(false);
      session.resume();
      if (session.isSearching()) {
        setSearching(true);
      } else {
        void loadNextSearchPage();
      }
      return;
    }
    if (hasMore() && submitted()) {
      void loadNextSearchPage();
      return;
    }
    showAppToast({
      title: '暂无可继续的搜索任务',
      variant: 'default',
    });
  };

  const loadMore = () => {
    if (manualStop() || searching() || !hasMore()) return;
    void loadNextSearchPage();
  };

  const handleScroll = (el: HTMLDivElement) => {
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 80) return;
    loadMore();
  };

  const openScope = async (newScope: string) => {
    const sanitized = await sanitizeSearchScope(newScope);
    setScope(sanitized);
    const result = await saveSearchScope(sanitized);
    if (result.ok && result.persisted === 'all-normalized') {
      showAppToast({
        title: '搜索范围已调整为全部书源',
        description: '选中项过多或已接近全选，已自动保存为全部书源',
        variant: 'default',
      });
    }
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

  const openSearchResult = async (book: MergedSearchBook) => {
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
  };

  const resolveSourceForShelfBook = async (book: Book): Promise<BookSource | null> => {
    const cached = sourceMap()[book.origin];
    if (cached) return cached;
    const source = await getSource(book.origin);
    if (!source) return null;
    setSourceMap((prev) => ({ ...prev, [book.origin]: source }));
    return source;
  };

  return (
    <section
      class={cn(
        props.overlayStack
          ? 'flex h-full min-h-0 w-full flex-col overflow-hidden bg-background'
          : 'fixed inset-0 z-50 flex flex-col overflow-hidden bg-background',
        props.className,
      )}
    >
      <PageHeader
        title="搜索"
        onBack={props.onBack}
        pinToTop
        showThemeToggle
        showWindowControls
        draggable={true}
        trailing={
          <div class="flex items-center gap-1.5">
            <div class="relative flex h-9 w-52 items-center rounded-md border border-input bg-transparent pl-8 pr-2">
              <SearchIcon class="pointer-events-none absolute left-2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                enterkeyhint="search"
                placeholder="搜索书籍"
                value={query()}
                onInput={(e) => {
                  setQuery(e.currentTarget.value);
                  if (!submitted()) setHelpVisible(true);
                }}
                onFocus={() => {
                  if (!submitted() || onlineBooks().length === 0) setHelpVisible(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                class="h-full w-full bg-transparent pr-7 text-sm focus-visible:outline-none"
                aria-label="搜索关键词"
              />
              <Show when={query().length > 0}>
                <button
                  type="button"
                  class="absolute right-1 inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="清除搜索内容"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setQuery('');
                    setHelpVisible(true);
                  }}
                >
                  <XIcon class="h-3.5 w-3.5" />
                </button>
              </Show>
            </div>
            <Button
              variant="ghost"
              size="icon"
              class="h-9 w-9"
              onClick={handleSubmit}
              disabled={!query().trim() || searching()}
              aria-label="搜索"
            >
              <SearchIcon class="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="h-9 w-9"
              onClick={() => void handleStopOrResume()}
              aria-label={searching() ? '暂停搜索' : '继续搜索'}
            >
              <Show when={searching()} fallback={<PlayIcon class="h-4 w-4" />}>
                <SquareIcon class="h-4 w-4" />
              </Show>
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
                  {scopeMenuItemLabel(scope())}
                </AppDropdownMenuItem>
                <AppDropdownMenuSeparator />
                <AppDropdownMenuItem onSelect={() => persistMode('name')}>
                  <MenuRadioIndicator selected={searchMode() === 'name'} />
                  <span>常规搜索</span>
                </AppDropdownMenuItem>
                <AppDropdownMenuItem onSelect={() => persistMode('fuzzy')}>
                  <MenuRadioIndicator selected={searchMode() === 'fuzzy'} />
                  <span>模糊搜索</span>
                </AppDropdownMenuItem>
                <AppDropdownMenuItem onSelect={() => persistMode('extended')}>
                  <MenuRadioIndicator selected={searchMode() === 'extended'} />
                  <span>扩展搜索</span>
                </AppDropdownMenuItem>
                <AppDropdownMenuItem onSelect={() => persistMode('unfiltered')}>
                  <MenuRadioIndicator selected={searchMode() === 'unfiltered'} />
                  <span>不过滤搜索</span>
                </AppDropdownMenuItem>
              </AppDropdownMenuContent>
            </AppDropdownMenu>
          </div>
        }
      />
      <div class="shrink-0 px-2 pb-2">
        <div class="search-loop-track">
          <div class={cn('search-loop-bar', searching() ? 'search-loop-bar--active' : '')} />
        </div>
      </div>

      <div
        class={cn(
          'px-2',
          submitted() && !helpVisible()
            ? cn('flex min-h-0 flex-1 flex-col overflow-hidden', appBottomChromePadding)
            : standalonePageScroll,
        )}
        onScroll={(e) => {
          if (submitted() && !helpVisible()) return;
          handleScroll(e.currentTarget);
        }}
      >
        <Show when={helpVisible()}>
          <section class="pt-3">
            <Show
              when={query().trim()}
              fallback={
                <>
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
                        <SearchHistoryChip
                          item={item}
                          onSelect={(word) => {
                            setQuery(word);
                            void submitSearch(word);
                          }}
                          onDelete={async (word) => {
                            await deleteSearchKeyword(word);
                            setHistory((h) => h.filter((x) => x.word !== word));
                          }}
                        />
                      )}
                    </For>
                    <Show when={history().length === 0}>
                      <p class="text-sm text-muted-foreground py-2">暂无搜索历史</p>
                    </Show>
                  </div>
                </>
              }
            >
              <h3 class="mb-2 text-xs font-medium text-muted-foreground">书架</h3>
              <ul class={cn('mb-4 p-1', EXPLORE_BOOK_GRID_CLASS)}>
                <For each={filteredLocal()}>
                  {(book) => (
                    <li class="w-full">
                      <div class={exploreBookListCardClass()}>
                        <button
                          type="button"
                          class={exploreBookListCoverClass(
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          )}
                          onClick={() => {
                            setQuery(book.name);
                            void submitSearch(book.name);
                          }}
                          aria-label={`补全关键词 ${book.name}`}
                        >
                          <BookCoverImg
                            src={book.customCoverUrl || book.coverUrl}
                            referer={book.origin}
                            source={sourceMap()[book.origin] ?? null}
                            bookUrl={book.bookUrl}
                            class="h-full w-full object-cover"
                            fallback={
                              <div class="flex h-full w-full items-center justify-center">
                                <BookCoverIcon class="h-8 w-8 text-muted-foreground" size={32} />
                              </div>
                            }
                          />
                        </button>
                        <button
                          type="button"
                          class={exploreBookListBodyClass('text-left')}
                          onClick={() => {
                            setQuery(book.name);
                            void submitSearch(book.name);
                          }}
                          aria-label={`补全关键词 ${book.name}`}
                        >
                          <p class="m-0 shrink-0 truncate font-medium leading-5 text-foreground">
                            {book.name}
                          </p>
                          <p class="m-0 shrink-0 truncate text-xs leading-5 text-muted-foreground">
                            作者：{book.author || '—'}
                          </p>
                          <p class="m-0 shrink-0 truncate text-xs leading-5 text-muted-foreground">
                            最新章节：{book.latestChapterTitle?.trim() || '--'}
                            <Show when={tryFormatDisplayUpdateTime(String(book.latestChapterTime || ''))}>
                              {(label) => <span> · {label()}</span>}
                            </Show>
                          </p>
                          <ExploreBookListIntro>
                            简介：{book.customIntro?.trim() || book.intro?.trim() || '暂无简介'}
                          </ExploreBookListIntro>
                          <div class="mt-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              class="h-7 px-2"
                              onClick={() => props.onOpenBook(book)}
                            >
                              立即阅读
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              class="h-7 px-2"
                              onClick={async () => {
                                const source = await resolveSourceForShelfBook(book);
                                if (!source) {
                                  showAppToast({
                                    title: '无法打开详情',
                                    description: '未找到对应书源',
                                    variant: 'destructive',
                                  });
                                  return;
                                }
                                props.onOpenBookInfo(source, bookToSearchBook(book));
                              }}
                            >
                              查看详情
                            </Button>
                          </div>
                        </button>
                      </div>
                    </li>
                  )}
                </For>
                <Show when={filteredLocal().length === 0}>
                  <li class="py-2 text-sm text-muted-foreground">书架中没有匹配书籍</li>
                </Show>
              </ul>
            </Show>
          </section>
        </Show>

        <Show when={submitted()}>
          <section class="flex min-h-0 flex-1 flex-col pb-2">
            <Show when={!searching() && onlineBooks().length === 0}>
              <p class="py-12 text-center text-sm text-muted-foreground">
                {manualStop() ? '搜索已停止' : '暂无搜索结果'}
              </p>
            </Show>
            <Show when={onlineBooks().length > 0}>
              <SearchBookGridProvider
                value={{
                  store: searchBooksStore,
                  onShelf: (b) => isSearchBookOnShelf(b, shelfKeys()),
                  sourceForBook: (b) => sourceMap()[b.origin] ?? null,
                  onOpen: openSearchResult,
                }}
              >
                <VirtualExploreBookGrid
                  class={cn(standalonePageScroll, 'min-h-0 flex-1')}
                  items={onlineBooks}
                  rowHeight={EXPLORE_BOOK_GRID_ROW_HEIGHT_PX}
                  onScroll={handleScroll}
                  getItemKey={(book) => book.bookUrl}
                  renderEntityByKey={renderSearchBookGridCell}
                />
              </SearchBookGridProvider>
            </Show>
            <Show when={searching()}>
              <p class="shrink-0 py-6 text-center text-sm text-muted-foreground">
                {session.getPage() > 1
                  ? `正在加载第 ${session.getPage()} 页搜索结果…`
                  : '正在从各书源搜索…'}
              </p>
            </Show>
          </section>
        </Show>
      </div>

      <BookSearchScopeDialog
        open={scopeDialogOpen()}
        onOpenChange={setScopeDialogOpen}
        scope={scope()}
        onConfirm={(s) => void openScope(s)}
      />
    </section>
  );
}

// re-export for single-source entry
export { formatSourceScope };
