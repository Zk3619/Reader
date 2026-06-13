import {
  createSignal,
  Show,
  createEffect,
  createMemo,
  onCleanup,
  onMount,
  type Accessor,
} from 'solid-js';
import { viewerStore } from '@/stores/viewer';
import { flowImageRefs } from '@/lib/media/image/flow-images';
import { logContentImageDiagnostics } from '@/lib/book-source/content-image-debug';
import type { ReaderInlineImageRef } from '@/lib/media/text/reader-content-blocks';
import { getSource } from '@/lib/database/sources';
import type { BookSource } from '@/types';
import {
  MediaViewerShell,
  MediaViewerShellMain,
  MediaViewerHeader,
  MediaViewerFooter,
} from '@/components/viewer/MediaViewerShell';
import { MediaViewerChromeSlots } from '@/components/viewer/MediaViewerChromeSlots';
import { useMediaViewerMainStageClass } from '@/lib/viewer/viewer-chrome-layout';
import { isMobile } from '@/lib/platform/detect';
import { cn } from '@/lib/utils';
import { MediaViewerCatalogDrawer } from '@/components/viewer/MediaViewerCatalogDrawer';
import { MediaViewerToolbarHeader } from '@/components/viewer/MediaViewerToolbarHeader';
import { MediaViewerProgressBottomChrome } from '@/components/viewer/MediaViewerProgressBottomChrome';
import {
  ViewerAppDrawer,
  ViewerAppDrawerBody,
  ViewerAppDrawerContent,
  ViewerAppDrawerHeader,
} from '@/components/viewer/viewer-app-overlay';
import { Button } from '@/components/ui/button';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';
import { showAppToast } from '@/components/shared/AppToasts';
import { ImageViewerOfflineCacheDialog } from '@/components/viewer/image-viewer/ImageViewerOfflineCacheDialog';
import { getOfflineCacheBlockedReason } from '@/lib/chapter-cache/offline-cache-actions';
import {
  ImageScrollViewport,
  type ImageScrollNavApi,
  type MangaPageItem,
} from '@/components/viewer/image-viewer/ImageScrollViewport';
import { ImagePagedViewport } from '@/components/viewer/image-viewer/ImagePagedViewport';
import { ImageViewerSettings } from '@/components/viewer/image-viewer/ImageViewerSettings';
import type { ReaderPagedNavApi } from '@/components/viewer/text-viewer/reader-paged-nav';
import {
  defaultImageViewerUiConfig,
  type ImageViewerUiConfig,
} from '@/lib/media/image/image-viewer-ui-config';
import { loadImageViewerUiConfig } from '@/lib/media/image/image-viewer-config-storage';
import { scheduleMangaImagePrefetch } from '@/lib/media/image/image-prefetch';
import { trimMangaImagesOutsideChapters } from '@/lib/media/image/image-disk-cache';
import { mangaImageRetainChapterWindow } from '@/lib/media/image/image-retain';
import { MediaViewerChromeLayoutProvider } from '@/components/viewer/MediaViewerChromeLayoutProvider';
import { useMediaViewerShell } from '@/components/viewer/media-viewer-shell-context';

const IMAGE_VIEWER_CONTENT_MAX_REM = 48;
const TAP_MOVE_THRESHOLD = 10;

export interface ImageViewerPageProps {
  onClose: () => void;
  /** 点击顶栏书名时进入书籍信息页 */
  onOpenBookInfo?: () => void;
  entryVisible?: Accessor<boolean>;
}

function ImageViewerChromeBridge(props: { onReady: (toggleBars: () => void) => void }) {
  const shell = useMediaViewerShell();
  onMount(() => props.onReady(() => shell.toggleBars()));
  return null;
}

