/**
 * 纯图片阅读（漫画）
 * 对齐 Legado ReadMangaActivity：纵向滚动、章内多图、目录切换
 */

import { createSignal, For, Show } from 'solid-js';
import { mediaReaderStore } from '@/stores/media-reader';
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
import { cn } from '@/lib/utils';

export interface PicReaderPageProps {
  onClose: () => void;
}

export function PicReaderPage(props: PicReaderPageProps) {
  const [catalogOpen, setCatalogOpen] = createSignal(false);
  const [catalogScrollTop, setCatalogScrollTop] = createSignal(0);

  const book = () => mediaReaderStore.state.book;
  const catalog = () => mediaReaderStore.state.catalog;
  const chapterIndex = () => mediaReaderStore.state.chapterIndex;
  const urls = () => mediaReaderStore.state.mediaUrls;
  const loading = () => mediaReaderStore.state.loading;
  const error = () => mediaReaderStore.state.error;

  const chapterTitle = () => catalog()[chapterIndex()]?.title ?? '';

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
              <p class="text-sm text-destructive">{error()}</p>
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
                  <img
                    src={src}
                    alt=""
                    class={cn('block w-full h-auto bg-neutral-900')}
                    loading="lazy"
                    decoding="async"
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
