import { createSignal, Index, Show, createEffect, createMemo, onCleanup, onMount, type Accessor } from 'solid-js';
import { viewerStore } from '@/stores/viewer';
import {
  MANGA_SCROLL_ROOT_ATTR,
  ReaderInlineImg,
} from '@/components/viewer/text-viewer/ReaderInlineImg';
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
import { useMediaViewerMainScrollClass } from '@/lib/viewer/viewer-chrome-layout';
import { cn } from '@/lib/utils';
import { MediaViewerCatalog } from '@/components/viewer/MediaViewerCatalog';
import { MediaViewerToolbarHeader } from '@/components/viewer/MediaViewerToolbarHeader';
import { MediaViewerChapterNavFooter } from '@/components/viewer/MediaViewerChapterNavFooter';
import {
  ViewerAppDrawer,
  ViewerAppDrawerBody,
  ViewerAppDrawerClose,
  ViewerAppDrawerContent,
  ViewerAppDrawerHeader,
} from '@/components/viewer/viewer-app-overlay';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';
import { showAppToast } from '@/components/shared/AppToasts';
import { ZoomIn, ZoomOut } from 'lucide-solid';

const IMAGE_VIEWER_CONTENT_SCALE_KEY = 'reader.imageViewer.contentScale';
const IMAGE_VIEWER_SCALE_MIN = 0.5;
const IMAGE_VIEWER_SCALE_MAX = 2;
const IMAGE_VIEWER_SCALE_STEP = 0.05;
/** 与 Tailwind `max-w-3xl` 一致（48rem） */
const IMAGE_VIEWER_CONTENT_MAX_REM = 48;

function clampImageViewerScale(value: number): number {
  return Math.min(IMAGE_VIEWER_SCALE_MAX, Math.max(IMAGE_VIEWER_SCALE_MIN, value));
}

function loadImageViewerContentScale(): number {
  try {
    const raw = localStorage.getItem(IMAGE_VIEWER_CONTENT_SCALE_KEY);
    if (raw != null) {
      const n = Number(raw);
      if (Number.isFinite(n)) return clampImageViewerScale(n);
    }
  } catch {
    /* ignore */
  }
  return 1;
}

function persistImageViewerContentScale(scale: number): void {
  try {
    localStorage.setItem(IMAGE_VIEWER_CONTENT_SCALE_KEY, String(scale));
  } catch {
    /* ignore */
  }
}

export interface ImageViewerPageProps {
  onClose: () => void;
  /** 导航栈条目是否栈顶可见 */
  entryVisible?: Accessor<boolean>;
}

