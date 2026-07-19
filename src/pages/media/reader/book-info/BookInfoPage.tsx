/**
 * 书籍信息页面
 * 参考 legado 的 BookInfo 设计，跨平台双布局：
 *   - 窄屏（移动端）：纵向堆叠，封面居中 → 信息卡片（参考 layout/activity_book_info.xml）
 *   - 宽屏（桌面端）：左右分栏，左侧封面+名称，右侧详情+简介（参考 layout-land/activity_book_info.xml）
 */

import { createSignal, createEffect, Show, onCleanup, onMount, For } from 'solid-js';
import { BookCoverPreviewButton } from '@/components/media/reader/books/BookCoverPreviewButton';
import { BookCoverPreviewDialog } from '@/components/media/reader/books/BookCoverPreviewDialog';
import { BookInfoChapterListDialog } from '@/components/media/reader/books/BookInfoChapterListDialog';
import { BookGroupPickDialog } from '@/components/media/reader/bookshelf/BookGroupPickDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shell/PageHeader';
import {
  BookOpenIcon,
  AddToShelfIcon,
  RemoveFromShelfIcon,
  BookCoverIcon,
  AuthorIcon,
  OriginIcon,
  ChapterMetaIcon,
  WordCountIcon,
  UpdateTimeIcon,
  TocMetaIcon,
  GroupFolderIcon,
} from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import { addSearchBookToShelf, syncShelfBookFromSearchBook } from '@/lib/bookshelf/save-book-to-shelf';
import { searchBookToEphemeralBook, bookToSearchBook } from '@/lib/bookshelf/book-to-search-book';
import {
  dedupeLegadoSourceChapterTitle,
  mergeBookContentVariable,
  preferDetailContentSource,
} from '@/lib/book-source/utils';
import { getReaderProgressSnapshot } from '@/lib/bookshelf/reading-progress-snapshot';
import { formatBookshelfBookGroupNames, bookshelfBookCustomGroupIds } from '@/lib/bookshelf/book-source-name';
import {
  formatBookIntroPlainText,
  preferDetailField,
  preferDetailIntro,
} from '@/lib/book-source/intro-merge';
import { collectBookBadgeEntries } from '@/lib/book-source/book-tags';
import { getBook, hasBook, updateBooksGroupMask } from '@/lib/database/books';
import { getAllGroups } from '@/lib/database/book-groups';
import { getBookInfo } from '@/lib/book-source/detail';
import {
  fetchChapterListDeduped,
  shelfCachedChapterListLooksStale,
} from '@/lib/book-source/chapters';
import {
  getBookInfoTocSessionCache,
  setBookInfoTocSessionCache,
} from '@/lib/book-info/book-info-toc-cache';
import { getSource } from '@/lib/database/sources';
import { getChapterList as getDbChapterList } from '@/lib/database/chapters';
import { showAppToast } from '@/components/shared/AppToasts';
import { bookshelfStore } from '@/stores/bookshelf';
import {
  loadCoverImageObjectUrl,
  shouldFetchCoverAsBlob,
} from '@/lib/http/cover-image-loader';
import { pageCacheStore } from '@/stores/page-cache';
import {
  detectFileType,
  isLocalBook,
  readLocalBookContent,
  reparseLocalTxtBook,
} from '@/lib/local-book';
import { matchTxtTocRuleByStorage } from '@/lib/local-book/txt-toc-rule-engine';
import * as txtTocDb from '@/lib/database/txt-toc-rules';
import { TxtTocRulePickDialog, type TxtTocRulePickResult } from '@/components/media/reader/txt-toc-rules/TxtTocRulePickDialog';
import {
  ReaderChangeSourceDialog,
} from '@/components/viewer/text-viewer/ReaderChangeSourceDialog';
import {
  applyChangeSource,
  resolveChangeSource,
} from '@/lib/media/text/change-source';
import type { Book, BookChapter, BookGroup, BookSource, SearchBook } from '@/types';

/** 模糊背景 / 大图：跨域用 blob，同源可直接用 coverUrl */
function resolveCoverBackgroundUrl(
  coverUrl: string | undefined,
  blobUrl: string | null,
): string | undefined {
  const raw = coverUrl?.trim();
  if (!raw) return undefined;
  if (blobUrl) return blobUrl;
  if (!shouldFetchCoverAsBlob(raw)) return raw;
  return undefined;
}

/* ─── 信息行组件 ─── */

const INFO_ROW_CLASS = 'flex min-h-9 items-center gap-2 py-1.5 text-[13px] text-muted-foreground';

function InfoRow(props: { icon: any; label?: string; children: any; class?: string }) {
  return (
    <div class={cn(INFO_ROW_CLASS, 'items-start', props.class)}>
      <props.icon class="h-[18px] w-[18px] text-muted-foreground shrink-0 mt-0.5" size={18} />
      <Show when={props.label}>
        <span class="shrink-0 text-foreground/70">{props.label}</span>
      </Show>
      <span class="flex-1 min-w-0 wrap-break-word">{props.children}</span>
    </div>
  );
}

const INFO_ROW_ACTION_CLASS =
  'h-7 shrink-0 px-2 text-xs text-primary hover:text-primary';

function InfoRowWithAction(props: {
  icon: any;
  label: string;
  children: any;
  actionLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  secondaryActionDisabled?: boolean;
}) {
  return (
    <div class={INFO_ROW_CLASS}>
      <props.icon class="h-[18px] w-[18px] text-muted-foreground shrink-0" size={18} />
      <span class="shrink-0 text-foreground/70">{props.label}</span>
      <span class="min-w-0 flex-1 truncate leading-snug">{props.children}</span>
      <div class="flex shrink-0 items-center gap-0.5 self-center">
        <Show when={props.secondaryActionLabel && props.onSecondaryAction}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class={INFO_ROW_ACTION_CLASS}
            disabled={props.secondaryActionDisabled}
            onClick={() => props.onSecondaryAction?.()}
          >
            {props.secondaryActionLabel}
          </Button>
        </Show>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class={INFO_ROW_ACTION_CLASS}
          disabled={props.actionDisabled}
          onClick={() => props.onAction()}
        >
          {props.actionLabel}
        </Button>
      </div>
    </div>
  );
}

/* ─── Skeleton 加载占位组件 ─── */

function ShimmerLine(props: { class?: string; width?: string; height?: string }) {
  return (
    <div
      class={cn('skeleton-shimmer', props.class)}
      style={{
        width: props.width || '100%',
        height: props.height || '14px',
      }}
    />
  );
}

function InfoRowSkeleton() {
  return (
    <div class="flex items-center gap-2 py-1">
      <div class="skeleton-shimmer h-4 w-4 shrink-0 rounded-full!" />
      <ShimmerLine width="48px" height="13px" />
      <ShimmerLine width="40%" height="13px" />
    </div>
  );
}

function DetailInfoListSkeleton() {
  return (
    <div class="space-y-1">
      <InfoRowSkeleton />
      <InfoRowSkeleton />
      <InfoRowSkeleton />
      <InfoRowSkeleton />
      <InfoRowSkeleton />
    </div>
  );
}

