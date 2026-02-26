/**
 * 书籍信息页面
 * 参考 legado 的 BookInfo 设计，跨平台双布局：
 *   - 窄屏（移动端）：纵向堆叠，封面居中 → 信息卡片（参考 layout/activity_book_info.xml）
 *   - 宽屏（桌面端）：左右分栏，左侧封面+名称，右侧详情+简介（参考 layout-land/activity_book_info.xml）
 */

import { createSignal, Show, onMount, For } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/PageHeader';
import { BookOpenIcon, ChevronDownIcon, AddToShelfIcon, RemoveFromShelfIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { addSearchBookToShelf } from '@/lib/book-source/add-to-shelf';
import { hasBook } from '@/lib/database/books';
import { getBookInfo } from '@/lib/book-source/detail';
import { getSource } from '@/lib/database/sources';
import { showAppToast } from '@/components/AppToasts';
import { pageCacheStore } from '@/stores/page-cache';
import { bookshelfStore } from '@/stores/bookshelf';
import type { SearchBook } from '@/types';
import type { Book } from '@/types';

/* ─── 图标组件 ─── */

function DefaultCoverIcon(props: { class?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cn('text-muted-foreground', props.class)} aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h3" /><path d="M8 11h6" />
    </svg>
  );
}

function AuthorIcon(props: { class?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cn('h-[18px] w-[18px] shrink-0', props.class)} aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function OriginIcon(props: { class?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cn('h-[18px] w-[18px] shrink-0', props.class)} aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      <path d="M2 12h20" />
    </svg>
  );
}

