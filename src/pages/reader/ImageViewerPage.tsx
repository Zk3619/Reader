/**
 * 图片阅读（漫画）
 * 对齐 Legado ReadMangaActivity
 */

import { createSignal, For, Show, createEffect } from 'solid-js';
import { mediaReaderStore } from '@/stores/media-reader';
import { ReaderInlineImg } from '@/components/reader/ReaderInlineImg';
import { getSource } from '@/lib/database/sources';
import type { BookSource } from '@/types';
import { MediaReaderShell } from '@/components/reader/MediaReaderShell';
import { MediaReaderCatalog } from '@/components/reader/MediaReaderCatalog';
import {
  AppDrawer,
  AppDrawerBody,
  AppDrawerClose,
  AppDrawerContent,
  AppDrawerHeader,
} from '@/components/shared/AppDrawer';
import { Button } from '@/components/ui/button';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';

export interface ImageViewerPageProps {
  onClose: () => void;
}

export function ImageViewerPage(props: ImageViewerPageProps) {
  const [catalogOpen, setCatalogOpen] = createSignal(false);
  const [catalogScrollTop, setCatalogScrollTop] = createSignal(0);
  const [bookSource, setBookSource] = createSignal<BookSource | null>(null);

  const book = () => mediaReaderStore.state.book;
  const catalog = () => mediaReaderStore.state.catalog;
  const chapterIndex = () => mediaReaderStore.state.chapterIndex;
  const urls = () => mediaReaderStore.state.mediaUrls;
  const loading = () => mediaReaderStore.state.loading;
  const error = () => mediaReaderStore.state.error;

  const chapterTitle = () => catalog()[chapterIndex()]?.title ?? '';

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
    await mediaReaderStore.loadChapter(next);
  };

  return (
    <>
      <MediaReaderShell
        title={book()?.name ?? ''}
        subtitle={chapterTitle()}
        onClose={props.onClose}
        onOpenCatalog={() => setCatalogOpen(true)}
        onRefresh={() => void mediaReaderStore.refreshChapter()}
        loading={loading()}
        footer={
          <div class="flex items-center justify-between gap-2 px-4 py-2">
            <Button
              variant="outline"
              size="sm"
              disabled={chapterIndex() <= 0 || loading()}
              onClick={() => void goChapter(-1)}
            >
              上一章
            </Button>
            <span class="text-xs text-muted-foreground">
              {catalog().length > 0 ? `${chapterIndex() + 1} / ${catalog().length}` : ''}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={chapterIndex() >= catalog().length - 1 || loading()}
              onClick={() => void goChapter(1)}
            >
              下一章
            </Button>
          </div>
        }
      >
        <div class="h-full overflow-y-auto scroll-gutter-stable-both bg-black/90">
          <Show when={loading()}>
            <div class="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
              加载中…
            </div>
          </Show>
          <Show when={!loading() && error()}>
            <div class="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center">
              <p class="text-sm whitespace-pre-wrap text-destructive">{error()}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void mediaReaderStore.refreshChapter()}
              >
                重试
              </Button>
            </div>
          </Show>
          <Show when={!loading() && !error()}>
            <div class="mx-auto flex w-full max-w-3xl flex-col">
              <For each={urls()}>
                {(src) => (
                  <ReaderInlineImg
                    src={src}
                    referer={book()?.origin}
                    source={bookSource()}
                    imageStyle="FULL"
                    class="block w-full bg-neutral-900"
                  />
                )}
              </For>
            </div>
          </Show>
        </div>
      </MediaReaderShell>

      <AppDrawer open={catalogOpen()} onOpenChange={setCatalogOpen}>
        <AppDrawerContent class={hDrawerPanel}>
          <AppDrawerHeader>
            <span>目录</span>
            <AppDrawerClose />
          </AppDrawerHeader>
          <AppDrawerBody class="min-h-0 flex-1 overflow-hidden p-0">
            <MediaReaderCatalog
              open={catalogOpen()}
              initialScrollTop={catalogScrollTop()}
              onScrollTop={setCatalogScrollTop}
              onSelectChapter={(index) => {
                setCatalogOpen(false);
                void mediaReaderStore.loadChapter(index);
              }}
            />
          </AppDrawerBody>
        </AppDrawerContent>
      </AppDrawer>
    </>
  );
}

/** @deprecated 使用 ImageViewerPage */
export const PicReaderPage = ImageViewerPage;
