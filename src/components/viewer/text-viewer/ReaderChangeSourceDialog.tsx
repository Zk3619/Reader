/**
 * 换源对话框（对齐 Legado ChangeBookSourceDialog / ChangeChapterSourceDialog）
 */

import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { Book, BookChapter, SearchBook } from '@/types';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from '@/components/ui/radio-group';
import {
  AppDropdownMenu,
  AppDropdownMenuCheckboxItem,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { SourcesFilterDialog } from '@/components/sources/SourcesFilterDialog';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/viewer/viewer-app-overlay';
import {
  FilterIcon,
  MoreIcon,
  RefreshIcon,
  SearchIcon,
  Settings2Icon,
  XIcon,
} from '@/components/shared/icons';
import {
  isAppFloatingOverlayTarget,
  preventDialogDismissForPopperLayer,
} from '@/components/shared/app-drawer-overlay-lock';
import { DialogScrollViewport } from '@/components/shared/DialogScrollViewport';
import {
  dialogVirtualListPanelWidth,
  dialogVirtualListScroll,
  hDialogMax,
  scrollEdgeInset,
} from '@/lib/ui/viewport-classes';
import {
  changeSourceGroupFilterCriteria,
  type ChangeSourcePrefs,
} from '@/lib/media/text/change-source-prefs';
import type { SourceListFilterCriteria } from '@/lib/sources/source-list-filter';
import { cn } from '@/lib/utils';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  applyChangeSource,
  ChangeSourceSearchSession,
  disableChangeSourceOrigin,
  fetchChapterContentForChangeSource,
  loadChangeSourcePrefs,
  loadChangeSourceToc,
  matchChapterIndexForChangeSource,
  saveChangeSourcePrefs,
  sortChangeSourceBooks,
} from '@/lib/media/text/change-source';
import * as sourcesDb from '@/lib/database/sources';
import { getAllSourceGroups } from '@/lib/database/sources';
import { deleteBookSourceWithSessionPurge } from '@/lib/book-source/purge-source-session';
import { setBookScore, removeSource, getBookScore } from '@/lib/sources/source-config';
import { insertSearchBook } from '@/lib/database/search-books';
import { isLocalBook } from '@/lib/local-book';
import { textViewerStore } from '@/stores/viewer';
import { ChangeSourceResultItem } from '@/components/viewer/text-viewer/ChangeSourceResultItem';
import type { BookSource } from '@/types';

export type ChangeSourceMode = 'book' | 'chapter';

export interface ReaderChangeSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 初始换源模式（阅读器弹窗内可切换） */
  defaultMode?: ChangeSourceMode;
  book: Book | null;
  chapterIndex?: number;
  chapterTitle?: string;
  /** viewer：阅读器叠层；app：书籍信息页等常规页面 */
  presentation?: 'viewer' | 'app';
  /** 是否显示整书/单章换源单选（书籍详情固定整书，不显示） */
  showModePicker?: boolean;
  applyBook?: (book: Book, item: SearchBook) => Promise<Book>;
  onBookChanged: (book: Book) => void;
  onChapterReplaced?: () => void;
  /** 打开书源管理独立页 */
  onOpenSourcesManage?: () => void;
  /** 编辑书源（换源项右键菜单） */
  onSourceEdit?: (source: BookSource) => void;
}

