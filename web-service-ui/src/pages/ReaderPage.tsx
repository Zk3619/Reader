import { createEffect, createResource, createSignal, For, Show, onCleanup, onMount } from 'solid-js';
import { ErrorBox, Loading } from '@/components/Layout';
import { ChapterContent } from '@/components/ChapterContent';
import { PopCatalog } from '@/components/PopCatalog';
import { ReadSettingsPanel } from '@/components/ReadSettingsPanel';
import {
  getBookContent,
  getChapterList,
  getReadConfig,
  deleteBook,
  refreshToc,
  saveBookProgress,
  saveReadConfig,
  type ReaderUiConfig,
} from '@/lib/api';
import { parseReaderRoute, buildReaderHref } from '@/lib/reader-route';
import { saveRecentReading } from '@/lib/recent-reading';
import { showToast } from '@/lib/toast';
import {
  fontFamilyAt,
  lineHeightFromSpacing,
  resolveThemeIndex,
  themePresetAt,
} from '@/lib/reader-theme-config';
import { applyShellThemeFromReadConfig } from '@/lib/reader-shell-theme';
import { formatResourceError, resourceError } from '@/lib/resource';
import { useMediaQuery } from '@/lib/use-media-query';

function parseReaderRouteLocal() {
  return parseReaderRoute();
}

interface LoadedChapter {
  index: number;
  title: string;
  content: string;
  loading?: boolean;
  error?: string;
}

function ReaderToolBtn(props: {
  icon: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      class="reader-tool-btn"
      disabled={props.disabled}
      onClick={(e) => {
        e.stopPropagation();
        props.onClick?.();
      }}
    >
      <span class="icon">{props.icon}</span>
      <span>{props.label}</span>
    </button>
  );
}

function ReaderMobileBtn(props: {
  icon: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      class="reader-mobile-btn"
      disabled={props.disabled}
      onClick={(e) => {
        e.stopPropagation();
        props.onClick?.();
      }}
    >
      <span class="icon">{props.icon}</span>
      <span>{props.label}</span>
    </button>
  );
}