function IntroSkeleton() {
  return (
    <div class="mt-3">
      <ShimmerLine width="36px" height="16px" class="mb-2.5" />
      <div class="space-y-2">
        <ShimmerLine width="100%" height="13px" />
        <ShimmerLine width="95%" height="13px" />
        <ShimmerLine width="88%" height="13px" />
        <ShimmerLine width="92%" height="13px" />
        <ShimmerLine width="60%" height="13px" />
      </div>
    </div>
  );
}

function NameBadgesSkeleton() {
  return (
    <div class="flex flex-col items-center gap-2 mb-3">
      <ShimmerLine width="140px" height="22px" />
      <div class="flex gap-1.5 justify-center">
        <ShimmerLine width="48px" height="20px" class="rounded-full!" />
        <ShimmerLine width="52px" height="20px" class="rounded-full!" />
        <ShimmerLine width="48px" height="20px" class="rounded-full!" />
        <ShimmerLine width="56px" height="20px" class="rounded-full!" />
      </div>
    </div>
  );
}

/** 判断字符串是否有意义（非空、非纯空白/标点） */
function isMeaningful(s: string | undefined | null): boolean {
  if (!s) return false;
  return s.replace(/[\s•·\-—_|,，.。、/\\]+/g, '').length > 0;
}

function isOnlineSearchBook(book: Pick<SearchBook, 'origin'>): boolean {
  const o = book.origin;
  return o !== 'local' && !o.startsWith('local::');
}

function isLocalTxtBook(book: Pick<SearchBook, 'origin' | 'originName' | 'bookUrl'>): boolean {
  if (!isLocalBook(book as Book)) return false;
  if (detectFileType(book.originName) === 'txt') return true;
  const urlName = book.bookUrl.replace(/^.*[/\\]/, '');
  return detectFileType(urlName) === 'txt';
}

async function resolveTxtTocRuleDisplayName(tocUrl: string | undefined): Promise<string> {
  const rules = await txtTocDb.getAllTxtTocRules();
  const matched = matchTxtTocRuleByStorage(tocUrl, rules);
  if (matched) return matched.name;
  if (!tocUrl?.trim()) return '自动识别';
  return '自定义';
}

function resolveInitialPreloadedChapters(
  cacheKey: string | undefined,
  cachedBook: ReturnType<typeof pageCacheStore.getBookInfoCache>,
): BookChapter[] | null {
  if (!cacheKey) return null;
  const fromPage = cachedBook?.chapters;
  if (fromPage && fromPage.length > 0) return fromPage;
  const fromSession = getBookInfoTocSessionCache(cacheKey);
  if (fromSession && fromSession.length > 0) return fromSession;
  return null;
}

/* ─── 主组件 ─── */

export interface BookInfoPageProps {
  book: SearchBook;
  /** 从发现/探索进入时已有书源，可立即加载封面 */
  source?: BookSource;
  /** 展示方式：独立全屏页（默认）或嵌入抽屉内容区 */
  presentation?: 'page' | 'drawer';
  /** 抽屉宿主：为 false 时强制关闭内嵌 Dialog，避免抽屉卸载中断 Portal 清理 */
  shellActive?: boolean;
  /** 阅读器内打开详情且当前书仍在阅读会话中 */
  continueReading?: boolean;
  onBack: () => void;
  onOpenBook: (book: Book, initialCatalog?: BookChapter[], source?: BookSource) => void;
  /** 阅读器内打开详情时换源成功后同步刷新阅读会话 */
  onBookSourceChanged?: (book: Book) => void;
  /** 换源弹窗「书源管理」：以独立页打开书源管理 */
  onOpenSourcesManage?: () => void;
  /** 换源弹窗「编辑源」 */
  onSourceEdit?: (source: BookSource) => void;
}