function ChapterIcon(props: { class?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cn('h-[18px] w-[18px] shrink-0', props.class)} aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function WordCountIcon(props: { class?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cn('h-[18px] w-[18px] shrink-0', props.class)} aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function UpdateTimeIcon(props: { class?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cn('h-[18px] w-[18px] shrink-0', props.class)} aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function TocIcon(props: { class?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cn('h-[18px] w-[18px] shrink-0', props.class)} aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8M8 11h8M8 15h4" />
    </svg>
  );
}

/* ─── 封面图片组件 ─── */

function CoverImage(props: {
  coverUrl?: string;
  name: string;
  coverError: boolean;
  onCoverError: () => void;
  onClick?: () => void;
  class?: string;
}) {
  return (
    <button
      onClick={props.onClick}
      class={cn(
        'rounded-md shadow-2xl overflow-hidden bg-muted/50 focus:outline-none transition-transform hover:scale-[1.02] active:scale-[0.98]',
        props.class,
      )}
      aria-label="查看封面大图"
    >
      <Show
        when={props.coverUrl && !props.coverError}
        fallback={
          <div class="flex h-full w-full items-center justify-center">
            <DefaultCoverIcon class="h-16 w-16" />
          </div>
        }
      >
        <img
          src={props.coverUrl}
          alt={props.name}
          class="h-full w-full object-cover"
          onError={props.onCoverError}
        />
      </Show>
    </button>
  );
}

/* ─── 信息行组件 ─── */

function InfoRow(props: { icon: any; label?: string; children: any; class?: string }) {
  return (
    <div class={cn('flex items-start gap-2 py-1 text-[13px] text-muted-foreground', props.class)}>
      <props.icon class="text-muted-foreground shrink-0 mt-0.5" />
      <Show when={props.label}>
        <span class="shrink-0 text-foreground/70">{props.label}</span>
      </Show>
      <span class="flex-1 min-w-0 wrap-break-word">{props.children}</span>
    </div>
  );
}

/* ─── Skeleton 加载占位组件 ─── */

/** 单行 shimmer 骨架条 */
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

/** 信息行骨架 — 图标 + 标签 + 值 */
function InfoRowSkeleton() {
  return (
    <div class="flex items-center gap-2 py-1">
      <div class="skeleton-shimmer h-4 w-4 shrink-0 rounded-full!" />
      <ShimmerLine width="48px" height="13px" />
      <ShimmerLine width="40%" height="13px" />
    </div>
  );
}

/** 详情信息列表骨架 */
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

/** 简介骨架 */
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

/** 窄屏模式下的书名+标签骨架 */
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

/* ─── 主组件 ─── */

export interface BookInfoPageProps {
  book: SearchBook;
  onBack: () => void;
  onOpenBook: (book: Book) => void;
}

export function BookInfoPage(props: BookInfoPageProps) {
  const [isInShelf, setIsInShelf] = createSignal(false);
  const [isAdding, setIsAdding] = createSignal(false);
  const [isRemoving, setIsRemoving] = createSignal(false);
  const [coverError, setCoverError] = createSignal(false);
  const [introExpanded, setIntroExpanded] = createSignal(false);
  const [showCoverDialog, setShowCoverDialog] = createSignal(false);
  const [isDark, setIsDark] = createSignal(document.documentElement.classList.contains('dark'));
  
  // 检查缓存
  const bookUrl = props.book.tocUrl || props.book.bookUrl;
  const cachedBook = bookUrl ? pageCacheStore.getBookInfoCache(bookUrl) : null;
  const initialBook = cachedBook?.book || props.book;
  const [bookData, setBookData] = createSignal<SearchBook>(initialBook);

  // 同步计算是否需要刷新，若需要则 isLoading 初始为 true，避免内容闪烁
  // 如果有缓存且数据完整，则不需要刷新
  const needsRefresh = cachedBook 
    ? false 
    : (!props.book.intro || !props.book.latestChapterTitle
        || !props.book.latestChapterUpdateTime || !props.book.coverUrl);
  const [isLoading, setIsLoading] = createSignal(needsRefresh && !cachedBook);
  const [loadError, setLoadError] = createSignal<string | null>(null);

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

  // 加载书籍信息的函数（可重用）
  const loadBookInfo = async () => {
    const bookUrl = props.book.tocUrl || props.book.bookUrl;
    
    if (!needsRefresh || !bookUrl) {
      setIsLoading(false);
      setLoadError(null);
      return;
    }
    
    setLoadError(null);
    setIsLoading(true);
    
    try {
      const source = await getSource(props.book.origin);
      if (!source) {
        const errorMsg = '无法获取书源，请检查书源是否存在';
        console.warn('[BookInfo]', errorMsg);
        setLoadError(errorMsg);
        setIsLoading(false);
        return;
      }

      console.log('[BookInfo] 开始获取书籍详情，bookUrl:', bookUrl.substring(0, 100));
      const bookInfo = await getBookInfo(source, bookUrl);

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
          intro: m(props.book.intro, bookInfo.intro),
          latestChapterTitle: m(props.book.latestChapterTitle, bookInfo.latestChapterTitle),
          latestChapterUpdateTime: m(props.book.latestChapterUpdateTime, bookInfo.latestChapterUpdateTime),
          coverUrl: props.book.coverUrl || bookInfo.coverUrl,
          // tocUrl 优先使用 API 返回值（如 /catalog?...），因为发现页的 tocUrl 通常只是 bookUrl（/detail?...）
          tocUrl: bookInfo.tocUrl || props.book.tocUrl,
          wordCount: m(props.book.wordCount, wordCountText),
          chapterWordCountText: m(props.book.chapterWordCountText, wordCountText),
          source: m(props.book.source, bookInfo.source),
          status: m(props.book.status, bookInfo.status),
          tab: m(props.book.tab, bookInfo.tab),
          category: m(props.book.category, bookInfo.category),
          tags: m(props.book.tags, bookInfo.tags),
          score: m(props.book.score, bookInfo.score),
        };
        
        setBookData(mergedBook);
        
        // 保存到缓存
        if (bookUrl) {
          pageCacheStore.setBookInfoCache(bookUrl, mergedBook);
        }
      } else {
        const errorMsg = '获取书籍详情失败，返回数据为空';
        console.warn('[BookInfo]', errorMsg);
        setLoadError(errorMsg);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '网络请求失败，请检查网络连接';
      console.warn('[BookInfo] 刷新书籍信息失败:', error);
      setLoadError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // 检查并刷新书籍信息（参考 legado BookInfoViewModel.loadBookInfo）
  // data: URL 和标准 HTTP URL 均由 getBookInfo（detail.ts）统一处理
  onMount(async () => {
    const inShelf = await hasBook(props.book.bookUrl);
    setIsInShelf(inShelf);

    const bookUrl = props.book.tocUrl || props.book.bookUrl;

    console.log('[BookInfo] 刷新检查:', {
      needsRefresh,
      bookUrl: bookUrl?.substring(0, 100),
      hasIntro: !!props.book.intro,
      hasCoverUrl: !!props.book.coverUrl,
    });

    await loadBookInfo();
  });

  async function handleAddToShelf() {
    if (isAdding()) return;
    setIsAdding(true);
    try {
      const book = await addSearchBookToShelf(currentBook());
      if (book) {
        setIsInShelf(true);
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
      showAppToast({ title: '已移出书架', description: `《${book.name}》已从书架移除`, variant: 'default' });
    } catch (error) {
      console.error('[BookInfo] 移出书架失败:', error);
      showAppToast({ title: '移出失败', description: error instanceof Error ? error.message : '未知错误', variant: 'error' });
    } finally {
      setIsRemoving(false);
    }
  }

  async function handleStartReading() {
    if (!isInShelf()) {
      await handleAddToShelf();
    }
    const book = await addSearchBookToShelf(currentBook());
    if (book) {
      props.onOpenBook(book);
    }
  }

  const badgeEntries = () => {
    const book = currentBook();
    const entries: { key: string; value: string }[] = [];
    if (book.source) entries.push({ key: 'source', value: book.source });
    if (book.status) entries.push({ key: 'status', value: book.status });
    if (book.tab) entries.push({ key: 'tab', value: book.tab });
    if (book.category) entries.push({ key: 'category', value: book.category });
    if (book.tags) entries.push({ key: 'tags', value: book.tags });
    if (book.score) entries.push({ key: 'score', value: book.score });
    return entries;
  };

  const getStatusBadgeVariant = (status: string): 'success' | 'warning' | 'secondary' | 'default' => {
    const s = status.trim();
    if (/已完结|完结|完成/i.test(s)) return 'success';
    if (/连载|更新中/i.test(s)) return 'warning';
    if (/已出版|出版/i.test(s)) return 'secondary';
    return 'default';
  };

  // 使用刷新后的数据
  const currentBook = () => bookData();

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
      <div class="space-y-0.5">
        {/* 作者（宽屏左栏已显示时隐藏） */}
        <Show when={!dlProps.hideAuthor && currentBook().author}>
          <InfoRow icon={AuthorIcon} label="作者：">{currentBook().author}</InfoRow>
        </Show>
        {/* 来源 */}
        <Show when={currentBook().source || currentBook().originName}>
          <InfoRow icon={OriginIcon} label="来源：">
            {currentBook().source || currentBook().originName}
            <Show when={currentBook().source && currentBook().originName && currentBook().source !== currentBook().originName}>
              <span class="text-muted-foreground/60 ml-1">({currentBook().originName})</span>
            </Show>
          </InfoRow>
        </Show>
        {/* 最新章节 — 使用 isMeaningful 过滤 " • " 等无效值 */}
        <Show when={isMeaningful(currentBook().latestChapterTitle)}>
          <InfoRow icon={ChapterIcon} label="最新：">
            {currentBook().latestChapterTitle}
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
        {/* 目录链接 */}
        <Show when={currentBook().tocUrl && /^https?:\/\//.test(currentBook().tocUrl)}>
          <InfoRow icon={TocIcon} label="目录：">
            <a
              href={currentBook().tocUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary hover:underline truncate"
              onClick={(e) => {
                e.preventDefault();
                window.open(currentBook().tocUrl, '_blank');
              }}
            >
              查看目录
            </a>
          </InfoRow>
        </Show>
      </div>
    );
  }

  /* ── 简介区块 ── */
  /* 默认完整显示，窄屏模式下才提供收起功能（因为窄屏空间有限） */
  function IntroSection(introProps: { collapsible?: boolean }) {
    return (
      <Show when={currentBook().intro}>
        <div class="mt-3">
          <div class="flex items-center justify-between mb-1.5">
            <h3 class="text-sm font-medium text-foreground">简介</h3>
            {/* 仅在可折叠模式（窄屏）且内容较长时显示展开/收起 */}
            <Show when={introProps.collapsible && currentBook().intro && currentBook().intro!.length > 150}>
              <button
                onClick={() => setIntroExpanded(!introExpanded())}
                class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>{introExpanded() ? '收起' : '展开全部'}</span>
                <ChevronDownIcon class={cn('h-3 w-3 transition-transform duration-200', introExpanded() && 'rotate-180')} />
              </button>
            </Show>
          </div>
          <p
            class={cn(
              'whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground',
              introProps.collapsible && !introExpanded() && currentBook().intro && currentBook().intro!.length > 150 && 'line-clamp-6',
            )}
          >
            {currentBook().intro}
          </p>
        </div>
      </Show>
    );
  }

  /* ── 底部操作栏 ── */
  function ActionBar() {
    return (
      <div class="shrink-0 border-t border-border/40 bg-background md:bg-background">
        <div class="flex h-[50px] items-center gap-2 px-4 safe-area-inset-bottom">
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
            开始阅读
          </Button>
        </div>
      </div>
    );
  }

  // 根据主题计算模糊背景的样式
  const blurBgStyle = () => {
    const coverUrl = currentBook().coverUrl;
    if (!coverUrl) return {};
    if (isDark()) {
      // 深色主题：更暗的模糊背景
      return {
        'background-image': `url(${coverUrl})`,
        filter: 'blur(40px) brightness(0.35)',
        transform: 'scale(1.1)',
      };
    } else {
      // 浅色主题：更亮的模糊背景
      return {
        'background-image': `url(${coverUrl})`,
        filter: 'blur(40px) brightness(0.7) saturate(1.1)',
        transform: 'scale(1.1)',
      };
    }
  };

  // 根据主题计算遮罩层样式
  const overlayStyle = () => {
    if (isDark()) {
      return 'bg-black/50';
    } else {
      return 'bg-white/60';
    }
  };

  // 根据主题计算模糊背景上的文字颜色
  const textOnBlur = () => {
    return isDark() ? 'text-white' : 'text-foreground';
  };

  return (
    <div class="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background">
      {/* ── 窄屏：全屏模糊背景（受主题影响） ── */}
      <Show when={props.book.coverUrl && !coverError()}>
        <div class="absolute inset-0 md:hidden">
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
        <div class="flex-1 overflow-hidden flex flex-col md:hidden">
          {/* ── 统一页面头部（透明背景，文字颜色受主题影响） ── */}
          <PageHeader
            onBack={props.onBack}
            title="书籍信息"
            draggable={true}
            showThemeToggle={true}
            showWindowControls={true}
            class={cn(
              'bg-transparent border-transparent border-b-0 transition-colors',
              // 保持原有的主题颜色逻辑（透明背景上的文字颜色）
              textOnBlur(),
            )}
          />

          <div class="flex-1 overflow-y-auto overscroll-contain">
            {/* 窄屏滚动内容：用 flex + min-h-full 保证至少占满视口，底部用填充块延伸白底到 ActionBar 消除缝隙 */}
            <div class="flex min-h-full flex-col">
            {/* 封面区域：白色卡片从封面中部开始，封面下半部分覆盖在白色背景上 */}
            <div class="relative shrink-0">
              {/* 白色卡片背景 — 从封面垂直中点开始，圆角过渡 */}
              {/* top = pt(8px) + 封面高度一半(80px) = 88px */}
              <div class="absolute inset-x-0 bottom-0 top-[88px] rounded-t-[128px] bg-background pointer-events-none" />
              {/* 封面 — z-10 使其浮于白色卡片之上 */}
              <div class="relative z-10 flex justify-center pt-2 pb-5">
                <CoverImage
                  coverUrl={currentBook().coverUrl}
                  name={currentBook().name}
                  coverError={coverError()}
                  onCoverError={() => setCoverError(true)}
                  onClick={() => setShowCoverDialog(true)}
                  class="h-[160px] w-[110px]"
                />
              </div>
            </div>

            {/* 信息区域 — 与上方白色卡片无缝衔接 */}
            <div class="shrink-0 bg-background px-4 pb-4" style={{ 'min-height': 'calc(100vh - 320px)' }}>
              <div class="pb-4">
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
                    <IntroSection collapsible />
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
            </div>
            {/* 底部填充块：延伸白底到 ActionBar，消除缝隙 */}
            <div class="min-h-8 flex-1 bg-background safe-area-min-height-bottom" aria-hidden="true" />
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
        <div class="hidden md:flex flex-1 flex-col overflow-hidden">
          {/* ── 顶部导航栏（主题色背景） ── */}
          <PageHeader
            onBack={props.onBack}
            title="书籍信息"
            draggable={true}
            showThemeToggle={true}
            showWindowControls={true}
            class="shrink-0"
          />

          {/* ── 下方内容区域：左右分栏 ── */}
          <div class="flex min-h-0 flex-1 overflow-hidden">
            {/* ── 左栏：封面区域（仅此区域有模糊背景，不参与滚动） ── */}
            <div class="relative flex min-h-0 w-[340px] shrink-0 flex-col overflow-hidden">
              {/* 宽屏：仅封面区域的模糊背景 */}
              <Show when={props.book.coverUrl && !coverError()}>
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
                <CoverImage
                  coverUrl={currentBook().coverUrl}
                  name={currentBook().name}
                  coverError={coverError()}
                  onCoverError={() => setCoverError(true)}
                  onClick={() => setShowCoverDialog(true)}
                  class="h-[200px] w-[130px] lg:h-[240px] lg:w-[156px] mb-5"
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
            <div class="flex min-h-0 flex-1 flex-col bg-background overflow-hidden">
              {/* 白色背景从顶部开始，仅此区域可滚动 */}
              <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
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
                      <DetailInfoList hideAuthor />
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

      {/* ── 封面大图对话框 ── */}
      <Show when={showCoverDialog() && currentBook().coverUrl && !coverError()}>
        <div
          class="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowCoverDialog(false)}
        >
          <div class="relative max-w-lg max-h-[80vh] rounded-lg overflow-hidden shadow-2xl">
            <img src={currentBook().coverUrl} alt={currentBook().name} class="max-w-full max-h-[80vh] object-contain" />
            <button
              onClick={() => setShowCoverDialog(false)}
              class="absolute top-2 right-2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
              aria-label="关闭"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