export function ReaderPage() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const route = parseReaderRouteLocal();
  const [chapterIndex, setChapterIndex] = createSignal(route.index);
  const [showToolBar, setShowToolBar] = createSignal(true);
  const [popCataOpen, setPopCataOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);
  const [loadedChapters, setLoadedChapters] = createSignal<LoadedChapter[]>([]);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [uiConfig, setUiConfig] = createSignal<ReaderUiConfig>({
    fontSize: 18,
    lineHeight: 1.8,
    readWidth: 720,
    theme: 0,
    font: 0,
    infiniteLoading: false,
    jumpDuration: 1000,
    spacing: { paragraph: 1, line: 0.8, letter: 0 },
  });

  const [chapters, { refetch: refetchToc }] = createResource(
    () => route.bookUrl,
    (url) => (url ? getChapterList(url) : Promise.reject(new Error('缺少 bookUrl'))),
  );

  const theme = () => themePresetAt(resolveThemeIndex(uiConfig()));
  const infiniteMode = () => Boolean(uiConfig().infiniteLoading);
  const contentTypography = () => ({
    spacing: uiConfig().spacing,
    lineHeight: lineHeightFromSpacing(uiConfig().spacing, uiConfig().lineHeight ?? 1.8),
  });

  const [chapterPos, setChapterPos] = createSignal(route.pos);
  let scrollSaveTimer: ReturnType<typeof setTimeout> | undefined;
  let loadMoreObserver: IntersectionObserver | undefined;
  let sentinelEl: HTMLDivElement | undefined;

  const persistProgress = (index: number, pos?: number) => {
    const list = chapters();
    const ch = list?.[index];
    if (!ch || !route.name) return;
    const progress = {
      name: route.name,
      author: route.author,
      durChapterIndex: index,
      durChapterPos: pos ?? chapterPos(),
      durChapterTitle: ch.title,
      durChapterTime: Date.now(),
    };
    void saveBookProgress(progress);
    saveRecentReading(
      { name: route.name, author: route.author, bookUrl: route.bookUrl, durChapterIndex: index, durChapterTitle: ch.title, durChapterPos: pos ?? chapterPos() },
      index,
      ch.title,
      pos ?? chapterPos(),
    );
  };

  async function fetchChapterContent(index: number): Promise<LoadedChapter> {
    const list = chapters();
    const ch = list?.[index];
    const title = ch?.title ?? `第 ${index + 1} 章`;
    try {
      const content = await getBookContent(route.bookUrl, index);
      return { index, title, content };
    } catch (e) {
      return { index, title, content: '', error: e instanceof Error ? e.message : String(e) };
    }
  }

  async function resetInfiniteFrom(index: number) {
    const first = { index, title: chapters()?.[index]?.title ?? '', content: '', loading: true };
    setLoadedChapters([first]);
    const loaded = await fetchChapterContent(index);
    setLoadedChapters([loaded]);
    setChapterIndex(index);
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  }

  async function appendNextChapter() {
    if (loadingMore()) return;
    const list = chapters();
    if (!list?.length) return;
    const current = loadedChapters();
    const lastIndex = current[current.length - 1]?.index ?? chapterIndex();
    const nextIndex = lastIndex + 1;
    if (nextIndex >= list.length) return;
    if (current.some((c) => c.index === nextIndex)) return;

    persistProgress(lastIndex, chapterPos());
    setLoadingMore(true);
    setLoadedChapters((prev) => [
      ...prev,
      { index: nextIndex, title: list[nextIndex]?.title ?? '', content: '', loading: true },
    ]);
    const loaded = await fetchChapterContent(nextIndex);
    setLoadedChapters((prev) => {
      const withoutPlaceholder = prev.filter((c) => !(c.index === nextIndex && c.loading));
      return [...withoutPlaceholder, loaded];
    });
    setLoadingMore(false);
  }

  const scrollBehavior = () => {
    const ms = uiConfig().jumpDuration ?? 1000;
    return ms > 0 ? 'smooth' : 'auto';
  };

  const goChapter = (index: number) => {
    const max = (chapters()?.length ?? 1) - 1;
    if (index < 0 || index > max) return;
    const prev = infiniteMode() ? (loadedChapters()[0]?.index ?? chapterIndex()) : chapterIndex();
    if (index < prev) showToast('上一章');
    else if (index > prev) showToast('下一章');
    setChapterPos(0);
    setPopCataOpen(false);
    const url = new URL(window.location.href);
    url.hash = buildReaderHref({
      bookUrl: route.bookUrl,
      name: route.name,
      author: route.author,
      index,
      pos: 0,
      searchBook: route.fromSearch,
    });
    history.replaceState(null, '', url.toString());

    if (infiniteMode()) {
      void resetInfiniteFrom(index);
    } else {
      setChapterIndex(index);
      window.scrollTo({ top: 0, behavior: scrollBehavior() });
    }
  };

  const [content] = createResource(
    () => (infiniteMode() ? null : { url: route.bookUrl, index: chapterIndex() }),
    (params) => (params ? getBookContent(params.url, params.index) : Promise.resolve('')),
  );

  createEffect(() => {
    if (!infiniteMode()) return;
    const idx = chapterIndex();
    const list = chapters();
    if (!list?.length || !route.bookUrl) return;
    if (loadedChapters().length === 0 || loadedChapters()[0]?.index !== idx) {
      void resetInfiniteFrom(idx);
    }
  });

  createEffect(() => {
    const list = chapters();
    const idx = infiniteMode() ? (loadedChapters()[0]?.index ?? chapterIndex()) : chapterIndex();
    const ch = list?.[idx];
    if (!ch || !route.name) return;
    document.title = route.name ? `${route.name} | ${ch.title}` : '阅读';
  });

  onMount(async () => {
    if (route.fromSearch) {
      sessionStorage.setItem('reader_search_book_pending', route.bookUrl);
    }
    try {
      const cfg = await getReadConfig();
      setUiConfig((prev) => ({ ...prev, ...cfg }));
      applyShellThemeFromReadConfig(cfg);
    } catch {
      /* defaults */
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (popCataOpen() || settingsOpen()) {
        if (e.key === 'Escape') {
          setPopCataOpen(false);
          setSettingsOpen(false);
        }
        return;
      }
      const idx = infiniteMode() ? (loadedChapters()[0]?.index ?? chapterIndex()) : chapterIndex();
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goChapter(idx - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        goChapter(idx + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        window.scrollBy({ top: -window.innerHeight * 0.8, behavior: scrollBehavior() });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        window.scrollBy({ top: window.innerHeight * 0.8, behavior: scrollBehavior() });
      } else if (e.key === 'Escape') {
        setShowToolBar(true);
      }
    };
    window.addEventListener('keydown', onKey);

    const onScroll = () => {
      clearTimeout(scrollSaveTimer);
      const progressIdx = infiniteMode()
        ? (loadedChapters()[0]?.index ?? chapterIndex())
        : chapterIndex();
      scrollSaveTimer = setTimeout(() => {
        persistProgress(progressIdx, chapterPos());
        saveRecentReading(
          { name: route.name, author: route.author, bookUrl: route.bookUrl, durChapterIndex: progressIdx },
          progressIdx,
          chapters()?.[progressIdx]?.title,
          chapterPos(),
        );
      }, 1500);
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        const progressIdx = infiniteMode()
          ? (loadedChapters()[0]?.index ?? chapterIndex())
          : chapterIndex();
        persistProgress(progressIdx, chapterPos());
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    onCleanup(() => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(scrollSaveTimer);
      loadMoreObserver?.disconnect();
      if (
        route.fromSearch &&
        sessionStorage.getItem('reader_search_book_pending') === route.bookUrl
      ) {
        sessionStorage.removeItem('reader_search_book_pending');
        if (confirm('是否将本书保留在书架？')) {
          sessionStorage.setItem('reader_search_book_keep', '1');
        } else {
          void deleteBook({ name: route.name, author: route.author, bookUrl: route.bookUrl });
        }
      }
    });
  });

  createEffect(() => {
    if (!infiniteMode()) {
      loadMoreObserver?.disconnect();
      return;
    }
    loadMoreObserver?.disconnect();
    if (!sentinelEl) return;
    loadMoreObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void appendNextChapter();
      },
      { rootMargin: '-100% 0% 20% 0px' },
    );
    loadMoreObserver.observe(sentinelEl);
  });

  async function handleRefreshToc() {
    setRefreshing(true);
    try {
      await refreshToc(route.bookUrl);
      refetchToc();
    } finally {
      setRefreshing(false);
    }
  }

  async function applySettings(patch: Partial<ReaderUiConfig>) {
    const next = { ...uiConfig(), ...patch };
    setUiConfig(next);
    applyShellThemeFromReadConfig(next);
    try {
      await saveReadConfig(next);
    } catch {
      /* ignore */
    }
  }

  const articleBg = () => theme().contentTexture ?? theme().contentBg;

  const closePopovers = () => {
    setPopCataOpen(false);
    setSettingsOpen(false);
  };

  const activeIndex = () =>
    infiniteMode() ? (loadedChapters()[0]?.index ?? chapterIndex()) : chapterIndex();

  const pageThemeStyle = () => ({
    background: theme().bodyTexture ?? theme().bodyBg,
    color: theme().fg,
  });

  return (
    <div
      class="reader-page"
      style={pageThemeStyle()}
      onClick={() => {
        closePopovers();
        setShowToolBar((v) => !v);
      }}
    >
      <Show when={showToolBar()}>
        <aside class="reader-tool-bar" onClick={(e: MouseEvent) => e.stopPropagation()}>
          <ReaderToolBtn
            icon="☰"
            label="目录"
            onClick={() => {
              setSettingsOpen(false);
              setPopCataOpen((v) => !v);
            }}
          />
          <ReaderToolBtn
            icon="⚙"
            label="设置"
            onClick={() => {
              setPopCataOpen(false);
              setSettingsOpen((v) => !v);
            }}
          />
          <ReaderToolBtn icon="📚" label="书架" onClick={() => { window.location.hash = '#/bookshelf'; }} />
          <ReaderToolBtn icon="↑" label="顶部" onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior() })} />
          <ReaderToolBtn
            icon="↓"
            label="底部"
            onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: scrollBehavior() })}
          />
        </aside>

        <aside class="reader-read-bar" onClick={(e: MouseEvent) => e.stopPropagation()}>
          <ReaderToolBtn
            icon="‹"
            label="上一章"
            disabled={activeIndex() <= 0}
            onClick={() => goChapter(activeIndex() - 1)}
          />
          <ReaderToolBtn
            icon="›"
            label="下一章"
            disabled={activeIndex() >= (chapters()?.length ?? 1) - 1}
            onClick={() => goChapter(activeIndex() + 1)}
          />
        </aside>
      </Show>

      <Show when={showToolBar() && isMobile()}>
        <nav class="reader-mobile-bar" onClick={(e: MouseEvent) => e.stopPropagation()}>
          <ReaderMobileBtn
            icon="☰"
            label="目录"
            onClick={() => {
              setSettingsOpen(false);
              setPopCataOpen((v) => !v);
            }}
          />
          <ReaderMobileBtn
            icon="‹"
            label="上章"
            disabled={activeIndex() <= 0}
            onClick={() => goChapter(activeIndex() - 1)}
          />
          <ReaderMobileBtn
            icon="›"
            label="下章"
            disabled={activeIndex() >= (chapters()?.length ?? 1) - 1}
            onClick={() => goChapter(activeIndex() + 1)}
          />
          <ReaderMobileBtn
            icon="⚙"
            label="设置"
            onClick={() => {
              setPopCataOpen(false);
              setSettingsOpen((v) => !v);
            }}
          />
          <ReaderMobileBtn icon="📚" label="书架" onClick={() => { window.location.hash = '#/bookshelf'; }} />
        </nav>
      </Show>

      <Show when={popCataOpen()}>
        <PopCatalog
          chapters={chapters() ?? []}
          currentIndex={activeIndex()}
          open={popCataOpen()}
          themeFg={theme().fg}
          refreshing={refreshing()}
          onRefresh={() => void handleRefreshToc()}
          onSelect={(index) => goChapter(index)}
        />
      </Show>

      <Show when={settingsOpen()}>
        <div class="reader-popover reader-settings-popover" style={{ color: theme().fg }} onClick={(e: MouseEvent) => e.stopPropagation()}>
          <p class="mb-3 text-sm font-medium">阅读设置</p>
          <ReadSettingsPanel config={uiConfig()} onChange={(patch) => void applySettings(patch)} />
        </div>
      </Show>

      <div class="reader-chapter" onClick={(e: MouseEvent) => e.stopPropagation()}>
        <Show when={resourceError(chapters) || (!infiniteMode() && resourceError(content))}>
          <div class="px-4 pt-4">
            <ErrorBox
              message={formatResourceError(
                resourceError(chapters) ?? resourceError(content),
                '加载失败',
              )}
            />
          </div>
        </Show>

        <div class="pt-8 pb-16" classList={{ 'pb-28!': isMobile() }}>
          <Show
            when={infiniteMode()}
            fallback={
              <>
                <Show when={!content.loading} fallback={<Loading />}>
                  <div style={{ background: articleBg() }}>
                    <ChapterContent
                      raw={content() ?? ''}
                      bookUrl={route.bookUrl}
                      title={chapters()?.[chapterIndex()]?.title}
                      readWidth={uiConfig().readWidth ?? 720}
                      fontSize={uiConfig().fontSize ?? 18}
                      fontFamily={fontFamilyAt(uiConfig().font, String(uiConfig().customFontName ?? ''))}
                      spacing={contentTypography().spacing}
                      lineHeight={contentTypography().lineHeight}
                      restorePos={chapterIndex() === route.index ? route.pos : 0}
                      onReadPos={(pos) => setChapterPos(pos)}
                    />
                  </div>
                </Show>
                <p class="mt-8 text-center text-xs opacity-50">
                  {chapterIndex() + 1} / {chapters()?.length ?? '?'}
                </p>
              </>
            }
          >
            <For each={loadedChapters()}>
              {(ch) => (
                <section class="reader-chapter-block mb-12">
                  <h2 class="mb-4 text-center text-lg font-medium opacity-90">{ch.title}</h2>
                  <Show when={ch.loading} fallback={
                    <Show when={ch.error}>
                      <ErrorBox message={ch.error!} />
                    </Show>
                  }>
                    <Loading />
                  </Show>
                  <Show when={!ch.loading && !ch.error}>
                    <div style={{ background: articleBg() }}>
                      <ChapterContent
                        raw={ch.content}
                        bookUrl={route.bookUrl}
                        title={ch.title}
                        readWidth={uiConfig().readWidth ?? 720}
                        fontSize={uiConfig().fontSize ?? 18}
                        fontFamily={fontFamilyAt(uiConfig().font, String(uiConfig().customFontName ?? ''))}
                        spacing={contentTypography().spacing}
                        lineHeight={contentTypography().lineHeight}
                        onReadPos={(pos) => {
                          if (ch.index === (loadedChapters()[0]?.index ?? chapterIndex())) {
                            setChapterPos(pos);
                          }
                        }}
                      />
                    </div>
                  </Show>
                </section>
              )}
            </For>
            <div ref={(el) => { sentinelEl = el; }} class="h-4" />
            <Show when={loadingMore()}>
              <p class="text-center text-xs opacity-50">加载下一章…</p>
            </Show>
            <p class="mt-4 text-center text-xs opacity-50">
              {loadedChapters()[loadedChapters().length - 1]?.index != null
                ? (loadedChapters()[loadedChapters().length - 1]!.index + 1)
                : activeIndex() + 1}{' '}
              / {chapters()?.length ?? '?'}
            </p>
          </Show>
        </div>
      </div>
    </div>
  );
}