export function BookInfoPage(props: BookInfoPageProps) {
  const requestAbortController = new AbortController();
  onCleanup(() => requestAbortController.abort());
  const isPagePresentation = () => (props.presentation ?? 'page') === 'page';
  /** 独立页按视口 md 分栏；抽屉始终纵向布局 */
  const stackedLayoutVisibleClass = () => (isPagePresentation() ? 'md:hidden' : '');
  const splitLayoutVisibleClass = () => (isPagePresentation() ? 'hidden md:flex' : 'hidden');
  const mobileBlurVisibleClass = () => (isPagePresentation() ? 'md:hidden' : '');
  const [isInShelf, setIsInShelf] = createSignal(false);
  const [isAdding, setIsAdding] = createSignal(false);
  const [isRemoving, setIsRemoving] = createSignal(false);
  const [bookSource, setBookSource] = createSignal<BookSource | undefined>(
    props.source,
  );
  const [coverBlobUrl, setCoverBlobUrl] = createSignal<string | null>(null);
  const [showCoverDialog, setShowCoverDialog] = createSignal(false);
  const [isDark, setIsDark] = createSignal(document.documentElement.classList.contains('dark'));
  
  // 检查缓存
  const bookUrl = props.book.bookUrl || props.book.tocUrl;
  const cachedBook = bookUrl ? pageCacheStore.getBookInfoCache(bookUrl) : null;
  const initialBook = cachedBook?.book || props.book;
  const [bookData, setBookData] = createSignal<SearchBook>(initialBook);

  // 同步计算是否需要刷新：缺作者/简介/封面等任一字段即拉详情（看漫画等靠 og:novel meta 补作者）
  const bookNeedsDetailRefresh = (book: SearchBook) =>
    !isMeaningful(book.author) ||
    !book.intro?.trim() ||
    !isMeaningful(book.latestChapterTitle) ||
    !isMeaningful(book.latestChapterUpdateTime) ||
    !book.coverUrl?.trim();
  const needsRefresh = bookNeedsDetailRefresh(cachedBook?.book ?? props.book);
  const [isLoading, setIsLoading] = createSignal(needsRefresh);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  /** 对齐 legado：详情页后台预加载目录，加入书架时直接写入 */
  const initialPreloadedChapters = resolveInitialPreloadedChapters(bookUrl, cachedBook);
  const [preloadedChapters, setPreloadedChapters] = createSignal<BookChapter[] | null>(
    initialPreloadedChapters,
  );
  const [tocLoading, setTocLoading] = createSignal(
    isOnlineSearchBook(initialBook) && !initialPreloadedChapters?.length,
  );
  const [tocLoadError, setTocLoadError] = createSignal<string | null>(null);
  const [shelfBook, setShelfBook] = createSignal<Book | null>(null);
  const [userGroups, setUserGroups] = createSignal<BookGroup[]>([]);
  const [showGroupPick, setShowGroupPick] = createSignal(false);
  const [showTocDialog, setShowTocDialog] = createSignal(false);
  const [txtTocRuleOpen, setTxtTocRuleOpen] = createSignal(false);
  const [txtTocSample, setTxtTocSample] = createSignal('');
  const [txtTocRuleName, setTxtTocRuleName] = createSignal('');
  const [txtTocReparsing, setTxtTocReparsing] = createSignal(false);
  const [changeSourceOpen, setChangeSourceOpen] = createSignal(false);

  createEffect(() => {
    if (props.shellActive !== false) return;
    setShowTocDialog(false);
    setShowCoverDialog(false);
    setShowGroupPick(false);
    setTxtTocRuleOpen(false);
    setChangeSourceOpen(false);
  });

  // 检测主题变化
  onMount(() => {
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    checkTheme();
    
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      observer.disconnect();
    };
  });

  // isValidHttpUrl 和 tryBuildBookInfoUrlFromDataUrl 已移至 detail.ts（getBookInfo 统一处理）

  const refreshShelfBook = async () => {
    const url = currentBook().bookUrl;
    if (!url || !(await hasBook(url))) {
      setShelfBook(null);
      return;
    }
    setShelfBook((await getBook(url)) ?? null);
  };

  /** 详情页数据回写书架（已在架时补全作者等缺失字段） */
  const syncShelfBookIfNeeded = async (detail: SearchBook) => {
    if (!isInShelf()) return;
    const updated = await syncShelfBookFromSearchBook(detail);
    if (updated) setShelfBook(updated);
  };

  const commitPreloadedChapters = (book: SearchBook, chapters: BookChapter[]) => {
    if (chapters.length === 0) return;
    setPreloadedChapters(chapters);
    const key = book.tocUrl || book.bookUrl;
    if (!key) return;
    setBookInfoTocSessionCache(key, chapters);
    if (pageCacheStore.getBookInfoCache(key)) {
      pageCacheStore.setBookInfoTocCache(key, chapters);
    } else {
      pageCacheStore.setBookInfoCache(key, book, chapters);
    }
  };

  const preloadChapterList = async (book: SearchBook, source: BookSource) => {
    if (book.origin === 'local' || book.origin.startsWith('local::')) return;
    const tocUrl = book.tocUrl || book.bookUrl;
    if (!tocUrl) return;
    setTocLoadError(null);

    if (preloadedChapters()?.length) {
      setTocLoading(false);
      return;
    }

    setTocLoading(true);
    try {
      const inDb = await getDbChapterList(book.bookUrl);
      if (inDb.length > 0 && !shelfCachedChapterListLooksStale(inDb, book)) {
        commitPreloadedChapters(book, inDb);
        return;
      }
      if (inDb.length > 0) {
        console.log('[BookInfo] 本地目录不完整，重新拉取', {
          cached: inDb.length,
          expected: shelfBook()?.totalChapterNum ?? 0,
        });
      }
      let firstPartialCommitted = false;
      const list = await fetchChapterListDeduped(source, tocUrl, {
        bookUrl: book.bookUrl,
        bookVariable: book.variable,
        signal: requestAbortController.signal,
        partialUpdates: 'first',
        onPartial: async (partial) => {
          // 分页目录可能回调数十次。每次复制整表并写响应式缓存会形成 O(n²)
          // 主线程压力；首批用于尽快展示，完整结果在请求结束后一次性提交。
          if (!firstPartialCommitted && partial.chapters.length > 0) {
            firstPartialCommitted = true;
            commitPreloadedChapters(book, partial.chapters);
            setTocLoading(false);
          }
        },
      });
      if (list.length > 0) {
        commitPreloadedChapters(book, list);
      } else if (!preloadedChapters()?.length) {
        setTocLoadError('目录为空');
      }
    } catch (e) {
      console.warn('[BookInfo] 预加载目录失败:', e);
      setTocLoadError(e instanceof Error ? e.message : '加载目录失败');
    } finally {
      setTocLoading(false);
    }
  };

  // 加载书籍信息的函数（可重用）
  const loadBookInfo = async () => {
    const bookUrl = props.book.bookUrl || props.book.tocUrl;
    
    if (!needsRefresh || !bookUrl) {
      setIsLoading(false);
      setLoadError(null);
      return;
    }
    
    setLoadError(null);
    setIsLoading(true);
    
    try {
      const source = bookSource() ?? await getSource(props.book.origin);
      if (!source) {
        const errorMsg = '无法获取书源，请检查书源是否存在';
        console.warn('[BookInfo]', errorMsg);
        setLoadError(errorMsg);
        setIsLoading(false);
        setTocLoading(false);
        setTocLoadError('无法获取书源');
        return;
      }
      setBookSource(source);

      console.log('[BookInfo] 开始获取书籍详情，bookUrl:', bookUrl.substring(0, 100));
      const durTitle = shelfBook()?.durChapterTitle?.trim() ?? '';
      const bookInfo = await getBookInfo(source, bookUrl, {
        durChapterTitle: durTitle || undefined,
        bookVariable: props.book.variable,
        book: props.book as unknown as Record<string, unknown>,
        signal: requestAbortController.signal,
      });

      if (bookInfo) {
      console.log('[BookInfo] 获取到书籍详情:', {
        name: bookInfo.name,
        hasIntro: !!bookInfo.intro,
        hasCoverUrl: !!bookInfo.coverUrl,
        hasLatestChapter: !!bookInfo.latestChapterTitle,
        source: bookInfo.source,
        status: bookInfo.status,
      });
        // 合并：用 isMeaningful 判断已有值是否有效，避免 " • " 等占位符覆盖 API 真实数据
        const m = (existing: string | undefined, fresh: string | undefined) =>
          isMeaningful(existing) ? existing : (fresh || existing);
        const wordCountText = bookInfo.wordCount || undefined;
        const mergedBook: SearchBook = {
          ...props.book,
          name: preferDetailField(bookInfo.name, props.book.name) ?? props.book.name,
          author: isMeaningful(bookInfo.author)
            ? bookInfo.author!
            : isMeaningful(props.book.author)
              ? props.book.author!
              : (preferDetailField(bookInfo.author, props.book.author) ?? props.book.author ?? ''),
          kind: preferDetailField(bookInfo.kind, props.book.kind),
          intro: preferDetailIntro(bookInfo.intro, props.book.intro),
          latestChapterTitle: m(props.book.latestChapterTitle, bookInfo.latestChapterTitle),
          latestChapterUpdateTime: m(props.book.latestChapterUpdateTime, bookInfo.latestChapterUpdateTime),
          coverUrl: preferDetailField(bookInfo.coverUrl, props.book.coverUrl),
          // tocUrl 优先使用 API 返回值（如 /catalog?...），因为发现页的 tocUrl 通常只是 bookUrl（/detail?...）
          tocUrl: bookInfo.tocUrl || props.book.tocUrl,
          wordCount: m(props.book.wordCount, wordCountText),
          chapterWordCountText: m(props.book.chapterWordCountText, wordCountText),
          source: preferDetailContentSource(props.book.source, bookInfo.source),
          status: m(props.book.status, bookInfo.status),
          tab: m(props.book.tab, bookInfo.tab),
          category: m(props.book.category, bookInfo.category),
          tags: m(props.book.tags, bookInfo.tags),
          score: m(props.book.score, bookInfo.score),
          variable: mergeBookContentVariable(props.book.variable, {
            source: preferDetailContentSource(props.book.source, bookInfo.source),
          }),
        };
        
        setBookData(mergedBook);
        if (mergedBook.coverUrl && mergedBook.coverUrl !== props.book.coverUrl) {
          setCoverBlobUrl(null);
        }

        // 保存到缓存
        if (bookUrl) {
          pageCacheStore.setBookInfoCache(bookUrl, mergedBook, preloadedChapters() ?? undefined);
        }
        // 对齐 Legado BookInfoViewModel：详情完成后自动预取目录。目录页的
        // 列表提取与逐章解析由 Worker 承担，不占用 Solid UI 主线程。
        window.setTimeout(() => {
          if (!requestAbortController.signal.aborted) {
            void preloadChapterList(mergedBook, source);
          }
        }, 0);
        void syncShelfBookIfNeeded(mergedBook);
      } else {
        const errorMsg = '获取书籍详情失败，返回数据为空';
        console.warn('[BookInfo]', errorMsg);
        setLoadError(errorMsg);
        if (!preloadedChapters()?.length) {
          setTocLoading(false);
          setTocLoadError('书籍详情加载失败，无法获取目录');
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '网络请求失败，请检查网络连接';
      console.warn('[BookInfo] 刷新书籍信息失败:', error);
      setLoadError(errorMsg);
      if (!preloadedChapters()?.length) {
        setTocLoading(false);
        setTocLoadError('书籍详情加载失败，无法获取目录');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 检查并刷新书籍信息（参考 legado BookInfoViewModel.loadBookInfo）
  // data: URL 和标准 HTTP URL 均由 getBookInfo（detail.ts）统一处理
  onMount(async () => {
    // 详情请求与本地数据库初始化并行，首屏直接使用探索页传入的数据。
    void loadBookInfo();

    const [inShelf, groups, source, inDb] = await Promise.all([
      hasBook(props.book.bookUrl),
      getAllGroups(),
      bookSource() ? Promise.resolve(bookSource()) : getSource(props.book.origin),
      preloadedChapters()?.length
        ? Promise.resolve<BookChapter[]>([])
        : getDbChapterList(props.book.bookUrl),
    ]);
    setIsInShelf(inShelf);
    if (inShelf) await refreshShelfBook();
    setUserGroups(groups.filter((g) => g.groupId > 0));

    if (!bookSource() && source) {
      setBookSource(source ?? undefined);
    }

    if (!preloadedChapters()?.length) {
      if (isLocalBook(props.book)) {
        if (inDb.length > 0) commitPreloadedChapters(props.book, inDb);
      } else if (isOnlineSearchBook(props.book)) {
        const savedShelfBook = shelfBook();
        const bookForStaleCheck = savedShelfBook ?? props.book;
        if (
          inDb.length > 0 &&
          !shelfCachedChapterListLooksStale(inDb, bookForStaleCheck)
        ) {
          commitPreloadedChapters(props.book, inDb);
        }
      }
    }
    if (preloadedChapters()?.length) {
      setTocLoading(false);
    }

    if (
      !needsRefresh &&
      source &&
      !preloadedChapters()?.length &&
      isOnlineSearchBook(props.book)
    ) {
      window.setTimeout(() => {
        if (!requestAbortController.signal.aborted) {
          void preloadChapterList(currentBook(), source);
        }
      }, 0);
    }

    if (isLocalTxtBook(props.book)) {
      await refreshLocalTxtTocRuleName(props.book);
    }

    const bookUrl = props.book.bookUrl || props.book.tocUrl;

    console.log('[BookInfo] 刷新检查:', {
      needsRefresh,
      bookUrl: bookUrl?.substring(0, 100),
      hasIntro: !!props.book.intro,
      hasCoverUrl: !!props.book.coverUrl,
    });
  });

  function shelfAddOptions(chapters?: BookChapter[]) {
    const cached = chapters ?? preloadedChapters();
    const hasCachedToc = (cached?.length ?? 0) > 0;
    // 详情页已预加载完整目录时不再后台拉取（对齐阅读器试读加入书架）
    const fetchChapters = hasCachedToc && !tocLoading() ? false : ('background' as const);
    return {
      chapters: hasCachedToc && cached ? cached : undefined,
      fetchChapters,
      readingProgress: getReaderProgressSnapshot(currentBook().bookUrl),
    };
  }

  async function handleAddToShelf() {
    if (isAdding()) return;
    setIsAdding(true);
    try {
      const book = await addSearchBookToShelf(currentBook(), shelfAddOptions());
      if (book) {
        setIsInShelf(true);
        await refreshShelfBook();
        showAppToast({ title: '已加入书架', description: `《${currentBook().name}》已成功加入书架`, variant: 'success' });
      } else {
        showAppToast({ title: '加入失败', description: '无法加入书架，请检查书源是否有效', variant: 'error' });
      }
    } catch (error) {
      console.error('[BookInfo] 加入书架失败:', error);
      showAppToast({ title: '加入失败', description: error instanceof Error ? error.message : '未知错误', variant: 'error' });
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRemoveFromShelf() {
    if (isRemoving()) return;
    const book = currentBook();
    const url = book.bookUrl;
    if (!url) return;
    setIsRemoving(true);
    try {
      await bookshelfStore.removeBook(url);
      setIsInShelf(false);
      setShelfBook(null);
      showAppToast({ title: '已移出书架', description: `《${book.name}》已从书架移除`, variant: 'default' });
    } catch (error) {
      console.error('[BookInfo] 移出书架失败:', error);
      showAppToast({ title: '移出失败', description: error instanceof Error ? error.message : '未知错误', variant: 'error' });
    } finally {
      setIsRemoving(false);
    }
  }

  async function handleStartReading() {
    const book = currentBook();
    let source = bookSource();
    if (!source && book.origin) {
      source = (await getSource(book.origin)) ?? undefined;
      if (source) setBookSource(source);
    }

    if (source && isOnlineSearchBook(book)) {
      void preloadChapterList(book, source);
    }

    await openBookAtChapter();
  }

  async function openBookAtChapter(chapterIndex?: number) {
    let book: Book;
    const detail = currentBook();
    if (isInShelf()) {
      const base = shelfBook() ?? (await getBook(detail.bookUrl));
      if (!base) {
        showAppToast({
          title: '无法开始阅读',
          description: '书架中未找到该书，请重新加入书架',
          variant: 'error',
        });
        return;
      }
      const mergedVariable = mergeBookContentVariable(base.variable, { source: detail.source });
      book = {
        ...base,
        variable: mergedVariable ?? base.variable,
      };
      if (chapterIndex !== undefined) {
        book = { ...book, durChapterIndex: chapterIndex, durChapterPos: 0 };
      }
    } else {
      book = searchBookToEphemeralBook(detail, bookSource() ?? props.source);
      if (chapterIndex !== undefined) {
        book = { ...book, durChapterIndex: chapterIndex, durChapterPos: 0 };
      }
    }
    const catalog = preloadedChapters();
    props.onOpenBook(
      book,
      catalog && catalog.length > 0 ? catalog : undefined,
      bookSource() ?? props.source,
    );
  }

  async function handleSelectChapterFromToc(index: number) {
    const list = preloadedChapters();
    if (!list || list.length === 0) return;
    const idx = Math.min(Math.max(index, 0), list.length - 1);
    setShowTocDialog(false);
    await openBookAtChapter(idx);
  }

  const badgeEntries = () => collectBookBadgeEntries(currentBook());

  const getStatusBadgeVariant = (status: string): 'success' | 'warning' | 'secondary' | 'default' => {
    const s = status.trim();
    if (/已完结|完结|完成/i.test(s)) return 'success';
    if (/连载|更新中/i.test(s)) return 'warning';
    if (/已出版|出版/i.test(s)) return 'secondary';
    return 'default';
  };

  // 使用刷新后的数据
  const currentBook = () => bookData();

  /** 在线书目录才显示章节正文缓存云标 */
  const showChapterCacheHint = () => {
    const sb = shelfBook();
    if (sb) return !isLocalBook(sb);
    const origin = currentBook().origin ?? '';
    return origin !== 'local' && !origin.startsWith('local::');
  };

  const displayIntro = () => {
    const sb = shelfBook();
    const raw = sb?.customIntro?.trim() || currentBook().intro?.trim();
    if (!raw) return undefined;
    return formatBookIntroPlainText(raw);
  };

  const originDisplayName = () => {
    const b = currentBook();
    if (!isOnlineSearchBook(b)) return '本地';
    return b.originName || bookSource()?.sourceName || b.origin || '';
  };

  const groupDisplayName = () => {
    const sb = shelfBook();
    if (!sb) return '未分组';
    if (isLocalBook(sb)) {
      const names = formatBookshelfBookGroupNames(sb, userGroups());
      return names === '无' ? '本地·无分组' : names;
    }
    const names = formatBookshelfBookGroupNames(sb, userGroups());
    return names === '无' ? '未分组' : names;
  };

  const tocRowText = () => {
    const chapters = preloadedChapters();
    const sb = shelfBook();
    const durTitle = sb?.durChapterTitle?.trim();
    if (durTitle) return dedupeLegadoSourceChapterTitle(durTitle);
    if (chapters && chapters.length > 0) {
      const idx = sb?.durChapterIndex ?? 0;
      const ch = chapters[Math.min(Math.max(idx, 0), chapters.length - 1)];
      const title = ch?.title?.trim();
      if (title) return dedupeLegadoSourceChapterTitle(title);
      return '第1章';
    }
    if (tocLoading()) {
      return '加载中…';
    }
    if (tocLoadError()) return '加载失败';
    return '暂无目录';
  };

  const cacheBookInfoKey = () => props.book.tocUrl || props.book.bookUrl;

  const resolveChangeSourceBook = (): Book | null => {
    const sb = shelfBook();
    if (sb && !isLocalBook(sb)) return sb;
    const detail = currentBook();
    if (!isOnlineSearchBook(detail)) return null;
    return searchBookToEphemeralBook(detail, bookSource() ?? props.source);
  };

  const handleChangeSource = () => {
    if (!resolveChangeSourceBook()) {
      showAppToast({
        title: '无法换源',
        description: '本地书不支持换源',
      });
      return;
    }
    setChangeSourceOpen(true);
  };

  const handleBookSourceChanged = async (nextBook: Book) => {
    const oldKey = cacheBookInfoKey();
    const nextSearch = bookToSearchBook(nextBook);
    setBookData(nextSearch);
    setCoverBlobUrl(null);

    if (isInShelf()) {
      await refreshShelfBook();
      await bookshelfStore.refreshBooks();
      const chapters = await getDbChapterList(nextBook.bookUrl);
      if (chapters.length > 0) {
        commitPreloadedChapters(nextSearch, chapters);
      }
    }

    const newKey = nextBook.tocUrl || nextBook.bookUrl;
    if (oldKey && oldKey !== newKey) {
      pageCacheStore.clearBookInfoCache(oldKey);
    }
    if (newKey) {
      pageCacheStore.setBookInfoCache(newKey, nextSearch, preloadedChapters() ?? undefined);
    }

    const src = await getSource(nextBook.origin);
    if (src) setBookSource(src);
    props.onBookSourceChanged?.(nextBook);
  };

  const applyBookSourceChange = async (book: Book, item: SearchBook) => {
    if (isInShelf()) {
      return applyChangeSource(book, item);
    }
    const { book: next, chapters } = await resolveChangeSource(book, item);
    commitPreloadedChapters(bookToSearchBook(next), chapters);
    return next;
  };

  const handleSetGroup = async () => {
    if (!isInShelf()) {
      await handleAddToShelf();
      if (!isInShelf()) return;
    }
    await refreshShelfBook();
    setShowGroupPick(true);
  };

  const handleGroupConfirm = async (groupIds: number[]) => {
    const url = currentBook().bookUrl;
    if (!url) return;
    const mask = groupIds.reduce((acc, id) => acc | id, 0);
    try {
      await updateBooksGroupMask([url], mask);
      await refreshShelfBook();
      await bookshelfStore.refreshBooks();
      setShowGroupPick(false);
      showAppToast({ title: '分组已更新', variant: 'success' });
    } catch (e) {
      console.error('[BookInfo] 设置分组失败:', e);
      showAppToast({
        title: '设置分组失败',
        description: e instanceof Error ? e.message : '未知错误',
        variant: 'error',
      });
    }
  };

  const handleViewToc = async () => {
    // 弹窗先响应点击；目录尚未就绪时由弹窗骨架屏承接后台预取状态。
    setShowTocDialog(true);
    if (tocLoading() && !preloadedChapters()?.length) {
      return;
    }

    let list = preloadedChapters();
    if (!list || list.length === 0) {
      const source = bookSource();
      const book = currentBook();
      if (source && isOnlineSearchBook(book)) {
        await preloadChapterList(book, source);
      } else if (isLocalBook(book)) {
        const inDb = await getDbChapterList(book.bookUrl);
        if (inDb.length > 0) commitPreloadedChapters(book, inDb);
      }
      list = preloadedChapters();
    }

    if (!list || list.length === 0) {
      showAppToast({
        title: '目录为空',
        description: tocLoadError() || '请检查网络或书源规则',
        variant: 'error',
      });
      return;
    }

  };

  const refreshLocalTxtTocRuleName = async (book: SearchBook) => {
    const sb = shelfBook();
    setTxtTocRuleName(await resolveTxtTocRuleDisplayName(sb?.tocUrl ?? book.tocUrl));
  };

  const openLocalTxtTocRulePicker = async () => {
    const book = currentBook();
    if (!book.bookUrl) return;
    try {
      const buf = await readLocalBookContent(book.bookUrl);
      const sampleBytes = buf.byteLength > 512_000 ? buf.slice(0, 512_000) : buf;
      setTxtTocSample(new TextDecoder('utf-8', { fatal: false }).decode(sampleBytes));
      setTxtTocRuleOpen(true);
    } catch (e) {
      showAppToast({
        title: '无法读取书籍',
        description: e instanceof Error ? e.message : '读取文件失败',
        variant: 'destructive',
      });
    }
  };

  const handleLocalTxtTocRuleConfirm = async (pick: TxtTocRulePickResult) => {
    const book = currentBook();
    if (!book.bookUrl || txtTocReparsing()) return;
    setTxtTocReparsing(true);
    try {
      const result = await reparseLocalTxtBook(book.bookUrl, pick.tocRuleStorage, {
        splitLongChapter: pick.splitLongChapter,
      });
      commitPreloadedChapters(book, await getDbChapterList(book.bookUrl));
      setBookData((b) => ({ ...b, totalChapterNum: result.chapterCount }));
      await refreshShelfBook();
      await refreshLocalTxtTocRuleName(book);
      showAppToast({
        title: '目录已更新',
        description: `共 ${result.chapterCount} 章`,
      });
    } catch (e) {
      showAppToast({
        title: '重新分章失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setTxtTocReparsing(false);
    }
  };

  const localTxtTocSummary = () => {
    const count = preloadedChapters()?.length ?? shelfBook()?.totalChapterNum ?? 0;
    const rule = txtTocRuleName();
    if (count > 0) return `共 ${count} 章 · ${rule}`;
    return rule || '暂无目录';
  };

  const handleCoverUrlRefreshed = (fresh: string) => {
    setBookData((b) => {
      const next = { ...b, coverUrl: fresh };
      const key = cacheBookInfoKey();
      if (key) pageCacheStore.setBookInfoCache(key, next, preloadedChapters() ?? undefined);
      return next;
    });
  };

  const coverLoadOptions = () => ({
    referer: currentBook().origin,
    source: bookSource() ?? null,
    bookUrl: props.book.bookUrl,
    onCoverUrlRefreshed: handleCoverUrlRefreshed,
  });

  const coverBackgroundSrc = () =>
    resolveCoverBackgroundUrl(currentBook().coverUrl, coverBlobUrl());

  createEffect(() => {
    const url = currentBook().coverUrl?.trim();
    if (!url || !shouldFetchCoverAsBlob(url)) {
      setCoverBlobUrl(null);
      return;
    }
    const origin = currentBook().origin;
    if (!bookSource() && origin && !/^https?:\/\//i.test(origin)) {
      return;
    }

    let cancelled = false;
    void loadCoverImageObjectUrl(url, coverLoadOptions()).then((blob) => {
      if (!cancelled) setCoverBlobUrl(blob);
    });

    return () => {
      cancelled = true;
    };
  });

  createEffect(() => {
    const blob = coverBlobUrl();
    return () => {
      if (blob) URL.revokeObjectURL(blob);
    };
  });

  /* ── 书名 + 标签区块（桌面端用于左栏，移动端用于信息区顶部） ── */
  function NameAndBadges(props_inner: { class?: string; center?: boolean; onBlurBg?: boolean }) {
    // 如果在模糊背景上，根据主题调整文字颜色
    const textColor = () => {
      if (props_inner.onBlurBg) {
        return isDark() ? 'text-white' : 'text-foreground';
      }
      return 'text-foreground';
    };

    const badgeStyle = () => {
      if (props_inner.onBlurBg) {
        if (isDark()) {
          return 'bg-white/20 text-white border-white/30';
        } else {
          return 'bg-black/10 text-foreground border-black/20';
        }
      }
      return '';
    };

    return (
      <div class={cn(props_inner.center && 'text-center', props_inner.class)}>
        <h2 class={cn('mb-1.5 text-lg font-bold leading-snug', textColor())}>
          {currentBook().name}
        </h2>
        <Show when={badgeEntries().length > 0}>
          <div class={cn('flex flex-wrap gap-1.5', props_inner.center && 'justify-center')}>
            <For each={badgeEntries()}>
              {(entry) => (
                <Badge
                  variant={entry.key === 'status' ? getStatusBadgeVariant(entry.value) : 'secondary'}
                  class={cn('text-xs', badgeStyle())}
                >
                  {entry.value}
                </Badge>
              )}
            </For>
          </div>
        </Show>
      </div>
    );
  }

  /* ── 详细信息列表（来源/章节/字数等） ── */
  /* 注意：所有 signal 访问必须在 JSX 内部才能保持响应式（Solid.js 组件体只执行一次） */
  function DetailInfoList(dlProps: { hideAuthor?: boolean }) {
    return (
      <div class="space-y-0">
        {/* 作者（宽屏左栏已显示时隐藏） */}
        <Show when={!dlProps.hideAuthor && currentBook().author}>
          <InfoRow icon={AuthorIcon} label="作者：">{currentBook().author}</InfoRow>
        </Show>
        {/* 来源 + 换源 */}
        <Show when={originDisplayName() || currentBook().source}>
          <InfoRowWithAction
            icon={OriginIcon}
            label="来源："
            actionLabel="换源"
            onAction={handleChangeSource}
            actionDisabled={!isOnlineSearchBook(currentBook())}
          >
            {currentBook().source || originDisplayName()}
            <Show
              when={
                currentBook().source &&
                originDisplayName() &&
                currentBook().source !== originDisplayName()
              }
            >
              <span class="text-muted-foreground/60 ml-1">({originDisplayName()})</span>
            </Show>
          </InfoRowWithAction>
        </Show>
        {/* 分组 + 设置分组 */}
        <InfoRowWithAction
          icon={GroupFolderIcon}
          label="分组："
          actionLabel="设置分组"
          onAction={() => void handleSetGroup()}
        >
          {groupDisplayName()}
        </InfoRowWithAction>
        {/* 最新章节 — 使用 isMeaningful 过滤 " • " 等无效值 */}
        <Show when={isMeaningful(currentBook().latestChapterTitle)}>
          <InfoRow icon={ChapterMetaIcon} label="最新：">
            {dedupeLegadoSourceChapterTitle(currentBook().latestChapterTitle!)}
          </InfoRow>
        </Show>
        {/* 更新时间 */}
        <Show when={isMeaningful(currentBook().latestChapterUpdateTime)}>
          <InfoRow icon={UpdateTimeIcon} label="更新：">{currentBook().latestChapterUpdateTime}</InfoRow>
        </Show>
        {/* 字数 */}
        <Show when={isMeaningful(currentBook().chapterWordCountText) || isMeaningful(currentBook().wordCount)}>
          <InfoRow icon={WordCountIcon} label="字数：">{currentBook().chapterWordCountText || currentBook().wordCount}</InfoRow>
        </Show>
        {/* 目录 + 查看目录（在线书） */}
        <Show when={isOnlineSearchBook(currentBook())}>
          <InfoRowWithAction
            icon={TocMetaIcon}
            label="目录："
            actionLabel="查看目录"
            onAction={() => void handleViewToc()}
            actionDisabled={tocLoading() && !preloadedChapters()?.length}
          >
            {tocRowText()}
          </InfoRowWithAction>
        </Show>
        {/* 本地 TXT：目录 + 目录规则 */}
        <Show when={isLocalTxtBook(currentBook())}>
          <InfoRowWithAction
            icon={TocMetaIcon}
            label="目录："
            actionLabel="查看目录"
            onAction={() => void handleViewToc()}
            secondaryActionLabel="目录规则"
            onSecondaryAction={() => void openLocalTxtTocRulePicker()}
            secondaryActionDisabled={txtTocReparsing()}
          >
            {localTxtTocSummary()}
          </InfoRowWithAction>
        </Show>
      </div>
    );
  }

  /* ── 简介区块 ── */
  function IntroSection() {
    const intro = () => displayIntro();
    return (
      <Show when={intro()}>
        <div class="mt-3">
          <h3 class="mb-1.5 text-sm font-medium text-foreground">简介</h3>
          <p class="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {intro()}
          </p>
        </div>
      </Show>
    );
  }

  /* ── 底部操作栏 ── */
  function ActionBar() {
    return (
      <div class="shrink-0 border-t border-border/40 bg-background app-bottom-chrome-inset md:bg-background">
        <div class="flex h-[50px] items-center gap-2 px-4">
          <Show
            when={isInShelf()}
            fallback={
              <Button variant="outline" class="flex-1" onClick={handleAddToShelf} disabled={isAdding()}>
                <AddToShelfIcon class="h-4 w-4" />
                {isAdding() ? '加入中...' : '加入书架'}
              </Button>
            }
          >
            <Button variant="destructive" class="flex-1" onClick={handleRemoveFromShelf} disabled={isRemoving()}>
              <RemoveFromShelfIcon class="h-4 w-4" />
              {isRemoving() ? '移出中...' : '移出书架'}
            </Button>
          </Show>
          <Button variant="default" class="flex-1" onClick={handleStartReading} disabled={isAdding() || isRemoving()}>
            <BookOpenIcon class="h-4 w-4" />
            {props.continueReading ? '继续阅读' : '开始阅读'}
          </Button>
        </div>
      </div>
    );
  }

  // 根据主题计算模糊背景的样式
  const blurBgStyle = () => {
    const bgUrl = coverBackgroundSrc();
    if (!bgUrl) return {};
    if (isDark()) {
      return {
        'background-image': `url(${bgUrl})`,
        filter: 'blur(20px) brightness(0.45) saturate(1.05)',
        transform: 'scale(1.1)',
      };
    }
    return {
      'background-image': `url(${bgUrl})`,
      filter: 'blur(20px) brightness(0.8) saturate(1.15)',
      transform: 'scale(1.1)',
    };
  };

  // 根据主题计算遮罩层样式
  const overlayStyle = () => {
    if (isDark()) {
      return 'bg-black/40';
    } else {
      return 'bg-white/50';
    }
  };

  // 根据主题计算模糊背景上的文字颜色
  const textOnBlur = () => {
    return isDark() ? 'text-white' : 'text-foreground';
  };

  return (
    <div
      class={cn(
        'relative flex flex-col overflow-hidden bg-background',
        isPagePresentation() ? 'fixed inset-0 z-50' : 'h-full min-h-0 w-full min-w-0',
      )}
    >
      {/* ── 窄屏：模糊背景（受主题影响；抽屉内由 overflow-hidden 裁切圆角） ── */}
      <Show when={coverBackgroundSrc()}>
        <div class={cn('pointer-events-none absolute inset-0 overflow-hidden', mobileBlurVisibleClass())}>
          <div
            class="absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-300"
            style={blurBgStyle()}
          />
          <div class={cn('absolute inset-0 transition-colors duration-300', overlayStyle())} />
        </div>
      </Show>

      {/* ── 内容区域 ── */}
      <div class="relative z-10 flex h-full flex-col overflow-hidden">

        {/* ============================================================
            窄屏布局（< md）: 纵向堆叠
            参考 legado layout/activity_book_info.xml
            封面居中 → 弧形过渡 → 白色信息卡片
        ============================================================ */}
        <div class={cn('flex-1 overflow-hidden flex flex-col', stackedLayoutVisibleClass())}>
          {/* ── 独立页：PageHeader；抽屉：透明顶栏（叠在模糊背景上） ── */}
          <Show when={isPagePresentation()}>
            <PageHeader
              onBack={props.onBack}
              title="书籍信息"
              draggable={true}
              showThemeToggle={true}
              showWindowControls={true}
              class={cn(
                'bg-transparent border-transparent border-b-0 transition-colors',
                textOnBlur(),
              )}
            />
          </Show>

          {/* 封面区域：固定不滚动；白色卡片从封面中部圆角过渡 */}
          <div class="relative shrink-0" data-tauri-no-drag>
            {/* top = pt(8px) + 封面高度一半(80px) = 88px */}
            <div class="absolute inset-x-0 bottom-0 top-[88px] rounded-t-[128px] bg-background pointer-events-none" />
            <div class="relative z-10 flex justify-center pt-2 pb-5">
              <BookCoverPreviewButton
                coverUrl={currentBook().coverUrl}
                bookUrl={props.book.bookUrl}
                origin={currentBook().origin}
                source={bookSource()}
                name={currentBook().name}
                onCoverUrlRefreshed={handleCoverUrlRefreshed}
                onPreview={() => setShowCoverDialog(true)}
                class="h-[160px] w-[110px] rounded-md shadow-2xl bg-muted/50 transition-transform hover:scale-[1.02] active:scale-[0.98]"
                fallback={
                  <div class="flex h-full w-full items-center justify-center">
                    <BookCoverIcon class="h-16 w-16 text-muted-foreground" size={64} />
                  </div>
                }
              />
            </div>
          </div>

          {/* 白色信息区：内部滚动，滚动条落在白底上 */}
          <div
            class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain scroll-gutter-stable-both bg-background px-4"
            data-tauri-no-drag
          >
            <div class="pb-4 app-scroll-bottom-inset">
              <Show
                when={loadError()}
                fallback={
                  <Show
                    when={!isLoading()}
                    fallback={
                      <div class="pt-1">
                        <NameBadgesSkeleton />
                        <DetailInfoListSkeleton />
                        <IntroSkeleton />
                      </div>
                    }
                  >
                    <div class="bookinfo-fade-in">
                      <NameAndBadges center class="mb-3" />
                      <DetailInfoList />
                      <IntroSection />
                    </div>
                  </Show>
                }
              >
                <div class="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-6 mt-4">
                  <div class="mb-4 text-center text-sm text-destructive">
                    <p class="font-medium mb-1">加载失败</p>
                    <p class="text-xs text-destructive/80 wrap-break-word">{loadError()}</p>
                  </div>
                  <div class="flex justify-center">
                    <Button variant="outline" size="sm" onClick={() => {
                      const bookUrl = props.book.tocUrl || props.book.bookUrl;
                      if (bookUrl) {
                        pageCacheStore.clearBookInfoCache(bookUrl);
                      }
                      loadBookInfo();
                    }}>
                      重试
                    </Button>
                  </div>
                </div>
              </Show>
            </div>
          </div>

          <ActionBar />
        </div>

        {/* ============================================================
            宽屏布局（>= md）: 顶部导航栏 + 下方左右分栏
            参考 legado layout-land/activity_book_info.xml
            顶部: 导航栏（占满宽度，透明背景）
            下方: 左侧封面区域（模糊背景） + 右侧信息区域（白色背景）
        ============================================================ */}
        <div class={cn('flex-1 flex-col overflow-hidden', splitLayoutVisibleClass())}>
          {/* ── 顶部导航栏（主题色背景） ── */}
          <Show when={isPagePresentation()}>
            <PageHeader
              onBack={props.onBack}
              title="书籍信息"
              draggable={true}
              showThemeToggle={true}
              showWindowControls={true}
              class="shrink-0"
            />
          </Show>

          {/* ── 下方内容区域：左右分栏 ── */}
          <div class="flex min-h-0 flex-1 overflow-hidden">
            {/* ── 左栏：封面区域（仅此区域有模糊背景，不参与滚动） ── */}
            <div class="relative flex min-h-0 w-[340px] shrink-0 flex-col overflow-hidden">
              {/* 宽屏：仅封面区域的模糊背景 */}
              <Show when={coverBackgroundSrc()}>
                <div class="absolute inset-0">
                  <div
                    class="absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-300"
                    style={blurBgStyle()}
                  />
                  <div class={cn('absolute inset-0 transition-colors duration-300', overlayStyle())} />
                </div>
              </Show>
              {/* 封面 + 书名 + 作者（居中，受主题影响的文字颜色） */}
              <div class="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-6">
                <BookCoverPreviewButton
                  coverUrl={currentBook().coverUrl}
                  bookUrl={props.book.bookUrl}
                  origin={currentBook().origin}
                  source={bookSource()}
                  name={currentBook().name}
                  onCoverUrlRefreshed={handleCoverUrlRefreshed}
                  onPreview={() => setShowCoverDialog(true)}
                  class="mb-5 h-[200px] w-[130px] rounded-md shadow-2xl bg-muted/50 transition-transform hover:scale-[1.02] active:scale-[0.98] lg:h-[240px] lg:w-[156px]"
                  fallback={
                    <div class="flex h-full w-full items-center justify-center">
                      <BookCoverIcon class="h-16 w-16 text-muted-foreground" size={64} />
                    </div>
                  }
                />
                <NameAndBadges center onBlurBg class="mb-3" />
                <Show when={currentBook().author}>
                  <div
                    class={cn(
                      'flex items-center gap-1.5 text-[13px] transition-colors',
                      isDark() ? 'text-white/80' : 'text-foreground/80',
                    )}
                  >
                    <AuthorIcon class={isDark() ? 'text-white/80' : 'text-foreground/80'} />
                    <span class="truncate max-w-[200px]">{currentBook().author}</span>
                  </div>
                </Show>
              </div>
            </div>

            {/* ── 右栏：详细信息（唯一可滚动区域） ── */}
            <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
              {/* 白色背景从顶部开始，仅此区域可滚动 */}
              <div class="min-h-0 flex-1 overflow-y-auto scroll-gutter-stable-both overscroll-contain px-4 py-5">
              <Show
                when={loadError()}
                fallback={
                  <Show
                    when={!isLoading()}
                    fallback={
                      <div>
                        <DetailInfoListSkeleton />
                        <IntroSkeleton />
                      </div>
                    }
                  >
                    <div class="bookinfo-fade-in">
                      <DetailInfoList />
                      <IntroSection />
                    </div>
                  </Show>
                }
              >
                <div class="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-6">
                  <div class="mb-4 text-center text-sm text-destructive">
                    <p class="font-medium mb-1">加载失败</p>
                    <p class="text-xs text-destructive/80 wrap-break-word">{loadError()}</p>
                  </div>
                  <div class="flex justify-center">
                    <Button variant="outline" size="sm" onClick={() => {
                      // 清除缓存并重新加载
                      const bookUrl = props.book.tocUrl || props.book.bookUrl;
                      if (bookUrl) {
                        pageCacheStore.clearBookInfoCache(bookUrl);
                      }
                      loadBookInfo();
                    }}>
                      重试
                    </Button>
                  </div>
                </div>
              </Show>
            </div>
            <ActionBar />
          </div>

        </div>
        </div>

      </div>

      <BookCoverPreviewDialog
        open={showCoverDialog()}
        onOpenChange={setShowCoverDialog}
        coverUrl={currentBook().coverUrl}
        bookUrl={props.book.bookUrl}
        origin={currentBook().origin}
        source={bookSource() ?? null}
        name={currentBook().name}
      />

      <BookGroupPickDialog
        open={showGroupPick()}
        onOpenChange={setShowGroupPick}
        mode="move"
        title="设置分组"
        description={`为《${currentBook().name}》选择分组`}
        groups={userGroups()}
        initialGroupIds={
          shelfBook() ? bookshelfBookCustomGroupIds(shelfBook()!, userGroups()) : []
        }
        onConfirm={(ids) => void handleGroupConfirm(ids)}
      />

      <BookInfoChapterListDialog
        open={showTocDialog()}
        onOpenChange={setShowTocDialog}
        inDrawer={!isPagePresentation()}
        book={currentBook()}
        bookName={currentBook().name}
        bookUrl={currentBook().bookUrl}
        showChapterCacheHint={showChapterCacheHint()}
        chapters={preloadedChapters() ?? []}
        loading={tocLoading()}
        error={tocLoadError()}
        currentChapterIndex={shelfBook()?.durChapterIndex ?? 0}
        onSelectChapter={(index) => void handleSelectChapterFromToc(index)}
      />

      <TxtTocRulePickDialog
        open={txtTocRuleOpen()}
        onOpenChange={setTxtTocRuleOpen}
        currentTocUrl={shelfBook()?.tocUrl ?? currentBook().tocUrl}
        sampleText={txtTocSample()}
        splitLongChapter={shelfBook()?.readConfig?.splitLongChapter !== false}
        onConfirm={handleLocalTxtTocRuleConfirm}
      />

      <ReaderChangeSourceDialog
        open={changeSourceOpen()}
        onOpenChange={setChangeSourceOpen}
        presentation="app"
        showModePicker={false}
        book={resolveChangeSourceBook()}
        applyBook={applyBookSourceChange}
        onOpenSourcesManage={props.onOpenSourcesManage}
        onSourceEdit={props.onSourceEdit}
        onBookChanged={(book) => void handleBookSourceChanged(book)}
      />
    </div>
  );
}