function formatRespondTime(ms: number): string {
  if (ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ReaderChangeSourceDialog(props: ReaderChangeSourceDialogProps) {
  const showModePicker = () =>
    props.showModePicker ?? (props.presentation ?? 'viewer') !== 'app';
  const [mode, setMode] = createSignal<ChangeSourceMode>(props.defaultMode ?? 'book');
  const modeOptionRowClass =
    'flex cursor-pointer items-center rounded-md px-2 py-1.5 hover:bg-muted/50 has-[[data-checked]]:bg-accent has-[[data-checked]]:text-accent-foreground';
  const triggerModeOptionRadio = (el: HTMLElement) =>
    el.querySelector<HTMLInputElement>('input[type="radio"]')?.click();

  const effectiveMode = (): ChangeSourceMode => (showModePicker() ? mode() : 'book');

  const [prefs, setPrefs] = createSignal<ChangeSourcePrefs>(loadChangeSourcePrefs());
  const [results, setResults] = createSignal<SearchBook[]>([]);
  const [searching, setSearching] = createSignal(false);
  const [progress, setProgress] = createSignal({ done: 0, total: 0, name: '' });
  const [screenKey, setScreenKey] = createSignal('');
  const [applying, setApplying] = createSignal(false);
  const [sourceGroups, setSourceGroups] = createSignal<string[]>([]);
  const [groupFilterOpen, setGroupFilterOpen] = createSignal(false);
  const [tocOpen, setTocOpen] = createSignal(false);
  const [tocLoading, setTocLoading] = createSignal(false);
  const [tocChapters, setTocChapters] = createSignal<BookChapter[]>([]);
  const [pickedSearchBook, setPickedSearchBook] = createSignal<SearchBook | null>(null);
  const [screenSearchExpanded, setScreenSearchExpanded] = createSignal(false);
  const [scoreRevision, setScoreRevision] = createSignal(0);
  const [scoreOverrides, setScoreOverrides] = createSignal<Record<string, number>>({});
  const [deleteTarget, setDeleteTarget] = createSignal<SearchBook | null>(null);
  const screenKeyRef: { current: string } = { current: '' };

  const itemScores = createMemo(() => {
    scoreRevision();
    const overrides = scoreOverrides();
    return Object.fromEntries(
      results().map((book) => [
        book.bookUrl,
        overrides[book.bookUrl] ?? getBookScore(book.origin, book.name, book.author ?? ''),
      ]),
    ) as Record<string, number>;
  });

  let session: ChangeSourceSearchSession | null = null;
  let listEl: HTMLDivElement | undefined;

  const title = () => {
    if (effectiveMode() === 'chapter') {
      return props.chapterTitle || '单章换源';
    }
    const b = props.book;
    if (!b) return '整书换源';
    return b.name;
  };

  const subtitle = () => {
    if (effectiveMode() === 'chapter') return props.book?.name ?? '';
    return props.book?.author ?? '';
  };

  const currentOriginName = () => props.book?.originName ?? '—';

  const isCurrentSource = (item: SearchBook) => item.bookUrl === props.book?.bookUrl;
  const fromReader = () => (props.presentation ?? 'viewer') === 'viewer';
  const showWordCountMeta = () => prefs().loadWordCount;

  const syncSessionSearchOptions = () => {
    session?.setSearchOptions({
      chapterIndex: props.chapterIndex ?? textViewerStore.state.chapterIndex,
      fromReader: fromReader(),
    });
  };

  const groupFilterSummary = () => {
    const names = prefs().groupNames;
    if (names.length === 0) return '分组筛选';
    if (names.length === 1) return `分组 · ${names[0]}`;
    return `分组 · ${names.length} 项`;
  };

  const startSearch = async (fresh = false) => {
    const book = props.book;
    if (!book || isLocalBook(book)) return;

    session?.close();
    session = new ChangeSourceSearchSession();
    syncSessionSearchOptions();
    session.setCallbacks({
      onResults: (books) => setResults(books),
      onProgress: (done, total, name) => setProgress({ done, total, name }),
      onFinish: (empty) => {
        setSearching(false);
        if (empty) {
          showAppToast({
            title: '未找到可换源',
            description: '其他书源中未搜索到匹配结果',
          });
        }
      },
      onError: (msg) => {
        setSearching(false);
        showAppToast({ title: '搜索失败', description: msg, variant: 'destructive' });
      },
    });

    setSearching(true);
    if (!fresh) {
      const cached = await session.loadCached(book, prefs(), screenKey());
      if (cached.length > 0) {
        setSearching(false);
        return;
      }
    } else {
      setResults([]);
      setProgress({ done: 0, total: 0, name: '' });
    }
    await session.startSearch(book, prefs(), screenKey(), fresh);
    setSearching(false);
  };

  const applyScreenKeyFilter = (key: string) => {
    setScreenKey(key);
    screenKeyRef.current = key;
    const book = props.book;
    if (book && props.open) {
      void session?.loadCached(book, prefs(), key);
    }
  };

  const handleOpenChange = (open: boolean) => {
    props.onOpenChange(open);
    if (!open) {
      session?.close();
      session = null;
      setTocOpen(false);
      setPickedSearchBook(null);
      setTocChapters([]);
      setScreenSearchExpanded(false);
      setDeleteTarget(null);
      setScoreOverrides({});
      setScoreRevision(0);
    }
  };

  const resetModePickerState = () => {
    setMode(props.defaultMode ?? 'book');
    setTocOpen(false);
    setPickedSearchBook(null);
    setTocChapters([]);
  };

  const handleModeChange = (next: ChangeSourceMode) => {
    if (next === mode()) return;
    setMode(next);
    setTocOpen(false);
    setPickedSearchBook(null);
    setTocChapters([]);
  };

  createEffect(() => {
    if (!props.open || !props.book) return;
    resetModePickerState();
    setPrefs(loadChangeSourcePrefs());
    setScoreOverrides({});
    setScoreRevision(0);
    void getAllSourceGroups().then(setSourceGroups);
    void startSearch();
  });

  createEffect(() => {
    screenKeyRef.current = screenKey();
    if (screenKey().trim()) setScreenSearchExpanded(true);
  });

  onCleanup(() => session?.close());

  const updatePrefs = (patch: Partial<ChangeSourcePrefs>) => {
    const prev = prefs();
    const next = saveChangeSourcePrefs(patch);
    setPrefs(next);
    const book = props.book;
    if (!props.open || !book) return;

    if ('checkAuthor' in patch) {
      syncSessionSearchOptions();
      void session?.loadCached(book, next, screenKey());
      return;
    }
    if ('loadWordCount' in patch && patch.loadWordCount && !prev.loadWordCount) {
      syncSessionSearchOptions();
      setSearching(true);
      void session
        ?.refreshMissingWordCounts(book, next, screenKey())
        .finally(() => setSearching(false));
      return;
    }
    if ('groupNames' in patch) {
      void startSearch(true);
    }
  };

  const handleOpenSourcesManage = () => {
    props.onOpenChange(false);
    props.onOpenSourcesManage?.();
  };

  const handleApplyGroupFilter = (criteria: SourceListFilterCriteria) => {
    updatePrefs({ groupNames: [...criteria.groupNames] });
  };

  const applyBook = async (item: SearchBook) => {
    const book = props.book;
    if (!book || applying()) return;
    setApplying(true);
    try {
      const apply = props.applyBook ?? applyChangeSource;
      const next = await apply(book, item);
      showAppToast({ title: '换源成功', description: item.originName });
      props.onBookChanged(next);
      handleOpenChange(false);
    } catch (e) {
      showAppToast({
        title: '换源失败',
        description: e instanceof Error ? e.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setApplying(false);
    }
  };

  const openTocForChapter = async (item: SearchBook) => {
    const book = props.book;
    if (!book || effectiveMode() !== 'chapter') return;
    const source = await sourcesDb.getSource(item.origin);
    if (!source) {
      showAppToast({ title: '书源不存在', variant: 'destructive' });
      return;
    }
    setPickedSearchBook(item);
    setTocOpen(true);
    setTocLoading(true);
    setTocChapters([]);
    try {
      const toc = await loadChangeSourceToc(book, item, source);
      setTocChapters(toc);
    } catch (e) {
      setTocOpen(false);
      showAppToast({
        title: '获取目录失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setTocLoading(false);
    }
  };

  const pickTocChapter = async (chapter: BookChapter, chapterIdx: number) => {
    const book = props.book;
    const item = pickedSearchBook();
    if (!book || !item || applying()) return;
    const source = await sourcesDb.getSource(item.origin);
    if (!source) return;

    const toc = tocChapters();
    const nextUrl = toc[chapterIdx + 1]?.url;
    setApplying(true);
    try {
      const raw = await fetchChapterContentForChangeSource(
        book,
        source,
        item,
        chapter,
        nextUrl,
      );
      const idx = props.chapterIndex ?? textViewerStore.state.chapterIndex;
      await textViewerStore.replaceChapterContent(raw, idx);
      showAppToast({ title: '单章换源成功', description: item.originName });
      props.onChapterReplaced?.();
      handleOpenChange(false);
    } catch (e) {
      showAppToast({
        title: '单章换源失败',
        description: e instanceof Error ? e.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setApplying(false);
    }
  };

  const handleItemClick = (item: SearchBook) => {
    if (effectiveMode() === 'book') {
      void applyBook(item);
      return;
    }
    void openTocForChapter(item);
  };

  const resortResults = (books: SearchBook[]) =>
    sortChangeSourceBooks(books, prefs().loadWordCount);

  const updateResults = (updater: (books: SearchBook[]) => SearchBook[]) => {
    setResults((prev) => resortResults(updater(prev)));
  };

  const handleSetBookScore = (item: SearchBook, score: number) => {
    setBookScore(item.origin, item.name, item.author ?? '', score);
    setScoreOverrides((prev) => ({ ...prev, [item.bookUrl]: score }));
    setScoreRevision((v) => v + 1);
    updateResults((books) => [...books]);
  };

  const handlePinSourceTop = async (item: SearchBook) => {
    try {
      const all = await sourcesDb.getAllSources();
      const minOrder = all.length > 0 ? Math.min(...all.map((s) => s.customOrder)) : 0;
      const newOrder = minOrder - 1;
      await sourcesDb.updateSourceOrder(item.origin, newOrder);
      const nextItem = { ...item, originOrder: newOrder };
      await insertSearchBook(nextItem);
      updateResults((books) =>
        books.map((row) => (row.origin === item.origin ? { ...row, originOrder: newOrder } : row)),
      );
      window.dispatchEvent(new CustomEvent('sources-refresh'));
      showAppToast({ title: '已置顶', description: item.originName });
    } catch (e) {
      showAppToast({
        title: '置顶失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  };

  const handlePinSourceBottom = async (item: SearchBook) => {
    try {
      const all = await sourcesDb.getAllSources();
      const maxOrder = all.length > 0 ? Math.max(...all.map((s) => s.customOrder)) : 0;
      const newOrder = maxOrder + 1;
      await sourcesDb.updateSourceOrder(item.origin, newOrder);
      const nextItem = { ...item, originOrder: newOrder };
      await insertSearchBook(nextItem);
      updateResults((books) =>
        books.map((row) => (row.origin === item.origin ? { ...row, originOrder: newOrder } : row)),
      );
      window.dispatchEvent(new CustomEvent('sources-refresh'));
      showAppToast({ title: '已置底', description: item.originName });
    } catch (e) {
      showAppToast({
        title: '置底失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  };

  const handleEditSource = async (item: SearchBook) => {
    const source = await sourcesDb.getSource(item.origin);
    if (!source) {
      showAppToast({ title: '书源不存在', variant: 'destructive' });
      return;
    }
    handleOpenChange(false);
    props.onSourceEdit?.(source);
  };

  const handleDisableSource = async (item: SearchBook) => {
    try {
      await disableChangeSourceOrigin(item.origin);
      updateResults((books) => books.filter((row) => row.origin !== item.origin));
      window.dispatchEvent(new CustomEvent('sources-refresh'));
      showAppToast({ title: '已禁用书源', description: item.originName });
    } catch (e) {
      showAppToast({
        title: '禁用失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteSource = (item: SearchBook) => {
    setDeleteTarget(item);
  };

  const confirmDeleteSource = async () => {
    const item = deleteTarget();
    if (!item) return;
    try {
      const source = await sourcesDb.getSource(item.origin);
      if (!source) {
        showAppToast({ title: '书源不存在', variant: 'destructive' });
        setDeleteTarget(null);
        return;
      }
      await deleteBookSourceWithSessionPurge(source);
      removeSource(item.origin);
      updateResults((books) => books.filter((row) => row.origin !== item.origin));
      window.dispatchEvent(new CustomEvent('sources-refresh'));
      showAppToast({ title: '已删除书源', description: item.originName });
      setDeleteTarget(null);
    } catch (e) {
      showAppToast({
        title: '删除书源失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  };

  const scrollList = (toEnd: boolean) => {
    const el = listEl;
    if (!el) return;
    el.scrollTo({ top: toEnd ? el.scrollHeight : 0, behavior: 'smooth' });
  };

  const scrollToCurrentSource = () => {
    const el = listEl;
    const url = props.book?.bookUrl;
    if (!el || !url) return;
    const row = el.querySelector(`[data-book-url="${CSS.escape(url)}"]`);
    row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const matchedTocIndex = createMemo(() => {
    if (!tocOpen()) return 0;
    const toc = tocChapters();
    if (toc.length === 0) return 0;
    return matchChapterIndexForChangeSource(
      props.chapterIndex ?? 0,
      props.chapterTitle ?? '',
      toc,
    );
  });

  createEffect(() => {
    if (!tocOpen() || tocLoading()) return;
    const idx = matchedTocIndex();
    requestAnimationFrame(() => {
      const el = document.getElementById(`change-source-toc-${idx}`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  });

  const progressText = () => {
    const p = progress();
    if (!searching()) return `共 ${results().length} 条`;
    if (p.total <= 0) return '正在搜索…';
    return `搜索中 ${p.done}/${p.total}${p.name ? ` · ${p.name}` : ''}`;
  };

  const preventDismissForFloatingOverlay = (event: {
    target?: EventTarget | null;
    detail?: { originalEvent?: Event };
    preventDefault: () => void;
  }) => {
    const target = event.detail?.originalEvent?.target ?? event.target;
    if (isAppFloatingOverlayTarget(target)) {
      event.preventDefault();
    }
  };

  const resolveOptionsMenuMount = (): HTMLElement | undefined => {
    if (typeof document === 'undefined' || !props.open) return undefined;
    return (
      document.querySelector<HTMLElement>('[data-app-overlay-surface][data-expanded]') ??
      undefined
    );
  };

  const dialogShell = createMemo(() =>
    (props.presentation ?? 'viewer') === 'app'
      ? {
          Root: AppDialog,
          Content: AppDialogContent,
          Header: AppDialogHeader,
          Title: AppDialogTitle,
          Description: AppDialogDescription,
        }
      : {
          Root: ViewerAppDialog,
          Content: ViewerAppDialogContent,
          Header: ViewerAppDialogHeader,
          Title: ViewerAppDialogTitle,
          Description: ViewerAppDialogDescription,
        },
  );

  return (
    <Dynamic
      component={dialogShell().Root}
      open={props.open}
      onOpenChange={handleOpenChange}
    >
      <Dynamic
        component={dialogShell().Content}
        class={cn(
          dialogVirtualListPanelWidth,
          hDialogMax,
          'flex flex-col overflow-hidden',
        )}
        onInteractOutside={preventDismissForFloatingOverlay}
        onPointerDownOutside={preventDismissForFloatingOverlay}
        onFocusOutside={preventDialogDismissForPopperLayer}
      >
        <Dynamic
          component={dialogShell().Header}
          class="px-6 pt-6 pb-2"
          actions={
            <>
              <Show
                when={screenSearchExpanded()}
                fallback={
                  <AppTooltip>
                    <AppTooltipTrigger
                      as={Button}
                      variant="ghost"
                      size="icon"
                      class="h-9 w-9 shrink-0"
                      onClick={() => setScreenSearchExpanded(true)}
                    >
                      <SearchIcon class="h-4 w-4" />
                      <span class="sr-only">筛选</span>
                    </AppTooltipTrigger>
                    <AppTooltipContent>筛选</AppTooltipContent>
                  </AppTooltip>
                }
              >
                <div class="relative flex h-9 w-36 sm:w-44 items-center rounded-md border border-input bg-transparent text-sm">
                  <SearchIcon class="absolute left-2.5 h-4 w-4 shrink-0 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder="筛选书源或章节"
                    value={screenKey()}
                    onInput={(e) => applyScreenKeyFilter(e.currentTarget.value)}
                    onBlur={() => {
                      if (!screenKeyRef.current.trim()) setScreenSearchExpanded(false);
                    }}
                    class="h-full w-full flex-1 bg-transparent pl-9 pr-8 py-2 placeholder:text-muted-foreground focus-visible:outline-none rounded-md"
                    aria-label="筛选书源或章节"
                  />
                  <Show when={screenKey().length > 0}>
                    <button
                      type="button"
                      class="absolute right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label="清除筛选"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyScreenKeyFilter('')}
                    >
                      <XIcon class="h-3.5 w-3.5" />
                    </button>
                  </Show>
                </div>
              </Show>
              <AppTooltip>
                <AppTooltipTrigger
                  as={Button}
                  variant="ghost"
                  size="icon"
                  class="h-9 w-9 shrink-0"
                  aria-label={searching() ? '停止搜索' : '重新搜索'}
                  onClick={() => {
                    if (searching()) {
                      session?.stop();
                      setSearching(false);
                      return;
                    }
                    void startSearch(true);
                  }}
                >
                  <RefreshIcon class={cn('h-4 w-4', searching() && 'animate-spin')} />
                  <span class="sr-only">{searching() ? '停止搜索' : '重新搜索'}</span>
                </AppTooltipTrigger>
                <AppTooltipContent>{searching() ? '停止搜索' : '重新搜索'}</AppTooltipContent>
              </AppTooltip>
              <AppDropdownMenu disableAccessibilityAnnounce>
                <AppDropdownMenuTrigger
                  as={(triggerProps: Record<string, unknown>) => (
                    <AppDropdownMenuIconTrigger
                      triggerProps={triggerProps}
                      aria-label="换源选项"
                    >
                      <MoreIcon class="h-4 w-4" />
                      <span class="sr-only">换源选项</span>
                    </AppDropdownMenuIconTrigger>
                  )}
                />
                <AppDropdownMenuContent
                  layout="min"
                  align="end"
                  mount={resolveOptionsMenuMount()}
                >
                  <Show when={props.onOpenSourcesManage}>
                    <AppDropdownMenuItem onSelect={handleOpenSourcesManage}>
                      <Settings2Icon class="h-4 w-4" />
                      <span>书源管理</span>
                    </AppDropdownMenuItem>
                  </Show>
                  <AppDropdownMenuCheckboxItem
                    closeOnSelect={false}
                    checked={prefs().checkAuthor}
                    onChange={(checked) => updatePrefs({ checkAuthor: checked })}
                  >
                    校验作者
                  </AppDropdownMenuCheckboxItem>
                  <AppDropdownMenuCheckboxItem
                    closeOnSelect={false}
                    checked={prefs().loadWordCount}
                    onChange={(checked) => updatePrefs({ loadWordCount: checked })}
                  >
                    加载字数
                  </AppDropdownMenuCheckboxItem>
                  <AppDropdownMenuCheckboxItem
                    closeOnSelect={false}
                    checked={prefs().loadInfo}
                    onChange={(checked) => updatePrefs({ loadInfo: checked })}
                  >
                    加载详情页
                  </AppDropdownMenuCheckboxItem>
                  <AppDropdownMenuCheckboxItem
                    closeOnSelect={false}
                    checked={prefs().loadToc}
                    onChange={(checked) => updatePrefs({ loadToc: checked })}
                  >
                    加载目录
                  </AppDropdownMenuCheckboxItem>
                  <AppDropdownMenuItem onSelect={() => setGroupFilterOpen(true)}>
                    <FilterIcon class="h-4 w-4" />
                    <span class="min-w-0 truncate">{groupFilterSummary()}</span>
                  </AppDropdownMenuItem>
                </AppDropdownMenuContent>
              </AppDropdownMenu>
            </>
          }
        >
          <Dynamic component={dialogShell().Title} class="truncate text-left">
            {title()}
          </Dynamic>
          <Show when={subtitle()}>
            <Dynamic component={dialogShell().Description} class="truncate text-left">
              {subtitle()}
            </Dynamic>
          </Show>
        </Dynamic>

        <Show when={showModePicker()}>
          <div class="flex shrink-0 items-center gap-3 px-6 pb-2">
            <span class="shrink-0 text-xs text-muted-foreground">换源目标</span>
            <RadioGroup
              value={mode()}
              onChange={(value) => handleModeChange(value as ChangeSourceMode)}
              class="flex min-w-0 flex-1 flex-row gap-2"
            >
              <div
                class={cn(modeOptionRowClass, 'min-w-0 flex-1')}
                role="button"
                tabIndex={0}
                onClick={(e) => triggerModeOptionRadio(e.currentTarget)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    triggerModeOptionRadio(e.currentTarget);
                  }
                }}
              >
                <RadioGroupItem value="book" class="w-full">
                  <RadioGroupItemLabel>整书换源</RadioGroupItemLabel>
                </RadioGroupItem>
              </div>
              <div
                class={cn(modeOptionRowClass, 'min-w-0 flex-1')}
                role="button"
                tabIndex={0}
                onClick={(e) => triggerModeOptionRadio(e.currentTarget)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    triggerModeOptionRadio(e.currentTarget);
                  }
                }}
              >
                <RadioGroupItem value="chapter" class="w-full">
                  <RadioGroupItemLabel>单章换源</RadioGroupItemLabel>
                </RadioGroupItem>
              </div>
            </RadioGroup>
          </div>
        </Show>

        <div class="relative flex min-h-0 flex-1 flex-col gap-1.5 pb-3">
          <p class="shrink-0 px-6 text-xs text-muted-foreground">{progressText()}</p>

          <div class="min-h-0 flex-1 px-2">
            <DialogScrollViewport
              frameClass="flex min-h-0 w-full flex-1 flex-col overflow-hidden py-1 app-scroll-edge-inset"
              class={cn('min-h-0 flex-1', dialogVirtualListScroll)}
              trackRef={(el) => {
                listEl = el;
              }}
            >
              <ul class="space-y-1">
                <For each={results()}>
                  {(item) => (
                    <li>
                      <Show when={item} keyed>
                        {(book) => (
                          <ChangeSourceResultItem
                            item={book}
                            score={itemScores()[book.bookUrl] ?? 0}
                            current={isCurrentSource(book)}
                            applying={applying()}
                            showWordCountMeta={showWordCountMeta()}
                            formatRespondTime={formatRespondTime}
                            onSelect={handleItemClick}
                            onSetScore={handleSetBookScore}
                            onPinTop={(row) => void handlePinSourceTop(row)}
                            onPinBottom={(row) => void handlePinSourceBottom(row)}
                            onEditSource={(row) => void handleEditSource(row)}
                            onDisableSource={(row) => void handleDisableSource(row)}
                            onDeleteSource={handleDeleteSource}
                          />
                        )}
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </DialogScrollViewport>
          </div>

          <div class="flex shrink-0 items-center gap-2 border-t border-border/50 px-6 pt-2 text-xs">
            <button
              type="button"
              class="min-w-0 flex-1 truncate text-left text-muted-foreground hover:text-foreground"
              onClick={scrollToCurrentSource}
            >
              当前：{currentOriginName()}
            </button>
            <Button variant="ghost" size="sm" onClick={() => scrollList(false)}>
              顶部
            </Button>
            <Button variant="ghost" size="sm" onClick={() => scrollList(true)}>
              底部
            </Button>
          </div>

          <Show when={tocOpen()}>
            <div class="absolute inset-0 z-10 flex flex-col rounded-lg bg-background">
              <header class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
                <Button variant="ghost" size="sm" onClick={() => setTocOpen(false)}>
                  返回
                </Button>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-medium">
                    {pickedSearchBook()?.originName ?? '选择章节'}
                  </div>
                  <div class="truncate text-xs text-muted-foreground">选择对应章节获取正文</div>
                </div>
              </header>
              <div class={cn('min-h-0 flex-1 overflow-y-auto px-2', scrollEdgeInset)}>
                <Show when={tocLoading()}>
                  <p class="p-4 text-sm text-muted-foreground">加载目录…</p>
                </Show>
                <ul class="space-y-0.5">
                  <For each={tocChapters()}>
                    {(ch, idx) => (
                      <li>
                        <button
                          type="button"
                          id={`change-source-toc-${idx()}`}
                          class={cn(
                            'w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent',
                            idx() === matchedTocIndex() && 'bg-primary/10 text-primary',
                            ch.isVolume && 'font-medium text-muted-foreground',
                          )}
                          disabled={ch.isVolume || applying()}
                          onClick={() => void pickTocChapter(ch, idx())}
                        >
                          {ch.title}
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </div>
          </Show>
        </div>
      </Dynamic>

      <SourcesFilterDialog
        open={groupFilterOpen()}
        onOpenChange={setGroupFilterOpen}
        sourceGroups={sourceGroups()}
        appliedFilter={changeSourceGroupFilterCriteria(prefs())}
        onApply={handleApplyGroupFilter}
        groupsOnly
        stackedOverlay={(props.presentation ?? 'viewer') === 'viewer'}
      />

      <AppDialog open={deleteTarget() !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AppDialogContent layout="app" class="max-w-sm">
          <AppDialogHeader>
            <AppDialogTitle>删除书源</AppDialogTitle>
            <AppDialogDescription>
              确定删除「{deleteTarget()?.originName ?? ''}」吗？此操作不可撤销。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void confirmDeleteSource()}>
              删除
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </Dynamic>
  );
}