export function ImageViewerPage(props: ImageViewerPageProps) {
  const [catalogOpen, setCatalogOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [offlineCacheDialogOpen, setOfflineCacheDialogOpen] = createSignal(false);
  const [uiConfig, setUiConfig] = createSignal<ImageViewerUiConfig>(defaultImageViewerUiConfig);
  const [configLoaded, setConfigLoaded] = createSignal(false);
  const [catalogScrollTop, setCatalogScrollTop] = createSignal(0);
  const [bookSource, setBookSource] = createSignal<BookSource | null>(null);
  const [batchRetryToken, setBatchRetryToken] = createSignal(0);
  const [viewPage, setViewPage] = createSignal(1);

  let toggleChromeBars: () => void = () => undefined;
  let pagedNav: ReaderPagedNavApi | undefined;
  let scrollNav: ImageScrollNavApi | undefined;

  let tapStartTime = 0;
  let tapStartX = 0;
  let tapStartY = 0;
  let tapMoved = false;

  const mainStageClass = useMediaViewerMainStageClass('bg-black/90');

  const book = () => viewerStore.state.book;
  const catalog = () => viewerStore.state.catalog;
  const catalogSize = () => catalog().length;

  const openOfflineCacheDialog = () => {
    const blocked = getOfflineCacheBlockedReason(
      book(),
      viewerStore.isGuestReading(),
    );
    if (blocked) {
      showAppToast({
        title: '无法离线缓存',
        description: blocked,
        variant: 'default',
      });
      return;
    }
    setOfflineCacheDialogOpen(true);
  };
  const chapterIndex = () => viewerStore.state.chapterIndex;
  const rawContent = () => viewerStore.state.rawContent;
  const mediaUrls = () => viewerStore.state.mediaUrls;

  const imageList = createMemo((): MangaPageItem[] => {
    const idx = chapterIndex();
    const ch = catalog()[idx];
    const refs: ReaderInlineImageRef[] =
      flowImageRefs(rawContent(), ch?.url ?? ch?.baseUrl ?? '');
    const list: ReaderInlineImageRef[] =
      refs.length > 0 ? refs : mediaUrls().map((url) => ({ url }));
    return list.map((ref, i) => ({
      url: ref.url,
      legadoHeaders: ref.legadoHeaders,
      slot: `${idx}:${i}:${ref.url}`,
      page: i + 1,
    }));
  });

  const loading = () => viewerStore.state.loading;
  const bootstrapping = () => viewerStore.isMediaViewerBootstrapping();
  const error = () => viewerStore.state.error;
  const chapterTitle = () => catalog()[chapterIndex()]?.title ?? '';
  const chapterPageReferer = () => {
    const ch = catalog()[chapterIndex()];
    const u = ch?.url ?? ch?.baseUrl ?? book()?.origin;
    return typeof u === 'string' && /^https?:\/\//i.test(u) ? u : undefined;
  };
  const totalPages = () => imageList().length;

  const readingMode = () => uiConfig().readingMode;
  const contentScale = () => uiConfig().contentScale;
  const mangaPreDownloadNum = () => uiConfig().mangaPreDownloadNum;
  const isPagedMode = () => readingMode() === 'paged';

  const chapterPos = () => viewerStore.state.chapterPos;

  const chapterProgressPercent = () => {
    const total = totalPages();
    if (total <= 0) return 0;
    const current = Math.max(1, Math.min(viewPage(), total));
    return Math.round(((current - 1) / Math.max(1, total - 1)) * 100);
  };

  const contentMaxWidthStyle = () => ({
    'max-width': isMobile()
      ? '100%'
      : `${IMAGE_VIEWER_CONTENT_MAX_REM * uiConfig().contentScale}rem`,
  });

  onMount(() => {
    void loadImageViewerUiConfig().then((cfg) => {
      setUiConfig(cfg);
      setConfigLoaded(true);
    });
  });

  createEffect(() => {
    if (import.meta.env.DEV && !loading() && !error() && rawContent()) {
      logContentImageDiagnostics(rawContent(), 'image-viewer.rawContent', 5);
    }
  });

  createEffect(() => {
    const origin = book()?.origin;
    if (!origin || origin === 'local') {
      setBookSource(null);
      return;
    }
    let cancelled = false;
    void getSource(origin).then((s) => {
      if (!cancelled) setBookSource(s ?? null);
    });
    return () => {
      cancelled = true;
    };
  });

  createEffect(() => {
    const b = book();
    const chIdx = chapterIndex();
    if (!b) return;
    void mangaImageRetainChapterWindow(chIdx).then(({ min, max }) => {
      void trimMangaImagesOutsideChapters(b.bookUrl, min, max);
    });
  });

  createEffect(() => {
    const b = book();
    const cat = catalog();
    const chIdx = chapterIndex();
    const list = imageList();
    const page = viewPage();
    const mode = readingMode();
    if (!b || loading() || error() || list.length === 0) return;

    scheduleMangaImagePrefetch({
      book: b,
      catalog: cat,
      chapterIndex: chIdx,
      items: list,
      currentPageIndex: Math.max(0, page - 1),
      readingMode: mode,
      mangaPreDownloadNum: mangaPreDownloadNum(),
      mangaPagedPreDownloadNum: uiConfig().mangaPagedPreDownloadNum,
      persistToDisk: uiConfig().mangaDiskCacheWhileReading,
      referer: chapterPageReferer(),
      source: bookSource(),
    });
  });

  const goChapter = async (delta: number) => {
    const next = chapterIndex() + delta;
    if (next < 0 || next >= catalog().length) return;
    if (!viewerStore.isOpen()) {
      showAppToast({ title: '未打开书籍', description: '请从书架重新打开本书' });
      return;
    }
    await viewerStore.loadChapter(next);
  };

  const handlePrevChapter = () => void goChapter(-1);
  const handleNextChapter = () => void goChapter(1);

  const goNextPage = () => {
    if (isPagedMode() && pagedNav) {
      pagedNav.goNextPage();
      return;
    }
    void handleNextChapter();
  };

  const goPrevPage = () => {
    if (isPagedMode() && pagedNav) {
      pagedNav.goPrevPage();
      return;
    }
    void handlePrevChapter();
  };

  const handleChapterProgressChange = (values: number[]) => {
    const p = Math.max(0, Math.min(1, values[0] ?? 0));
    viewerStore.setChapterPos(p);
    if (isPagedMode() && pagedNav) {
      pagedNav.setPageProgress(p);
      return;
    }
    scrollNav?.scrollToProgress(p);
  };

  const refreshChapter = () => {
    if (!viewerStore.isOpen()) {
      showAppToast({ title: '未打开书籍', description: '请从书架重新打开本书' });
      return;
    }
    void viewerStore.refreshChapter().catch((e) => {
      console.error('[image-viewer] 刷新本章失败', e);
    });
  };

  const onContentPointerDown = (e: MouseEvent | TouchEvent) => {
    const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const y = 'touches' in e ? e.touches[0].clientY : e.clientY;
    if ('button' in e && e.button !== 0) return;
    tapStartTime = Date.now();
    tapStartX = x;
    tapStartY = y;
    tapMoved = false;
  };

  const onContentPointerMove = (e: MouseEvent | TouchEvent) => {
    const x = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
    const y = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
    if (
      tapStartTime &&
      (Math.abs(x - tapStartX) > TAP_MOVE_THRESHOLD ||
        Math.abs(y - tapStartY) > TAP_MOVE_THRESHOLD)
    ) {
      tapMoved = true;
    }
  };

  const contentPrimaryAction = (e: MouseEvent) => {
    if (tapMoved) {
      tapStartTime = 0;
      return;
    }
    const target =
      (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(
        '.reader-paged-viewport',
      ) ?? (e.currentTarget as HTMLElement | null);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / Math.max(rect.width, 1);

    if (isPagedMode()) {
      if (xRatio < 1 / 3) goPrevPage();
      else if (xRatio > 2 / 3) goNextPage();
      else toggleChromeBars();
    } else {
      toggleChromeBars();
    }
    tapStartTime = 0;
  };

  onMount(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCatalogOpen(false);
        setSettingsOpen(false);
        if (!catalogOpen() && !settingsOpen()) toggleChromeBars();
      }
      if (e.key === 'ArrowLeft') goPrevPage();
      if (e.key === 'ArrowRight') goNextPage();
    };
    window.addEventListener('keydown', handleKey);
    onCleanup(() => window.removeEventListener('keydown', handleKey));
  });

  /** 滚动模式：外层不滚动，由 ImageScrollViewport 承担 overflow */
  const mainContentClass = () => {
    if (isPagedMode()) return mainStageClass();
    return cn(
      mainStageClass(),
      'overflow-hidden',
    );
  };

  return (
    <>
      <MediaViewerChromeLayoutProvider
        layout={() => uiConfig().viewerChromeLayout}
      >
      <MediaViewerShell
        entryVisible={props.entryVisible}
        tapToToggleBars={false}
        chromePointerInput
        contentPrimaryAction={contentPrimaryAction}
      >
        <ImageViewerChromeBridge
          onReady={(toggle) => {
            toggleChromeBars = toggle;
          }}
        />
        <MediaViewerShellMain>
          <MediaViewerChromeSlots
            header={
              <MediaViewerHeader>
                <MediaViewerToolbarHeader
                  title={book()?.name ?? ''}
                  subtitle={chapterTitle()}
                  onClose={props.onClose}
                  onOpenBookInfo={props.onOpenBookInfo}
                  onOpenCatalog={() => setCatalogOpen(true)}
                  onOpenOfflineCache={openOfflineCacheDialog}
                  onOpenImageSettings={() => setSettingsOpen(true)}
                  onRefresh={refreshChapter}
                  onRetryFailedImages={() => setBatchRetryToken((t) => t + 1)}
                  loading={loading()}
                />
              </MediaViewerHeader>
            }
            footer={
              <MediaViewerFooter>
                <MediaViewerProgressBottomChrome
                  chapterIndex={chapterIndex()}
                  catalogLength={catalog().length}
                  loading={loading()}
                  chapterTitle={chapterTitle()}
                  statusMeta={
                    <Show when={totalPages() > 0}>
                      <span>
                        {viewPage()} / {totalPages()} 页
                      </span>
                    </Show>
                  }
                  chapterProgressPercent={chapterProgressPercent()}
                  progressValue={chapterPos()}
                  onProgressChange={handleChapterProgressChange}
                  showProgressSlider={totalPages() > 1}
                  onPrev={handlePrevChapter}
                  onNext={handleNextChapter}
                />
              </MediaViewerFooter>
            }
          >
            <div
              class={mainContentClass()}
              onPointerDown={onContentPointerDown}
              onPointerMove={onContentPointerMove}
            >
              <Show when={bootstrapping() || loading()}>
                <div class="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
                  加载中…
                </div>
              </Show>
              <Show when={!bootstrapping() && !loading() && error()}>
                <div class="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center">
                  <p class="text-sm whitespace-pre-wrap text-destructive">{error()}</p>
                  <Button size="sm" variant="outline" onClick={refreshChapter}>
                    重试
                  </Button>
                </div>
              </Show>
              <Show when={!bootstrapping() && !loading() && !error() && configLoaded()}>
                <Show
                  when={imageList().length > 0}
                  fallback={
                    <div class="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center">
                      <p class="text-sm text-muted-foreground">本章暂无图片，请尝试刷新章节</p>
                      <Button size="sm" variant="outline" onClick={refreshChapter}>
                        刷新本章
                      </Button>
                    </div>
                  }
                >
                  <Show
                    when={isPagedMode()}
                    fallback={
                      <ImageScrollViewport
                        class="h-full min-h-full"
                        imageList={imageList}
                        contentMaxWidthStyle={contentMaxWidthStyle}
                        chapterPageReferer={chapterPageReferer}
                        bookSource={bookSource}
                        batchRetryToken={batchRetryToken}
                        mangaPreDownloadNum={mangaPreDownloadNum}
                        mangaEstimatedPageHeightPx={() =>
                          uiConfig().mangaEstimatedPageHeightPx
                        }
                        mangaDiskCacheWhileReading={() =>
                          uiConfig().mangaDiskCacheWhileReading
                        }
                        onViewPageChange={setViewPage}
                        onRegisterNav={(api) => {
                          scrollNav = api;
                        }}
                      />
                    }
                  >
                    <ImagePagedViewport
                      class="h-full min-h-full"
                      contentScale={contentScale}
                      imageList={imageList}
                      chapterPageReferer={chapterPageReferer}
                      bookSource={bookSource}
                      batchRetryToken={batchRetryToken}
                      mangaDiskCacheWhileReading={() =>
                        uiConfig().mangaDiskCacheWhileReading
                      }
                      onRequestPrevChapter={handlePrevChapter}
                      onRequestNextChapter={handleNextChapter}
                      onViewPageChange={setViewPage}
                      onRegisterNav={(api) => {
                        pagedNav = api;
                      }}
                    />
                  </Show>
                </Show>
              </Show>
            </div>
          </MediaViewerChromeSlots>
        </MediaViewerShellMain>
      </MediaViewerShell>
      </MediaViewerChromeLayoutProvider>

      <MediaViewerCatalogDrawer
        open={catalogOpen()}
        onOpenChange={setCatalogOpen}
        loading={bootstrapping()}
        initialScrollTop={catalogScrollTop()}
        onScrollTop={setCatalogScrollTop}
        onSelectChapter={(index) => {
          setCatalogOpen(false);
          void viewerStore.loadChapter(index);
        }}
      />

      <ImageViewerOfflineCacheDialog
        open={offlineCacheDialogOpen()}
        onOpenChange={setOfflineCacheDialogOpen}
        book={book() ?? null}
        chapterIndex={chapterIndex()}
        catalogSize={catalogSize()}
      />

      <ViewerAppDrawer
        open={settingsOpen()}
        onOpenChange={setSettingsOpen}
        snapPoints={[0, 1]}
        defaultSnapPoint={1}
      >
        <ViewerAppDrawerContent
          class={cn('flex flex-col', hDrawerPanel, 'max-h-[75dvh]')}
          showNativeDragHandle={false}
        >
          <ViewerAppDrawerHeader title="界面设置" />
          <ViewerAppDrawerBody class="mb-4 overflow-y-auto scroll-gutter-stable-both px-4 pb-2 pt-1">
            <ImageViewerSettings
              config={uiConfig}
              onChange={(patch) => setUiConfig((prev) => ({ ...prev, ...patch }))}
              onClose={() => setSettingsOpen(false)}
            />
          </ViewerAppDrawerBody>
        </ViewerAppDrawerContent>
      </ViewerAppDrawer>
    </>
  );
}