export function ImageViewerPage(props: ImageViewerPageProps) {
  const [catalogOpen, setCatalogOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [contentScale, setContentScale] = createSignal(loadImageViewerContentScale());
  const [catalogScrollTop, setCatalogScrollTop] = createSignal(0);
  const [bookSource, setBookSource] = createSignal<BookSource | null>(null);
  const [batchRetryToken, setBatchRetryToken] = createSignal(0);
  const [viewPage, setViewPage] = createSignal(1);

  let scrollRootEl: HTMLDivElement | undefined;
  const mainScrollClass = useMediaViewerMainScrollClass('scroll-gutter-stable-both bg-black/90');

  const book = () => viewerStore.state.book;
  const catalog = () => viewerStore.state.catalog;
  const chapterIndex = () => viewerStore.state.chapterIndex;
  const rawContent = () => viewerStore.state.rawContent;
  const mediaUrls = () => viewerStore.state.mediaUrls;
  type MangaPageItem = ReaderInlineImageRef & { slot: string; page: number };
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

  const updateViewPageFromScroll = () => {
    const root = scrollRootEl;
    if (!root) return;
    const slots = root.querySelectorAll('[data-manga-page]');
    if (slots.length === 0) {
      setViewPage(1);
      return;
    }
    const center = root.scrollTop + root.clientHeight / 2;
    let bestPage = 1;
    let bestDist = Number.POSITIVE_INFINITY;
    slots.forEach((el) => {
      const node = el as HTMLElement;
      const page = Number(node.dataset.mangaPage);
      if (!Number.isFinite(page) || page <= 0) return;
      const mid = node.offsetTop + node.offsetHeight / 2;
      const dist = Math.abs(mid - center);
      if (dist < bestDist) {
        bestDist = dist;
        bestPage = page;
      }
    });
    setViewPage(bestPage);
    viewerStore.setChapterPos(bestPage - 1);
  };

  onMount(() => {
    const root = scrollRootEl;
    if (!root) return;
    const onScroll = () => updateViewPageFromScroll();
    root.addEventListener('scroll', onScroll, { passive: true });
    onCleanup(() => root.removeEventListener('scroll', onScroll));
  });

  createEffect(() => {
    chapterIndex();
    setBatchRetryToken(0);
    setViewPage(1);
    queueMicrotask(() => updateViewPageFromScroll());
  });

  createEffect(() => {
    imageList().length;
    queueMicrotask(() => updateViewPageFromScroll());
  });

  createEffect(() => {
    if (import.meta.env.DEV && !loading() && !error() && rawContent()) {
      logContentImageDiagnostics(rawContent(), 'image-viewer.rawContent', 5);
      const list = imageList();
      console.log('[image-viewer] 渲染列表', {
        count: list.length,
        first: list[0]?.url.split('/').pop(),
        fifth: list[4]?.url.split('/').pop(),
        last: list[list.length - 1]?.url.split('/').pop(),
      });
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

  const goChapter = async (delta: number) => {
    const next = chapterIndex() + delta;
    if (next < 0 || next >= catalog().length) return;
    if (!viewerStore.isOpen()) {
      showAppToast({ title: '未打开书籍', description: '请从书架重新打开本书' });
      return;
    }
    await viewerStore.loadChapter(next);
  };

  const setContentScaleClamped = (next: number) => {
    const v = clampImageViewerScale(next);
    setContentScale(v);
    persistImageViewerContentScale(v);
  };

  const nudgeContentScale = (delta: number) => {
    setContentScaleClamped(contentScale() + delta);
  };

  const contentMaxWidthStyle = () => ({
    'max-width': `${IMAGE_VIEWER_CONTENT_MAX_REM * contentScale()}rem`,
  });

  const contentScalePercent = () => Math.round(contentScale() * 100);

  const refreshChapter = () => {
    if (!viewerStore.isOpen()) {
      showAppToast({ title: '未打开书籍', description: '请从书架重新打开本书' });
      return;
    }
    void viewerStore.refreshChapter().catch((e) => {
      console.error('[image-viewer] 刷新本章失败', e);
    });
  };

  return (
    <>
      <MediaViewerShell entryVisible={props.entryVisible}>
        <MediaViewerShellMain>
          <MediaViewerChromeSlots
            header={
              <MediaViewerHeader>
                <MediaViewerToolbarHeader
                  title={book()?.name ?? ''}
                  subtitle={chapterTitle()}
                  onClose={props.onClose}
                  onOpenCatalog={() => setCatalogOpen(true)}
                  onOpenImageSettings={() => setSettingsOpen(true)}
                  onRefresh={refreshChapter}
                  onRetryFailedImages={() => setBatchRetryToken((t) => t + 1)}
                  loading={loading()}
                />
              </MediaViewerHeader>
            }
            footer={
              <MediaViewerFooter>
                <MediaViewerChapterNavFooter
                  chapterIndex={chapterIndex()}
                  catalogLength={catalog().length}
                  loading={loading()}
                  onPrev={() => void goChapter(-1)}
                  onNext={() => void goChapter(1)}
                  center={
                    <span class="text-xs tabular-nums text-muted-foreground">
                      {totalPages() > 0 ? `${viewPage()} / ${totalPages()} 页` : ''}
                    </span>
                  }
                />
              </MediaViewerFooter>
            }
          >
          <div
            ref={scrollRootEl}
            class={mainScrollClass()}
            {...{ [MANGA_SCROLL_ROOT_ATTR]: '' }}
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
            <Show when={!bootstrapping() && !loading() && !error()}>
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
                <div
                  class="mx-auto flex w-full flex-col"
                  style={contentMaxWidthStyle()}
                >
                  <Index each={imageList()}>
                    {(item) => (
                      <div data-manga-page={item().page} class="w-full">
                        <ReaderInlineImg
                          src={item().url}
                          legadoImageHeaders={item().legadoHeaders}
                          referer={chapterPageReferer()}
                          source={bookSource()}
                          imageStyle="FULL"
                          class="block w-full bg-neutral-900"
                          deferUntilVisible
                          useFetchQueue
                          batchRetryToken={batchRetryToken()}
                        />
                      </div>
                    )}
                  </Index>
                </div>
              </Show>
            </Show>
          </div>
          </MediaViewerChromeSlots>
        </MediaViewerShellMain>
      </MediaViewerShell>

      <ViewerAppDrawer open={catalogOpen()} onOpenChange={setCatalogOpen}>
        <ViewerAppDrawerContent class={hDrawerPanel}>
          <ViewerAppDrawerHeader>
            <span>目录</span>
            <ViewerAppDrawerClose />
          </ViewerAppDrawerHeader>
          <ViewerAppDrawerBody class="min-h-0 flex-1 overflow-hidden p-0">
            <MediaViewerCatalog
              open={catalogOpen()}
              loading={bootstrapping()}
              initialScrollTop={catalogScrollTop()}
              onScrollTop={setCatalogScrollTop}
              onSelectChapter={(index) => {
                setCatalogOpen(false);
                void viewerStore.loadChapter(index);
              }}
            />
          </ViewerAppDrawerBody>
        </ViewerAppDrawerContent>
      </ViewerAppDrawer>

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
            <div class="space-y-2 py-2">
              <div class="flex items-center justify-between">
                <Label>内容缩放</Label>
                <span class="text-sm tabular-nums text-muted-foreground">
                  {contentScalePercent()}%
                </span>
              </div>
              <div class="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  class="shrink-0"
                  aria-label="缩小"
                  disabled={contentScale() <= IMAGE_VIEWER_SCALE_MIN}
                  onClick={() => nudgeContentScale(-IMAGE_VIEWER_SCALE_STEP)}
                >
                  <ZoomOut class="h-4 w-4" />
                </Button>
                <Slider
                  class="min-w-0 flex-1 py-2"
                  value={[contentScale()]}
                  minValue={IMAGE_VIEWER_SCALE_MIN}
                  maxValue={IMAGE_VIEWER_SCALE_MAX}
                  step={IMAGE_VIEWER_SCALE_STEP}
                  onChange={(values) => setContentScaleClamped(values[0] ?? contentScale())}
                >
                  <SliderTrack>
                    <SliderFill />
                    <SliderThumb />
                  </SliderTrack>
                </Slider>
                <Button
                  variant="outline"
                  size="icon"
                  class="shrink-0"
                  aria-label="放大"
                  disabled={contentScale() >= IMAGE_VIEWER_SCALE_MAX}
                  onClick={() => nudgeContentScale(IMAGE_VIEWER_SCALE_STEP)}
                >
                  <ZoomIn class="h-4 w-4" />
                </Button>
              </div>
            </div>
          </ViewerAppDrawerBody>
        </ViewerAppDrawerContent>
      </ViewerAppDrawer>
    </>
  );
}
